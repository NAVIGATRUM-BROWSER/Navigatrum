/**
 * Shared types for the NAVIGATRUM chrome and browser data.
 */

/* ---------- Tabs (Milestone 2) ---------- */

export interface TabError {
  /** Chromium network error code, e.g. -105 NAME_NOT_RESOLVED. */
  code: number
  /** Human-readable Chromium description. */
  description: string
  /** The URL that failed, so the UI can offer a retry. */
  retryUrl: string
}

export interface TabState {
  id: string
  /** URL of the page, or '' when the tab is on the built-in Home screen. */
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: TabError | null
}

export interface TabsSnapshot {
  activeId: string | null
  tabs: TabState[]
}

/** Persisted list of open tabs for session restoration. */
export interface SavedSession {
  tabs: Array<Pick<TabState, 'url' | 'title'>>
  activeIndex: number
}

/* ---------- Browser data (Milestone 3) ---------- */

export interface Bookmark {
  id: string
  url: string
  title: string
  addedAt: number
}

export interface HistoryEntry {
  id: string
  url: string
  title: string
  visitedAt: number
}

export type DownloadState =
  | 'progressing'
  | 'completed'
  | 'cancelled'
  | 'interrupted'

export interface DownloadRecord {
  id: string
  filename: string
  path: string
  url: string
  total: number
  received: number
  state: DownloadState
  startedAt: number
  error?: string
}

/* ---------- Settings (Milestone 3) ---------- */

export type SearchEngineId = 'duckduckgo' | 'google' | 'bing' | 'brave'

export interface Settings {
  /**
   * The home button destination: 'builtin' (compass home screen) or a
   * custom URL.
   */
  homepage: string
  searchEngine: SearchEngineId
  downloadPath: string
  restoreSession: boolean
  saveHistory: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  homepage: 'builtin',
  searchEngine: 'duckduckgo',
  downloadPath: '',
  restoreSession: true,
  saveHistory: true
}

/* ---------- Settings serialization. Keys are always these. ---------- */

/* ---------- Internal pages (Milestone 3) ---------- */

export type InternalRoute = 'history' | 'downloads' | 'settings' | 'ai'

export function internalUrl(route: InternalRoute): string {
  return `navigatrum://${route}`
}

export function isInternalUrl(url: string): boolean {
  return url.startsWith('navigatrum://')
}

export function internalRouteLabel(route: string): string {
  switch (route) {
    case 'history':
      return 'History'
    case 'downloads':
      return 'Downloads'
    case 'settings':
      return 'Settings'
    case 'ai':
      return 'NAVIGATRUM AI'
    default:
      return route
  }
}

/* ---------- The only surface exposed to the renderer ---------- */

/**
 * The only surface the renderer can touch the main process with.
 * Exposed through contextBridge in the sandboxed preload script.
 */
export interface NaviApi {
  getSnapshot(): Promise<TabsSnapshot>
  createTab(url?: string): Promise<void>
  closeTab(id: string): Promise<void>
  activateTab(id: string): Promise<void>
  navigate(id: string, input: string): Promise<void>
  back(id: string): Promise<void>
  forward(id: string): Promise<void>
  reload(id: string): Promise<void>
  stop(id: string): Promise<void>
  goHome(id: string): Promise<void>
  /** Subscribe to tab snapshots. Returns a synchronous unsubscribe function. */
  onSnapshot(listener: (n: TabsSnapshot) => void): () => void
  /** Fired when the app wants the address bar to grab focus (⌘T / ⌘L). */
  onFocusAddress(listener: () => void): () => void

  /* Bookmarks */
  addBookmark(url: string, title: string): Promise<void>
  removeBookmark(id: string): Promise<void>
  listBookmarks(): Promise<Bookmark[]>
  onBookmarks(listener: (bookmarks: Bookmark[]) => void): () => void

  /* History */
  listHistory(): Promise<HistoryEntry[]>
  removeHistoryEntry(id: string): Promise<void>
  clearHistory(): Promise<void>

  /* Downloads */
  listDownloads(): Promise<DownloadRecord[]>
  openDownload(id: string): Promise<void>
  /** Reveal a finished download in Finder. */
  showInFolder(id: string): Promise<void>
  cancelDownload(id: string): Promise<void>
  removeDownloadEntry(id: string): Promise<void>
  openDownloadsFolder(): Promise<void>
  onDownloads(listener: (downloads: DownloadRecord[]) => void): () => void

  /* Settings */
  getSettings(): Promise<Settings>
  setSetting<K extends keyof Settings>(
    key: K,
    value: Settings[K]
  ): Promise<void>
  pickDownloadFolder(): Promise<string | null>

  /* Clearing browsing data */
  clearCache(): Promise<void>
  clearFinishedDownloads(): Promise<void>
}
