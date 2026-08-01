// Sequencing walking-skeleton. Step 1 (#7): enroll a venue, read the real row
// back. Step 2 (#8): advance through the hardcoded cadence in sequenceSteps.ts.
// Real sequences/sequence_steps tables + template picker land in #9.
//
// Same read/write split as storage.ts: reads go straight to Supabase with the
// anon key (RLS read-only), writes go through the /api/enrollments proxy
// (service_role, passcode-gated).

import { APP_PASSCODE } from './config'
import { SEQUENCE_STEPS } from './sequenceSteps'

export interface SequenceEnrollment {
  id: string
  venue_id: string
  step_label: string
  state: string
  current_step: number
  created_at: string
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const WRITE_PROXY_URL = '/api/enrollments'

// Same gate as storage.ts's storageMode: this feature only exists when
// Supabase is configured — no localStorage fallback for step 1.
export const sequencingEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

function proxyHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(APP_PASSCODE ? { 'x-app-passcode': APP_PASSCODE } : {}),
  }
}

export async function getLatestEnrollment(venueId: string): Promise<SequenceEnrollment | null> {
  if (!sequencingEnabled) return null
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sequence_enrollments?venue_id=eq.${encodeURIComponent(venueId)}&select=*&order=created_at.desc&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    },
  )
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  const rows = (await res.json()) as SequenceEnrollment[]
  return rows[0] ?? null
}

export async function startSequence(venueId: string): Promise<SequenceEnrollment> {
  const res = await fetch(WRITE_PROXY_URL, {
    method: 'POST',
    headers: proxyHeaders(),
    body: JSON.stringify({ venue_id: venueId, step_label: SEQUENCE_STEPS[0].subject }),
  })
  if (!res.ok) throw new Error(`Write proxy ${res.status}: ${await res.text()}`)
  const rows = (await res.json()) as SequenceEnrollment[]
  return rows[0]
}

// Advances past the step the enrollment is currently on. Caller is
// responsible for opening the mailto: for the *current* step before calling
// this — this only mutates state. Reaching the end of SEQUENCE_STEPS sets
// state to 'done'; the UI stops offering Advance once state === 'done'.
export async function advanceEnrollment(enrollment: SequenceEnrollment): Promise<SequenceEnrollment> {
  const nextStep = enrollment.current_step + 1
  const atEnd = nextStep >= SEQUENCE_STEPS.length
  const patch = atEnd
    ? { current_step: nextStep, state: 'done' }
    : { current_step: nextStep, step_label: SEQUENCE_STEPS[nextStep].subject }

  const res = await fetch(`${WRITE_PROXY_URL}?id=${encodeURIComponent(enrollment.id)}`, {
    method: 'PATCH',
    headers: proxyHeaders(),
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`Write proxy ${res.status}: ${await res.text()}`)
  const rows = (await res.json()) as SequenceEnrollment[]
  return rows[0]
}
