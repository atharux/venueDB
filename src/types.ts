// Crete Nightlife Intelligence - core types
// Schema derived 1:1 from venue-outreach-DB.md spec.

export const CITIES = [
  // Germany
  'Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt',
  // France
  'Paris', 'Lyon', 'Marseille', 'Nice',
  // UK
  'London', 'Manchester', 'Bristol', 'Glasgow',
  // Netherlands
  'Amsterdam', 'Rotterdam', 'Utrecht',
  // UAE
  'Dubai', 'Abu Dhabi',
  // Spain
  'Barcelona', 'Madrid', 'Ibiza',
  // Italy
  'Milan', 'Rome', 'Naples', 'Florence',
  // Sardinia
  'Sardinia', 'Cagliari', 'Olbia', 'Porto Cervo', 'Sassari', 'Alghero', 'La Maddalena',
  // Portugal
  'Lisbon', 'Porto',
  // Greece — Crete
  'Chania', 'Heraklion', 'Hersonissos', 'Malia', 'Rethymno',
  'Agios Nikolaos', 'Elounda', 'Makrigialos', 'Ammoudara',
  'Other',
] as const
export type City = (typeof CITIES)[number] | (string & {})

/**
 * City → region grouping. A "region" is the level of geography that makes
 * outreach sense for a single rep: Crete groups all Cretan cities, "Germany"
 * groups Berlin/Hamburg/Munich/etc, "UK" groups London. The granularity is
 * intentionally mixed (island vs country) so each market collapses to the
 * cluster a user would actually filter by.
 *
 * Cities not in the map fall through to "Other" via getRegion(). Add new
 * entries here as you import data from new markets — no schema change.
 */
export const CITY_TO_REGION: Record<string, string> = {
  // Greece — Crete grouped as one region
  Chania: 'Crete',
  Heraklion: 'Crete',
  Hersonissos: 'Crete',
  Malia: 'Crete',
  Rethymno: 'Crete',
  'Agios Nikolaos': 'Crete',
  Elounda: 'Crete',
  Makrigialos: 'Crete',
  Ammoudara: 'Crete',
  // Germany
  Berlin: 'Germany',
  Hamburg: 'Germany',
  Munich: 'Germany',
  Cologne: 'Germany',
  Frankfurt: 'Germany',
  // France
  Paris: 'France',
  Lyon: 'France',
  Marseille: 'France',
  Nice: 'France',
  // UK
  London: 'UK',
  Manchester: 'UK',
  Bristol: 'UK',
  Glasgow: 'UK',
  // Netherlands
  Amsterdam: 'Netherlands',
  Rotterdam: 'Netherlands',
  Utrecht: 'Netherlands',
  // UAE
  Dubai: 'UAE',
  'Abu Dhabi': 'UAE',
  // Spain
  Barcelona: 'Spain',
  Madrid: 'Spain',
  Ibiza: 'Spain',
  // Italy
  Milan: 'Italy',
  Rome: 'Italy',
  Naples: 'Italy',
  Florence: 'Italy',
  // Sardinia (treated as its own market like Crete)
  Sardinia: 'Sardinia',
  Cagliari: 'Sardinia',
  Olbia: 'Sardinia',
  'Porto Cervo': 'Sardinia',
  Sassari: 'Sardinia',
  Alghero: 'Sardinia',
  'La Maddalena': 'Sardinia',
  // Portugal
  Lisbon: 'Portugal',
  Porto: 'Portugal',
}

/** Distinct regions in display order. "Other" is appended for unknown cities. */
export const REGIONS: readonly string[] = (() => {
  const seen = new Set<string>()
  const list: string[] = []
  // Preserve insertion order of CITY_TO_REGION values, deduped.
  for (const region of Object.values(CITY_TO_REGION)) {
    if (!seen.has(region)) {
      seen.add(region)
      list.push(region)
    }
  }
  list.push('Other')
  return list
})()

/** Resolve a city string (typed or free-form) to its region. */
export function getRegion(city: string | undefined | null): string {
  if (!city) return 'Other'
  return CITY_TO_REGION[city.trim()] ?? 'Other'
}

export const CATEGORIES = [
  'Nightclub',
  'Beach Club',
  'Bar with DJs',
  'Rooftop Bar',
  'Resort',
  'Boutique Hotel',
  'Event Villa',
  'Wedding Venue',
  'Festival',
  'Event Organizer',
  'Beach Restaurant',
  'Live Music Venue',
  'AV / Production',
  'Coworking / Event Space',
  'Other',
] as const
export type Category = (typeof CATEGORIES)[number]

export const TAGS = [
  'NIGHTCLUB',
  'BEACH_CLUB',
  'SUNSET',
  'WEDDINGS',
  'FESTIVAL',
  'ROOFTOP',
  'LUXURY',
  'TOURIST',
  'LOCAL',
  'OPEN_AIR',
  'HOUSE',
  'TECHNO',
  'AFRO_HOUSE',
  'LIVE_MUSIC',
  'EVENT_SPACE',
  'VILLA',
  'HOTEL',
  'RESTAURANT',
  'COCKTAIL',
  'PRODUCTION',
  'AV_RENTAL',
  'SEASONAL',
  'HIGH_END',
  'YOUTH',
  'VIP',
  'SUNRISE',
  'AFTERHOURS',
  'CHAMBER_MUSIC',
  'EDM',
  'CLASSICAL',
] as const
export type Tag = (typeof TAGS)[number]

export const STATUSES = [
  'new',
  'researching',
  'ready',
  'contacted',
  'in_conversation',
  'meeting_booked',
  'won',
  'lost',
  'on_hold',
] as const
export type OutreachStatus = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<OutreachStatus, string> = {
  new: 'New',
  researching: 'Researching',
  ready: 'Ready to contact',
  contacted: 'Contacted',
  in_conversation: 'In conversation',
  meeting_booked: 'Meeting booked',
  won: 'Won',
  lost: 'Lost',
  on_hold: 'On hold',
}

export interface Venue {
  id: string
  name: string
  category: Category
  city: City
  district?: string
  website?: string
  instagram?: string // handle WITHOUT the @, e.g. 'cabanamarebeachclub'
  facebook?: string  // page slug OR full URL — Detail panel handles both
  email?: string
  phone?: string
  // ---------- Semantic context (first-class, not custom_fields) ----------
  // These exist so the curated "why this lead converts" intelligence from
  // imported spreadsheets gets surfaced in the UI instead of buried in
  // custom_fields JSON. All optional — backfill on import or scraper enrich.
  pitch_angle?: string  // one-line "why this venue converts" insight
  capacity?: string     // free-form like "300-500" or "1200" or "outdoor"
  genre?: string        // free-form music/programming descriptor
  entity_type?: 'venue' | 'festival'  // table-level segmentation; default 'venue'
  booking_contact?: string
  music_type?: string
  has_djs: boolean
  has_events: boolean
  has_audio: boolean
  outdoor: boolean
  luxury_score: 0 | 1 | 2 | 3 | 4 | 5
  tourist_area: boolean
  notes?: string
  last_contacted?: string // ISO date
  last_verified?: string  // ISO date — when a human last confirmed this record is accurate
  verified_by?: string    // freetext name of who verified it
  status: OutreachStatus
  tags: Tag[]
  source?: string // where this venue was discovered
  custom_fields?: Record<string, string>
  created_at: string // ISO
  updated_at: string // ISO
}

export type VenueDraft = Omit<Venue, 'id' | 'created_at' | 'updated_at'>

export interface ScrapeResult {
  url: string
  fetched_at: string
  emails: string[]
  instagram_handles: string[]
  phones: string[]
  addresses: string[]
  title?: string
  description?: string
  raw_text_excerpt?: string
}
