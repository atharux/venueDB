// Sequencing walking-skeleton, step 1 (#7): enroll a venue in a single
// hardcoded step and read the real row back. No multi-step logic, no
// templates — see functions/api/enrollments.ts and issues #8/#9 for the rest.
//
// Same read/write split as storage.ts: reads go straight to Supabase with the
// anon key (RLS read-only), writes go through the /api/enrollments proxy
// (service_role, passcode-gated).

import { APP_PASSCODE } from './config'

export interface SequenceEnrollment {
  id: string
  venue_id: string
  step_label: string
  state: string
  created_at: string
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const WRITE_PROXY_URL = '/api/enrollments'

// Same gate as storage.ts's storageMode: this feature only exists when
// Supabase is configured — no localStorage fallback for step 1.
export const sequencingEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

const FIRST_STEP_LABEL = 'Step 1: Intro email'

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
    headers: {
      'Content-Type': 'application/json',
      ...(APP_PASSCODE ? { 'x-app-passcode': APP_PASSCODE } : {}),
    },
    body: JSON.stringify({ venue_id: venueId, step_label: FIRST_STEP_LABEL }),
  })
  if (!res.ok) throw new Error(`Write proxy ${res.status}: ${await res.text()}`)
  const rows = (await res.json()) as SequenceEnrollment[]
  return rows[0]
}
