/**
 * AI provider registry.
 *
 * Every cloud provider below is verified against its official API
 * documentation at the time of writing:
 *
 * - OpenAI        GET https://api.openai.com/v1/models            (Bearer)
 * - Google Gemini GET https://generativelanguage.googleapis.com/v1beta/models
 *                 via "x-goog-api-key" header
 * - Anthropic     GET https://api.anthropic.com/v1/models
 *                 via "x-api-key" + "anthropic-version" headers
 * - OpenRouter    GET https://openrouter.ai/api/v1/key            (Bearer)
 *                 (models list is public; the key endpoint is the
 *                  official account verification surface)
 * - NVIDIA NIM    GET https://integrate.api.nvidia.com/v1/models  (Bearer)
 *                 (official OpenAI-compatible NIM endpoint)
 * - Groq          GET https://api.groq.com/openai/v1/models       (Bearer)
 * - Together AI   GET https://api.together.xyz/v1/models          (Bearer)
 * - Mistral       GET https://api.mistral.ai/v1/models            (Bearer)
 * - Cohere        GET https://api.cohere.com/v1/models            (Bearer)
 * - xAI           GET https://api.x.ai/v1/models                  (Bearer)
 * - Ollama        GET {host}/api/tags — local, no key, official API
 * - Generic       GET {base}/v1/models — OpenAI-compatible; the key
 *                 (if provided) is sent ONLY to the URL the user typed
 *
 * A key is never transmitted to any endpoint other than the one listed
 * for the provider the user explicitly connected.
 */

export interface ProviderSpec {
  id: string
  label: string
  signupUrl: string
  /** Official verification endpoint for the stored key. */
  verifyUrl: string
  /** Official models-listing endpoint. */
  modelsUrl: string
  /** Where model ids live in the responses. */
  modelsShape: 'openai' | 'gemini' | 'cohere' | 'ollama'
  auth: 'bearer' | 'x-api-key' | 'x-goog-api-key' | 'none'
  /** Runs on this machine instead of the cloud. */
  local: boolean
  /** Connects without an API key. */
  localOnly: boolean
  /** User may override the base URL (Ollama / self-hosted). */
  customBaseUrl: boolean
  /** Base URL shown as placeholder/for keyed derivation. */
  defaultBaseUrl: string
  /** Unambiguous key prefixes for auto-detection. */
  keyPrefixes: string[]
  /** Extra version headers, e.g. Anthropic's anthropic-version. */
  extraHeaders?: Record<string, string>
}

export const PROVIDERS: Record<string, ProviderSpec> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    signupUrl: 'https://platform.openai.com/api-keys',
    verifyUrl: 'https://api.openai.com/v1/models',
    modelsUrl: 'https://api.openai.com/v1/models',
    modelsShape: 'openai',
    auth: 'bearer',
    local: false,
    localOnly: false,
    customBaseUrl: false,
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyPrefixes: ['sk-proj-', 'sk-svcacct-', 'sk-']
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    signupUrl: 'https://aistudio.google.com/app/apikey',
    verifyUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    modelsShape: 'gemini',
    auth: 'x-goog-api-key',
    local: false,
    localOnly: false,
    customBaseUrl: false,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyPrefixes: ['AIza']
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    signupUrl: 'https://console.anthropic.com/settings/keys',
    verifyUrl: 'https://api.anthropic.com/v1/models',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    modelsShape: 'openai',
    auth: 'x-api-key',
    local: false,
    localOnly: false,
    customBaseUrl: false,
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    keyPrefixes: ['sk-ant-'],
    extraHeaders: { 'anthropic-version': '2023-06-01' }
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    signupUrl: 'https://openrouter.ai/keys',
    verifyUrl: 'https://openrouter.ai/api/v1/key',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    modelsShape: 'openai',
    auth: 'bearer',
    local: false,
    localOnly: false,
    customBaseUrl: false,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    keyPrefixes: ['sk-or-v1-', 'sk-or-']
  },
  nvidia: {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    signupUrl: 'https://build.nvidia.com/settings/api-keys',
    verifyUrl: 'https://integrate.api.nvidia.com/v1/models',
    modelsUrl: 'https://integrate.api.nvidia.com/v1/models',
    modelsShape: 'openai',
    auth: 'bearer',
    local: false,
    localOnly: false,
    customBaseUrl: false,
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    keyPrefixes: ['nvapi-']
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    signupUrl: 'https://console.groq.com/keys',
    verifyUrl: 'https://api.groq.com/openai/v1/models',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    modelsShape: 'openai',
    auth: 'bearer',
    local: false,
    localOnly: false,
    customBaseUrl: false,
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    keyPrefixes: ['gsk_']
  },
  together: {
    id: 'together',
    label: 'Together AI',
    signupUrl: 'https://api.together.xyz/settings/api-keys',
    verifyUrl: 'https://api.together.xyz/v1/models',
    modelsUrl: 'https://api.together.xyz/v1/models',
    modelsShape: 'openai',
    auth: 'bearer',
    local: false,
    localOnly: false,
    customBaseUrl: false,
    defaultBaseUrl: 'https://api.together.xyz/v1',
    keyPrefixes: ['tgp_v1_']
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    signupUrl: 'https://console.mistral.ai/api-keys',
    verifyUrl: 'https://api.mistral.ai/v1/models',
    modelsUrl: 'https://api.mistral.ai/v1/models',
    modelsShape: 'openai',
    auth: 'bearer',
    local: false,
    localOnly: false,
    customBaseUrl: false,
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    keyPrefixes: []
  },
  cohere: {
    id: 'cohere',
    label: 'Cohere',
    signupUrl: 'https://dashboard.cohere.com/api-keys',
    verifyUrl: 'https://api.cohere.com/v1/models',
    modelsUrl: 'https://api.cohere.com/v1/models',
    modelsShape: 'cohere',
    auth: 'bearer',
    local: false,
    localOnly: false,
    customBaseUrl: false,
    defaultBaseUrl: 'https://api.cohere.com/v1',
    keyPrefixes: ['co_']
  },
  xai: {
    id: 'xai',
    label: 'xAI Grok',
    signupUrl: 'https://console.x.ai',
    verifyUrl: 'https://api.x.ai/v1/models',
    modelsUrl: 'https://api.x.ai/v1/models',
    modelsShape: 'openai',
    auth: 'bearer',
    local: false,
    localOnly: false,
    customBaseUrl: false,
    defaultBaseUrl: 'https://api.x.ai/v1',
    keyPrefixes: ['xai-']
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    signupUrl: 'https://ollama.com',
    verifyUrl: 'http://localhost:11434/api/tags',
    modelsUrl: 'http://localhost:11434/api/tags',
    modelsShape: 'ollama',
    auth: 'none',
    local: true,
    localOnly: true,
    customBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434',
    keyPrefixes: []
  },
  custom: {
    id: 'custom',
    label: 'Custom OpenAI-compatible',
    signupUrl: '',
    verifyUrl: '',
    modelsUrl: '',
    modelsShape: 'openai',
    auth: 'bearer',
    local: false,
    localOnly: false,
    customBaseUrl: true,
    defaultBaseUrl: '',
    keyPrefixes: []
  }
}

/** Order shown in the UI. */
export const PROVIDER_ORDER = [
  'ollama',
  'openai',
  'gemini',
  'anthropic',
  'openrouter',
  'nvidia',
  'groq',
  'together',
  'mistral',
  'cohere',
  'xai',
  'custom'
] as const

/** Map a key prefix to the one provider it can only belong to. */
export function detectProvider(apiKey: string): string | null {
  const key = apiKey.trim()
  if (key === '') return null
  // Longest prefix wins: "sk-ant-…" must match anthropic, not openai's
  // generic "sk-" (which is also a substring of it).
  const known: Array<{ prefix: string; provider: string }> = []
  for (const id of PROVIDER_ORDER) {
    for (const prefix of PROVIDERS[id].keyPrefixes) {
      known.push({ prefix, provider: id })
    }
  }
  known.sort((a, b) => b.prefix.length - a.prefix.length)
  for (const { prefix, provider } of known) {
    if (key.startsWith(prefix)) return provider
  }
  return null
}
