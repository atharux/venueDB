import { useEffect, useMemo, useRef, useState } from 'react'
import type { Venue, OutreachStatus, City, Category, Tag } from '../types'
import { STATUS_LABEL, STATUSES } from '../types'
import { enrichLead } from '../scraper'
import { loadAiSettings } from '../aiSettings'

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
        <Stat label="Has DJs" value={stats.hasDjs} hint={`${pct(stats.hasDjs, total)}% confirmed DJ programming`} />
        <Stat label="Ready to contact" value={stats.byStatus.get('ready') ?? 0} />
        <Stat label="In conversation" value={stats.byStatus.get('in_conversation') ?? 0} />
        <Stat label="Won" value={stats.byStatus.get('won') ?? 0} tone="positive" />
      </div>

      {onUpdateVenue ? <BulkEnrichPanel venues={venues} onUpdateVenue={onUpdateVenue} entityLabel={entityLabel} /> : null}

      <div className="dashboard-grid">
        <div className="card">
          <h3>By status {onDrillDown ? <span className="card-hint">click to filter</span> : null}</h3>
          <BarList
            entries={STATUSES.map(s => [STATUS_LABEL[s], stats.byStatus.get(s) ?? 0, s])}
            max={Math.max(1, ...Array.from(stats.byStatus.values()))}
            onClick={onDrillDown ? key => onDrillDown({ status: key as OutreachStatus }) : undefined}
          />
        </div>
        <div className="card">
          <h3>By city {onDrillDown ? <span className="card-hint">click to filter</span> : null}</h3>
          <BarList
            entries={Array.from(stats.byCity.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([label, value]) => [label, value, label])}
            max={Math.max(1, ...Array.from(stats.byCity.values()))}
            onClick={onDrillDown ? key => onDrillDown({ city: key as City }) : undefined}
          />
        </div>
        <div className="card">
          <h3>By category {onDrillDown ? <span className="card-hint">click to filter</span> : null}</h3>
          <BarList
            entries={Array.from(stats.byCategory.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([label, value]) => [label, value, label])}
            max={Math.max(1, ...Array.from(stats.byCategory.values()))}
            onClick={onDrillDown ? key => onDrillDown({ category: key as Category }) : undefined}
          />
        </div>
        <div className="card">
          <h3>Contact coverage</h3>
          <BarList
            entries={[
              ['Website', stats.withWebsite],
              ['Email', stats.withEmail],
              ['Instagram', stats.withInstagram],
              ['Facebook', stats.withFacebook],
              ['Phone', stats.withPhone],
            ]}
            max={Math.max(1, total)}
            showPct={total}
          />
        </div>
      </div>
    </section>
  )
}

// ---------- Bulk enrichment panel ----------

interface BulkEnrichProps {
  venues: Venue[]
  onUpdateVenue: (id: string, patch: Partial<Venue>) => Promise<void> | void
  entityLabel: string
}

function isIncomplete(v: Venue) {
  return !v.email || !v.instagram || !v.phone || !v.website
}

function BulkEnrichPanel({ venues, onUpdateVenue, entityLabel }: BulkEnrichProps) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' })
  const [summary, setSummary] = useState<{ enriched: number; errors: number; ran: number } | null>(null)
  const [log, setLog] = useState<string[]>([])
  const cancelRef = useRef(false)

  const incomplete = useMemo(() => venues.filter(isIncomplete), [venues])
  const aiSettings = loadAiSettings()

  useEffect(() => () => { cancelRef.current = true }, [])

  const start = async () => {
    if (running || incomplete.length === 0) return
    setRunning(true)
    setSummary(null)
    setLog([])
    cancelRef.current = false

    let enriched = 0
    let errors = 0
    let ran = 0

    for (const [i, v] of incomplete.entries()) {
      if (cancelRef.current) break
      ran++
      setProgress({ done: i, total: incomplete.length, current: v.name })

      try {
        const result = await enrichLead(
          {
            name: v.name,
            city: v.city,
            website: v.website,
            instagram: v.instagram,
            email: v.email,
            phone: v.phone,
            notes: v.notes,
          },
          aiSettings,
        )

        // Only patch fields the venue was missing — never overwrite real data.
        const patch: Partial<Venue> = {}
        if (!v.website && result.website) patch.website = result.website
        if (!v.instagram && result.instagram) patch.instagram = result.instagram
        if (!v.email && result.email) patch.email = result.email
        if (!v.phone && result.phone) patch.phone = result.phone

        // Build a short evidence string from per-page attempts so the log
        // proves the scraper actually ran (vs failing silently).
        const evidence = (result.attempts ?? []).length === 0
          ? 'no attempts'
          : (result.attempts ?? [])
              .map(a => {
                if (!a.ok) return `${shortPath(a.url)}=err`
                const total = a.emails + a.instagrams + a.phones
                return `${shortPath(a.url)}=${total > 0 ? `${a.emails}e/${a.instagrams}i/${a.phones}p` : '0'}`
              })
              .join(' ')

        if (Object.keys(patch).length > 0) {
          await onUpdateVenue(v.id, patch)
          enriched++
          setLog(l => [
            `+ ${v.name}: patched ${Object.keys(patch).join(', ')} · ${evidence}`,
            ...l.slice(0, 39),
          ])
        } else {
          setLog(l => [
            `· ${v.name}: nothing new · ${evidence}`,
            ...l.slice(0, 39),
          ])
        }
      } catch (err) {
        errors++
        const msg = err instanceof Error ? err.message : String(err)
        setLog(l => [`× ${v.name}: ${msg.slice(0, 100)}`, ...l.slice(0, 39)])
      }
    }

    setProgress({ done: incomplete.length, total: incomplete.length, current: '' })
    setSummary({ enriched, errors, ran })
    setRunning(false)
  }

  const cancel = () => { cancelRef.current = true }

  return (
    <div className="card enrich-panel">
      <div className="enrich-header">
        <div>
          <h3>Enrich missing contacts</h3>
          <p className="muted small">
            {incomplete.length} of {venues.length} {entityLabel} are missing at least one channel
            {' '}(website, IG, email, or phone). The scraper fetches each website and pulls
            public contacts — no fabrication.
          </p>
        </div>
        <div className="enrich-actions">
          {!running ? (
            <button className="primary-btn" onClick={start} disabled={incomplete.length === 0}>
              {incomplete.length === 0 ? 'Nothing to enrich' : `Enrich ${incomplete.length} ${entityLabel}`}
            </button>
          ) : (
            <button className="danger-btn" onClick={cancel}>
              Cancel after current
            </button>
          )}
        </div>
      </div>

      {running || progress.total > 0 ? (
        <div className="enrich-progress">
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <div className="enrich-progress-text">
            {running
              ? `${progress.done}/${progress.total} · ${progress.current}`
              : summary
                ? `Done. Enriched ${summary.enriched} of ${summary.ran}${summary.errors > 0 ? `, ${summary.errors} errors` : ''}.`
                : ''}
          </div>
        </div>
      ) : null}

      {log.length > 0 ? (
        <ul className="enrich-log">
          {log.map((line, i) => (
            <li key={i} className={line.startsWith('×') ? 'log-err' : line.startsWith('+') ? 'log-ok' : 'log-neutral'}>
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

// ---------- Small primitives ----------

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: number
  hint?: string
  tone?: 'positive'
}) {
  return (
    <div className={`stat ${tone ?? ''}`}>
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

/** Compact a URL down to /pathname for the per-row scraper log. */
function shortPath(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname === '/' ? '/' : u.pathname
  } catch {
    return url.slice(0, 24)
  }
}
