import { useEffect, useMemo, useRef, useState } from 'react'
import type { Venue } from '../types'
import { enrichLead } from '../scraper'
import { loadAiSettings } from '../aiSettings'

interface Props {
  venues: Venue[]
  onUpdateVenue: (id: string, patch: Partial<Venue>) => Promise<void> | void
  entityLabel: string
  defaultCollapsed?: boolean
}

function isIncomplete(v: Venue) {
  return !v.email || !v.instagram || !v.phone || !v.website
}

function shortPath(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname === '/' ? '/' : u.pathname
  } catch {
    return url.slice(0, 24)
  }
}

export function BulkEnrichPanel({ venues, onUpdateVenue, entityLabel, defaultCollapsed = false }: Props) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' })
  const [summary, setSummary] = useState<{ enriched: number; errors: number; ran: number } | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [panelCollapsed, setPanelCollapsed] = useState(defaultCollapsed)
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
    <div className={`card enrich-panel ${panelCollapsed ? 'is-collapsed' : ''}`}>
      <div className="enrich-header">
        <button
          className="card-collapse-btn"
          onClick={() => setPanelCollapsed(c => !c)}
          aria-label={panelCollapsed ? 'Expand enrichment panel' : 'Collapse enrichment panel'}
        >
          <span className={`card-chevron ${panelCollapsed ? 'is-collapsed' : ''}`}>▾</span>
        </button>
        <div className="enrich-header-text">
          <h3>
            Enrich missing contacts
            <span className="card-entry-count" style={{ marginLeft: 8 }}>
              {incomplete.length} of {venues.length} incomplete
            </span>
          </h3>
          {!panelCollapsed && (
            <p className="muted small">
              The scraper fetches each venue website and pulls public contacts — no fabrication.
            </p>
          )}
        </div>
        {!panelCollapsed && (
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
        )}
      </div>

      {!panelCollapsed && (running || progress.total > 0) ? (
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

      {!panelCollapsed && log.length > 0 ? (
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
