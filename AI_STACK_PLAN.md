# AI Stack Implementation Plan
## Flowise · Qdrant · Ollama · Postgres (local-first)

> **Status:** Pre-implementation — architecture defined, not yet deployed.  
> **Goal:** Layer semantic intelligence and local LLM reasoning on top of the existing venue intel system without replacing any current functionality.

---

## 1. Architecture Overview

```
React App (Venue Intel)
        │
        ├── Supabase / localStorage   ← structured CRUD truth (existing)
        │
        ├── Qdrant                    ← semantic vector memory (NEW)
        │        ↑ embeddings generated on venue write
        │
        └── Flowise                   ← AI orchestration layer (NEW)
                 │
                 └── Ollama           ← local LLM runtime (NEW)
```

Each service owns a distinct capability. They do not overlap.

| Service | Owns | Does NOT own |
|---|---|---|
| Supabase / localStorage | Source of truth, auth, sync | Intelligence, search |
| Qdrant | Semantic similarity, vector memory | Business logic, auth |
| Flowise | AI workflow orchestration | Data storage |
| Ollama | LLM inference (local, private) | Routing, storage |

---

## 2. Docker Compose

Save as `docker-compose.yml` in the project root. Run with `docker compose up -d`.

```yaml
version: "3.9"

services:

  flowise:
    image: flowiseai/flowise:latest
    ports:
      - "3000:3000"
    environment:
      - FLOWISE_USERNAME=admin
      - FLOWISE_PASSWORD=admin
    volumes:
      - flowise_data:/root/.flowise

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_USER: postgres
    ports:
      - "5432:5432"

volumes:
  flowise_data:
  qdrant_data:
  ollama_data:
```

### Service URLs (local)
| Service | URL |
|---|---|
| Flowise UI | http://localhost:3000 |
| Qdrant API | http://localhost:6333 |
| Ollama API | http://localhost:11434 |
| Postgres | localhost:5432 |

---

## 3. Recommended Ollama Models

Pull these after `docker compose up`:

```bash
docker exec -it <ollama-container> ollama pull nomic-embed-text   # embeddings
docker exec -it <ollama-container> ollama pull mistral            # reasoning / ranking
docker exec -it <ollama-container> ollama pull phi3               # fast triage / classification
```

| Model | Role | Why |
|---|---|---|
| `nomic-embed-text` | Venue text → vector embedding | Small (274M), fast, good English semantic quality |
| `mistral` | Outreach ranking, venue scoring, NL reasoning | Strong instruction following, fits 8GB VRAM |
| `phi3` | Classification, routing, quick triage | Very fast (~1B params), good for binary yes/no calls |

---

## 4. Data Flow (per venue write)

```
1. User saves a venue (via Quick Add, Import, or scraper)
2. Venue record written to Supabase / localStorage (existing path, unchanged)
3. Venue text assembled: name + category + city + notes + pitch_angle + genre
4. Text sent to Ollama nomic-embed-text → 768-dim vector
5. Vector + venue ID stored in Qdrant collection: "venues"
6. On query: user types NL search → embed query → Qdrant ANN search → top-K IDs
7. IDs looked up in Supabase → full venue records returned
8. Optionally: Flowise flow scores / re-ranks results via Ollama mistral
```

---

## 5. Integration Points with the Current App

### 5a. NL Search Bar (highest value, ship first)
Replace or augment the current keyword search with a semantic query:

```ts
// src/nlSearch.ts (new file)
async function semanticSearch(query: string, topK = 20): Promise<string[]> {
  // 1. Embed the query
  const embedding = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: query }),
  }).then(r => r.json())

  // 2. Search Qdrant
  const results = await fetch('http://localhost:6333/collections/venues/points/search', {
    method: 'POST',
    body: JSON.stringify({ vector: embedding.embedding, limit: topK }),
  }).then(r => r.json())

  return results.result.map((r: { id: string }) => r.id)
}
```

Wire into VenueTable: if the query string can't be matched by substring, fall back to semantic search and highlight the results differently.

### 5b. Auto-classify Improvements (build on current classifier)
The current rule-based `classifyEntityType()` works for clear cases. Flowise + Ollama adds a fallback for ambiguous entries:

```
name: "Sundown by the Dunes"
category: "Event Villa"
→ rule classifier → 'venue' (no festival keyword)
→ Flowise flow → prompt mistral: "Is this a recurring festival or a permanent venue?"
→ mistral: "venue" (no recurring event signals)
```

Only fire the LLM for entries where the rule classifier confidence is low (e.g. category is "Other" and name has no clear signals).

### 5c. Outreach Prioritization (Flowise workflow)
Build a Flowise flow that:
1. Fetches the top-50 venues by luxury_score and has_events
2. Passes them to Ollama mistral with the pitch template
3. Returns a ranked list with one-line reasoning per venue

Trigger: "Rank Crete venues for outreach this week" → Flowise endpoint → ranked table in Discovery panel.

---

## 6. Phased Rollout

### Phase 1 — Infrastructure (1–2 hours)
- [ ] Write `docker-compose.yml` (done above)
- [ ] `docker compose up -d`
- [ ] Pull Ollama models
- [ ] Verify all 4 services healthy

### Phase 2 — Embedding Pipeline (half day)
- [ ] Create Qdrant collection `venues` with 768 dims
- [ ] Write `src/qdrantSync.ts` — on venue save, generate embedding and upsert to Qdrant
- [ ] Backfill: embed all existing venues in one batch
- [ ] Test: confirm a semantic query returns correct IDs

### Phase 3 — NL Search (half day)
- [ ] Add `src/nlSearch.ts`
- [ ] Wire into the search bar in VenueTable with a "semantic" mode toggle
- [ ] Ship behind a `VITE_QDRANT_URL` env var so it's opt-in (offline gracefully)

### Phase 4 — Flowise Flows (1 day)
- [ ] Build the outreach-ranking flow in Flowise UI
- [ ] Build the ambiguous-classify fallback flow
- [ ] Expose both as REST endpoints
- [ ] Wire endpoints into DiscoveryPanel

### Phase 5 — Production hardening
- [ ] Move Ollama + Qdrant to a persistent VPS or Cloudflare worker for the embedding step
- [ ] Add rate limiting and error recovery to the embedding pipeline
- [ ] Evaluate replacing Ollama with OpenRouter for deployed mode (keep Ollama for local)

---

## 7. Key Design Rules

| Rule | Reason |
|---|---|
| Supabase = structured truth | Never store business records in Qdrant. Qdrant holds IDs + vectors only. |
| Qdrant = semantic index | Never query Qdrant for status/category filters — those stay in the DB layer. |
| Flowise = orchestration only | Flowise flows call Qdrant and Ollama; they do not own state. |
| Ollama = local privacy | No venue data leaves the machine. Use OpenRouter only for the embed step if self-hosting Ollama is not viable. |
| Offline-first | Every AI feature must degrade gracefully. If Qdrant/Ollama is unreachable, fall back to the existing keyword search. |

---

## 8. Open Decisions

| Decision | Options | Recommendation |
|---|---|---|
| Embedding model in production | nomic-embed-text (Ollama) vs OpenAI ada-002 vs Cohere | Start with nomic-embed-text local; revisit if quality insufficient |
| Qdrant hosting | Local Docker vs Qdrant Cloud free tier | Local for MVP; Qdrant Cloud if you want multi-device sync |
| Flowise flows storage | Local volume vs Supabase-backed | Local volume for now; export flows as JSON to git |
| LLM for ranking | mistral (local) vs GPT-4o-mini (OpenRouter) | mistral local is free and sufficient for ranking; upgrade if reasoning quality is too low |

---

*Last updated: 2026-05-22 — pre-implementation. Update this doc when Phase 1 completes.*
