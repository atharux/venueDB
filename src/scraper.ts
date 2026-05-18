// Client for the Cloudflare Worker scraper.
// If VITE_SCRAPER_URL is set, calls the worker. Otherwise returns a disabled state.

import type { ScrapeResult } from './types'

const SCRAPER_URL = import.meta.env.VITE_SCRAPER_URL as string | undefined
const SCRAPER_BASES = SCRAPER_URL ? [SCRAPER_URL] : ['/api', 'http://localhost:8787']

export const SCRAPER_BASE_LIST: readonly string[] = SCRAPER_BASES
export const scraperEnabled = true

/**
 * Ping the scraper backends in order. Returns the first base that answers
 * /health with HTTP 2xx. Used by the connection-status badge in the header
 * so the user knows whether enrichment will work before launching a long
 * import. Pure read; no side effects on app state.
 */
export interface ScraperHealth {
  status: 'connected' | 'unavailable'
  base: string | null
  hasSearch?: boolean
  hasEnrich?: boolean
  triedBases: readonly string[]
  checkedAt: string
  error?: string
}

export async function pingScraperHealth(timeoutMs = 2500): Promise<ScraperHealth> {
  const checkedAt = new Date().toISOString()
  let lastError = ''
  for (const base of SCRAPER_BASES) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(`${base.replace(/\/$/, '')}/health`, {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) {
        lastError = `${base} → ${res.status}`
        continue
      }
      let payload: { hasSearch?: boolean; hasEnrich?: boolean } | null = null
      try {
        payload = (await res.json()) as { hasSearch?: boolean; hasEnrich?: boolean }
      } catch {
        payload = null
      }
      return {
        status: 'connected',
        base,
        hasSearch: payload?.hasSearch,
        hasEnrich: payload?.hasEnrich,
        triedBases: SCRAPER_BASES,
        checkedAt,
      }
    } catch (err) {
      lastError = `${base} → ${err instanceof Error ? err.message : String(err)}`
    }
  }
  return {
    status: 'unavailable',
    base: null,
    triedBases: SCRAPER_BASES,
    checkedAt,
    error: lastError || 'No /health response from any backend',
  }
}

export interface AiScraperOptions {
  openRouterApiKey?: string
  openRouterModel?: string
}

export interface EnrichmentResult {
  website?: string
  instagram?: string
  email?: string
  phone?: string
  notes?: string
  model?: string
  // Mirrors scraper-core.EnrichmentResult.attempts — per-URL visibility so
  // the UI can show what the scraper actually did, not just what it returned.
  attempts?: Array<{
    url: string
    ok: boolean
    emails: number
    instagrams: number
    phones: number
    error?: string
  }>
}

function withAiHeaders(headers: HeadersInit, options?: AiScraperOptions): HeadersInit {
  return {
    ...headers,
    ...(options?.openRouterApiKey ? { 'X-OpenRouter-Api-Key': options.openRouterApiKey } : {}),
    ...(options?.openRouterModel ? { 'X-OpenRouter-Model': options.openRouterModel } : {}),
  }
}

export async function scrapeUrl(url: string, options?: AiScraperOptions): Promise<ScrapeResult> {
  return requestJson<ScrapeResult>('/scrape', { url }, options)
}

export interface SearchResult {
  title: string
  url: string
  description: string
}

export async function searchWeb(query: string, options?: AiScraperOptions): Promise<SearchResult[]> {
  const data = await requestJson<{ results: SearchResult[] }>('/search', { query }, options)
  return data.results
}

export async function enrichLead(
  input: {
    name: string
    city?: string
    website?: string
    instagram?: string
    email?: string
    phone?: string
    notes?: string
  },
  options?: AiScraperOptions,
): Promise<EnrichmentResult> {
  try {
    return await requestJson<EnrichmentResult>('/enrich', input, options)
  } catch {
    const website = input.website ?? (await discoverWebsite(input, options))
    if (!website) {
      return {
        website: input.website,
        instagram: input.instagram,
        email: input.email,
        phone: input.phone,
        notes: input.notes,
      }
    }

    try {
      const scraped = await scrapeUrl(website, options)
      return {
        website,
        instagram: input.instagram ?? scraped.instagram_handles[0],
        email: input.email ?? scraped.emails[0],
        phone: input.phone ?? scraped.phones[0],
        notes: input.notes ?? scraped.description,
      }
    } catch {
      return {
        website,
        instagram: input.instagram,
        email: input.email,
        phone: input.phone,
        notes: input.notes,
      }
    }
  }
}

async function requestJson<T>(path: string, body: unknown, options?: AiScraperOptions): Promise<T> {
  let lastError: Error | null = null

  for (const base of SCRAPER_BASES) {
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: withAiHeaders({ 'Content-Type': 'application/json' }, options),
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`${path} ${res.status}: ${text || res.statusText}`)
      }
      return (await res.json()) as T
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError ?? new Error(`No scraper backend available for ${path}`)
}

async function discoverWebsite(
  input: {
    name: string
    city?: string
  },
  options?: AiScraperOptions,
) {
  try {
    const results = await searchWeb(`${input.name} ${input.city ?? ''} official website contact`, options)
    const blacklist = ['instagram.com', 'facebook.com', 'linkedin.com', 'tripadvisor.', 'google.com', 'maps.', 'yelp.']
    return results.find(result => blacklist.every(domain => !result.url.includes(domain)))?.url
  } catch {
    return undefined
  }
}

// Curated set of external search launchers — always available, no API needed.
// Opens parallel tabs the user can scan and pull data from.
export interface SearchLauncher {
  label: string
  build: (query: string) => string
}

export const SEARCH_LAUNCHERS: SearchLauncher[] = [
  {
    label: 'Google',
    build: q => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    label: 'Google Maps',
    build: q => `https://www.google.com/maps/search/${encodeURIComponent(q)}`,
  },
  {
    label: 'Instagram',
    build: q => `https://www.instagram.com/explore/tags/${encodeURIComponent(q.replace(/\s+/g, ''))}/`,
  },
  {
    label: 'Instagram search',
    build: q => `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com ${q}`)}`,
  },
  {
    label: 'Resident Advisor',
    build: q => `https://ra.co/search?searchTerm=${encodeURIComponent(q)}`,
  },
  {
    label: 'Facebook events',
    build: q => `https://www.facebook.com/events/search/?q=${encodeURIComponent(q)}`,
  },
]
