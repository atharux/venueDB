import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const PORT = Number(process.env.LOCAL_API_PORT || 8787)
const MAX_BYTES = 1_500_000
const USER_AGENT = 'VenueIntelBot/0.2 (+local-api)'

createServer(async (req, res) => {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    if (url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, mode: 'local-api-server', hasSearch: true })
    }

    if (url.pathname === '/scrape' && req.method === 'POST') {
      const body = await readJsonBody(req)
      if (!body?.url || typeof body.url !== 'string') return sendJson(res, 400, { error: 'Missing url' })
      return sendJson(res, 200, await scrapeTarget(body.url))
    }

    if (url.pathname === '/search' && req.method === 'POST') {
      const body = await readJsonBody(req)
      if (!body?.query || typeof body.query !== 'string') return sendJson(res, 400, { error: 'Missing query' })
      return sendJson(res, 200, { results: await searchDuckDuckGo(body.query) })
    }

    if (url.pathname === '/enrich' && req.method === 'POST') {
      const body = await readJsonBody(req)
      if (!body?.name || typeof body.name !== 'string') return sendJson(res, 400, { error: 'Missing name' })
      return sendJson(
        res,
        200,
        await enrichLead(
          {
            name: body.name,
            city: typeof body.city === 'string' ? body.city : undefined,
            website: typeof body.website === 'string' ? body.website : undefined,
            instagram: typeof body.instagram === 'string' ? body.instagram : undefined,
            email: typeof body.email === 'string' ? body.email : undefined,
            phone: typeof body.phone === 'string' ? body.phone : undefined,
            notes: typeof body.notes === 'string' ? body.notes : undefined,
          },
          {
            apiKey: headerValue(req.headers['x-openrouter-api-key']),
            model: headerValue(req.headers['x-openrouter-model']) || 'openrouter/auto',
          },
        ),
      )
    }

    if (url.pathname === '/parse-sheet' && req.method === 'POST') {
      const body = await readJsonBody(req)
      if (!body?.fileName || typeof body.fileName !== 'string' || !body?.base64 || typeof body.base64 !== 'string') {
        return sendJson(res, 400, { error: 'Missing fileName or base64' })
      }
      return sendJson(res, 200, await parseXlsxRows(body.fileName, body.base64))
    }

    return sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}).listen(PORT, () => {
  console.log(`Local API server listening on http://localhost:${PORT}`)
})

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-OpenRouter-Api-Key, X-OpenRouter-Model')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : null
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] : value
}

// Contact-page paths to walk in order. Mirrors scraper-core.ts so the local
// server does the same multi-page graph traversal as the deployed worker.
const CONTACT_PATHS = ['', '/contact', '/contact-us', '/about', '/impressum', '/kontakt']

/** Build a same-origin URL for a contact path. Returns null on parse failure. */
function buildSameOriginUrl(base, path) {
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

async function enrichLead(input, ai = {}) {
  const attempts = []

  const searchResults = input.website ? [] : await searchDuckDuckGo(`${input.name} ${input.city ?? ''} official website contact`).catch(() => [])
  const baseUrl = input.website ?? pickBestWebsite(searchResults)
  if (!baseUrl) return { website: input.website, instagram: input.instagram, email: input.email, phone: input.phone, notes: input.notes, attempts }

  // Walk CONTACT_PATHS on the same origin, merging findings as we go.
  // Stop early once we have both an email and a phone — no need to continue.
  const merged = { emails: [], instagram_handles: [], phones: [], addresses: [], title: undefined, description: undefined, raw_text_excerpt: undefined }

  for (const contactPath of CONTACT_PATHS) {
    const target = buildSameOriginUrl(baseUrl, contactPath)
    if (!target) continue

    try {
      const scraped = await scrapeTarget(target)
      attempts.push({ url: target, ok: true, emails: scraped.emails.length, instagrams: scraped.instagram_handles.length, phones: scraped.phones.length })

      merged.emails = uniq([...merged.emails, ...scraped.emails])
      merged.instagram_handles = uniq([...merged.instagram_handles, ...scraped.instagram_handles])
      merged.phones = uniq([...merged.phones, ...scraped.phones])
      merged.addresses = uniq([...merged.addresses, ...scraped.addresses])
      if (!merged.title) merged.title = scraped.title
      if (!merged.description) merged.description = scraped.description
      if (!merged.raw_text_excerpt) merged.raw_text_excerpt = scraped.raw_text_excerpt

      // Early exit — homepage contact page usually has enough.
      if (merged.emails.length > 0 && merged.phones.length > 0) break
    } catch (err) {
      attempts.push({ url: target, ok: false, emails: 0, instagrams: 0, phones: 0, error: err instanceof Error ? err.message : String(err) })
      // 404 on /contact is normal — keep walking.
    }
  }

  const deterministic = {
    website: baseUrl,
    instagram: input.instagram ?? merged.instagram_handles[0],
    email: input.email ?? merged.emails[0],
    phone: input.phone ?? merged.phones[0],
    notes: input.notes ?? merged.description,
    scraped: { ...merged, url: baseUrl, fetched_at: new Date().toISOString() },
    attempts,
  }

  if (!ai.apiKey) return deterministic
  const aiSelection = await selectWithOpenRouter(input, { ...merged, url: baseUrl }, searchResults, ai).catch(() => null)
  if (!aiSelection) return deterministic
  return {
    website: deterministic.website,
    instagram: deterministic.instagram ?? aiSelection.instagram,
    email: deterministic.email ?? aiSelection.email,
    phone: deterministic.phone ?? aiSelection.phone,
    notes: deterministic.notes ?? aiSelection.notes,
    scraped: deterministic.scraped,
    model: aiSelection.model,
    attempts,
  }
}

async function scrapeTarget(target) {
  const parsed = new URL(target)
  const res = await fetch(parsed.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en;q=0.9',
    },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)

  const html = await readHtml(res)
  const decoded = decodeEntities(html)
  const stripped = decoded.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const text = stripped.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const title = extractTitle(decoded)
  const description = extractMeta(decoded, 'description') ?? extractMeta(decoded, 'og:description')
  const emails = uniq(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])
    .filter(email => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(email))
    .filter(email => !/(example|sentry|cloudflare|godaddy|wixpress)/i.test(email))
    .slice(0, 5)
  const igFromLinks = uniq([...decoded.matchAll(/instagram\.com\/([A-Za-z0-9_.]+)\/?/gi)].map(match => match[1])).filter(
    handle => !['p', 'reel', 'tv', 'explore', 'accounts', 'about', 'directory', 'developer'].includes(handle.toLowerCase()),
  )
  const igFromText = uniq((text.match(/(?<![A-Za-z0-9_])@([A-Za-z0-9_.]{2,30})(?![A-Za-z0-9_])/g) ?? []).map(value => value.slice(1)))
  const phones = uniq(
    (text.match(/(?:\+?\d[\d\s()./-]{7,}\d)/g) ?? [])
      .map(value => value.trim())
      .filter(value => {
        const digits = value.replace(/\D/g, '')
        return digits.length >= 8 && digits.length <= 15
      }),
  ).slice(0, 5)

  return {
    url: parsed.toString(),
    fetched_at: new Date().toISOString(),
    emails,
    instagram_handles: uniq([...igFromLinks, ...igFromText]).slice(0, 5),
    phones,
    addresses: extractAddresses(text).slice(0, 3),
    title,
    description,
    raw_text_excerpt: text.slice(0, 1200),
  }
}

async function searchDuckDuckGo(query) {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html',
      'Accept-Language': 'en;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`Search failed: ${res.status} ${res.statusText}`)
  const html = decodeEntities(await res.text())
  const cards = [...html.matchAll(/<div class="result(?:.|\n|\r)*?<\/div>\s*<\/div>/g)].slice(0, 12)
  return uniqByUrl(
    cards
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
      .filter(Boolean),
  ).slice(0, 10)
}

async function parseXlsxRows(fileName, base64) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'venue-intel-sheet-'))
  const tempFile = path.join(tempDir, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`)
  try {
    await writeFile(tempFile, Buffer.from(base64, 'base64'))
    const python = await detectPython()
    const scriptPath = path.join(process.cwd(), 'scripts', 'parse_spreadsheet.py')
    const { stdout } = await execFileAsync(python, [scriptPath, tempFile], { cwd: process.cwd(), maxBuffer: 20 * 1024 * 1024 })
    return JSON.parse(stdout)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function detectPython() {
  const bundled = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'bin', 'python3')
  try {
    await execFileAsync(bundled, ['-c', 'import openpyxl'])
    return bundled
  } catch {
    return 'python3'
  }
}

async function readHtml(res) {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Empty response')
  let received = 0
  const chunks = []
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
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer)
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match ? match[1].trim() : undefined
}

function extractMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["']`, 'i'))
  return match ? match[1].trim() : undefined
}

function extractAddresses(text) {
  return uniq([...text.matchAll(/([^.,;\n]{0,90}(?:Berlin|Paris|Dubai|Amsterdam|Germany|France|UAE|Netherlands)[^.,;\n]{0,90})/gi)].map(match => match[1].trim()))
}

function pickBestWebsite(results) {
  const blacklist = ['instagram.com', 'facebook.com', 'linkedin.com', 'tripadvisor.', 'google.com', 'maps.', 'yelp.']
  return results.find(result => blacklist.every(domain => !result.url.includes(domain)))?.url
}

async function selectWithOpenRouter(input, scraped, searchResults, ai) {
  const prompt = [
    'Return strict JSON only.',
    'Use only the evidence provided. Do not invent websites, emails, phones, handles, or notes.',
    'Choose the best available public contact data for this business.',
    JSON.stringify({ business: input, scraped, searchResults: searchResults.slice(0, 5), outputSchema: { instagram: 'string|null', email: 'string|null', phone: 'string|null', notes: 'string|null' } }, null, 2),
  ].join('\n')
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ai.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ai.model || 'openrouter/auto',
      messages: [
        { role: 'system', content: 'You extract structured business contact data from evidence. Output valid JSON only and leave unknown fields null.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 250,
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`)
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? '{}'
  const parsed = parseJsonObject(content)
  return { instagram: parsed.instagram ?? undefined, email: parsed.email ?? undefined, phone: parsed.phone ?? undefined, notes: parsed.notes ?? undefined, model: data.model }
}

function parseJsonObject(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : content
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  return JSON.parse(start >= 0 && end >= start ? raw.slice(start, end + 1) : raw)
}

function decodeDuckDuckGoUrl(url) {
  const clean = url.replace(/&amp;/g, '&')
  try {
    const parsed = new URL(clean, 'https://duckduckgo.com')
    return parsed.searchParams.get('uddg') ?? clean
  } catch {
    return clean
  }
}

function stripTags(value) {
  return decodeEntities(value).replace(/<[^>]+>/g, ' ')
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&nbsp;/g, ' ')
}

function uniq(items) {
  return Array.from(new Set(items))
}

function uniqByUrl(items) {
  const seen = new Set()
  return items.filter(item => {
    if (!item || seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}
