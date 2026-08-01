import { useEffect, useState } from 'react'
import { listAllEnrollments } from '../sequencing'
import type { SequenceEnrollmentWithVenue } from '../sequencing'

// Walking-skeleton step 4 (#10): read-only kanban over enrollments already
// proven real in #7-#9. No bulk actions yet — that's a later issue if wanted.
// Reuses the .mock-kanban* classes from Dashboard's "Pipeline View" preview —
// same visual language, real data instead of a mock array.

const COLUMNS: Array<{ state: string; label: string; variant: '' | 'reply' | 'won' }> = [
  { state: 'active', label: 'Active', variant: '' },
  { state: 'replied', label: 'Replied', variant: 'reply' },
  { state: 'bounced', label: 'Bounced', variant: '' },
  { state: 'paused', label: 'Paused', variant: '' },
  { state: 'done', label: 'Done', variant: 'won' },
]

interface Props {
  onSelectVenue: (venueId: string) => void
}

export function SequencesBoard({ onSelectVenue }: Props) {
  const [enrollments, setEnrollments] = useState<SequenceEnrollmentWithVenue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    listAllEnrollments()
      .then(setEnrollments)
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="banner">Loading sequences…</div>
  if (error) return <div className="scrape-error">{error}</div>

  return (
    <section className="dashboard">
      <div className="mock-kanban sequence-kanban">
        {COLUMNS.map(col => {
          const rows = enrollments.filter(e => e.state === col.state)
          return (
            <div key={col.state} className="mock-kanban-col">
              <div className="mock-kanban-col-header">
                <span className="mock-kanban-label">{col.label}</span>
                <span className={`mock-kanban-count ${col.variant}`}>{rows.length}</span>
              </div>
              {rows.map(row => (
                <div
                  key={row.id}
                  className={`mock-kanban-card ${col.variant}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectVenue(row.venue_id)}
                  onKeyDown={e => e.key === 'Enter' && onSelectVenue(row.venue_id)}
                  title={row.step_label}
                >
                  {row.venues?.name ?? row.venue_id}
                  <span className="sequence-kanban-step">Step {row.current_step + 1}</span>
                </div>
              ))}
              {rows.length === 0 ? <span className="muted small">None</span> : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
