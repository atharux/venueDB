import { useState } from 'react'
import type { ScrapeResult } from '../types'
import { scrapeUrl, scraperEnabled } from '../scraper'

interface Props {
  url?: string
  onResult: (result: ScrapeResult) => void
}

export function ScrapeButton({ url, onResult }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handle = async () => {
    if (!url) return
    setBusy(true)
    setError(null)
    try {
      const r = await scrapeUrl(url)
      onResult(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!scraperEnabled) {
    return (
      <button
        className="scrape-btn disabled"
        title="Add VITE_SCRAPER_URL to .env to enable. See DEPLOY.md."
        disabled
      >
        Scrape (offline)
      </button>
    )
  }

  return (
    <div className="scrape-control">
      <button
        className="scrape-btn"
        onClick={handle}
        disabled={!url || busy}
        title={url ? `Fetch ${url} and extract contacts` : 'Add a website URL first'}
      >
        {busy ? 'Scraping…' : 'Scrape website'}
      </button>
      {error ? <div className="scrape-error">{error}</div> : null}
    </div>
  )
}
