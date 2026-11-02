/**
 * navigatrum://downloads — live download manager backed by Electron's
 * download APIs: filename, size, progress, status, open/cancel/reveal.
 */
import { useEffect, useState, type JSX } from 'react'

import type { DownloadRecord } from '@shared/types'

import { EmptyState, PageShell, formatBytes, formatTime } from './PageShell'

interface DownloadsPageProps {
  tabId: string | null
}

export function DownloadsPage({ tabId }: DownloadsPageProps): JSX.Element {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([])

  useEffect(() => {
    void window.navigatrum.listDownloads().then(setDownloads)
    return window.navigatrum.onDownloads(setDownloads)
  }, [])

  return (
    <PageShell
      title="Downloads"
      actions={
        <>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void window.navigatrum.openDownloadsFolder()}
          >
            Open folder
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void window.navigatrum.clearFinishedDownloads()}
          >
            Clear finished
          </button>
        </>
      }
    >
      {downloads.length === 0 ? (
        <EmptyState text="Downloads will appear here." />
      ) : (
        <div className="data-list">
          {downloads.map(dl => (
            <DownloadRow key={dl.id} dl={dl} tabId={tabId} />
          ))}
        </div>
      )}
    </PageShell>
  )
}

function DownloadRow({
  dl,
  tabId
}: {
  dl: DownloadRecord
  tabId: string | null
}): JSX.Element {
  const percent =
    dl.total > 0 && dl.state === 'progressing'
      ? Math.min(100, Math.round((dl.received / dl.total) * 100))
      : null

  const status = ((): string => {
    switch (dl.state) {
      case 'progressing':
        return percent !== null ? `Downloading — ${percent}%` : 'Downloading…'
      case 'completed':
        return `Completed · ${formatTime(dl.startedAt)}`
      case 'cancelled':
        return 'Cancelled'
      case 'interrupted':
        return dl.error ?? 'Failed'
    }
  })()

  return (
    <div className="row-item download-row" data-state={dl.state}>
      <div className="row-main">
        <span className="row-title">{dl.filename}</span>
        <span className="row-url">{dl.url}</span>
        {dl.state === 'progressing' ? (
          <div
            className={
              percent !== null ? 'progress-track' : 'progress-track indeterminate'
            }
          >
            <div
              className="progress-fill"
              style={percent !== null ? { width: `${percent}%` } : undefined}
            />
          </div>
        ) : null}
        <span className="row-url status">
          {[
            status,
            formatBytes(dl.total) || formatBytes(dl.received)
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </span>
      </div>
      <div className="row-buttons">
        {dl.state === 'completed' ? (
          <>
            <button
              type="button"
              className="btn small"
              onClick={() => void window.navigatrum.openDownload(dl.id)}
            >
              Open
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => void window.navigatrum.showInFolder(dl.id)}
            >
              Reveal
            </button>
          </>
        ) : null}
        {dl.state === 'progressing' ? (
          <button
            type="button"
            className="btn ghost small"
            onClick={() => void window.navigatrum.cancelDownload(dl.id)}
          >
            Cancel
          </button>
        ) : null}
        {dl.state !== 'progressing' && tabId ? (
          <button
            type="button"
            className="row-action"
            aria-label="Remove from list"
            onClick={() => void window.navigatrum.removeDownloadEntry(dl.id)}
          >
            ✕
          </button>
        ) : null}
      </div>
    </div>
  )
}
