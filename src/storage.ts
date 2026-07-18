// Storage adapter: localStorage by default, Supabase PostgREST when env is set.
//
// The app uses Supabase REST directly via fetch — no @supabase/supabase-js
// dependency. Keeps the bundle small and the install fast. You can swap to
// the SDK later if you need realtime / auth.

import type { Venue } from './types'
import { SEED_VENUES, SEED_VERSION } from './seed'
import { isLikelyPhone, normalizePhone } from './phone'
import { isDemoMode, APP_PASSCODE } from './config'

const LS_KEY = 'crete-nightlife-venues-v1'
const LS_VERSION_KEY = 'crete-nightlife-seed-version'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Supabase writes go through the /api/venues Pages Function, not straight to
// PostgREST: RLS gives anon read-only access, so the anon key cannot write.
// See functions/api/venues.ts.
const WRITE_PROXY_URL = '/api/venues'

// Local SQLite-on-disk store, served by local-api-server.mjs (e.g.
// http://localhost:8787). Used as the persistent backend when Supabase is not
// configured — survives browser clears and has no ~5MB localStorage cap.
const VENUE_API_URL = import.meta.env.VITE_VENUE_API_URL as string | undefined

export const storageMode: 'supabase' | 'local-api' | 'localStorage' =
  isDemoMode
    ? 'localStorage'
    : SUPABASE_URL && SUPABASE_ANON_KEY
      ? 'supabase'
      : VENUE_API_URL
        ? 'local-api'
        : 'localStorage'

// ---------- localStorage adapter ----------

function loadLocal(): Venue[] {
  try {
    const seedVersion = localStorage.getItem(LS_VERSION_KEY)
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) {
      localStorage.setItem(LS_KEY, JSON.stringify(SEED_VENUES))
      localStorage.setItem(LS_VERSION_KEY, String(SEED_VERSION))
      return [...SEED_VENUES]
    }
    const parsed = JSON.parse(raw) as Venue[]
    if (seedVersion !== String(SEED_VERSION)) {
      const merged = mergeSeedVenues(parsed)
      localStorage.setItem(LS_KEY, JSON.stringify(merged))
      localStorage.setItem(LS_VERSION_KEY, String(SEED_VERSION))
      return merged
    }
    return parsed
  } catch {
    return [...SEED_VENUES]
  }
}

function mergeSeedVenues(existing: Venue[]) {
  const deduped = dedupeVenues(existing)
  const map = new Map(deduped.map(venue => [venue.id, venue]))
  const existingKeys = new Set(deduped.map(venueKey))
  for (const seeded of SEED_VENUES) {
    if (!map.has(seeded.id) && !existingKeys.has(venueKey(seeded))) {
      map.set(seeded.id, seeded)
    }
  }
  return Array.from(map.values()).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

function saveLocal(venues: Venue[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(venues))
  } catch (err) {
    console.warn('localStorage write failed', err)
  }
}

// ---------- Supabase PostgREST adapter ----------

async function supabaseFetch(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase not configured')
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Supabase ${res.status}: ${body}`)
  }
  return res
}

// Supabase caps every PostgREST response at 1000 rows server-side, and asking
// for a wider Range does not lift it — a single unbounded request silently
// returned only the first 1000 of 1598 venues. So page until a short page
// arrives.
//
// The sort includes `id` as a tiebreaker on purpose: `updated_at` alone is not
// unique (bulk edits stamp many rows with the same timestamp), and an unstable
// sort lets rows shift between pages, which drops and duplicates records at the
// page boundary.
const SUPABASE_PAGE_SIZE = 1000

async function loadSupabase(): Promise<Venue[]> {
  const all: Venue[] = []
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const to = from + SUPABASE_PAGE_SIZE - 1
    const res = await supabaseFetch('/venues?select=*&order=updated_at.desc,id.desc', {
      headers: { 'Range-Unit': 'items', Range: `${from}-${to}` },
    })
    const page = (await res.json()) as Venue[]
    all.push(...page)
    if (page.length < SUPABASE_PAGE_SIZE) return all
    // Belt-and-braces: never spin forever if the server ignores Range.
    if (all.length > 100_000) {
      console.warn('loadSupabase: stopping at 100k rows — Range paging may not be honoured')
      return all
    }
  }
}

// ---------- Write proxy (service_role, server-side) ----------

async function proxyFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${WRITE_PROXY_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      // Echoed back to the Pages Function, which compares it to the server-side
      // APP_PASSCODE secret. Undefined when no passcode is configured (local
      // dev) — the proxy then refuses the write rather than defaulting to open.
      ...(APP_PASSCODE ? { 'x-app-passcode': APP_PASSCODE } : {}),
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Write proxy ${res.status}: ${body}`)
  }
  return res
}

async function upsertSupabase(venue: Venue): Promise<Venue> {
  try {
    const res = await proxyFetch('', {
      method: 'POST',
      body: JSON.stringify({ venues: [venue] }),
    })
    const rows = (await res.json()) as Venue[]
    return rows[0] ?? venue
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('custom_fields')) throw error

    const { custom_fields: _ignored, ...fallback } = venue
    const res = await proxyFetch('', {
      method: 'POST',
      body: JSON.stringify({ venues: [fallback] }),
    })
    const rows = (await res.json()) as Venue[]
    return { ...(rows[0] ?? fallback), custom_fields: venue.custom_fields }
  }
}

async function patchSupabase(id: string, patch: Record<string, unknown>) {
  await proxyFetch(`?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

async function deleteSupabase(id: string) {
  await proxyFetch(`?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ---------- Local API (SQLite on disk) adapter ----------

function venueApiUrl(path: string) {
  return `${(VENUE_API_URL ?? '').replace(/\/$/, '')}${path}`
}

async function loadLocalApi(): Promise<Venue[]> {
  const res = await fetch(venueApiUrl('/venues'))
  if (!res.ok) throw new Error(`Local API ${res.status}: ${await res.text()}`)
  return (await res.json()) as Venue[]
}

// Mirrors localStorage semantics: persist the full venue list in one call.
async function bulkReplaceLocalApi(venues: Venue[]): Promise<void> {
  const res = await fetch(venueApiUrl('/venues/bulk'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ venues }),
  })
  if (!res.ok) throw new Error(`Local API ${res.status}: ${await res.text()}`)
}

// ---------- Unified API ----------

export async function listVenues(): Promise<Venue[]> {
  // No silent fallback to localStorage when a remote backend is configured.
  // It used to return the 28 seed venues on any failure, so a total backend
  // outage (e.g. Supabase free-tier auto-pause, which pulls the project's DNS)
  // looked exactly like "the database lost all its records". Let the error
  // reach useVenues so App renders the error banner and the real data stays
  // visibly absent rather than silently replaced.
  if (storageMode === 'supabase') {
    try {
      return await loadSupabase()
    } catch (err) {
      throw new Error(
        `Could not reach the venue database — your data is not lost, the backend is unreachable. ` +
          `Check the Supabase project is not paused. (${err instanceof Error ? err.message : String(err)})`,
      )
    }
  }
  if (storageMode === 'local-api') {
    try {
      return await loadLocalApi()
    } catch (err) {
      throw new Error(
        `Could not reach the local venue API at ${VENUE_API_URL} — your data is not lost, the server is unreachable. ` +
          `(${err instanceof Error ? err.message : String(err)})`,
      )
    }
  }
  return loadLocal()
}

export async function saveVenue(venue: Venue, allVenues: Venue[]): Promise<Venue> {
  if (storageMode === 'supabase') {
    return upsertSupabase(venue)
  }
  if (storageMode === 'local-api') {
    await bulkReplaceLocalApi(allVenues)
    return venue
  }
  saveLocal(allVenues)
  return venue
}

export async function removeVenue(id: string, allVenues: Venue[]): Promise<void> {
  if (storageMode === 'supabase') {
    await deleteSupabase(id)
    return
  }
  if (storageMode === 'local-api') {
    await bulkReplaceLocalApi(allVenues)
    return
  }
  saveLocal(allVenues)
}

export async function restoreSeedVenues(currentVenues: Venue[]): Promise<Venue[]> {
  const deduped = dedupeVenues(currentVenues)
  const merged = mergeSeedVenues(deduped)
  if (storageMode === 'supabase') {
    const originalById = new Map(currentVenues.map(venue => [venue.id, venue]))
    const dedupedIds = new Set(deduped.map(venue => venue.id))
    const duplicates = currentVenues.filter(venue => !dedupedIds.has(venue.id))
    const existingIds = new Set(deduped.map(venue => venue.id))
    const existingKeys = new Set(deduped.map(venueKey))
    const missing = SEED_VENUES.filter(venue => !existingIds.has(venue.id) && !existingKeys.has(venueKey(venue)))

    for (const venue of deduped) {
      const before = originalById.get(venue.id)
      if (!before || JSON.stringify(before) !== JSON.stringify(venue)) {
        await upsertSupabase(venue)
      }
    }

    for (const venue of missing) {
      await upsertSupabase(venue)
    }

    for (const duplicate of duplicates) {
      await deleteSupabase(duplicate.id)
    }

    return merged
  }

  if (storageMode === 'local-api') {
    await bulkReplaceLocalApi(merged)
    return merged
  }

  saveLocal(merged)
  localStorage.setItem(LS_VERSION_KEY, String(SEED_VERSION))
  return merged
}

export async function deleteDuplicateVenues(currentVenues: Venue[]) {
  const deduped = dedupeVenues(currentVenues)
  const dedupedIds = new Set(deduped.map(venue => venue.id))
  const duplicates = currentVenues.filter(venue => !dedupedIds.has(venue.id))

  if (storageMode === 'supabase') {
    const originalById = new Map(currentVenues.map(venue => [venue.id, venue]))

    for (const venue of deduped) {
      const before = originalById.get(venue.id)
      if (!before || JSON.stringify(before) !== JSON.stringify(venue)) {
        await upsertSupabase(venue)
      }
    }

    for (const duplicate of duplicates) {
      await deleteSupabase(duplicate.id)
    }
  } else if (storageMode === 'local-api') {
    await bulkReplaceLocalApi(deduped)
  } else {
    saveLocal(deduped)
  }

  return {
    venues: deduped.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    removed: duplicates.length,
  }
}

/**
 * Clear phone values that fail validation (scraped junk: coordinates, year
 * ranges, dates, prices) and normalize whitespace on the valid ones.
 *
 * Supabase note: the regular upsert path can't clear a column — JSON omits
 * undefined keys, so PostgREST leaves the old value in place. Clearing
 * requires an explicit `phone: null` PATCH per affected row.
 */
export async function clearInvalidPhones(currentVenues: Venue[]) {
  const now = new Date().toISOString()
  const toClear: Venue[] = []
  const toNormalize: Venue[] = []
  for (const v of currentVenues) {
    if (!v.phone) continue
    if (!isLikelyPhone(v.phone)) toClear.push(v)
    else if (normalizePhone(v.phone) !== v.phone) toNormalize.push(v)
  }

  const clearedIds = new Set(toClear.map(v => v.id))
  const normalizedIds = new Set(toNormalize.map(v => v.id))
  const next = currentVenues.map(v => {
    if (clearedIds.has(v.id)) return { ...v, phone: undefined, updated_at: now }
    if (normalizedIds.has(v.id)) return { ...v, phone: normalizePhone(v.phone!), updated_at: now }
    return v
  })

  if (storageMode === 'supabase') {
    for (const v of toClear) {
      await patchSupabase(v.id, { phone: null, updated_at: now })
    }
    for (const v of toNormalize) {
      await patchSupabase(v.id, { phone: normalizePhone(v.phone!), updated_at: now })
    }
  } else if (storageMode === 'local-api') {
    await bulkReplaceLocalApi(next)
  } else {
    saveLocal(next)
  }

  return { venues: next, cleared: toClear.length, normalized: toNormalize.length }
}

export function exportJson(venues: Venue[]) {
  const blob = new Blob([JSON.stringify(venues, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `venues-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportCsv(venues: Venue[]) {
  const COLS: Array<{ header: string; get: (v: Venue) => string }> = [
    { header: 'name', get: v => v.name },
    { header: 'city', get: v => v.city },
    { header: 'district', get: v => v.district ?? '' },
    { header: 'category', get: v => v.category },
    { header: 'entity_type', get: v => v.entity_type ?? 'venue' },
    { header: 'status', get: v => v.status },
    { header: 'website', get: v => v.website ?? '' },
    { header: 'email', get: v => v.email ?? '' },
    { header: 'instagram', get: v => v.instagram ?? '' },
    { header: 'facebook', get: v => v.facebook ?? '' },
    { header: 'phone', get: v => v.phone ?? '' },
    { header: 'booking_contact', get: v => v.booking_contact ?? '' },
    { header: 'music_type', get: v => v.music_type ?? '' },
    { header: 'has_djs', get: v => v.has_djs ? 'true' : 'false' },
    { header: 'has_events', get: v => v.has_events ? 'true' : 'false' },
    { header: 'has_audio', get: v => v.has_audio ? 'true' : 'false' },
    { header: 'outdoor', get: v => v.outdoor ? 'true' : 'false' },
    { header: 'tourist_area', get: v => v.tourist_area ? 'true' : 'false' },
    { header: 'luxury_score', get: v => String(v.luxury_score) },
    { header: 'tags', get: v => (v.tags ?? []).join(';') },
    { header: 'notes', get: v => v.notes ?? '' },
    { header: 'last_contacted', get: v => v.last_contacted ?? '' },
    { header: 'source', get: v => v.source ?? '' },
    { header: 'created_at', get: v => v.created_at },
    { header: 'updated_at', get: v => v.updated_at },
  ]

  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`
  const header = COLS.map(c => escape(c.header)).join(',')
  const rows = venues.map(v => COLS.map(c => escape(c.get(v))).join(','))
  const csv = [header, ...rows].join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `venues-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function resetLocalToSeed() {
  if (storageMode !== 'localStorage') return
  localStorage.removeItem(LS_KEY)
  localStorage.removeItem(LS_VERSION_KEY)
}

function dedupeVenues(venues: Venue[]) {
  const byKey = new Map<string, Venue>()

  for (const venue of venues) {
    const key = venueKey(venue)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, venue)
      continue
    }
    byKey.set(key, mergeVenueRecords(existing, venue))
  }

  return Array.from(byKey.values())
}

function venueKey(venue: Pick<Venue, 'name' | 'city'>) {
  return `${venue.name.trim().toLowerCase()}::${venue.city.trim().toLowerCase()}`
}

function mergeVenueRecords(a: Venue, b: Venue): Venue {
  const preferred = venueScore(b) > venueScore(a) ? b : a
  const other = preferred === a ? b : a

  return {
    ...other,
    ...preferred,
    district: preferred.district ?? other.district,
    website: preferred.website ?? other.website,
    instagram: preferred.instagram ?? other.instagram,
    email: preferred.email ?? other.email,
    phone: preferred.phone ?? other.phone,
    booking_contact: preferred.booking_contact ?? other.booking_contact,
    music_type: preferred.music_type ?? other.music_type,
    notes: preferred.notes ?? other.notes,
    last_contacted: preferred.last_contacted ?? other.last_contacted,
    source: preferred.source ?? other.source,
    custom_fields: {
      ...(other.custom_fields ?? {}),
      ...(preferred.custom_fields ?? {}),
    },
    tags: Array.from(new Set([...(other.tags ?? []), ...(preferred.tags ?? [])])),
    has_djs: preferred.has_djs || other.has_djs,
    has_events: preferred.has_events || other.has_events,
    has_audio: preferred.has_audio || other.has_audio,
    outdoor: preferred.outdoor || other.outdoor,
    tourist_area: preferred.tourist_area || other.tourist_area,
    luxury_score: Math.max(preferred.luxury_score, other.luxury_score) as Venue['luxury_score'],
    created_at:
      preferred.created_at < other.created_at ? preferred.created_at : other.created_at,
    updated_at:
      preferred.updated_at > other.updated_at ? preferred.updated_at : other.updated_at,
  }
}

function venueScore(venue: Venue) {
  return [
    venue.website,
    venue.instagram,
    venue.email,
    venue.phone,
    venue.booking_contact,
    venue.music_type,
    venue.notes,
    venue.last_contacted,
  ].filter(Boolean).length + venue.tags.length + Object.keys(venue.custom_fields ?? {}).length
}
