import { useEffect } from 'react'

interface Props {
  onClose: () => void
  highlightFeature?: string
}

const TIERS = [
  {
    name: 'Starter',
    price: 'Free',
    period: 'current plan',
    description: 'Scrape, store, and track basic outreach status across all regions.',
    features: [
      'Venue & festival database',
      '9-region scraping rotation',
      'CSV & JSON export',
      'Map view',
      'Dashboard analytics',
      'Basic outreach status',
      '1 user',
    ],
    cta: 'Current plan',
    ctaDisabled: true,
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '€49',
    period: 'per month',
    description: 'Turn your database into an active CRM with contacts, timelines, and campaign tools.',
    badge: 'Recommended',
    features: [
      'Everything in Starter',
      'CRM: named contacts per venue',
      'Activity timeline & notes',
      'Follow-up reminders & queue',
      'Pipeline kanban view',
      'Outreach template library',
      'Bulk outreach actions',
      'Instantly.ai sync',
      '3 users',
    ],
    cta: 'Upgrade to Pro',
    ctaDisabled: false,
    highlighted: true,
  },
  {
    name: 'Agency',
    price: '€149',
    period: 'per month',
    description: 'Multi-client operations with full team access, API, and white-label options.',
    features: [
      'Everything in Pro',
      'Unlimited users + role-based access',
      'Multi-workspace (multiple clients)',
      'REST API access',
      'White-label branding',
      'Custom scraping regions on demand',
      'Priority support & SLA',
    ],
    cta: 'Contact us',
    ctaDisabled: false,
    highlighted: false,
  },
]

export function PricingModal({ onClose, highlightFeature }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Pricing" onClick={onClose}>
      <div className="pricing-modal" onClick={e => e.stopPropagation()}>
        <div className="pricing-modal-header">
          <div>
            <h2 className="pricing-modal-title">Plans & pricing</h2>
            {highlightFeature && (
              <p className="pricing-modal-sub">
                <strong>{highlightFeature}</strong> is available on Pro and above.
              </p>
            )}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close pricing">✕</button>
        </div>

        <div className="pricing-tiers">
          {TIERS.map(tier => (
            <div key={tier.name} className={`pricing-tier ${tier.highlighted ? 'highlighted' : ''}`}>
              {tier.badge && <span className="pricing-tier-badge">{tier.badge}</span>}
              <div className="pricing-tier-name">{tier.name}</div>
              <div className="pricing-price-row">
                <span className="pricing-price-amount">{tier.price}</span>
                <span className="pricing-price-period">{tier.period}</span>
              </div>
              <p className="pricing-tier-desc">{tier.description}</p>
              <ul className="pricing-features-list">
                {tier.features.map(f => (
                  <li key={f} className="pricing-feature-item">
                    <span className="pricing-check">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className={`pricing-tier-cta ${tier.highlighted ? 'primary-btn' : ''}`}
                disabled={tier.ctaDisabled}
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="pricing-footer-note">
          All plans include unlimited venue records. Pricing in EUR excl. VAT.
          Cancel anytime.
        </p>
      </div>
    </div>
  )
}
