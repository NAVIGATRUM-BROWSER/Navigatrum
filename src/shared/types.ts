/**
 * Shared types for the NAVIGATRUM browser chrome.
 */

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
}
