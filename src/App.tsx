import { useMemo, useState, useEffect, useRef } from 'react'
import { isDemoMode, APP_PASSCODE } from './config'
import { AccessGate, isAccessGranted } from './components/AccessGate'
import { useVenues } from './useVenues'
import { Dashboard } from './components/Dashboard'
import { VenueTable } from './components/VenueTable'
import { VenueDetail } from './components/VenueDetail'
import { OutreachPanel } from './components/OutreachPanel'
import { DiscoveryPanel } from './components/DiscoveryPanel'
import { MapView } from './components/MapView'
import { ScraperStatusBadge } from './components/ScraperStatusBadge'
import { BulkEnrichPanel } from './components/BulkEnrichPanel'
import { PricingModal } from './components/PricingModal'
import { MigrationGuide } from './components/MigrationGuide'
import { SettingsModal, loadBrandTheme } from './components/SettingsModal'
import type { BrandTheme } from './components/SettingsModal'
import { AboutModal } from './components/AboutModal'
import { RegionAuditModal } from './components/RegionAuditModal'
import { exportJson, exportCsv } from './storage'
import { scraperEnabled } from './scraper'
import { CITIES } from './types'
import type { City, Category, OutreachStatus, Tag, Venue } from './types'
import './App.css'

type EntityType = 'venue' | 'festival'
type TabId = 'venues' | 'festivals' | 'dashboard' | 'discover' | 'map'

interface TableFilters {
  city?: City | ''
  category?: Category | ''
  status?: OutreachStatus | ''
  tag?: Tag | ''
  region?: string | ''
}

/** Default to 'venue' for legacy rows that pre-date the entity_type field. */
function entityOf(v: Venue): EntityType {
  return v.entity_type === 'festival' ? 'festival' : 'venue'
}

export default function App() {
  const [accessGranted, setAccessGranted] = useState(() => isDemoMode || isAccessGranted())

  // Gate: show passcode screen if VITE_APP_PASSCODE is set and not yet cleared
  if (!accessGranted && APP_PASSCODE) {
    return <AccessGate onGranted={() => setAccessGranted(true)} />
  }

  return <AppInner />
}

function AppInner() {
  const { venues, loading, error, add, update, remove, cleanupDuplicates, cleanupPhones, normaliseAll, storageMode, recentlyAddedIds } = useVenues()
  const [tab, setTab] = useState<TabId>('venues')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tableFilters, setTableFilters] = useState<TableFilters | undefined>(undefined)
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)
  const [pricingOpen, setPricingOpen] = useState(false)
  const [migrationOpen, setMigrationOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [regionAuditOpen, setRegionAuditOpen] = useState(false)
  const [brand, setBrand] = useState<BrandTheme>(loadBrandTheme)

  // The dashboard tab has its own entity toggle — without it, the dashboard
  // (and its bulk-enrich panel) could only ever see venues, never festivals.
  const [dashEntity, setDashEntity] = useState<EntityType>('venue')

  // Split the dataset by entity_type so each tab gets its own slice. Same
  // table, same indexes, just a virtual partition for the UI. New rows
  // inherit the active tab's entity type via wrapping add/update.
  const activeEntity: EntityType =
    tab === 'festivals' ? 'festival' : tab === 'dashboard' ? dashEntity : 'venue'
  const scopedVenues = useMemo(
    () => venues.filter(v => entityOf(v) === activeEntity),
    [venues, activeEntity],
  )

  const selected = venues.find(v => v.id === selectedId) ?? null
  const existingNames = new Set(scopedVenues.map(v => v.name.toLowerCase()))

  // Wrap add so new rows from Quick Add / scrape preview inherit the active
  // tab's entity type AS A DEFAULT. Explicit entity_type in the draft (e.g.
  // when an Import-as=Festival selector overrides) takes priority.
  // Spread order matters: `entity_type: activeEntity` is the floor, draft wins.
  const addScoped: typeof add = draft => add({ entity_type: activeEntity, ...draft })

  const drillDown = (filter: TableFilters) => {
    // Reset other filters when drilling — single-dimension focus is more
    // intuitive when clicking a chart bar. Routes to the table tab matching
    // the currently active entity so festival-mode dashboard click goes to
    // the festivals tab, not venues.
    setTableFilters({
      city: filter.city ?? '',
      region: filter.region ?? '',
      category: filter.category ?? '',
      status: filter.status ?? '',
      tag: filter.tag ?? '',
    })
    setTab(activeEntity === 'festival' ? 'festivals' : 'venues')
  }

  // Close actions dropdown on outside click
  useEffect(() => {
    if (!actionsOpen) return
    const handler = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [actionsOpen])

  // Escape closes the detail pane (skips when focus is inside a form element)
  useEffect(() => {
    if (!selected) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      setSelectedId(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selected])

  return (
    <div className={`app ${tab === 'festivals' || (tab === 'dashboard' && dashEntity === 'festival') ? 'is-festivals' : ''} ${brand === 'hydrat3' ? 'brand-hydrat3' : ''}`}>
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">VI</div>
          <div>
            <div className="brand-title">
              Venue Intelligence
              <span className="brand-version" title="deployed build · date">
                {__APP_VERSION__} · {__BUILD_DATE__}
              </span>
            </div>
            <div className="brand-sub">Scout · Qualify · Contact · Convert</div>
          </div>
        </div>

        <nav className="tabs" aria-label="Primary navigation">
          {/* DATA group */}
          <div className="tab-group">
            <span className="tab-group-label">Data</span>
            <button
              className={tab === 'venues' ? 'active' : ''}
              onClick={() => { setTab('venues'); setTableFilters(undefined) }}
            >
              Venues <span className="count">{venues.filter(v => entityOf(v) === 'venue').length}</span>
            </button>
            <button
              className={`tab-festivals ${tab === 'festivals' ? 'active' : ''}`}
              onClick={() => { setTab('festivals'); setTableFilters(undefined) }}
            >
              Festivals <span className="count">{venues.filter(v => entityOf(v) === 'festival').length}</span>
            </button>
          </div>

          <div className="tab-group-sep" aria-hidden="true" />

          {/* INSIGHTS group */}
          <div className="tab-group">
            <span className="tab-group-label">Insights</span>
            <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
              Dashboard
            </button>
            <button className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}>
              🗺 Map
            </button>
          </div>

          <div className="tab-group-sep" aria-hidden="true" />

          {/* TOOLS group */}
          <div className="tab-group">
            <span className="tab-group-label">Tools</span>
            <button className={tab === 'discover' ? 'active' : ''} onClick={() => setTab('discover')}>
              Discover {scraperEnabled ? null : <span className="badge-offline">offline</span>}
            </button>
          </div>
        </nav>

        <div className="header-actions">
          <span
            className={`mode-badge mode-${storageMode}`}
            title={
              storageMode === 'supabase'
                ? 'Syncing to Supabase — data is shared across devices and users.'
                : 'Data is stored in this browser only. Open Migration guide (footer) to move to Supabase for cloud sync and team access.'
            }
          >
            {storageMode === 'supabase' ? 'Supabase' : 'localStorage'}
          </span>
          <ScraperStatusBadge />
          <button
            className="icon-btn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Open settings"
          >
            ⚙
          </button>
          <div className="actions-menu" ref={actionsRef}>
            <button
              className={`actions-trigger ${actionsOpen ? 'is-open' : ''}`}
              onClick={() => setActionsOpen(o => !o)}
              aria-expanded={actionsOpen}
              aria-haspopup="menu"
            >
              Actions <span className="actions-caret">{actionsOpen ? '▲' : '▾'}</span>
            </button>
            {actionsOpen && (
              <div className="actions-dropdown" role="menu">
                <button
                  role="menuitem"
                  onClick={() => { exportCsv(venues); setActionsOpen(false) }}
                >
                  ⬇ Download CSV
                </button>
                <button
                  role="menuitem"
                  onClick={() => { exportJson(venues); setActionsOpen(false) }}
                >
                  ⬇ Download JSON
                </button>
                <div className="dropdown-divider" />
                <button
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false)
                    if (confirm('Delete duplicate venues and keep the strongest record for each name and city?')) {
                      void cleanupDuplicates().then(removed => {
                        alert(removed > 0 ? `Removed ${removed} duplicate venues.` : 'No duplicates found.')
                      })
                    }
                  }}
                >
                  Delete duplicates
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false)
                    if (confirm('Clear phone values that are not real phone numbers (scraped coordinates, dates, year ranges)? Valid numbers are kept.')) {
                      void cleanupPhones().then(({ cleared, normalized }) => {
                        alert(
                          cleared > 0 || normalized > 0
                            ? `Cleared ${cleared} invalid phone${cleared !== 1 ? 's' : ''}${normalized > 0 ? `, normalized ${normalized}` : ''}.`
                            : 'All stored phone numbers look valid.',
                        )
                      })
                    }
                  }}
                >
                  Clean phone numbers
                </button>
                <div className="dropdown-divider" />
                <button
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false)
                    if (confirm('Re-run data normalisation on all records? This fixes city casing, trims whitespace, and cleans contact fields. updated_at will be bumped on changed records.')) {
                      void normaliseAll().then(changed => {
                        alert(changed > 0 ? `Normalised ${changed} record${changed !== 1 ? 's' : ''}.` : 'All records already clean.')
                      })
                    }
                  }}
                >
                  Normalise all records
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setActionsOpen(false); setRegionAuditOpen(true) }}
                >
                  Region audit
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {isDemoMode && (
        <div style={{
          padding: '0.45rem 1.25rem',
          background: 'rgba(6,182,212,0.07)',
          borderBottom: '1px solid rgba(6,182,212,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '0.75rem', flexWrap: 'wrap',
          fontFamily: 'Space Mono, monospace', fontSize: '0.65rem',
        }}>
          <span style={{ color: '#67e8f9' }}>
            ◉ DEMO MODE — seed data only, changes are browser-local, Supabase is not connected
          </span>
          <a
            href="mailto:athar@atharux.com?subject=Venue Intelligence access request"
            style={{ color: '#475569', textDecoration: 'none', borderBottom: '1px solid #374151', paddingBottom: 1 }}
          >
            request full access →
          </a>
        </div>
      )}

      {error ? <div className="banner error-banner">{error}</div> : null}
      {loading ? <div className="banner">Loading venues…</div> : null}

      <main className={`app-main ${selected ? 'with-detail' : ''}`}>
        <div className="main-pane">
          {tab === 'venues' || tab === 'festivals' ? (
            <>
              <BulkEnrichPanel
                venues={scopedVenues}
                onUpdateVenue={update}
                entityLabel={tab === 'festivals' ? 'festivals' : 'venues'}
                defaultCollapsed
              />
              <VenueTable
                venues={scopedVenues}
                selectedId={selectedId}
                onSelect={setSelectedId}
                initialFilters={tableFilters}
                recentlyAddedIds={recentlyAddedIds}
                persistKey={tab}
                onNavigateDiscover={() => setTab('discover')}
              />
            </>
          ) : null}
          {tab === 'dashboard' ? (
            <>
              <div className="scan-filter-row" role="group" aria-label="Dashboard entity selector">
                <span className="dash-entity-label">Showing:</span>
                <button
                  className={`chip ${dashEntity === 'venue' ? 'active' : ''}`}
                  onClick={() => setDashEntity('venue')}
                >
                  Venues ({venues.filter(v => entityOf(v) === 'venue').length})
                </button>
                <button
                  className={`chip ${dashEntity === 'festival' ? 'active' : ''}`}
                  onClick={() => setDashEntity('festival')}
                >
                  Festivals ({venues.filter(v => entityOf(v) === 'festival').length})
                </button>
              </div>
              <Dashboard
                venues={scopedVenues}
                onDrillDown={drillDown}
                onUpdateVenue={update}
                entityLabel={dashEntity === 'festival' ? 'festivals' : 'venues'}
              />
            </>
          ) : null}
          {tab === 'discover' ? (
            <DiscoveryPanel
              venues={scopedVenues}
              onAdd={addScoped}
              onUpdate={update}
              existingNames={existingNames}
              defaultEntityType={activeEntity}
            />
          ) : null}
          {tab === 'map' ? (
            <MapView
              venues={venues}
              onSelect={setSelectedId}
              selectedId={selectedId}
            />
          ) : null}
        </div>

        {selected ? (
          <div className="detail-pane">
            <div className="detail-close-bar">
              <span className="detail-close-name">{selected.name}</span>
              <button
                className="detail-close-btn"
                onClick={() => setSelectedId(null)}
                aria-label="Close detail panel"
              >
                Close ✕
              </button>
            </div>
            <OutreachPanel
              venue={selected}
              onStatusChange={s => update(selected.id, { status: s, last_contacted: s === 'contacted' ? new Date().toISOString() : selected.last_contacted })}
            />
            <VenueDetail
              venue={selected}
              onUpdate={update}
              onDelete={id => {
                remove(id)
                setSelectedId(null)
              }}
              onClose={() => setSelectedId(null)}
            />
          </div>
        ) : null}
      </main>

      <footer className="app-footer">
        <div className="footer-status">
          <span className="footer-stat">
            <strong>{scopedVenues.length}</strong> {activeEntity === 'festival' ? 'festivals' : 'venues'}
          </span>
          <span className="footer-dot" aria-hidden="true" />
          <span className="footer-stat">{storageMode === 'supabase' ? 'cloud sync' : 'browser-local'}</span>
          <span className="footer-dot" aria-hidden="true" />
          <span
            className={`footer-scraper ${scraperEnabled ? 'is-online' : 'is-offline'}`}
            title={scraperEnabled ? 'Scraper service reachable' : 'Scraper offline — set VITE_SCRAPER_URL in deployed mode to enable scraping'}
          >
            <span className="footer-scraper-dot" aria-hidden="true" />
            Scraper {scraperEnabled ? 'online' : 'offline'}
          </span>
        </div>

        <nav className="footer-links" aria-label="Footer">
          <button className="footer-link" onClick={() => setPricingOpen(true)}>Pricing</button>
          <button className="footer-link" onClick={() => setMigrationOpen(true)}>Migration guide</button>
          <button className="footer-link" onClick={() => setSettingsOpen(true)}>Settings</button>
          <button className="footer-link" onClick={() => setAboutOpen(true)}>About</button>
          <span className="footer-brand">Venue Intelligence</span>
        </nav>
      </footer>

      {pricingOpen && <PricingModal onClose={() => setPricingOpen(false)} />}
      {migrationOpen && <MigrationGuide onClose={() => setMigrationOpen(false)} />}
      {settingsOpen && <SettingsModal brand={brand} onBrandChange={setBrand} onClose={() => setSettingsOpen(false)} />}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {regionAuditOpen && <RegionAuditModal venues={venues} onClose={() => setRegionAuditOpen(false)} />}

      {/* Global city datalist — always in DOM so any input[list="cities-datalist"] works */}
      <datalist id="cities-datalist">
        {CITIES.map(c => <option key={c} value={c} />)}
      </datalist>
    </div>
  )
}
