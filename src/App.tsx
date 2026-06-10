import { useMemo, useState } from 'react'
import { useVenues } from './useVenues'
import { Dashboard } from './components/Dashboard'
import { VenueTable } from './components/VenueTable'
import { VenueDetail } from './components/VenueDetail'
import { OutreachPanel } from './components/OutreachPanel'
import { DiscoveryPanel } from './components/DiscoveryPanel'
import { MapView } from './components/MapView'
import { ScraperStatusBadge } from './components/ScraperStatusBadge'
import { exportJson, exportCsv, resetLocalToSeed } from './storage'
import { scraperEnabled } from './scraper'
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
  const { venues, loading, error, add, update, remove, restoreSeed, cleanupDuplicates, storageMode } = useVenues()
  const [tab, setTab] = useState<TabId>('venues')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tableFilters, setTableFilters] = useState<TableFilters | undefined>(undefined)

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

  return (
    <div className={`app ${tab === 'festivals' || (tab === 'dashboard' && dashEntity === 'festival') ? 'is-festivals' : ''}`}>
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">VI</div>
          <div>
            <div className="brand-title">Venue Intelligence</div>
            <div className="brand-sub">Scout · Qualify · Contact · Convert</div>
          </div>
        </div>
        <nav className="tabs">
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
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
            Dashboard
          </button>
          <button className={tab === 'discover' ? 'active' : ''} onClick={() => setTab('discover')}>
            Discover {scraperEnabled ? null : <span className="badge-offline">offline</span>}
          </button>
          <button className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}>
            🗺 Map
          </button>
        </nav>
        <div className="header-actions">
          <span className={`mode-badge mode-${storageMode}`} title={`Storage: ${storageMode}`}>
            {storageMode === 'supabase' ? 'Supabase' : 'localStorage'}
          </span>
          <ScraperStatusBadge />
          <button className="link-btn" onClick={() => exportCsv(venues)} title="Download all venues as CSV">
            ⬇ Download CSV
          </button>
          <button className="link-btn" onClick={() => exportJson(venues)} title="Download all venues as JSON">
            ⬇ Download JSON
          </button>
          <button
            className="link-btn"
            onClick={() => {
              if (storageMode === 'localStorage') {
                if (confirm('Reset local data and restore the default seed roster?')) {
                  resetLocalToSeed()
                  void restoreSeed().then(() => window.location.reload())
                }
                return
              }

              if (confirm('Restore the default seed roster into the current database? Existing records will be kept.')) {
                void restoreSeed()
              }
            }}
          >
            Restore seed roster
          </button>
          <button
            className="link-btn"
            onClick={() => {
              if (confirm('Delete duplicate venues and keep the strongest record for each name and city?')) {
                void cleanupDuplicates().then(removed => {
                  alert(removed > 0 ? `Removed ${removed} duplicate venues.` : 'No duplicates found.')
                })
              }
            }}
          >
            Delete duplicates
          </button>
        </div>
      </header>

      {error ? <div className="banner error-banner">{error}</div> : null}
      {loading ? <div className="banner">Loading venues…</div> : null}

      <main className={`app-main ${selected ? 'with-detail' : ''}`}>
        <div className="main-pane">
          {tab === 'venues' || tab === 'festivals' ? (
            <VenueTable
              venues={scopedVenues}
              selectedId={selectedId}
              onSelect={setSelectedId}
              initialFilters={tableFilters}
            />
          ) : null}
          {tab === 'dashboard' ? (
            <>
              <div className="scan-filter-row" role="tablist" aria-label="Dashboard entity">
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
        <span>
          {scopedVenues.length} {activeEntity === 'festival' ? 'festivals' : 'venues'} ·
          {' '}{storageMode === 'supabase' ? 'cloud sync' : 'browser-local'} ·
          Scraper {scraperEnabled ? 'online' : 'offline (set VITE_SCRAPER_URL in deployed mode)'}
        </span>
        <span className="muted">Venue Intelligence — ops console</span>
      </footer>
    </div>
  )
}
