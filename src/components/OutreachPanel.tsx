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

  const handleOpenAndMark = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
    if (venue.status === 'new' || venue.status === 'researching' || venue.status === 'ready') {
      onStatusChange('contacted')
    }
  }

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
          <button className="channel-btn" onClick={() => handleOpenAndMark(igUrl)}>
            Open Instagram & mark contacted
          </button>
        ) : (
          <button className="channel-btn disabled" disabled title="No Instagram handle set">
            Open Instagram
          </button>
        )}
        {venue.email ? (
          <a
            className="channel-btn"
            href={`mailto:${venue.email}?subject=${encodeURIComponent('DJ programming — ' + venue.name)}&body=${encodeURIComponent(message)}`}
            onClick={() => onStatusChange('contacted')}
          >
            Open email & mark contacted
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
            rel="noreferrer"
            onClick={() => onStatusChange('contacted')}
          >
            WhatsApp & mark contacted
          </a>
        ) : (
          <button className="channel-btn disabled" disabled title="No phone set">
            WhatsApp
          </button>
        )}
      </div>
    </section>
  )
}
