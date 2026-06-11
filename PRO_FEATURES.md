# Venue Intelligence — Pro Features Brief

**Status:** POC → Paid  
**Client:** Hydrat3  
**Current tier:** Starter (free, localStorage)  
**Proposed Pro tier:** €49/mo · 3 users · Supabase-backed

---

## Why this exists

The Starter tier proves the scraper works. The Pro tier turns the database into an active sales tool — tracking who said what, when to follow up, and which outreach approach actually converts.

---

## Feature 1 — Contact History

**User story:** As an outreach manager, I want to see every email, call, and reply for a venue in one timeline so I never repeat myself or miss a warm lead.

**What it does:**
- Per-venue activity log: email sent, call attempt, reply received, note added
- Timestamps + contact name attached to each entry
- Reply entries are visually highlighted — the most valuable signal

**Done when:**
- Selecting a venue shows its full activity timeline
- Adding an action (mark contacted, copy message) creates a new entry automatically
- Manual note entry is available

**Value:** A replied venue that gets followed up is 3× more likely to convert. Without history, that reply is invisible after a week.

---

## Feature 2 — Follow-up Queue

**User story:** As an outreach manager, I want to set a reminder on any venue so it resurfaces in my queue at the right time without me having to remember.

**What it does:**
- Per-venue: set a follow-up date + optional note
- Daily queue view: overdue / due today / due this week
- Queue surfaces on the Dashboard as an action item

**Done when:**
- Any venue can have a follow-up date set from the outreach panel
- Dashboard shows live queue counts (overdue / today / week)
- Overdue items surface as a banner or highlight

**Value:** The biggest failure mode in venue outreach is going cold on warm leads. A queue prevents this structurally.

---

## Feature 3 — Instantly.ai Sync

**User story:** As a campaign operator, I want to push a venue directly into an Instantly.ai email sequence without exporting a CSV.

**What it does:**
- Connect Instantly.ai API key in settings
- List active campaigns with live stats (contacts, sent, reply rate)
- One-click: push selected venue into chosen campaign

**Done when:**
- Instantly.ai campaigns load from API
- Pushing a venue creates a new contact in the campaign
- Confirmation shown inline

**Value:** Removes the CSV export → manual import loop that currently breaks the outreach workflow.

---

## Feature 4 — Pipeline View

**User story:** As a team lead, I want to see all venues by deal stage in a kanban so I can spot stalled leads at a glance.

**What it does:**
- Kanban columns: Prospecting / Contacted / Replied / Meeting / Won / Lost
- Venue cards show name, city, last activity
- Click card to open venue detail
- Drag card to advance stage (or use status pills — same underlying field)

**Done when:**
- Dashboard Pipeline tab shows all venues by `status` field in kanban layout
- Dragging a card updates `status` via the same `update()` hook
- Column counts match the existing "By status" bar chart

**Note:** The `status` field already exists on every venue. This is a view change, not a data change.

---

## Feature 5 — Campaign Builder

**User story:** As an outreach manager, I want to filter venues by region and category, pick a template, and send bulk outreach to all matches in one action.

**What it does:**
- Multi-select filters: region, city, category, status
- Live venue count as filters are applied
- Template picker with preview snippet
- Expected reply estimate based on historical template performance
- Review screen before launch → pushes to Instantly.ai or generates CSV

**Done when:**
- Filtering shows live match count
- Launch creates an Instantly.ai campaign (or exports filtered CSV as fallback)
- Each launched campaign is logged with date, filter set, and template used

**Value:** Replaces manual "filter → export → import" with a guided 4-step flow.

---

## Feature 6 — Template Library

**User story:** As an outreach manager, I want to save and compare templates so I know which approach gets the best reply rate and can iterate on it.

**What it does:**
- Named templates with body text and subject line
- Per-template stats: sent count, open rate, reply rate
- Reply rate shown as a bar for quick comparison
- Create, edit, duplicate, archive templates

**Done when:**
- Templates are stored in Supabase (shared across users)
- Every time a template is used for outreach, usage is recorded
- Dashboard shows template performance table

**Note:** The existing `TEMPLATES` array in `outreach.ts` is the seed data for this feature — it becomes editable rather than hardcoded.

---

## Build sequence

| # | Feature | Complexity | Dependency |
|---|---------|-----------|-----------|
| 1 | Contact History | Medium | Needs `activity` Supabase table |
| 2 | Follow-up Queue | Low | Needs `follow_ups` table or `follow_up_date` column on venues |
| 3 | Instantly.ai Sync | Medium | Needs Instantly.ai API key in settings |
| 4 | Pipeline View | Low | No new data — view-only change |
| 5 | Template Library | High | Needs `templates` + `template_usage` tables |
| 6 | Campaign Builder | High | Depends on Template Library + Instantly.ai Sync |

**Recommended order:** 4 → 2 → 1 → 3 → 5 → 6

Pipeline View ships fastest (no schema changes) and gives the client an immediate visible upgrade. Follow-up Queue adds the retention mechanism. Contact History completes the CRM core. Instantly.ai + campaigns are the monetisation multiplier.

---

## Schema additions required (Pro tier)

```sql
-- Activity log (Contact History)
create table activity (
  id         text primary key default gen_random_uuid()::text,
  venue_id   text not null references venues(id) on delete cascade,
  type       text not null, -- 'email' | 'call' | 'reply' | 'note' | 'status_change'
  body       text,
  contact    text,
  created_at timestamptz not null default now()
);

-- Follow-up queue
alter table venues add column follow_up_date date;
alter table venues add column follow_up_note text;

-- Template library
create table templates (
  id         text primary key default gen_random_uuid()::text,
  name       text not null,
  subject    text,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table template_usage (
  id          text primary key default gen_random_uuid()::text,
  template_id text not null references templates(id) on delete cascade,
  venue_id    text references venues(id) on delete set null,
  outcome     text, -- 'sent' | 'replied' | 'bounced'
  created_at  timestamptz not null default now()
);
```

---

*Last updated: 2026-06-10 · Author: atharux*
