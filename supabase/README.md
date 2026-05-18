# Supabase Setup

The frontend works fully offline with localStorage. Hooking up Supabase gives you cloud sync across devices and a real Postgres you can query.

## 1. Create project

1. Go to https://supabase.com → New project.
2. Pick a region close to you (eu-central-1 / Frankfurt is good for Crete).
3. Save the database password somewhere safe.

## 2. Run the migration

Open the SQL editor in your project, paste the contents of `migrations/0001_venues.sql`, run it. You should see one new table: `venues`.

## 3. Get your credentials

Settings → API:
- **Project URL** (looks like `https://xxxxxxxx.supabase.co`)
- **anon public key** (long JWT)

Paste both into the root `.env`:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Restart `npm run dev`. The header badge should switch from `localStorage` to `Supabase` (green).

## 4. Seed Supabase with the local data

In the app, click **Export JSON** while in localStorage mode. Then in Supabase SQL editor:

```sql
-- Replace <pasted-json> with the contents of the downloaded file.
insert into public.venues
select * from jsonb_to_recordset(<pasted-json>::jsonb)
as x(
  id text, name text, category text, city text, district text,
  website text, instagram text, email text, phone text,
  booking_contact text, music_type text,
  has_djs bool, has_events bool, has_audio bool, outdoor bool,
  luxury_score smallint, tourist_area bool,
  notes text, last_contacted timestamptz, status text,
  tags text[], source text, created_at timestamptz, updated_at timestamptz
)
on conflict (id) do update set
  updated_at = excluded.updated_at,
  status     = excluded.status,
  notes      = excluded.notes,
  tags       = excluded.tags,
  email      = excluded.email,
  instagram  = excluded.instagram,
  phone      = excluded.phone;
```

## RLS note

The migration ships with permissive policies (anon key can read/write everything) so you can ship tonight without an auth flow. **Before sharing your URL publicly**, tighten this:

```sql
alter policy venues_anon_insert on public.venues with check (auth.role() = 'authenticated');
alter policy venues_anon_update on public.venues using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
alter policy venues_anon_delete on public.venues using (auth.role() = 'authenticated');
-- then add Supabase Auth (email magic link) to the frontend.
```
