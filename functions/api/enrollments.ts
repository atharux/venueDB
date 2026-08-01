// Cloudflare Pages Function — write proxy for the sequence_enrollments table.
//
// Same split as functions/api/venues.ts: reads go browser → Supabase directly
// with the anon key (RLS: read-only, see supabase/migrations/0004_sequence_enrollments.sql).
// Writes come here instead, service_role, so the anon key never gets insert.
//
// Walking-skeleton step 1 (#7): a single hardcoded-content insert. No
// multi-step logic, no advancing — see #8/#9 for the real sequence model.

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

// POST /api/enrollments  { venue_id: string, step_label: string }
// Inserts one enrollment row. state defaults to 'active' in the DB.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const denied = authorize(request, env)
  if (denied) return denied

  let payload: { venue_id?: unknown; step_label?: unknown }
  try {
    payload = await request.json()
  } catch {
    return bad(400, 'Body must be JSON')
  }

  const { venue_id, step_label } = payload
  if (typeof venue_id !== 'string' || !venue_id) {
    return bad(400, 'Body must include venue_id (string)')
  }
  if (typeof step_label !== 'string' || !step_label) {
    return bad(400, 'Body must include step_label (string)')
  }

  return supabase(env, '/sequence_enrollments', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ venue_id, step_label }]),
  })
}
