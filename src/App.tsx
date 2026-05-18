import { useState } from 'react'
import { useVenues } from './useVenues'
import { Dashboard } from './components/Dashboard'
import { VenueTable } from './components/VenueTable'
import { VenueDetail } from './components/VenueDetail'
import { OutreachPanel } from './components/OutreachPanel'
import { DiscoveryPanel } from './components/DiscoveryPanel'
import { ScraperStatusBadge } from './components/ScraperStatusBadge'
import { exportJson, resetLocalToSeed } from './storage'
import { scraperEnabled } from './scraper'
import type { City, Category, OutreachStatus, Tag } from './types'
import './App.css'

type TabId = 'venues' | 'dashboard' | 'discover'

interface TableFilters {
  city?: City | ''
  category?: Category | ''
  status?: OutreachStatus | ''
  tag?: Tag | ''
}

export default function App() {
  const { venues, loading, error, add, update, remove, restoreSeed, cleanupDuplicates, storageMode } = useVenues()
  const [tab, setTab] = useState<TabId>('venues')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tableFilters, setTableFilters] = useState<TableFilters | undefined>(undefined)

  const selected = venues.find(v => v.id === selectedId) ?? null
  const existingNames = new Set(venues.map(v => v.name.toLowerCase()))

  const drillDown = (filter: TableFilters) => {
    // Reset other filters when drilling — single-dimension focus is more
    // intuitive when clicking a chart bar.
    setTableFilters({
      city: filter.city ?? '',
      category: filter.category ?? '',
      status: filter.status ?? '',
      tag: filter.tag ?? '',
    })
    setTab('venues')
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">BS</div>
          <div>
            <div className="brand-title">Battle School Venue Intel</div>
            <div className="brand-sub">Scout · Qualify · Contact · Convert</div>
          </div>
        </div>
        <nav className="tabs">
          <button className={tab === 'venues' ? 'active' : ''} onClick={() => setTab('venues')}>
            Venues <span className="count">{venues.length}</span>
          </button>
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
            Dashboard
          </button>
          <button className={tab === 'discover' ? 'active' : ''} onClick={() => setTab('discover')}>
            Discover {scraperEnabled ? null : <span className="badge-offline">offline</span>}
          </button>
        </nav>
        <div className="header-actions">
          <span className={`mode-badge mode-${storageMode}`} title={`Storage: ${storageMode}`}>
            {storageMode === 'supabase' ? 'Supabase' : 'localStorage'}
          </span>
          <ScraperStatusBadge />
          <button className="link-btn" onClick={() => exportJson(venues)}>
            Export JSON
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
          {tab === 'venues' ? (
            <VenueTable
              venues={venues}
              selectedId={selectedId}
              onSelect={setSelectedId}
              initialFilters={tableFilters}
            />
          ) : null}
          {tab === 'dashboard' ? (
            <Dashboard venues={venues} onDrillDown={drillDown} onUpdateVenue={update} />
          ) : null}
          {tab === 'discover' ? (
            <DiscoveryPanel venues={venues} onAdd={add} onUpdate={update} existingNames={existingNames} />
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
          {venues.length} venues · {storageMode === 'supabase' ? 'cloud sync' : 'browser-local'} ·
          Scraper {scraperEnabled ? 'online' : 'offline (set VITE_SCRAPER_URL in deployed mode)'}
        </span>
        <span className="muted">Battle School Venue Intel — MVP ops console</span>
      </footer>
    </div>
  )
}
