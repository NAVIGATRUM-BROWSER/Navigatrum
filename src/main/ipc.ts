/**
 * IPC surface exposed to the renderer.
 *
 * Every handler validates its arguments against the real tab registry:
 * unknown tab ids, oversized URLs and malformed payloads are rejected.
 * API keys or other secrets will never pass through this file.
 */
import { ipcMain } from 'electron'

import { TabManager } from './tab-manager'

const MAX_URL_LENGTH = 2048

function cleanUrl(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_URL_LENGTH) : ''
}

function cleanTabId(value: unknown, tabManager: TabManager): string | null {
  return typeof value === 'string' && tabManager.has(value) ? value : null
}

export function registerIpc(tabManager: TabManager): void {
  const guard = async (
    tabId: unknown,
    handler: (id: string) => void | Promise<void>
  ): Promise<void> => {
    const id = cleanTabId(tabId, tabManager)
    if (!id) throw new Error('Invalid tab id')
    await handler(id)
  }

  ipcMain.handle('tabs:get', () => tabManager.snapshot())

  ipcMain.handle('tabs:create', (_event, url?: unknown) => {
    tabManager.create(cleanUrl(url), true)
  })

  ipcMain.handle('tabs:activate', (_event, id: unknown) =>
    guard(id, id2 => tabManager.activate(id2))
  )

  ipcMain.handle('tabs:close', (_event, id: unknown) =>
    guard(id, id2 => tabManager.close(id2))
  )

  ipcMain.handle('tabs:navigate', (_event, id: unknown, input: unknown) =>
    guard(id, validId => tabManager.navigate(validId, cleanUrl(input)))
  )

  ipcMain.handle('tabs:back', (_event, id: unknown) =>
    guard(id, id2 => tabManager.back(id2))
  )

  ipcMain.handle('tabs:forward', (_event, id: unknown) =>
    guard(id, id2 => tabManager.forward(id2))
  )

  ipcMain.handle('tabs:reload', (_event, id: unknown) =>
    guard(id, id2 => tabManager.reload(id2))
  )

  ipcMain.handle('tabs:stop', (_event, id: unknown) =>
    guard(id, id2 => tabManager.stop(id2))
  )

  ipcMain.handle('tabs:home', (_event, id: unknown) =>
    guard(id, id2 => tabManager.goHome(id2))
  )
}
