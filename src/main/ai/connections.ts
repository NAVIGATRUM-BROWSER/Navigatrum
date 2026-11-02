/**
 * AI Connections service — provider-independent and UI-independent.
 *
 * The future assistant only talks to this layer; swapping providers is
 * data, not code. Rules baked in:
 *
 * - A key is validated against its provider's official verification
 *   endpoint before any connection is ever reported as connected.
 * - A key is only ever sent to the endpoint belonging to its own
 *   provider (or, for custom/Ollama, the exact base URL the user typed).
 * - Secrets live exclusively in the encrypted vault (keys.ts); nothing
 *   here returns key material across IPC.
 * - Every failure class from the milestone contract maps to a distinct
 *   AiErrorType: invalid key, rate limit, network failure, unavailable
 *   provider, malformed input.
 */
import { net } from 'electron'

import {
  PROVIDERS,
  PROVIDER_ORDER,
  detectProvider,
  type ProviderSpec
} from './providers'
import { canStoreSecrets, deleteKey, hasKey, readKey, saveKey } from './keys'
import { loadStore, saveStore } from '../store'
import type {
  AiConnectionInfo,
  AiDefault,
  AiErrorType,
  AiModelInfo,
  AiProviderInfo,
  AiResult
} from '@shared/types'

const REQUEST_TIMEOUT_MS = 12_000
const MODEL_CACHE_TTL_MS = 60_000
const MAX_KEY_LENGTH = 2048
const MAX_BASE_URL_LENGTH = 2048
const MAX_MODELS = 500

interface StoredConnection {
  providerId: string
  baseUrl: string
  verifiedAt: number
  modelsCount: number
}

interface AiStore {
  connections: StoredConnection[]
  default: AiDefault
}

const EMPTY_STORE: AiStore = {
  connections: [],
  default: { providerId: null, modelId: null }
}

let initialized = false
let store: AiStore = EMPTY_STORE
const modelsCache = new Map<string, { at: number; models: AiModelInfo[] }>()

function persist(): void {
  saveStore('ai-connections', store)
}

function isStoredConnection(value: unknown): value is StoredConnection {
  const record = value as StoredConnection | null
  return (
    record !== null &&
    typeof record === 'object' &&
    typeof record.providerId === 'string' &&
    typeof record.baseUrl === 'string'
  )
}

function find(providerId: string): StoredConnection | undefined {
  return store.connections.find(c => c.providerId === providerId)
}

export function initAiConnections(): void {
  if (initialized) return
  initialized = true
  const saved = loadStore<AiStore | null>('ai-connections', null)
  store =
    saved && Array.isArray(saved.connections)
      ? {
          connections: saved.connections.filter(isStoredConnection),
          default: saved.default ?? EMPTY_STORE.default
        }
      : EMPTY_STORE
  // A connection whose key vanished from the vault cannot be used.
  for (const record of [...store.connections]) {
    const spec = PROVIDERS[record.providerId]
    if (!spec || (!spec.localOnly && !hasKey(record.providerId))) {
      store.connections = store.connections.filter(
        c => c.providerId !== record.providerId
      )
    }
  }
  persist()
}

/* ---------- Errors ---------- */

class AiError extends Error {
  readonly errorType: AiErrorType
  constructor(errorType: AiErrorType, message: string) {
    super(message)
    this.errorType = errorType
  }
}

function toErrorResult(error: unknown): AiResult<never> {
  if (error instanceof AiError) {
    return {
      ok: false,
      error: { type: error.errorType, message: error.message }
    }
  }
  return {
    ok: false,
    error: {
      type: 'provider-unavailable',
      message: 'Unexpected provider error'
    }
  }
}

/* ---------- Sanitized views (no secrets, ever) ---------- */

function asInfo(record: StoredConnection): AiConnectionInfo {
  const spec = PROVIDERS[record.providerId]
  return {
    providerId: record.providerId,
    label: spec?.label ?? record.providerId,
    verifiedAt: record.verifiedAt,
    baseUrl: record.baseUrl,
    local: spec?.local ?? false,
    modelsCount: record.modelsCount
  }
}

/* ---------- URL + header construction ---------- */

/** Splits the base URL the user typed; loopback may use plain http. */
function parseBaseUrl(spec: ProviderSpec, raw: string): string {
  const value = raw.trim()
  if (value === '') {
    if (spec.customBaseUrl && spec.id === 'custom') {
      throw new AiError('bad-input', 'Enter the endpoint base URL')
    }
    return ''
  }
  if (value.length > MAX_BASE_URL_LENGTH) {
    throw new AiError('bad-input', 'Base URL is too long')
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new AiError('bad-input', 'That is not a valid URL')
  }
  if (url.search !== '' || url.hash !== '') {
    throw new AiError(
      'bad-input',
      'Base URL must not contain a query or fragment'
    )
  }
  if (url.protocol === 'http:') {
    const host = url.hostname
    const loopback =
      host === 'localhost' || host === '127.0.0.1' || host === '::1'
    if (!loopback) {
      throw new AiError('bad-input', 'Plain http is only allowed for localhost')
    }
  } else if (url.protocol !== 'https:') {
    throw new AiError('bad-input', 'Use an https:// (or localhost http://) URL')
  }
  return url.toString().replace(/\/+$/, '')
}

/** Resolves the endpoint the credentials may touch. */
export function endpointFor(
  spec: ProviderSpec,
  kind: 'verify' | 'models',
  baseUrl: string
): string {
  if (!spec.customBaseUrl) {
    return kind === 'verify' ? spec.verifyUrl : spec.modelsUrl
  }
  const base = (baseUrl === '' ? spec.defaultBaseUrl : baseUrl).replace(
    /\/+$/,
    ''
  )
  if (spec.id === 'ollama') return `${base}/api/tags`
  // OpenAI-compatible: accept "host[:port]" or "…/v1".
  const url = new URL(base)
  const path = url.pathname.replace(/\/+$/, '')
  const withV1 = path.endsWith('/v1') ? path : `${path}/v1`
  return `${url.origin}${withV1}/models`
}

function authHeaders(
  spec: ProviderSpec,
  apiKey: string
): Record<string, string> {
  const headers: Record<string, string> = { ...spec.extraHeaders }
  if (spec.auth === 'bearer' && apiKey !== '') {
    headers['Authorization'] = `Bearer ${apiKey}`
  } else if (spec.auth === 'x-api-key' && apiKey !== '') {
    headers['x-api-key'] = apiKey
  } else if (spec.auth === 'x-goog-api-key' && apiKey !== '') {
    headers['x-goog-api-key'] = apiKey
  }
  return headers
}

/* ---------- Provider probe ---------- */

class Probe {
  readonly status: number
  readonly json: unknown
  constructor(status: number, json: unknown) {
    this.status = status
    this.json = json
  }
}

async function probe(
  url: string,
  spec: ProviderSpec,
  apiKey: string
): Promise<Probe> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await net.fetch(url, {
      method: 'GET',
      headers: authHeaders(spec, apiKey),
      signal: controller.signal
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/aborted|abort/i.test(message)) {
      throw new AiError(
        'network',
        `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      )
    }
    if (/ENOTFOUND|dns/i.test(message)) {
      throw new AiError('network', 'Host not found — check the address')
    }
    if (/ECONNREFUSED/i.test(message)) {
      throw new AiError(
        'network',
        'Connection refused — is the local server running?'
      )
    }
    throw new AiError('network', 'Network request failed')
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 401 || response.status === 403) {
    throw new AiError('invalid-key', `${spec.label} rejected the API key`)
  }
  if (response.status === 429) {
    throw new AiError(
      'rate-limited',
      `${spec.label} is rate limiting — try again later`
    )
  }
  if (response.status >= 500) {
    throw new AiError('provider-unavailable', `${spec.label} is having problems`)
  }
  if (response.status !== 200) {
    throw new AiError(
      'provider-unavailable',
      `${spec.label} answered with HTTP ${response.status}`
    )
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new AiError('provider-unavailable', 'Server did not return valid JSON')
  }
  return new Probe(response.status, json)
}

/* ---------- Model parsing ---------- */

function parseModels(spec: ProviderSpec, json: unknown): AiModelInfo[] {
  const entries: Array<{ id: string; label: string }> = []
  const asArray = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : []

  if (spec.modelsShape === 'openai') {
    for (const item of asArray((json as { data?: unknown }).data)) {
      const id = (item as { id?: string }).id
      if (typeof id === 'string' && id.length <= 256) {
        const display = (item as { display_name?: string }).display_name
        entries.push({
          id,
          label: typeof display === 'string' && display !== '' ? display : id
        })
      }
    }
  } else if (spec.modelsShape === 'gemini') {
    for (const item of asArray((json as { models?: unknown }).models)) {
      const raw = (item as { name?: string }).name ?? ''
      const methods = asArray(
        (item as { supportedGenerationMethods?: unknown })
          .supportedGenerationMethods
      )
      if (!raw.startsWith('models/')) continue
      if (methods.length > 0 && !methods.includes('generateContent')) continue
      const id = raw.replace(/^models\//, '')
      const display = (item as { displayName?: string }).displayName
      entries.push({
        id,
        label: typeof display === 'string' && display !== '' ? display : id
      })
    }
  } else if (spec.modelsShape === 'cohere') {
    for (const item of asArray((json as { models?: unknown }).models)) {
      const name = (item as { name?: string }).name
      if (typeof name === 'string' && name.length <= 256) {
        entries.push({ id: name, label: name })
      }
    }
  } else if (spec.modelsShape === 'ollama') {
    for (const item of asArray((json as { models?: unknown }).models)) {
      const name = (item as { name?: string }).name
      if (typeof name === 'string' && name.length <= 256) {
        entries.push({ id: name, label: `${name} (local)` })
      }
    }
  }

  const seen = new Set<string>()
  const unique = entries.filter(entry => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
  unique.sort((a, b) => a.label.localeCompare(b.label))
  return unique.slice(0, MAX_MODELS).map(entry => ({
    id: entry.id,
    label: entry.label,
    local: spec.local
  }))
}

/* ---------- IPC-facing operations ---------- */

export function listAiProviders(): AiProviderInfo[] {
  return PROVIDER_ORDER.filter(id => PROVIDERS[id]).map(id => {
    const spec = PROVIDERS[id]
    return {
      id: spec.id,
      label: spec.label,
      localOnly: spec.localOnly,
      local: spec.local,
      customBaseUrl: spec.customBaseUrl,
      defaultBaseUrl: spec.defaultBaseUrl,
      keyPrefixes: spec.keyPrefixes,
      signupUrl: spec.signupUrl
    }
  })
}

/**
 * The verification + persist step. "Connected" is only ever claimed after
 * the provider's official endpoint answered 200.
 */
async function verifyAndStore(
  spec: ProviderSpec,
  baseUrl: string,
  apiKey: string
): Promise<StoredConnection> {
  await probe(endpointFor(spec, 'verify', baseUrl), spec, apiKey)

  // Best-effort model count; a sparse list does not invalidate the
  // verified connection itself.
  let modelsCount = 0
  try {
    const listing = await probe(endpointFor(spec, 'models', baseUrl), spec, apiKey)
    const models = parseModels(spec, listing.json)
    modelsCache.set(spec.id, { at: Date.now(), models })
    modelsCount = models.length
  } catch {
    modelsCache.delete(spec.id)
  }

  const now = Date.now()
  const record: StoredConnection = {
    providerId: spec.id,
    baseUrl,
    verifiedAt: now,
    modelsCount
  }
  store.connections = [
    ...store.connections.filter(c => c.providerId !== spec.id),
    record
  ]
  // The first verified provider becomes the sensible default.
  if (store.default.providerId === null) {
    store.default = { providerId: record.providerId, modelId: null }
  }
  persist()
  return record
}

export async function connectAi(
  providerId: string,
  rawApiKey: string,
  rawBaseUrl: string
): Promise<AiResult<AiConnectionInfo>> {
  try {
    if (!initialized) initAiConnections()

    const apiKey = typeof rawApiKey === 'string' ? rawApiKey.trim() : ''
    if (apiKey.length > MAX_KEY_LENGTH) {
      throw new AiError('bad-input', 'API key is too long')
    }

    // Auto-detection from unambiguous key prefixes. The key is probed
    // against exactly one endpoint: the one belonging to the provider
    // it matched — never "sprayed" across providers.
    let spec: ProviderSpec
    if (providerId === 'auto') {
      if (apiKey === '') {
        throw new AiError('bad-input', 'Enter an API key to detect the provider')
      }
      const detected = detectProvider(apiKey)
      if (detected === null) {
        throw new AiError(
          'bad-input',
          'Could not identify the provider from the key — pick it from the list'
        )
      }
      spec = PROVIDERS[detected]
    } else if (Object.prototype.hasOwnProperty.call(PROVIDERS, providerId)) {
      spec = PROVIDERS[providerId]
    } else {
      throw new AiError('bad-input', 'Unknown provider')
    }

    const baseUrl = parseBaseUrl(spec, rawBaseUrl)

    if (spec.localOnly) {
      // Local runtimes (Ollama) need no key — direct verification only.
      const record = await verifyAndStore(spec, baseUrl, '')
      return { ok: true, data: asInfo(record) }
    }

    if (!(await canStoreSecrets())) {
      throw new AiError(
        'storage',
        'Secure storage unavailable — cannot keep API keys safely'
      )
    }
    if (apiKey === '') {
      throw new AiError('bad-input', `Enter your ${spec.label} API key`)
    }

    const record = await verifyAndStore(spec, baseUrl, apiKey)
    await saveKey(spec.id, apiKey)
    return { ok: true, data: asInfo(record) }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function replaceAiKey(
  providerId: string,
  rawApiKey: string
): Promise<AiResult<AiConnectionInfo>> {
  try {
    if (!initialized) initAiConnections()
    const existing = find(providerId)
    if (!existing) {
      throw new AiError('bad-input', "That provider isn't connected")
    }
    const apiKey = typeof rawApiKey === 'string' ? rawApiKey.trim() : ''
    if (apiKey.length > MAX_KEY_LENGTH) {
      throw new AiError('bad-input', 'API key is too long')
    }
    const spec = PROVIDERS[providerId]
    if (!spec) throw new AiError('bad-input', 'Unknown provider')

    if (!(await canStoreSecrets())) {
      throw new AiError(
        'storage',
        'Secure storage unavailable — cannot keep API keys safely'
      )
    }
    const record = await verifyAndStore(spec, existing.baseUrl, apiKey)
    await saveKey(providerId, apiKey)
    return { ok: true, data: asInfo(record) }
  } catch (error) {
    return toErrorResult(error)
  }
}

export function listAiConnections(): AiConnectionInfo[] {
  if (!initialized) initAiConnections()
  return store.connections
    .map(asInfo)
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function disconnectAi(providerId: string): AiConnectionInfo[] {
  if (!initialized) initAiConnections()
  store.connections = store.connections.filter(c => c.providerId !== providerId)
  deleteKey(providerId)
  modelsCache.delete(providerId)
  if (store.default.providerId === providerId) {
    store.default = { providerId: null, modelId: null }
  }
  persist()
  return listAiConnections()
}

/** Live model listing with a short cache; connection must exist. */
export async function listAiModels(
  providerId: string
): Promise<AiResult<AiModelInfo[]>> {
  try {
    if (!initialized) initAiConnections()
    const record = find(providerId)
    if (!record) {
      throw new AiError('bad-input', "That provider isn't connected")
    }
    const spec = PROVIDERS[providerId]
    if (!spec) throw new AiError('bad-input', 'Unknown provider')

    const cached = modelsCache.get(providerId)
    if (cached && Date.now() - cached.at < MODEL_CACHE_TTL_MS) {
      return { ok: true, data: cached.models }
    }

    const apiKey = spec.localOnly ? '' : ((await readKey(providerId)) ?? '')
    const listing = await probe(
      endpointFor(spec, 'models', record.baseUrl),
      spec,
      apiKey
    )
    const models = parseModels(spec, listing.json)
    modelsCache.set(providerId, { at: Date.now(), models })
    return { ok: true, data: models }
  } catch (error) {
    return toErrorResult(error)
  }
}

export function getAiDefault(): AiDefault {
  if (!initialized) initAiConnections()
  return { ...store.default }
}

export function setAiDefault(
  providerId: string,
  modelId: string
): AiResult<AiDefault> {
  try {
    if (!initialized) initAiConnections()
    if (!find(providerId)) {
      throw new AiError('bad-input', "That provider isn't connected")
    }
    const cleanModel = typeof modelId === 'string' ? modelId.trim() : ''
    if (cleanModel === '' || cleanModel.length > 256) {
      throw new AiError('bad-input', 'Choose a model')
    }
    store.default = { providerId, modelId: cleanModel }
    persist()
    return { ok: true, data: { ...store.default } }
  } catch (error) {
    return toErrorResult(error)
  }
}
