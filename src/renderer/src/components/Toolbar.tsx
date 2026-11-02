/**
 * Navigation toolbar: back, forward, reload/stop, home, the address bar and
 * the Milestone-3 data controls (bookmark star, bookmark menu, downloads,
 * history and settings). Every button maps to a real action.
 */
import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  type JSX
} from 'react'

import {
  isInternalUrl,
  internalRouteLabel,
  type Bookmark,
  type DownloadRecord,
  type TabState
} from '@shared/types'

interface ToolbarProps {
  tab: TabState | null
}

export function Toolbar({ tab }: ToolbarProps): JSX.Element {
  return (
    <nav className="toolbar">
      <NavGroup tab={tab} />
      <AddressBar tab={tab} />
      <DataButtons tab={tab} />
      <div className="toolbar-spacer" />
    </nav>
  )
}

function NavGroup({ tab }: { tab: TabState | null }): JSX.Element {
  const id = tab?.id ?? null
  return (
    <div className="nav-buttons">
      <NavButton
        label="Back (⌘[)"
        disabled={!tab?.canGoBack}
        onClick={() => id && void window.navigatrum.back(id)}
      >
        <svg viewBox="0 0 24 24">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </NavButton>
      <NavButton
        label="Forward (⌘])"
        disabled={!tab?.canGoForward}
        onClick={() => id && void window.navigatrum.forward(id)}
      >
        <svg viewBox="0 0 24 24">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </NavButton>
      {tab?.loading ? (
        <NavButton
          label="Stop"
          disabled={!id}
          onClick={() => id && void window.navigatrum.stop(id)}
        >
          <svg viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </NavButton>
      ) : (
        <NavButton
          label="Reload (⌘R)"
          disabled={!id}
          onClick={() => id && void window.navigatrum.reload(id)}
        >
          <svg viewBox="0 0 24 24">
            <path d="M20 11a8 8 0 10-2.34 6.66M20 5v6h-6" />
          </svg>
        </NavButton>
      )}
      <NavButton
        label="Home"
        disabled={!id}
        onClick={() => id && void window.navigatrum.goHome(id)}
      >
        <svg viewBox="0 0 24 24">
          <path d="M4 11l8-7 8 7" />
          <path d="M6 10v9h12v-9" />
        </svg>
      </NavButton>
    </div>
  )
}

function NavButton(props: {
  label: string
  disabled?: boolean
  onClick: () => void
  className?: string
  children: JSX.Element
}): JSX.Element {
  return (
    <button
      type="button"
      className={
        props.className ? `nav-button ${props.className}` : 'nav-button'
      }
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

/* ---------- Milestone 3 data controls ---------- */

function DataButtons({ tab }: { tab: TabState | null }): JSX.Element {
  const bookmarks = useBookmarks()
  const downloads = useDownloads()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const id = tab?.id ?? null
  const navigateTo = (input: string): void => {
    if (id) void window.navigatrum.navigate(id, input)
  }

  // Only real web pages can be bookmarked.
  const bookmarkable = Boolean(tab && /^https?:\/\//i.test(tab.url || ''))
  const bookmarked =
    tab !== null && bookmarks.some(b => tab.url !== '' && b.url === tab.url)

  // Close the bookmark menu on any click outside it.
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  const toggleBookmark = (): void => {
    if (!tab || !bookmarkable) return
    if (bookmarked) {
      const existing = bookmarks.find(b => b.url === tab.url)
      if (existing) void window.navigatrum.removeBookmark(existing.id)
    } else {
      void window.navigatrum.addBookmark(tab.url, tab.title || tab.url)
    }
  }

  const activeDownloads = downloads.filter(d => d.state === 'progressing').length

  return (
    <div className="data-buttons">
      <NavButton
        label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
        className={bookmarked ? 'starred' : undefined}
        disabled={!id || !bookmarkable}
        onClick={toggleBookmark}
      >
        <svg viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'}>
          <path d="M12 3l2.69 5.75 6.31.62-4.75 4.2 1.4 6.18L12 16.5l-5.65 3.25 1.4-6.18L3 9.37l6.31-.62L12 3z" />
        </svg>
      </NavButton>
      <div className="bookmarks-wrap" ref={menuRef}>
        <NavButton
          label="Bookmarks"
          disabled={!id}
          onClick={() => setMenuOpen(open => !open)}
        >
          <svg viewBox="0 0 24 24">
            <path d="M6 4h12v17l-6-4-6 4V4z" />
          </svg>
        </NavButton>
        {menuOpen ? (
          <BookmarksMenu
            bookmarks={bookmarks}
            onOpen={url => {
              setMenuOpen(false)
              navigateTo(url)
            }}
            onRemove={bookmarkId => void window.navigatrum.removeBookmark(bookmarkId)}
          />
        ) : null}
      </div>
      <div className="badge-wrap">
        <NavButton
          label="Downloads (⌘J)"
          disabled={!id}
          onClick={() => navigateTo('navigatrum://downloads')}
        >
          <svg viewBox="0 0 24 24">
            <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" />
          </svg>
        </NavButton>
        {activeDownloads > 0 ? (
          <span className="dl-badge">{activeDownloads}</span>
        ) : null}
      </div>
      <NavButton
        label="History (⌘Y)"
        disabled={!id}
        onClick={() => navigateTo('navigatrum://history')}
      >
        <svg viewBox="0 0 24 24">
          <path d="M3.5 12a8.5 8.5 0 108.5-8.5A8.5 8.5 0 003.5 12zM12 7.5V12l3 2" />
          <path d="M3.5 12h.01" />
        </svg>
      </NavButton>
      <NavButton
        label="Settings (⌘,)"
        disabled={!id}
        onClick={() => navigateTo('navigatrum://settings')}
      >
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.03 1.56V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1.1-1.56 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-1.56-1.03H3a2 2 0 110-4h.09A1.7 1.7 0 004.65 8.9a1.7 1.7 0 00-.34-1.87l-.06-.06A2 2 0 117.08 4.14l.06.06a1.7 1.7 0 001.87.34h.08A1.7 1.7 0 0010.12 3V3a2 2 0 114 0v.09a1.7 1.7 0 001.03 1.56 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87v.08a1.7 1.7 0 001.56 1.03H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.51 1.03z" />
        </svg>
      </NavButton>
    </div>
  )
}

function useBookmarks(): Bookmark[] {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  useEffect(() => {
    let alive = true
    void window.navigatrum.listBookmarks().then(list => {
      if (alive) setBookmarks(list)
    })
    const off = window.navigatrum.onBookmarks(setBookmarks)
    return () => {
      alive = false
      off()
    }
  }, [])
  return bookmarks
}

function useDownloads(): DownloadRecord[] {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([])
  useEffect(() => {
    void window.navigatrum.listDownloads().then(setDownloads)
    return window.navigatrum.onDownloads(setDownloads)
  }, [])
  return downloads
}

function BookmarksMenu(props: {
  bookmarks: Bookmark[]
  onOpen: (url: string) => void
  onRemove: (id: string) => void
}): JSX.Element {
  return (
    <div className="bookmarks-popover">
      <div className="popover-heading">Bookmarks</div>
      {props.bookmarks.length === 0 ? (
        <div className="popover-empty">
          No bookmarks yet — press the star to add the current page.
        </div>
      ) : (
        props.bookmarks.map(bookmark => (
          <div className="popover-item" key={bookmark.id}>
            <button
              type="button"
              className="bookmark-open"
              title={bookmark.url}
              onClick={() => props.onOpen(bookmark.url)}
            >
              <span className="row-title">{bookmark.title || bookmark.url}</span>
              <span className="row-url">{bookmark.url}</span>
            </button>
            <button
              type="button"
              className="row-action"
              aria-label="Remove bookmark"
              onClick={() => props.onRemove(bookmark.id)}
            >
              ✕
            </button>
          </div>
        ))
      )}
    </div>
  )
}

/* ---------- Address bar ---------- */

function AddressBar({ tab }: { tab: TabState | null }): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const shownUrl = tab?.url ?? ''

  // Follow the real URL unless the user is mid-edit.
  useEffect(() => {
    if (!focused) setDraft('')
  }, [shownUrl, focused])

  useEffect(() => {
    const focusAddress = (): void => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('navigatrum:focus-address', focusAddress)
    return () =>
      window.removeEventListener('navigatrum:focus-address', focusAddress)
  }, [])

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!tab) return
    const value = draft
    inputRef.current?.blur()
    setDraft('')
    void window.navigatrum.navigate(tab.id, value)
  }

  const display = focused ? draft : shownUrl === '' ? '' : prettyUrl(shownUrl, tab)

  return (
    <form className="addressbar" onSubmit={submit}>
      {tab?.error !== null && tab ? <span className="address-warn" /> : null}
      <input
        ref={inputRef}
        className="address-input"
        type="text"
        spellCheck={false}
        autoComplete="off"
        placeholder={tab?.url === '' ? 'Search or enter a URL' : ''}
        value={display}
        onChange={event => setDraft(event.target.value)}
        onFocus={event => {
          setFocused(true)
          event.target.select()
        }}
        onBlur={() => {
          setFocused(false)
          setDraft('')
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            inputRef.current?.blur()
          }
        }}
      />
    </form>
  )
}

function prettyUrl(url: string, tab?: TabState | null): string {
  // Internal chrome pages get their friendly name.
  if (isInternalUrl(url)) {
    return internalRouteLabel(url.slice('navigatrum://'.length))
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'data:') {
      return tab?.error ? `Can't reach page` : 'NAVIGATRUM page'
    }
    return parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname)
  } catch {
    return url
  }
}
