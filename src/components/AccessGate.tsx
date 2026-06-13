import { useState } from 'react'
import { APP_PASSCODE } from '../config'

const STORAGE_KEY = 'vi_access_granted'

export function isAccessGranted(): boolean {
  if (!APP_PASSCODE) return true
  try {
    return localStorage.getItem(STORAGE_KEY) === 'yes'
  } catch {
    // Mobile private mode / "Block all cookies" can throw on storage access.
    // Degrade to "not granted" (show the gate) instead of crashing to a blank screen.
    return false
  }
}

interface Props {
  onGranted: () => void
}

export function AccessGate({ onGranted }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  const attempt = () => {
    if (code.trim() === APP_PASSCODE) {
      try { localStorage.setItem(STORAGE_KEY, 'yes') } catch { /* storage blocked — session-only access */ }
      onGranted()
    } else {
      setError(true)
      setShake(true)
      setCode('')
      setTimeout(() => setShake(false), 600)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Space Mono, monospace',
    }}>
      <div
        style={{
          width: 360,
          border: '1px solid #1e2a1e',
          borderTop: '2px solid #06b6d4',
          borderRadius: 6,
          padding: '2rem',
          animation: shake ? 'vi-shake 0.5s ease' : undefined,
        }}
      >
        <style>{`
          @keyframes vi-shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-6px); }
            40%, 80% { transform: translateX(6px); }
          }
        `}</style>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{
            width: 32, height: 32,
            background: 'rgba(6,182,212,0.1)',
            border: '1px solid rgba(6,182,212,0.3)',
            borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, color: '#06b6d4', fontSize: '0.85rem',
          }}>
            VI
          </div>
          <div>
            <div style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 700 }}>Venue Intelligence</div>
            <div style={{ color: '#475569', fontSize: '0.65rem', marginTop: 2 }}>Private access — enter passcode</div>
          </div>
        </div>

        <input
          type="password"
          value={code}
          onChange={e => { setCode(e.target.value); setError(false) }}
          onKeyDown={e => e.key === 'Enter' && attempt()}
          placeholder="Enter access code"
          autoFocus
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: '#0f0f1a',
            border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : '#1e2a1e'}`,
            borderRadius: 4,
            color: '#e2e8f0',
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.85rem',
            padding: '0.65rem 0.75rem',
            outline: 'none',
            marginBottom: '0.75rem',
          }}
        />

        {error && (
          <p style={{ color: '#ef4444', fontSize: '0.65rem', margin: '0 0 0.75rem' }}>
            Incorrect passcode. Contact athar@atharux.com for access.
          </p>
        )}

        <button
          onClick={attempt}
          style={{
            width: '100%',
            padding: '0.65rem',
            background: '#06b6d4',
            border: 'none',
            borderRadius: 4,
            color: '#000',
            fontFamily: 'Space Mono, monospace',
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          ENTER
        </button>

        <p style={{ color: '#374151', fontSize: '0.6rem', textAlign: 'center', marginTop: '1.25rem' }}>
          Looking for the portfolio demo?{' '}
          <a
            href={`${window.location.pathname}?demo=true`}
            style={{ color: '#06b6d4', textDecoration: 'none' }}
          >
            View demo mode →
          </a>
        </p>
      </div>
    </div>
  )
}
