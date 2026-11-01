/**
 * Main window creation. The chrome (React renderer) draws the whole top
 * area — tab strip and toolbar — with titleBarStyle 'hiddenInset' so the
 * macOS traffic lights stay native.
 */
import { BrowserWindow } from 'electron'
import { join } from 'node:path'

import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH
} from '@shared/constants'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: 'NAVIGATRUM',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0d16',
    show: false,
    webPreferences: {
      // Electron secure defaults, stated explicitly on purpose.
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  // Keep the window title ours, even as tabs change.
  win.on('page-title-updated', event => {
    event.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
