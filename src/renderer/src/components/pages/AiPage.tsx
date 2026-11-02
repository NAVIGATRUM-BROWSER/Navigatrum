/**
 * navigatrum://ai — NAVIGATRUM AI. Placeholder shell for the upcoming
 * AI Connections milestone; the real assistant lands in M5/M6.
 */
import type { JSX } from 'react'

import { PageShell } from './PageShell'

export function AiPage(): JSX.Element {
  return (
    <PageShell title="NAVIGATRUM AI">
      <div className="ai-panel">
        <img src="./compass.png" alt="" className="ai-emblem" />
        <h2 className="ai-headline">AI Connections — coming soon</h2>
        <p className="ai-copy">
          Milestone 5 brings bring-your-own AI providers with keys stored
          encrypted on this device. No accounts. No cloud middlemen.
        </p>
        <p className="ai-status" aria-hidden>
          Crafting the onboard assistant…
        </p>
      </div>
    </PageShell>
  )
}
