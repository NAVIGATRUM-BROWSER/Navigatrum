/**
 * Browsing history. Most recent first, capped, persisted as JSON.
 * Internal pages (navigatrum://) and in-page data: URLs are never recorded —
 * only real navigations the user could revisit.
 */
import type { HistoryEntry } from '@shared/types'

import { loadStore, saveStore } from './store'

const STORE_NAME = 'history'
const MAX_ENTRIES = 2000

let entries: HistoryEntry[] = []
let nextId = 0

export function initHistory(): void {
  entries = loadStore<HistoryEntry[]>(STORE_NAME, []).slice(0, MAX_ENTRIES)
  nextId = entries.reduce(
    (max, e) => Math.max(max, Number(e.id.replace('h-', '')) || 0),
    0
  )
}

export function listHistory(): HistoryEntry[] {
  return entries.map(e => ({ ...e }))
}

/** Records a real page visit (URL + title becomes known later). */
export function recordVisit(url: string): void {
  if (!/^https?:\/\//i.test(url)) return
  const now = Date.now()
  // Merge in-page hash navigations of the same page within a short window.
  const dup = entries.find(
    e => e.url.split('#')[0] === url.split('#')[0] && now - e.visitedAt < 30_000
  )
  nextId += 1
  const entry: HistoryEntry = {
    id: `h-${nextId}`,
    url,
    title: '',
    visitedAt: now
  }
  if (dup) {
    entries = entries.filter(e => e !== dup)
  }
  entries.unshift(entry)
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES
  saveStore(STORE_NAME, entries)
}

/** Backfills the title once the page announces it. */
export function updateTitle(url: string, title: string): void {
  if (!title) return
  const entry = entries.find(e => e.url === url)
  if (entry && entry.title !== title) {
    entry.title = title
    saveStore(STORE_NAME, entries)
  }
}

export function removeHistoryEntry(id: string): HistoryEntry[] {
  entries = entries.filter(e => e.id !== id)
  saveStore(STORE_NAME, entries)
  return listHistory()
}

export function clearHistory(): void {
  entries = []
  saveStore(STORE_NAME, entries)
}
