/**
 * navigatrum://settings — homepage, search engine, download location,
 * session + history toggles, and clear-browsing-data controls.
 * Every write goes through the validated IPC and is re-read back from the
 * main process so the UI always shows the persisted truth.
 */
import { useEffect, useState, type JSX } from 'react'

import type { SearchEngineId, Settings } from '@shared/types'

import { PageShell } from './PageShell'

const ENGINES: Array<{ id: SearchEngineId; name: string }> = [
  { id: 'duckduckgo', name: 'DuckDuckGo' },
  { id: 'google', name: 'Google' },
  { id: 'bing', name: 'Bing' },
  { id: 'brave', name: 'Brave' }
]

export function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [homepageDraft, setHomepageDraft] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    void window.navigatrum.getSettings().then(loaded => {
      setSettings(loaded)
      setHomepageDraft(loaded.homepage === 'builtin' ? '' : loaded.homepage)
    })
  }, [])

  const save = async <K extends keyof Settings>(
    key: K,
    value: Settings[K]
  ): Promise<void> => {
    await window.navigatrum.setSetting(key, value)
    const fresh = await window.navigatrum.getSettings()
    setSettings(fresh)
    setHomepageDraft(fresh.homepage === 'builtin' ? '' : fresh.homepage)
  }

  const flash = (message: string): void => {
    setFeedback(message)
    window.setTimeout(() => setFeedback(''), 2000)
  }

  if (!settings) {
    return (
      <PageShell title="Settings">
        <div className="empty-state">Loading…</div>
      </PageShell>
    )
  }

  const customHomepage = settings.homepage !== 'builtin'

  return (
    <PageShell
      title="Settings"
      actions={
        feedback ? <span className="settings-feedback">{feedback}</span> : null
      }
    >
      {/* Homepage */}
      <section className="settings-section">
        <h2 className="section-title">Homepage</h2>
        <div className="section-body">
          <label className="setting-row">
            <span className="setting-text">Home button opens</span>
            <select
              className="setting-select"
              value={settings.homepage === 'builtin' ? 'builtin' : 'custom'}
              onChange={event => {
                const next = event.target.value
                void save(
                  'homepage',
                  next === 'builtin'
                    ? 'builtin'
                    : homepageDraft.trim() || 'https://duckduckgo.com/'
                )
              }}
            >
              <option value="builtin">NAVIGATRUM home screen</option>
              <option value="custom">Custom URL</option>
            </select>
          </label>
          <label className="setting-row">
            <span className="setting-text">Custom homepage URL</span>
            <input
              className="setting-input"
              type="text"
              spellCheck={false}
              disabled={!customHomepage}
              placeholder="https://example.com"
              value={homepageDraft}
              onChange={event => setHomepageDraft(event.target.value)}
              onBlur={() => {
                const value = homepageDraft.trim()
                if (customHomepage && value !== '' && value !== settings.homepage) {
                  void save('homepage', value)
                }
              }}
            />
          </label>
        </div>
      </section>

      {/* Search engine */}
      <section className="settings-section">
        <h2 className="section-title">Search</h2>
        <div className="section-body">
          <label className="setting-row">
            <span className="setting-text">Default search engine</span>
            <select
              className="setting-select"
              value={settings.searchEngine}
              onChange={event =>
                void save('searchEngine', event.target.value as SearchEngineId)
              }
            >
              {ENGINES.map(engine => (
                <option key={engine.id} value={engine.id}>
                  {engine.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Downloads */}
      <section className="settings-section">
        <h2 className="section-title">Downloads</h2>
        <div className="section-body">
          <div className="setting-row">
            <span className="setting-text">
              {settings.downloadPath === ''
                ? 'Save files to the default Downloads folder'
                : `Save files to ${settings.downloadPath}`}
            </span>
            <div className="setting-buttons">
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  void window.navigatrum.pickDownloadFolder().then(async chosen => {
                    if (chosen === null) return
                    setSettings(await window.navigatrum.getSettings())
                    flash('Download location updated')
                  })
                }}
              >
                Choose folder…
              </button>
              <button
                type="button"
                className="btn ghost small"
                disabled={settings.downloadPath === ''}
                onClick={() => void save('downloadPath', '')}
              >
                Use default
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Toggles */}
      <section className="settings-section">
        <h2 className="section-title">Privacy &amp; sessions</h2>
        <div className="section-body">
          <label className="setting-row">
            <span className="setting-text">
              Restore tabs when NAVIGATRUM starts
            </span>
            <span className="toggle">
              <input
                type="checkbox"
                checked={settings.restoreSession}
                onChange={event =>
                  void save('restoreSession', event.target.checked)
                }
              />
              <span className="track" aria-hidden />
            </span>
          </label>
          <label className="setting-row">
            <span className="setting-text">Save browsing history</span>
            <span className="toggle">
              <input
                type="checkbox"
                checked={settings.saveHistory}
                onChange={event => void save('saveHistory', event.target.checked)}
              />
              <span className="track" aria-hidden />
            </span>
          </label>
        </div>
      </section>

      {/* Clear data */}
      <section className="settings-section danger">
        <h2 className="section-title">Clear browsing data</h2>
        <div className="section-body">
          <div className="setting-row">
            <span className="setting-text">History</span>
            <button
              type="button"
              className="btn danger small"
              onClick={() => {
                if (!window.confirm('Clear all browsing history?')) return
                void window.navigatrum.clearHistory().then(() => flash('History cleared'))
              }}
            >
              Clear history
            </button>
          </div>
          <div className="setting-row">
            <span className="setting-text">Cached files</span>
            <button
              type="button"
              className="btn danger small"
              onClick={() =>
                void window.navigatrum.clearCache().then(() => flash('Cache cleared'))
              }
            >
              Clear cache
            </button>
          </div>
          <div className="setting-row">
            <span className="setting-text">Finished downloads from the list</span>
            <button
              type="button"
              className="btn danger small"
              onClick={() =>
                void window.navigatrum
                  .clearFinishedDownloads()
                  .then(() => flash('Downloads list cleared'))
              }
            >
              Clear downloads list
            </button>
          </div>
        </div>
      </section>
    </PageShell>
  )
}
