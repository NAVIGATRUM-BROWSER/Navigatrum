/**
 * navigatrum://history — searchable list of visited pages with per-entry
 * and bulk deletion. Entries open in the active tab.
 */
import { useEffect, useMemo, useState, type JSX } from 'react'

import type { HistoryEntry } from '@shared/types'

import { EmptyState, PageShell, formatTime } from './PageShell'

interface HistoryPageProps {
  tabId: string | null
}

export function HistoryPage({ tabId }: HistoryPageProps): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    void window.navigatrum.listHistory().then(setEntries)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return entries
    return entries.filter(
      e => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)
    )
  }, [entries, query])

  const open = (url: string): void => {
    if (tabId) void window.navigatrum.navigate(tabId, url)
  }

  const removeOne = async (id: string): Promise<void> => {
    await window.navigatrum.removeHistoryEntry(id)
    setEntries(await window.navigatrum.listHistory())
  }

  const clearAll = async (): Promise<void> => {
    if (entries.length === 0) return
    if (!window.confirm('Clear all browsing history?')) return
    await window.navigatrum.clearHistory()
    setEntries([])
  }

  return (
    <PageShell
      title="History"
      actions={
        <button type="button" className="btn ghost" onClick={() => void clearAll()}>
          Clear all
        </button>
      }
    >
      <input
        className="page-search"
        type="text"
        placeholder="Search history"
        spellCheck={false}
        value={query}
        onChange={event => setQuery(event.target.value)}
        autoFocus
      />
      {filtered.length === 0 ? (
        <EmptyState
          text={query === '' ? 'Pages you visit will appear here.' : 'No matching history.'}
        />
      ) : (
        <div className="data-list">
          {filtered.map(entry => (
            <div className="row-item" key={entry.id}>
              <button
                type="button"
                className="row-open"
                title={entry.url}
                onClick={() => open(entry.url)}
              >
                <span className="row-title">{entry.title || entry.url}</span>
                <span className="row-url">{entry.url}</span>
              </button>
              <span className="row-meta">{formatTime(entry.visitedAt)}</span>
              <button
                type="button"
                className="row-action"
                aria-label="Remove this entry"
                onClick={() => void removeOne(entry.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}
