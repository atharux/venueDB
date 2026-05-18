// Cloudflare Pages Function — POST /api/search
//
// Same DuckDuckGo HTML scrape used in dev. Returns the curated SearchResult[]
// shape that the frontend already knows how to render.

import { searchDuckDuckGo } from '../../scraper-core'

export const onRequestPost: PagesFunction = async ({ request }) => {
  try {
    const body = (await request.json().catch(() => null)) as { query?: unknown } | null
    if (!body?.query || typeof body.query !== 'string') {
      return Response.json({ error: 'Missing query' }, { status: 400 })
    }
    const results = await searchDuckDuckGo(body.query)
    return Response.json({ results })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
