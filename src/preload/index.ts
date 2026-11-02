/**
 * NAVIGATRUM preload bridge.
 *
 * Runs in the sandboxed renderer context and exposes exactly one typed API
 * (`window.navigatrum`) through contextBridge — no Node APIs, no raw
 * ipcRenderer, no secrets ever cross this boundary.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { NaviApi, TabsSnapshot } from '@shared/types'

function subscribe<T>(
  channel: string,
  listener: (payload: T) => void
): () => void {
  const wrapped = (_event: unknown, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.off(channel, wrapped)
}

const api: NaviApi = {
  /* Tabs */
  getSnapshot: () => ipcRenderer.invoke('tabs:get'),
  createTab: (url?: string) => ipcRenderer.invoke('tabs:create', url),
  closeTab: (id: string) => ipcRenderer.invoke('tabs:close', id),
  activateTab: (id: string) => ipcRenderer.invoke('tabs:activate', id),
  navigate: (id: string, input: string) =>
    ipcRenderer.invoke('tabs:navigate', id, input),
  back: (id: string) => ipcRenderer.invoke('tabs:back', id),
  forward: (id: string) => ipcRenderer.invoke('tabs:forward', id),
  reload: (id: string) => ipcRenderer.invoke('tabs:reload', id),
  stop: (id: string) => ipcRenderer.invoke('tabs:stop', id),
  goHome: (id: string) => ipcRenderer.invoke('tabs:home', id),
  onSnapshot: (listener: (snapshot: TabsSnapshot) => void) =>
    subscribe<TabsSnapshot>('tabs:state', listener),
  onFocusAddress: (listener: () => void) =>
    subscribe<undefined>('ui:focus-address', listener),

  /* Bookmarks */
  addBookmark: (url, title) => ipcRenderer.invoke('bookmarks:add', url, title),
  removeBookmark: id => ipcRenderer.invoke('bookmarks:remove', id),
  listBookmarks: () => ipcRenderer.invoke('bookmarks:list'),
  onBookmarks: listener => subscribe('data:bookmarks', listener),

  /* History */
  listHistory: () => ipcRenderer.invoke('history:list'),
  removeHistoryEntry: id => ipcRenderer.invoke('history:remove', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  /* Downloads */
  listDownloads: () => ipcRenderer.invoke('downloads:list'),
  openDownload: id => ipcRenderer.invoke('downloads:open', id),
  showInFolder: id => ipcRenderer.invoke('downloads:showInFolder', id),
  cancelDownload: id => ipcRenderer.invoke('downloads:cancel', id),
  removeDownloadEntry: id => ipcRenderer.invoke('downloads:removeEntry', id),
  openDownloadsFolder: () => ipcRenderer.invoke('downloads:openFolder'),
  onDownloads: listener => subscribe('downloads:state', listener),

  /* Settings */
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  pickDownloadFolder: () => ipcRenderer.invoke('settings:pickDownloadFolder'),

  /* Clearing browsing data */
  clearCache: () => ipcRenderer.invoke('data:clearCache'),
  clearFinishedDownloads: () =>
    ipcRenderer.invoke('data:clearDownloads')
}

contextBridge.exposeInMainWorld('navigatrum', api)
