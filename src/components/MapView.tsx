/**
 * Tactical Map — plots all venues/festivals as pins on an OpenStreetMap base.
 *
 * Library: react-leaflet + Leaflet + OpenStreetMap tiles (no API key required).
 *
 * Pin colour strategy:
 *   grey   = new / researching
 *   amber  = ready / contacted / in_conversation / meeting_booked
 *   green  = won
 *   red    = lost / on_hold
 *   purple = festival (entity_type === 'festival')
 *
 * Geocoding: we store city strings, not lat/lng. Rather than calling a geocode
 * API on every render, we ship a static lookup for the cities in CITY_TO_REGION.
 * Unknown cities fall back to a random scatter around the region centroid so
 * they at least land on the correct island/country.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Venue, OutreachStatus } from '../types'
import { getRegion } from '../types'

// ---------------------------------------------------------------------------
// Static city → [lat, lng] lookup (covers all cities in types.ts + extras)
// ---------------------------------------------------------------------------
const CITY_COORDS: Record<string, [number, number]> = {
  // Crete
  Heraklion: [35.3387, 25.1442],
  Hersonissos: [35.3069, 25.4056],
  Malia: [35.2975, 25.4596],
  Rethymno: [35.3667, 24.4753],
  Chania: [35.5138, 24.0180],
  'Agios Nikolaos': [35.1908, 25.7216],
  Elounda: [35.2583, 25.7225],
  Makrigialos: [35.0214, 25.9828],
  Ammoudara: [35.3469, 25.0810],
  // Germany
  Berlin: [52.5200, 13.4050],
  Hamburg: [53.5511, 9.9937],
  Munich: [48.1351, 11.5820],
  Cologne: [50.9333, 6.9500],
  Frankfurt: [50.1109, 8.6821],
  // France
  Paris: [48.8566, 2.3522],
  Lyon: [45.7640, 4.8357],
  Marseille: [43.2965, 5.3698],
  Nice: [43.7102, 7.2620],
  // UK
  London: [51.5074, -0.1278],
  Manchester: [53.4808, -2.2426],
  Bristol: [51.4545, -2.5879],
  Glasgow: [55.8642, -4.2518],
  // Netherlands
  Amsterdam: [52.3676, 4.9041],
  Rotterdam: [51.9244, 4.4777],
  Utrecht: [52.0907, 5.1214],
  // UAE
  Dubai: [25.2048, 55.2708],
  'Abu Dhabi': [24.4539, 54.3773],
  // Spain
  Barcelona: [41.3851, 2.1734],
  Madrid: [40.4168, -3.7038],
  Ibiza: [38.9067, 1.4206],
  // Italy
  Milan: [45.4642, 9.1900],
  Rome: [41.9028, 12.4964],
  // Portugal
  Lisbon: [38.7223, -9.1393],
  Porto: [41.1579, -8.6291],
}

// Fallback centroids per region (for cities not in the lookup)
const REGION_CENTROIDS: Record<string, [number, number]> = {
  Crete: [35.24, 24.81],
  Germany: [51.16, 10.45],
  France: [46.23, 2.21],
  UK: [55.38, -3.44],
  Netherlands: [52.13, 5.29],
  UAE: [24.47, 54.37],
  Spain: [40.46, -3.75],
  Italy: [41.87, 12.57],
  Portugal: [39.40, -8.22],
  Other: [35.0, 25.0],
}

function resolveCoords(city: string): [number, number] {
  if (CITY_COORDS[city]) return CITY_COORDS[city]
  const region = getRegion(city)
  const centroid = REGION_CENTROIDS[region] ?? REGION_CENTROIDS['Other']
  // Scatter unknown cities slightly so pins don't stack on the centroid
  const jitter = () => (Math.random() - 0.5) * 0.4
  return [centroid[0] + jitter(), centroid[1] + jitter()]
}

// ---------------------------------------------------------------------------
// Pin colour logic
// ---------------------------------------------------------------------------
const STATUS_COLOR: Record<OutreachStatus, string> = {
  new: '#94a3b8',        // slate
  researching: '#94a3b8',
  ready: '#f59e0b',      // amber
  contacted: '#f59e0b',
  in_conversation: '#f59e0b',
  meeting_booked: '#10b981', // emerald
  won: '#22c55e',        // green
  lost: '#ef4444',       // red
  on_hold: '#f97316',    // orange
}

const FESTIVAL_COLOR = '#8b3aa8' // festival magenta

function pinColor(v: Venue): string {
  if (v.entity_type === 'festival') return FESTIVAL_COLOR
  return STATUS_COLOR[v.status] ?? '#94a3b8'
}

// ---------------------------------------------------------------------------
// Map auto-fit helper — re-fits bounds whenever the venue list changes
// ---------------------------------------------------------------------------
function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (coords.length === 0) return
    if (coords.length === 1) {
      map.setView(coords[0], 13)
      return
    }
    const lats = coords.map(c => c[0])
    const lngs = coords.map(c => c[1])
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
      { padding: [40, 40] },
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.length])
  return null
}

// ---------------------------------------------------------------------------
// Props + component
// ---------------------------------------------------------------------------
interface Props {
  venues: Venue[]
  onSelect: (id: string) => void
  selectedId: string | null
}

type MapFilter = 'all' | 'venue' | 'festival'
type StatusFilter = 'all' | OutreachStatus

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'researching', label: 'Researching' },
  { value: 'ready', label: 'Ready' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'in_conversation', label: 'In conversation' },
  { value: 'meeting_booked', label: 'Meeting booked' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'on_hold', label: 'On hold' },
]

export function MapView({ venues, onSelect, selectedId }: Props) {
  const [typeFilter, setTypeFilter] = useState<MapFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const mapRef = useRef<ReturnType<typeof MapContainer> | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return venues.filter(v => {
      if (typeFilter === 'venue' && v.entity_type === 'festival') return false
      if (typeFilter === 'festival' && v.entity_type !== 'festival') return false
      if (statusFilter !== 'all' && v.status !== statusFilter) return false
      if (q && !v.name.toLowerCase().includes(q) && !v.city.toLowerCase().includes(q)) return false
      return true
    })
  }, [venues, typeFilter, statusFilter, query])

  const coords = useMemo(
    () => filtered.map(v => resolveCoords(v.city)),
    [filtered],
  )

  return (
    <section className="map-view">
      {/* Toolbar */}
      <div className="map-toolbar">
        <input
          type="search"
          placeholder="Filter by name or city…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="search-input map-search"
        />
        <div className="map-type-filter">
          {(['all', 'venue', 'festival'] as MapFilter[]).map(f => (
            <button
              key={f}
              className={`chip ${typeFilter === f ? 'active' : ''} ${f === 'festival' ? 'tab-festivals' : ''}`}
              onClick={() => setTypeFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'venue' ? 'Venues' : 'Festivals'}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="map-status-select"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="map-count muted">{filtered.length} pins</span>
      </div>

      {/* Legend */}
      <div className="map-legend">
        <span className="legend-item"><span className="legend-dot" style={{ background: '#94a3b8' }} />New / Researching</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b' }} />Active outreach</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#22c55e' }} />Won</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#ef4444' }} />Lost</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#8b3aa8' }} />Festival</span>
      </div>

      {/* Map */}
      <div className="map-container-wrap">
        <MapContainer
          center={[35.30, 25.13]}
          zoom={8}
          className="leaflet-map"
          ref={mapRef as never}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds coords={coords} />
          {filtered.map((v, i) => {
            const pos = coords[i]
            if (!pos) return null
            const color = pinColor(v)
            const isSelected = v.id === selectedId
            return (
              <CircleMarker
                key={v.id}
                center={pos}
                radius={isSelected ? 10 : 7}
                pathOptions={{
                  color: isSelected ? '#fff' : color,
                  fillColor: color,
                  fillOpacity: 0.9,
                  weight: isSelected ? 2.5 : 1.5,
                }}
                eventHandlers={{ click: () => onSelect(v.id) }}
              >
                <Tooltip direction="top" offset={[0, -6]}>
                  <div className="map-tooltip">
                    <strong>{v.name}</strong>
                    <span>{v.city} · {v.category}</span>
                    <span>{v.status.replace(/_/g, ' ')}</span>
                  </div>
                </Tooltip>
              </CircleMarker>
            )
          })}
        </MapContainer>
      </div>
    </section>
  )
}
