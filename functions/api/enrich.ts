// Cloudflare Pages Function — POST /api/enrich
//
// The "magic moment" endpoint. Accepts {name, city?, website?, ...} and:
//   1. Discovers the website via DuckDuckGo if missing
//   2. Walks homepage + /contact + /about + /impressum (multi-page scrape)
//   3. Returns merged contact data plus per-URL attempt visibility
// If the request carries an X-OpenRouter-Api-Key header, applies AI selection
// over the scraped evidence for ambiguous cases. Otherwise pure deterministic.

import { enrichLead } from '../../scraper-core'

export const onRequestPost: PagesFunction = async ({ request }) => {
  try {
    const body = (await request.json().catch(() => null)) as {
      name?: unknown
      city?: unknown
      website?: unknown
      instagram?: unknown
      email?: unknown
      phone?: unknown
      notes?: unknown
    } | null

    if (!body?.name || typeof body.name !== 'string') {
      return Response.json({ error: 'Missing name' }, { status: 400 })
    }

    const apiKey = request.headers.get('X-OpenRouter-Api-Key') ?? undefined
    const model = request.headers.get('X-OpenRouter-Model') ?? 'openrouter/auto'

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
      { apiKey, model },
    )

    return Response.json(result)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
