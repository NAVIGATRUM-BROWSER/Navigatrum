/**
 * Top window chrome: brand mark, tab strip, new-tab button.
 * This region drags the window; all controls opt out individually.
 */
import type { JSX } from 'react'

import type { TabsSnapshot } from '@shared/types'

interface TitleBarProps {
  snapshot: TabsSnapshot
}

export function TitleBar({ snapshot }: TitleBarProps): JSX.Element {
  return (
    <header className="titlebar">
      <div className="brand">
        <img className="brand-mark" src="./compass.jpeg" alt="NAVIGATRUM" />
        <span className="brand-name">NAVIGATRUM</span>
      </div>

      <div className="tabstrip" role="tablist">
        {snapshot.tabs.map(tab => {
          const active = tab.id === snapshot.activeId
          const isHome = tab.url === ''
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={-1}
              className={active ? 'tab active' : 'tab'}
              onClick={() => void window.navigatrum.activateTab(tab.id)}
              onAuxClick={event => {
                if (event.button === 1) void window.navigatrum.closeTab(tab.id)
              }}
            >
              <span
                className="tab-dot"
                style={{
                  background: isHome
                    ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                    : tabTitleHue(tab)
                }}
              />
              <span className="tab-title">
                {tab.loading ? 'Loading…' : tabTitle(tab)}
              </span>
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${tabTitle(tab)}`}
                onClick={event => {
                  event.stopPropagation()
                  void window.navigatrum.closeTab(tab.id)
                }}
              >
                ×
              </button>
            </div>
          )
        })}

        <button
          type="button"
          className="tab-new"
          aria-label="New tab"
          title="New tab (⌘T)"
          onClick={() => void window.navigatrum.createTab()}
        >
          +
        </button>
      </div>
    </header>
  )
}

function tabTitle(tab: TabsSnapshot['tabs'][number]): string {
  if (tab.error) return 'Error'
  if (tab.url === '') return 'New Tab'
  if (tab.title) return tab.title
  try {
    return new URL(tab.url).host
  } catch {
    return tab.url
  }
}

function tabTitleHue(tab: TabsSnapshot['tabs'][number]): string {
  let hash = 0
  for (const ch of tab.id) hash = (hash * 31 + ch.codePointAt(0)!) | 0
  const hue = Math.abs(hash) % 360
  return `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue + 40) % 360} 70% 55%))`
}
