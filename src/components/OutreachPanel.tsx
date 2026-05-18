import { useState } from 'react'
import type { Venue, OutreachStatus } from '../types'
import { STATUSES, STATUS_LABEL } from '../types'
import { TEMPLATES, copyToClipboard, instagramUrl } from '../outreach'

interface Props {
  venue: Venue
  onStatusChange: (status: OutreachStatus) => void
}

export function OutreachPanel({ venue, onStatusChange }: Props) {
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const template = TEMPLATES.find(t => t.id === templateId) ?? TEMPLATES[0]
  const message = template.build(venue)
  const igUrl = instagramUrl(venue.instagram)

  const handleCopy = async () => {
    const ok = await copyToClipboard(message)
    setCopyState(ok ? 'copied' : 'failed')
    setTimeout(() => setCopyState('idle'), 1800)
  }

  // Channel open is now pure navigation — does NOT mutate venue state.
  // Marking contacted is an explicit, separate action via the button below
  // or the status pills at the top. This split exists because clicking
  // "Open IG" to glance at a profile shouldn't lie about outreach progress.
  const handleMarkContacted = () => {
    onStatusChange('contacted')
  }

  const isContactable = venue.status === 'new' || venue.status === 'researching' || venue.status === 'ready'
  const alreadyContacted = venue.status === 'contacted'
    || venue.status === 'in_conversation'
    || venue.status === 'meeting_booked'
    || venue.status === 'won'

  return (
    <section className="outreach-panel">
      <header>
        <h3>Outreach</h3>
        <div className="status-pills">
          {STATUSES.map(s => (
            <button
              key={s}
              className={`status-pill status-${s} ${venue.status === s ? 'active' : ''}`}
              onClick={() => onStatusChange(s)}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </header>

      <div className="template-row">
        <label className="field">
          <span className="field-label">Template</span>
          <select value={templateId} onChange={e => setTemplateId(e.target.value)}>
            {TEMPLATES.map(t => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-btn" onClick={handleCopy}>
          {copyState === 'copied'
            ? 'Copied'
            : copyState === 'failed'
              ? 'Copy failed — select and copy manually'
              : 'Copy message'}
        </button>
      </div>

      <textarea
        className="template-preview"
        rows={message.includes('\n') ? 10 : 4}
        value={message}
        readOnly
      />

      <div className="channel-row">
        {igUrl ? (
          <a
            className="channel-btn"
            href={igUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Opens Instagram in a new tab. Status not changed."
          >
            Open Instagram
          </a>
        ) : (
          <button className="channel-btn disabled" disabled title="No Instagram handle set">
            Open Instagram
          </button>
        )}
        {venue.email ? (
          <a
            className="channel-btn"
            href={`mailto:${venue.email}?subject=${encodeURIComponent('DJ programming — ' + venue.name)}&body=${encodeURIComponent(message)}`}
            title="Opens your email client. Status not changed."
          >
            Open email
          </a>
        ) : (
          <button className="channel-btn disabled" disabled title="No email set">
            Open email
          </button>
        )}
        {venue.phone ? (
          <a
            className="channel-btn"
            href={`https://wa.me/${venue.phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Opens WhatsApp. Status not changed."
          >
            WhatsApp
          </a>
        ) : (
          <button className="channel-btn disabled" disabled title="No phone set">
            WhatsApp
          </button>
        )}
      </div>

      {/* Explicit mark-contacted action, intentionally separate from the
          channel buttons. Hidden once the venue is past the contact step
          to keep the panel quiet. */}
      <div className="mark-contacted-row">
        {alreadyContacted ? (
          <div className="muted small">
            Already marked {STATUS_LABEL[venue.status].toLowerCase()}. Use the status pills above to advance.
          </div>
        ) : (
          <button
            className="primary-btn mark-contacted-btn"
            onClick={handleMarkContacted}
            disabled={!isContactable && venue.status !== 'on_hold' && venue.status !== 'lost'}
            title="Set status to Contacted and stamp last_contacted = now"
          >
            Mark as contacted
          </button>
        )}
      </div>
    </section>
  )
}
