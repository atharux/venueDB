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

# Create a new repo on github.com (private is fine), then:
git remote add origin git@github.com:<YOUR_HANDLE>/<REPO_NAME>.git
git branch -M main
git push -u origin main
```

**Sanity check before pushing:** `git status` should NOT show `.env`. The `.gitignore` already excludes it, but if you used a different filename (e.g. `.env.local`), confirm it's not in the staged files.

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
   - `VITE_SUPABASE_URL = https://xxxxxxxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY = eyJhbGc...`
   - Apply to: **Production** AND **Preview**
5. Trigger a redeploy: Deployments tab → latest deployment → **Retry deployment**. Env vars only apply to new builds.

After the redeploy: reload the public site. The storage badge in the header flips from `localStorage` to `Supabase` (green).

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
