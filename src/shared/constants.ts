/**
 * Shared constants between the Electron main, preload and renderer processes.
 * Keep this file dependency-free so it can be imported everywhere.
 */

/** Height (px) of the fixed top chrome: tab strip + navigation toolbar. */
export const TOP_CHROME_HEIGHT = 92

/** Minimum window dimensions. */
export const MIN_WINDOW_WIDTH = 960
export const MIN_WINDOW_HEIGHT = 640

/** Default window bounds. */
export const DEFAULT_WINDOW_WIDTH = 1280
export const DEFAULT_WINDOW_HEIGHT = 832

/** An empty URL means the built-in Home screen is being shown. */
export const HOME_URL = ''

export function buildSearchUrl(query: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(query.trim())}`
}
