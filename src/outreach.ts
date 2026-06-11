// Outreach templates for Hydrat3 — electrolyte lollipops.
// Pitch: get stocked at nightclubs, festivals, beach clubs, event venues.
// Target contact: events manager, bar manager, F&B buyer, festival director.
// Brand voice: direct, fun, no fluff. Tagline: LICK. DANCE. REPEAT.

import type { Venue } from './types'

export interface Template {
  id: string
  label: string
  channel: 'instagram_dm' | 'email' | 'whatsapp'
  build: (venue: Venue) => string
}

const firstName = (v: Venue) => v.booking_contact?.split(' ')[0] ?? 'team'

const venueType = (v: Venue) =>
  v.tags.includes('FESTIVAL') ? 'festival' :
  v.tags.includes('BEACH_CLUB') ? 'beach club' :
  v.category === 'Nightclub' ? 'club' : 'venue'

export const TEMPLATES: Template[] = [
  {
    id: 'ig-intro-short',
    label: 'IG DM — short intro',
    channel: 'instagram_dm',
    build: v =>
      `Hey ${v.name} ${firstName(v) === 'team' ? 'team' : firstName(v)} — love what you're doing in ${v.city}. ` +
      `We make Hydrat3 — the world's first electrolyte lollipop. Designed for exactly the crowd on your ${v.tags.includes('BEACH_CLUB') ? 'beach' : v.tags.includes('FESTIVAL') ? 'festival grounds' : 'dancefloor'}. ` +
      `LICK. DANCE. REPEAT. Worth a quick chat about stocking us?`,
  },
  {
    id: 'ig-collab',
    label: 'IG DM — product pitch',
    channel: 'instagram_dm',
    build: v =>
      `Hi — following ${v.name} for a while. We're Hydrat3 — electrolyte lollipops built for nightlife and festivals. ` +
      `Vegan, pocket-sized, no mixing. Perfect for a ${v.tags.includes('BEACH_CLUB') ? 'beach bar' : v.tags.includes('FESTIVAL') ? 'festival crowd' : 'club bar or merch table'}. ` +
      `What's the best contact for a trade intro?`,
  },
  {
    id: 'email-trade',
    label: 'Email — trade intro',
    channel: 'email',
    build: v =>
      `Subject: Hydrat3 electrolyte lollipops — stocking opportunity for ${v.name}

Hi ${firstName(v)},

Reaching out because ${v.name} is exactly the kind of ${venueType(v)} we want to be in.

We make Hydrat3 — the world's first electrolyte lollipop. Each one replenishes sodium, potassium, magnesium, zinc, and chloride. No mixing, no bottle. Pocket-sized, heat-resistant, vegan. Built for the 5AM dancefloor moment.

We're currently placing with clubs and festivals across Europe. Happy to send a sample box and trade sheet — takes five minutes to decide if it fits your bar or merch offering.

Worth a look?

Thanks,
[Your name] — Hydrat3
`,
  },
  {
    id: 'email-festival',
    label: 'Email — festival / event angle',
    channel: 'email',
    build: v =>
      `Subject: Hydrat3 x ${v.name} — electrolyte lollipops for your crowd

Hi ${firstName(v)},

${v.name} comes up every time we talk to people who care about their crowd's experience. We make Hydrat3 — electrolyte lollipops — and the use case writes itself: festival-goers, club nights, beach sessions, after-parties.

LICK. DANCE. REPEAT.

We'd love to explore a stocking arrangement or branded partnership for your ${v.tags.includes('FESTIVAL') ? 'next festival run' : 'upcoming season'}. Can I send a sample box and a one-pager on trade terms?

Thanks,
[Your name] — Hydrat3
`,
  },
  {
    id: 'whatsapp-quick',
    label: 'WhatsApp — quick line',
    channel: 'whatsapp',
    build: v =>
      `Hi — reaching out from Hydrat3. We make electrolyte lollipops for nightlife and festival crowds — stocking at clubs across Europe. Could I send a quick intro about ${v.name}? Thanks.`,
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
