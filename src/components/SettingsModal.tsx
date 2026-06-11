export type BrandTheme = 'default' | 'hydrat3'

const BRAND_KEY = 'venue-intel-brand-v1'

export function loadBrandTheme(): BrandTheme {
  try {
    const stored = localStorage.getItem(BRAND_KEY)
    return stored === 'hydrat3' ? 'hydrat3' : 'default'
  } catch {
    return 'default'
  }
}

export function saveBrandTheme(theme: BrandTheme) {
  try {
    localStorage.setItem(BRAND_KEY, theme)
  } catch {
    // ignore
  }
}

interface Props {
  brand: BrandTheme
  onBrandChange: (b: BrandTheme) => void
  onClose: () => void
}

export function SettingsModal({ brand, onBrandChange, onClose }: Props) {
  const handleBrand = (b: BrandTheme) => {
    saveBrandTheme(b)
    onBrandChange(b)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3>Branding</h3>
            <p className="muted small">
              Switch the interface theme. Hydrat3 mode applies the brand's dark club aesthetic.
            </p>
            <div className="brand-picker">

              <button
                className={`brand-option ${brand === 'default' ? 'active' : ''}`}
                onClick={() => handleBrand('default')}
                aria-pressed={brand === 'default'}
              >
                <div className="brand-swatch">
                  <span className="brand-dot" style={{ background: '#e8e1d3' }} />
                  <span className="brand-dot" style={{ background: '#415f34' }} />
                  <span className="brand-dot" style={{ background: '#d98f19' }} />
                </div>
                <div className="brand-option-name">Default</div>
                <div className="brand-option-desc">Venue Intelligence — tactical parchment</div>
                {brand === 'default' ? <span className="brand-active-mark">✓ Active</span> : null}
              </button>

              <button
                className={`brand-option ${brand === 'hydrat3' ? 'active' : ''}`}
                onClick={() => handleBrand('hydrat3')}
                aria-pressed={brand === 'hydrat3'}
              >
                <div className="brand-swatch brand-swatch-h3">
                  <span className="brand-dot" style={{ background: '#0a0a14' }} />
                  <span className="brand-dot" style={{ background: '#d6365a' }} />
                  <span className="brand-dot" style={{ background: '#00d4aa' }} />
                </div>
                <div className="brand-option-name">
                  Hydrat3
                </div>
                <div className="brand-option-desc">LICK. DANCE. REPEAT. — dark club</div>
                {brand === 'hydrat3' ? <span className="brand-active-mark">✓ Active</span> : null}
              </button>

            </div>
          </section>

          <section className="settings-section settings-note">
            <p className="muted small">
              AI routing (OpenRouter key) and column preferences are configured in
              the <strong>Discover → Settings</strong> tab. Storage migration lives in the
              Migration guide (footer).
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
