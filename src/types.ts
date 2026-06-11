// Crete Nightlife Intelligence - core types
// Schema derived 1:1 from venue-outreach-DB.md spec.

export const CITIES = [
  // Germany
  'Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt',
  'Leipzig', 'Stuttgart', 'Mannheim', 'Nuremberg', 'Dortmund',
  // France
  'Paris', 'Lyon', 'Marseille', 'Nice', 'Toulouse', 'Bordeaux', 'Nantes', 'Lille', 'Strasbourg', 'Rennes',
  // UK
  'London', 'Manchester', 'Bristol', 'Glasgow',
  'Edinburgh', 'Leeds', 'Liverpool', 'Birmingham', 'Brighton', 'Newcastle', 'Sheffield', 'Belfast',
  // Netherlands
  'Amsterdam', 'Rotterdam', 'Utrecht', 'Groningen', 'Eindhoven', 'Tilburg',
  // UAE
  'Dubai', 'Abu Dhabi',
  // Spain
  'Barcelona', 'Madrid', 'Ibiza', 'Valencia', 'Seville', 'Bilbao', 'Tenerife',
  // Italy
  'Milan', 'Rome', 'Naples', 'Florence', 'Bologna', 'Turin',
  // Sardinia
  'Sardinia', 'Cagliari', 'Olbia', 'Porto Cervo', 'Sassari', 'Alghero', 'La Maddalena',
  // Portugal
  'Lisbon', 'Porto',
  // Greece — Crete
  'Chania', 'Heraklion', 'Hersonissos', 'Malia', 'Rethymno',
  'Agios Nikolaos', 'Elounda', 'Makrigialos', 'Ammoudara',
  // Greece — mainland / islands
  'Athens', 'Thessaloniki', 'Mykonos',
  // Czech Republic
  'Prague',
  // Austria
  'Vienna', 'Graz',
  // Scandinavia
  'Copenhagen', 'Stockholm', 'Gothenburg', 'Oslo', 'Bergen', 'Helsinki', 'Aarhus',
  // Switzerland
  'Zurich', 'Geneva', 'Bern',
  // Belgium
  'Brussels', 'Antwerp', 'Ghent',
  // Poland
  'Warsaw', 'Kraków', 'Gdańsk', 'Wrocław', 'Łódź', 'Szczecin',
  // Hungary
  'Budapest',
  // Romania
  'Bucharest', 'Cluj-Napoca',
  // Bulgaria
  'Sofia',
  // Serbia
  'Belgrade',
  // Croatia
  'Zagreb', 'Split', 'Dubrovnik',
  // Slovenia
  'Ljubljana',
  // Baltics
  'Riga', 'Tallinn', 'Vilnius',
  // Ireland
  'Dublin',
  // Cyprus
  'Ayia Napa',
  // Malta
  'Valletta',
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
  'Lisbon (Graça)': 'Portugal',
  'Lisbon (GraçA)': 'Portugal',
  'Lisbon (Waterfront)': 'Portugal',
  // Czech Republic
  Prague: 'Czech Republic',
  // Austria
  Vienna: 'Austria',
  Graz: 'Austria',
  'Vienna (Danube Canal)': 'Austria',
  'Graz (Cave)': 'Austria',
  'Graz (Limestone Cave)': 'Austria',
  // Scandinavia
  Copenhagen: 'Scandinavia',
  Aarhus: 'Scandinavia',
  Stockholm: 'Scandinavia',
  Gothenburg: 'Scandinavia',
  'Malmö': 'Scandinavia',
  Oslo: 'Scandinavia',
  Bergen: 'Scandinavia',
  Helsinki: 'Scandinavia',
  Tampere: 'Scandinavia',
  Oulu: 'Scandinavia',
  'Stockholm (Under Bridges)': 'Scandinavia',
  'Stockholm (Waterfront)': 'Scandinavia',
  'Stockholm (Former Slaughterhouse)': 'Scandinavia',
  'Oslo (Akerselva)': 'Scandinavia',
  'Oslo (Akerselva River)': 'Scandinavia',
  // Switzerland
  Zurich: 'Switzerland',
  Bern: 'Switzerland',
  Geneva: 'Switzerland',
  Fribourg: 'Switzerland',
  'Bern (Reitschule)': 'Switzerland',
  'Geneva (Carouge)': 'Switzerland',
  // Belgium
  Antwerp: 'Belgium',
  Ghent: 'Belgium',
  Brussels: 'Belgium',
  'Sint-Niklaas': 'Belgium',
  'Brussels (Watermael-Boitsfort)': 'Belgium',
  // Luxembourg
  'Luxembourg City': 'Luxembourg',
  // Netherlands (extended)
  Groningen: 'Netherlands',
  Nijmegen: 'Netherlands',
  Leiden: 'Netherlands',
  Zwolle: 'Netherlands',
  Eindhoven: 'Netherlands',
  Tilburg: 'Netherlands',
  'Amsterdam Noord': 'Netherlands',
  'Amsterdam (West)': 'Netherlands',
  'Amsterdam (Former Church)': 'Netherlands',
  'Amsterdam (Sloterpark)': 'Netherlands',
  'Amsterdam (Westergasfabriek)': 'Netherlands',
  'Amsterdam (City Centre)': 'Netherlands',
  'Amsterdam (North)': 'Netherlands',
  // Germany (extended)
  Leipzig: 'Germany',
  Stuttgart: 'Germany',
  Mannheim: 'Germany',
  Wuppertal: 'Germany',
  Wiesbaden: 'Germany',
  Bochum: 'Germany',
  Oberhausen: 'Germany',
  Rostock: 'Germany',
  Heidelberg: 'Germany',
  Darmstadt: 'Germany',
  Mainz: 'Germany',
  Wilhelmshaven: 'Germany',
  Nuremberg: 'Germany',
  Duisburg: 'Germany',
  Karlsruhe: 'Germany',
  'Offenbach (Frankfurt)': 'Germany',
  'Offenbach (Frankfurt Area)': 'Germany',
  'Berlin Moabit': 'Germany',
  // Poland
  Warsaw: 'Poland',
  'Kraków': 'Poland',
  'Gdańsk': 'Poland',
  'Wrocław': 'Poland',
  'Łódź': 'Poland',
  'łódź': 'Poland',          // lowercase form after normalise (ł not matched by \b\w)
  'KrakóW': 'Poland',        // raw DB value — fixed by normalise-all
  'GdańSk': 'Poland',
  'WrocłAw': 'Poland',
  'ŁóDź': 'Poland',
  Szczecin: 'Poland',
  'Warsaw (Vistula River)': 'Poland',
  // Hungary
  Budapest: 'Hungary',
  'Budapest (In Ruin Bar)': 'Hungary',
  'Budapest (Danube)': 'Hungary',
  'Budapest (In Corvin Club)': 'Hungary',
  'Budapest (Rooftop)': 'Hungary',
  // Romania
  Bucharest: 'Romania',
  'Cluj-Napoca': 'Romania',
  'Bucharest Area': 'Romania',
  // Bulgaria
  Sofia: 'Bulgaria',
  'Sunny Beach': 'Bulgaria',
  // Slovakia
  Bratislava: 'Slovakia',
  // Serbia
  Belgrade: 'Serbia',
  'Belgrade (Former Slaughterhouse)': 'Serbia',
  'Belgrade (Floating Club)': 'Serbia',
  'Belgrade (Kalemegdan Fortress)': 'Serbia',
  'Belgrade (Floating)': 'Serbia',
  // Croatia
  Zagreb: 'Croatia',
  Split: 'Croatia',
  Dubrovnik: 'Croatia',
  Hvar: 'Croatia',
  'Hvar (Island)': 'Croatia',
  'Dubrovnik (Fortress)': 'Croatia',
  'Zrce Beach, Pag Island': 'Croatia',
  'Tisno, Dalmatian Coast': 'Croatia',
  'Near Tisno': 'Croatia',
  // Slovenia
  Ljubljana: 'Slovenia',
  // Greece (mainland + islands, not Crete)
  Athens: 'Greece',
  Mykonos: 'Greece',
  Thessaloniki: 'Greece',
  'Athens (Faliro Waterfront)': 'Greece',
  'Mykonos (Paraga Beach)': 'Greece',
  // Cyprus
  'Ayia Napa': 'Cyprus',
  'Ayia Napa (Beach)': 'Cyprus',
  // Malta
  Paceville: 'Malta',
  Valletta: 'Malta',
  "St Julian's": 'Malta',
  "Paceville, St Julian's": 'Malta',
  'Valletta Waterfront': 'Malta',
  // Ireland
  Dublin: 'Ireland',
  'Dublin (Temple Bar)': 'Ireland',
  // Baltics
  Tallinn: 'Baltics',
  Vilnius: 'Baltics',
  Riga: 'Baltics',
  'Riga (Elizabetes Iela)': 'Baltics',
  'Riga (Andrejosta District)': 'Baltics',
  // UK (extended)
  Brighton: 'UK',
  Sheffield: 'UK',
  Leeds: 'UK',
  Liverpool: 'UK',
  Edinburgh: 'UK',
  Newcastle: 'UK',
  Birmingham: 'UK',
  Nottingham: 'UK',
  Belfast: 'UK',
  Lincoln: 'UK',
  'London (Brixton)': 'UK',
  'London (Hackney Wick)': 'UK',
  'London (Bermondsey)': 'UK',
  'London (Shoreditch)': 'UK',
  'London (Elephant & Castle)': 'UK',
  'London (Farringdon)': 'UK',
  'London (Bethnal Green)': 'UK',
  'London (Hackney)': 'UK',
  'London (Canning Town)': 'UK',
  'London (Docklands)': 'UK',
  'London (Dalston)': 'UK',
  'London (Peckham)': 'UK',
  'London (Embankment)': 'UK',
  'London (Camden)': 'UK',
  "London (King's Cross)": 'UK',
  'London (Tottenham)': 'UK',
  'London (Greenwich)': 'UK',
  'London (Whitechapel)': 'UK',
  'Manchester (Salford)': 'UK',
  'Manchester (Whitworth St West)': 'UK',
  // Spain (extended)
  Valencia: 'Spain',
  Seville: 'Spain',
  Bilbao: 'Spain',
  Zaragoza: 'Spain',
  Tenerife: 'Spain',
  'Magaluf, Mallorca': 'Spain',
  'A Coruña, Galicia': 'Spain',
  'A CoruñA, Galicia': 'Spain',   // raw DB value — fixed by normalise-all
  'San Antonio': 'Spain',
  "Playa D'En Bossa": 'Spain',
  'Ibiza Town': 'Spain',
  'San Rafael': 'Spain',
  'Cap Martinet': 'Spain',
  'Ibiza Town Marina': 'Spain',
  'Ibiza (Nov-Apr)': 'Spain',
  'Near San Antonio': 'Spain',
  'San Antonio Hills': 'Spain',
  'San José Hillside': 'Spain',
  'San Carlos': 'Spain',
  "Playa D'En Bossa Strip": 'Spain',
  'DC-10': 'Spain',
  'Near Airport': 'Spain',
  'Barcelona (Poble Espanyol)': 'Spain',
  'Barcelona (Poblenou)': 'Spain',
  'Barcelona (Las Ramblas)': 'Spain',
  'Barcelona (Beachfront)': 'Spain',
  'Madrid (Humanes)': 'Spain',
  // France (extended)
  Toulouse: 'France',
  Bordeaux: 'France',
  Nantes: 'France',
  Rennes: 'France',
  Lille: 'France',
  Strasbourg: 'France',
  'Toulouse (Ramonville)': 'France',
  'Bordeaux (Cenon)': 'France',
  'Bordeaux (Mérignac)': 'France',
  'Bordeaux (MéRignac)': 'France',  // raw DB value — fixed by normalise-all
  'Bordeaux (Riverboat)': 'France',
  'Saint-Ouen (Paris Nord)': 'France',
  'Paris (La Villette)': 'France',
  'Paris (St-Ouen)': 'France',
  'Paris (Near Gare De Lyon)': 'France',
  'Paris (Pantin)': 'France',
  'Paris (Boat/Seine)': 'France',
  'Paris (Former Gas Station)': 'France',
  'Paris (Seine Riverside)': 'France',
  'Paris (Parc De La Villette)': 'France',
  'Marseille (Friche La Belle De Mai)': 'France',
  // Netherlands (extended 2)
  'The Hague': 'Netherlands',
  'Multiple Nl Cities': 'Netherlands',
  // Poland (raw apostrophe-S variant)
  'łóDź': 'Poland',
  // Spain (post-normalise DC-10 form)
  'Dc-10': 'Spain',
  // Malta (raw apostrophe-S variants — fixed by normalise-all)
  "St Julian'S": 'Malta',
  "Paceville, St Julian'S": 'Malta',
  // UK (raw apostrophe-S variant — fixed by normalise-all)
  "London (King'S Cross)": 'UK',
  // Italy (extended)
  Bologna: 'Italy',
  Turin: 'Italy',
  Rimini: 'Italy',
  'Rimini (Adriatic)': 'Italy',
  'Riccione (Adriatic Riviera)': 'Italy',
  'Milano Marittima (Ravenna)': 'Italy',
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
