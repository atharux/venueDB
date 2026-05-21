import { useEffect, useState } from 'react'
import type { City, Category, Venue, VenueDraft } from '../types'
import { CITIES, CATEGORIES } from '../types'
import { SEARCH_LAUNCHERS, enrichLead, scrapeUrl, scraperEnabled, searchWeb, type SearchResult } from '../scraper'
import { findExistingVenueByName, toVenueDraft, type ImportedLeadRow } from '../importCsv'
import { DEFAULT_AI_SETTINGS, loadAiSettings, saveAiSettings } from '../aiSettings'
import { parseUploadedSpreadsheet } from '../importApi'

interface Props {
  venues: Venue[]
  onAdd: (draft: VenueDraft) => Promise<Venue>
  onUpdate: (id: string, patch: Partial<Venue>) => Promise<void> | void
  existingNames: Set<string>
  /** Default entity_type for new rows — usually the active tab. User can override per-import. */
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

export function DiscoveryPanel({ venues, onAdd, onUpdate, existingNames, defaultEntityType = 'venue' }: Props) {
  const [aiSettings, setAiSettings] = useState(loadAiSettings)
  // Per-import override so a festival sheet can be imported into the Festivals
  // tab even if you forgot to switch tabs first. Selector defaults to the
  // active tab; user can flip before clicking "Import and enrich".
  const [importEntityType, setImportEntityType] = useState<'venue' | 'festival'>(defaultEntityType)
  // Keep the selector in sync when the active tab changes (only if no import
  // is currently staged — don't clobber a deliberate override mid-flight).
  useEffect(() => {
    setImportEntityType(prev => (prev === defaultEntityType ? prev : defaultEntityType))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultEntityType])
  const [query, setQuery] = useState('Berlin techno club official website')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
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

  const [draftCity, setDraftCity] = useState<City>('Berlin')
  const [draftCategory, setDraftCategory] = useState<Category>('Beach Club')

  const saveScrapedAsVenue = async () => {
    if (!scrapePreview) return
    const name = scrapePreview.name?.trim() || scrapePreview.website
    if (existingNames.has(name.toLowerCase())) {
      if (!confirm(`A venue named "${name}" already exists. Add anyway?`)) return
    }
    await onAdd({
      name,
      category: draftCategory,
      city: draftCity,
      entity_type: importEntityType,
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

  const [quickName, setQuickName] = useState('')
  const [quickCity, setQuickCity] = useState<City>('Berlin')
  const [quickCategory, setQuickCategory] = useState<Category>('Bar with DJs')
  const [quickInstagram, setQuickInstagram] = useState('')
  const [quickWebsite, setQuickWebsite] = useState('')
  const [importedRows, setImportedRows] = useState<ImportedLeadRow[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState('')
  const [importSummary, setImportSummary] = useState<string | null>(null)

  const quickAdd = async () => {
    if (!quickName.trim()) return
    if (existingNames.has(quickName.trim().toLowerCase())) {
      if (!confirm(`A venue named "${quickName}" already exists. Add anyway?`)) return
    }
    await onAdd({
      name: quickName.trim(),
      category: quickCategory,
      city: quickCity,
      entity_type: importEntityType,
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
        const existing = findExistingVenueByName(venues, row.name)
        if (existing) {
          await onUpdate(existing.id, {
            city: patch.city,
            category: patch.category,
            // entity_type is intentionally overwritten by the import — that
            // way an existing "Festival X" row mistakenly classified as a
            // venue gets reclassified when the user re-imports it as a
            // festival. Matches the same overwrite logic as city/category.
            entity_type: importEntityType,
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
          // Explicit entity_type wins over addScoped's default (which is the
          // active tab). Without this, importing a festival sheet from the
          // Venues tab would silently land 302 rows in the wrong slice.
          await onAdd({ ...patch, entity_type: importEntityType })
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
    const enriched = await enrichLead(
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
      website: row.website ?? enriched.website,
      email: row.email ?? enriched.email,
      instagram: row.instagram ?? enriched.instagram,
      phone: row.phone ?? enriched.phone,
      notes: row.notes ?? enriched.notes,
    }
  }

  return (
    <section className="discovery-panel">
      <div className="discovery-grid">
        <div className="card discovery-card">
          <h3>AI routing</h3>
          <p className="muted small">
            Add your OpenRouter key to let enrichment use auto model selection for contact extraction. This is saved only in your browser on this machine.
          </p>
          <label className="field">
            <span className="field-label">OpenRouter API key</span>
            <input
              type="password"
              value={aiSettings.openRouterApiKey}
              placeholder="sk-or-v1-..."
              onChange={event => {
                const next = { ...aiSettings, openRouterApiKey: event.target.value }
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
              onChange={event => {
                const next = {
                  ...aiSettings,
                  openRouterModel: event.target.value || DEFAULT_AI_SETTINGS.openRouterModel,
                }
                setAiSettings(next)
                saveAiSettings(next)
              }}
            />
          </label>
          <div className="muted small">
            Default recommended value: <code>openrouter/auto</code>
          </div>
        </div>

        <div className="card discovery-card">
          <h3>Upload spreadsheet</h3>
          <p className="muted small">
            MVP path: export your sheet as CSV or TSV, upload it here, and the app will search for the official site plus scrape public contact fields for each row.
          </p>
          <label className="field">
            <span className="field-label">Import as</span>
            <select
              value={importEntityType}
              onChange={event => setImportEntityType(event.target.value as 'venue' | 'festival')}
            >
              <option value="venue">Venues</option>
              <option value="festival">Festivals</option>
            </select>
            <span className="muted small">
              All rows in this import land in the <strong>{importEntityType === 'festival' ? 'Festivals' : 'Venues'}</strong> tab.
              Quick Add and Save-scrape below also use this choice.
              {importEntityType !== defaultEntityType ? ' Override differs from the active tab — that\'s on purpose.' : ''}
            </span>
          </label>
          <label className="field">
            <span className="field-label">CSV or TSV file</span>
            <input
              type="file"
              accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={event => void handleFilePicked(event.target.files?.[0] ?? null)}
            />
          </label>
          {importedRows.length > 0 ? (
            <div className="scrape-preview">
              <div className="preview-row"><span className="preview-key">File</span><span>{importFileName}</span></div>
              <div className="preview-row"><span className="preview-key">Rows</span><span>{importedRows.length}</span></div>
              <div className="preview-row"><span className="preview-key">Columns expected</span><span>Name/company required. Optional: city, category, website, instagram, email, phone, notes.</span></div>
              <div className="preview-row"><span className="preview-key">Sample</span><span>{importedRows.slice(0, 3).map(row => row.name).join(' · ')}</span></div>
            </div>
          ) : null}
          {importProgress ? <div className="muted small">{importProgress}</div> : null}
          {importSummary ? <div className="muted small">{importSummary}</div> : null}
          {importError ? <div className="error">{importError}</div> : null}
          <button className="primary-btn" onClick={() => void runSpreadsheetImport()} disabled={importing || importedRows.length === 0}>
            {importing ? 'Importing…' : 'Import and enrich'}
          </button>
        </div>

        {/* Search */}
        <div className="card discovery-card">
          <h3>Search & discover</h3>
          <div className="search-row">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Berlin techno club official website"
              onKeyDown={e => {
                if (e.key === 'Enter') runSearch()
              }}
            />
            <button className="primary-btn" onClick={runSearch} disabled={searching || !scraperEnabled}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div className="suggested-row">
            {SUGGESTED_QUERIES.map(q => (
              <button key={q} className="chip" onClick={() => setQuery(q)}>
                {q}
              </button>
            ))}
          </div>
          <div className="launcher-row">
            <span className="muted">Open in: </span>
            {SEARCH_LAUNCHERS.map(l => (
              <button key={l.label} className="link-btn" onClick={() => launchExternal(l.label)}>
                {l.label}
              </button>
            ))}
          </div>
          {!scraperEnabled ? (
            <div className="muted small">
              In-app search is offline in deployed mode until you configure `VITE_SCRAPER_URL`. In local dev, the app now runs its own `/api` scraper.
            </div>
          ) : null}
          {searchError ? <div className="error">{searchError}</div> : null}
          {searchResults ? (
            <ul className="search-results">
              {searchResults.map(r => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                  <div className="muted small">{r.url}</div>
                  <div>{r.description}</div>
                  <button
                    className="link-btn"
                    onClick={() => {
                      setScrapeUrlInput(r.url)
                      runScrape()
                    }}
                  >
                    Scrape this →
                  </button>
                </li>
              ))}
              {searchResults.length === 0 ? <div className="muted">No results.</div> : null}
            </ul>
          ) : null}
        </div>

        {/* Scrape */}
        <div className="card discovery-card">
          <h3>Scrape venue website</h3>
          <p className="muted small">
            Paste any venue URL. In local MVP mode the app scrapes via its own Vite API; in deployed mode it uses the external scraper URL if provided.
          </p>
          <div className="search-row">
            <input
              value={scrapeUrlInput}
              onChange={e => setScrapeUrlInput(e.target.value)}
              placeholder="https://venue-site.example/"
              onKeyDown={e => {
                if (e.key === 'Enter') runScrape()
              }}
            />
            <button
              className="primary-btn"
              onClick={runScrape}
              disabled={scraping || !scrapeUrlInput.trim() || !scraperEnabled}
            >
              {scraping ? 'Fetching…' : 'Scrape'}
            </button>
          </div>
          {!scraperEnabled ? (
            <div className="muted small">
              Scraper offline. Run the app locally for built-in scraping, or add `VITE_SCRAPER_URL` for deployed mode.
            </div>
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
                  <select value={draftCity} onChange={e => setDraftCity(e.target.value as City)}>
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Category</span>
                  <select value={draftCategory} onChange={e => setDraftCategory(e.target.value as Category)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <button className="primary-btn" onClick={saveScrapedAsVenue}>
                Save as venue
              </button>
            </div>
          ) : null}
        </div>

        {/* Manual quick add */}
        <div className="card discovery-card">
          <h3>Quick add</h3>
          <p className="muted small">For venues already cleared by your scout team.</p>
          <label className="field">
            <span className="field-label">Name</span>
            <input value={quickName} onChange={e => setQuickName(e.target.value)} placeholder="e.g. Kater Blau" />
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">City</span>
              <select value={quickCity} onChange={e => setQuickCity(e.target.value as City)}>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
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
          <button className="primary-btn" onClick={quickAdd} disabled={!quickName.trim()}>
            Add venue
          </button>
        </div>
      </div>
    </section>
  )
}
