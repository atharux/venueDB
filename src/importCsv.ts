import type { Category, City, Venue, VenueDraft } from './types'
import { CATEGORIES } from './types'

// ---------------------------------------------------------------------------
// Smart entity-type classifier
// Determines whether a lead should land in Venues or Festivals without
// requiring the user to manually pick for every row.
//
// Priority order:
//   1. Category match → 'Festival' category always → festival
//   2. Name keywords  → strong festival signals in the name
//   3. Fallback       → venue (the safer default)
// ---------------------------------------------------------------------------
const FESTIVAL_NAME_PATTERNS = [
  /\bfestival\b/i,
  /\bfest\b/i,         // "SunFest", "Techno Fest"
  /\bcarnival\b/i,
  /\bcarnaval\b/i,
  /\bopen.air\b/i,     // "Open Air", "open-air"
  /\boutdoor.event\b/i,
  /\bsummer.camp\b/i,
]

/**
 * Classify a lead as 'venue' or 'festival' based on its name and category.
 * Used during import and Quick Add so records land in the right tab
 * without the user having to set the entity type manually.
 */
export function classifyEntityType(name: string, category: Category): 'venue' | 'festival' {
  if (category === 'Festival') return 'festival'
  const hay = name.trim()
  if (FESTIVAL_NAME_PATTERNS.some(re => re.test(hay))) return 'festival'
  return 'venue'
}

export interface ImportedLeadRow {
  name: string
  city: City
  category: Category
  website?: string
  instagram?: string
  facebook?: string
  email?: string
  phone?: string
  notes?: string
  // ---------- Semantic fields lifted from common spreadsheet shapes ----------
  pitch_angle?: string
  capacity?: string
  genre?: string
  sourceLabel?: string
  custom_fields?: Record<string, string>
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'company', 'company name', 'venue', 'venue name', 'business', 'business name'],
  city: ['city', 'location', 'market', 'area'],
  category: ['category', 'type', 'segment'],
  website: ['website', 'site', 'url', 'domain', 'web'],
  instagram: ['instagram', 'instagram handle', 'ig', 'ig handle', 'insta'],
  facebook: ['facebook', 'fb', 'facebook page', 'fb page'],
  email: ['email', 'e-mail', 'contact email', 'booking email'],
  phone: ['phone', 'telephone', 'mobile', 'whatsapp'],
  notes: ['notes', 'description', 'comments', 'context'],
  // Semantic fields — the "why this lead matters" intelligence.
  // Includes the exact header from your uploaded Hydrat3 spreadsheet
  // ("why it converts (key insight)") plus common variants.
  pitch_angle: [
    'pitch angle', 'pitch', 'rationale', 'insight', 'key insight',
    'why it converts', 'why it converts (key insight)', 'why this converts',
    'why this lead converts', 'angle', 'hook', 'unique value',
  ],
  capacity: ['capacity', 'cap', 'cap range', 'capacity range', 'size', 'attendance'],
  genre: ['genre', 'genres', 'music', 'music genre', 'music type', 'programming', 'style'],
}

export function parseSpreadsheetText(text: string, fileName: string): ImportedLeadRow[] {
  const delimiter = detectDelimiter(text)
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(line => line.trim())

  if (lines.length < 2) return []

  const matrix = lines.map(line => splitDelimitedLine(line, delimiter))
  return parseSpreadsheetRows(matrix, fileName)
}

export function parseSpreadsheetRows(matrix: string[][], fileName: string): ImportedLeadRow[] {
  if (matrix.length < 2) return []

  const rawHeaders = matrix[0].map(value => value.trim())
  const headers = rawHeaders.map(normalizeHeader)
  return matrix
    .slice(1)
    .map(values => toImportedLead(values, headers, rawHeaders, fileName))
    .filter((row): row is ImportedLeadRow => row !== null)
}

export function toVenueDraft(row: ImportedLeadRow): VenueDraft {
  return {
    name: row.name,
    city: row.city,
    category: row.category,
    // Auto-classify so each row lands in the right tab by default.
    // The caller (runSpreadsheetImport) can override this with a manual choice.
    entity_type: classifyEntityType(row.name, row.category),
    website: row.website,
    instagram: row.instagram,
    facebook: row.facebook,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    pitch_angle: row.pitch_angle,
    capacity: row.capacity,
    genre: row.genre,
    has_djs: false,
    has_events: false,
    has_audio: false,
    outdoor: false,
    luxury_score: 2,
    tourist_area: true,
    status: 'researching',
    tags: [],
    source: row.sourceLabel,
    custom_fields: row.custom_fields,
  }
}

export function findExistingVenueByName(venues: Venue[], name: string) {
  const lookup = name.trim().toLowerCase()
  return venues.find(venue => venue.name.trim().toLowerCase() === lookup) ?? null
}

function toImportedLead(
  values: string[],
  headers: string[],
  rawHeaders: string[],
  fileName: string,
): ImportedLeadRow | null {
  const get = (key: keyof typeof HEADER_ALIASES) => {
    const aliases = HEADER_ALIASES[key]
    const index = headers.findIndex(header => aliases.includes(header))
    return index >= 0 ? values[index]?.trim() : ''
  }

  const name = get('name')
  if (!name) return null

  const rawCategory = get('category')
  const category = matchCategory(rawCategory)
  const custom_fields = collectCustomFields(values, headers, rawHeaders)

  return {
    name,
    city: (get('city') || 'Other') as City,
    category,
    website: cleanUrl(get('website')),
    instagram: cleanHandle(get('instagram')),
    facebook: get('facebook') || undefined,
    email: get('email') || undefined,
    phone: get('phone') || undefined,
    notes: get('notes') || undefined,
    pitch_angle: get('pitch_angle') || undefined,
    capacity: get('capacity') || undefined,
    genre: get('genre') || undefined,
    sourceLabel: `import:${fileName}`,
    custom_fields: Object.keys(custom_fields).length > 0 ? custom_fields : undefined,
  }
}

function collectCustomFields(values: string[], headers: string[], rawHeaders: string[]) {
  const recognized = new Set(Object.values(HEADER_ALIASES).flat())
  const customFields: Record<string, string> = {}

  headers.forEach((header, index) => {
    if (!header || recognized.has(header)) return
    const value = values[index]?.trim()
    if (!value) return
    customFields[rawHeaders[index] || header] = value
  })

  return customFields
}

function matchCategory(input: string): Category {
  if (!input) return 'Other'
  const normalized = input.trim().toLowerCase()
  const exact = CATEGORIES.find(category => category.toLowerCase() === normalized)
  if (exact) return exact
  if (normalized.includes('club') && normalized.includes('beach')) return 'Beach Club'
  if (normalized.includes('nightclub') || normalized.includes('night club')) return 'Nightclub'
  if (normalized.includes('rooftop')) return 'Rooftop Bar'
  if (normalized.includes('hotel')) return 'Boutique Hotel'
  if (normalized.includes('festival')) return 'Festival'
  if (normalized.includes('restaurant')) return 'Beach Restaurant'
  if (normalized.includes('event')) return 'Event Organizer'
  if (normalized.includes('bar')) return 'Bar with DJs'
  return 'Other'
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const commaCount = (firstLine.match(/,/g) ?? []).length
  const tabCount = (firstLine.match(/\t/g) ?? []).length
  const semicolonCount = (firstLine.match(/;/g) ?? []).length
  if (tabCount > commaCount && tabCount >= semicolonCount) return '\t'
  if (semicolonCount > commaCount) return ';'
  return ','
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      const nextChar = line[index + 1]
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }

    current += char
  }

  cells.push(current)
  return cells
}

function normalizeHeader(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function cleanHandle(value: string) {
  const clean = value.trim().replace(/^@/, '')
  return clean || undefined
}

function cleanUrl(value: string) {
  const clean = value.trim()
  if (!clean) return undefined
  if (/^https?:\/\//i.test(clean)) return clean
  if (clean.includes('.')) return `https://${clean}`
  return clean
}
