/**
 * Navigation toolbar: back, forward, reload/stop, home and the address bar.
 * Every button maps to a real navigation action on the active tab.
 */
import { FormEvent, useEffect, useRef, useState, type JSX } from 'react'

import type { TabState } from '@shared/types'

interface ToolbarProps {
  tab: TabState | null
}

export function Toolbar({ tab }: ToolbarProps): JSX.Element {
  return (
    <nav className="toolbar">
      <NavGroup tab={tab} />
      <AddressBar tab={tab} />
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
  children: JSX.Element
}): JSX.Element {
  return (
    <button
      type="button"
      className="nav-button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

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
        placeholder={tab?.url === '' ? 'Search DuckDuckGo or enter a URL' : ''}
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
