/**
 * User settings: loaded once at boot, kept in memory, persisted through the
 * buffered JSON store. Values are validated on every write.
 */
import { DEFAULT_SETTINGS, type SearchEngineId, type Settings } from '@shared/types'

import { loadStore, saveStore } from './store'

const STORE_NAME = 'settings'

export const SEARCH_ENGINES: Record<
  SearchEngineId,
  { name: string; searchUrl: string }
> = {
  duckduckgo: { name: 'DuckDuckGo', searchUrl: 'https://duckduckgo.com/?q={query}' },
  google: { name: 'Google', searchUrl: 'https://www.google.com/search?q={query}' },
  bing: { name: 'Bing', searchUrl: 'https://www.bing.com/search?q={query}' },
  brave: { name: 'Brave', searchUrl: 'https://search.brave.com/search?q={query}' }
}

let settings: Settings = { ...DEFAULT_SETTINGS }

export function initSettings(): void {
  const stored = loadStore<Partial<Settings>>(STORE_NAME, {})
  settings = { ...DEFAULT_SETTINGS, ...stored }
  if (!settings.downloadPath) settings.downloadPath = ''
}

export function getSettings(): Settings {
  return { ...settings }
}

export function updateSetting<K extends keyof Settings>(
  key: K,
  rawValue: unknown
): Settings {
  const value = coerce(key, rawValue)
  if (value !== undefined) {
    settings = { ...settings, [key]: value }
    saveStore(STORE_NAME, settings)
  }
  return getSettings()
}

/** Returns a safely coerced value, or undefined when invalid. */
function coerce(key: keyof Settings, value: unknown): unknown {
  switch (key) {
    case 'homepage': {
      if (typeof value !== 'string') return undefined
      const v = value.trim()
      if (v === '' || v === 'builtin') return 'builtin'
      try {
        const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
        if (!['http:', 'https:'].includes(url.protocol)) return undefined
        return url.toString()
      } catch {
        return undefined
      }
    }
    case 'searchEngine': {
      const ok = value === 'duckduckgo' || value === 'google' || value === 'bing' || value === 'brave'
      return ok ? value : undefined
    }
    case 'downloadPath': {
      if (typeof value !== 'string') return undefined
      const v = value.trim()
      if (v === '') return ''
      // Absolute path, no traversal segments, no control characters.
      if (
        !v.startsWith('/') ||
        /(^|\/)\.\.(\/|$)/.test(v.slice(1)) ||
        /[\0-\x1f]/.test(v)
      ) {
        return undefined
      }
      return v
    }
    case 'restoreSession':
    case 'saveHistory':
      return typeof value === 'boolean' ? value : undefined
    default:
      return undefined
  }
}

export function isSearchEngineId(value: unknown): value is SearchEngineId {
  return typeof value === 'string' && value in SEARCH_ENGINES
}
