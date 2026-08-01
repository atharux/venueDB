-- Sequencing walking-skeleton, step 3 (#9): real sequences/sequence_steps
-- tables, replacing the hardcoded array from #8 (src/sequenceSteps.ts,
-- removed this step). One seeded template — picker UI is wired for more.
--
-- Step bodies use {{firstName}}/{{venueName}} placeholders, substituted
-- client-side (see sequencing.ts renderStepBody) — keeps templating simple,
-- no server-side rendering needed for a single seeded template.

create table if not exists public.sequences (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sequence_steps (
  id          uuid        primary key default gen_random_uuid(),
  sequence_id uuid        not null references public.sequences(id) on delete cascade,
  step_order  smallint    not null,
  day_offset  smallint    not null,
  channel     text        not null default 'email',
  subject     text        not null,
  body        text        not null,
  unique (sequence_id, step_order)
);

alter table public.sequence_enrollments add column if not exists sequence_id uuid references public.sequences(id);

alter table public.sequences enable row level security;
alter table public.sequence_steps enable row level security;

drop policy if exists sequences_anon_select on public.sequences;
create policy sequences_anon_select on public.sequences for select using (true);

drop policy if exists sequence_steps_anon_select on public.sequence_steps;
create policy sequence_steps_anon_select on public.sequence_steps for select using (true);

-- Seed: "Classic 5-touch email" — the one template for now.
insert into public.sequences (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Classic 5-touch email')
on conflict (id) do nothing;

insert into public.sequence_steps (sequence_id, step_order, day_offset, channel, subject, body)
values
  ('00000000-0000-0000-0000-000000000001', 0, 0,  'email', 'Step 1: Intro email', 'Hi {{firstName}},

Reaching out because {{venueName}} is exactly the kind of venue we want to be in. We make Hydrat3 — electrolyte lollipops built for nightlife and festivals. Worth a quick chat about stocking us?'),
  ('00000000-0000-0000-0000-000000000001', 1, 3,  'email', 'Step 2: Follow-up', 'Hi {{firstName}},

Following up on my note about Hydrat3 for {{venueName}} — any thoughts? Happy to send a sample box if that''s easier than a call.'),
  ('00000000-0000-0000-0000-000000000001', 2, 7,  'email', 'Step 3: Check-in', 'Hi {{firstName}},

Still keen to get Hydrat3 in front of the {{venueName}} crowd. Is there a better time to reconnect, or a different contact I should loop in?'),
  ('00000000-0000-0000-0000-000000000001', 3, 14, 'email', 'Step 4: One more idea', 'Hi {{firstName}},

A few venues like {{venueName}} have started running us as a merch-table add-on rather than a bar stock item — flips the economics if that''s a blocker. Worth a quick look?'),
  ('00000000-0000-0000-0000-000000000001', 4, 21, 'email', 'Step 5: Final note', 'Hi {{firstName}},

Last note from me on this — if stocking Hydrat3 at {{venueName}} isn''t a fit right now, no worries at all. Happy to reconnect down the line.')
on conflict (sequence_id, step_order) do nothing;
