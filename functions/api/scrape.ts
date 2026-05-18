// Cloudflare Pages Function — POST /api/scrape
//
// Wraps the shared scraper-core so the same logic runs in:
//   - Vite middleware (npm run dev)
//   - local-api-server.mjs (npm run local-api)
//   - here (production on Cloudflare Pages)
// One implementation, three runtimes. The frontend never knows the difference.

import { scrapeTarget } from '../../scraper-core'

export const onRequestPost: PagesFunction = async ({ request }) => {
  try {
    const body = (await request.json().catch(() => null)) as { url?: unknown } | null
    if (!body?.url || typeof body.url !== 'string') {
      return Response.json({ error: 'Missing url' }, { status: 400 })
    }
    const result = await scrapeTarget(body.url)
    return Response.json(result)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
