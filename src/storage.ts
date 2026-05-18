// Storage adapter: localStorage by default, Supabase PostgREST when env is set.
//
// The app uses Supabase REST directly via fetch — no @supabase/supabase-js
// dependency. Keeps the bundle small and the install fast. You can swap to
// the SDK later if you need realtime / auth.

import type { Venue } from './types'
import { SEED_VENUES, SEED_VERSION } from './seed'

const LS_KEY = 'crete-nightlife-venues-v1'
const LS_VERSION_KEY = 'crete-nightlife-seed-version'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const storageMode: 'supabase' | 'localStorage' =
  SUPABASE_URL && SUPABASE_ANON_KEY ? 'supabase' : 'localStorage'

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

async function loadSupabase(): Promise<Venue[]> {
  const res = await supabaseFetch('/venues?select=*&order=updated_at.desc')
  return (await res.json()) as Venue[]
}

async function upsertSupabase(venue: Venue): Promise<Venue> {
  try {
    const res = await supabaseFetch('/venues', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(venue),
    })
    const rows = (await res.json()) as Venue[]
    return rows[0] ?? venue
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('custom_fields')) throw error

    const { custom_fields: _ignored, ...fallback } = venue
    const res = await supabaseFetch('/venues', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(fallback),
    })
    const rows = (await res.json()) as Venue[]
    return { ...(rows[0] ?? fallback), custom_fields: venue.custom_fields }
  }
}

async function deleteSupabase(id: string) {
  await supabaseFetch(`/venues?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ---------- Unified API ----------

export async function listVenues(): Promise<Venue[]> {
  if (storageMode === 'supabase') {
    try {
      return await loadSupabase()
    } catch (err) {
      console.warn('Supabase load failed, falling back to localStorage', err)
      return loadLocal()
    }
  }
  return loadLocal()
}

export async function saveVenue(venue: Venue, allVenues: Venue[]): Promise<Venue> {
  if (storageMode === 'supabase') {
    return upsertSupabase(venue)
  }
  saveLocal(allVenues)
  return venue
}

export async function removeVenue(id: string, allVenues: Venue[]): Promise<void> {
  if (storageMode === 'supabase') {
    await deleteSupabase(id)
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
  } else {
    saveLocal(deduped)
  }

  return {
    venues: deduped.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    removed: duplicates.length,
  }
}

export function exportJson(venues: Venue[]) {
  const blob = new Blob([JSON.stringify(venues, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `crete-venues-${new Date().toISOString().slice(0, 10)}.json`
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
