/**
 * Search/URL input resolution for the address bar and internal services.
 * Search routes to the user-selected default engine.
 */
import { isInternalUrl } from '@shared/types'
import type { SearchEngineId } from '@shared/types'

import { SEARCH_ENGINES, isSearchEngineId } from './settings-store'

const SAFE_SCHEME_RE = /^(https?|about|file):\/?\/?/i
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)(:\d+)?(\/.*|\/)?$/
const DOMAIN_RE = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(:\d+)?(\/.*|\/)?$/

export function buildSearchUrlFor(
  engineId: unknown,
  query: string
): string {
  const engine = isSearchEngineId(engineId)
    ? SEARCH_ENGINES[engineId as SearchEngineId]
    : SEARCH_ENGINES.duckduckgo
  return engine.searchUrl.replace(
    '{query}',
    encodeURIComponent(query.trim())
  )
}

/** Turn raw address-bar text into a URL (or default-engine search). */
export function resolveInput(input: string, engineId: unknown): string {
  const value = input.trim()
  if (value === '') return ''

  // Internal pages first: they are never web searches.
  if (isInternalUrl(value)) return value

  // Explicit scheme we accept.
  if (SAFE_SCHEME_RE.test(value)) return value

  // Unknown scheme: search instead of navigating somewhere unsafe.
  if (SCHEME_RE.test(value)) return buildSearchUrlFor(engineId, value)

  // Local dev servers without a scheme.
  if (LOCAL_HOST_RE.test(value)) return `http://${value}`

  // Bare domains, e.g. "example.com/path".
  if (!value.includes(' ') && DOMAIN_RE.test(value)) return `https://${value}`

  // Everything else is a search query.
  return buildSearchUrlFor(engineId, value)
}
