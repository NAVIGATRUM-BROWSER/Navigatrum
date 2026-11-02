/**
 * Download manager. Wraps Electron's session will-download events with a
 * small registry of DownloadRecords, exposed to the renderer via IPC.
 * The renderer never touches DownloadItem objects directly.
 */
import { existsSync } from 'node:fs'
import { app, shell } from 'electron'
import type { DownloadRecord, DownloadState } from '@shared/types'

import { loadStore, saveStore } from './store'

const sessionDownloads = new Map<string, Electron.DownloadItem>()
const records = new Map<string, DownloadRecord>()
const order: string[] = []
const listeners = new Set<(list: DownloadRecord[]) => void>()

function snapshot(): DownloadRecord[] {
  return order
    .map(id => records.get(id))
    .filter((r): r is DownloadRecord => r !== undefined)
    .map(r => ({ ...r }))
}

function broadcast(): void {
  const list = snapshot()
  for (const listener of listeners) listener(list)
}

/** Persist terminal-state records (progressing entries can't resume). */
function persist(): void {
  saveStore(
    'downloads',
    snapshot().filter(r => r.state !== 'progressing')
  )
}

export function initDownloads(): void {
  records.clear()
  order.length = 0
  // Persisted records are loaded only when someone lists them, so a crash
  // during download startup can't corrupt this registry.
  const stored = loadStore<DownloadRecord[]>('downloads', [])
  for (const record of stored.slice(0, 200)) {
    // Historic entries keep only terminal states; progress can't resume.
    if (record.state === 'progressing') continue
    records.set(record.id, record)
    order.push(record.id)
  }
}

export function listDownloads(): DownloadRecord[] {
  return snapshot()
}

/** True when a live download exists for this URL (load-abort heuristic). */
export function activeDownloadFor(url: string): DownloadRecord | undefined {
  return snapshot().find(
    r => r.state === 'progressing' && r.url === url
  )
}

export function subscribe(listener: (list: DownloadRecord[]) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Wire a brand-new WebContents download through Electron's API. */
export function trackDownload(item: Electron.DownloadItem): void {
  const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  sessionDownloads.set(id, item)

  const record: DownloadRecord = {
    id,
    filename: item.getFilename(),
    path: item.getSavePath(),
    url: item.getURL(),
    total: item.getTotalBytes(),
    received: 0,
    state: 'progressing',
    startedAt: Date.now()
  }
  records.set(id, record)
  order.unshift(id)

  item.on('updated', () => {
    const r = records.get(id)
    if (!r) return
    r.received = item.getReceivedBytes()
    r.total = item.getTotalBytes()
    if (item.isPaused()) r.state = 'interrupted'
    else if (r.state === 'progressing' || r.state === 'interrupted') {
      r.state = 'progressing'
    }
    broadcast()
  })

  item.once('done', (_event, state: DownloadState) => {
    const r = records.get(id)
    if (r) {
      r.state = state
      r.received = item.getReceivedBytes()
      r.total = item.getTotalBytes()
      if (state !== 'completed') {
        r.error = state === 'interrupted' ? 'Interrupted' : 'Download failed'
      }
    }
    sessionDownloads.delete(id)
    persist()
    broadcast()
  })

  broadcast()
}

export function openDownload(id: string): boolean {
  const record = records.get(id)
  if (!record || record.state !== 'completed' || !record.path) return false
  if (!existsSync(record.path)) return false
  void shell.openPath(record.path)
  return true
}

export function showInFolder(id: string): boolean {
  const record = records.get(id)
  if (!record?.path) return false
  shell.showItemInFolder(record.path)
  return true
}

export function cancelDownload(id: string): boolean {
  const record = records.get(id)
  if (!record) return false
  if (record.state === 'progressing') {
    sessionDownloads.get(id)?.cancel()
    return true
  }
  // Terminal entry: removing it from the list is the intended action.
  return removeEntry(id)
}

export function removeEntry(id: string): boolean {
  const item = sessionDownloads.get(id)
  if (item) item.cancel()
  sessionDownloads.delete(id)
  if (!records.has(id)) return false
  records.delete(id)
  const i = order.indexOf(id)
  if (i >= 0) order.splice(i, 1)
  persist()
  broadcast()
  return true
}

export function openDownloadsFolder(): void {
  void shell.openPath(downloadTargetFolder())
}

/** The folder new downloads land in: user setting or system default. */
function downloadTargetFolder(): string {
  return defaultFolder ?? app.getPath('downloads')
}

/** Injectable so nothing here imports the settings store directly. */
let defaultFolder = ''

export function setDownloadFolder(folder: string): void {
  defaultFolder = folder
}

export function clearFinished(): void {
  for (const id of order) {
    const record = records.get(id)
    if (record && record.state !== 'progressing') {
      records.delete(id)
      sessionDownloads.delete(id)
    }
  }
  order.length = 0
  const remaining = Array.from(sessionDownloads.keys())
  order.push(...remaining)
  persist()
  broadcast()
}
