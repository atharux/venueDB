import { useSequenceDemoUnlocked } from '../sequenceDemoUnlock'

// Gates a paid feature behind a hidden key sequence — for live sales demos.
// Renders NOTHING when locked: no badge, no lock icon, no input box. A
// prospect watching the screen sees no trace that anything is about to
// appear.
//
// This is demo theater, not real security — same posture as APP_PASSCODE
// (client-side, readable in the bundle by anyone who looks). The actual
// write still requires the server-side APP_PASSCODE (see sequencing.ts);
// this only controls whether the UI is visible at all.
//
// Unlock state lives in sequenceDemoUnlock.ts (#10) — a shared store, not
// local state, because the Sequences nav tab in App.tsx needs the same
// signal and isn't a descendant of this component.

interface Props {
  children: React.ReactNode
}

export function DemoUnlock({ children }: Props) {
  const unlocked = useSequenceDemoUnlocked()
  if (!unlocked) return null
  return <div className="demo-unlock-reveal">{children}</div>
}
