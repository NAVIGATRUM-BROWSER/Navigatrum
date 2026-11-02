# NAVIGATRUM

> Navigate beyond ordinary.

NAVIGATRUM is an open-source, desktop browser built with **Electron**, **React**,
**TypeScript** and **Vite**. macOS first, with Windows and Linux planned.
Licensed under the [MIT License](LICENSE).

![Home screen](docs/screenshots/home.png)

## Core browsing (Milestone 2)

- **Real browser engine** — every tab is an independent `WebContentsView`
  rendering live web pages.
- **Multiple tabs** — create (`⌘T`), close (`⌘W`), switch (`⌘1`–`9`,
  `Ctrl+Tab`, click), middle-click to close. Middle-click links that open
  popups become new NAVIGATRUM tabs.
- **Address bar** — navigate URLs directly or search with the chosen
  default engine (`⌘L` to focus).
- **Navigation** — back (`⌘[`), forward (`⌘]`), reload (`⌘R`), stop,
  home, and a built-in new-tab/home screen with compass branding.
- **Loading indicators** — animated progress bar while any page loads.
- **Error pages** — self-contained dark-themed error screen with error code
  and working "Try again" recovery.
- **Secure by default** — `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, `webSecurity` on, a minimal typed `contextBridge` API,
  IPC validation in the main process, popups/`<webview>`/permissions denied
  unless explicitly handled.

![Tabs](docs/screenshots/tabs.png)

## Browser essentials (Milestone 3)

New in this milestone:

- **Bookmarks** — star the current page (or un-star it), open the bookmark
  menu from the toolbar, and remove or open saved bookmarks. Titles and URLs
  are stored locally and de-duplicated.
- **Browsing history** — every real page visit is recorded with a timestamp,
  backfilled with its page title, and searchable on the built-in History
  page (`⌘Y`). Delete individual entries or clear everything; internal
  pages and error states are never recorded.
- **Download manager** — downloads are handled by Electron's download APIs
  and saved silently (never overwriting an existing file). The Downloads
  page (`⌘J`) shows filename, size, live progress and status, with Open,
  Reveal in Finder, Cancel, and Clear actions; active downloads also show a
  live badge on the toolbar.
- **Persistent sessions** — tabs and the active tab are restored after a
  restart, can be disabled in Settings, and unavailable URLs land on the
  built-in error page.
- **Settings** (`⌘,`) — homepage selection (compass home or custom URL),
  default search engine (DuckDuckGo, Google, Bing, Brave), download folder,
  session-restore toggle, and clear-browsing-data controls (history, cache,
  downloads list).
- **Data isolation** — browser data (bookmarks, history, settings, session)
  lives in the app's own `userData/store/*.json`, never exposed to websites.

![Bookmarks menu](docs/screenshots/bookmarks.png)

![History page](docs/screenshots/history.png)

![Downloads page](docs/screenshots/downloads.png)

![Settings page](docs/screenshots/settings.png)

## Getting started

Requirements: **macOS 13+** (Intel or Apple Silicon), **Node.js ≥ 22.12**.

```bash
npm install        # install dependencies (downloads the Electron runtime)
npm run dev        # start NAVIGATRUM in development mode
```

### Scripts

| Script              | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Dev mode with hot reload for the chrome UI          |
| `npm run build`     | Production build (main + preload + renderer)        |
| `npm run start`     | Typecheck, production build, then launch the app    |
| `npm run typecheck` | TypeScript checks for main/preload and renderer     |

## Architecture

```
src/
├── main/         Electron main process
│   ├── index.ts          app bootstrap, session restore/save, quit flushing
│   ├── window.ts         hiddenInset BrowserWindow + secure webPreferences
│   ├── tab-manager.ts    WebContentsView tabs, history hooks, downloads
│   ├── ipc.ts            validated IPC surface (tabs/bookmarks/history/
│   │                     downloads/settings/data)
│   ├── navigation.ts     URL vs. search resolution (per chosen engine)
│   ├── downloads.ts      download registry, lifecycle, open/cancel/reveal
│   ├── history-store.ts  visit recording, titles, capped persistence
│   ├── bookmarks-store.ts
│   ├── settings-store.ts validated settings + search-engine table
│   ├── session-store.ts  saved tabs + active index
│   ├── store.ts          buffered JSON persistence with quit-time flush
│   └── error-page.ts     self-contained error page (data: URL)
├── preload/      sandboxed contextBridge exposing `window.navigatrum`
├── renderer/     React chrome: tab strip, toolbar, address bar, home
│                 screen, and the built-in history/downloads/settings pages
└── shared/       constants + types shared across processes
assets/brand/     compass artwork, generated macOS .icns
```

The chrome (tabs + toolbar + data pages) is the window's React renderer;
page content lives in one `WebContentsView` per tab in the main process.
Internal pages (`navigatrum://history|downloads|settings`) render directly
in the chrome, so back/forward history of web tabs stays untouched. The
renderer only ever receives plain state snapshots over IPC — it holds no
references to `webContents`, and every IPC handler re-validates its
arguments against the real registries.

![Error page](docs/screenshots/error-page.png)

## Roadmap

- [x] M1 — Electron + React + TypeScript + Vite foundation
- [x] M2 — Browser window, tabs, address bar, navigation
- [x] M3 — Bookmarks, history, downloads, persistent sessions, settings
- [ ] M4 — Compass branding polish + packaging
- [ ] M5 — AI Connections (secure provider/key management)
- [ ] M6 — AI sidebar & assistant
- [ ] M7 — Release engineering, docs, first GitHub release

## Contributing

PRs welcome. Keep commits scoped, run `npm run typecheck && npm run build`
before pushing, and never commit credentials or build output.
