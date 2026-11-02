/**
 * TabManager owns every real browser tab.
 *
 * Each tab with a URL is backed by its own WebContentsView (independent
 * page, history, loading state). A tab whose URL is '' shows the built-in
 * Home screen, which lives in the renderer chrome instead of a view.
 *
 * The renderer only ever receives plain TabState snapshots through IPC —
 * it has no references to webContents objects.
 */
import { BrowserWindow, WebContentsView, app } from 'electron'
import { existsSync } from 'node:fs'
import { join, extname, basename } from 'node:path'

import { TOP_CHROME_HEIGHT } from '@shared/constants'
import {
  isInternalUrl,
  internalRouteLabel
} from '@shared/types'
import type { TabError, TabsSnapshot, TabState } from '@shared/types'

import { setDownloadFolder, activeDownloadFor } from './downloads'
import { buildErrorPageDataUrl } from './error-page'
import { resolveInput } from './navigation'
import { getSettings } from './settings-store'

interface TabRecord {
  id: string
  url: string
  title: string
  loading: boolean
  error: TabError | null
  view: WebContentsView | null
  bound: boolean
}

/** Chromium's ERR_ABORTED: user/JS-triggered cancellations are not failures. */
const ERR_ABORTED = -3

function randomTabId(): string {
  return `tab-${crypto.randomUUID()}`
}

/** Never overwrite an existing file in the download folder. */
function uniqueSavePath(folder: string, filename: string): string {
  const safeName = filename.replace(/[/\\:\0]/g, '_') || 'download'
  const ext = extname(safeName)
  const base = basename(safeName, ext)
  let candidate = join(folder, safeName)
  for (let i = 1; existsSync(candidate); i += 1) {
    candidate = join(folder, `${base} (${i})${ext}`)
  }
  return candidate
}

export class TabManager {
  private readonly tabs = new Map<string, TabRecord>()
  private readonly order: string[] = []
  private activeId: string | null = null

  constructor(
    private readonly win: BrowserWindow,
    private readonly services: {
      /** Map address-bar input to a URL given the user's search engine. */
      resolve: (input: string) => string
      /** Record a real page visit in history (settings may disable it). */
      recordVisit?: (url: string) => void
      /** Backfill a page title for a recorded history visit. */
      updateHistoryTitle?: (url: string, title: string) => void
      /** Default path for new downloads. */
      downloadPath: (fallback: string) => string
      /** Track every fresh Electron DownloadItem. */
      trackDownload?: (item: Electron.DownloadItem) => void
    }
  ) {
    // Every new download in any tab goes through our registry.
    this.watchDownloads()
  }

  get activeTabId(): string | null {
    return this.activeId
  }

  has(id: unknown): boolean {
    return typeof id === 'string' && this.tabs.has(id)
  }

  snapshot(): TabsSnapshot {
    const stateOf = (t: TabRecord): TabState => ({
      id: t.id,
      url: t.url,
      title: t.title,
      loading: t.loading,
      canGoBack: t.view?.webContents.navigationHistory.canGoBack() ?? false,
      canGoForward: t.view?.webContents.navigationHistory.canGoForward() ?? false,
      error: t.error
    })

    return {
      activeId: this.activeId,
      tabs: this.order.map(id => stateOf(this.tabs.get(id)!))
    }
  }

  broadcast(): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('tabs:state', this.snapshot())
    }
  }

  create(url = '', activate = true): string {
    const id = randomTabId()
    const tab: TabRecord = {
      id,
      url: '',
      title: 'New Tab',
      loading: false,
      error: null,
      view: null,
      bound: false
    }
    this.tabs.set(id, tab)
    this.order.push(id)
    if (activate) this.activeId = id

    if (url !== '') {
      this.navigate(id, url)
    } else {
      this.sync()
      this.broadcast()
    }
    return id
  }

  activate(id: string): void {
    if (!this.tabs.has(id)) return
    this.activeId = id
    this.sync()
    this.broadcast()
  }

  close(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return

    const index = this.order.indexOf(id)
    this.order.splice(index, 1)
    this.tabs.delete(id)

    if (tab.view) {
      this.win.contentView.removeChildView(tab.view)
      tab.view.webContents.close()
      tab.view = null
    }

    if (this.activeId === id) {
      this.activeId = this.order[index] ?? this.order[index - 1] ?? null
    }

    if (this.order.length === 0) {
      // The window never runs with zero tabs.
      this.create('', true)
      return
    }

    this.sync()
    this.broadcast()
  }

  navigate(id: string, input: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return

    const url = this.services.resolve(input)
    tab.error = null
    tab.url = url

    if (url === '') {
      tab.title = 'New Tab'
      this.sync()
      this.broadcast()
      return
    }

    // Internal chrome pages (history / downloads / settings) live in the
    // renderer already; no web view is involved, so back/forward keep
    // working through the untouched view history.
    if (isInternalUrl(url)) {
      tab.title = internalRouteLabel(url.replace('navigatrum://', ''))
      this.sync()
      this.broadcast()
      return
    }

    this.ensureView(tab)
    const view = this.view(id)
    if (!view) return
    this.sync()
    view.webContents
      .loadURL(url)
      .catch((err: Error) => {
        // Download-triggered navigations abort the load with generic codes
        // ("ERR_FAILED (-2) loading …", "net::ERR_ABORTED …") while
        // Chromium hands off to will-download — not a page failure.
        if (/\bERR_(ABORTED|FAILED)\b/.test(err.message)) return
        if (activeDownloadFor(url)) return
        // Invalid/unreachable URLs land on the built-in error page.
        this.fail(tab, -1, err.message, url)
      })
    this.broadcast()
  }

  back(id: string): void {
    this.view(id)?.webContents.goBack()
  }

  forward(id: string): void {
    this.view(id)?.webContents.goForward()
  }

  reload(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    if (tab.url === '') return
    if (tab.error) {
      // Real retry: load the original failing URL again.
      const retryUrl = tab.error.retryUrl
      tab.error = null
      tab.url = retryUrl
      const view = this.view(id)
      if (view) view.webContents.loadURL(retryUrl).catch(() => undefined)
    } else {
      this.view(id)?.webContents.reload()
    }
  }

  stop(id: string): void {
    this.view(id)?.webContents.stop()
  }

  goHome(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.url = ''
    tab.error = null
    tab.title = 'New Tab'
    this.sync()
    this.broadcast()
  }

  cycleTabs(offset: number): void {
    if (this.order.length === 0) return
    const currentIndex = this.activeId ? this.order.indexOf(this.activeId) : -1
    const nextIndex =
      (currentIndex + offset + this.order.length) % this.order.length
    this.activate(this.order[nextIndex])
  }

  activateNth(index: number): void {
    const id = this.order[index]
    if (id) this.activate(id)
  }

  focusAddressBar(): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.focus()
      this.win.webContents.send('ui:focus-address')
    }
  }

  focusActiveView(): void {
    const view = this.activeId ? this.tabs.get(this.activeId)?.view : null
    view?.webContents.focus()
  }

  private view(id: string): WebContentsView | null {
    return this.tabs.get(id)?.view ?? null
  }

  /**
   * Route every download through our registry. If the user configured a
   * download folder we save silently there; otherwise save into the system
   * Downloads folder. Filenames are de-duplicated so nothing is overwritten.
   */
  private watchDownloads(): void {
    const { session } = this.win.webContents
    session.on('will-download', (_event, item) => {
      const folder =
        this.services.downloadPath(app.getPath('downloads')) ||
        app.getPath('downloads')
      // Keep downloads.ts' folder-aware open action in sync.
      setDownloadFolder(getSettings().downloadPath)
      item.setSavePath(uniqueSavePath(folder, item.getFilename()))
      this.services.trackDownload?.(item)
    })
  }

  /** Lazily create a tab's WebContentsView with hardened webPreferences. */
  private ensureView(tab: TabRecord): void {
    if (tab.view) return

    const view = new WebContentsView({
      webPreferences: {
        // Electron secure defaults, stated explicitly on purpose.
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    })
    tab.view = view
    this.bind(tab)

    // Configure the session once: deny every permission by default for now.
    const session = view.webContents.session
    session.setPermissionRequestHandler((_wc, _permission, callback) =>
      callback(false)
    )
  }

  private bind(tab: TabRecord): void {
    if (tab.bound || !tab.view) return
    tab.bound = true
    const contents = tab.view.webContents

    // target=_blank / window.open → a real new NAVIGATRUM tab.
    contents.setWindowOpenHandler(({ url }) => {
      if (url && /^https?:/i.test(url)) this.create(url, true)
      return { action: 'deny' }
    })

    contents.on('did-start-loading', () => {
      tab.loading = true
      this.broadcast()
    })

    contents.on('did-stop-loading', () => {
      tab.loading = false
      this.broadcast()
    })

    contents.on('page-title-updated', (_event, title) => {
      if (tab.url !== '' && title) tab.title = title
      if (!tab.url.startsWith('data:') && !isInternalUrl(tab.url)) {
        this.services.updateHistoryTitle?.(tab.url, tab.title)
      }
      this.broadcast()
    })

    contents.on('did-navigate', (_event, url) => {
      // Top-level navigation fired for the main frame only.
      if (url.startsWith('data:')) return
      tab.url = url
      tab.error = null
      if (tab.title === 'New Tab') tab.title = ''
      if (!isInternalUrl(url)) this.services.recordVisit?.(url)
      this.broadcast()
    })

    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return
      if (url.startsWith('data:')) return
      tab.url = url
      this.broadcast()
    })

    contents.on(
      'did-fail-load',
      (_event, errorCode, description, validatedUrl, isMainFrame) => {
        if (!isMainFrame) return
        if (errorCode === ERR_ABORTED) return
        this.fail(tab, errorCode, description, validatedUrl || tab.url)
      }
    )

    // Keyboard shortcuts that must also work while a web page has focus.
    contents.on('before-input-event', (event, input) => {
      if (this.handleShortcut(input)) event.preventDefault()
    })
  }

  private fail(
    tab: TabRecord,
    errorCode: number,
    description: string,
    failingUrl: string
  ): void {
    if (tab.url === '') return
    // Keep the first, most meaningful error; later races (aborted data:
    // loads, overlapping promise rejections) must not clobber it.
    if (tab.error) return
    tab.error = { code: errorCode, description, retryUrl: failingUrl }
    tab.title = 'Error'
    tab.loading = false
    const view = tab.view
    if (view && !view.webContents.getURL().startsWith('data:')) {
      view.webContents
        .loadURL(buildErrorPageDataUrl(errorCode, description, failingUrl))
        .catch(() => undefined)
    }
    this.broadcast()
  }

  /**
   * Show exactly the active tab's view, sized to fill the window below the
   * fixed top chrome. Tabs on the built-in Home screen show no view at all.
   * Public: the main window calls it on resize/fullscreen changes.
   */
  sync(): void {
    if (this.win.isDestroyed()) return

    const active = (this.activeId ? this.tabs.get(this.activeId) : null) ?? null
    const showActive =
      active !== null &&
      active.url !== '' &&
      !isInternalUrl(active.url)

    for (const tab of this.tabs.values()) {
      if (tab.view && tab !== active) {
        this.win.contentView.removeChildView(tab.view)
      }
    }

    // Internal chrome pages render in the renderer: never show a web view.
    if (active && !showActive && active.view) {
      this.win.contentView.removeChildView(active.view)
    }

    if (active && showActive) {
      this.ensureView(active)
      active.view!.setBounds(this.contentBounds())
      this.win.contentView.addChildView(active.view!)
    }
  }

  private contentBounds(): { x: number; y: number; width: number; height: number } {
    const [width, height] = this.win.getContentSize()
    return {
      x: 0,
      y: TOP_CHROME_HEIGHT,
      width: Math.max(0, width),
      height: Math.max(0, height - TOP_CHROME_HEIGHT)
    }
  }

  /** Mirror our accelerators for main-process handling while pages run. */
  private handleShortcut(input: Electron.Input): boolean {
    const activeId = this.activeId
    if (activeId) {
      if (input.meta && input.key.toLowerCase() === 'w') {
        this.close(activeId)
        this.focusAddressBar()
        return true
      }
      if (input.meta && input.key.toLowerCase() === 'r') {
        this.reload(activeId)
        return true
      }
      if (input.meta && input.key === '[') {
        this.back(activeId)
        return true
      }
      if (input.meta && input.key === ']') {
        this.forward(activeId)
        return true
      }
    }

    if (input.meta && input.key.toLowerCase() === 't') {
      this.create('', true)
      this.focusAddressBar()
      return true
    }
    if (input.meta && input.key.toLowerCase() === 'l') {
      this.focusAddressBar()
      return true
    }
    if (activeId && input.meta && input.key.toLowerCase() === 'y') {
      this.navigate(activeId, 'navigatrum://history')
      return true
    }
    if (activeId && input.meta && input.key.toLowerCase() === 'j') {
      this.navigate(activeId, 'navigatrum://downloads')
      return true
    }
    if (activeId && input.meta && input.key === ',') {
      this.navigate(activeId, 'navigatrum://settings')
      return true
    }
    if (input.control && input.key === 'Tab') {
      this.cycleTabs(input.shift ? -1 : 1)
      return true
    }
    if (input.meta && /^[1-9]$/.test(input.key)) {
      this.activateNth(Number(input.key) - 1)
      return true
    }
    return false
  }
}
