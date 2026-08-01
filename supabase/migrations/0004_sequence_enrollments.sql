-- Sequencing walking-skeleton, step 1 (#7): one enrollment row per venue.
-- No step content, no multi-step logic yet — this migration only proves the
-- write-proxy → Supabase → read-back round trip. See #8/#9 for the real model.

create table if not exists public.sequence_enrollments (
  id         uuid        primary key default gen_random_uuid(),
  venue_id   text        not null references public.venues(id) on delete cascade,
  step_label text        not null,
  state      text        not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists sequence_enrollments_venue_idx on public.sequence_enrollments (venue_id);

-- Read-only for anon from day one (repo is public) — writes only via the
-- service_role write-proxy Function, same split as venues (see 0003).
alter table public.sequence_enrollments enable row level security;

drop policy if exists sequence_enrollments_anon_select on public.sequence_enrollments;
create policy sequence_enrollments_anon_select on public.sequence_enrollments for select using (true);
