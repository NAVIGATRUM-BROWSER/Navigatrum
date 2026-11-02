/**
 * Shared shell for NAVIGATRUM's internal pages (history / downloads /
 * settings). Renders in the chrome renderer instead of a web view.
 */
import type { ReactNode, JSX } from 'react'

interface PageShellProps {
  title: string
  actions?: ReactNode
  children: ReactNode
}

export function PageShell({
  title,
  actions,
  children
}: PageShellProps): JSX.Element {
  return (
    <main className="data-page">
      <header className="page-header">
        <h1 className="page-title">{title}</h1>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </header>
      <div className="page-body">{children}</div>
    </main>
  )
}

export function EmptyState({ text }: { text: string }): JSX.Element {
  return (
    <div className="empty-state">
      <span className="empty-dot" aria-hidden />
      {text}
    </div>
  )
}

/** e.g. "Nov 1, 2:45 PM" */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

/** Human-readable byte sizes: 0 → '' (unknown). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = n
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const text = unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)
  return `${text} ${units[unit]}`
}
