/**
 * Address-bar input resolution: URL navigation vs. web search.
 * Search defaults to DuckDuckGo (no API key, no tracking profile needed).
 */
import { buildSearchUrl } from '@shared/constants'

const SAFE_SCHEME_RE = /^(https?|about|file):\/?\/?/i
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)(:\d+)?(\/.*|\/)?$/
const DOMAIN_RE = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(:\d+)?(\/.*|\/)?$/

/** Turn raw address-bar text into a URL (or DuckDuckGo search). */
export function resolveInput(input: string): string {
  const value = input.trim()
  if (value === '') return ''

  // Explicit scheme we accept.
  if (SAFE_SCHEME_RE.test(value)) return value

  // Unknown scheme: search instead of navigating somewhere unsafe.
  if (SCHEME_RE.test(value)) return buildSearchUrl(value)

  // Local dev servers without a scheme.
  if (LOCAL_HOST_RE.test(value)) return `http://${value}`

  // Bare domains, e.g. "example.com/path".
  if (!value.includes(' ') && DOMAIN_RE.test(value)) return `https://${value}`

  // Everything else is a search query.
  return buildSearchUrl(value)
}
