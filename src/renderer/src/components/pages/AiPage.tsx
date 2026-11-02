/**
 * navigatrum://ai — AI Connections.
 *
 * The unified provider connection surface (Milestone 5). Keys are typed
 * here ONCE, sent over validated IPC to the main process, verified
 * against the provider's official API, encrypted through safeStorage and
 * held in the main process only. The UI never sees key material again —
 * just sanitized connection metadata.
 */
import { useCallback, useEffect, useState, type JSX } from 'react'

import type {
  AiConnectionInfo,
  AiDefault,
  AiModelInfo,
  AiProviderInfo
} from '@shared/types'

import { PageShell, formatTime } from './PageShell'

type Phase =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'error'; message: string }

export function AiPage(): JSX.Element {
  const [providers, setProviders] = useState<AiProviderInfo[]>([])
  const [connections, setConnections] = useState<AiConnectionInfo[]>([])
  const [aiDefault, setAiDefault] = useState<AiDefault>({
    providerId: null,
    modelId: null
  })

  /* Connect form */
  const [providerChoice, setProviderChoice] = useState('auto')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [verifiedAt, setVerifiedAt] = useState(0)

  /* Replace-key flow */
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null)
  const [replaceKey, setReplaceKey] = useState('')
  const [replacePhase, setReplacePhase] = useState<Phase>({ kind: 'idle' })

  /* Default model section */
  const [modelProvider, setModelProvider] = useState<string>('')
  const [models, setModels] = useState<AiModelInfo[]>([])
  const [modelsPhase, setModelsPhase] = useState<Phase>({ kind: 'idle' })

  const selected =
    providers.find(p => p.id === providerChoice) ?? null

  const refreshConnections = useCallback(async (): Promise<void> => {
    const [list, current] = await Promise.all([
      window.navigatrum.listAiConnections(),
      window.navigatrum.getAiDefault()
    ])
    setConnections(list)
    setAiDefault(current)
    setModelProvider(current.providerId ?? list[0]?.providerId ?? '')
  }, [])

  useEffect(() => {
    void window.navigatrum.listAiProviders().then(setProviders)
    void refreshConnections()
  }, [refreshConnections])

  /* Load models when the model-picker's provider changes. */
  useEffect(() => {
    if (modelProvider === '') {
      setModels([])
      return
    }
    let alive = true
    setModelsPhase({ kind: 'working' })
    void window.navigatrum.listAiModels(modelProvider).then(result => {
      if (!alive) return
      if (result.ok && result.data) {
        setModels(result.data)
        setModelsPhase({ kind: 'idle' })
      } else {
        setModels([])
        setModelsPhase({
          kind: 'error',
          message: result.error?.message ?? 'Could not list models'
        })
      }
    })
    return () => {
      alive = false
    }
  }, [modelProvider, connections])

  const connect = async (): Promise<void> => {
    setPhase({ kind: 'working' })
    const result = await window.navigatrum.connectAi(
      providerChoice,
      apiKey,
      providerChoice === 'auto' ? '' : baseUrl
    )
    if (result.ok && result.data) {
      setPhase({
        kind: 'idle'
      })
      setVerifiedAt(result.data.verifiedAt)
      setApiKey('')
      await refreshConnections()
      if (result.data.verifiedAt > 0) {
        window.setTimeout(() => setVerifiedAt(0), 4000)
      }
    } else {
      setPhase({
        kind: 'error',
        message: result.error?.message ?? 'Connection failed'
      })
    }
  }

  const disconnect = async (providerId: string): Promise<void> => {
    await window.navigatrum.disconnectAi(providerId)
    if (replaceTarget === providerId) {
      setReplaceTarget(null)
      setReplaceKey('')
    }
    await refreshConnections()
  }

  const replace = async (providerId: string): Promise<void> => {
    setReplacePhase({ kind: 'working' })
    const result = await window.navigatrum.replaceAiKey(
      providerId,
      replaceKey
    )
    if (result.ok) {
      setReplacePhase({ kind: 'idle' })
      setReplaceTarget(null)
      setReplaceKey('')
      await refreshConnections()
    } else {
      setReplacePhase({
        kind: 'error',
        message: result.error?.message ?? 'Verification failed'
      })
    }
  }

  const saveDefault = async (modelId: string): Promise<void> => {
    if (modelProvider === '') return
    const result = await window.navigatrum.setAiDefault(
      modelProvider,
      modelId
    )
    if (result.ok && result.data) setAiDefault(result.data)
  }

  const defaultProviderLabel =
    providers.find(p => p.id === aiDefault.providerId)?.label ??
    aiDefault.providerId ??
    '—'

  const isDefault = (providerId: string): boolean =>
    aiDefault.providerId === providerId

  return (
    <PageShell
      title="AI Connections"
      actions={
        aiDefault.providerId ? (
          <span className="settings-feedback">
            Default: {defaultProviderLabel}
            {aiDefault.modelId ? ` · ${aiDefault.modelId}` : ''}
          </span>
        ) : (
          <span className="settings-feedback">No AI provider connected yet</span>
        )
      }
    >
      {/* Connect */}
      <section className="settings-section">
        <h2 className="section-title">Connect a provider</h2>
        <div className="section-body ai-connect">
          <div className="ai-connect-row">
            <select
              className="setting-select"
              value={providerChoice}
              onChange={event => {
                setProviderChoice(event.target.value)
                setBaseUrl('')
                setPhase({ kind: 'idle' })
              }}
            >
              <option value="auto">✨ Detect automatically (from key prefix)</option>
              {providers.map(provider => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                  {provider.local ? ' — local' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="ai-connect-row">
            {selected?.localOnly ? (
              <input
                className="ai-key-input"
                type="text"
                value=""
                placeholder="No API key needed — runs on this machine"
                disabled
                readOnly
              />
            ) : selected?.customBaseUrl ? (
              <input
                className="ai-key-input"
                type="text"
                value={apiKey}
                placeholder={
                  selected.id === 'custom'
                    ? 'API key (optional for some servers)'
                    : 'API key'
                }
                onChange={event => setApiKey(event.target.value)}
              />
            ) : (
              <input
                className="ai-key-input"
                type="password"
                value={apiKey}
                placeholder={`Paste your ${selected?.label ?? 'provider'} API key`}
                onChange={event => setApiKey(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') void connect()
                }}
              />
            )}
          </div>

          {selected?.customBaseUrl ? (
            <div className="ai-connect-row">
              <input
                className="ai-key-input"
                type="text"
                value={baseUrl}
                placeholder={`Base URL (e.g. ${selected.defaultBaseUrl || 'http://localhost:8080/v1'})`}
                onChange={event => setBaseUrl(event.target.value)}
              />
            </div>
          ) : null}

          <div className="ai-connect-row ai-connect-actions">
            <button
              className="btn"
              onClick={() => {
                void connect()
              }}
              disabled={phase.kind === 'working'}
            >
              {phase.kind === 'working' ? 'Verifying…' : 'Connect'}
            </button>
            {selected && !selected.localOnly && selected.signupUrl !== '' ? (
              <a
                className="ai-hint-link"
                href={selected.signupUrl}
                target="_blank"
                rel="noreferrer"
              >
                Get a {selected.label} key ↗
              </a>
            ) : null}
          </div>

          {verifiedAt > 0 ? (
            <p className="ai-status-row ok">
              ✓ Connected — verified against {selected?.label ?? providerChoice}{' '}
              at {formatTime(verifiedAt)}
            </p>
          ) : phase.kind === 'error' ? (
            <p className="ai-status-row fail">⚠ {phase.message}</p>
          ) : null}
          <p className="ai-hint">
            Keys are verified against the provider's official API and stored
            encrypted (macOS Keychain). They never leave the browser's own
            profile, and each key is only ever sent to its own provider.
          </p>
        </div>
      </section>

      {/* Connected providers */}
      <section className="settings-section">
        <h2 className="section-title">Connected providers</h2>
        <div className="section-body">
          {connections.length === 0 ? (
            <div className="empty-state">No providers connected yet</div>
          ) : (
            <ul className="ai-connection-list">
              {connections.map(connection => (
                <li
                  key={connection.providerId}
                  className={`ai-connection-row${isDefault(connection.providerId) ? ' default' : ''}`}
                >
                  <div className="ai-connection-main">
                    <span className="ai-connection-label">
                      {connection.label}
                    </span>
                    <span className="ai-connection-badges">
                      {connection.local ? (
                        <span className="badge local">Local</span>
                      ) : (
                        <span className="badge cloud">Cloud</span>
                      )}
                      {isDefault(connection.providerId) ? (
                        <span className="badge default">Default</span>
                      ) : null}
                      <span className="ai-verified">
                        verified {formatTime(connection.verifiedAt)}
                        {connection.modelsCount > 0
                          ? ` · ${connection.modelsCount} models`
                          : ''}
                      </span>
                    </span>
                  </div>
                  <div className="ai-connection-actions">
                    <button
                      className="btn ghost"
                      onClick={() => {
                        void window.navigatrum
                          .listAiConnections()
                          .then(() => {
                            setModelProvider(connection.providerId)
                          })
                      }}
                    >
                      Models
                    </button>
                    {connection.local ? null : (
                      <button
                        className="btn ghost"
                        onClick={() => {
                          setReplaceTarget(connection.providerId)
                          setReplaceKey('')
                          setReplacePhase({ kind: 'idle' })
                        }}
                      >
                        Replace key
                      </button>
                    )}
                    <button
                      className="btn ghost danger"
                      onClick={() => {
                        void disconnect(connection.providerId)
                      }}
                    >
                      Disconnect
                    </button>
                  </div>

                  {replaceTarget === connection.providerId ? (
                    <div className="ai-replace-row">
                      <input
                        className="ai-key-input"
                        type="password"
                        value={replaceKey}
                        autoFocus
                        placeholder="New API key"
                        onChange={event => setReplaceKey(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') void replace(connection.providerId)
                        }}
                      />
                      <button
                        className="btn"
                        onClick={() => {
                          void replace(connection.providerId)
                        }}
                        disabled={replacePhase.kind === 'working'}
                      >
                        {replacePhase.kind === 'working'
                          ? 'Verifying…'
                          : 'Verify & swap'}
                      </button>
                      {replacePhase.kind === 'error' ? (
                        <span className="ai-status-row fail inline">
                          ⚠ {replacePhase.message}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Default model */}
      <section className="settings-section">
        <h2 className="section-title">Default provider & model</h2>
        <div className="section-body">
          <div className="ai-connect-row">
            <select
              className="setting-select"
              value={modelProvider}
              onChange={event => setModelProvider(event.target.value)}
            >
              <option value="">Choose a connected provider…</option>
              {connections.map(connection => (
                <option key={connection.providerId} value={connection.providerId}>
                  {connection.label}
                  {connection.local ? ' — local' : ''}
                </option>
              ))}
            </select>
          </div>

          {modelProvider !== '' && modelsPhase.kind === 'working' ? (
            <div className="empty-state">Loading models…</div>
          ) : modelProvider !== '' && modelsPhase.kind === 'error' ? (
            <p className="ai-status-row fail">⚠ {modelsPhase.message}</p>
          ) : modelProvider !== '' && models.length > 0 ? (
            <div className="ai-connect-row">
              <select
                className="setting-select"
                value={
                  aiDefault.providerId === modelProvider &&
                  aiDefault.modelId !== null
                    ? aiDefault.modelId
                    : ''
                }
                onChange={event => {
                  void saveDefault(event.target.value)
                }}
              >
                <option value="">Choose a model…</option>
                {models.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                    {model.local ? ' — local' : ' — cloud'}
                  </option>
                ))}
              </select>
            </div>
          ) : modelProvider !== '' ? (
            <div className="empty-state">No models returned by this provider</div>
          ) : null}
        </div>
      </section>
    </PageShell>
  )
}
