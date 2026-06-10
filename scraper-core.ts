import { extractPhoneCandidates } from './src/phone'

export interface ScrapeResult {
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

export interface SearchResult {
  title: string
  url: string
  description: string
}

export interface EnrichmentInput {
  name: string
  city?: string
  website?: string
  instagram?: string
  email?: string
  phone?: string
  notes?: string
}

export interface EnrichmentResult {
  website?: string
  instagram?: string
  email?: string
  phone?: string
  notes?: string
  scraped?: ScrapeResult
  model?: string
  // Visibility: which pages were actually fetched, and what each returned.
  // The bulk-enrich UI shows these counts so the user can see the scraper
  // doing real work even when no new contact data was extracted.
  attempts?: Array<{
    url: string
    ok: boolean
    emails: number
    instagrams: number
    phones: number
    error?: string
  }>
}

// Common contact-page paths, in order of best signal. Most venue/business
// sites bury contact data on one of these, not on the homepage marketing splash.
const CONTACT_PATHS = ['', '/contact', '/contact-us', '/about', '/impressum', '/kontakt']

const MAX_BYTES = 1_500_000
const USER_AGENT = 'VenueIntelBot/0.2 (+local-mvp)'

export async function scrapeTarget(target: string): Promise<ScrapeResult> {
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
      'Accept-Language': 'en;q=0.9',
    },
    redirect: 'follow',
  })

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  }

  const html = await readHtml(res)
  const decoded = decodeEntities(html)
  const stripped = decoded
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const text = stripped.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  const title = extractTitle(decoded)
  const description = extractMeta(decoded, 'description') ?? extractMeta(decoded, 'og:description')

  const emails = uniq(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])
    .filter(email => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(email))
    .filter(email => !/(example|sentry|cloudflare|godaddy|wixpress)/i.test(email))
    .slice(0, 5)

  const igFromLinks = uniq(
    [...decoded.matchAll(/instagram\.com\/([A-Za-z0-9_.]+)\/?/gi)].map(match => match[1]),
  ).filter(
    handle =>
      !['p', 'reel', 'tv', 'explore', 'accounts', 'about', 'directory', 'developer'].includes(
        handle.toLowerCase(),
      ),
  )
  const igFromText = uniq(
    (text.match(/(?<![A-Za-z0-9_])@([A-Za-z0-9_.]{2,30})(?![A-Za-z0-9_])/g) ?? []).map(value =>
      value.slice(1),
    ),
  )
  const instagram_handles = uniq([...igFromLinks, ...igFromText]).slice(0, 5)

  // tel:-link-first extraction with junk filtering (coordinates, year
  // ranges, dates) — the old any-digit-run regex polluted the phone field.
  const phones = extractPhoneCandidates(decoded, text).slice(0, 5)

  return {
    url: parsed.toString(),
    fetched_at: new Date().toISOString(),
    emails,
    instagram_handles,
    phones,
    addresses: extractAddresses(text).slice(0, 3),
    title,
    description,
    raw_text_excerpt: text.slice(0, 1200),
  }
}

export async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html',
      'Accept-Language': 'en;q=0.9',
    },
  })

  if (!res.ok) {
    throw new Error(`Search failed: ${res.status} ${res.statusText}`)
  }

  const html = decodeEntities(await res.text())
  const cards = [...html.matchAll(/<div class="result(?:.|\n|\r)*?<\/div>\s*<\/div>/g)].slice(0, 12)

  const results = cards
    .map(match => {
      const block = match[0]
      const linkMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"/i)
      const titleMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
        ?? block.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
      const decodedUrl = linkMatch?.[1] ? decodeDuckDuckGoUrl(linkMatch[1]) : null
      if (!decodedUrl || !titleMatch) return null
      return {
        title: stripTags(titleMatch[1]).trim(),
        url: decodedUrl,
        description: stripTags(snippetMatch?.[1] ?? '').trim(),
      }
    })
    .filter((result): result is SearchResult => Boolean(result))

  return uniqByUrl(results).slice(0, 10)
}

/**
 * Server-side search via Brave Search API. Free tier covers 2k queries/mo.
 * Works from Cloudflare Workers IPs (unlike DuckDuckGo HTML, which blocks them).
 * Requires a free key from https://api.search.brave.com/.
 */
export async function searchBrave(query: string, apiKey: string): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  })
  if (!res.ok) throw new Error(`Brave ${res.status}: ${await res.text().catch(() => res.statusText)}`)
  const data = (await res.json()) as {
    web?: { results?: Array<{ title: string; url: string; description: string }> }
  }
  return (data.web?.results ?? []).map(r => ({
    title: r.title,
    url: r.url,
    description: r.description,
  }))
}

/**
 * Heuristic: turn a venue name into a likely homepage URL by combining a slug
 * with common TLDs. Tries each candidate with a short-timeout GET and returns
 * the first one that answers 2xx. Works surprisingly well for venues whose
 * brand maps cleanly to a domain ("Tanzhaus West" → tanzhauswest.de).
 *
 * City-aware: Berlin → prefer .de, Paris → .fr, etc. Falls back to .com / .io.
 * Returns the final URL after following redirects so we get the canonical form.
 */
export async function guessWebsiteFromName(
  name: string,
  city?: string,
): Promise<string | undefined> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!slug || slug.length < 3) return undefined

  const cityTlds: Record<string, string[]> = {
    berlin: ['de', 'com', 'io', 'club'],
    munich: ['de', 'com'],
    hamburg: ['de', 'com'],
    cologne: ['de', 'com'],
    frankfurt: ['de', 'com'],
    paris: ['fr', 'com', 'io'],
    lyon: ['fr', 'com'],
    amsterdam: ['nl', 'com', 'io'],
    rotterdam: ['nl', 'com'],
    dubai: ['ae', 'com', 'io'],
    london: ['co.uk', 'com', 'io'],
    chania: ['gr', 'com'],
    heraklion: ['gr', 'com'],
    rethymno: ['gr', 'com'],
    hersonissos: ['gr', 'com'],
    athens: ['gr', 'com'],
  }
  const cityKey = (city ?? '').toLowerCase().trim()
  const tlds = cityTlds[cityKey] ?? ['com', 'io', 'co']

  for (const tld of tlds) {
    for (const prefix of ['https://www.', 'https://']) {
      const candidate = `${prefix}${slug}.${tld}`
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 3000)
        const res = await fetch(candidate, {
          method: 'GET',
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
          redirect: 'follow',
          signal: controller.signal,
        })
        clearTimeout(timer)
        if (res.ok) {
          // res.url is the post-redirect canonical URL.
          // Cancel the body — we just needed the status + final URL.
          await res.body?.cancel().catch(() => {})
          return res.url
        }
      } catch {
        // Network error or timeout — try the next candidate.
      }
    }
  }
  return undefined
}

export async function enrichLead(
  input: EnrichmentInput,
  opts?: { apiKey?: string; model?: string; braveApiKey?: string },
): Promise<EnrichmentResult> {
  const attempts: NonNullable<EnrichmentResult['attempts']> = []

  // 1. Discover a website. Three-tier strategy:
  //    a. Brave Search (server-side, real results) — if API key present
  //    b. URL guessing (slug + common TLDs)         — no key required
  //    c. DuckDuckGo HTML scrape                    — last-resort fallback
  //    The first one to return a usable URL wins. Each tier is wrapped in
  //    .catch so a failure cascades to the next.
  let baseUrl = input.website
  let searchResults: SearchResult[] = []

  if (!baseUrl && opts?.braveApiKey) {
    searchResults = await searchBrave(
      `${input.name} ${input.city ?? ''} official website contact`,
      opts.braveApiKey,
    ).catch(() => [])
    baseUrl = pickBestWebsite(searchResults)
  }

  if (!baseUrl) {
    baseUrl = await guessWebsiteFromName(input.name, input.city).catch(() => undefined)
  }

  if (!baseUrl) {
    searchResults = await searchDuckDuckGo(
      `${input.name} ${input.city ?? ''} official website contact`,
    ).catch(() => [])
    baseUrl = pickBestWebsite(searchResults)
  }

  if (!baseUrl) {
    return {
      website: input.website,
      instagram: input.instagram,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
      attempts,
    }
  }

  // 2. Walk a small set of likely contact-bearing pages on the same origin.
  //    Stop early when we've collected at least one email AND one phone — most
  //    venues won't yield more once the contact page has surrendered both.
  const merged: ScrapeResult = {
    url: baseUrl,
    fetched_at: new Date().toISOString(),
    emails: [],
    instagram_handles: [],
    phones: [],
    addresses: [],
    title: undefined,
    description: undefined,
    raw_text_excerpt: undefined,
  }

  for (const path of CONTACT_PATHS) {
    const target = buildSameOriginUrl(baseUrl, path)
    if (!target) continue

    try {
      const scraped = await scrapeTarget(target)
      attempts.push({
        url: target,
        ok: true,
        emails: scraped.emails.length,
        instagrams: scraped.instagram_handles.length,
        phones: scraped.phones.length,
      })

      // Merge findings — homepage usually sets title/description; deeper pages
      // contribute the contacts. Preserve order so the first-seen wins.
      merged.emails = uniq([...merged.emails, ...scraped.emails])
      merged.instagram_handles = uniq([...merged.instagram_handles, ...scraped.instagram_handles])
      merged.phones = uniq([...merged.phones, ...scraped.phones])
      merged.addresses = uniq([...merged.addresses, ...scraped.addresses])
      if (!merged.title) merged.title = scraped.title
      if (!merged.description) merged.description = scraped.description
      if (!merged.raw_text_excerpt) merged.raw_text_excerpt = scraped.raw_text_excerpt

      // Early-exit if we have enough to be useful.
      if (merged.emails.length > 0 && merged.phones.length > 0) break
    } catch (error) {
      attempts.push({
        url: target,
        ok: false,
        emails: 0,
        instagrams: 0,
        phones: 0,
        error: error instanceof Error ? error.message : String(error),
      })
      // Don't break — a 404 on /contact is normal; try the next path.
    }
  }

  const deterministic: EnrichmentResult = {
    website: baseUrl,
    instagram: input.instagram ?? merged.instagram_handles[0],
    email: input.email ?? merged.emails[0],
    phone: input.phone ?? merged.phones[0],
    notes: input.notes ?? merged.description,
    scraped: merged,
    attempts,
  }

  if (!opts?.apiKey) return deterministic

  const aiSelection = await selectWithOpenRouter(input, merged, searchResults, opts).catch(() => null)
  if (!aiSelection) return deterministic

  return {
    website: deterministic.website,
    instagram: deterministic.instagram ?? aiSelection.instagram,
    email: deterministic.email ?? aiSelection.email,
    phone: deterministic.phone ?? aiSelection.phone,
    notes: deterministic.notes ?? aiSelection.notes,
    scraped: merged,
    model: aiSelection.model,
    attempts,
  }
}

/** Build a same-origin URL for a contact-path. Returns null on parse failure. */
function buildSameOriginUrl(base: string, path: string): string | null {
  try {
    const url = new URL(base)
    if (!path) return url.toString()
    url.pathname = path
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

async function readHtml(res: Response) {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Empty response')

  let received = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    received += value.length
    if (received > MAX_BYTES) {
      await reader.cancel()
      break
    }
    chunks.push(value)
  }

  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }
  // Workers' TextDecoder requires BOTH fatal + ignoreBOM when opts are passed.
  // Defaults match what we want, so just omit the opts arg entirely.
  return new TextDecoder('utf-8').decode(buffer)
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match ? match[1].trim() : undefined
}

function extractMeta(html: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["']`,
      'i',
    ),
  )
  return match ? match[1].trim() : undefined
}

function extractAddresses(text: string): string[] {
  const matches = [
    ...text.matchAll(/([^.,;\n]{0,90}(?:Berlin|Paris|Dubai|Amsterdam|Germany|France|UAE|Netherlands)[^.,;\n]{0,90})/gi),
  ]
  return uniq(matches.map(match => match[1].trim()))
}

function decodeDuckDuckGoUrl(url: string) {
  const clean = url.replace(/&amp;/g, '&')
  try {
    const parsed = new URL(clean, 'https://duckduckgo.com')
    return parsed.searchParams.get('uddg') ?? clean
  } catch {
    return clean
  }
}

function stripTags(value: string) {
  return decodeEntities(value).replace(/<[^>]+>/g, ' ')
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&nbsp;/g, ' ')
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items))
}

function uniqByUrl(items: SearchResult[]) {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}

function pickBestWebsite(results: SearchResult[]) {
  const blacklist = ['instagram.com', 'facebook.com', 'linkedin.com', 'tripadvisor.', 'google.com', 'maps.', 'yelp.']
  return results.find(result => blacklist.every(domain => !result.url.includes(domain)))?.url
}

async function selectWithOpenRouter(
  input: EnrichmentInput,
  scraped: ScrapeResult,
  searchResults: SearchResult[],
  ai: { apiKey?: string; model?: string },
) {
  const prompt = [
    'Return strict JSON only.',
    'Use only the evidence provided. Do not invent websites, emails, phones, handles, or notes.',
    'Choose the best available public contact data for this business.',
    JSON.stringify(
      {
        business: input,
        scraped,
        searchResults: searchResults.slice(0, 5),
        outputSchema: {
          instagram: 'string|null',
          email: 'string|null',
          phone: 'string|null',
          notes: 'string|null',
        },
      },
      null,
      2,
    ),
  ].join('\n')

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ai.model || 'openrouter/auto',
      messages: [
        {
          role: 'system',
          content:
            'You extract structured business contact data from evidence. Output valid JSON only and leave unknown fields null.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0,
      max_tokens: 250,
    }),
  })

  if (!res.ok) throw new Error(`OpenRouter ${res.status}`)

  const data = (await res.json()) as {
    model?: string
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content ?? '{}'
  const parsed = parseJsonObject(content) as {
    instagram?: string | null
    email?: string | null
    phone?: string | null
    notes?: string | null
  }

  return {
    instagram: parsed.instagram ?? undefined,
    email: parsed.email ?? undefined,
    phone: parsed.phone ?? undefined,
    notes: parsed.notes ?? undefined,
    model: data.model,
  }
}

function parseJsonObject(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : content
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  return JSON.parse(start >= 0 && end >= start ? raw.slice(start, end + 1) : raw)
}
