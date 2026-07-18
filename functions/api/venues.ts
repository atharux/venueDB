// Cloudflare Pages Function — write proxy for the venues table.
//
// Reads still go browser → Supabase directly with the anon key (RLS: read-only,
// see supabase/migrations/0003_rls_anon_readonly.sql). Writes come here instead,
// because the anon key ships in the public JS bundle and this repo is public —
// anon must never hold insert/update/delete on a table with 1.5k client records.
//
// The service_role key bypasses RLS, so it lives only in Cloudflare's secret
// store and never reaches the client.
//
// Scope is deliberately narrow: upsert rows, patch one row, delete one row by
// id. There is no unbounded-delete route — a stolen passcode can damage rows one
// call at a time, not drop the table in a single request.
//
// Auth is the app passcode, which is a real but limited control: VITE_APP_PASSCODE
// is baked into the client bundle, so anyone who can load the app can read it.
// It raises the bar from "anon key is published in the repo" to "must extract the
// passcode from the bundle", and it gives us a single choke point to revoke or
// rate-limit. It is not a substitute for per-user auth — see DEPLOY.md.

interface Env {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  APP_PASSCODE?: string
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function bad(status: number, message: string) {
  return Response.json({ error: message }, { status })
}

// Fail closed: a missing passcode/secret must never mean "open to the world".
function authorize(request: Request, env: Env): Response | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return bad(503, 'Write proxy not configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')
  }
  if (!env.APP_PASSCODE) {
    return bad(503, 'Write proxy not configured: APP_PASSCODE missing')
  }
  if (request.headers.get('x-app-passcode') !== env.APP_PASSCODE) {
    return bad(401, 'Unauthorized')
  }
  return null
}

async function supabase(env: Env, path: string, init: RequestInit) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
      ...JSON_HEADERS,
      ...(init.headers || {}),
    },
  })
  const body = await res.text()
  return new Response(body, {
    status: res.status,
    headers: JSON_HEADERS,
  })
}

// POST /api/venues  { venues: Venue[] } — upsert (insert or merge on id).
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const denied = authorize(request, env)
  if (denied) return denied

  let payload: { venues?: unknown }
  try {
    payload = await request.json()
  } catch {
    return bad(400, 'Body must be JSON')
  }

  const venues = payload.venues
  if (!Array.isArray(venues) || venues.length === 0) {
    return bad(400, 'Body must be { venues: [...] } with at least one row')
  }

  return supabase(env, '/venues', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(venues),
  })
}

// PATCH /api/venues?id=<id> — update columns on exactly one row.
// Needed because an upsert can't null a column: JSON drops undefined keys, so
// PostgREST would leave the old value in place (see clearInvalidPhones).
export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const denied = authorize(request, env)
  if (denied) return denied

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return bad(400, 'Missing ?id=')

  let patch: unknown
  try {
    patch = await request.json()
  } catch {
    return bad(400, 'Body must be JSON')
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return bad(400, 'Body must be a JSON object')
  }

  return supabase(env, `/venues?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
}

// DELETE /api/venues?id=<id> — single row only, by design.
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const denied = authorize(request, env)
  if (denied) return denied

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return bad(400, 'Missing ?id=')

  return supabase(env, `/venues?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  })
}
