/**
 * Phone-candidate extraction and validation.
 *
 * Shared by the scrapers (via scraper-core) and the data-cleanup action in
 * the app. The old extraction regex accepted any 8–15 digit run with basic
 * separators, which let coordinates ("35.2931607"), year ranges
 * ("2024-2025"), dates and prices from venue websites into the phone field —
 * that's how most Crete rows got polluted.
 *
 * The worker keeps its own copy of this logic (worker/src/index.ts) because
 * it deliberately imports nothing from outside worker/.
 */

/** True if a raw matched string plausibly is a phone number. */
export function isLikelyPhone(raw: string): boolean {
  const s = raw.trim()
  const digits = s.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return false
  // Decimal numbers: map coordinates, prices, ratings ("35.2931607", "10.50").
  // The only dotted format kept is French-style pairs ("01.55.78.10.00") —
  // anything else dotted (incl. IP addresses) is rejected.
  if (/\d\.\d/.test(s) && !/^\d{2}(\.\d{2}){3,}$/.test(s.replace(/\s+/g, ''))) return false
  // Year ranges and season spans ("2024-2025", "2024 – 2025", "2024/2025")
  if (/(19|20)\d{2}\s*[-–—/]\s*(19|20)\d{2}/.test(s)) return false
  // Dates in either order ("2026-06-10", "10/06/2026", "10.06.2026")
  if (/^(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(s)) return false
  if (/^\d{1,2}[-/.]\d{1,2}[-/.](19|20)\d{2}$/.test(s)) return false
  return true
}

/** Collapse runs of whitespace so stored numbers render consistently. */
export function normalizePhone(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/**
 * Extract validated phone candidates from a page.
 *
 * `tel:` links come first — when a site has one, it is the number the venue
 * wants to be called on, with near-zero false positives. Free-text matches
 * are appended after validation. Returns a deduped list, best-first.
 *
 * @param html  Raw (entity-decoded) HTML — used for tel: links
 * @param text  Tag-stripped page text — used for free-text matches
 */
export function extractPhoneCandidates(html: string, text: string): string[] {
  const fromTelLinks = [...html.matchAll(/href=["']tel:([+\d][\d\s()./-]*\d)["']/gi)]
    .map(m => m[1])
  const fromText = text.match(/(?:\+?\d[\d\s()./-]{6,}\d)/g) ?? []
  const all = [...fromTelLinks, ...fromText]
    .map(normalizePhone)
    .filter(isLikelyPhone)
  return Array.from(new Set(all))
}
