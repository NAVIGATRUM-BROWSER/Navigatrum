/**
 * Built-in Home screen ("New Tab"): compass branding, tagline and a real
 * search box wired to the same navigation pipeline as the address bar.
 */
import { FormEvent, useEffect, useRef, useState, type JSX } from 'react'

interface HomeScreenProps {
  /** Navigate the active tab (URL or DuckDuckGo search) from the Home input. */
  onSubmit: (value: string) => void
}

export function HomeScreen({ onSubmit }: HomeScreenProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')

  // Focus the search box whenever a fresh Home screen appears (⌘T).
  useEffect(() => {
    inputRef.current?.focus()
    return () => {
      inputRef.current?.blur()
    }
  }, [])

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const value = query.trim()
    if (value === '') return
    onSubmit(value)
  }

  return (
    <main className="home">
      <div className="home-glow" aria-hidden />
      <img className="home-compass" src="./compass.png" alt="" />
      <h1 className="home-title">NAVIGATRUM</h1>
      <p className="home-tagline">Navigate beyond ordinary.</p>

      <form className="home-search" onSubmit={submit}>
        <input
          ref={inputRef}
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="Search or enter a URL"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <button type="submit" aria-label="Search">
          →
        </button>
      </form>

      <div className="home-hints">
        <span className="hint-chip">
          <kbd>⌘T</kbd> new tab
        </span>
        <span className="hint-chip">
          <kbd>⌘L</kbd> address
        </span>
        <span className="hint-chip">
          <kbd>⌘Y</kbd> history
        </span>
        <span className="hint-chip">
          <kbd>⌘J</kbd> downloads
        </span>
        <span className="hint-chip">
          <kbd>⌘,</kbd> settings
        </span>
      </div>
    </main>
  )
}
