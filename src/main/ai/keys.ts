/**
 * Encrypted storage for AI API keys.
 *
 * Keys are encrypted through Electron's safeStorage (macOS Keychain /
 * Windows DPAPI / Linux libsecret) and persisted as base64 blobs inside
 * the app's private userData directory. Plaintext keys never touch disk,
 * logs, IPC payloads, or the renderer — they exist transiently in the
 * main process only for validation and in-flight requests.
 *
 * File layout: userData/store/ai-keys.json
 *   { "openai": { "blob": "<base64>", "savedAt": 1711900000000 }, ... }
 */
import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FILE_NAME = 'ai-keys.json'

let vault: Record<string, { blob: string; savedAt: number }> = {}
let loaded = false

function vaultPath(): string {
  return join(app.getPath('userData'), 'store', FILE_NAME)
}

function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = readFileSync(vaultPath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') vault = parsed
  } catch {
    // Missing/corrupt vault → start empty; connection init prunes orphans.
  }
}

function persist(): void {
  writeFileSync(vaultPath(), JSON.stringify(vault), 'utf8')
}

/** Whether the platform can actually encrypt secrets. */
export async function canStoreSecrets(): Promise<boolean> {
  return safeStorage.isAsyncEncryptionAvailable()
}

/** Persists the encrypted form of a key. Throws on encryption failure. */
export async function saveKey(
  providerId: string,
  plaintext: string
): Promise<void> {
  if (!(await canStoreSecrets())) {
    throw new Error('Secure key encryption is unavailable on this system')
  }
  const encrypted = await safeStorage.encryptStringAsync(plaintext)
  ensureLoaded()
  vault[providerId] = {
    blob: encrypted.toString('base64'),
    savedAt: Date.now()
  }
  persist()
}

export function hasKey(providerId: string): boolean {
  ensureLoaded()
  return typeof vault[providerId]?.blob === 'string'
}

/**
 * Decrypts transiently for a main-process request; never logged or sent
 * anywhere. Resolves null when unreadable (e.g. the OS user changed).
 */
export async function readKey(providerId: string): Promise<string | null> {
  ensureLoaded()
  const entry = vault[providerId]
  if (!entry || !(await canStoreSecrets())) return null
  try {
    const decrypted = await safeStorage.decryptStringAsync(
      Buffer.from(entry.blob, 'base64')
    )
    return decrypted.result
  } catch {
    return null
  }
}

export function deleteKey(providerId: string): void {
  ensureLoaded()
  if (vault[providerId]) {
    delete vault[providerId]
    persist()
  }
}
