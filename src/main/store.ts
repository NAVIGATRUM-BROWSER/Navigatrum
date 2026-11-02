/**
 * Simple JSON persistence for browser data (settings, bookmarks, history,
 * session state). Lives in the app's userData directory, isolated from any
 * website content. Writes are buffered briefly so bursts of updates
 * (history, downloads) don't thrash the disk; quitFlushSync guarantees
 * everything lands on disk before the process exits.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'

function storeDir(): string {
  return join(app.getPath('userData'), 'store')
}

/** Names with pending, not-yet-flushed values and their latest payload. */
const pending = new Map<string, unknown>()
const timers = new Map<string, NodeJS.Timeout>()

export function loadStore<T>(name: string, fallback: T): T {
  try {
    const raw = readFileSync(join(storeDir(), `${name}.json`), 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveStore<T>(name: string, value: T): void {
  pending.set(name, value)
  const existing = timers.get(name)
  if (existing) clearTimeout(existing)
  timers.set(
    name,
    setTimeout(() => flush(name), 150)
  )
}

function flush(name: string): void {
  const value = pending.get(name)
  if (value === undefined) return
  pending.delete(name)
  timers.delete(name)
  try {
    mkdirSync(storeDir(), { recursive: true })
    writeFileSync(join(storeDir(), `${name}.json`), JSON.stringify(value), 'utf8')
  } catch (err) {
    console.error(`[navigatrum] failed to save ${name}:`, err)
  }
}

/** Write every pending buffer immediately (used on app quit). */
export function flushSync(): void {
  for (const name of Array.from(pending.keys())) {
    flush(name)
  }
}
