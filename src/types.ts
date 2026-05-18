// Crete Nightlife Intelligence - core types
// Schema derived 1:1 from venue-outreach-DB.md spec.

export const CITIES = [
  'Berlin',
  'Paris',
  'Dubai',
  'Amsterdam',
  'Chania',
  'Heraklion',
  'Hersonissos',
  'Malia',
  'Rethymno',
  'Agios Nikolaos',
  'Elounda',
  'Makrigialos',
  'Ammoudara',
  'Other',
] as const
export type City = (typeof CITIES)[number] | (string & {})

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
