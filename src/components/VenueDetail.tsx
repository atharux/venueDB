import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Venue, Tag } from '../types'
import { CATEGORIES, STATUSES, STATUS_LABEL, TAGS } from '../types'
import { facebookUrl, instagramUrl, websiteUrl } from '../outreach'
import { ScrapeButton } from './ScrapeButton'
import { enrichLead, scraperEnabled } from '../scraper'
import { loadAiSettings } from '../aiSettings'

interface Props {
  venue: Venue
  onUpdate: (id: string, patch: Partial<Venue>) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function VenueDetail({ venue, onUpdate, onDelete, onClose }: Props) {
  const [showRawJson, setShowRawJson] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enrichNote, setEnrichNote] = useState<string | null>(null)
  const [verifierName, setVerifierName] = useState(
    () => localStorage.getItem('venue-intel-verifier-v1') ?? ''
  )

  const handleEnrich = async () => {
    setEnriching(true)
    setEnrichNote(null)
    try {
      const result = await enrichLead(
        {
          name: venue.name,
          city: venue.city,
          website: venue.website,
          instagram: venue.instagram,
          email: venue.email,
          phone: venue.phone,
          notes: venue.notes,
        },
        loadAiSettings(),
      )
      const patch: Partial<Venue> = {}
      if (!venue.website && result.website) patch.website = result.website
      if (!venue.instagram && result.instagram) patch.instagram = result.instagram
      if (!venue.email && result.email) patch.email = result.email
      if (!venue.phone && result.phone) patch.phone = result.phone

      if (Object.keys(patch).length > 0) {
        onUpdate(venue.id, patch)
        setEnrichNote(`Found: ${Object.keys(patch).join(', ')}`)
      } else {
        setEnrichNote('Nothing new found')
      }
    } catch (err) {
      setEnrichNote(`Error: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`)
    } finally {
      setEnriching(false)
    }
  }

  const set = <K extends keyof Venue>(k: K, val: Venue[K]) => onUpdate(venue.id, { [k]: val } as Partial<Venue>)

  const igUrl = instagramUrl(venue.instagram)
  const fbUrl = facebookUrl(venue.facebook)
  const webUrl = websiteUrl(venue.website)
  const channelCount = [venue.website, venue.instagram, venue.facebook, venue.email, venue.phone].filter(Boolean).length
  const signalCount = [venue.has_djs, venue.has_events, venue.has_audio, venue.outdoor].filter(Boolean).length
  const intelScore = Math.min(100, channelCount * 25 + signalCount * 10 + venue.luxury_score * 4)
  const readinessLabel =
    venue.status === 'ready' || venue.status === 'contacted' || venue.status === 'in_conversation'
      ? 'Engage'
      : channelCount >= 2
        ? 'Qualify'
        : 'Research'

  return (
    <aside className="venue-detail">
      <div className="detail-header">
        <div className="detail-heading">
          <div className="detail-kicker">Lead dossier</div>
          <h2>{venue.name}</h2>
          <div className="detail-sub">
            {venue.category} · {venue.city}
            {venue.district ? ` · ${venue.district}` : ''}
          </div>
          <div className="detail-chip-row">
            <span className={`status status-${venue.status}`}>{STATUS_LABEL[venue.status]}</span>
            <span
              className="detail-chip"
              title={`Intel score: contacts found (×25) + operational signals (×10) + luxury score (×4). Max 100. This venue has ${channelCount} contact channels and ${signalCount} signals.`}
            >
              Intel {intelScore}
            </span>
            <span
              className="detail-chip"
              title={
                readinessLabel === 'Research'
                  ? 'Research — fewer than 2 contact channels found. Use Enrich or add contact details manually.'
                  : readinessLabel === 'Qualify'
                    ? 'Qualify — contact channels exist. Review and confirm this is a good Hydrat3 prospect before reaching out.'
                    : 'Engage — status shows active outreach. Use the Outreach panel above to send a message or log contact.'
              }
            >
              {readinessLabel}
            </span>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {venue.pitch_angle ? (
        <section className="detail-section pitch-angle-banner">
          <div className="pitch-angle-label">Why this lead converts</div>
          <div className="pitch-angle-text">{venue.pitch_angle}</div>
        </section>
      ) : null}

      {venue.capacity || venue.genre ? (
        <section className="detail-section detail-context-pills">
          {venue.capacity ? (
            <span className="context-pill">
              <span className="context-pill-label">Capacity</span>
              <span className="context-pill-value">{venue.capacity}</span>
            </span>
          ) : null}
          {venue.genre ? (
            <span className="context-pill">
              <span className="context-pill-label">Genre</span>
              <span className="context-pill-value">{venue.genre}</span>
            </span>
          ) : null}
        </section>
      ) : null}

      <section className="detail-section detail-hero">
        <div className="detail-stats-grid">
          <Metric label="Channels" value={`${channelCount}/4`} />
          <Metric label="Signals" value={`${signalCount}/4`} />
          <Metric label="Luxury" value={`${venue.luxury_score}/5`} />
          <Metric label="Last touch" value={venue.last_contacted?.slice(0, 10) ?? '—'} />
        </div>
        <div className="detail-action-row">
          {webUrl ? (
            <a className="detail-action" href={webUrl} target="_blank" rel="noreferrer">
              Website
            </a>
          ) : null}
          {igUrl ? (
            <a className="detail-action" href={igUrl} target="_blank" rel="noreferrer">
              Instagram
            </a>
          ) : null}
          {fbUrl ? (
            <a className="detail-action" href={fbUrl} target="_blank" rel="noreferrer">
              Facebook
            </a>
          ) : null}
          {venue.email ? (
            <a className="detail-action" href={`mailto:${venue.email}`}>
              Email
            </a>
          ) : null}
          {venue.phone ? (
            <a className="detail-action" href={`tel:${venue.phone}`}>
              Call
            </a>
          ) : null}
        </div>
        <div className="detail-enrich-row">
          <button
            className="detail-enrich-btn"
            onClick={() => void handleEnrich()}
            disabled={enriching || !scraperEnabled}
            title={scraperEnabled ? 'Search the web for this venue\'s website, then extract email, Instagram, and phone. Only fills in missing fields — never overwrites existing data.' : 'Scraper is offline. Run locally or set VITE_SCRAPER_URL to enable.'}
          >
            {enriching ? 'Finding contacts…' : 'Find missing contacts'}
          </button>
          {enrichNote ? (
            <span className={`detail-enrich-note ${enrichNote.startsWith('Error') ? 'is-error' : enrichNote.startsWith('Nothing') ? 'is-neutral' : 'is-ok'}`}>
              {enrichNote}
            </span>
          ) : null}
        </div>
      </section>

      <section className="detail-section">
        <h3>Identity</h3>
        <Field label="Name">
          <input value={venue.name} onChange={e => set('name', e.target.value)} />
        </Field>
        <div className="field-row">
          <Field label="City">
            <input
              list="cities-datalist"
              value={venue.city}
              placeholder="e.g. Berlin"
              onChange={e => {
                const v = e.target.value.replace(/\b\w/g, c => c.toUpperCase())
                set('city', v as Venue['city'])
              }}
            />
          </Field>
          <Field label="District">
            <input
              value={venue.district ?? ''}
              onChange={e => set('district', e.target.value || undefined)}
            />
          </Field>
        </div>
        <Field label="Category">
          <select value={venue.category} onChange={e => set('category', e.target.value as Venue['category'])}>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Entity type">
          <select
            value={venue.entity_type ?? 'venue'}
            onChange={e => set('entity_type', e.target.value as 'venue' | 'festival')}
          >
            <option value="venue">Venue</option>
            <option value="festival">Festival</option>
          </select>
        </Field>
      </section>

      <section className="detail-section">
        <div className="section-header">
          <h3>Contact</h3>
          <ScrapeButton
            url={venue.website}
            onResult={r => {
              const patch: Partial<Venue> = {}
              if (!venue.email && r.emails[0]) patch.email = r.emails[0]
              if (!venue.instagram && r.instagram_handles[0]) patch.instagram = r.instagram_handles[0]
              if (!venue.phone && r.phones[0]) patch.phone = r.phones[0]
              if (Object.keys(patch).length === 0) {
                alert(`Scrape complete. Found ${r.emails.length} emails, ${r.instagram_handles.length} IG handles, ${r.phones.length} phones — but all fields were already set.`)
                return
              }
              onUpdate(venue.id, patch)
            }}
          />
        </div>
        <Field label="Website">
          <div className="inline-input">
            <input
              value={venue.website ?? ''}
              placeholder="https://…"
              onChange={e => set('website', e.target.value || undefined)}
            />
            {webUrl ? (
              <a className="link-btn" href={webUrl} target="_blank" rel="noreferrer">
                Open
              </a>
            ) : null}
          </div>
        </Field>
        <Field label="Instagram handle">
          <div className="inline-input">
            <span className="inline-prefix">@</span>
            <input
              value={venue.instagram ?? ''}
              placeholder="handle (no @)"
              onChange={e => set('instagram', e.target.value.replace(/^@/, '') || undefined)}
            />
            {igUrl ? (
              <a className="link-btn" href={igUrl} target="_blank" rel="noreferrer">
                Open IG
              </a>
            ) : null}
          </div>
        </Field>
        <Field label="Facebook">
          <div className="inline-input">
            <input
              value={venue.facebook ?? ''}
              placeholder="page slug or full URL"
              onChange={e => set('facebook', e.target.value || undefined)}
            />
            {fbUrl ? (
              <a className="link-btn" href={fbUrl} target="_blank" rel="noreferrer">
                Open FB
              </a>
            ) : null}
          </div>
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={venue.email ?? ''}
            onChange={e => set('email', e.target.value || undefined)}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={venue.phone ?? ''}
            onChange={e => set('phone', e.target.value || undefined)}
          />
        </Field>
        <Field label="Booking contact (person)">
          <input
            value={venue.booking_contact ?? ''}
            placeholder="e.g. Maria Papadopoulou"
            onChange={e => set('booking_contact', e.target.value || undefined)}
          />
        </Field>
      </section>

      <section className="detail-section">
        <h3>Operational signals</h3>
        <div className="checkbox-grid">
          <Toggle label="Has DJs" checked={venue.has_djs} onChange={v => set('has_djs', v)} />
          <Toggle label="Hosts events" checked={venue.has_events} onChange={v => set('has_events', v)} />
          <Toggle label="Has audio system" checked={venue.has_audio} onChange={v => set('has_audio', v)} />
          <Toggle label="Outdoor space" checked={venue.outdoor} onChange={v => set('outdoor', v)} />
          <Toggle label="Tourist area" checked={venue.tourist_area} onChange={v => set('tourist_area', v)} />
        </div>
        <Field label="Music type / genres">
          <input
            value={venue.music_type ?? ''}
            placeholder="e.g. House, sunset, AfroHouse"
            onChange={e => set('music_type', e.target.value || undefined)}
          />
        </Field>
        <Field label="Luxury score (0–5)">
          <input
            type="range"
            min={0}
            max={5}
            value={venue.luxury_score}
            onChange={e => set('luxury_score', Number(e.target.value) as Venue['luxury_score'])}
          />
          <span className="lux-display">{venue.luxury_score} · {'★'.repeat(venue.luxury_score) || '—'}</span>
        </Field>
      </section>

      <section className="detail-section">
        <h3>Tags</h3>
        <TagEditor selected={venue.tags} onChange={tags => set('tags', tags)} />
      </section>

      <section className="detail-section">
        <h3>Semantic context</h3>
        <Field label="Pitch angle (why this lead converts)">
          <textarea
            rows={2}
            value={venue.pitch_angle ?? ''}
            placeholder={'e.g. "Tresor’s arty sister club; intimate; owner reads all DMs"'}
            onChange={e => set('pitch_angle', e.target.value || undefined)}
          />
        </Field>
        <div className="field-row">
          <Field label="Capacity">
            <input
              value={venue.capacity ?? ''}
              placeholder="e.g. 300-500"
              onChange={e => set('capacity', e.target.value || undefined)}
            />
          </Field>
          <Field label="Genre">
            <input
              value={venue.genre ?? ''}
              placeholder="e.g. Techno / Experimental / Queer"
              onChange={e => set('genre', e.target.value || undefined)}
            />
          </Field>
        </div>
      </section>

      <section className="detail-section">
        <h3>Notes</h3>
        <textarea
          rows={5}
          value={venue.notes ?? ''}
          placeholder="Operational notes, vibe, programming, contacts met…"
          onChange={e => set('notes', e.target.value || undefined)}
        />
      </section>

      {venue.custom_fields && Object.keys(venue.custom_fields).length > 0 ? (
        <section className="detail-section">
          <h3>Imported fields</h3>
          <div className="custom-field-list">
            {Object.entries(venue.custom_fields).map(([key, value]) => (
              <div key={key} className="preview-row">
                <span className="preview-key">{key}</span>
                <span>{value || '—'}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="detail-section">
        <h3>Status</h3>
        <div className="field-row">
          <Field label="Outreach status">
            <select value={venue.status} onChange={e => set('status', e.target.value as Venue['status'])}>
              {STATUSES.map(s => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Last contacted">
            <input
              type="date"
              value={venue.last_contacted?.slice(0, 10) ?? ''}
              onChange={e => set('last_contacted', e.target.value || undefined)}
            />
          </Field>
        </div>
        <div className="verified-row">
          {(() => {
            const vs = verifiedStatus(venue)
            const by = venue.verified_by ? ` by ${venue.verified_by}` : ''
            const date = venue.last_verified?.slice(0, 10) ?? ''
            return (
              <span className={`verified-badge is-${vs}`}>
                {vs === 'verified'
                  ? `✓ Verified${by} · ${date}`
                  : vs === 'stale'
                    ? `⚠ Stale${by} · ${date}`
                    : 'Unverified'}
              </span>
            )
          })()}
          <div className="verify-action-row">
            <input
              className="verifier-name-input"
              value={verifierName}
              placeholder="Your name…"
              onChange={e => {
                setVerifierName(e.target.value)
                localStorage.setItem('venue-intel-verifier-v1', e.target.value)
              }}
            />
            <button
              className="verify-btn"
              onClick={() => {
                const patch: Partial<Venue> = { last_verified: new Date().toISOString() }
                if (verifierName.trim()) patch.verified_by = verifierName.trim()
                onUpdate(venue.id, patch)
              }}
            >
              Mark as verified
            </button>
          </div>
        </div>
      </section>

      <section className="detail-section meta">
        <div className="meta-row">
          <span>Source: {venue.source ?? '—'}</span>
          <span>Updated: {new Date(venue.updated_at).toLocaleString()}</span>
        </div>
        <button className="link-btn" onClick={() => setShowRawJson(s => !s)}>
          {showRawJson ? 'Hide' : 'Show'} raw JSON
        </button>
        {showRawJson ? (
          <pre className="raw-json">{JSON.stringify(venue, null, 2)}</pre>
        ) : null}
      </section>

      <section className="detail-section danger">
        <button
          className="danger-btn"
          onClick={() => {
            if (confirm(`Delete ${venue.name}? This cannot be undone.`)) {
              onDelete(venue.id)
            }
          }}
        >
          Delete venue
        </button>
      </section>
    </aside>
  )
}

function verifiedStatus(v: Venue): 'verified' | 'stale' | 'unverified' {
  if (!v.last_verified) return 'unverified'
  const days = (Date.now() - new Date(v.last_verified).getTime()) / 86400000
  return days <= 90 ? 'verified' : 'stale'
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-metric">
      <span className="detail-metric-label">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function TagEditor({ selected, onChange }: { selected: Tag[]; onChange: (tags: Tag[]) => void }) {
  const sel = new Set(selected)
  return (
    <div className="tag-editor">
      {TAGS.map(t => {
        const active = sel.has(t)
        return (
          <button
            key={t}
            type="button"
            className={`tag-toggle ${active ? 'active' : ''}`}
            onClick={() => {
              const next = new Set(sel)
              if (active) next.delete(t)
              else next.add(t)
              onChange(Array.from(next) as Tag[])
            }}
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}
