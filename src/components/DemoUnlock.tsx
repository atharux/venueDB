import { useEffect, useRef, useState } from 'react'

// Gates a paid feature behind a hidden key sequence — for live sales demos.
// Renders NOTHING when locked: no badge, no lock icon, no input box. A
// prospect watching the screen sees no trace that anything is about to
// appear. Type the sequence anywhere on the page (no field needs focus) and
// it reveals.
//
// This is demo theater, not real security — same posture as APP_PASSCODE
// (client-side, readable in the bundle by anyone who looks). The actual
// write still requires the server-side APP_PASSCODE (see sequencing.ts);
// this only controls whether the UI is visible at all.
//
// Unlock persists for the rest of the browser session (sessionStorage),
// resets on the next visit — matches the NDA/client cookie pattern already
// used by the Worker gate.

const SESSION_KEY = 'vod_sequence_demo_unlocked'
const SEQUENCE = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 's', 'e', 'q']

interface Props {
  children: React.ReactNode
}

export function DemoUnlock({ children }: Props) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === 'true')
  const buffer = useRef<string[]>([])

  useEffect(() => {
    if (unlocked) return
    const handleKeydown = (e: KeyboardEvent) => {
      buffer.current = [...buffer.current, e.key.toLowerCase()].slice(-SEQUENCE.length)
      if (buffer.current.length === SEQUENCE.length && buffer.current.every((k, i) => k === SEQUENCE[i])) {
        sessionStorage.setItem(SESSION_KEY, 'true')
        setUnlocked(true)
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [unlocked])

  if (!unlocked) return null
  return <div className="demo-unlock-reveal">{children}</div>
}
