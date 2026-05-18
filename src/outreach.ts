// Outreach templates. UX writing rules applied: brevity, plain language, no
// fake exclamations, no marketing fluff. Each template is short enough to
// paste into Instagram DM (~1000 char limit safe).

import type { Venue } from './types'

export interface Template {
  id: string
  label: string
  channel: 'instagram_dm' | 'email' | 'whatsapp'
  build: (venue: Venue) => string
}

const firstName = (v: Venue) => v.booking_contact?.split(' ')[0] ?? 'team'

export const TEMPLATES: Template[] = [
  {
    id: 'ig-intro-short',
    label: 'IG DM — short intro',
    channel: 'instagram_dm',
    build: v =>
      `Hey ${v.name} ${firstName(v) === 'team' ? 'team' : firstName(v)} — love what you’re doing in ${v.city}. ` +
      `I run a roster of DJs that fit ${v.tags.includes('SUNSET') ? 'sunset sessions' : v.tags.includes('BEACH_CLUB') ? 'beach club programming' : 'venues like yours'}. ` +
      `Open to a quick chat about summer dates?`,
  },
  {
    id: 'ig-collab',
    label: 'IG DM — collab pitch',
    channel: 'instagram_dm',
    build: v =>
      `Hi — following ${v.name} for a while. We work with DJs and event partners across Greece and the wider Med. ` +
      `Few ideas that could fit your ${v.tags.includes('BEACH_CLUB') ? 'beach' : ''} programming — happy to send over a one-pager. ` +
      `Best inbox for that?`,
  },
  {
    id: 'email-bookings',
    label: 'Email — bookings intro',
    channel: 'email',
    build: v =>
      `Subject: DJ programming for ${v.name} — summer 2026

Hi ${firstName(v)},

I work with a curated roster of DJs that programs venues across the Mediterranean. Following ${v.name} for a while — the ${v.tags.includes('SUNSET') ? 'sunset' : v.tags.includes('BEACH_CLUB') ? 'beachfront' : ''} vibe fits what we do.

Would it be useful to share a short deck with sample mixes, references from comparable venues, and indicative fees for the summer window?

Happy to keep it to one page.

Thanks,
[Your name]
`,
  },
  {
    id: 'email-wedding',
    label: 'Email — weddings angle',
    channel: 'email',
    build: v =>
      `Subject: Destination wedding entertainment — ${v.name}

Hi ${firstName(v)},

${v.name} comes up regularly when couples ask us about ${v.city} for destination weddings. We provide DJs and live acts that travel for these — usually as part of a package with planners.

If it would be useful, I can share our preferred-vendor sheet and a short cut of recent weddings (with planner references).

Thanks,
[Your name]
`,
  },
  {
    id: 'whatsapp-quick',
    label: 'WhatsApp — quick line',
    channel: 'whatsapp',
    build: v =>
      `Hi — DJ booking agency reaching out re: ${v.name}. Could I send you a short intro about summer dates? Cheers.`,
  },
]

export function instagramUrl(handle?: string): string | null {
  if (!handle) return null
  const clean = handle.trim().replace(/^@/, '')
  if (!clean) return null
  return `https://www.instagram.com/${encodeURIComponent(clean)}/`
}

/**
 * Accepts either a full Facebook URL ("https://facebook.com/cabanamare") or a
 * bare page slug ("cabanamare"). Returns a usable https URL or null.
 */
export function facebookUrl(value?: string): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const slug = trimmed.replace(/^@/, '').replace(/^facebook\.com\//i, '').replace(/^\/+/, '')
  if (!slug) return null
  return `https://www.facebook.com/${encodeURIComponent(slug)}/`
}

/** Normalize a URL string for a clickable "Open" link from any input shape. */
export function websiteUrl(value?: string): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.includes('.')) return `https://${trimmed}`
  return null
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
