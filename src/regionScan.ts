/**
 * Region Scanner
 *
 * Two-phase venue discovery for a location:
 *
 *   Phase 1 — OpenStreetMap structured discovery (free, no key, one request).
 *             Returns actual venue records: name, website, phone, email.
 *   Phase 2 — Web search battery (requires BRAVE_API_KEY on the worker).
 *             Surfaces venues OSM doesn't know about plus official-site URLs.
 *
 * Results from both phases are merged and deduplicated by normalized URL
 * (or by name for OSM venues without a website).
 *
 * Why multiple search queries: a single "Malia nightlife" search surfaces
 * listicles. Running "nightclub Malia Crete", "beach club Malia Crete", etc.
 * surfaces the actual venue websites that matter for outreach.
 */

import type { AiScraperOptions, OsmVenue, SearchResult } from './scraper'
import { searchWeb, discoverByLocation } from './scraper'

// ---------------------------------------------------------------------------
// Blacklisted aggregator domains — useful for human browsing but not for
// direct venue outreach. We keep social media (instagram, facebook) because
// many Crete nightlife venues ONLY have a social presence.
// ---------------------------------------------------------------------------
const AGGREGATOR_DOMAINS = [
  'tripadvisor.',
  'booking.com',
  'hotels.com',
  'expedia.',
  'airbnb.',
  'yelp.',
  'timeout.com',
  'lonelyplanet.',
  'wikipedia.',
  'wikivoyage.',
  'viator.',
  'getyourguide.',
  'trustpilot.',
  'google.com/maps',
  'maps.google.',
]

/** Return true if this URL is a known aggregator site (not a venue's own page). */
export function isAggregator(url: string): boolean {
  const lower = url.toLowerCase()
  return AGGREGATOR_DOMAINS.some(domain => lower.includes(domain))
}

// ---------------------------------------------------------------------------
// Query templates
//
// Two dimensions: venue TYPE keywords + discovery ANGLES.
// Kept deliberately small: Brave's free tier allows 1 request/second and
// 2,000 queries/month, so every angle in the grid costs real quota. Two
// angles per type plus three freeform queries (~19 total) covers the result
// space the old 37-query battery did — the extra angles returned near-
// identical result sets.
// ---------------------------------------------------------------------------
const VENUE_TYPES = [
  'nightclub',
  'beach club',
  'bar',
  'rooftop bar',
  'cocktail bar',
  'live music venue',
  'event space',
  'pool party',
]

const DISCOVERY_ANGLES = [
  '{type} {location}',
  '{type} {location} official website',
]

// Additional free-form queries that don't follow the type+angle grid
const FREEFORM_TEMPLATES = [
  '{location} nightlife venues',
  '{location} clubs and bars',
  '{location} entertainment venues',
]

// Categories requested from the worker's /discover (Overpass) endpoint.
// Same vocabulary the DiscoveryPanel free-discovery card uses.
const OSM_CATEGORIES = ['nightclub', 'bar', 'bar with djs', 'beach club', 'live music venue', 'event space']

/**
 * Generate the full battery of search queries for a given location.
 * Deduplicates and returns a flat string[].
 */
export function generateRegionQueries(location: string): string[] {
  const loc = location.trim()
  const seen = new Set<string>()
  const queries: string[] = []

  const add = (q: string) => {
    const norm = q.trim().toLowerCase()
    if (!seen.has(norm)) {
      seen.add(norm)
      queries.push(q.trim())
    }
  }

  // Grid: types × angles
  for (const type of VENUE_TYPES) {
    for (const template of DISCOVERY_ANGLES) {
      add(template.replace('{type}', type).replace('{location}', loc))
    }
  }

  // Freeform
  for (const template of FREEFORM_TEMPLATES) {
    add(template.replace('{location}', loc))
  }

  return queries
}

// ---------------------------------------------------------------------------
// Scan result — extends SearchResult with provenance metadata
// ---------------------------------------------------------------------------
export interface RegionScanResult extends SearchResult {
  /** Which search query surfaced this result (osm:<category> for OSM hits) */
  query: string
  /** True if the URL looks like a venue's own site (not an aggregator) */
  likelyOwnSite: boolean
}

export interface RegionScanProgress {
  done: number
  total: number
  currentQuery: string
}

/** Map an OSM venue record into the scan-result shape the UI renders. */
function osmToScanResult(v: OsmVenue, location: string): RegionScanResult {
  return {
    title: v.name,
    url: v.website ?? `https://www.google.com/maps/search/${encodeURIComponent(v.name + ' ' + location)}`,
    description: [v.category, v.address.road, v.phone, v.email].filter(Boolean).join(' · '),
    query: `${v.source ?? 'osm'}:${v.category}`,
    likelyOwnSite: Boolean(v.website),
  }
}

/**
 * Dedup key for merged results. Normalizes protocol/www/trailing slash so the
 * same venue found via OSM and via search collapses to one row. OSM venues
 * without a website get a synthetic Maps-search URL — dedupe those by name.
 */
function dedupKey(url: string, title: string): string {
  const norm = url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
  if (norm.startsWith('google.com/maps') || norm.startsWith('maps.google.')) {
    return `name:${title.trim().toLowerCase()}`
  }
  return norm
}

/**
 * Run the full region scan for a location.
 *
 * Phase 1 always queries OpenStreetMap (free, structured). Phase 2 runs the
 * search battery on top when the search backend is available. Results are
 * merged, deduplicated, and sorted with own-site venues first. Aggregator
 * URLs are kept but flagged likelyOwnSite=false so the UI can filter them.
 *
 * @param location  Human-readable location string, e.g. "Malia, Crete"
 * @param options   AI/scraper options (API key forwarding)
 * @param onProgress  Called before each step with current progress
 * @param signal    AbortSignal — cancel the scan mid-flight
 */
export async function scanRegion(
  location: string,
  options: AiScraperOptions,
  onProgress: (progress: RegionScanProgress) => void,
  signal?: AbortSignal,
): Promise<RegionScanResult[]> {
  const queries = generateRegionQueries(location)
  const total = queries.length + 1 // +1 for the OSM phase
  const seen = new Map<string, RegionScanResult>()

  const addResult = (r: RegionScanResult) => {
    const key = dedupKey(r.url, r.title)
    if (!seen.has(key)) seen.set(key, r)
  }

  // Phase 1 — OpenStreetMap discovery. This is the primary source: it returns
  // real venue records instead of search-result links. It used to run only as
  // a fallback when search returned literally zero results, so a couple of
  // junk search hits would suppress dozens of real OSM venues.
  onProgress({ done: 0, total, currentQuery: 'OpenStreetMap discovery…' })
  if (!signal?.aborted) {
    try {
      const osmVenues = await discoverByLocation(location, OSM_CATEGORIES, options)
      for (const v of osmVenues) {
        if (v.name) addResult(osmToScanResult(v, location))
      }
    } catch {
      // OSM down or unreachable — the search battery below still runs
    }
  }

  // Phase 2 — web search battery.
  let queriesFailed = 0
  let queriesSucceeded = 0
  for (const [i, query] of queries.entries()) {
    if (signal?.aborted) break

    onProgress({ done: i + 1, total, currentQuery: query })

    try {
      const hits = await searchWeb(query, options)
      queriesSucceeded += 1
      for (const hit of hits) {
        addResult({
          ...hit,
          query,
          likelyOwnSite: !isAggregator(hit.url),
        })
      }
    } catch {
      // A single query failing shouldn't abort the whole scan — but if the
      // first three all fail with zero successes, the search backend is
      // unavailable (no Brave key) and every remaining query will fail too.
      queriesFailed += 1
      if (queriesSucceeded === 0 && queriesFailed >= 3) break
    }

    // Brave free tier allows 1 request/second. The old 350ms throttle got
    // most of the battery silently 429'd — that was the main "3 venues per
    // region" failure mode.
    if (i < queries.length - 1 && !signal?.aborted) {
      await delay(1100)
    }
  }

  onProgress({ done: total, total, currentQuery: '' })

  // Sort: own sites first, then aggregators/maps links
  const all = Array.from(seen.values())
  all.sort((a, b) => Number(b.likelyOwnSite) - Number(a.likelyOwnSite))
  return all
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
