// Shared unlock state for the sequencing paid-feature demo gate. Moved out
// of DemoUnlock.tsx (#10) because the Sequences nav tab (App.tsx) also needs
// to know whether it's unlocked, and it isn't a descendant of any single
// OutreachPanel — a plain external store keeps both in sync without a
// Context provider. Same hidden-key-sequence trigger as before; see
// DemoUnlock.tsx for the "why" (demo theater, not real security).

import { useSyncExternalStore } from 'react'

const SESSION_KEY = 'vod_sequence_demo_unlocked'
const SEQUENCE = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 's', 'e', 'q']

let unlocked = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === 'true'
let buffer: string[] = []
const listeners = new Set<() => void>()

function handleKeydown(e: KeyboardEvent) {
  if (unlocked) return
  buffer = [...buffer, e.key.toLowerCase()].slice(-SEQUENCE.length)
  if (buffer.length === SEQUENCE.length && buffer.every((k, i) => k === SEQUENCE[i])) {
    unlocked = true
    sessionStorage.setItem(SESSION_KEY, 'true')
    listeners.forEach(l => l())
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', handleKeydown)
}

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function getSnapshot() {
  return unlocked
}

export function useSequenceDemoUnlocked(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
