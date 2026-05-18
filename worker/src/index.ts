/**
 * Crete Nightlife Intelligence — Scraper Worker
 *
 * Endpoints:
 *   POST /scrape  { url }  → ScrapeResult
 *   POST /search  { query } → { results: SearchResult[] }   (requires BRAVE_API_KEY)
 *   GET  /health           → { ok: true }
 *
 * Designed for the Cloudflare Workers free tier. No external npm deps —
 * uses regex-based extraction (cheerio would balloon the bundle and the
 * regex approach already handles 80–90% of venue sites cleanly).
 */

export interface Env {
  ALLOWED_ORIGINS: string
  BRAVE_API_KEY?: string
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

const MAX_BYTES = 1_500_000 // 1.5 MB cap per fetch
const USER_AGENT = 'CreteNightlifeBot/0.1 (+https://example.com/crete-bot)'

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
        return json({ ok: true, hasSearch: Boolean(env.BRAVE_API_KEY) }, 200, corsHeaders)
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
  const html = new TextDecoder('utf-8', { fatal: false }).decode(buf)

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

  // Phones — international or Greek formats.
  const phones = uniq(
    (text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? [])
      .map(s => s.trim())
      .filter(s => {
        const digits = s.replace(/\D/g, '')
        return digits.length >= 8 && digits.length <= 15
      }),
  ).slice(0, 5)

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

// ---------- Brave Search ----------

async function braveSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10&country=GR`
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
    'Access-Control-Allow-Headers': 'Content-Type',
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
