import { useEffect, useMemo, useState } from 'react'
import type { Venue, City, Category, OutreachStatus, Tag } from '../types'
import { CITIES, CATEGORIES, STATUSES, STATUS_LABEL, TAGS, REGIONS, getRegion } from '../types'
import { facebookUrl, instagramUrl, websiteUrl } from '../outreach'

interface Props {
  venues: Venue[]
  selectedId: string | null
  onSelect: (id: string) => void
  initialFilters?: {
    city?: City | ''
    category?: Category | ''
    status?: OutreachStatus | ''
    tag?: Tag | ''
    region?: string | ''
  }
  recentlyAddedIds?: Set<string>
}

type SortKey = 'name' | 'city' | 'region' | 'category' | 'status' | 'luxury' | 'updated'
type VerifiedFilter = '' | 'unverified' | 'stale' | 'verified'

function verifiedStatus(v: Venue): 'verified' | 'stale' | 'unverified' {
  if (!v.last_verified) return 'unverified'
  const days = (Date.now() - new Date(v.last_verified).getTime()) / 86400000
  return days <= 90 ? 'verified' : 'stale'
}
const PINNED_COLUMNS_KEY = 'venue-table-pinned-columns-v1'

// Built-in togglable contact columns. Each has a render() that returns a
// clickable element when the venue has data, "—" otherwise. Stored in the
// SAME pinning list as custom_fields columns so user only learns one model.
type BuiltInColumn = {
  key: string                        // also used as the persisted pin key
  label: string                      // header label
  render: (v: Venue) => React.ReactNode
}

const BUILTIN_COLUMNS: BuiltInColumn[] = [
  {
    key: '__website',
    label: 'Website',
    render: v => {
      const url = websiteUrl(v.website)
      if (!url) return <span className="cell-empty">—</span>
      const display = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
      return (
        <a className="cell-link" href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
          {display.length > 28 ? display.slice(0, 28) + '…' : display}
        </a>
      )
    },
  },
  {
    key: '__instagram',
    label: 'Instagram',
    render: v => {
      const url = instagramUrl(v.instagram)
      if (!url || !v.instagram) return <span className="cell-empty">—</span>
      return (
        <a className="cell-link" href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
          @{v.instagram}
        </a>
      )
    },
  },
  {
    key: '__facebook',
    label: 'Facebook',
    render: v => {
      const url = facebookUrl(v.facebook)
      if (!url || !v.facebook) return <span className="cell-empty">—</span>
      const display = v.facebook.replace(/^https?:\/\/(www\.)?facebook\.com\//i, '')
      return (
        <a className="cell-link" href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
          {display || 'FB'}
        </a>
      )
    },
  },
  {
    key: '__email',
    label: 'Email',
    render: v =>
      v.email ? (
        <a className="cell-link" href={`mailto:${v.email}`} onClick={e => e.stopPropagation()}>
          {v.email}
        </a>
      ) : (
        <span className="cell-empty">—</span>
      ),
  },
  {
    key: '__phone',
    label: 'Phone',
    render: v =>
      v.phone ? (
        <a className="cell-link" href={`tel:${v.phone}`} onClick={e => e.stopPropagation()}>
          {v.phone}
        </a>
      ) : (
        <span className="cell-empty">—</span>
      ),
  },
  // Semantic columns — pulled from imported "WHY IT CONVERTS / Cap Range / Genre"
  // headers or filled by the user / AI. Off by default to keep the row compact;
  // pin them on when running outreach prioritization.
  {
    key: '__pitch_angle',
    label: 'Pitch angle',
    render: v =>
      v.pitch_angle ? (
        <span className="cell-pitch" title={v.pitch_angle}>{v.pitch_angle}</span>
      ) : (
        <span className="cell-empty">—</span>
      ),
  },
  {
    key: '__capacity',
    label: 'Capacity',
    render: v =>
      v.capacity ? <span>{v.capacity}</span> : <span className="cell-empty">—</span>,
  },
  {
    key: '__genre',
    label: 'Genre',
    render: v =>
      v.genre ? <span>{v.genre}</span> : <span className="cell-empty">—</span>,
  },
  {
    key: '__verified',
    label: 'Verified',
    render: v => {
      const s = verifiedStatus(v)
      if (s === 'unverified') return <span className="verified-badge is-unverified">—</span>
      const date = v.last_verified!.slice(0, 10)
      return (
        <span className={`verified-badge is-${s}`}>
          {s === 'verified' ? `✓ ${date}` : `⚠ ${date}`}
        </span>
      )
    },
  },
]

const BUILTIN_BY_KEY = new Map(BUILTIN_COLUMNS.map(c => [c.key, c]))

export function VenueTable({ venues, selectedId, onSelect, initialFilters, recentlyAddedIds }: Props) {
  const [query, setQuery] = useState('')
  const [cityFilter, setCityFilter] = useState<City | ''>(initialFilters?.city ?? '')
  const [regionFilter, setRegionFilter] = useState<string | ''>(initialFilters?.region ?? '')
  const [categoryFilter, setCategoryFilter] = useState<Category | ''>(initialFilters?.category ?? '')
  const [statusFilter, setStatusFilter] = useState<OutreachStatus | ''>(initialFilters?.status ?? '')
  const [tagFilter, setTagFilter] = useState<Tag | ''>(initialFilters?.tag ?? '')
  const [hasContactOnly, setHasContactOnly] = useState(false)
  const [verifiedFilter, setVerifiedFilter] = useState<VerifiedFilter>('')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [pinnedColumns, setPinnedColumns] = useState<string[]>(() => loadPinnedColumns())
  const [draggedPinnedColumn, setDraggedPinnedColumn] = useState<string | null>(null)

  // When the dashboard passes new initialFilters (e.g. user clicked a city
  // bar), apply them. Comparing each field individually avoids re-render
  // loops if the parent re-creates the object every render with same values.
  useEffect(() => {
    if (!initialFilters) return
    if (initialFilters.city !== undefined) setCityFilter(initialFilters.city)
    if (initialFilters.region !== undefined) setRegionFilter(initialFilters.region)
    if (initialFilters.category !== undefined) setCategoryFilter(initialFilters.category)
    if (initialFilters.status !== undefined) setStatusFilter(initialFilters.status)
    if (initialFilters.tag !== undefined) setTagFilter(initialFilters.tag)
  }, [initialFilters?.city, initialFilters?.region, initialFilters?.category, initialFilters?.status, initialFilters?.tag, initialFilters])

  const availableDynamicColumns = useMemo(() => {
    const counts = new Map<string, number>()
    for (const venue of venues) {
      for (const key of Object.keys(venue.custom_fields ?? {})) {
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key]) => key)
  }, [venues])

  // Pinning model: user toggles ANY column key (built-in or dynamic) — order
  // is preserved from the pinned list. Built-in columns NOT pinned are hidden
  // by default to keep the default view compact. Dynamic columns fall back to
  // showing the first 6 if user hasn't pinned anything yet.
  const allAvailableColumns = useMemo(
    () => [...BUILTIN_COLUMNS.map(c => c.key), ...availableDynamicColumns],
    [availableDynamicColumns],
  )

  const activeColumns = useMemo(() => {
    const validPinned = pinnedColumns.filter(column => allAvailableColumns.includes(column))
    if (validPinned.length > 0) return validPinned
    // Default: show first 6 dynamic columns if any, else nothing (built-ins
    // are opt-in to keep the demo view tidy).
    return availableDynamicColumns.slice(0, 6)
  }, [allAvailableColumns, availableDynamicColumns, pinnedColumns])

  useEffect(() => {
    setPinnedColumns(current => {
      const next = current.filter(column => allAvailableColumns.includes(column))
      if (next.length === current.length) return current
      savePinnedColumns(next)
      return next
    })
  }, [allAvailableColumns])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = venues.filter(v => {
      if (cityFilter && v.city !== cityFilter) return false
      if (regionFilter && getRegion(v.city) !== regionFilter) return false
      if (categoryFilter && v.category !== categoryFilter) return false
      if (statusFilter && v.status !== statusFilter) return false
      if (tagFilter && !v.tags.includes(tagFilter)) return false
      if (hasContactOnly && !v.email && !v.instagram && !v.phone) return false
      if (verifiedFilter && verifiedStatus(v) !== verifiedFilter) return false
      if (q) {
        const hay = [
          v.name,
          v.city,
          v.district,
          v.category,
          v.notes,
          v.instagram,
          v.email,
          v.music_type,
          v.pitch_angle,
          v.capacity,
          v.genre,
          ...Object.values(v.custom_fields ?? {}),
          ...v.tags,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    out.sort((a, b) => {
      // Recently added always float to top, regardless of active sort
      const aNew = recentlyAddedIds?.has(a.id) ? 0 : 1
      const bNew = recentlyAddedIds?.has(b.id) ? 0 : 1
      if (aNew !== bNew) return aNew - bNew

      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir
        case 'city':
          return a.city.localeCompare(b.city) * dir
        case 'region':
          return getRegion(a.city).localeCompare(getRegion(b.city)) * dir
        case 'category':
          return a.category.localeCompare(b.category) * dir
        case 'status':
          return a.status.localeCompare(b.status) * dir
        case 'luxury':
          return (a.luxury_score - b.luxury_score) * dir
        case 'updated':
          return a.updated_at.localeCompare(b.updated_at) * dir
      }
    })
    return out
  }, [venues, query, cityFilter, regionFilter, categoryFilter, statusFilter, tagFilter, hasContactOnly, verifiedFilter, sortKey, sortDir, recentlyAddedIds])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'city' ? 'asc' : 'desc')
    }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <section className="venue-table">
      <div className="table-toolbar">
        <input
          type="search"
          placeholder="Search name, city, tag, notes…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="search-input"
        />
        <select
          className={regionFilter ? 'filter-on' : ''}
          value={regionFilter}
          onChange={e => setRegionFilter(e.target.value)}
        >
          <option value="">All regions</option>
          {REGIONS.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          className={cityFilter ? 'filter-on' : ''}
          value={cityFilter}
          onChange={e => setCityFilter(e.target.value as City | '')}
        >
          <option value="">All cities</option>
          {CITIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          className={categoryFilter ? 'filter-on' : ''}
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value as Category | '')}
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          className={statusFilter ? 'filter-on' : ''}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as OutreachStatus | '')}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select
          className={tagFilter ? 'filter-on' : ''}
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value as Tag | '')}
        >
          <option value="">All tags</option>
          {TAGS.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          className={verifiedFilter ? 'filter-on' : ''}
          value={verifiedFilter}
          onChange={e => setVerifiedFilter(e.target.value as VerifiedFilter)}
        >
          <option value="">All data states</option>
          <option value="unverified">Unverified</option>
          <option value="stale">Stale (&gt;90 days)</option>
          <option value="verified">Verified</option>
        </select>
        <label className={`toggle ${hasContactOnly ? 'filter-on' : ''}`}>
          <input
            type="checkbox"
            checked={hasContactOnly}
            onChange={e => setHasContactOnly(e.target.checked)}
          />
          Reachable only
        </label>
        {allAvailableColumns.length > 0 ? (
          <div className="column-picker">
            <span className="column-picker-label">Pinned columns</span>
            <div className="column-chip-row">
              {allAvailableColumns.map(column => {
                const active = activeColumns.includes(column)
                const builtIn = BUILTIN_BY_KEY.get(column)
                const label = builtIn?.label ?? column
                return (
                  <button
                    key={column}
                    type="button"
                    className={`chip column-chip ${active ? 'active' : ''} ${builtIn ? 'is-builtin' : ''}`}
                    draggable={active}
                    onClick={() => {
                      const next = active
                        ? pinnedColumns.filter(value => value !== column)
                        : [...pinnedColumns, column]
                      setPinnedColumns(next)
                      savePinnedColumns(next)
                    }}
                    onDragStart={() => {
                      if (!active) return
                      setDraggedPinnedColumn(column)
                    }}
                    onDragOver={event => {
                      if (!active || !draggedPinnedColumn || draggedPinnedColumn === column) return
                      event.preventDefault()
                    }}
                    onDrop={event => {
                      if (!active || !draggedPinnedColumn || draggedPinnedColumn === column) return
                      event.preventDefault()
                      const next = reorderPinnedColumns(pinnedColumns, draggedPinnedColumn, column)
                      setPinnedColumns(next)
                      savePinnedColumns(next)
                      setDraggedPinnedColumn(null)
                    }}
                    onDragEnd={() => setDraggedPinnedColumn(null)}
                    title={builtIn ? 'Built-in contact column' : 'Imported custom field'}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
        <div className="results-count">
          {filtered.length} of {venues.length}
        </div>
        {(() => {
          const chips: Array<{ label: string; clear: () => void }> = [
            ...(query        ? [{ label: `Search: "${query.length > 18 ? query.slice(0, 18) + '…' : query}"`, clear: () => setQuery('') }] : []),
            ...(regionFilter   ? [{ label: `Region: ${regionFilter}`,                     clear: () => setRegionFilter('') }] : []),
            ...(cityFilter     ? [{ label: `City: ${cityFilter}`,                          clear: () => setCityFilter('') }] : []),
            ...(categoryFilter ? [{ label: `Category: ${categoryFilter}`,                  clear: () => setCategoryFilter('') }] : []),
            ...(statusFilter   ? [{ label: `Status: ${STATUS_LABEL[statusFilter]}`,        clear: () => setStatusFilter('') }] : []),
            ...(tagFilter      ? [{ label: `Tag: ${tagFilter}`,                            clear: () => setTagFilter('') }] : []),
            ...(hasContactOnly ? [{ label: 'Reachable only',                               clear: () => setHasContactOnly(false) }] : []),
            ...(verifiedFilter ? [{ label: `Data: ${verifiedFilter}`,                      clear: () => setVerifiedFilter('') }] : []),
          ]
          if (chips.length === 0) return null
          return (
            <div className="filters-active-bar">
              {chips.map(chip => (
                <button key={chip.label} className="filter-chip" onClick={chip.clear}>
                  {chip.label} <span className="filter-chip-remove">×</span>
                </button>
              ))}
              {chips.length > 1 ? (
                <button
                  className="link-btn filters-clear-btn"
                  onClick={() => {
                    setQuery(''); setCityFilter(''); setRegionFilter('')
                    setCategoryFilter(''); setStatusFilter(''); setTagFilter('')
                    setHasContactOnly(false); setVerifiedFilter('')
                  }}
                >
                  Clear all
                </button>
              ) : null}
            </div>
          )
        })()}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th onClick={() => toggleSort('name')}>Venue{arrow('name')}</th>
              <th onClick={() => toggleSort('region')}>Region{arrow('region')}</th>
              <th onClick={() => toggleSort('city')}>City{arrow('city')}</th>
              <th onClick={() => toggleSort('category')}>Category{arrow('category')}</th>
              <th>Tags</th>
              {activeColumns.map(column => {
                const builtIn = BUILTIN_BY_KEY.get(column)
                return <th key={column}>{builtIn?.label ?? column}</th>
              })}
              <th>Channels</th>
              <th onClick={() => toggleSort('luxury')}>Lux{arrow('luxury')}</th>
              <th onClick={() => toggleSort('status')}>Status{arrow('status')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(v => (
              <tr
                key={v.id}
                onClick={() => onSelect(v.id)}
                className={[
                  selectedId === v.id ? 'selected' : '',
                  recentlyAddedIds?.has(v.id) ? 'is-new' : '',
                ].filter(Boolean).join(' ')}
              >
                <td className="cell-name">
                  <div className="cell-name-main">{v.name}</div>
                  {v.district ? <div className="cell-name-sub">{v.district}</div> : null}
                </td>
                <td className="cell-region">{getRegion(v.city)}</td>
                <td>{v.city}</td>
                <td>{v.category}</td>
                <td>
                  <div className="tag-row">
                    {v.tags.slice(0, 4).map(t => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                    {v.tags.length > 4 ? <span className="tag tag-more">+{v.tags.length - 4}</span> : null}
                  </div>
                </td>
                {activeColumns.map(column => {
                  const builtIn = BUILTIN_BY_KEY.get(column)
                  return (
                    <td key={column} className={builtIn ? 'cell-builtin' : 'cell-custom'}>
                      {builtIn ? builtIn.render(v) : (v.custom_fields?.[column] ?? '—')}
                    </td>
                  )
                })}
                <td>
                  <div className="channels">
                    {v.email ? <span title={v.email} className="channel">✉</span> : null}
                    {v.instagram ? <span title={`@${v.instagram}`} className="channel">IG</span> : null}
                    {v.facebook ? <span title={v.facebook} className="channel">FB</span> : null}
                    {v.phone ? <span title={v.phone} className="channel">☎</span> : null}
                    {v.website ? <span title={v.website} className="channel">🌐</span> : null}
                  </div>
                </td>
                <td>
                  <span className={`lux lux-${v.luxury_score}`}>{'★'.repeat(v.luxury_score) || '–'}</span>
                </td>
                <td>
                  <span className={`status status-${v.status}`}>{STATUS_LABEL[v.status]}</span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8 + activeColumns.length} className="empty-row">
                  No venues match. Clear filters or add one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function loadPinnedColumns() {
  try {
    const raw = localStorage.getItem(PINNED_COLUMNS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function savePinnedColumns(columns: string[]) {
  localStorage.setItem(PINNED_COLUMNS_KEY, JSON.stringify(columns))
}

function reorderPinnedColumns(columns: string[], from: string, to: string) {
  const next = [...columns]
  const fromIndex = next.indexOf(from)
  const toIndex = next.indexOf(to)
  if (fromIndex < 0 || toIndex < 0) return columns
  next.splice(fromIndex, 1)
  next.splice(toIndex, 0, from)
  return next
}
