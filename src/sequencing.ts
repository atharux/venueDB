// Sequencing walking-skeleton. Step 1 (#7): enroll a venue, read the real row
// back. Step 2 (#8): advance through a cadence. Step 3 (#9): cadence content
// is real DB rows (sequences/sequence_steps), not a hardcoded array — a
// picker chooses which sequence to enroll into. Dashboard board (#10) and
// auto-enroll (#11) are next.
//
// Same read/write split as storage.ts: reads go straight to Supabase with the
// anon key (RLS read-only), writes go through the /api/enrollments proxy
// (service_role, passcode-gated).

import type { Venue } from './types'
import { APP_PASSCODE } from './config'

export interface SequenceEnrollment {
  id: string
  venue_id: string
  sequence_id: string
  step_label: string
  state: string
  current_step: number
  created_at: string
}

export interface SequenceRow {
  id: string
  name: string
}

export interface SequenceStepRow {
  id: string
  sequence_id: string
  step_order: number
  day_offset: number
  channel: string
  subject: string
  body: string
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const WRITE_PROXY_URL = '/api/enrollments'

// Same gate as storage.ts's storageMode: this feature only exists when
// Supabase is configured — no localStorage fallback.
export const sequencingEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

function anonHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY!,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  }
}

function proxyHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(APP_PASSCODE ? { 'x-app-passcode': APP_PASSCODE } : {}),
  }
}

// Substitutes the placeholders seeded sequence_steps bodies use. Kept
// deliberately simple — no template engine — since #9 only needs one
// seeded template to prove the DB-backed model.
export function renderStepBody(body: string, venue: Venue): string {
  const firstName = venue.booking_contact?.split(' ')[0] ?? 'team'
  return body.replaceAll('{{firstName}}', firstName).replaceAll('{{venueName}}', venue.name)
}

export async function listSequences(): Promise<SequenceRow[]> {
  if (!sequencingEnabled) return []
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sequences?select=id,name&order=created_at.asc`, {
    headers: anonHeaders(),
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return (await res.json()) as SequenceRow[]
}

export async function getSequenceSteps(sequenceId: string): Promise<SequenceStepRow[]> {
  if (!sequencingEnabled) return []
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sequence_steps?sequence_id=eq.${encodeURIComponent(sequenceId)}&select=*&order=step_order.asc`,
    { headers: anonHeaders() },
  )
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return (await res.json()) as SequenceStepRow[]
}

export async function getLatestEnrollment(venueId: string): Promise<SequenceEnrollment | null> {
  if (!sequencingEnabled) return null
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sequence_enrollments?venue_id=eq.${encodeURIComponent(venueId)}&select=*&order=created_at.desc&limit=1`,
    { headers: anonHeaders() },
  )
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  const rows = (await res.json()) as SequenceEnrollment[]
  return rows[0] ?? null
}

export async function startSequence(
  venueId: string,
  sequenceId: string,
  firstStepLabel: string,
): Promise<SequenceEnrollment> {
  const res = await fetch(WRITE_PROXY_URL, {
    method: 'POST',
    headers: proxyHeaders(),
    body: JSON.stringify({ venue_id: venueId, sequence_id: sequenceId, step_label: firstStepLabel }),
  })
  if (!res.ok) throw new Error(`Write proxy ${res.status}: ${await res.text()}`)
  const rows = (await res.json()) as SequenceEnrollment[]
  return rows[0]
}

// Advances past the step the enrollment is currently on. Caller opens the
// mailto: for the *current* step before calling this — this only mutates
// state. Reaching the end of `steps` sets state to 'done'.
export async function advanceEnrollment(
  enrollment: SequenceEnrollment,
  steps: SequenceStepRow[],
): Promise<SequenceEnrollment> {
  const nextStep = enrollment.current_step + 1
  const atEnd = nextStep >= steps.length
  const patch = atEnd
    ? { current_step: nextStep, state: 'done' }
    : { current_step: nextStep, step_label: steps[nextStep].subject }

  const res = await fetch(`${WRITE_PROXY_URL}?id=${encodeURIComponent(enrollment.id)}`, {
    method: 'PATCH',
    headers: proxyHeaders(),
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`Write proxy ${res.status}: ${await res.text()}`)
  const rows = (await res.json()) as SequenceEnrollment[]
  return rows[0]
}
