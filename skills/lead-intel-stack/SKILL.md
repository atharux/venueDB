---
name: lead-intel-stack
description: Build a vertical-specific lead/CRM/outreach database app with a built-in public-contact-data scraper and bulk enrichment. Use this skill whenever the user wants to build a CRM for a niche (e.g. "venues", "clinics", "vendors", "agencies", "contractors", "wedding planners", "festivals"), ingest a spreadsheet of leads and find their websites/emails/Instagram/Facebook/phones, build a venue/business outreach database, scrape contact info from a list of URLs, enrich existing rows with missing channels, or ship a small CRUD app that runs locally first and upgrades to Supabase + Cloudflare Pages later. Trigger even when the user does not say "skill", "scraper", or "CRM" by name — phrases like "I have a list of 500 companies, find their socials", "build a tool to track [type of business]", "make an outreach dashboard for my client", "scrape emails from these sites", or "enrich my leads" all call for this skill.
---

# Lead Intel Stack

A complete, opinionated architecture for shipping a niche-vertical lead-intelligence app **today**, with a clear upgrade path from local-only to cloud-hosted production.

This skill captures a proven, vertical-agnostic pattern: a typed domain database, dual-mode storage (browser + Postgres) with automatic fallback, a server-side scraper for extracting public contact data, a bulk-enrichment loop, and a small React UI shell. The same blueprint produces a Crete nightlife CRM, a dental-clinic outreach DB, a contractor-discovery tool, or any other "list-of-businesses-with-contacts" product.

The intent is **fast first deploy, honest data, no fabrication**. Every recommendation here is something I've shipped end-to-end — not theoretical.

---

## When to use this skill

Trigger this skill when the user is building anything that fits the shape: **"a structured database of businesses + ways to enrich each row with public contact data + outreach workflow."** Common phrasings:

- "Build me a CRM for [vertical]"
- "I have a spreadsheet of 500 leads, find their emails / Instagram / website"
- "Make an outreach dashboard"
- "Scrape contact info from a list of URLs"
- "Enrich my leads with public data"
- "Track [type-of-business] in [region], with their contact info"

Do **not** use this skill for:
- General Anthropic-style SaaS apps unrelated to lead tracking
- Apps that require authentication for end users (this skill ships permissive RLS for fast solo use; bolt on auth separately)
- Apps that need real-time collaboration (Supabase Realtime is out of scope; add it after MVP)
- Hard-data-quality workflows that require manual verification before any scrape (you'd want a human-in-the-loop queue, not autoenrich)

---

## The shape of a shipped app

Every app produced from this skill has the same shape. Hold this picture in your head — every later instruction maps to one of these pieces.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    React + Vite + TypeScript                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │ Dashboard  │  │   Table    │  │  Detail    │  │ Discovery  │    │
│  │ (charts +  │  │ (filter +  │  │ (dossier + │  │ (search +  │    │
│  │  drill in) │  │  pin cols) │  │  outreach) │  │  bulk add) │    │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │
│        │              │                │                │           │
│        └──────────────┴────────────────┴────────────────┘           │
│                              │                                       │
│                  useEntities() React hook                            │
│                              │                                       │
│                   Storage adapter (auto)                             │
│                  ┌───────────┴───────────┐                           │
│                  │                       │                           │
│         localStorage                 Supabase                        │
│         (default)                  (when env set)                    │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │  POST /api/{scrape,search,enrich,health}
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│               scraper-core.ts  (shared logic)                        │
│   scrapeTarget(url) | searchWeb(q) | enrichLead(input)               │
└──────────────────────────────────────────────────────────────────────┘
        │                       │                       │
        │ runs in 3 places →   │                       │
        ▼                       ▼                       ▼
  Vite middleware       local-api-server.mjs    Cloudflare Pages Function
  (npm run dev)         (npm run local-api)     (production, /functions/api/)
```

Three storage modes (auto-detected). Three scraper runtimes (same `/api/*` paths, picked up automatically). One frontend that does not know or care which.

This means the user gets **a working app in 30 seconds** (localStorage + Vite middleware) and the **same app deployed publicly** with zero code changes once they paste two env vars.

---

## Workflow

Follow this order. Each step builds on the previous one and gives the user something demonstrable.

### Step 1 — Scope and naming

Before touching files, get three answers:
1. **Vertical.** "Crete nightlife venues", "boutique dental clinics in Brooklyn", "indie wedding planners". Be specific. The vertical drives the seed `CITIES`, `CATEGORIES`, and `TAGS` lists in the data model.
2. **Primary contact channels.** Almost always: website, email, phone, Instagram. Often: Facebook, LinkedIn, WhatsApp. Sometimes vertical-specific: Resident Advisor for music venues, Yelp for restaurants, Google Maps Place ID for everything. The data model has these as first-class fields.
3. **One-line value prop.** "Find every beach club in Crete with a DJ programme and a public email." This becomes the README header and the dashboard subtitle.

If any of these are vague, **ask the user before scaffolding**. Wrong vertical = wrong seed data = wasted hour.

### Step 2 — Scaffold the data model

Copy `assets/schema.sql` and `assets/types.ts` into the new project. Adjust three constants in `types.ts`:
- `CITIES` — the geographies/markets that matter for this vertical
- `CATEGORIES` — operational types (e.g. "Beach Club", "Dental Practice", "Wedding Planner")
- `TAGS` — fine-grained operational signals (e.g. "DJ_PROGRAMME", "PEDIATRIC", "OUTDOOR")

Do **not** rename fields. The `name / city / category / website / instagram / facebook / email / phone / status / tags / custom_fields / created_at / updated_at` shape is what every downstream component expects. Add new optional fields if needed (e.g. `linkedin?: string`) but keep the existing ones.

See `references/data-model.md` for the full schema, the dedup function (`name + city` key, score-based merge), and the `custom_fields` JSON column that absorbs whatever extra columns the user's CSV has.

### Step 3 — Drop in the storage adapter

Copy `assets/storage.ts` and `assets/useEntities.ts`. These give:
- localStorage mode by default (fast first run, no setup, persists across reloads)
- Supabase mode when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are present in `.env`
- Automatic fallback to localStorage if Supabase is unreachable
- A `storageMode: 'supabase' | 'localStorage'` flag the UI displays as a badge

See `references/storage-adapter.md` for the dedup story, the seed-version migration trick, and the Supabase schema-drift fallback (the `custom_fields` retry).

### Step 4 — Drop in the scraper

Copy `assets/scraper-core.ts` to the project root and `assets/pages-function.example.ts` to `functions/api/scrape.ts` (also `search.ts`, `enrich.ts`, `health.ts` — same pattern). Add the Vite middleware block from `references/scraper.md` to `vite.config.ts` so `/api/*` works in dev too.

This gives the user **the same `/api/*` paths working in three runtimes**:
- `npm run dev` → Vite middleware calls `scraper-core` in-process
- `npm run local-api` → standalone Node server (useful if the frontend is served as a static build)
- Cloudflare Pages production → Pages Functions automatically pick up `functions/api/*` and run them on the Workers runtime

See `references/scraper.md` for the full three-runtime architecture and `references/deployment.md` for the Cloudflare Pages walkthrough.

### Step 5 — Wire the UI

The React UI is opinionated. Copy the four component files from `assets/components/` and the `App.tsx` shell. They expect the data model, hook, and scraper from steps 2–4 to be in place. Customize only the brand block at the top of `App.tsx` (name, tagline, accent color).

The UI gives you, out of the box:
- **Dashboard**: counts + bar charts by city/category/status. Each bar is a button — clicking it filters the table.
- **Table**: search + multi-filter + sortable columns + togglable contact columns (Website/Instagram/Facebook/Email/Phone) + drag-to-reorder column pinning + CSV custom_fields columns.
- **Detail**: per-row dossier with editable fields, "Open" links to website/IG/FB, copy-paste outreach templates, status pills.
- **Discovery**: spreadsheet upload (.xlsx via `read-excel-file`, .csv via built-in parser) + paste-URL scraping + Quick Add form + bulk enrichment.

### Step 6 — Bulk enrichment

The dashboard ships with an "Enrich missing contacts" panel that:
- Counts rows missing at least one channel
- Runs `enrichLead()` sequentially with live progress + per-row log
- Only patches fields that were **empty** — never overwrites user-entered data
- Is cancellable mid-run

See `references/enrichment.md` for the never-fabricate rule, the order of evidence (existing field > scraped website > AI-selected from search results), and the rate-limit-respecting loop.

### Step 7 — Deploy

When the user is ready for a public demo:
1. Push to GitHub
2. Cloudflare Pages → connect repo → build command `npm run build`, output `dist`
3. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in Pages env vars
4. Run `supabase/migrations/0001_*.sql` in the Supabase SQL editor

The `functions/api/*` files deploy automatically as Pages Functions on the same domain. No separate Worker, no CORS to configure, no `VITE_SCRAPER_URL` to set in production.

See `references/deployment.md` for the full step-by-step plus the auth-tightening checklist (the default RLS is permissive for solo use — tighten before sharing publicly).

---

## Hard rules

These are non-negotiable. Every app produced by this skill must honor them.

### Never fabricate contact data
Email, phone, Instagram handle, Facebook page — if the scraper / AI / search returns nothing for a field, leave it empty. Never guess `info@<domain>`. Never invent an IG handle from the business name. The whole point of public-data enrichment is that it's verifiable; fabricated contacts destroy that trust the first time a user emails a wrong address.

The `scraper-core.ts` template enforces this: each extractor returns an array of literally-observed strings, and `enrichLead()` only patches fields that the source page actually provided.

### Preserve user edits
Bulk enrichment and re-imports must never overwrite a field the user has manually filled in. Use `existing.field ?? incoming.field` everywhere. The user invested time in those edits; the scraper found things on a page that the user may already have considered and rejected. The user's data wins.

The exception: re-import explicitly overwrites `city` and `category` because those are deterministic columns from the source spreadsheet — that's by design, but flag it in the import summary.

### Three storage modes, same data shape
A row written in localStorage must round-trip cleanly through Supabase and back. This means:
- All field types map to Postgres types in `schema.sql` (no Date objects — use ISO strings everywhere)
- The `custom_fields` JSON column accepts anything; the Supabase upsert path has a fallback for the case where the user hasn't run the migration that adds the `custom_fields` column yet (graceful degradation)
- The dedup function uses a stable key (`name + city`, both trimmed + lowercased) so dedup behavior is identical across modes

### Three scraper runtimes, same paths
The frontend always calls `/api/scrape`, `/api/search`, `/api/enrich`, `/api/health`. It never knows which runtime is serving them. This means:
- `scraper-core.ts` uses only Web-standard APIs (`fetch`, `URL`, `TextDecoder`, regex). No Node-only APIs.
- The Vite middleware, the local-api-server, and the Pages Function are all thin wrappers around `scraper-core` — no duplicated extraction logic
- The scraper status badge in the UI polls `/api/health` and turns green automatically when ANY runtime is live

### Honest about what scraping can and cannot do
The shipped scraper handles 70–80% of venue/business websites cleanly. The remaining 20–30% are JavaScript-rendered single-page apps that return empty HTML to bots, or are behind aggressive anti-bot (Cloudflare/Akamai). The scraper logs these as misses, not silent failures. Tell the user this upfront — over-promising "works on every site" loses trust faster than under-promising and over-delivering.

For Instagram and Google Maps specifically: **don't promise scraping**. Instagram blocks unauth scrapers above trivial volume; Maps requires a paid SERP API. Surface IG handles only when they're already in `<a href>` tags on a venue's own website. For Maps, use the external launcher buttons (open Google Maps in a new tab) rather than promising server-side fetching.

---

## What to read next

If your task involves any of the following, read the corresponding reference file:

| If the user asks about / you're working on | Read |
|---|---|
| Schema fields, types, tags, dedup, custom_fields | `references/data-model.md` |
| localStorage ↔ Supabase, migration, seed versioning, RLS | `references/storage-adapter.md` |
| `/api/*` routes, scraper-core internals, the 3-runtime story | `references/scraper.md` |
| Bulk enrich loop, fabrication-prevention, AI selection (OpenRouter) | `references/enrichment.md` |
| Cloudflare Pages, Pages Functions, Supabase setup, env vars, RLS tightening | `references/deployment.md` |

If your task is to **scaffold a new app from scratch**, read the references for steps 2–5 in order, copy the asset files into the new project, customize the three constants in `types.ts`, and run `npm install`. The user will have a working localStorage app in under five minutes.

If your task is to **add a feature to an existing app built from this skill**, identify which slice it lands in (data model / storage / scraper / UI) and follow the existing pattern in that file. Do not introduce new patterns — consistency across these apps is itself a feature.

---

## Honest limitations

This skill is opinionated. Things it does not give you:

- **End-user auth**. The default Supabase RLS is permissive for solo use. Multi-user auth (Supabase Auth + per-user RLS) is a separate ~2 hour bolt-on; see `references/deployment.md` for the policy template but the wiring is on you.
- **Realtime collaboration**. Two users editing the same row simultaneously will last-write-wins. Supabase Realtime can be added later but is out of scope.
- **Scheduled bulk discovery**. A GitHub Action that runs nightly to discover new venues exists as scaffolding only; tuning per-vertical search queries takes iteration over days.
- **Paid scraping**. Instagram, Google Maps, LinkedIn at scale all need paid proxies (Bright Data, ScraperAPI, SerpAPI). The free path covers direct website scraping cleanly and that's usually 80% of the value.
- **Outreach automation**. The skill ships outreach **templates** and "Open in IG / email / WhatsApp" buttons. It does not send messages. Auto-sending lives in a separate skill (and probably a different account from the user's primary).

If the user needs any of these, tell them honestly that this skill is the chassis and these are aftermarket parts.
