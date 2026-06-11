import { useState } from 'react'
import type { Venue, OutreachStatus } from '../types'
import { STATUSES, STATUS_LABEL } from '../types'
import { TEMPLATES, copyToClipboard, instagramUrl } from '../outreach'
import { ProGate } from './ProGate'

const TEMPLATE_HINTS: Record<string, string> = {
  'ig-intro-short': 'Short cold DM — best for first contact via Instagram',
  'ig-collab': 'Collab angle — for venues with an active events or brand programme',
  'email-trade': 'Formal trade email — for bar managers, buyers, and procurement contacts',
  'email-festival': 'Festival pitch — positions Hydrat3 at the bar or merch table',
  'whatsapp-quick': 'Quick WhatsApp message — use when you have a direct number',
}

interface Props {
  venue: Venue
  onStatusChange: (status: OutreachStatus) => void
}

export function OutreachPanel({ venue, onStatusChange }: Props) {
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [proExpanded, setProExpanded] = useState(false)

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
              title={STATUS_LABEL[s]}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="status-flow-hint">
          New → Ready → Contacted → In conversation → Won
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
      {TEMPLATE_HINTS[templateId] ? (
        <div className="template-hint">{TEMPLATE_HINTS[templateId]}</div>
      ) : null}

      <div className="template-preview-label">Message preview — read only · use Copy or channel buttons below to send</div>
      <textarea
        className="template-preview"
        rows={message.includes('\n') ? 5 : 3}
        value={message}
        readOnly
        title="Auto-generated from template. Use Copy message to send via your preferred channel."
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
            href={`mailto:${venue.email}?subject=${encodeURIComponent('Hydrat3 — stocking opportunity for ' + venue.name)}&body=${encodeURIComponent(message)}`}
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

      <button
        className="pro-features-toggle"
        onClick={() => setProExpanded(x => !x)}
        aria-expanded={proExpanded}
      >
        <span>Pro features (preview)</span>
        <span className="pro-features-toggle-caret">{proExpanded ? '▲' : '▾'}</span>
      </button>

      {proExpanded && <div className="pro-features-stack">
        <ProGate
          feature="Contact History"
          description="Every email, call, and reply for this venue in a single timeline. Never lose context on a warm lead again."
        >
          <div className="mock-section-label">Contact History</div>
          <div className="mock-timeline">
            <div className="mock-tl-item">
              <span className="mock-tl-date">Jun 10</span>
              <span className="mock-tl-type reply">Reply</span>
              <span className="mock-tl-event">"Send us a sample box and trade sheet" — Anna S.</span>
            </div>
            <div className="mock-tl-item">
              <span className="mock-tl-date">Jun 7</span>
              <span className="mock-tl-type sent">Email</span>
              <span className="mock-tl-event">Sent Hydrat3 trade intro to Anna Schmidt (Bar Manager)</span>
            </div>
            <div className="mock-tl-item">
              <span className="mock-tl-date">Jun 3</span>
              <span className="mock-tl-type call">Call</span>
              <span className="mock-tl-event">No answer — left voicemail, follow up by Friday</span>
            </div>
            <div className="mock-tl-item">
              <span className="mock-tl-date">May 28</span>
              <span className="mock-tl-type note">Note</span>
              <span className="mock-tl-event">Confirmed: busy Fri + Sat nights. Bar manager contact found on website.</span>
            </div>
            <div className="mock-tl-item">
              <span className="mock-tl-date">May 20</span>
              <span className="mock-tl-type added">Added</span>
              <span className="mock-tl-event">Discovered via Riga region scan · 847 venues in DB</span>
            </div>
          </div>
        </ProGate>

        <ProGate
          feature="Follow-up Queue"
          description="Set a reminder on any venue and it surfaces in your daily follow-up queue. Never let a warm lead go cold."
        >
          <div className="mock-section-label">Follow-up Queue</div>
          <div className="mock-queue-stats">
            <span className="mock-queue-pill overdue">2 overdue</span>
            <span className="mock-queue-pill today">3 due today</span>
            <span className="mock-queue-pill upcoming">8 this week</span>
          </div>
          <div className="mock-followup">
            <div className="mock-followup-row">
              <span className="mock-field-label">Remind me</span>
              <select className="mock-select" disabled>
                <option>in 7 days · Jun 17</option>
              </select>
            </div>
            <div className="mock-followup-row">
              <span className="mock-field-label">Note</span>
              <input className="mock-input" disabled placeholder="Ask about August availability…" readOnly />
            </div>
            <button className="mock-btn mock-btn-accent" disabled>Add to queue →</button>
          </div>
        </ProGate>

        <ProGate
          feature="Instantly.ai Sync"
          description="Push this venue directly into an Instantly.ai outreach sequence. One click, no CSV export required."
        >
          <div className="mock-section-label">Push to Instantly.ai</div>
          <div className="mock-instantly">
            <div className="mock-campaign-selector">
              <div className="mock-campaign-opt is-active">
                <span className="mock-campaign-name">Hydrat3 Club Rollout — EU Q3</span>
                <span className="mock-campaign-meta">42 contacts · 8 replied · 19%</span>
              </div>
              <div className="mock-campaign-opt">
                <span className="mock-campaign-name">Festival Season 2026</span>
                <span className="mock-campaign-meta">17 contacts · 3 replied · 18%</span>
              </div>
            </div>
            <button className="mock-btn mock-btn-accent" disabled>Push to selected campaign →</button>
          </div>
        </ProGate>
      </div>}
    </section>
  )
}
