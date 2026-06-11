import { useMemo, useState } from 'react'
import type { Venue, OutreachStatus, City, Category, Tag } from '../types'
import { STATUS_LABEL, STATUSES } from '../types'
import { BulkEnrichPanel } from './BulkEnrichPanel'
import { ProGate } from './ProGate'

interface Props {
  venues: Venue[]
  /**
   * Click-through filter: dashboard bars become buttons. App.tsx receives
   * the chosen filter, switches to the Venues tab, and passes it to
   * VenueTable via initialFilters.
   */
  onDrillDown?: (filter: { city?: City; category?: Category; status?: OutreachStatus; tag?: Tag }) => void
  /**
   * Optional bulk-enrich hook. App.tsx wires this to useVenues.update().
   * If absent, the enrichment panel is hidden (read-only dashboard).
   */
  onUpdateVenue?: (id: string, patch: Partial<Venue>) => Promise<void> | void
  /** Plural noun for the active entity slice — 'venues' (default) or 'festivals'. */
  entityLabel?: string
}

export function Dashboard({ venues, onDrillDown, onUpdateVenue, entityLabel = 'venues' }: Props) {
  const stats = useMemo(() => {
    const byStatus = new Map<OutreachStatus, number>()
    for (const s of STATUSES) byStatus.set(s, 0)
    const byCity = new Map<string, number>()
    const byCategory = new Map<string, number>()
    let withEmail = 0
    let withInstagram = 0
    let withPhone = 0
    let withFacebook = 0
    let withWebsite = 0
    let hasDjs = 0

    for (const v of venues) {
      byStatus.set(v.status, (byStatus.get(v.status) ?? 0) + 1)
      byCity.set(v.city, (byCity.get(v.city) ?? 0) + 1)
      byCategory.set(v.category, (byCategory.get(v.category) ?? 0) + 1)
      if (v.email) withEmail++
      if (v.instagram) withInstagram++
      if (v.phone) withPhone++
      if (v.facebook) withFacebook++
      if (v.website) withWebsite++
      if (v.has_djs) hasDjs++
    }

    return { byStatus, byCity, byCategory, withEmail, withInstagram, withPhone, withFacebook, withWebsite, hasDjs }
  }, [venues])

  const total = venues.length
  const reachable = venues.filter(v => v.email || v.instagram || v.phone).length

  return (
    <section className="dashboard">
      <div className="stat-row">
        <Stat label={`Total ${entityLabel}`} value={total} />
        <Stat label="Reachable" value={reachable} hint={`${pct(reachable, total)}% with a contact channel`} />
        <Stat label="DJ / Live events" value={stats.hasDjs} hint={`${pct(stats.hasDjs, total)}% — prime Hydrat3 prospects`} />
        <Stat label="Ready to contact" value={stats.byStatus.get('ready') ?? 0}
          onClick={onDrillDown ? () => onDrillDown({ status: 'ready' }) : undefined} />
        <Stat label="In conversation" value={stats.byStatus.get('in_conversation') ?? 0}
          onClick={onDrillDown ? () => onDrillDown({ status: 'in_conversation' }) : undefined} />
        <Stat label="Won" value={stats.byStatus.get('won') ?? 0} tone="positive"
          onClick={onDrillDown ? () => onDrillDown({ status: 'won' }) : undefined} />
      </div>

      {onUpdateVenue ? <BulkEnrichPanel venues={venues} onUpdateVenue={onUpdateVenue} entityLabel={entityLabel} /> : null}

      <div className="dashboard-grid">
        <FilterCard
          title="By status"
          hint={onDrillDown ? 'click to filter' : undefined}
          entries={STATUSES.map(s => [STATUS_LABEL[s], stats.byStatus.get(s) ?? 0, s])}
          onDrillDown={onDrillDown ? key => onDrillDown({ status: key as OutreachStatus }) : undefined}
        />
        <FilterCard
          title="By city"
          hint={onDrillDown ? 'click to filter' : undefined}
          entries={Array.from(stats.byCity.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([label, value]) => [label, value, label])}
          onDrillDown={onDrillDown ? key => onDrillDown({ city: key as City }) : undefined}
        />
        <FilterCard
          title="By category"
          hint={onDrillDown ? 'click to filter' : undefined}
          entries={Array.from(stats.byCategory.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([label, value]) => [label, value, label])}
          onDrillDown={onDrillDown ? key => onDrillDown({ category: key as Category }) : undefined}
        />
        <FilterCard
          title="Contact coverage"
          entries={[
            ['Website', stats.withWebsite],
            ['Email', stats.withEmail],
            ['Instagram', stats.withInstagram],
            ['Facebook', stats.withFacebook],
            ['Phone', stats.withPhone],
          ]}
          showPct={total}
          searchable={false}
        />
      </div>

      <div className="dash-pro-section">
        <div className="dash-pro-header">
          <span className="pro-badge">Pro</span>
          <span className="dash-pro-title">CRM & campaign tools</span>
          <span className="dash-pro-desc">Pipeline tracking, bulk outreach sequences, and template performance analytics.</span>
        </div>
        <div className="dashboard-grid">
          <ProGate
            feature="Pipeline View"
            description="A live kanban of every venue by deal stage — from Prospecting through to Won. Drag to advance, click to open."
            className="card dash-pro-card"
          >
            <h3>Pipeline View</h3>
            <div className="mock-kanban">
              {([
                { label: 'Prospecting', count: 24, cards: ['Tresor Berlin', 'Arena Club'], variant: '' },
                { label: 'Contacted', count: 8, cards: ['Fabric London', 'De School AMS'], variant: '' },
                { label: 'Replied', count: 3, cards: ['Shelter Berlin', 'Void Berlin'], variant: 'reply' },
                { label: 'Won', count: 1, cards: ['Watergate Berlin'], variant: 'won' },
              ] as const).map(col => (
                <div key={col.label} className="mock-kanban-col">
                  <div className="mock-kanban-col-header">
                    <span className="mock-kanban-label">{col.label}</span>
                    <span className={`mock-kanban-count ${col.variant}`}>{col.count}</span>
                  </div>
                  {col.cards.map(c => (
                    <div key={c} className={`mock-kanban-card ${col.variant}`}>{c}</div>
                  ))}
                  {col.count > col.cards.length && (
                    <span className="mock-kanban-more">+{col.count - col.cards.length} more</span>
                  )}
                </div>
              ))}
            </div>
          </ProGate>

          <ProGate
            feature="Campaign Builder"
            description="Filter by region and category, pick a template, and launch a bulk outreach sequence to all matching venues in one action."
            className="card dash-pro-card"
          >
            <h3>Campaign Builder</h3>
            <div className="mock-cb">
              <div className="mock-cb-row">
                <span className="mock-field-label">Region</span>
                <div className="mock-chip-row">
                  <span className="mock-chip">Germany ✕</span>
                  <span className="mock-chip">Austria ✕</span>
                  <span className="mock-chip mock-chip-add">+ add</span>
                </div>
              </div>
              <div className="mock-cb-row">
                <span className="mock-field-label">Category</span>
                <div className="mock-chip-row">
                  <span className="mock-chip">Nightclub ✕</span>
                  <span className="mock-chip mock-chip-add">+ add</span>
                </div>
              </div>
              <div className="mock-cb-row">
                <span className="mock-field-label">Template</span>
                <select className="mock-select" disabled><option>Hydrat3 Trade Intro v2</option></select>
              </div>
              <div className="mock-cb-preview">
                "Hi {'{name}'}, reaching out about stocking Hydrat3 electrolyte lollipops at {'{venue}'}…"
              </div>
              <div className="mock-cb-footer">
                <span className="mock-cb-match">42 venues · ~8–13 expected replies</span>
                <button className="mock-btn mock-btn-accent" disabled>Review & launch →</button>
              </div>
            </div>
          </ProGate>

          <ProGate
            feature="Template Library"
            description="Save, version, and compare outreach templates. Track reply rates per template to double down on what works."
            className="card dash-pro-card"
          >
            <h3>Template Library</h3>
            <div className="mock-tpl-table">
              <div className="mock-tpl-header">
                <span>Template</span>
                <span>Sent</span>
                <span>Opens</span>
                <span>Reply%</span>
              </div>
              {([
                { name: 'Hydrat3 Trade Intro v2', sent: 23, opens: '71%', reply: 31 },
                { name: 'Festival Pitch', sent: 8, opens: '63%', reply: 50 },
                { name: 'Follow-up #1 — Sample Box', sent: 12, opens: '58%', reply: 25 },
                { name: 'Cold — Bar Manager', sent: 5, opens: '40%', reply: 20 },
              ] as const).map(t => (
                <div key={t.name} className="mock-tpl-row-v2">
                  <span className="mock-tpl-name">{t.name}</span>
                  <span className="mock-tpl-stat">{t.sent}</span>
                  <span className="mock-tpl-stat">{t.opens}</span>
                  <div className="mock-tpl-reply-cell">
                    <span className="mock-tpl-stat accent">{t.reply}%</span>
                    <div className="mock-tpl-mini-bar">
                      <div className="mock-tpl-mini-fill" style={{ width: `${t.reply * 2}%` }} />
                    </div>
                  </div>
                </div>
              ))}
              <button className="mock-btn" disabled style={{ marginTop: 8, width: '100%' }}>+ New template</button>
            </div>
          </ProGate>
        </div>
      </div>
    </section>
  )
}

// ---------- Filterable + collapsible analytics card ----------

type FilterEntry = [label: string, value: number, key?: string]

function FilterCard({
  title,
  hint,
  entries,
  showPct,
  onDrillDown,
  searchable = true,
}: {
  title: string
  hint?: string
  entries: FilterEntry[]
  showPct?: number
  onDrillDown?: (key: string) => void
  searchable?: boolean
}) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  const filtered = query
    ? entries.filter(([label]) => label.toLowerCase().includes(query.toLowerCase()))
    : entries
  const filteredMax = filtered.length > 0 ? Math.max(1, ...filtered.map(([, v]) => v)) : 1

  return (
    <div className={`card filter-card ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="card-header">
        <button
          className="card-collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand section' : 'Collapse section'}
        >
          <span className={`card-chevron ${collapsed ? 'is-collapsed' : ''}`}>▾</span>
        </button>
        <h3 className="card-header-title">
          {title}
          {!collapsed && hint ? <span className="card-hint">{hint}</span> : null}
        </h3>
        {!collapsed && (
          <span className="card-entry-count">
            {query && filtered.length !== entries.length
              ? `${filtered.length}/${entries.length}`
              : entries.length}
          </span>
        )}
        {!collapsed && searchable && (
          <input
            type="search"
            className="card-search"
            placeholder="Filter…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onClick={e => e.stopPropagation()}
          />
        )}
      </div>
      {!collapsed && (
        <div className="card-body">
          <BarList entries={filtered} max={filteredMax} showPct={showPct} onClick={onDrillDown} />
        </div>
      )}
    </div>
  )
}

// BulkEnrichPanel extracted to ./BulkEnrichPanel.tsx

// ---------- Small primitives ----------

function Stat({
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  label: string
  value: number
  hint?: string
  tone?: 'positive'
  onClick?: () => void
}) {
  return (
    <div
      className={`stat ${tone ?? ''} ${onClick ? 'stat-clickable' : ''}`}
      onClick={onClick}
      title={onClick ? `Filter by "${label}"` : undefined}
    >
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  )
}

type BarEntry = [label: string, value: number, key?: string]

function BarList({
  entries,
  max,
  showPct,
  onClick,
}: {
  entries: BarEntry[] | [string, number][]
  max: number
  showPct?: number
  onClick?: (key: string) => void
}) {
  if (entries.length === 0) return <div className="empty">No data yet.</div>
  return (
    <ul className="bar-list">
      {(entries as BarEntry[]).map(([label, value, key]) => {
        const clickable = Boolean(onClick) && value > 0
        const content = (
          <>
            <div className="bar-row">
              <span className="bar-label">{label}</span>
              <span className="bar-value">
                {value}
                {showPct ? <span className="bar-pct">{pct(value, showPct)}%</span> : null}
              </span>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(value / max) * 100}%` }} />
            </div>
          </>
        )
        return (
          <li key={label}>
            {clickable ? (
              <button
                type="button"
                className="bar-clickable"
                onClick={() => onClick!(key ?? label)}
                title={`Filter venues by "${label}"`}
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        )
      })}
    </ul>
  )
}

function pct(value: number, total: number) {
  if (total === 0) return 0
  return Math.round((value / total) * 100)
}

