import { useState } from 'react'
import { PricingModal } from './PricingModal'

interface Props {
  feature: string
  description: string
  children: React.ReactNode
  className?: string
}

export function ProGate({ feature, description, children, className = '' }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        className={`pro-gate ${className}`}
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        aria-label={`${feature} — Pro feature. Click to see pricing.`}
        onKeyDown={e => e.key === 'Enter' && setOpen(true)}
      >
        <div className="pro-gate-content" aria-hidden="true">
          {children}
        </div>
        <div className="pro-gate-overlay">
          <div className="pro-gate-inner">
            <span className="pro-badge">Pro</span>
            <h4 className="pro-gate-title">{feature}</h4>
            <p className="pro-gate-desc">{description}</p>
            <button
              className="pro-gate-cta"
              onClick={e => { e.stopPropagation(); setOpen(true) }}
            >
              Unlock with Pro →
            </button>
          </div>
        </div>
      </div>
      {open && (
        <PricingModal
          onClose={() => setOpen(false)}
          highlightFeature={feature}
        />
      )}
    </>
  )
}
