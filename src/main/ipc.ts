/**
 * IPC surface exposed to the renderer.
 *
 * Every handler validates its arguments against the real registries:
 * unknown tab ids, oversized URLs and malformed payloads are rejected.
 * Secrets or Node APIs will never pass through this file.
 */
import {
  BrowserWindow,
  dialog,
  ipcMain,
  session
} from 'electron'

import { addBookmark, listBookmarks, removeBookmark } from './bookmarks-store'
import {
  connectAi,
  disconnectAi,
  getAiDefault,
  initAiConnections,
  listAiConnections,
  listAiModels,
  listAiProviders,
  replaceAiKey,
  setAiDefault
} from './ai/connections'
import {
  cancelDownload,
  clearFinished,
  listDownloads,
  openDownload,
  openDownloadsFolder,
  removeEntry,
  showInFolder,
  subscribe
} from './downloads'
import {
  clearHistory,
  listHistory,
  removeHistoryEntry
} from './history-store'
import { getSettings, updateSetting } from './settings-store'
import { TabManager } from './tab-manager'
import type { Settings } from '@shared/types'

const MAX_URL_LENGTH = 2048

function cleanUrl(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_URL_LENGTH) : ''
}

function cleanTabId(value: unknown, tabManager: TabManager): string | null {
  return typeof value === 'string' && tabManager.has(value) ? value : null
}

function cleanId(value: unknown, prefix: string): string | null {
  const ok =
    typeof value === 'string' &&
    value.length >= 3 &&
    value.length <= 64 &&
    value.startsWith(prefix)
  return ok ? value : null
}

const tabGuard = async (
  tabId: unknown,
  tabManager: TabManager,
  handler: (id: string) => void | Promise<void>
): Promise<void> => {
  const id = cleanTabId(tabId, tabManager)
  if (!id) throw new Error('Invalid tab id')
  await handler(id)
}

/** Shared so Touch Bar bookmark toggles refresh the renderer star as well. */
export function broadcastBookmarks(win: BrowserWindow): void {
  if (!win.isDestroyed()) win.webContents.send('data:bookmarks', listBookmarks())
}

export function registerIpc(tabManager: TabManager, win: BrowserWindow): void {
  // Live download progress for the toolbar badge + downloads page.
  subscribe(list => {
    if (!win.isDestroyed()) win.webContents.send('downloads:state', list)
  })

  /* ---------- Tabs (Milestone 2, unchanged surface) ---------- */

  ipcMain.handle('tabs:get', () => tabManager.snapshot())

  ipcMain.handle('tabs:create', (_event, url?: unknown) => {
    tabManager.create(cleanUrl(url), true)
  })

  ipcMain.handle('tabs:activate', (_event, id: unknown) =>
    tabGuard(id, tabManager, id2 => tabManager.activate(id2))
  )

  ipcMain.handle('tabs:close', (_event, id: unknown) =>
    tabGuard(id, tabManager, id2 => tabManager.close(id2))
  )

  ipcMain.handle('tabs:navigate', (_event, id: unknown, input: unknown) =>
    tabGuard(id, tabManager, id2 => tabManager.navigate(id2, cleanUrl(input)))
  )

  ipcMain.handle('tabs:back', (_event, id: unknown) =>
    tabGuard(id, tabManager, id2 => tabManager.back(id2))
  )

  ipcMain.handle('tabs:forward', (_event, id: unknown) =>
    tabGuard(id, tabManager, id2 => tabManager.forward(id2))
  )

  ipcMain.handle('tabs:reload', (_event, id: unknown) =>
    tabGuard(id, tabManager, id2 => tabManager.reload(id2))
  )

  ipcMain.handle('tabs:stop', (_event, id: unknown) =>
    tabGuard(id, tabManager, id2 => tabManager.stop(id2))
  )

  ipcMain.handle('tabs:home', (_event, id: unknown) =>
    tabGuard(id, tabManager, id2 => tabManager.goHome(id2))
  )

  /* ---------- Bookmarks ---------- */

  ipcMain.handle('bookmarks:list', () => listBookmarks())

  ipcMain.handle('bookmarks:add', (_event, url?: unknown, title?: unknown) => {
    addBookmark(cleanUrl(url), typeof title === 'string' ? title.slice(0, 200) : '')
    broadcastBookmarks(win)
  })

  ipcMain.handle('bookmarks:remove', (_event, id: unknown) => {
    const valid = cleanId(id, 'bm-')
    if (!valid) throw new Error('Invalid bookmark id')
    removeBookmark(valid)
    broadcastBookmarks(win)
  })

  /* ---------- History ---------- */

  ipcMain.handle('history:list', () => listHistory())

  ipcMain.handle('history:remove', (_event, id: unknown) => {
    const valid = cleanId(id, 'h-')
    if (!valid) throw new Error('Invalid history id')
    removeHistoryEntry(valid)
  })

  ipcMain.handle('history:clear', () => {
    clearHistory()
  })

  /* ---------- Downloads ---------- */

  ipcMain.handle('downloads:list', () => listDownloads())

  ipcMain.handle('downloads:open', (_event, id: unknown) => {
    const valid = cleanId(id, 'dl-')
    if (!valid || !openDownload(valid)) throw new Error('Download not ready')
  })

  ipcMain.handle(
    'downloads:showInFolder',
    (_event, id: unknown) => {
      const valid = cleanId(id, 'dl-')
      if (!valid || !showInFolder(valid)) throw new Error('File not found')
    }
  )

  ipcMain.handle('downloads:cancel', (_event, id: unknown) => {
    const valid = cleanId(id, 'dl-')
    if (!valid) throw new Error('Invalid download id')
    cancelDownload(valid)
  })

  ipcMain.handle('downloads:removeEntry', (_event, id: unknown) => {
    const valid = cleanId(id, 'dl-')
    if (!valid) throw new Error('Invalid download id')
    removeEntry(valid)
  })

  ipcMain.handle('downloads:openFolder', () => {
    void openDownloadsFolder()
  })

  /* ---------- Settings ---------- */

  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.handle(
    'settings:set',
    (_event, key: unknown, value: unknown) => {
      const keys: Array<keyof Settings> = [
        'homepage',
        'searchEngine',
        'downloadPath',
        'restoreSession',
        'saveHistory'
      ]
      if (typeof key !== 'string' || !keys.includes(key as keyof Settings)) {
        throw new Error('Invalid setting key')
      }
      updateSetting(key as keyof Settings, value)
    }
  )

  ipcMain.handle('settings:pickDownloadFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose download folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getSettings().downloadPath || undefined
    })
    if (result.canceled || result.filePaths.length !== 1) return null
    const next = result.filePaths[0]
    updateSetting('downloadPath', next)
    return next
  })

  /* ---------- Clear browsing data ---------- */

  ipcMain.handle('data:clearCache', async () => {
    await session.defaultSession.clearCache()
  })

  ipcMain.handle('data:clearDownloads', () => {
    clearFinished()
  })

  /* ---------- AI Connections (Milestone 5) ---------- */

  const MAX_KEY_LENGTH = 2048
  const MAX_BASE_URL_LENGTH = 2048

  const cleanKey = (value: unknown): string =>
    typeof value === 'string' ? value.slice(0, MAX_KEY_LENGTH) : ''
  const cleanBaseUrl = (value: unknown): string =>
    typeof value === 'string' ? value.slice(0, MAX_BASE_URL_LENGTH) : ''
  const cleanProviderId = (value: unknown): string | null =>
    typeof value === 'string' && value.length <= 32 && value.trim() !== ''
      ? value
      : null

  // Connections (init) live in the main process; the renderer only ever
  // sees sanitized metadata — key material never crosses IPC.
  initAiConnections()

  ipcMain.handle('ai:providers', () => listAiProviders())

  ipcMain.handle(
    'ai:connect',
    (_event, providerId: unknown, apiKey: unknown, baseUrl: unknown) => {
      const id = cleanProviderId(providerId)
      if (!id) throw new Error('Invalid provider id')
      return connectAi(id, cleanKey(apiKey), cleanBaseUrl(baseUrl))
    }
  )

  ipcMain.handle(
    'ai:replaceKey',
    (_event, providerId: unknown, apiKey: unknown) => {
      const id = cleanProviderId(providerId)
      if (!id) throw new Error('Invalid provider id')
      return replaceAiKey(id, cleanKey(apiKey))
    }
  )

  ipcMain.handle('ai:connections', () => listAiConnections())

  ipcMain.handle('ai:disconnect', (_event, providerId: unknown) => {
    const id = cleanProviderId(providerId)
    if (!id) throw new Error('Invalid provider id')
    return disconnectAi(id)
  })

  ipcMain.handle('ai:models', (_event, providerId: unknown) => {
    const id = cleanProviderId(providerId)
    if (!id) throw new Error('Invalid provider id')
    return listAiModels(id)
  })

  ipcMain.handle('ai:getDefault', () => getAiDefault())

  ipcMain.handle(
    'ai:setDefault',
    (_event, providerId: unknown, modelId: unknown) => {
      const id = cleanProviderId(providerId)
      const model =
        typeof modelId === 'string' && modelId.length <= 256
          ? modelId
          : null
      if (!id || model === null) throw new Error('Invalid AI default')
      return setAiDefault(id, model)
    }
  )
}
