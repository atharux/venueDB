# Crete Scraper Worker

A Cloudflare Worker that powers the "Scrape this venue" magic moment in the Crete Nightlife Intelligence MVP.

## What it does

- `POST /scrape  { url }`  — fetches a venue page, extracts public emails, Instagram handles, phones, addresses, title, description. Returns JSON.
- `POST /search  { query }` — proxies Brave Search (optional, requires `BRAVE_API_KEY`).
- `GET  /health` — sanity check + tells you whether search is enabled.

No external npm dependencies in production code. Pure regex + native `fetch`. Runs on the Cloudflare Workers free tier.

## Deploy in 4 commands

```bash
cd worker
npm install
npx wrangler login        # one-time, opens browser
npx wrangler deploy
```

The deploy prints a URL like `https://crete-scraper.<your-account>.workers.dev`. Copy it.

Now in the frontend `.env`:

```
VITE_SCRAPER_URL=https://crete-scraper.<your-account>.workers.dev
```

Reload the app. The "Scrape" buttons go live.

## Enable in-app search (optional)

Get a free Brave Search API key at https://api.search.brave.com/. Then:

```bash
npx wrangler secret put BRAVE_API_KEY
# paste your key when prompted
```

No redeploy needed.

## Local dev

```bash
npx wrangler dev
# Worker runs on http://localhost:8787
```

Point the frontend at it temporarily:

```
VITE_SCRAPER_URL=http://localhost:8787
```

## Tighten CORS for production

`wrangler.toml` ships with `ALLOWED_ORIGINS = "*"` for quick setup. Lock this down once your frontend has a real domain:

```toml
[vars]
ALLOWED_ORIGINS = "https://your-app.pages.dev,https://crete.yourdomain.com"
```

Then `npx wrangler deploy`.

## Honest limits

- Instagram blocks unauth scrapers — handles found in `<a href>` tags work, deeper IG scraping does not.
- Google Maps does not return useful HTML to bots — use Brave Search or a paid Maps API.
- JavaScript-rendered pages (React/Vue venue sites) return mostly empty HTML. ~10–20% of venues. Use the "Open in Google" launcher + manual paste for those.
