/**
 * Native macOS Touch Bar for the main window.
 *
 * Layout (left → right), Safari-style and tab-switcher-first:
 *   ↻/■  [ tabs scrubber — scrolling, favicons + compact titles ]
 *   [ ADDRESS chip (accent background, active tab) ]  ☆  ✦ AI   …   ＋
 *
 * Tab switching is the primary feature: every open tab appears in a
 * scrolling TouchBarScrubber with its favicon and a shortened title, and
 * tapping one activates it immediately. Electron provides no way to set a
 * scrubber's selected index programmatically, so the active tab is also
 * shown as an accent-colored address chip — the dependable indicator.
 *
 * The bar refreshes on every TabManager broadcast (create, close, rename,
 * navigate, activate), plus later favicon arrivals and bookmark changes.
 * Closed tabs are rebuilt out of the live registry, so stale entries can
 * never linger. Any TouchBar failure deactivates the controller instead of
 * disturbing the browser.
 */
import { TouchBar, net, nativeImage } from 'electron'
import type { NativeImage, TouchBarButton, TouchBarScrubber } from 'electron'
import {
  internalRouteLabel,
  isInternalUrl,
  type TabsSnapshot,
  type TabState
} from '@shared/types'

import { brandAsset } from './brand'
import { hasBookmark, subscribeBookmarks } from './bookmarks-store'

/**
 * Template icons for the compact control buttons. Rendered white + alpha
 * so macOS tints them like native Touch Bar glyphs.
 */
function barIcon(name: string): NativeImage {
  const image = nativeImage.createFromPath(
    brandAsset(`touchbar/${name}.png`)
  )
  if (image.isEmpty()) return image
  const scaled = image.resize({ height: 18 })
  scaled.setTemplateImage(true)
  return scaled
}

const ACCENT = '#3b82f6'
const VIOLET = '#8b5cf6'
const IDLE_CHIP = '#171e30'
const SELECT_DEBOUNCE_MS = 100
/** Select events within this window after an items rebuild are ignored. */
const SELECT_SETTLE_MS = 500
const ACTIVE_LABEL_MAX = 14
const SCRUBBER_LABEL_MAX = 14
/** Logical size of scrubber icons (2× for the retina Touch Bar panel). */
const ICON_SIZE = 24
const ICON_CACHE_LIMIT = 300

export interface TouchBarActions {
  activateTab(tabId: string): void
  newTab(): void
  reloadOrStop(activeTabId: string, loading: boolean): void
  toggleBookmark(activeTabUrl: string, title: string): void
  openAi(): void
}

/**
 * The Safari-style address chip shows the location of the active tab:
 * the site's host for web pages, the page name for internal routes.
 */
function addressChipLabel(url: string): string {
  if (url === '') return 'New Tab'
  if (isInternalUrl(url)) {
    return internalRouteLabel(url.replace('navigatrum://', ''))
  }
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, ACTIVE_LABEL_MAX)
  }
}

/** Compacts a tab title for the Touch Bar, trimming the site-name suffix. */
function compactTitle(title: string, url: string, max: number): string {
  let text = title.trim()
  if (text === '') {
    try {
      text = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      text = 'New Tab'
    }
  }
  // "GitHub — Where software is built" → "GitHub"
  const trimmed = text.replace(/\s+[—–-]\s+[^—–-]{1,}$/, '').trim()
  if (trimmed !== '') text = trimmed
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Favicons arrive in various sizes; square-fit them for the scrubber. */
function normalizeIcon(icon: NativeImage): NativeImage {
  return icon.resize({ width: ICON_SIZE, height: ICON_SIZE, quality: 'best' })
}

/** Blends two #rrggbb colors; t = 0 → from, t = 1 → to. */
function mixColor(a: string, b: string, t: number): string {
  const from = Number.parseInt(a.slice(1), 16)
  const to = Number.parseInt(b.slice(1), 16)
  const channel = (shift: number): number =>
    Math.round(
      ((from >> shift) & 0xff) * (1 - t) + ((to >> shift) & 0xff) * t
    )
  const [r, g, bl] = [channel(16), channel(8), channel(0)]
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`
}

export class TouchBarController {
  private readonly win: Electron.BrowserWindow
  private readonly actions: TouchBarActions

  private snapshot: TabsSnapshot | null = null
  private syncTimer: ReturnType<typeof setTimeout> | null = null
  private broken = false

  /** Scrubber index → tab, kept current by every sync. */
  private currentTabs: TabState[] = []
  private itemsUpdatedAt = 0
  /** Decoded image cache: favicon source URL → scaled image. */
  private readonly icons = new Map<string, NativeImage>()
  /**
   * Tab id → favicon candidates, ordered best first. Resolved entries are
   * `data:` URLs (already decoded); remote candidates are tried in order
   * until one decodes, ending with `origin/favicon.ico`.
   */
  private readonly tabIcon = new Map<string, string | readonly string[]>()
  /** Remote favicon URLs with an in-flight fetch. */
  private readonly pending = new Set<string>()

  private readonly compass: NativeImage
  private readonly touchBar: TouchBar | null
  private readonly reloadBtn: TouchBarButton
  private readonly starBtn: TouchBarButton
  private readonly activeBtn: TouchBarButton
  private readonly scrubber: TouchBarScrubber
  private readonly newTabBtn: TouchBarButton

  /** Fade timers for the glow animation (one per button at most). */
  private readonly glows = new Map<
    TouchBarButton,
    ReturnType<typeof setInterval>
  >()
  /** Previous frame of doSync, for detecting create / close / switch. */
  private lastActiveId: string | null = null
  private lastCount = -1
  private lastBookmarked = false

  constructor(win: Electron.BrowserWindow, actions: TouchBarActions) {
    this.win = win
    this.actions = actions

    const compass = nativeImage.createFromPath(brandAsset('compass-32.png'))
    this.compass = compass.isEmpty() ? nativeImage.createEmpty() : normalizeIcon(compass)

    this.reloadBtn = new TouchBar.TouchBarButton({
      label: '↻',
      click: () => {
        const active = this.activeTab()
        if (active) this.actions.reloadOrStop(active.id, active.loading)
      }
    })
    this.starBtn = new TouchBar.TouchBarButton({
      icon: barIcon('star'),
      backgroundColor: IDLE_CHIP,
      click: () => {
        const active = this.activeTab()
        if (active && /^https?:\/\//i.test(active.url)) {
          this.actions.toggleBookmark(active.url, active.title)
        }
      }
    })
    this.activeBtn = new TouchBar.TouchBarButton({
      label: 'New Tab',
      backgroundColor: ACCENT
    })
    const aiBtn = new TouchBar.TouchBarButton({
      icon: barIcon('ai'),
      backgroundColor: VIOLET,
      click: () => {
        this.glow(aiBtn, VIOLET, '#c4b5fd')
        this.actions.openAi()
      }
    })
    this.scrubber = new TouchBar.TouchBarScrubber({
      items: [],
      mode: 'free',
      continuous: true,
      selectedStyle: 'background',
      showArrowButtons: false,
      select: index => {
        // macOS/Electron can raise an interaction event right after the
        // item list is replaced; only trust taps while the list is at
        // rest, so phantom selects never switch tabs.
        if (Date.now() - this.itemsUpdatedAt < SELECT_SETTLE_MS) return
        const tab = this.currentTabs[index]
        if (tab) this.actions.activateTab(tab.id)
      }
    })
    this.newTabBtn = new TouchBar.TouchBarButton({
      icon: barIcon('newtab'),
      backgroundColor: IDLE_CHIP,
      click: () => this.actions.newTab()
    })

    let bar: TouchBar | null = null
    try {
      bar = new TouchBar({
        items: [
          this.reloadBtn,
          this.scrubber,
          this.activeBtn,
          this.starBtn,
          aiBtn,
          new TouchBar.TouchBarSpacer({ size: 'flexible' }),
          this.newTabBtn
        ]
      })
      win.setTouchBar(bar)
    } catch (error) {
      // No Touch Bar support on this machine/runtime: browsing is unaffected.
      bar = null
      console.warn('[touch-bar] unavailable:', error)
    }
    this.touchBar = bar

    // Bookmark changes from any surface (renderer star or this bar) must
    // refresh the star button here too.
    subscribeBookmarks(() => this.requestSync())
  }

  /** Throttled entry point driven by TabManager broadcasts. */
  sync(snapshot: TabsSnapshot): void {
    this.snapshot = snapshot
    if (this.broken || this.touchBar === null) return
    if (this.syncTimer) return
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null
      try {
        this.doSync()
      } catch (error) {
        this.breakQuietly('[touch-bar] disabled after error:', error)
      }
    }, SELECT_DEBOUNCE_MS)
  }

  /** Called by TabManager when a page reports its favicons. */
  noteFavicon(tabId: string, pageUrl: string, favicons: string[]): void {
    if (this.broken) return
    if (!this.tabIcon.has(tabId) && !/^https?:\/\//i.test(pageUrl)) return

    // Ordered candidates: an embedded data URL wins (site-curated, decodes
    // without a network hop); reported remotes follow; last resort is
    // origin/favicon.ico, which many sites keep even when <link> only
    // lists an SVG that NativeImage cannot decode.
    let dataIcon: NativeImage | null = null
    let dataKey: string | null = null
    const remote: string[] = []
    for (const url of favicons) {
      if (/^data:image\//i.test(url)) {
        if (dataIcon === null) {
          const decoded = nativeImage.createFromDataURL(url)
          if (!decoded.isEmpty()) {
            dataIcon = decoded
            dataKey = url
          }
        }
      } else if (/^https:\/\//i.test(url) && !remote.includes(url)) {
        remote.push(url)
      }
    }
    try {
      const originFavicon = `${new URL(pageUrl).origin}/favicon.ico`
      if (!remote.includes(originFavicon)) remote.push(originFavicon)
    } catch {
      return
    }

    if (dataIcon && dataKey) {
      this.icons.set(dataKey, normalizeIcon(dataIcon))
      this.tabIcon.set(tabId, dataKey)
      this.requestSync()
      return
    }

    this.tabIcon.set(tabId, remote)
    void this.fetchIcon(remote)
  }

  /** Fetches candidates in order until one yields a decodable image. */
  private async fetchIcon(candidates: string[], index = 0): Promise<void> {
    for (let i = index; i < candidates.length; i += 1) {
      const url = candidates[i]
      if (this.icons.has(url)) {
        this.requestSync()
        return
      }
      if (this.pending.has(url)) continue

      this.pending.add(url)
      let icon = nativeImage.createEmpty()
      try {
        const response = await net.fetch(url)
        if (response.ok) {
          icon = nativeImage.createFromBuffer(
            Buffer.from(await response.arrayBuffer())
          )
        }
      } catch {
        // Cosmetic; the next candidate is tried below.
      } finally {
        this.pending.delete(url)
      }
      if (!icon.isEmpty()) {
        this.icons.set(url, normalizeIcon(icon))
        this.requestSync()
        return
      }
    }
  }

  private requestSync(): void {
    if (this.snapshot) this.sync(this.snapshot)
  }

  /**
   * Glow animation: a violet brand pulse fading back to the resting color.
   * macOS offers no keyframe API for Touch Bar controls, so the fade is
   * drawn by stepping backgroundColor — Electron applies each step on the
   * hardware immediately.
   */
  private glow(button: TouchBarButton, rest: string, hot: string = VIOLET): void {
    if (this.broken || this.touchBar === null) return
    const previous = this.glows.get(button)
    if (previous) clearInterval(previous)

    const frames = [
      hot,
      mixColor(hot, rest, 0.55),
      mixColor(hot, rest, 0.22),
      rest
    ]
    let step = 0
    button.backgroundColor = frames[0] as string
    const timer = setInterval(() => {
      step += 1
      button.backgroundColor = frames[step] ?? rest
      if (step >= frames.length - 1) {
        clearInterval(timer)
        this.glows.delete(button)
      }
    }, 45)
    this.glows.set(button, timer)
  }

  private activeTab(): TabState | null {
    const snap = this.snapshot
    if (!snap) return null
    return snap.tabs.find(t => t.id === snap.activeId) ?? null
  }

  private doSync(): void {
    const snap = this.snapshot
    if (!snap || this.touchBar === null) return
    const active = this.activeTab()

    this.reloadBtn.label = active?.loading ? '■' : '↻'
    const bookmarked =
      active !== null && /^https?:\/\//i.test(active.url) && hasBookmark(active.url)
    // Don't stomp a running fade.
    if (!this.glows.has(this.starBtn)) {
      this.starBtn.backgroundColor = bookmarked ? ACCENT : IDLE_CHIP
    }
    if (bookmarked && !this.lastBookmarked) this.glow(this.starBtn, ACCENT)

    // Glows on real tab events: a switch hands the chip over with a sweep,
    // creation flashes the ＋ button, closing does a regroup pulse.
    const switched =
      this.lastActiveId !== null && this.lastActiveId !== snap.activeId
    const created = this.lastCount >= 0 && snap.tabs.length > this.lastCount
    const closed = this.lastCount >= 0 && snap.tabs.length < this.lastCount
    if (switched || closed) this.glow(this.activeBtn, ACCENT)
    if (created) this.glow(this.newTabBtn, IDLE_CHIP)
    this.lastActiveId = snap.activeId
    this.lastCount = snap.tabs.length
    this.lastBookmarked = bookmarked

    this.activeBtn.label = active
      ? addressChipLabel(active.url).slice(0, ACTIVE_LABEL_MAX)
      : 'New Tab'

    // Closed tabs disappear immediately: items are rebuilt from the
    // live registry, so no stale tab reference can survive a sync.
    this.currentTabs = snap.tabs
    this.scrubber.items = snap.tabs.map(tab => ({
      icon: this.iconFor(tab),
      label: compactTitle(tab.title, tab.url, SCRUBBER_LABEL_MAX)
    }))
    this.itemsUpdatedAt = Date.now()

    // Drop favicon bookkeeping for tabs that no longer exist.
    const alive = new Set(snap.tabs.map(t => t.id))
    for (const id of this.tabIcon.keys()) {
      if (!alive.has(id)) this.tabIcon.delete(id)
    }
    if (this.icons.size > ICON_CACHE_LIMIT) this.icons.clear()
  }

  private iconFor(tab: TabState): NativeImage {
    if (/^https?:\/\//i.test(tab.url)) {
      const entry = this.tabIcon.get(tab.id)
      const candidates =
        typeof entry === 'string' ? [entry] : (entry ?? [])
      for (const source of candidates) {
        const icon = this.icons.get(source)
        if (icon && !icon.isEmpty()) return icon
      }
    }
    return this.compass
  }

  private breakQuietly(message: string, error: unknown): void {
    this.broken = true
    console.warn(message, error)
  }
}
