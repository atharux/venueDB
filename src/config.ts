/**
 * App-level feature flags.
 *
 * isDemoMode: true when ?demo=true in the URL OR VITE_DEMO_MODE=true at build time.
 * - Forces localStorage (seed data only), ignores Supabase entirely.
 * - Safe to share as a public portfolio link.
 *
 * APP_PASSCODE: set VITE_APP_PASSCODE in Cloudflare Pages env vars.
 * - If set, gate the real app behind a passcode screen.
 * - Demo mode bypasses the gate regardless.
 */

export const isDemoMode: boolean =
  import.meta.env.VITE_DEMO_MODE === 'true' ||
  new URLSearchParams(window.location.search).get('demo') === 'true'

export const APP_PASSCODE: string | undefined =
  import.meta.env.VITE_APP_PASSCODE || undefined
