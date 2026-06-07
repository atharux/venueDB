/**
 * Region Scanner
 *
 * Generates a battery of search queries for a given location and venue-type
 * vocabulary, runs them against the /search endpoint, then deduplicates and
 * returns a flat list of unique results.
 *
 * Why multiple queries: a single "Malia nightlife" search surfaces listicles.
 * Running "nightclub Malia Crete", "beach club Malia Crete", "bar Malia
 * Crete" etc. surfaces the actual venue websites that matter for outreach.
 */

import type { AiScraperOptions, SearchResult } from './scraper'
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
// Cross-joining a short type list with a short angle list gives ~12-18 unique
// queries that collectively surface very different result sets.
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
  '{type} {location} contact booking',
  'best {type} {location}',
]

// Additional free-form queries that don't follow the type+angle grid
const FREEFORM_TEMPLATES = [
  '{location} nightlife venues',
  '{location} clubs and bars',
  '{location} party scene 2024',
  '{location} entertainment venue',
  '{location} club official website contact',
]

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
  /** Which search query surfaced this result */
  query: string
  /** True if the URL looks like a venue's own site (not an aggregator) */
  likelyOwnSite: boolean
}

export interface RegionScanProgress {
  done: number
  total: number
  currentQuery: string
}

/**
 * Run the full region scan for a location.
 *
 * Calls /search once per generated query, aggregates results, deduplicates
 * by URL, and returns the unique set. Results from aggregator domains are kept
 * in the list but flagged with likelyOwnSite=false so the UI can filter them.
 *
 * @param location  Human-readable location string, e.g. "Malia, Crete"
 * @param options   AI/scraper options (API key forwarding)
 * @param onProgress  Called before each query with current progress
 * @param signal    AbortSignal — cancel the scan mid-flight
 */
export async function scanRegion(
  location: string,
  options: AiScraperOptions,
  onProgress: (progress: RegionScanProgress) => void,
  signal?: AbortSignal,
): Promise<RegionScanResult[]> {
  const queries = generateRegionQueries(location)
  const seen = new Map<string, RegionScanResult>() // keyed by URL

  for (const [i, query] of queries.entries()) {
    if (signal?.aborted) break

    onProgress({ done: i, total: queries.length, currentQuery: query })

    try {
      const hits = await searchWeb(query, options)
      for (const hit of hits) {
        if (!seen.has(hit.url)) {
          seen.set(hit.url, {
            ...hit,
            query,
            likelyOwnSite: !isAggregator(hit.url),
          })
        }
      }
    } catch {
      // A single query failing shouldn't abort the whole scan
    }

    // Throttle to avoid hammering the search API
    if (i < queries.length - 1 && !signal?.aborted) {
      await delay(350)
    }
  }

  onProgress({ done: queries.length, total: queries.length, currentQuery: '' })

  // Sort: own sites first, then aggregators
  const all = Array.from(seen.values())
  all.sort((a, b) => Number(b.likelyOwnSite) - Number(a.likelyOwnSite))

  // If Brave search returned nothing (key not set), fall back to free OSM discovery.
  if (all.length === 0 && !signal?.aborted) {
    onProgress({ done: 0, total: 1, currentQuery: 'Falling back to OpenStreetMap…' })
    try {
      const osmCategories = ['nightclub', 'bar', 'bar with djs', 'beach club', 'live music venue', 'event space']
      const osmVenues = await discoverByLocation(location, osmCategories, options)
      onProgress({ done: 1, total: 1, currentQuery: '' })
      return osmVenues
        .filter(v => v.name)
        .map(v => ({
          title: v.name,
          url: v.website ?? `https://www.google.com/maps/search/${encodeURIComponent(v.name + ' ' + location)}`,
          description: [v.category, v.address.road, v.phone].filter(Boolean).join(' · '),
          query: `osm:${v.category}`,
          likelyOwnSite: Boolean(v.website),
        }))
    } catch {
      // OSM also failed — return empty
    }
  }

  return all
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
