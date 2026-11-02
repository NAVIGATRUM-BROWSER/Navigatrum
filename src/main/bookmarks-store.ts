/**
 * Bookmarks. Ordered, de-duplicated by URL, persisted as JSON.
 */
import type { Bookmark } from '@shared/types'

import { loadStore, saveStore } from './store'

const STORE_NAME = 'bookmarks'
const MAX_BOOKMARKS = 500

let bookmarks: Bookmark[] = []
let nextId = 0

export function initBookmarks(): void {
  bookmarks = loadStore<Bookmark[]>(STORE_NAME, []).slice(0, MAX_BOOKMARKS)
  nextId = bookmarks.reduce(
    (max, b) => Math.max(max, Number(b.id.replace('bm-', '')) || 0),
    0
  )
}

export function listBookmarks(): Bookmark[] {
  return bookmarks.map(b => ({ ...b }))
}

export function hasBookmark(url: string): boolean {
  return bookmarks.some(b => b.url === url)
}

/** Adds a bookmark; updates the title if the same URL already exists. */
export function addBookmark(url: string, title: string): Bookmark[] {
  const cleanUrl = url.trim()
  if (!/^https?:\/\//i.test(cleanUrl)) return listBookmarks()

  const existing = bookmarks.find(b => b.url === cleanUrl)
  if (existing) {
    existing.title = title || existing.title
    existing.addedAt = Date.now()
  } else {
    nextId += 1
    bookmarks.push({
      id: `bm-${nextId}`,
      url: cleanUrl,
      title: title || cleanUrl,
      addedAt: Date.now()
    })
    if (bookmarks.length > MAX_BOOKMARKS) bookmarks.shift()
  }
  saveStore(STORE_NAME, bookmarks)
  return listBookmarks()
}

export function removeBookmark(id: string): Bookmark[] {
  bookmarks = bookmarks.filter(b => b.id !== id)
  saveStore(STORE_NAME, bookmarks)
  return listBookmarks()
}
