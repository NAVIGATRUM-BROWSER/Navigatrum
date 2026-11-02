/**
 * NAVIGATRUM chrome root. Mirrors the live TabsSnapshot from the main
 * process and renders the tab strip, toolbar, internal pages, home screen
 * and loading bar.
 */
import { useEffect, useState, type JSX } from 'react'

import {
  isInternalUrl,
  type InternalRoute,
  type TabsSnapshot
} from '@shared/types'

import { HomeScreen } from './components/HomeScreen'
import { TitleBar } from './components/TitleBar'
import { Toolbar } from './components/Toolbar'
import { DownloadsPage } from './components/pages/DownloadsPage'
import { HistoryPage } from './components/pages/HistoryPage'
import { SettingsPage } from './components/pages/SettingsPage'

export default function App(): JSX.Element {
  const [snapshot, setSnapshot] = useState<TabsSnapshot>({
    activeId: null,
    tabs: []
  })

  useEffect(() => {
    let alive = true
    void window.navigatrum.getSnapshot().then(state => {
      if (alive) setSnapshot(state)
    })
    const offSnapshot = window.navigatrum.onSnapshot(state => setSnapshot(state))
    const offFocusAddress = window.navigatrum.onFocusAddress(() => {
      window.dispatchEvent(new CustomEvent('navigatrum:focus-address'))
    })
    return () => {
      alive = false
      offSnapshot()
      offFocusAddress()
    }
  }, [])

  const active = snapshot.tabs.find(tab => tab.id === snapshot.activeId) ?? null
  const atHome = active !== null && active.url === ''
  const internalRoute =
    active !== null && isInternalUrl(active.url)
      ? (active.url.slice('navigatrum://'.length) as InternalRoute)
      : null

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const api = window.navigatrum
      const activeId = snapshot.activeId
      if (!activeId) return

      // Next/previous tab: Ctrl+Tab / Ctrl+Shift+Tab.
      if (event.ctrlKey && event.key === 'Tab') {
        event.preventDefault()
        const index = snapshot.tabs.findIndex(t => t.id === activeId)
        const next =
          (index + (event.shiftKey ? -1 : 1) + snapshot.tabs.length) %
          snapshot.tabs.length
        void api.activateTab(snapshot.tabs[next]!.id)
        return
      }
      if (!event.metaKey) return

      switch (event.key.toLowerCase()) {
        case 't':
          event.preventDefault()
          void api.createTab()
          break
        case 'w':
          event.preventDefault()
          void api.closeTab(activeId)
          break
        case 'r':
          event.preventDefault()
          void api.reload(activeId)
          break
        case 'l':
          // Handled directly by the AddressBar renderer-side listener.
          window.dispatchEvent(new CustomEvent('navigatrum:focus-address'))
          break
        case '[':
          event.preventDefault()
          void api.back(activeId)
          break
        case ']':
          event.preventDefault()
          void api.forward(activeId)
          break
        case 'y':
          event.preventDefault()
          void api.navigate(activeId, 'navigatrum://history')
          break
        case 'j':
          event.preventDefault()
          void api.navigate(activeId, 'navigatrum://downloads')
          break
        case ',':
          event.preventDefault()
          void api.navigate(activeId, 'navigatrum://settings')
          break
        default:
          if (/^[1-9]$/.test(event.key)) {
            const nth = snapshot.tabs[Number(event.key) - 1]
            if (nth) {
              event.preventDefault()
              void api.activateTab(nth.id)
            }
          }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [snapshot])

  let page: JSX.Element
  if (internalRoute === 'history' && active) {
    page = <HistoryPage tabId={active.id} />
  } else if (internalRoute === 'downloads' && active) {
    page = <DownloadsPage tabId={active.id} />
  } else if (internalRoute === 'settings' && active) {
    page = <SettingsPage />
  } else if (atHome && active) {
    page = (
      <HomeScreen
        onSubmit={value => {
          void window.navigatrum.navigate(active.id, value)
        }}
      />
    )
  } else {
    page = <div className="content-gap" aria-hidden />
  }

  return (
    <div className="app">
      <TitleBar snapshot={snapshot} />
      <Toolbar tab={active} />
      <div className={active?.loading ? 'loading-bar active' : 'loading-bar'} />
      {page}
    </div>
  )
}
