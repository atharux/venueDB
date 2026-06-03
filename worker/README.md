# Venue Scraper Worker

Shared Cloudflare Worker used by **venue-outreach-db** and **athar-eventplanner**.

## Endpoints

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/scrape` | `{ url }` | Fetch a venue page, extract emails, Instagram handles, phones, addresses, title, description |
| `POST` | `/discover` | `{ city, category, country?, limit? }` | Find venues/businesses via Overpass API (OpenStreetMap) — free, no key |
| `POST` | `/enrich` | `{ url, context? }` | Scrape a URL + LLM extraction of structured contact info (needs `OPENROUTER_API_KEY`) |
| `POST` | `/search` | `{ query }` | Brave Search proxy — needs `BRAVE_API_KEY` |
| `GET` | `/health` | — | Status + capabilities check |

No external npm dependencies. Regex + native `fetch` + Overpass API. Runs on the Cloudflare Workers free tier.

## Deploy

```bash
cd worker
npm install
npx wrangler login        # one-time, opens browser
npx wrangler deploy
```

The deploy prints a URL like `https://venue-scraper.<your-account>.workers.dev`. Use this in both apps:

- venue-outreach-db: `VITE_SCRAPER_URL=https://venue-scraper.<your-account>.workers.dev`
- athar-eventplanner: `VITE_SCRAPER_URL=https://venue-scraper.<your-account>.workers.dev`

## Secrets (all optional)

```bash
# Enables /enrich LLM extraction (free models via OpenRouter)
npx wrangler secret put OPENROUTER_API_KEY

# Enables /search (Brave Search API — 2k free queries/month)
npx wrangler secret put BRAVE_API_KEY
```

No redeploy needed after setting secrets.

Without secrets, `/scrape` and `/discover` still work fully (regex + Overpass = entirely free).

## Discovery categories

`/discover` maps `category` to OpenStreetMap tags:

| Category string | OSM tags queried |
|----------------|-----------------|
| `nightclub` | `amenity=nightclub` |
| `bar`, `bar with djs`, `rooftop bar` | `amenity=bar` |
| `beach club` | `leisure=beach_resort`, `amenity=nightclub`, `tourism=resort` |
| `hotel`, `boutique hotel` | `tourism=hotel` |
| `resort` | `tourism=resort` |
| `restaurant`, `beach restaurant` | `amenity=restaurant` |
| `live music venue`, `music venue` | `amenity=music_venue`, `amenity=arts_centre` |
| `wedding venue`, `festival`, `event space` | `amenity=events_venue` |
| `coworking` | `amenity=coworking_space`, `amenity=conference_centre` |
| `cafe` | `amenity=cafe` |

Example request:
```json
POST /discover
{ "city": "Berlin", "category": "nightclub", "country": "DE", "limit": 20 }
```

## Local dev

```bash
npx wrangler dev
# Worker runs on http://localhost:8787
```

## CORS

`wrangler.toml` ships with `ALLOWED_ORIGINS = "*"` for quick setup. Lock this down once your frontends have real domains:

```toml
[vars]
ALLOWED_ORIGINS = "https://venue-outreach-db.pages.dev,https://athar-eventplanner.pages.dev"
```

## Known limits

- Instagram blocks unauth scrapers from Workers IPs — handles in `<a href>` tags work, deep IG scraping does not.
- JavaScript-rendered sites (React/Vue) return mostly empty HTML — about 10–20% of venues. Manual fallback needed.
- Overpass has rate limits for bursts; the 25s timeout is generous for normal use.
