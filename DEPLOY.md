# Deploy Guide — Push to GitHub + Cloudflare Pages tonight

This app ships in three runtime modes, each one a strict upgrade of the previous:

| Mode | Storage | Scraper | Setup time |
|------|---------|---------|------------|
| **Local-only** (default)        | Browser localStorage | Vite middleware (`/api/*` in dev) | 0 min |
| **Cloud sync**                  | Supabase             | Vite middleware (dev only)        | ~10 min |
| **Production (Cloudflare)**     | Supabase             | Pages Functions (`/api/*` live)   | ~25 min |

The frontend never knows or cares which mode is active. The scraper status badge in the header turns green automatically when the right backend is reachable.

---

## 0. Run it locally (no setup)

```bash
npm install
npm run dev
```

Open the printed URL. Seeded venues appear in localStorage. The scraper status badge should be green because Vite's middleware serves `/api/*` in-process.

---

## 1. Push to GitHub (5 min)

If the repo isn't already on GitHub:

```bash
cd /Users/a1/code/venue-outreach-db
git init                                  # only if not already a repo
git add .
git status                                # confirm .env is NOT in the list (it's gitignored)
git commit -m "Initial commit — Lead Intel Stack MVP"
```

**Create the GitHub repo as EMPTY.** This matters. On github.com → New repository → name it → **uncheck** all three of: "Add a README file", "Add .gitignore", "Choose a license". You want a bare empty repo with no commits. If you check any of those boxes, GitHub creates an initial commit on the remote that your local clone doesn't have, and the first `git push` will be rejected ("Updates were rejected because the remote contains work that you do not have locally").

Then connect and push:

```bash
git remote add origin git@github.com:<YOUR_HANDLE>/<REPO_NAME>.git
git branch -M main
git push -u origin main
```

**Sanity check before pushing:** `git status` should NOT show `.env`. The `.gitignore` already excludes it, but if you used a different filename (e.g. `.env.local`), confirm it's not in the staged files.

**If you already created the repo with auto-init and got the "rejected" error:** the remote has a throwaway README commit you don't need. Verify with `git fetch origin && git log origin/main --oneline -5` (should show ~1 commit). Then overwrite the remote:

```bash
git push --force-with-lease origin main
```

`--force-with-lease` is safer than `--force` — it refuses if anyone else pushed in between. Only use this when you're certain the remote has nothing valuable.

---

## 2. Create a Cloudflare Pages project (10 min)

1. Go to https://dash.cloudflare.com → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Authorize Cloudflare to read your GitHub account, select the repo.
3. Build configuration:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** *(leave blank)*
   - **Node version:** `22` (Settings → Environment variables → add `NODE_VERSION = 22` if needed)
4. Click **Save and Deploy**. First build takes ~90 seconds.

When it finishes you get a URL like `https://<project>.pages.dev`.

**What just happened with `functions/`:** Cloudflare Pages auto-detects the `functions/` directory and deploys each file under `functions/api/` as a serverless route on the same domain. `functions/api/scrape.ts` becomes `https://<project>.pages.dev/api/scrape`. No `wrangler` install, no separate deploy step.

---

## 3. Smoke-test the scraper in production (2 min)

Before adding Supabase, prove the scraper works in production:

```bash
# Should print {"ok":true,"mode":"cloudflare-pages-function","hasSearch":true,"hasEnrich":true}
curl https://<project>.pages.dev/api/health

# Should print extracted contacts for the venue
curl -X POST https://<project>.pages.dev/api/scrape \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.cabanamarechania.gr/"}'
```

If both return JSON, you're done with the scraper. Open the deployed site in the browser — the scraper status badge should now be green in production too.

---

## 4. Add Supabase (10 min)

1. https://supabase.com → **New project**. Region: `eu-central-1` (Frankfurt) is good if your users are in EU.
2. SQL Editor → paste `supabase/migrations/0001_venues.sql` → **Run**. You should see "Success. No rows returned."
3. Settings → **API** → copy:
   - **Project URL** (e.g. `https://xxxxxxxx.supabase.co`)
   - **anon public** key (a long JWT — NOT the `service_role` one)
4. Back in Cloudflare Pages dashboard → your project → **Settings** → **Environment variables** → add:
   - `VITE_SUPABASE_URL = https://xxxxxxxx.supabase.co` — **Plaintext** (the type, not encrypted)
   - `VITE_SUPABASE_ANON_KEY = eyJhbGc...` — **Plaintext** (the type, not encrypted)
   - Apply to: **Production** AND **Preview**

   **Why plaintext for both?** Any variable prefixed with `VITE_` gets baked into the client-side JS at build time — it's in the public bundle, downloadable by anyone via DevTools. Encrypting it in Cloudflare's storage doesn't change that. The Supabase **anon public** key is designed to be browser-exposed; security comes from Row-Level Security (see §6), not from hiding the key.

   Rule for everything you'll add later: **`VITE_*` → Plaintext (public). No `VITE_` prefix → Encrypt (backend-only secret used inside Pages Functions, like an OpenRouter or scraper API key).**

   **The `service_role` key follows that same rule — with no room for error.** It bypasses RLS entirely, so it must *never* be given a `VITE_` prefix and never appear in a plaintext var: either would bake it into the public JS bundle and hand anyone full read/write on your database. It is safe *only* as an **Encrypted** variable read inside a Pages Function, which is exactly how `functions/api/venues.ts` consumes it (see §Write proxy below). If you are ever unsure which bucket a key belongs in, it belongs in Encrypted.

5. Trigger a redeploy: Deployments tab → latest deployment → **Retry deployment**. Env vars only apply to new builds.

After the redeploy: reload the public site. The storage badge in the header flips from `localStorage` to `Supabase` (green).

---

## 4b. Write proxy — required for adding/importing venues

Migration `0003_rls_anon_readonly.sql` makes the anon key **read-only**. That is deliberate: this repo is public and the anon key ships in the JS bundle, so anon write access would let anyone wipe the venue table. Reads still go browser → Supabase directly; **writes go through `functions/api/venues.ts`**, which holds the `service_role` key server-side.

Without the three variables below, reads work but every write (Quick Add, CSV import, enrichment) fails with `Write proxy 503: not configured`.

Cloudflare Pages → Settings → Environment variables → add, for **Production** and **Preview**:

| Variable | Type | Value |
|---|---|---|
| `SUPABASE_URL` | Encrypted | Same URL as `VITE_SUPABASE_URL` (no `VITE_` prefix — this one is read server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Encrypted** | Supabase → Settings → API → `service_role` key |
| `APP_PASSCODE` | Encrypted | The **same string** as `VITE_APP_PASSCODE` |

Then **Retry deployment** — env vars only apply to new builds.

**What the passcode does and doesn't buy you.** The proxy requires an `x-app-passcode` header matching `APP_PASSCODE`, and fails closed if the secret is missing. But `VITE_APP_PASSCODE` is in the client bundle, so anyone who can load the app can extract it. This is a real improvement — the `service_role` key never leaves the server, the routes are narrow (no bulk-delete), and there's one choke point to rotate or rate-limit — but it is **not per-user authentication**. If this POC starts holding client-confidential data, replace the passcode with Supabase Auth and scope RLS to the `authenticated` role.

---

## 4a. Migrate existing Supabase to the latest schema (1 min)

If you ran the original `0001_venues.sql` before today's semantic-context update, run this in the Supabase SQL editor — it adds the new columns without touching existing data:

```sql
alter table public.venues add column if not exists facebook    text;
alter table public.venues add column if not exists pitch_angle text;
alter table public.venues add column if not exists capacity    text;
alter table public.venues add column if not exists genre       text;
alter table public.venues add column if not exists entity_type text not null default 'venue' check (entity_type in ('venue', 'festival'));
create index if not exists venues_entity_type_idx on public.venues (entity_type);
create index if not exists venues_genre_idx       on public.venues (genre);
```

Existing rows default to `entity_type = 'venue'` automatically. After this runs, re-import any spreadsheet that has a `WHY IT CONVERTS / Cap Range / Genre` column and the values now land in the typed fields (visible as a banner + pills in the venue detail panel) instead of `custom_fields`.

---

## 4b. Add Brave Search API for website discovery (5 min, recommended)

Without this, bulk enrichment can only scrape rows that already have a `website` field. Imported rows without websites will log "no attempts" because there's no way to discover their URLs. Brave Search fills that gap — free tier, no card.

1. https://api.search.brave.com/ → **Get Started** → sign up with email → confirm
2. Pick the **Free** plan (2,000 queries/month, $0/mo, no card required)
3. Dashboard → **API Keys** → **Add API Key** → name it `venuedb` → copy the key
4. Cloudflare Pages → your project → Settings → Environment variables → add:
   - Name: `BRAVE_API_KEY`
   - Value: paste the key from step 3
   - Type: **Encrypt** (NOT plaintext — backend-only secret, no `VITE_` prefix)
   - Apply to: Production AND Preview
5. Trigger a redeploy (Deployments → Retry deployment)

Verify it's wired up: open `https://<project>.pages.dev/api/health` — `hasSearch` will still be `true` either way (DuckDuckGo is the fallback), so test by running enrichment on a row without a website. You'll know it's working when the per-row log starts showing real URLs being scraped instead of "no attempts".

**How discovery works once Brave is live:** for each row missing a website, the scraper tries (a) Brave Search, (b) URL guessing from name + city TLD (`Tanzhaus West` in Berlin → tries `https://www.tanzhauswest.de` first), (c) DuckDuckGo as last resort. First hit wins.

---

## 5. Verify end-to-end on production (5 min)

Open `https://<project>.pages.dev` in an incognito window and run through the demo script:

- [ ] Header shows `Supabase` (green) + `Local API connected` (green)
- [ ] Dashboard tab loads, charts render with seeded venue counts
- [ ] Click a city bar → table filters
- [ ] Dashboard → "Enrich missing contacts" → shows count of venues with missing channels
- [ ] Click enrich → progress bar advances → log shows real per-URL counts like `+ Name: patched email · /=2e/1i/0p /contact=1e/0i/3p`
- [ ] Open any venue → click "Open Website" / "Open IG" / "Open FB" — all open correctly
- [ ] Add a row in Quick Add → reload the page → row persists (proves Supabase write-through)

If all six tick, the demo is production-ready.

---

## 6. Tighten security before sharing the URL publicly

The shipped Supabase migration uses permissive RLS so the anon key has full CRUD — fine for a solo demo, dangerous the moment a stranger hits the URL.

In the Supabase SQL editor, run **after** the demo:

```sql
-- Replace the four permissive policies with auth-required ones
alter policy venues_anon_select on public.venues using (auth.role() = 'authenticated');
alter policy venues_anon_insert on public.venues with check (auth.role() = 'authenticated');
alter policy venues_anon_update on public.venues using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
alter policy venues_anon_delete on public.venues using (auth.role() = 'authenticated');
```

Then wire Supabase Auth (magic link is simplest) into the frontend. That's a separate ~2-hour task.

---

## 7. Push updates after the first deploy

Every `git push` to `main` triggers a Cloudflare Pages rebuild automatically. Build logs appear under **Deployments**. Each deploy gets its own URL (`<hash>.<project>.pages.dev`) plus the stable `main` URL.

For PR previews: push to a branch, open a PR on GitHub, Cloudflare auto-creates a preview deploy at `<branch>.<project>.pages.dev`. Useful for demoing changes to a client before merging.

---

## Troubleshooting

**Build fails in Cloudflare with "Cannot find module './scraper-core'"** — the tsconfig.node.json needs `scraper-core.ts` in its `include` array. This is already fixed in the repo; if you copied an old version, check line 23 of `tsconfig.node.json`.

**Scraper badge shows "Scraper unavailable" in production** — open `https://<project>.pages.dev/api/health` directly. If 404, Pages didn't pick up the `functions/` directory — check that the directory is in the repo root (not under `src/`) and that the deployment log shows "Functions: 4" or similar.

**Supabase reads but writes fail with 401** — you pasted the `service_role` key by mistake. Settings → API → use the **anon public** key, never the secret one.

**Writes fail with `42501` "new row violates row-level security policy for table venues"** — the reverse mistake: the `SUPABASE_SERVICE_ROLE_KEY` **Encrypted** variable on the Pages project holds the **anon** key, not the real `service_role` key. The service_role key bypasses RLS entirely, so it can *never* produce a `42501`; getting one means the proxy authenticated to PostgREST as the `anon` role and migration `0003_rls_anon_readonly.sql` (which drops anon insert/update/delete) rejected the write. Fix: Supabase → Settings → API → copy the **`service_role`** secret JWT, set it as `SUPABASE_SERVICE_ROLE_KEY` (Encrypted), and **redeploy** (env changes don't apply until the next deploy). Verify by decoding the JWT — its payload must read `"role":"service_role"`, not `"role":"anon"`.

**Enrich shows "no new contacts" for everything** — open browser DevTools → Network tab → click enrich → check the response from `/api/enrich`. The `attempts` array shows what the scraper actually saw. Three common causes:
  - All your seeded venues are already complete (nothing to fill in — expected)
  - Venues have JavaScript-rendered sites (regex sees empty HTML)
  - The website is behind anti-bot (Cloudflare/Akamai). Try a different URL.

**Pages Function logs** — Cloudflare dashboard → your project → **Functions** → **Logs** shows every invocation with timing + status. Tail this while running enrichment to see exactly what's happening server-side.

---

## What's NOT auto-deployed

These local-only files are bypassed in production (safely):

- `vite.config.ts` middleware — only runs in `npm run dev` / `npm run preview`
- `local-api-server.mjs` — only runs via `npm run local-api`
- `scripts/parse_spreadsheet.py` — never runs in production (xlsx parsing moved to the browser via `read-excel-file`)
- `worker/` — separate Cloudflare Worker scaffold, unused once Pages Functions are live

All of these are kept so local dev flows keep working. They don't add weight to the production bundle.
