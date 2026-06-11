import { useEffect, useRef, useState } from 'react'
import type { City, Category, Tag, Venue, VenueDraft } from '../types'
import { CITIES, CATEGORIES } from '../types'
import {
  SEARCH_LAUNCHERS,
  enrichLead,
  scrapeUrl,
  scraperEnabled,
  searchWeb,
  searchPlaces,
  discoverByLocation,
  type SearchResult,
  type PlacesResult,
  type OsmVenue,
} from '../scraper'
import { classifyEntityType, findExistingVenueByName, toVenueDraft, type ImportedLeadRow } from '../importCsv'
import { DEFAULT_AI_SETTINGS, loadAiSettings, saveAiSettings } from '../aiSettings'
import { parseUploadedSpreadsheet } from '../importApi'
import { scanRegion, type RegionScanResult } from '../regionScan'
import { ProGate } from './ProGate'

type DiscoverTab = 'free-scan' | 'region-scan' | 'import' | 'quick-add' | 'settings'

interface Props {
  venues: Venue[]
  onAdd: (draft: VenueDraft) => Promise<Venue>
  onUpdate: (id: string, patch: Partial<Venue>) => Promise<void> | void
  existingNames: Set<string>
  defaultEntityType?: 'venue' | 'festival'
}

const SUGGESTED_QUERIES = [
  'Berlin techno club official website',
  'Paris rooftop venue music official website',
  'Dubai beach club official website',
  'Amsterdam electronic venue official website',
  'Berlin live music venue private events',
  'Paris club Bastille official website',
  'Dubai Palm Jumeirah beach club official website',
  'Amsterdam club event space official website',
]

const MAPS_VENUE_TYPES = [
  'nightclub', 'bar with djs', 'beach club', 'rooftop bar', 'live music venue', 'cocktail bar',
]

const OSM_CATEGORIES = ['nightclub', 'bar', 'bar with djs', 'beach club', 'live music venue', 'event space']

const PLACES_TYPE_TO_CATEGORY: Record<string, string> = {
  // Google Maps Places API format (underscored)
  night_club: 'Nightclub',
  bar: 'Bar with DJs',
  beach_bar: 'Beach Club',
  resort: 'Beach Club',
  restaurant: 'Restaurant',
  music_venue: 'Live Music Venue',
  event_venue: 'Event Space',
  // OSM / Overpass format (spaced) — must be listed separately or OSM
  // results fall through to 'Other' because the keys never match
  nightclub: 'Nightclub',
  'bar with djs': 'Bar with DJs',
  'beach club': 'Beach Club',
  'live music venue': 'Live Music Venue',
  'event space': 'Event Space',
}

/** Capitalize each word — normalises free-form location input ("sardinia" → "Sardinia"). */
function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

export function DiscoveryPanel({ venues, onAdd, onUpdate, existingNames, defaultEntityType = 'venue' }: Props) {
  const [discoverTab, setDiscoverTab] = useState<DiscoverTab>('free-scan')
  const [aiSettings, setAiSettings] = useState(loadAiSettings)

  const [importEntityType, setImportEntityType] = useState<'auto' | 'venue' | 'festival'>('auto')
  useEffect(() => {
    if (importEntityType === 'auto') return
    setImportEntityType(prev => (prev === defaultEntityType ? prev : defaultEntityType))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultEntityType])

  // Shared location — persists when switching between Free Scan and Region Scan
  const [sharedLocation, setSharedLocation] = useState('Berlin, Germany')

  // ── Web search state ──────────────────────────────────────────────────────
  const [query, setQuery] = useState('Berlin techno club official website')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  // ── Scrape state ──────────────────────────────────────────────────────────
  const [scrapeUrlInput, setScrapeUrlInput] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapeError, setScrapeError] = useState<string | null>(null)
  const [scrapePreview, setScrapePreview] = useState<{
    name?: string
    website: string
    email?: string
    instagram?: string
    phone?: string
    address?: string
    description?: string
  } | null>(null)

  // ── Region Scan state ─────────────────────────────────────────────────────
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number; currentQuery: string } | null>(null)
  const [scanResults, setScanResults] = useState<RegionScanResult[]>([])
  const [scanDone, setScanDone] = useState(false)
  const [scanFilter, setScanFilter] = useState<'all' | 'own'>('own')
  const [selectedScanUrls, setSelectedScanUrls] = useState<Set<string>>(new Set())
  const [addingFromScan, setAddingFromScan] = useState(false)
  const [addScanProgress, setAddScanProgress] = useState('')
  const scanAbortRef = useRef<AbortController | null>(null)

  // ── Google Maps state (Settings tab) ─────────────────────────────────────
  const [mapsLocation, setMapsLocation] = useState('Berlin, Germany')
  const [mapsSearching, setMapsSearching] = useState(false)
  const [mapsResults, setMapsResults] = useState<PlacesResult[]>([])
  const [mapsError, setMapsError] = useState<string | null>(null)
  const [selectedMapsIds, setSelectedMapsIds] = useState<Set<string>>(new Set())
  const [addingFromMaps, setAddingFromMaps] = useState(false)
  const [addMapsProgress, setAddMapsProgress] = useState('')

  // ── OSM state ────────────────────────────────────────────────────────────
  const [osmSearching, setOsmSearching] = useState(false)
  const [osmResults, setOsmResults] = useState<OsmVenue[]>([])
  const [osmError, setOsmError] = useState<string | null>(null)
  const [selectedOsmIds, setSelectedOsmIds] = useState<Set<number>>(new Set())
  const [addingFromOsm, setAddingFromOsm] = useState(false)
  const [addOsmProgress, setAddOsmProgress] = useState('')

  // ── Scrape preview draft fields ───────────────────────────────────────────
  const [draftCity, setDraftCity] = useState<City>('Berlin')
  const [draftCategory, setDraftCategory] = useState<Category>('Beach Club')

  // ── Quick add state ───────────────────────────────────────────────────────
  const [quickName, setQuickName] = useState('')
  const [quickCity, setQuickCity] = useState<City>('Berlin')
  const [quickCategory, setQuickCategory] = useState<Category>('Bar with DJs')
  const [quickInstagram, setQuickInstagram] = useState('')
  const [quickWebsite, setQuickWebsite] = useState('')
  const [quickAddResult, setQuickAddResult] = useState<{ name: string; tab: string } | null>(null)

  // ── CSV import state ──────────────────────────────────────────────────────
  const [importedRows, setImportedRows] = useState<ImportedLeadRow[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState('')
  const [importSummary, setImportSummary] = useState<string | null>(null)

  // ── Handlers ─────────────────────────────────────────────────────────────

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    setSearchResults(null)
    try {
      const results = await searchWeb(query.trim(), aiSettings)
      setSearchResults(results)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  const launchExternal = (label: string) => {
    const launcher = SEARCH_LAUNCHERS.find(l => l.label === label)
    if (!launcher) return
    window.open(launcher.build(query), '_blank', 'noopener,noreferrer')
  }

  const runScrape = async () => {
    const url = scrapeUrlInput.trim()
    if (!url) return
    setScraping(true)
    setScrapeError(null)
    setScrapePreview(null)
    try {
      const r = await scrapeUrl(url, aiSettings)
      setScrapePreview({
        name: r.title?.split(/[|·–-]/)[0].trim(),
        website: r.url,
        email: r.emails[0],
        instagram: r.instagram_handles[0],
        phone: r.phones[0],
        address: r.addresses[0],
        description: r.description,
      })
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : String(err))
    } finally {
      setScraping(false)
    }
  }

  const saveScrapedAsVenue = async () => {
    if (!scrapePreview) return
    const name = scrapePreview.name?.trim() || scrapePreview.website
    if (existingNames.has(name.toLowerCase())) {
      if (!confirm(`A venue named "${name}" already exists. Add anyway?`)) return
    }
    const scrapedEntityType =
      importEntityType !== 'auto' ? importEntityType : classifyEntityType(name, draftCategory)
    await onAdd({
      name,
      category: draftCategory,
      city: draftCity,
      entity_type: scrapedEntityType,
      website: scrapePreview.website,
      email: scrapePreview.email,
      instagram: scrapePreview.instagram,
      phone: scrapePreview.phone,
      notes: scrapePreview.description,
      has_djs: false,
      has_events: false,
      has_audio: false,
      outdoor: false,
      luxury_score: 2,
      tourist_area: true,
      status: 'researching',
      tags: [],
      source: `scraped:${scrapePreview.website}`,
    })
    setScrapePreview(null)
    setScrapeUrlInput('')
  }

  const startRegionScan = async () => {
    if (!sharedLocation.trim() || !scraperEnabled) return
    scanAbortRef.current?.abort()
    const controller = new AbortController()
    scanAbortRef.current = controller

    setScanning(true)
    setScanDone(false)
    setScanResults([])
    setSelectedScanUrls(new Set())
    setScanProgress({ done: 0, total: 1, currentQuery: 'Generating queries…' })

    try {
      const results = await scanRegion(
        sharedLocation.trim(),
        aiSettings,
        progress => setScanProgress(progress),
        controller.signal,
      )
      setScanResults(results)
      setScanDone(true)
    } catch {
      setScanDone(true)
    } finally {
      setScanning(false)
    }
  }

  const stopScan = () => {
    scanAbortRef.current?.abort()
    setScanning(false)
    setScanDone(true)
  }

  const toggleScanUrl = (url: string) => {
    setSelectedScanUrls(prev => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  const selectAllVisible = (results: RegionScanResult[]) => {
    setSelectedScanUrls(new Set(results.map(r => r.url)))
  }

  const clearSelection = () => setSelectedScanUrls(new Set())

  const addSelectedFromScan = async (visible: RegionScanResult[]) => {
    const toAdd = visible.filter(r => selectedScanUrls.has(r.url))
    if (toAdd.length === 0) return
    const inferredCity = toTitleCase(sharedLocation.split(',')[0]?.trim() || sharedLocation) as City
    setAddingFromScan(true)
    for (const [i, result] of toAdd.entries()) {
      setAddScanProgress(`Scraping ${i + 1}/${toAdd.length}: ${result.title || result.url}`)
      try {
        const scraped = await scrapeUrl(result.url, aiSettings)
        const name = scraped.title?.split(/[|·–-]/)[0].trim() || result.title || result.url
        const category: Category = 'Other'
        await onAdd({
          name,
          category,
          city: inferredCity,
          entity_type: classifyEntityType(name, category),
          website: result.url,
          email: scraped.emails[0],
          instagram: scraped.instagram_handles[0],
          phone: scraped.phones[0],
          notes: scraped.description,
          has_djs: false,
          has_events: false,
          has_audio: false,
          outdoor: false,
          luxury_score: 2,
          tourist_area: true,
          status: 'researching',
          tags: [],
          source: `region-scan:${sharedLocation}`,
        })
      } catch {
        // skip failed scrapes
      }
    }
    setAddScanProgress(`Done — added ${toAdd.length} venues.`)
    setAddingFromScan(false)
    clearSelection()
  }

  const searchMaps = async () => {
    if (!mapsLocation.trim()) return
    setMapsSearching(true)
    setMapsError(null)
    setMapsResults([])
    setSelectedMapsIds(new Set())
    const seen = new Map<string, PlacesResult>()
    try {
      for (const type of MAPS_VENUE_TYPES) {
        const q = `${type} in ${mapsLocation.trim()}`
        try {
          const results = await searchPlaces(q, aiSettings)
          for (const r of results) {
            if (!seen.has(r.place_id)) seen.set(r.place_id, r)
          }
        } catch {
          // single type failing doesn't abort the rest
        }
      }
      setMapsResults(Array.from(seen.values()))
    } catch (err) {
      setMapsError(err instanceof Error ? err.message : String(err))
    } finally {
      setMapsSearching(false)
    }
  }

  const toggleMapsId = (id: string) => {
    setSelectedMapsIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const addSelectedFromMaps = async () => {
    const toAdd = mapsResults.filter(r => selectedMapsIds.has(r.place_id))
    if (toAdd.length === 0) return
    const inferredCity = toTitleCase(mapsLocation.split(',')[0]?.trim() || mapsLocation) as City
    setAddingFromMaps(true)
    for (const [i, place] of toAdd.entries()) {
      setAddMapsProgress(`Adding ${i + 1}/${toAdd.length}: ${place.name}`)
      const name = place.name
      if (existingNames.has(name.toLowerCase())) continue
      const category = (PLACES_TYPE_TO_CATEGORY[place.primary_type ?? ''] ?? 'Other') as Category
      const luxuryScore = place.rating ? Math.min(5, Math.round(place.rating - 1)) : 2
      try {
        await onAdd({
          name,
          category,
          city: inferredCity,
          entity_type: classifyEntityType(name, category),
          website: place.website,
          phone: place.phone,
          notes: place.address,
          has_djs: ['night_club', 'bar'].includes(place.primary_type ?? ''),
          has_events: true,
          has_audio: false,
          outdoor: ['beach_bar', 'resort'].includes(place.primary_type ?? ''),
          luxury_score: luxuryScore as 0 | 1 | 2 | 3 | 4 | 5,
          tourist_area: true,
          status: 'new',
          tags: [inferredCity.toLowerCase(), place.primary_type ?? 'venue'].filter(Boolean) as Tag[],
          source: `maps:${place.place_id}`,
        })
      } catch {
        // skip
      }
    }
    setAddMapsProgress(`Done — added ${toAdd.length} venues.`)
    setAddingFromMaps(false)
    setSelectedMapsIds(new Set())
  }

  const searchOsm = async () => {
    if (!sharedLocation.trim()) return
    setOsmSearching(true)
    setOsmError(null)
    setOsmResults([])
    setSelectedOsmIds(new Set())
    try {
      const results = await discoverByLocation(sharedLocation.trim(), OSM_CATEGORIES, aiSettings)
      setOsmResults(results)
    } catch (err) {
      setOsmError(err instanceof Error ? err.message : String(err))
    } finally {
      setOsmSearching(false)
    }
  }

  const toggleOsmId = (id: number) => {
    setSelectedOsmIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const addSelectedFromOsm = async () => {
    const toAdd = osmResults.filter(r => selectedOsmIds.has(r.osm_id))
    if (toAdd.length === 0) return
    const inferredCity = toTitleCase(sharedLocation.split(',')[0]?.trim() || sharedLocation) as City
    setAddingFromOsm(true)
    for (const [i, venue] of toAdd.entries()) {
      setAddOsmProgress(`Adding ${i + 1}/${toAdd.length}: ${venue.name}`)
      if (existingNames.has(venue.name.toLowerCase())) continue
      const category = (PLACES_TYPE_TO_CATEGORY[venue.category] ?? 'Other') as Category
      try {
        await onAdd({
          name: venue.name,
          category,
          city: inferredCity,
          entity_type: classifyEntityType(venue.name, category),
          website: venue.website,
          phone: venue.phone,
          email: venue.email,
          notes: venue.address.road ? `${venue.address.road}, ${venue.address.city ?? inferredCity}` : undefined,
          has_djs: venue.category === 'nightclub' || venue.category === 'bar with djs',
          has_events: true,
          has_audio: false,
          outdoor: venue.category === 'beach club',
          luxury_score: 2,
          tourist_area: true,
          status: 'new',
          tags: [inferredCity.toLowerCase(), venue.category].filter(Boolean) as Tag[],
          source: `${venue.source ?? 'osm'}:${venue.osm_id}`,
        })
      } catch {
        // skip
      }
    }
    setAddOsmProgress(`Done — added ${toAdd.length} venues.`)
    setAddingFromOsm(false)
    setSelectedOsmIds(new Set())
  }

  const quickAdd = async () => {
    if (!quickName.trim()) return
    if (existingNames.has(quickName.trim().toLowerCase())) {
      if (!confirm(`A venue named "${quickName}" already exists. Add anyway?`)) return
    }
    const detectedType = classifyEntityType(quickName.trim(), quickCategory)
    const name = quickName.trim()
    await onAdd({
      name,
      category: quickCategory,
      city: quickCity,
      entity_type: detectedType,
      instagram: quickInstagram.replace(/^@/, '') || undefined,
      website: quickWebsite.trim() || undefined,
      has_djs: false,
      has_events: false,
      has_audio: false,
      outdoor: false,
      luxury_score: 2,
      tourist_area: true,
      status: 'new',
      tags: [],
      source: 'manual',
    })
    setQuickAddResult({ name, tab: detectedType === 'festival' ? 'Festivals' : 'Venues' })
    setTimeout(() => setQuickAddResult(null), 4000)
    setQuickName('')
    setQuickInstagram('')
    setQuickWebsite('')
  }

  const handleFilePicked = async (file: File | null) => {
    setImportError(null)
    setImportSummary(null)
    setImportedRows([])
    setImportProgress('')
    if (!file) return
    try {
      const rows = await parseUploadedSpreadsheet(file)
      if (rows.length === 0) {
        setImportError('No usable rows found. The sheet needs a name/company column.')
        return
      }
      setImportFileName(file.name)
      setImportedRows(rows)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    }
  }

  const runSpreadsheetImport = async () => {
    if (importedRows.length === 0) return
    setImporting(true)
    setImportError(null)
    setImportSummary(null)
    let created = 0
    let updated = 0
    let enriched = 0
    try {
      for (const [index, row] of importedRows.entries()) {
        setImportProgress(`Processing ${index + 1}/${importedRows.length}: ${row.name}`)
        const enrichedRow = await enrichImportedRow(row)
        const patch = toVenueDraft(enrichedRow)
        const effectiveEntityType =
          importEntityType === 'auto' ? patch.entity_type : importEntityType
        const existing = findExistingVenueByName(venues, row.name)
        if (existing) {
          await onUpdate(existing.id, {
            city: patch.city,
            category: patch.category,
            entity_type: effectiveEntityType,
            website: existing.website ?? patch.website,
            instagram: existing.instagram ?? patch.instagram,
            email: existing.email ?? patch.email,
            phone: existing.phone ?? patch.phone,
            notes: existing.notes ?? patch.notes,
            source: existing.source ?? patch.source,
            custom_fields: {
              ...(existing.custom_fields ?? {}),
              ...(patch.custom_fields ?? {}),
            },
          })
          updated += 1
        } else {
          await onAdd({ ...patch, entity_type: effectiveEntityType })
          created += 1
        }
        if (
          Boolean(enrichedRow.website || enrichedRow.instagram || enrichedRow.email || enrichedRow.phone) &&
          (!row.website || !row.instagram || !row.email || !row.phone)
        ) {
          enriched += 1
        }
      }
      setImportSummary(`Imported ${importedRows.length} rows from ${importFileName}: ${created} created, ${updated} updated, ${enriched} enriched.`)
      setImportProgress('')
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    } finally {
      setImporting(false)
    }
  }

  const enrichImportedRow = async (row: ImportedLeadRow): Promise<ImportedLeadRow> => {
    const result = await enrichLead(
      {
        name: row.name,
        city: row.city,
        website: row.website,
        instagram: row.instagram,
        email: row.email,
        phone: row.phone,
        notes: row.notes,
      },
      aiSettings,
    )
    return {
      ...row,
      website: row.website ?? result.website,
      email: row.email ?? result.email,
      instagram: row.instagram ?? result.instagram,
      phone: row.phone ?? result.phone,
      notes: row.notes ?? result.notes,
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="discovery-panel">

      {/* Tab bar */}
      <div className="discover-tabs">
        <button
          className={`discover-tab-btn ${discoverTab === 'free-scan' ? 'active' : ''}`}
          onClick={() => setDiscoverTab('free-scan')}
        >
          Free Scan
        </button>
        <button
          className={`discover-tab-btn ${discoverTab === 'region-scan' ? 'active' : ''} ${!scraperEnabled ? 'is-offline' : ''}`}
          onClick={() => setDiscoverTab('region-scan')}
        >
          Region Scan {!scraperEnabled ? <span className="badge-offline">offline</span> : null}
        </button>
        <button
          className={`discover-tab-btn ${discoverTab === 'import' ? 'active' : ''}`}
          onClick={() => setDiscoverTab('import')}
        >
          Import
        </button>
        <button
          className={`discover-tab-btn ${discoverTab === 'quick-add' ? 'active' : ''}`}
          onClick={() => setDiscoverTab('quick-add')}
        >
          Quick Add
        </button>
        <button
          className={`discover-tab-btn ${discoverTab === 'settings' ? 'active' : ''}`}
          onClick={() => setDiscoverTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="discover-tab-content">

        {/* ── FREE SCAN ──────────────────────────────────────────────────── */}
        {discoverTab === 'free-scan' ? (
          <div className="discover-pane">
            <p className="muted small discover-pane-desc">
              Search any city for nightclubs, bars, beach clubs, and live music venues via OpenStreetMap. No API key needed.
            </p>
            <div className="search-row">
              <input
                value={sharedLocation}
                onChange={e => setSharedLocation(e.target.value)}
                placeholder="e.g. Berlin, Germany"
                onKeyDown={e => { if (e.key === 'Enter' && !osmSearching) void searchOsm() }}
              />
              <button
                className="primary-btn"
                onClick={() => void searchOsm()}
                disabled={osmSearching || !sharedLocation.trim()}
              >
                {osmSearching ? 'Searching…' : 'Search'}
              </button>
            </div>

            {osmError ? <div className="error">{osmError}</div> : null}

            {osmResults.length > 0 ? (
              <div className="osm-attribution">
                Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>, ODbL
              </div>
            ) : null}

            {osmResults.length > 0 ? (
              <div className="scan-results-wrapper">
                <div className="scan-results-toolbar">
                  <div className="scan-summary">{osmResults.length} venues found in {sharedLocation}</div>
                  <div className="scan-filter-row">
                    <button className="link-btn" onClick={() => setSelectedOsmIds(new Set(osmResults.map(r => r.osm_id)))}>
                      Select all
                    </button>
                    <button className="link-btn" onClick={() => setSelectedOsmIds(new Set())}>Clear</button>
                  </div>
                </div>
                <ul className="scan-result-list">
                  {osmResults.map(r => (
                    <li key={r.osm_id} className={`scan-result-item ${selectedOsmIds.has(r.osm_id) ? 'selected' : ''}`}>
                      <label className="scan-result-check">
                        <input type="checkbox" checked={selectedOsmIds.has(r.osm_id)} onChange={() => toggleOsmId(r.osm_id)} />
                      </label>
                      <div className="scan-result-body">
                        <div className="scan-result-title">{r.name}</div>
                        {r.address.road ? <div className="muted small">{r.address.road}</div> : null}
                        {r.phone ? <div className="muted small">{r.phone}</div> : null}
                        {r.website ? (
                          <a className="scan-result-url cell-link" href={r.website} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                            {r.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </a>
                        ) : null}
                      </div>
                      <div className="scan-result-actions">
                        <span className="scan-badge dir">{r.category}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                {addOsmProgress ? <div className="muted small scan-done-msg">{addOsmProgress}</div> : null}
                {selectedOsmIds.size > 0 ? (
                  <div className="scan-add-bar">
                    <button className="primary-btn" onClick={() => void addSelectedFromOsm()} disabled={addingFromOsm}>
                      {addingFromOsm ? 'Adding…' : `Add ${selectedOsmIds.size} venue${selectedOsmIds.size !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!osmSearching && osmResults.length === 0 && osmError === null ? (
              <div className="muted small">Enter any city and click Search.</div>
            ) : null}

            {/* Pro upsell */}
            <div className="discover-pro-section">
              <div className="dash-pro-header">
                <span className="pro-badge">Pro</span>
                <span className="dash-pro-title">Accelerate discovery</span>
                <span className="dash-pro-desc">Enrich contacts on the fly and sweep multiple cities in one run.</span>
              </div>
              <div className="discover-pro-cards">
                <ProGate
                  feature="Auto-enrich on import"
                  description="Pro scrapes each venue website for email and Instagram as you add — no separate bulk-enrich step needed."
                  className="card discover-pro-card"
                >
                  <h3>Auto-enrich on import</h3>
                  <div className="mock-autoenrich-preview">
                    {([
                      { name: 'Arena Club Berlin', tags: ['email', 'instagram'] },
                      { name: 'Tresor Berlin', tags: ['email', 'phone'] },
                      { name: 'Watergate Berlin', tags: ['email', 'instagram', 'phone'] },
                    ] as const).map(row => (
                      <div key={row.name} className="mock-autoenrich-row">
                        <span className="mock-autoenrich-name">{row.name}</span>
                        <div className="mock-autoenrich-tags">
                          {row.tags.map(t => (
                            <span key={t} className="mock-tl-type sent">{t} ✓</span>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="muted small" style={{ marginTop: 6 }}>
                      +{osmResults.length > 3 ? osmResults.length - 3 : 40} more enriched automatically on add
                    </div>
                  </div>
                </ProGate>

                <ProGate
                  feature="Multi-city sweep"
                  description="Define a list of cities and run discovery across all of them sequentially — results land in your DB overnight."
                  className="card discover-pro-card"
                >
                  <h3>Multi-city sweep</h3>
                  <div className="mock-multicity">
                    <div className="mock-multicity-chips">
                      <span className="mock-chip">Berlin ✕</span>
                      <span className="mock-chip">Amsterdam ✕</span>
                      <span className="mock-chip">Ibiza ✕</span>
                      <span className="mock-chip">Dubai ✕</span>
                      <span className="mock-chip mock-chip-add">+ city</span>
                    </div>
                    <div className="mock-cb-footer">
                      <span className="mock-cb-match">4 cities · ~180 venues estimated</span>
                      <button className="mock-btn mock-btn-accent" disabled>Run sweep →</button>
                    </div>
                  </div>
                </ProGate>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── REGION SCAN ────────────────────────────────────────────────── */}
        {discoverTab === 'region-scan' ? (
          <div className="discover-pane">
            <p className="muted small discover-pane-desc">
              Runs {'>'}15 targeted queries automatically — nightclubs, beach clubs, bars, rooftops, live music — and surfaces every unique venue in one list.
            </p>
            <div className="search-row">
              <input
                value={sharedLocation}
                onChange={e => setSharedLocation(e.target.value)}
                placeholder="e.g. Malia, Crete"
                onKeyDown={e => { if (e.key === 'Enter' && !scanning) void startRegionScan() }}
              />
              {scanning ? (
                <button className="link-btn" onClick={stopScan}>Stop</button>
              ) : (
                <button
                  className="primary-btn"
                  onClick={() => void startRegionScan()}
                  disabled={!sharedLocation.trim() || !scraperEnabled}
                >
                  Scan region
                </button>
              )}
            </div>

            {!scraperEnabled ? (
              <div className="muted small">
                Region scan requires the scraper backend. Run locally or set VITE_SCRAPER_URL.
              </div>
            ) : null}

            {scanProgress && scanning ? (
              <div className="scan-progress">
                <div className="scan-progress-bar">
                  <div
                    className="scan-progress-fill"
                    style={{ width: `${scanProgress.total > 0 ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0}%` }}
                  />
                </div>
                <div className="muted small scan-progress-label">
                  {scanProgress.done}/{scanProgress.total} — {scanProgress.currentQuery}
                </div>
              </div>
            ) : null}

            {scanResults.length > 0 ? (
              <div className="scan-results-wrapper">
                <div className="scan-results-toolbar">
                  <div className="scan-summary">
                    {scanResults.length} unique results
                    {scanDone && !scanning ? ' · scan complete' : ' · scanning…'}
                  </div>
                  <div className="scan-filter-row">
                    <button className={`chip ${scanFilter === 'own' ? 'active' : ''}`} onClick={() => setScanFilter('own')}>
                      Own sites only
                    </button>
                    <button className={`chip ${scanFilter === 'all' ? 'active' : ''}`} onClick={() => setScanFilter('all')}>
                      All results
                    </button>
                  </div>
                </div>

                {(() => {
                  const visible = scanFilter === 'own' ? scanResults.filter(r => r.likelyOwnSite) : scanResults
                  return (
                    <>
                      <div className="scan-select-row">
                        <button className="link-btn" onClick={() => selectAllVisible(visible)}>
                          Select all ({visible.length})
                        </button>
                        <button className="link-btn" onClick={clearSelection}>Clear</button>
                        {selectedScanUrls.size > 0 ? (
                          <span className="muted small">{selectedScanUrls.size} selected</span>
                        ) : null}
                      </div>
                      <ul className="scan-result-list">
                        {visible.map(r => (
                          <li key={r.url} className={`scan-result-item ${selectedScanUrls.has(r.url) ? 'selected' : ''}`}>
                            <label className="scan-result-check">
                              <input
                                type="checkbox"
                                checked={selectedScanUrls.has(r.url)}
                                onChange={() => toggleScanUrl(r.url)}
                              />
                            </label>
                            <div className="scan-result-body">
                              <div className="scan-result-title">{r.title}</div>
                              <a
                                className="scan-result-url cell-link"
                                href={r.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                              >
                                {r.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                              </a>
                              <div className="scan-result-desc muted small">{r.description}</div>
                            </div>
                            <div className="scan-result-actions">
                              {r.likelyOwnSite
                                ? <span className="scan-badge own">own site</span>
                                : <span className="scan-badge dir">directory</span>}
                              <button
                                className="link-btn"
                                onClick={() => { setScrapeUrlInput(r.url); void runScrape() }}
                              >
                                Scrape →
                              </button>
                            </div>
                          </li>
                        ))}
                        {visible.length === 0 ? (
                          <li className="muted small">No results match this filter.</li>
                        ) : null}
                      </ul>
                      {addScanProgress ? <div className="muted small scan-done-msg">{addScanProgress}</div> : null}
                      {selectedScanUrls.size > 0 ? (
                        <div className="scan-add-bar">
                          <button
                            className="primary-btn"
                            onClick={() => void addSelectedFromScan(visible)}
                            disabled={addingFromScan}
                          >
                            {addingFromScan
                              ? 'Adding…'
                              : `Scrape & add ${selectedScanUrls.size} venue${selectedScanUrls.size !== 1 ? 's' : ''}`}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )
                })()}
              </div>
            ) : null}

            {scanDone && scanResults.length === 0 ? (
              <div className="muted small">
                No results found. Try a different location or check scraper connectivity.
              </div>
            ) : null}

            {/* Pro upsell */}
            <div className="discover-pro-section">
              <div className="dash-pro-header">
                <span className="pro-badge">Pro</span>
                <span className="dash-pro-title">Go deeper</span>
                <span className="dash-pro-desc">Enrich contacts on the fly and schedule weekly re-scans.</span>
              </div>
              <div className="discover-pro-cards">
                <ProGate
                  feature="Auto-enrich on import"
                  description="Pro scrapes each venue website for email and Instagram as you add — no separate bulk-enrich step needed."
                  className="card discover-pro-card"
                >
                  <h3>Auto-enrich on import</h3>
                  <div className="mock-autoenrich-preview">
                    {([
                      { name: 'Cavo Paradiso', tags: ['email', 'instagram'] },
                      { name: 'Scorpios Mykonos', tags: ['email', 'phone'] },
                      { name: 'Tropicana Beach', tags: ['email', 'instagram', 'phone'] },
                    ] as const).map(row => (
                      <div key={row.name} className="mock-autoenrich-row">
                        <span className="mock-autoenrich-name">{row.name}</span>
                        <div className="mock-autoenrich-tags">
                          {row.tags.map(t => (
                            <span key={t} className="mock-tl-type sent">{t} ✓</span>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="muted small" style={{ marginTop: 6 }}>
                      Contacts enriched during import — no extra step
                    </div>
                  </div>
                </ProGate>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── IMPORT ─────────────────────────────────────────────────────── */}
        {discoverTab === 'import' ? (
          <div className="discover-pane">
            <div className="discover-import-grid">

              {/* CSV upload */}
              <div className="card">
                <h3>Upload spreadsheet</h3>
                <p className="muted small">
                  Export your sheet as CSV or TSV — the app searches for each row's official site and extracts public contact fields.
                </p>
                <label className="field">
                  <span className="field-label">Import as</span>
                  <select
                    value={importEntityType}
                    onChange={e => setImportEntityType(e.target.value as 'auto' | 'venue' | 'festival')}
                  >
                    <option value="auto">Auto-detect per row</option>
                    <option value="venue">Force all → Venues</option>
                    <option value="festival">Force all → Festivals</option>
                  </select>
                  <span className="muted small">
                    {importEntityType === 'auto'
                      ? 'Each row classified individually — festival keywords go to Festivals, everything else to Venues.'
                      : `All rows forced into ${importEntityType === 'festival' ? 'Festivals' : 'Venues'}.`}
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">CSV or TSV file</span>
                  <div className="import-columns-hint">
                    <strong>Required:</strong> name (or company)<br />
                    <strong>Optional:</strong> city, category, website, instagram, email, phone, notes
                  </div>
                  <input
                    type="file"
                    accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={e => void handleFilePicked(e.target.files?.[0] ?? null)}
                  />
                </label>
                {importedRows.length > 0 ? (
                  <div className="scrape-preview">
                    <div className="preview-row"><span className="preview-key">File</span><span>{importFileName}</span></div>
                    <div className="preview-row"><span className="preview-key">Rows</span><span>{importedRows.length}</span></div>
                    <div className="preview-row">
                      <span className="preview-key">Sample</span>
                      <span>{importedRows.slice(0, 3).map(r => r.name).join(' · ')}</span>
                    </div>
                  </div>
                ) : null}
                {importProgress ? <div className="muted small">{importProgress}</div> : null}
                {importSummary ? <div className="muted small">{importSummary}</div> : null}
                {importError ? <div className="error">{importError}</div> : null}
                <button
                  className="primary-btn"
                  onClick={() => void runSpreadsheetImport()}
                  disabled={importing || importedRows.length === 0}
                >
                  {importing ? 'Importing…' : 'Import and enrich'}
                </button>
              </div>

              {/* URL scrape */}
              <div className="card">
                <h3>Scrape venue website</h3>
                <p className="muted small">Paste any venue URL. The app scrapes for email, Instagram, phone, and address.</p>
                <div className="search-row">
                  <input
                    value={scrapeUrlInput}
                    onChange={e => setScrapeUrlInput(e.target.value)}
                    placeholder="https://venue-site.example/"
                    onKeyDown={e => { if (e.key === 'Enter') void runScrape() }}
                  />
                  <button
                    className="primary-btn"
                    onClick={() => void runScrape()}
                    disabled={scraping || !scrapeUrlInput.trim() || !scraperEnabled}
                  >
                    {scraping ? 'Fetching…' : 'Scrape'}
                  </button>
                </div>
                {!scraperEnabled ? (
                  <div className="muted small">Scraper offline. Run locally or add VITE_SCRAPER_URL.</div>
                ) : null}
                {scrapeError ? <div className="error">{scrapeError}</div> : null}
                {scrapePreview ? (
                  <div className="scrape-preview">
                    <div className="preview-row"><span className="preview-key">Name</span><span>{scrapePreview.name || '—'}</span></div>
                    <div className="preview-row"><span className="preview-key">Website</span><span>{scrapePreview.website}</span></div>
                    <div className="preview-row"><span className="preview-key">Email</span><span>{scrapePreview.email || '—'}</span></div>
                    <div className="preview-row"><span className="preview-key">Instagram</span><span>{scrapePreview.instagram ? `@${scrapePreview.instagram}` : '—'}</span></div>
                    <div className="preview-row"><span className="preview-key">Phone</span><span>{scrapePreview.phone || '—'}</span></div>
                    <div className="preview-row"><span className="preview-key">Address</span><span>{scrapePreview.address || '—'}</span></div>
                    <div className="field-row">
                      <label className="field">
                        <span className="field-label">City</span>
                        <input
                          list="cities-datalist"
                          value={draftCity}
                          onChange={e => setDraftCity(e.target.value as City)}
                          placeholder="City…"
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">Category</span>
                        <select value={draftCategory} onChange={e => setDraftCategory(e.target.value as Category)}>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                    </div>
                    <button className="primary-btn" onClick={() => void saveScrapedAsVenue()}>Save as venue</button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Advanced: web search */}
            <details className="discover-advanced">
              <summary className="muted small">Advanced: web search</summary>
              <div className="card" style={{ marginTop: 8 }}>
                <h3>Search & discover</h3>
                <div className="search-row">
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="e.g. Berlin techno club official website"
                    onKeyDown={e => { if (e.key === 'Enter') void runSearch() }}
                  />
                  <button className="primary-btn" onClick={() => void runSearch()} disabled={searching || !scraperEnabled}>
                    {searching ? 'Searching…' : 'Search'}
                  </button>
                </div>
                <div className="suggested-row">
                  {SUGGESTED_QUERIES.map(q => (
                    <button key={q} className="chip" onClick={() => setQuery(q)}>{q}</button>
                  ))}
                </div>
                <div className="launcher-row">
                  <span className="muted">Open in: </span>
                  {SEARCH_LAUNCHERS.map(l => (
                    <button key={l.label} className="link-btn" onClick={() => launchExternal(l.label)}>{l.label}</button>
                  ))}
                </div>
                {!scraperEnabled ? (
                  <div className="muted small">In-app search requires VITE_SCRAPER_URL in deployed mode.</div>
                ) : null}
                {searchError ? <div className="error">{searchError}</div> : null}
                {searchResults ? (
                  <ul className="search-results">
                    {searchResults.map(r => (
                      <li key={r.url}>
                        <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                        <div className="muted small">{r.url}</div>
                        <div>{r.description}</div>
                        <button className="link-btn" onClick={() => { setScrapeUrlInput(r.url); void runScrape() }}>
                          Scrape this →
                        </button>
                      </li>
                    ))}
                    {searchResults.length === 0 ? <div className="muted">No results.</div> : null}
                  </ul>
                ) : null}
              </div>
            </details>
          </div>
        ) : null}

        {/* ── QUICK ADD ──────────────────────────────────────────────────── */}
        {discoverTab === 'quick-add' ? (
          <div className="discover-pane">
            <div className="card discover-quickadd-card">
              <h3>Quick add</h3>
              <p className="muted small">
                For venues already cleared by your scout team. Type detected automatically from the name and category.
              </p>
              <label className="field">
                <span className="field-label">Name</span>
                <input value={quickName} onChange={e => setQuickName(e.target.value)} placeholder="e.g. Kater Blau" />
              </label>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">City</span>
                  <input
                    list="cities-datalist"
                    value={quickCity}
                    onChange={e => setQuickCity(e.target.value as City)}
                    placeholder="City…"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Category</span>
                  <select value={quickCategory} onChange={e => setQuickCategory(e.target.value as Category)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <label className="field">
                <span className="field-label">Instagram handle</span>
                <input value={quickInstagram} onChange={e => setQuickInstagram(e.target.value)} placeholder="handle (no @)" />
              </label>
              <label className="field">
                <span className="field-label">Website</span>
                <input value={quickWebsite} onChange={e => setQuickWebsite(e.target.value)} placeholder="https://…" />
              </label>
              <div className="quick-add-footer">
                {quickName.trim() ? (
                  <span className={`classify-badge classify-${classifyEntityType(quickName.trim(), quickCategory)}`}>
                    → {classifyEntityType(quickName.trim(), quickCategory) === 'festival' ? 'Festivals' : 'Venues'} tab
                  </span>
                ) : null}
                <button className="primary-btn" onClick={() => void quickAdd()} disabled={!quickName.trim()}>Add</button>
              </div>
              {quickAddResult ? (
                <div className="quick-add-confirm">
                  ✓ <strong>{quickAddResult.name}</strong> added to the <strong>{quickAddResult.tab}</strong> tab
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ── SETTINGS ───────────────────────────────────────────────────── */}
        {discoverTab === 'settings' ? (
          <div className="discover-pane">
            <div className="discover-settings-grid">

              {/* AI routing */}
              <div className="card">
                <h3>AI routing</h3>
                <p className="muted small">
                  OpenRouter key for auto model selection during contact extraction. Stored in your browser only.
                </p>
                <label className="field">
                  <span className="field-label">OpenRouter API key</span>
                  <input
                    type="password"
                    value={aiSettings.openRouterApiKey}
                    placeholder="sk-or-v1-..."
                    onChange={e => {
                      const next = { ...aiSettings, openRouterApiKey: e.target.value }
                      setAiSettings(next)
                      saveAiSettings(next)
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Model route</span>
                  <input
                    value={aiSettings.openRouterModel}
                    placeholder={DEFAULT_AI_SETTINGS.openRouterModel}
                    onChange={e => {
                      const next = {
                        ...aiSettings,
                        openRouterModel: e.target.value || DEFAULT_AI_SETTINGS.openRouterModel,
                      }
                      setAiSettings(next)
                      saveAiSettings(next)
                    }}
                  />
                </label>
                <div className="muted small">Recommended: <code>openrouter/auto</code></div>
              </div>

              {/* Google Maps */}
              <div className="card">
                <h3>Google Maps</h3>
                <p className="muted small">
                  Structured venue data including ratings, opening hours, and website. Requires a Google Maps Places API key set in the Worker environment.
                </p>
                <div className="maps-tos-warning">
                  ⚠ Google Maps Places API ToS prohibits storing place data (addresses, phone numbers, ratings) in a database. Use results for on-screen reference only — do not import to persistent storage.
                </div>
                <div className="search-row">
                  <input
                    value={mapsLocation}
                    onChange={e => setMapsLocation(e.target.value)}
                    placeholder="e.g. Chania, Crete"
                    onKeyDown={e => { if (e.key === 'Enter' && !mapsSearching) void searchMaps() }}
                  />
                  <button
                    className="primary-btn"
                    onClick={() => void searchMaps()}
                    disabled={mapsSearching || !mapsLocation.trim()}
                  >
                    {mapsSearching ? 'Searching…' : 'Search Maps'}
                  </button>
                </div>
                {mapsError ? <div className="error">{mapsError}</div> : null}
                {mapsResults.length > 0 ? (
                  <div className="scan-results-wrapper">
                    <div className="scan-results-toolbar">
                      <div className="scan-summary">{mapsResults.length} venues found</div>
                      <div className="scan-filter-row">
                        <button className="link-btn" onClick={() => setSelectedMapsIds(new Set(mapsResults.map(r => r.place_id)))}>
                          Select all
                        </button>
                        <button className="link-btn" onClick={() => setSelectedMapsIds(new Set())}>Clear</button>
                      </div>
                    </div>
                    <ul className="scan-result-list">
                      {mapsResults.map(r => (
                        <li key={r.place_id} className={`scan-result-item ${selectedMapsIds.has(r.place_id) ? 'selected' : ''}`}>
                          <label className="scan-result-check">
                            <input
                              type="checkbox"
                              checked={selectedMapsIds.has(r.place_id)}
                              onChange={() => toggleMapsId(r.place_id)}
                            />
                          </label>
                          <div className="scan-result-body">
                            <div className="scan-result-title">{r.name}</div>
                            <div className="muted small">{r.address}</div>
                            {r.phone ? <div className="muted small">{r.phone}</div> : null}
                            {r.website ? (
                              <a
                                className="scan-result-url cell-link"
                                href={r.website}
                                target="_blank"
                                rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                              >
                                {r.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                              </a>
                            ) : null}
                          </div>
                          <div className="scan-result-actions">
                            {r.rating ? <span className="scan-badge own">★ {r.rating}</span> : null}
                            <span className="scan-badge dir">{r.primary_type?.replace(/_/g, ' ') ?? 'venue'}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {selectedMapsIds.size > 0 ? (
                      <div className="scan-add-bar">
                        {addMapsProgress ? <span className="muted small">{addMapsProgress}</span> : null}
                        <button
                          className="primary-btn"
                          onClick={() => void addSelectedFromMaps()}
                          disabled={addingFromMaps}
                        >
                          {addingFromMaps
                            ? 'Adding…'
                            : `Add ${selectedMapsIds.size} venue${selectedMapsIds.size !== 1 ? 's' : ''}`}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {!mapsSearching && mapsResults.length === 0 && mapsError === null ? (
                  <div className="muted small">Requires GOOGLE_MAPS_API_KEY in the Worker environment.</div>
                ) : null}
              </div>

              {/* Scheduled re-scan — Agency tier upsell */}
              <ProGate
                feature="Scheduled re-scan"
                description="Scan saved locations on a weekly schedule and surface new venues automatically. New entries push directly into Instantly.ai sequences."
                className="card"
              >
                <h3>
                  Scheduled re-scan
                  <span className="pro-badge" style={{ fontSize: '0.6rem', marginLeft: 8, verticalAlign: 'middle' }}>
                    Agency
                  </span>
                </h3>
                <div className="mock-schedule">
                  <div className="mock-cb-row">
                    <span className="mock-field-label">Saved locations</span>
                    <div className="mock-chip-row">
                      <span className="mock-chip">Berlin, Germany</span>
                      <span className="mock-chip">Amsterdam, NL</span>
                      <span className="mock-chip mock-chip-add">+ add</span>
                    </div>
                  </div>
                  <div className="mock-cb-row">
                    <span className="mock-field-label">Frequency</span>
                    <select className="mock-select" disabled><option>Weekly — every Monday</option></select>
                  </div>
                  <div className="mock-cb-row">
                    <span className="mock-field-label">On new venues</span>
                    <select className="mock-select" disabled><option>Add to DB + push to Instantly.ai</option></select>
                  </div>
                  <button className="mock-btn mock-btn-accent" disabled>Save schedule →</button>
                </div>
              </ProGate>

            </div>
          </div>
        ) : null}

      </div>

      <datalist id="cities-datalist">
        {CITIES.map(c => <option key={c} value={c} />)}
      </datalist>
    </section>
  )
}
