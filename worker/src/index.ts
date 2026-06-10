/**
 * Venue Scraper Worker — shared by venue-outreach-db and athar-eventplanner
 *
 * Endpoints:
 *   POST /scrape    { url }                           → ScrapeResult
 *   POST /search    { query }                         → { results: SearchResult[] }  (BRAVE_API_KEY)
 *   POST /places    { query }                         → { results: PlacesResult[] }  (GOOGLE_MAPS_API_KEY)
 *   POST /discover  { city|location, category|categories, country?, limit? } → { results: DiscoveredVenue[] }  (Overpass/free)
 *   POST /enrich    { url, context? }                 → EnrichedVenue  (scrape + LLM)
 *   GET  /health                                      → { ok: true }
 *
 * Designed for the Cloudflare Workers free tier. No external npm deps.
 * Discovery uses Overpass API (OpenStreetMap) — completely free, no account needed.
 * Enrichment uses OpenRouter free models for LLM extraction.
 */

export interface Env {
  ALLOWED_ORIGINS: string
  BRAVE_API_KEY?: string
  OPENROUTER_API_KEY?: string
  GOOGLE_MAPS_API_KEY?: string
}

interface PlacesResult {
  place_id: string
  name: string
  address: string
  lat: number
  lng: number
  phone?: string
  website?: string
  rating?: number
  user_ratings_total?: number
  primary_type?: string
}

interface ScrapeResult {
  url: string
  fetched_at: string
  emails: string[]
  instagram_handles: string[]
  phones: string[]
  addresses: string[]
  title?: string
  description?: string
  raw_text_excerpt?: string
}

interface SearchResult {
  title: string
  url: string
  description: string
}

interface DiscoveredVenue {
  osm_id: number
  osm_type: 'node' | 'way' | 'relation'
  /** Discovery backend that produced this record. Only OSM today —
   *  Foursquare/Yelp were evaluated and rejected (no real free tier). */
  source: 'osm'
  name: string
  lat: number
  lng: number
  category: string
  address: Partial<{ road: string; city: string; country: string; postcode: string }>
  website?: string
  phone?: string
  email?: string
  opening_hours?: string
  tags: Record<string, string>
}

interface EnrichedVenue {
  url: string
  scraped: ScrapeResult
  extracted: {
    name?: string
    email?: string
    phone?: string
    instagram?: string
    address?: string
    description?: string
    booking_contact?: string
  }
}

const MAX_BYTES = 1_500_000 // 1.5 MB cap per fetch
const USER_AGENT = 'VenueIntelBot/1.0 (+https://venue-outreach-db.pages.dev)'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? ''
    const corsHeaders = buildCorsHeaders(origin, env.ALLOWED_ORIGINS)

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    const url = new URL(req.url)
    try {
      if (url.pathname === '/health') {
        return json({
          ok: true,
          hasSearch: Boolean(env.BRAVE_API_KEY),
          hasEnrich: Boolean(env.OPENROUTER_API_KEY),
          hasPlaces: Boolean(env.GOOGLE_MAPS_API_KEY),
        }, 200, corsHeaders)
      }
      if (url.pathname === '/scrape' && req.method === 'POST') {
        const { url: target } = await req.json<{ url?: string }>()
        if (!target) return json({ error: 'Missing url' }, 400, corsHeaders)
        const result = await scrape(target)
        return json(result, 200, corsHeaders)
      }
      if (url.pathname === '/search' && req.method === 'POST') {
        if (!env.BRAVE_API_KEY) {
          return json(
            { error: 'Search disabled. Set BRAVE_API_KEY via `wrangler secret put BRAVE_API_KEY`.' },
            503,
            corsHeaders,
          )
        }
        const { query } = await req.json<{ query?: string }>()
        if (!query) return json({ error: 'Missing query' }, 400, corsHeaders)
        const results = await braveSearch(query, env.BRAVE_API_KEY)
        return json({ results }, 200, corsHeaders)
      }
      if (url.pathname === '/places' && req.method === 'POST') {
        if (!env.GOOGLE_MAPS_API_KEY) {
          return json(
            { error: 'Places disabled. Set GOOGLE_MAPS_API_KEY via `wrangler secret put GOOGLE_MAPS_API_KEY`.' },
            503,
            corsHeaders,
          )
        }
        const { query } = await req.json<{ query?: string }>()
        if (!query) return json({ error: 'Missing query' }, 400, corsHeaders)
        const results = await searchPlaces(query, env.GOOGLE_MAPS_API_KEY)
        return json({ results }, 200, corsHeaders)
      }
      if (url.pathname === '/discover' && req.method === 'POST') {
        const body = await req.json<{
          city?: string
          location?: string   // free-text alternative to city+country
          category?: string
          categories?: string[] // run multiple categories and merge
          country?: string
          limit?: number
        }>()
        const cityName = body.city ?? body.location ?? ''
        if (!cityName || !body.category && !body.categories?.length) {
          return json({ error: 'city/location and category/categories required' }, 400, corsHeaders)
        }
        const cats = body.categories?.length ? body.categories : [body.category!]
        const results = await discoverVenues(cityName, cats, body.country ?? '', body.limit ?? 200)
        return json({ results }, 200, corsHeaders)
      }
      if (url.pathname === '/enrich' && req.method === 'POST') {
        const body = await req.json<{ url?: string; context?: string }>()
        if (!body.url) return json({ error: 'url required' }, 400, corsHeaders)
        const result = await enrichVenue(body.url, body.context ?? '', env.OPENROUTER_API_KEY)
        return json(result, 200, corsHeaders)
      }
      return json({ error: 'Not found' }, 404, corsHeaders)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return json({ error: msg }, 500, corsHeaders)
    }
  },
}

// ---------- Scraping ----------

async function scrape(target: string): Promise<ScrapeResult> {
  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs allowed')
  }

  const res = await fetch(parsed.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en;q=0.9,el;q=0.8',
    },
    redirect: 'follow',
    cf: { cacheTtl: 300, cacheEverything: true },
  })

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  }

  // Cap response size.
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Empty response')
  let received = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      received += value.length
      if (received > MAX_BYTES) {
        await reader.cancel()
        break
      }
      chunks.push(value)
    }
  }
  const buf = new Uint8Array(received)
  let offset = 0
  for (const c of chunks) {
    buf.set(c, offset)
    offset += c.length
  }
  const html = new TextDecoder('utf-8', { fatal: false, ignoreBOM: false }).decode(buf)

  // Decode HTML entities once for the text fields we extract.
  const decoded = decodeEntities(html)

  // Strip script/style for safer text extraction.
  const stripped = decoded
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const text = stripped.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  const title = extractTitle(decoded)
  const description = extractMeta(decoded, 'description') ?? extractMeta(decoded, 'og:description')

  // Emails
  const emails = uniq(
    text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [],
  )
    .filter(e => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e))
    .filter(e => !/(example|sentry|wixpress|godaddy|cloudflare)/i.test(e))

  // Instagram handles — from links primarily, then from text fallback.
  const igFromLinks = uniq(
    [...decoded.matchAll(/instagram\.com\/([A-Za-z0-9_.]+)\/?/gi)].map(m => m[1]),
  ).filter(h => !['p', 'reel', 'tv', 'explore', 'accounts', 'about', 'directory', 'developer'].includes(h.toLowerCase()))
  const igFromText = uniq(
    (text.match(/(?<![A-Za-z0-9_])@([A-Za-z0-9_.]{2,30})(?![A-Za-z0-9_])/g) ?? []).map(s => s.slice(1)),
  )
  const instagram_handles = uniq([...igFromLinks, ...igFromText]).slice(0, 5)

  // Phones — tel:-link-first with junk filtering. Mirrors src/phone.ts
  // (the worker imports nothing from outside worker/). The old any-digit-run
  // regex matched coordinates, year ranges, dates and prices.
  const phones = extractPhoneCandidates(decoded, text).slice(0, 5)

  // Addresses — Greek postcode anchor (5 digits) or "Crete"/"Greece" mention.
  const addresses = extractAddresses(text)

  return {
    url: parsed.toString(),
    fetched_at: new Date().toISOString(),
    emails: emails.slice(0, 5),
    instagram_handles,
    phones,
    addresses: addresses.slice(0, 3),
    title,
    description,
    raw_text_excerpt: text.slice(0, 1200),
  }
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? m[1].trim() : undefined
}

function extractMeta(html: string, name: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*content=["']([^"']+)["']`,
    'i',
  )
  const m = html.match(re)
  return m ? m[1].trim() : undefined
}

function extractAddresses(text: string): string[] {
  const out: string[] = []
  // Greek postcode = 5 digits. Grab a window around it.
  const re = /([^.,;\n]{0,80}\b\d{5}\b[^.,;\n]{0,80})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const candidate = m[1].trim()
    if (/(crete|κρητη|greece|ελλα|chania|χανια|heraklion|ηρακλειο|rethymno|ρεθυμνο|hersonissos|χερσόνη|chersoniso|malia|μάλια|agios nikolaos)/i.test(candidate)) {
      out.push(candidate)
    }
  }
  return uniq(out)
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&nbsp;/g, ' ')
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

// ---------- Phone extraction (mirrors src/phone.ts) ----------

/** True if a raw matched string plausibly is a phone number. */
function isLikelyPhone(raw: string): boolean {
  const s = raw.trim()
  const digits = s.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return false
  // Decimal numbers: map coordinates, prices, ratings ("35.2931607", "10.50").
  // The only dotted format kept is French-style pairs ("01.55.78.10.00") —
  // anything else dotted (incl. IP addresses) is rejected.
  if (/\d\.\d/.test(s) && !/^\d{2}(\.\d{2}){3,}$/.test(s.replace(/\s+/g, ''))) return false
  // Year ranges and season spans ("2024-2025", "2024 – 2025", "2024/2025")
  if (/(19|20)\d{2}\s*[-–—/]\s*(19|20)\d{2}/.test(s)) return false
  // Dates in either order ("2026-06-10", "10/06/2026", "10.06.2026")
  if (/^(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(s)) return false
  if (/^\d{1,2}[-/.]\d{1,2}[-/.](19|20)\d{2}$/.test(s)) return false
  return true
}

/**
 * Extract validated phone candidates. `tel:` links first (when a site has
 * one, it's the number the venue wants to be called on — near-zero false
 * positives), then validated free-text matches. Deduped, best-first.
 */
function extractPhoneCandidates(html: string, text: string): string[] {
  const fromTelLinks = [...html.matchAll(/href=["']tel:([+\d][\d\s()./-]*\d)["']/gi)]
    .map(m => m[1])
  const fromText = text.match(/(?:\+?\d[\d\s()./-]{6,}\d)/g) ?? []
  const all = [...fromTelLinks, ...fromText]
    .map(s => s.trim().replace(/\s+/g, ' '))
    .filter(isLikelyPhone)
  return Array.from(new Set(all))
}

// ---------- Overpass Discovery ----------

const OSM_TAGS: Record<string, string[][]> = {
  // Each entry is a list of [key, value] pairs (OR'd together in the query)
  'nightclub':          [['amenity', 'nightclub'], ['leisure', 'dance']],
  'beach club':         [['leisure', 'beach_resort'], ['amenity', 'nightclub'], ['tourism', 'resort']],
  'bar':                [['amenity', 'bar'], ['amenity', 'pub']],
  'bar with djs':       [['amenity', 'bar'], ['amenity', 'pub']],
  'rooftop bar':        [['amenity', 'bar']],
  'cocktail bar':       [['amenity', 'bar']],
  'resort':             [['tourism', 'resort']],
  'hotel':              [['tourism', 'hotel']],
  'boutique hotel':     [['tourism', 'hotel']],
  'event villa':        [['tourism', 'guest_house'], ['amenity', 'events_venue']],
  'wedding venue':      [['amenity', 'events_venue']],
  'festival':           [['amenity', 'events_venue']],
  'restaurant':         [['amenity', 'restaurant']],
  'beach restaurant':   [['amenity', 'restaurant']],
  'live music venue':   [['amenity', 'music_venue'], ['amenity', 'arts_centre']],
  'music venue':        [['amenity', 'music_venue']],
  'coworking':          [['amenity', 'coworking_space'], ['amenity', 'conference_centre']],
  'event space':        [['amenity', 'events_venue'], ['amenity', 'conference_centre']],
  'cafe':               [['amenity', 'cafe']],
  'club':               [['amenity', 'nightclub'], ['amenity', 'social_club']],
}

function resolveOsmTags(category: string): string[][] {
  const key = category.toLowerCase().trim()
  return OSM_TAGS[key] ?? OSM_TAGS[key.split(' ')[0]] ?? [['amenity', 'nightclub']]
}

// Resolve a human location string to a [south, west, north, east] bounding box
// using Nominatim (OpenStreetMap geocoder) — free, no API key required.
async function resolveBbox(location: string): Promise<[number, number, number, number] | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VenueOutreachDB/1.0 (venue-discovery)' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { boundingbox?: string[] }[]
    const bb = data[0]?.boundingbox
    if (!bb || bb.length < 4) return null
    // Nominatim returns [south, north, west, east]
    return [parseFloat(bb[0]), parseFloat(bb[2]), parseFloat(bb[1]), parseFloat(bb[3])]
  } catch {
    return null
  }
}

// Primary + mirror Overpass endpoints. The main instance rate-limits
// aggressively (429); the Kumi mirror is free and accepts identical queries.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

// Small towns (e.g. "Malia, Crete") geocode to a tiny bounding box. Google
// Maps effectively searches the surrounding strip too, so widen narrow boxes
// to a minimum span (~0.1° ≈ 9–11 km) to match what a human sees on the map.
function padBbox(bbox: [number, number, number, number]): [number, number, number, number] {
  const MIN_SPAN = 0.1
  let [s, w, n, e] = bbox
  if (n - s < MIN_SPAN) {
    const pad = (MIN_SPAN - (n - s)) / 2
    s -= pad
    n += pad
  }
  if (e - w < MIN_SPAN) {
    const pad = (MIN_SPAN - (e - w)) / 2
    w -= pad
    e += pad
  }
  return [s, w, n, e]
}

function buildOverpassQueryBbox(bbox: [number, number, number, number], tagPairs: string[][]): string {
  const [s, w, n, e] = bbox
  const filters = tagPairs
    .flatMap(([k, v]) => [
      `node["${k}"="${v}"](${s},${w},${n},${e});`,
      `way["${k}"="${v}"](${s},${w},${n},${e});`,
      `relation["${k}"="${v}"](${s},${w},${n},${e});`,
    ])
    .join('\n  ')
  return `[out:json][timeout:30];\n(\n  ${filters}\n);\nout center tags;`
}

/** Label an element with the first requested category whose tag pairs match. */
function categorize(
  tags: Record<string, string>,
  catTagPairs: { category: string; pairs: string[][] }[],
): string {
  for (const { category, pairs } of catTagPairs) {
    if (pairs.some(([k, v]) => tags[k] === v)) return category
  }
  return catTagPairs[0]?.category ?? 'venue'
}

async function discoverVenues(
  city: string,
  categories: string[],
  country: string,
  limit: number,
): Promise<DiscoveredVenue[]> {
  // Resolve every requested category to its tag pairs, preserving request
  // order so results get labeled with the most specific matching category.
  const catTagPairs = categories.map(cat => ({ category: cat, pairs: resolveOsmTags(cat) }))
  const uniquePairs: string[][] = []
  const seenPairs = new Set<string>()
  for (const { pairs } of catTagPairs) {
    for (const [k, v] of pairs) {
      const key = `${k}=${v}`
      if (!seenPairs.has(key)) {
        seenPairs.add(key)
        uniquePairs.push([k, v])
      }
    }
  }

  // Geocode ONCE per request. Nominatim allows ~1 req/s — the old per-category
  // loop fired 6 back-to-back lookups and got rate-limited into the fallback.
  const locationQuery = country ? `${city}, ${country}` : city
  const bbox = await resolveBbox(locationQuery)

  let overpassQuery: string
  if (bbox) {
    overpassQuery = buildOverpassQueryBbox(padBbox(bbox), uniquePairs)
  } else {
    // Legacy area-name fallback (less reliable for non-ASCII city names)
    const filters = uniquePairs
      .flatMap(([k, v]) => [
        `node["${k}"="${v}"](area.a);`,
        `way["${k}"="${v}"](area.a);`,
        `relation["${k}"="${v}"](area.a);`,
      ])
      .join('\n  ')
    const areaFilter = country
      ? `area[name="${city}"]["ISO3166-2"~"${country.toUpperCase()}"]->.a;`
      : `area[name="${city}"][admin_level~"^(4|6|7|8)$"]->.a;`
    overpassQuery = `[out:json][timeout:30];\n${areaFilter}\n(\n  ${filters}\n);\nout center tags;`
  }

  // ONE Overpass query covering all categories. The old per-category loop
  // fired 6 sequential queries, hit 429s after the first couple, and a single
  // failure aborted the whole request with no partial results.
  interface OverpassResponse {
    elements?: {
      type: string
      id: number
      lat?: number
      lon?: number
      center?: { lat: number; lon: number }
      tags?: Record<string, string>
    }[]
  }
  let data: OverpassResponse | null = null
  let lastError = ''
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': '*/*',
          'User-Agent': USER_AGENT,
        },
        body: `data=${encodeURIComponent(overpassQuery)}`,
      })
      if (!res.ok) {
        lastError = `${endpoint} → ${res.status} ${await res.text().then(t => t.slice(0, 200))}`
        continue
      }
      data = (await res.json()) as OverpassResponse
      break
    } catch (err) {
      lastError = `${endpoint} → ${err instanceof Error ? err.message : String(err)}`
    }
  }
  if (!data) {
    throw new Error(`Overpass API error: ${lastError}`)
  }

  const elements = data.elements ?? []
  const seen = new Set<string>()
  const out: DiscoveredVenue[] = []
  for (const el of elements) {
    const tags = el.tags ?? {}
    if (!tags.name) continue // named venues only — filter BEFORE applying the limit
    const key = `${el.type}/${el.id}` // node and way id spaces overlap; qualify by type
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      osm_id: el.id,
      osm_type: el.type as 'node' | 'way' | 'relation',
      source: 'osm',
      name: tags.name,
      lat: el.lat ?? el.center?.lat ?? 0,
      lng: el.lon ?? el.center?.lon ?? 0,
      category: categorize(tags, catTagPairs),
      address: {
        road: tags['addr:street'],
        city: tags['addr:city'] ?? city,
        country: tags['addr:country'] ?? country,
        postcode: tags['addr:postcode'],
      },
      website: tags.website ?? tags.url,
      phone: tags.phone ?? tags['contact:phone'],
      email: tags.email ?? tags['contact:email'],
      opening_hours: tags.opening_hours,
      tags: Object.fromEntries(
        Object.entries(tags).filter(([k]) =>
          ['name', 'amenity', 'tourism', 'leisure', 'cuisine', 'stars', 'description'].includes(k)
        )
      ),
    })
    if (out.length >= limit) break
  }
  return out
}

// ---------- Enrich (scrape + LLM) ----------

const OPENROUTER_MODELS = [
  'google/gemma-3-27b-it:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
]

async function enrichVenue(
  target: string,
  context: string,
  apiKey?: string,
): Promise<EnrichedVenue> {
  const scraped = await scrape(target)

  if (!apiKey) {
    return { url: target, scraped, extracted: pickFromScrape(scraped) }
  }

  const prompt = `You are a data extraction assistant. Given scraped text from a venue website, extract structured contact information as JSON.

Context: ${context || 'venue contact details'}

Website title: ${scraped.title ?? ''}
Description: ${scraped.description ?? ''}
Text excerpt: ${scraped.raw_text_excerpt ?? ''}
Emails found: ${scraped.emails.join(', ') || 'none'}
Phones found: ${scraped.phones.join(', ') || 'none'}
Instagram handles: ${scraped.instagram_handles.join(', ') || 'none'}
Addresses: ${scraped.addresses.join('; ') || 'none'}

Return ONLY valid JSON matching this schema (null for missing fields):
{
  "name": "<venue name>",
  "email": "<best contact email or null>",
  "phone": "<best contact phone or null>",
  "instagram": "<instagram handle without @ or null>",
  "address": "<full address or null>",
  "description": "<one-line venue description or null>",
  "booking_contact": "<booking-specific email or name if found, else null>"
}`

  let lastErr: Error | null = null
  for (const model of OPENROUTER_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://venue-outreach-db.pages.dev',
          'X-Title': 'VenueOutreach',
        },
        body: JSON.stringify({
          model,
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = (await res.json()) as { choices?: { message: { content: string } }[] }
      if (!res.ok || !data.choices) continue
      const raw = data.choices[0].message.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const extracted = JSON.parse(raw)
      return { url: target, scraped, extracted }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }

  // LLM failed — return regex-extracted data as fallback
  return { url: target, scraped, extracted: pickFromScrape(scraped) }
}

function pickFromScrape(s: ScrapeResult): EnrichedVenue['extracted'] {
  return {
    name: s.title,
    email: s.emails[0],
    phone: s.phones[0],
    instagram: s.instagram_handles[0],
    address: s.addresses[0],
    description: s.description,
    booking_contact: s.emails.find(e => /(booking|reserv|event|info)/i.test(e)),
  }
}

// ---------- Brave Search ----------

async function searchPlaces(textQuery: string, apiKey: string): Promise<PlacesResult[]> {
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.nationalPhoneNumber',
    'places.websiteUri',
    'places.rating',
    'places.userRatingCount',
    'places.primaryType',
  ].join(',')

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify({ textQuery, maxResultCount: 20, languageCode: 'en' }),
  })

  if (!res.ok) throw new Error(`Google Places ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`)

  const data = (await res.json()) as {
    places?: {
      id?: string
      displayName?: { text?: string }
      formattedAddress?: string
      location?: { latitude?: number; longitude?: number }
      nationalPhoneNumber?: string
      websiteUri?: string
      rating?: number
      userRatingCount?: number
      primaryType?: string
    }[]
  }

  return (data.places ?? [])
    .filter(p => p.id && p.displayName?.text)
    .map(p => ({
      place_id: p.id!,
      name: p.displayName!.text!,
      address: p.formattedAddress ?? '',
      lat: p.location?.latitude ?? 0,
      lng: p.location?.longitude ?? 0,
      phone: p.nationalPhoneNumber,
      website: p.websiteUri,
      rating: p.rating,
      user_ratings_total: p.userRatingCount,
      primary_type: p.primaryType,
    }))
}

async function braveSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  // No country pin — regions span Greece, Germany, France, UAE, etc.
  // count=20 is the free-tier maximum per request.
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  })
  if (!res.ok) throw new Error(`Brave ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as {
    web?: { results?: { title: string; url: string; description: string }[] }
  }
  return (data.web?.results ?? []).map(r => ({
    title: r.title,
    url: r.url,
    description: r.description,
  }))
}

// ---------- CORS + helpers ----------

function buildCorsHeaders(origin: string, allowed: string): Record<string, string> {
  const list = allowed.split(',').map(s => s.trim())
  const allow =
    allowed === '*' || list.includes(origin)
      ? origin || '*'
      : list[0] || '*'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-OpenRouter-Api-Key, X-OpenRouter-Model',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}
