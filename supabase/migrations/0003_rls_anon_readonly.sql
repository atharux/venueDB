-- Tighten RLS: anon role gets read-only access.
-- Write operations (insert/update/delete) require an authenticated session.
-- Applied 2026-06-21 after repo went public.

drop policy if exists venues_anon_insert on public.venues;
drop policy if exists venues_anon_update on public.venues;
drop policy if exists venues_anon_delete on public.venues;
