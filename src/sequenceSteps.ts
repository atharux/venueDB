// Sequencing walking-skeleton, step 2 (#8): hardcoded 3-step cadence.
// Content lives in code on purpose — a real sequences/sequence_steps table
// with a template picker is #9, not this step.

import type { Venue } from './types'

export interface SequenceStep {
  dayOffset: number
  channel: 'email'
  subject: string
  body: (venue: Venue) => string
}

const firstName = (v: Venue) => v.booking_contact?.split(' ')[0] ?? 'team'

export const SEQUENCE_STEPS: SequenceStep[] = [
  {
    dayOffset: 0,
    channel: 'email',
    subject: 'Step 1: Intro email',
    body: v =>
      `Hi ${firstName(v)},\n\nReaching out because ${v.name} is exactly the kind of venue we want to be in. ` +
      `We make Hydrat3 — electrolyte lollipops built for nightlife and festivals. Worth a quick chat about stocking us?`,
  },
  {
    dayOffset: 3,
    channel: 'email',
    subject: 'Step 2: Follow-up',
    body: v =>
      `Hi ${firstName(v)},\n\nFollowing up on my note about Hydrat3 for ${v.name} — any thoughts? ` +
      `Happy to send a sample box if that's easier than a call.`,
  },
  {
    dayOffset: 7,
    channel: 'email',
    subject: 'Step 3: Final check-in',
    body: v =>
      `Hi ${firstName(v)},\n\nLast note from me on this — if stocking Hydrat3 at ${v.name} isn't a fit right now, ` +
      `no worries at all. Happy to reconnect down the line.`,
  },
]
