declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string

interface Props {
  onClose: () => void
}

export function AboutModal({ onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="about-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="about-app-name">Venue Intelligence</h2>
            <div className="about-tagline">Scout · Qualify · Contact · Convert</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="about-body">
          <section className="about-section">
            <p>
              An agentic venue discovery and outreach automation platform built for Hydrat3.
              Scrapes nightclubs, beach clubs, bars, and festivals across Europe and the
              Middle East — automatically enriching contact data and generating personalised
              outreach messages for each lead.
            </p>
          </section>

          <section className="about-section">
            <h3>How it works</h3>
            <ol className="about-steps">
              <li>
                <span className="about-step-label">Scout</span>
                Discover venues by location using free OpenStreetMap data or a multi-query
                region scan. Import from CSV or add manually.
              </li>
              <li>
                <span className="about-step-label">Qualify</span>
                Enrich contact data by scraping venue websites for email, Instagram, and
                phone. Score leads by contact coverage, operational signals, and venue tier.
              </li>
              <li>
                <span className="about-step-label">Contact</span>
                Generate personalised outreach messages — Instagram DM, trade email, or
                WhatsApp — and track every interaction per venue.
              </li>
              <li>
                <span className="about-step-label">Convert</span>
                Advance prospects through the pipeline. Dashboard analytics surface what's
                working across the full portfolio.
              </li>
            </ol>
          </section>

          <section className="about-section">
            <h3>Technical stack</h3>
            <p className="muted small about-stack">
              React · Vite · TypeScript · Supabase · OpenStreetMap Overpass API ·
              ScrapeGraphAI · OpenRouter (LLM contact extraction) · Cloudflare Pages
            </p>
            <p className="muted small">
              Data is stored in your browser (localStorage) or synced to Supabase.
              No third-party tracking. Contact extraction uses configurable LLM routing
              — your API key, your model.
            </p>
          </section>

          <section className="about-section">
            <h3>Data &amp; privacy</h3>
            <p>
              Contact data discovered or entered by this app — including email addresses,
              phone numbers, and booking contact names — is stored in your browser or in
              your own Supabase instance. Nothing is sent to third-party servers outside
              your configured API keys. No tracking, no analytics, no advertising.
            </p>
            <p className="muted small" style={{ marginTop: '8px' }}>
              Venue discovery uses{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                OpenStreetMap
              </a>{' '}
              data (ODbL licence). You can export all data via Actions → Download CSV/JSON
              and delete individual records from the detail panel at any time.
            </p>
          </section>

          <section className="about-section about-credit">
            <div className="about-built-by">
              <span className="about-built-label">Built by</span>
              <a
                className="about-author"
                href="https://atharux.com"
                target="_blank"
                rel="noreferrer"
              >
                Athar Hafiz
              </a>
            </div>
            <div className="about-roles">UX Engineer · AI Product Consultant · DevRel · Berlin</div>
            <div className="about-contact-links">
              <a href="mailto:athar@atharux.com">athar@atharux.com</a>
              <span className="about-sep">·</span>
              <a href="https://atharux.com" target="_blank" rel="noreferrer">atharux.com</a>
            </div>
            <div className="about-copyright">
              © 2026 Athar Hafiz. All rights reserved.
            </div>
            <div className="about-version">
              {__APP_VERSION__} · {__BUILD_DATE__}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
