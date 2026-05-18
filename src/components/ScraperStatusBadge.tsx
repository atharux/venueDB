import { useCallback, useEffect, useRef, useState } from 'react'
import { pingScraperHealth, SCRAPER_BASE_LIST, type ScraperHealth } from '../scraper'

interface Props {
  /** Recheck cadence in ms. Defaults to 30s. Set to 0 to disable polling. */
  intervalMs?: number
}

/**
 * Small header badge that pings the scraper /health endpoint and shows
 * whether enrichment will work right now. Click to recheck on demand.
 *
 * States:
 *   "Checking…"            — first ping in flight
 *   "Local API connected"  — at least one backend answered /health
 *   "Scraper unavailable"  — every backend failed
 */
export function ScraperStatusBadge({ intervalMs = 30000 }: Props) {
  const [health, setHealth] = useState<ScraperHealth | null>(null)
  const [checking, setChecking] = useState(true)
  const mounted = useRef(true)

  const check = useCallback(async () => {
    setChecking(true)
    try {
      const r = await pingScraperHealth()
      if (mounted.current) setHealth(r)
    } finally {
      if (mounted.current) setChecking(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void check()
    if (intervalMs > 0) {
      const id = setInterval(() => void check(), intervalMs)
      return () => {
        mounted.current = false
        clearInterval(id)
      }
    }
    return () => {
      mounted.current = false
    }
  }, [check, intervalMs])

  const status: 'checking' | 'connected' | 'unavailable' =
    health == null && checking ? 'checking' : (health?.status ?? 'unavailable')

  const label =
    status === 'connected'
      ? 'Local API connected'
      : status === 'checking'
        ? 'Checking scraper…'
        : 'Scraper unavailable'

  const detail = (() => {
    if (status === 'connected' && health) {
      const caps: string[] = []
      if (health.hasSearch) caps.push('search')
      if (health.hasEnrich) caps.push('enrich')
      const capsStr = caps.length ? ` · ${caps.join(', ')}` : ''
      return `Connected to ${health.base}${capsStr}\nLast check: ${new Date(health.checkedAt).toLocaleTimeString()}\nClick to recheck.`
    }
    return `Tried: ${SCRAPER_BASE_LIST.join(', ')}${health?.error ? `\nLast error: ${health.error}` : ''}\nClick to recheck.`
  })()

  return (
    <button
      type="button"
      className={`scraper-status scraper-status-${status} ${checking ? 'is-checking' : ''}`}
      onClick={() => void check()}
      title={detail}
      aria-label={label}
    >
      <span className={`scraper-status-dot dot-${status}`} aria-hidden="true" />
      <span className="scraper-status-label">{label}</span>
    </button>
  )
}
