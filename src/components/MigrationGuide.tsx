import { useEffect, useState } from 'react'

interface Props {
  onClose: () => void
}

const SQL_SCHEMA = `create table if not exists venues (
  id              text primary key default gen_random_uuid()::text,
  name            text not null,
  category        text not null default 'Other',
  city            text not null default 'Other',
  district        text,
  website         text,
  instagram       text,
  facebook        text,
  email           text,
  phone           text,
  pitch_angle     text,
  capacity        text,
  genre           text,
  entity_type     text default 'venue'
                    check (entity_type in ('venue','festival')),
  booking_contact text,
  music_type      text,
  has_djs         boolean not null default false,
  has_events      boolean not null default false,
  has_audio       boolean not null default false,
  outdoor         boolean not null default false,
  luxury_score    integer not null default 0
                    check (luxury_score between 0 and 5),
  tourist_area    boolean not null default false,
  notes           text,
  last_contacted  text,
  status          text not null default 'new',
  tags            text[] not null default '{}',
  source          text,
  custom_fields   jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Auto-update updated_at on every row change
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger venues_updated_at
  before update on venues
  for each row execute function update_updated_at();

-- Enable Row Level Security (configure policies when adding multi-user)
alter table venues enable row level security;`

const STEPS = [
  {
    title: 'Create a Supabase project',
    body: 'Go to supabase.com → New project. Select region: EU London (eu-west-2). Note your project name.',
  },
  {
    title: 'Copy your API credentials',
    body: 'In your Supabase dashboard: Settings → API. Copy the Project URL and the anon/public key — those two go in the browser. The service_role key is only ever set as an encrypted Cloudflare secret for the /api/venues write proxy; it must never go in a VITE_ variable. See DEPLOY.md §4b.',
  },
  {
    title: 'Add credentials to your environment',
    body: 'Create or update your .env file in the project root:',
    code: `VITE_SUPABASE_URL=https://your-project-id.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key-here`,
  },
  {
    title: 'Run the schema SQL',
    body: 'In Supabase: SQL Editor → New query. Paste the schema below and click Run. This creates the venues table with all required columns.',
    code: SQL_SCHEMA,
  },
  {
    title: 'Export your current data',
    body: 'In the app header: Actions → Download CSV. This exports all venues from your current localStorage database. Keep this file — it\'s your migration source.',
  },
  {
    title: 'Import into Supabase',
    body: 'In Supabase: Table Editor → venues → Import data. Upload your CSV. Map the columns — they match the schema exactly. Verify the row count matches your export.',
  },
  {
    title: 'Verify the migration',
    body: 'Reload the app with your new .env in place. The storage badge in the header should switch from localStorage to Supabase. Check that venue count matches.',
  },
  {
    title: 'Deploy with env vars',
    body: 'On Cloudflare Pages: your project → Settings → Environment variables. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Trigger a new deployment. Done.',
  },
]

export function MigrationGuide({ onClose }: Props) {
  const [copied, setCopied] = useState<number | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const copy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(index)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // silently fail — user can select manually
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Migration guide" onClick={onClose}>
      <div className="migration-modal" onClick={e => e.stopPropagation()}>
        <div className="pricing-modal-header">
          <div>
            <h2 className="pricing-modal-title">localStorage → Supabase migration</h2>
            <p className="pricing-modal-sub">
              Step-by-step handoff guide. Takes about 15 minutes.
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close guide">✕</button>
        </div>

        <div className="migration-steps">
          {STEPS.map((step, i) => (
            <div key={i} className="migration-step">
              <div className="migration-step-num">{i + 1}</div>
              <div className="migration-step-body">
                <h4 className="migration-step-title">{step.title}</h4>
                <p className="migration-step-desc">{step.body}</p>
                {step.code && (
                  <div className="code-block-wrap">
                    <pre className="code-block">{step.code}</pre>
                    <button
                      className="code-copy-btn"
                      onClick={() => copy(step.code!, i)}
                    >
                      {copied === i ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="migration-footer">
          <p className="muted small">
            Running into issues? The Supabase docs at supabase.com/docs are the authoritative reference.
            Check that your VITE_ prefix is present — Vite won't expose env vars without it.
          </p>
        </div>
      </div>
    </div>
  )
}
