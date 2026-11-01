/**
 * NAVIGATRUM browser — main process entry point.
 * Navigate beyond ordinary.
 */
import { app, Menu, nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'

import { createMainWindow } from './window'
import { TabManager } from './tab-manager'
import { registerIpc } from './ipc'

const isDev = !app.isPackaged

function brandAsset(name: string): string {
  return fileURLToPath(new URL(`../../assets/brand/${name}`, import.meta.url))
}

/** Application menu: standard roles only; tab handling lives in accelerators. */
function installMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        ...(isDev
          ? ([{ role: 'toggleDevTools' }] as Electron.MenuItemConstructorOptions[])
          : [])
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Hardening that applies to every webContents the app ever creates. */
function installContentSecurity(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', event => {
      event.preventDefault()
    })

    // The chrome renderer must never top-level-navigate; tab views may.
    contents.on('will-navigate', event => {
      if (contents.getType() === 'window') event.preventDefault()
    })
  })

  app.on('web-contents-created', (_event, contents) => {
    // Deny permission popups by default until a settings screen exists.
    contents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  })
}

// One instance at a time: a second launch focuses the first window.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

let mainTabManager: TabManager | null = null
let mainWindow: Electron.BrowserWindow | null = null

app.on('second-instance', () => {
  const win = mainWindow
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

void app.whenReady().then(() => {
  installMenu()
  installContentSecurity()

  if (process.platform === 'darwin' && app.dock) {
    const icon = nativeImage.createFromPath(brandAsset('compass-512.png'))
    if (!icon.isEmpty()) app.dock.setIcon(icon)
  }

  mainWindow = createMainWindow()
  mainTabManager = new TabManager(mainWindow)

  mainWindow.on('resize', () => mainTabManager?.sync())
  mainWindow.on('enter-full-screen', () => mainTabManager?.sync())
  mainWindow.on('leave-full-screen', () => mainTabManager?.sync())

  registerIpc(mainTabManager)
  mainTabManager.create('', true)

  app.on('activate', () => {
    const win = mainWindow
    if (win && !win.isDestroyed()) win.show()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
