import { execFile, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { enrichLead, scrapeTarget, searchDuckDuckGo } from './scraper-core'

const execFileAsync = promisify(execFile)

function intelApiPlugin() {
  const attach = (middlewares: {
    use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void) => void
  }) => {
    middlewares.use('/api/health', async (_req, res) => {
      sendJson(res, 200, { ok: true, mode: 'local-vite-scraper', hasSearch: true })
    })

    middlewares.use('/api/scrape', async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      try {
        const body = (await readJsonBody(req)) as { url?: unknown } | null
        if (!body?.url || typeof body.url !== 'string') {
          sendJson(res, 400, { error: 'Missing url' })
          return
        }
        const result = await scrapeTarget(body.url)
        sendJson(res, 200, result)
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    })

    middlewares.use('/api/search', async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      try {
        const body = (await readJsonBody(req)) as { query?: unknown } | null
        if (!body?.query || typeof body.query !== 'string') {
          sendJson(res, 400, { error: 'Missing query' })
          return
        }
        const results = await searchDuckDuckGo(body.query)
        sendJson(res, 200, { results })
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    })

    middlewares.use('/api/enrich', async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      try {
        const body = (await readJsonBody(req)) as {
          name?: unknown
          city?: unknown
          website?: unknown
          instagram?: unknown
          email?: unknown
          phone?: unknown
          notes?: unknown
        } | null
        if (!body?.name || typeof body.name !== 'string') {
          sendJson(res, 400, { error: 'Missing name' })
          return
        }

        const result = await enrichLead(
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
            // Read from process.env so local dev mirrors Cloudflare's env binding.
            // Set BRAVE_API_KEY in your shell or a .env.local Vite picks up.
            braveApiKey: process.env.BRAVE_API_KEY,
          },
        )
        sendJson(res, 200, result)
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    })

    middlewares.use('/api/parse-sheet', async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      try {
        const body = (await readJsonBody(req)) as { fileName?: unknown; base64?: unknown } | null
        if (!body?.fileName || typeof body.fileName !== 'string' || !body?.base64 || typeof body.base64 !== 'string') {
          sendJson(res, 400, { error: 'Missing fileName or base64' })
          return
        }

        const result = await parseXlsxRows(body.fileName, body.base64)
        sendJson(res, 200, result)
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    })
  }

  return {
    name: 'venue-intel-api',
    configureServer(server: { middlewares: typeof attach extends (arg: infer A) => void ? A : never }) {
      attach(server.middlewares)
    },
    configurePreviewServer(server: { middlewares: typeof attach extends (arg: infer A) => void ? A : never }) {
      attach(server.middlewares)
    },
  }
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? (JSON.parse(raw) as unknown) : null
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

async function parseXlsxRows(fileName: string, base64: string) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'venue-intel-sheet-'))
  const tempFile = path.join(tempDir, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`)

  try {
    await writeFile(tempFile, Buffer.from(base64, 'base64'))
    const python = await detectPython()
    const scriptPath = path.join(process.cwd(), 'scripts', 'parse_spreadsheet.py')
    const { stdout } = await execFileAsync(python, [scriptPath, tempFile], {
      cwd: process.cwd(),
      maxBuffer: 20 * 1024 * 1024,
    })
    return JSON.parse(stdout) as { sheetName?: string; rows: string[][] }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function detectPython() {
  const bundled = path.join(
    os.homedir(),
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'python',
    'bin',
    'python3',
  )

  try {
    await execFileAsync(bundled, ['-c', 'import openpyxl'])
    return bundled
  } catch {
    return 'python3'
  }
}

/**
 * Deployment stamp shown next to the app name in the header. package.json
 * stays at 0.0.0, so the git short SHA is the honest version identifier;
 * Pages rebuilds on every push, so build date == deployment date.
 */
function gitShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  plugins: [react(), intelApiPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(gitShortSha()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
})
