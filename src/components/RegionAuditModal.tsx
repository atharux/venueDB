import { useMemo } from 'react'
import type { Venue } from '../types'
import { CITY_TO_REGION } from '../types'

interface Props {
  venues: Venue[]
  onClose: () => void
}

function titleCase(s: string) {
  return s.trim().replace(/\b\w/g, c => c.toUpperCase())
}

export function RegionAuditModal({ venues, onClose }: Props) {
  const rows = useMemo(() => {
    const counts = new Map<string, number>()
    for (const v of venues) {
      const city = v.city ?? ''
      if (!city || city === 'Other') continue
      if (CITY_TO_REGION[city]) continue  // already mapped correctly
      counts.set(city, (counts.get(city) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([city, count]) => ({
        city,
        count,
        // Casing fix: does the title-cased version already exist in the map?
        casingFix: !!CITY_TO_REGION[titleCase(city)] && city !== titleCase(city),
        suggestion: CITY_TO_REGION[titleCase(city)] ?? null,
      }))
  }, [venues])

  const casingCount = rows.filter(r => r.casingFix).length
  const unmappedCount = rows.filter(r => !r.casingFix).length
  const totalOther = rows.reduce((s, r) => s + r.count, 0)

  const copyList = () => {
    const lines = rows.map(r =>
      `${r.city}\t${r.count}\t${r.casingFix ? `casing → ${r.suggestion}` : 'unmapped'}`
    )
    void navigator.clipboard.writeText(['City\tVenues\tStatus', ...lines].join('\n'))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="region-audit-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Region audit</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="region-audit-summary">
          <span className="audit-stat">
            <strong>{totalOther}</strong> venues in "Other"
          </span>
          <span className="audit-sep">·</span>
          <span className="audit-stat audit-casing">
            <strong>{casingCount}</strong> casing {casingCount === 1 ? 'fix' : 'fixes'} (run Normalise all)
          </span>
          <span className="audit-sep">·</span>
          <span className="audit-stat audit-unmapped">
            <strong>{unmappedCount}</strong> unmapped {unmappedCount === 1 ? 'city' : 'cities'}
          </span>
        </div>

        <p className="region-audit-hint">
          <strong>Casing</strong> — city exists in the map but wrong case (e.g. "berlin" → "Berlin"). Fix with <em>Normalise all records</em> in Actions.<br />
          <strong>Unmapped</strong> — city genuinely not in <code>CITY_TO_REGION</code>. Add it to <code>src/types.ts</code> to fix.
        </p>

        {rows.length === 0 ? (
          <p className="region-audit-empty">All cities are mapped. No "Other" regions found.</p>
        ) : (
          <div className="region-audit-table-wrap">
            <table className="region-audit-table">
              <thead>
                <tr>
                  <th>City value in DB</th>
                  <th>Venues</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.city} className={r.casingFix ? 'row-casing' : 'row-unmapped'}>
                    <td className="cell-mono">{r.city || <em>empty</em>}</td>
                    <td className="cell-count">{r.count}</td>
                    <td>
                      {r.casingFix
                        ? <span className="audit-badge casing">casing → {r.suggestion}</span>
                        : <span className="audit-badge unmapped">add to map</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-footer">
          <button className="secondary-btn" onClick={copyList}>Copy as TSV</button>
          <button className="primary-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
