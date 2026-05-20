-- Crete Nightlife Intelligence — venues schema
-- Run this in the Supabase SQL editor on a fresh project.
-- Idempotent (drops + recreates the policies but not the table data).

create extension if not exists pgcrypto;

create table if not exists public.venues (
  id              text primary key,
  name            text        not null,
  category        text        not null,
  city            text        not null,
  district        text,
  website         text,
  instagram       text,
  email           text,
  phone           text,
  booking_contact text,
  music_type      text,
  has_djs         boolean     not null default false,
  has_events      boolean     not null default false,
  has_audio       boolean     not null default false,
  outdoor         boolean     not null default false,
  luxury_score    smallint    not null default 0 check (luxury_score between 0 and 5),
  tourist_area    boolean     not null default false,
  notes           text,
  last_contacted  timestamptz,
  status          text        not null default 'new',
  tags            text[]      not null default '{}',
  source          text,
  custom_fields   jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------- Idempotent column additions ----------
-- Safe to re-run on existing databases — ADD COLUMN IF NOT EXISTS is supported
-- in Postgres 9.6+ (Supabase runs 15+). Each column lands once.
alter table public.venues add column if not exists facebook    text;
alter table public.venues add column if not exists pitch_angle text;
alter table public.venues add column if not exists capacity    text;
alter table public.venues add column if not exists genre       text;
alter table public.venues add column if not exists entity_type text not null default 'venue' check (entity_type in ('venue', 'festival'));

create index if not exists venues_entity_type_idx on public.venues (entity_type);
create index if not exists venues_genre_idx       on public.venues (genre);

create index if not exists venues_city_idx     on public.venues (city);
create index if not exists venues_category_idx on public.venues (category);
create index if not exists venues_status_idx   on public.venues (status);
create index if not exists venues_tags_idx     on public.venues using gin (tags);
create index if not exists venues_updated_idx  on public.venues (updated_at desc);

-- Auto-bump updated_at on UPDATE
create or replace function public.venues_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists venues_touch_updated_at on public.venues;
create trigger venues_touch_updated_at
  before update on public.venues
  for each row execute function public.venues_touch_updated_at();

-- ---------- Row-Level Security ----------
-- Default policy for tonight's MVP: anon key has full CRUD.
-- For production, switch to authenticated-only and add a `user_id` column.
alter table public.venues enable row level security;

drop policy if exists venues_anon_select on public.venues;
drop policy if exists venues_anon_insert on public.venues;
drop policy if exists venues_anon_update on public.venues;
drop policy if exists venues_anon_delete on public.venues;

create policy venues_anon_select on public.venues for select using (true);
create policy venues_anon_insert on public.venues for insert with check (true);
create policy venues_anon_update on public.venues for update using (true) with check (true);
create policy venues_anon_delete on public.venues for delete using (true);
