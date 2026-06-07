#!/usr/bin/env python3
"""
Venue Outreach DB — Region Scraper with Auto-Rotation
======================================================
Scrapes 9 pre-configured regions across Europe + Dubai.

Usage:
  python scripts/scrape_region.py --region berlin
  python scripts/scrape_region.py --region dubai --dry-run
  python scripts/scrape_region.py --region berlin --skip-ra
  python scripts/scrape_region.py --urls https://ra.co/clubs/berghain https://berghain.de --type resident_advisor
  python scripts/scrape_region.py --auto
  python scripts/scrape_region.py --auto --interval-hours 12
  python scripts/scrape_region.py --auto --dry-run

Supabase setup (run once):
  CREATE TABLE IF NOT EXISTS scrape_state (
      region          TEXT PRIMARY KEY,
      last_scraped_at TIMESTAMPTZ,
      last_count      INTEGER DEFAULT 0,
      runs            INTEGER DEFAULT 0
  );
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

_scripts_dir = Path(__file__).resolve().parent
if str(_scripts_dir) not in sys.path:
    sys.path.insert(0, str(_scripts_dir))

from dotenv import load_dotenv

_project_root = _scripts_dir.parent
load_dotenv(_project_root / ".env", override=False)

from scrapers.utils.logger import get_logger
from scrapers.utils.schema import VenueRecord, from_llm_output
from scrapers.utils.supabase_client import _get_client, upsert_many
from scrapers.sources._base import run_smart_scraper

log = get_logger("scrape_region")

# ──────────────────────────────────────────────────────────────
# Region configs
# ──────────────────────────────────────────────────────────────

REGIONS: dict[str, dict] = {
    "berlin": {
        "city": "Berlin",
        "country": "Germany",
        "urls": [
            "https://ra.co/clubs/berghain",
            "https://ra.co/clubs/tresor",
            "https://ra.co/clubs/watergate",
            "https://ra.co/clubs/about-blank",
            "https://ra.co/clubs/sisyphos",
            "https://ra.co/clubs/kraft-werk-berlin",
            "https://ra.co/clubs/ohm-berlin",
            "https://ra.co/clubs/sage-club",
            "https://berghain.de",
            "https://tresorberlin.com",
        ],
    },
    "hamburg": {
        "city": "Hamburg",
        "country": "Germany",
        "urls": [
            "https://ra.co/clubs/golden-pudel-club",
            "https://ra.co/clubs/molotow-hamburg",
            "https://ra.co/clubs/uebel-und-gefahrlich",
            "https://ra.co/clubs/hafenklang",
            "https://uebel.club",
            "https://www.molotowclub.com",
        ],
    },
    "amsterdam": {
        "city": "Amsterdam",
        "country": "Netherlands",
        "urls": [
            "https://ra.co/clubs/shelter-amsterdam",
            "https://ra.co/clubs/melkweg",
            "https://ra.co/clubs/paradiso",
            "https://ra.co/clubs/claire",
            "https://www.melkweg.nl",
            "https://www.paradiso.nl",
            "https://shelter.amsterdam",
        ],
    },
    "london": {
        "city": "London",
        "country": "UK",
        "urls": [
            "https://ra.co/clubs/fabric",
            "https://ra.co/clubs/egg-london",
            "https://ra.co/clubs/fold-london",
            "https://ra.co/clubs/corsica-studios",
            "https://ra.co/clubs/night-tales",
            "https://fabriclondon.com",
            "https://www.egglondon.co.uk",
            "https://www.thefoldlondon.com",
        ],
    },
    "barcelona": {
        "city": "Barcelona",
        "country": "Spain",
        "urls": [
            "https://ra.co/clubs/nitsa",
            "https://ra.co/clubs/razzmatazz",
            "https://ra.co/clubs/sala-apolo",
            "https://ra.co/clubs/city-hall-barcelona",
            "https://www.razzmatazz.es",
            "https://www.sala-apolo.com",
        ],
    },
    "madrid": {
        "city": "Madrid",
        "country": "Spain",
        "urls": [
            "https://ra.co/clubs/mondo-disko",
            "https://ra.co/clubs/theatre-club-madrid",
            "https://ra.co/clubs/kapital-madrid",
            "https://ra.co/clubs/goya-social-club",
            "https://www.teatrokapital.com",
        ],
    },
    "paris": {
        "city": "Paris",
        "country": "France",
        "urls": [
            "https://ra.co/clubs/rex-club",
            "https://ra.co/clubs/concrete",
            "https://ra.co/clubs/wanderlust-paris",
            "https://ra.co/clubs/social-club-paris",
            "https://www.rexclub.com",
            "https://www.concrete-paris.fr",
        ],
    },
    "ibiza": {
        "city": "Ibiza",
        "country": "Spain",
        "urls": [
            "https://www.ushuaiaibiza.com",
            "https://www.hï-ibiza.com",
            "https://www.amnesia.es",
            "https://www.pacha.com",
            "https://ra.co/clubs/dc-10",
            "https://www.privilege-ibiza.com",
        ],
    },
    "dubai": {
        "city": "Dubai",
        "country": "UAE",
        "urls": [
            "https://white-dubai.com",
            "https://www.akadubai.com",
            "https://www.sohogardens.com",
            "https://thedeck.ae",
            "https://guvnordubai.com",
            "https://www.thetribe.ae",
            "https://www.zero-gravity.ae",
        ],
    },
}

# ──────────────────────────────────────────────────────────────
# Extraction prompt (shared across all region URL types)
# ──────────────────────────────────────────────────────────────

EXTRACTION_PROMPT = """
Extract the following information about this venue or festival.
Return ONLY a valid JSON object with these exact keys:
name, category, city, district, website, instagram, facebook, email, phone,
booking_contact, music_type, genre, has_djs, has_events, has_audio, outdoor,
luxury_score, tourist_area, capacity, entity_type, notes, tags.

Rules:
- has_djs, has_events, has_audio, outdoor, tourist_area must be true or false
- luxury_score must be an integer 0–5
- tags must be an array of lowercase strings
- entity_type must be "venue" or "festival"
- If a field cannot be determined, use null
- Do not invent data — only extract what is present on the page
"""


# ──────────────────────────────────────────────────────────────
# Core scrape helpers
# ──────────────────────────────────────────────────────────────

def scrape_url_local(url: str, source_type: str = "venue_website") -> Optional[dict]:
    """Use SmartScraperGraph (OpenAI backend) to extract structured data."""
    return run_smart_scraper(url, EXTRACTION_PROMPT)


def scrape_url_cloud(url: str) -> Optional[dict]:
    """
    Call the Cloudflare Worker scraper endpoint (VITE_SCRAPER_URL) for
    regex-based contact extraction. Returns partial data or None if the
    worker URL is not configured.
    """
    import requests

    worker_url = os.environ.get("VITE_SCRAPER_URL") or os.environ.get("SCRAPER_WORKER_URL")
    if not worker_url:
        return None

    try:
        resp = requests.post(
            f"{worker_url.rstrip('/')}/scrape",
            json={"url": url},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        log.warning("Cloud scraper failed for %s: %s", url, exc)
        return None


def _is_ra_url(url: str) -> bool:
    return "ra.co" in url


def build_record(
    url: str,
    local_data: Optional[dict],
    cloud_data: Optional[dict],
    city: str,
    source_type: str,
    tag: Optional[str],
) -> Optional[VenueRecord]:
    """
    Merge local (LLM) and cloud (Worker) scrape results into a VenueRecord.
    Local data wins for structured fields; cloud data fills contact gaps.
    """
    merged: dict = {}

    if local_data:
        merged.update(local_data)

    # Patch in contact fields from cloud scraper if local left them empty
    if cloud_data:
        for contact_field in ("email", "phone", "instagram"):
            if not merged.get(contact_field):
                cloud_val = None
                if contact_field == "email":
                    emails = cloud_data.get("emails") or []
                    cloud_val = emails[0] if emails else None
                elif contact_field == "phone":
                    phones = cloud_data.get("phones") or []
                    cloud_val = phones[0] if phones else None
                elif contact_field == "instagram":
                    handles = cloud_data.get("instagram_handles") or []
                    cloud_val = handles[0] if handles else None
                if cloud_val:
                    merged[contact_field] = cloud_val

    return from_llm_output(merged, source_url=url, city=city, tag=tag)


def upsert_venues(records: list[VenueRecord], dry_run: bool) -> tuple[int, int, int]:
    """Upsert records to Supabase. Returns (inserted, updated, failed)."""
    if dry_run:
        import json
        for r in records:
            print(json.dumps(r.model_dump(), indent=2, default=str))
        return len(records), 0, 0
    return upsert_many(records)


# ──────────────────────────────────────────────────────────────
# Region runner
# ──────────────────────────────────────────────────────────────

def run_region(
    region_key: str,
    region: dict,
    dry_run: bool = False,
    skip_ra: bool = False,
    source_type: str = "venue_website",
    tag: Optional[str] = None,
    urls_override: Optional[list[str]] = None,
) -> list[VenueRecord]:
    city = region["city"]
    urls = urls_override or region["urls"]
    if skip_ra:
        urls = [u for u in urls if not _is_ra_url(u)]

    log.info("Region: %s (%s) — %d URLs", region_key, city, len(urls))
    records: list[VenueRecord] = []

    for url in urls:
        log.info("  Scraping %s", url)
        detected_type = "resident_advisor" if _is_ra_url(url) else source_type

        try:
            local_data = scrape_url_local(url, detected_type)
        except Exception as exc:
            log.error("  Local scrape error for %s: %s", url, exc)
            local_data = None

        try:
            cloud_data = scrape_url_cloud(url)
        except Exception as exc:
            log.warning("  Cloud scrape error for %s: %s", url, exc)
            cloud_data = None

        if local_data is None and cloud_data is None:
            log.warning("  No data for %s — skipping", url)
            continue

        record = build_record(url, local_data, cloud_data, city, detected_type, tag)
        if record is None:
            log.warning("  No valid record for %s — skipping", url)
            continue

        records.append(record)
        log.info("  ✓ %s — %s", record.name, city)

    inserted, updated, failed = upsert_venues(records, dry_run)
    log.info(
        "Region %s done: %d records, %d inserted, %d updated, %d failed",
        region_key, len(records), inserted, updated, failed,
    )
    return records


# ──────────────────────────────────────────────────────────────
# Auto-rotation: scrape_state table helpers
# ──────────────────────────────────────────────────────────────

def read_scrape_state() -> dict[str, dict]:
    """Read all rows from the scrape_state table. Returns {region: row_dict}."""
    try:
        client = _get_client()
        resp = client.table("scrape_state").select("*").execute()
        return {row["region"]: row for row in (resp.data or [])}
    except Exception as exc:
        log.warning("Could not read scrape_state: %s", exc)
        return {}


def pick_next_region(state: dict[str, dict]) -> str:
    """
    Select the region with the oldest last_scraped_at (or never scraped).
    Null timestamps are treated as infinitely old.
    """
    def staleness_key(region_key: str) -> datetime:
        row = state.get(region_key)
        if not row or not row.get("last_scraped_at"):
            return datetime.min.replace(tzinfo=timezone.utc)
        ts = row["last_scraped_at"]
        if isinstance(ts, str):
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if isinstance(ts, datetime):
            return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
        return datetime.min.replace(tzinfo=timezone.utc)

    return min(REGIONS.keys(), key=staleness_key)


def mark_scraped(region_key: str, count: int, dry_run: bool = False) -> None:
    """Upsert a row in scrape_state for the given region."""
    if dry_run:
        log.info("[dry-run] Would mark %s as scraped (count=%d)", region_key, count)
        return
    try:
        client = _get_client()
        now = datetime.now(tz=timezone.utc).isoformat()
        # Read current runs count
        resp = client.table("scrape_state").select("runs").eq("region", region_key).execute()
        current_runs = (resp.data[0]["runs"] if resp.data else 0) or 0
        client.table("scrape_state").upsert(
            {
                "region": region_key,
                "last_scraped_at": now,
                "last_count": count,
                "runs": current_runs + 1,
            },
            on_conflict="region",
        ).execute()
        log.info("Marked %s as scraped (runs=%d, count=%d)", region_key, current_runs + 1, count)
    except Exception as exc:
        log.error("Failed to update scrape_state for %s: %s", region_key, exc)


# ──────────────────────────────────────────────────────────────
# Auto-rotation loop
# ──────────────────────────────────────────────────────────────

def auto_loop(interval_hours: float, dry_run: bool) -> None:
    """
    Continuously rotate through all regions, sleeping between ticks.
    One full rotation completes every `interval_hours` hours.
    """
    tick_seconds = (interval_hours * 3600) / len(REGIONS)
    log.info(
        "Auto mode: %d regions, %.1fh rotation, %.0fs per tick",
        len(REGIONS), interval_hours, tick_seconds,
    )

    while True:
        state = read_scrape_state()
        region_key = pick_next_region(state)
        region = REGIONS[region_key]

        log.info("── Tick: %s (%s) ──", region_key, region["city"])

        if dry_run:
            log.info("[dry-run] Would scrape region '%s' — skipping writes", region_key)
            mark_scraped(region_key, 0, dry_run=True)
        else:
            try:
                records = run_region(region_key, region, dry_run=False)
                mark_scraped(region_key, len(records))
            except Exception as exc:
                log.error("Region %s crashed: %s — continuing loop", region_key, exc)

        log.info("Sleeping %.0fs until next tick…", tick_seconds)
        time.sleep(tick_seconds)


# ──────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Venue Outreach DB — region scraper with auto-rotation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--region",
        choices=list(REGIONS.keys()),
        help="Scrape a single region",
    )
    mode.add_argument(
        "--auto",
        action="store_true",
        help="Auto-rotate through all regions indefinitely",
    )
    mode.add_argument(
        "--urls",
        nargs="+",
        metavar="URL",
        help="Scrape specific URLs directly (bypasses region config)",
    )

    parser.add_argument(
        "--type",
        dest="source_type",
        default="venue_website",
        choices=["venue_website", "resident_advisor", "festival", "linkedin"],
        help="Source type for --urls mode (default: venue_website)",
    )
    parser.add_argument(
        "--skip-ra",
        action="store_true",
        help="Skip ra.co URLs in the region config",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print JSON only — no Supabase writes",
    )
    parser.add_argument(
        "--tag",
        default=None,
        help="Tag appended to all scraped records",
    )
    parser.add_argument(
        "--interval-hours",
        type=float,
        default=24.0,
        metavar="HOURS",
        help="Total rotation window in hours for --auto mode (default: 24)",
    )

    args = parser.parse_args()

    if args.auto:
        auto_loop(args.interval_hours, args.dry_run)
        return

    if args.urls:
        city = ""
        records: list[VenueRecord] = []
        for url in args.urls:
            try:
                local_data = scrape_url_local(url, args.source_type)
                cloud_data = scrape_url_cloud(url)
                record = build_record(url, local_data, cloud_data, city, args.source_type, args.tag)
                if record:
                    records.append(record)
                else:
                    log.warning("No valid record for %s", url)
            except Exception as exc:
                log.error("Failed %s: %s", url, exc)

        inserted, updated, failed = upsert_venues(records, args.dry_run)
        if not args.dry_run:
            print(f"\n{len(records)} scraped, {inserted} inserted, {updated} updated, {failed} failed")
        return

    region_key = args.region or list(REGIONS.keys())[0]
    region = REGIONS[region_key]
    records = run_region(
        region_key,
        region,
        dry_run=args.dry_run,
        skip_ra=args.skip_ra,
        source_type=args.source_type,
        tag=args.tag,
    )
    if not args.dry_run:
        print(f"\n{len(records)} records processed for region '{region_key}'")


if __name__ == "__main__":
    main()
