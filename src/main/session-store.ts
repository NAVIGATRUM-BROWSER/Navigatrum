/**
 * Session persistence: remembers open tabs (URL + title + active index) so
 * restarting NAVIGATRUM restores where the user left off. Honor the
 * "Restore session" setting when restoring; always save, so re-enabling
 * the setting brings the last session back.
 */
import type { SavedSession, TabsSnapshot, TabState } from '@shared/types'

import { loadStore, saveStore } from './store'

const STORE_NAME = 'session'
const MAX_TABS = 30

let lastSaved: SavedSession | null = null

export function saveSession(snapshot: TabsSnapshot): void {
  const tabs = snapshot.tabs
    .filter(tab => isRestorable(tab))
    .slice(0, MAX_TABS)
    .map(tab => ({ url: tab.url, title: tab.title }))
  const index = Math.max(
    0,
    snapshot.tabs.findIndex(tab => tab.id === snapshot.activeId)
  )
  const session: SavedSession = {
    tabs,
    // When the active tab is the home screen we still restore its index.
    activeIndex: Math.min(index, Math.max(0, tabs.length - 1))
  }
  firstEmptyActiveIndex(session)
  lastSaved = session
  saveStore(STORE_NAME, session)
}

/** Windows closing at quit serialize fine; the home screen stays restorable. */
function isRestorable(tab: TabState): boolean {
  return tab.url === '' || /^https?:\/\//i.test(tab.url)
}

function firstEmptyActiveIndex(session: SavedSession): void {
  if (session.tabs.length === 0) session.activeIndex = 0
}

export function loadSession(): SavedSession | null {
  if (lastSaved) return lastSaved
  const session = loadStore<SavedSession | null>(STORE_NAME, null)
  if (
    !session ||
    !Array.isArray(session.tabs) ||
    session.tabs.length === 0
  ) {
    return null
  }
  return session
}

export function clearSession(): void {
  lastSaved = null
  saveStore(STORE_NAME, { tabs: [], activeIndex: 0 })
}
