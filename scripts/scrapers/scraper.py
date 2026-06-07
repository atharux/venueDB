#!/usr/bin/env python3
"""
Venue Outreach DB — ScrapeGraphAI CLI
======================================
Usage examples:
  python scripts/scrapers/scraper.py --url https://berghain.de --dry-run
  python scripts/scrapers/scraper.py --url https://ra.co/clubs/berghain --source resident_advisor
  python scripts/scrapers/scraper.py --batch urls.txt --source venue_website
  python scripts/scrapers/scraper.py --batch urls.txt --source festival --tag "dubai-2025"
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Allow running as `python scripts/scrapers/scraper.py` from project root
_scripts_dir = Path(__file__).resolve().parent.parent
if str(_scripts_dir) not in sys.path:
    sys.path.insert(0, str(_scripts_dir))

from dotenv import load_dotenv

# Load .env from project root (two levels up from scripts/scrapers/)
_project_root = _scripts_dir.parent
load_dotenv(_project_root / ".env", override=False)

from scrapers.utils.logger import get_logger
from scrapers.utils.supabase_client import upsert_venue

log = get_logger("scraper.cli")

SOURCE_MODULES = {
    "venue_website": "scrapers.sources.venue_website",
    "resident_advisor": "scrapers.sources.resident_advisor",
    "festival": "scrapers.sources.festival",
    "linkedin": "scrapers.sources.linkedin",
}


def _load_source(source: str):
    import importlib
    module_path = SOURCE_MODULES.get(source)
    if not module_path:
        raise ValueError(f"Unknown source '{source}'. Valid: {', '.join(SOURCE_MODULES)}")
    return importlib.import_module(module_path)


def _detect_source(url: str) -> str:
    """Best-guess source type from URL when --source is omitted."""
    if "ra.co" in url:
        return "resident_advisor"
    if "linkedin.com" in url:
        return "linkedin"
    return "venue_website"


def scrape_url(url: str, source: str, tag: str | None, dry_run: bool) -> bool:
    """Scrape a single URL. Returns True if a record was produced."""
    mod = _load_source(source)
    try:
        record = mod.scrape(url, tag=tag)
    except Exception as exc:
        log.error("Scrape failed for %s: %s", url, exc)
        return False

    if record is None:
        log.warning("No record produced for %s", url)
        return False

    if dry_run:
        print(json.dumps(record.model_dump(), indent=2, default=str))
        return True

    try:
        was_new, rid = upsert_venue(record)
        status = "inserted" if was_new else "updated"
        log.info("%s → %s (%s)", url, status, rid)
    except Exception as exc:
        log.error("Supabase upsert failed for %s: %s", url, exc)
        return False

    return True


def run_batch(batch_file: str, source: str, tag: str | None, dry_run: bool) -> None:
    urls = [
        line.strip()
        for line in Path(batch_file).read_text().splitlines()
        if line.strip() and not line.startswith("#")
    ]

    if not urls:
        log.warning("No URLs found in %s", batch_file)
        return

    scraped = inserted = failed = 0
    for url in urls:
        log.info("Processing [%d/%d] %s", scraped + 1, len(urls), url)
        ok = scrape_url(url, source, tag, dry_run)
        scraped += 1
        if ok:
            inserted += 1
        else:
            failed += 1

    print(f"\n── Batch complete ──────────────────────────")
    print(f"  Processed : {scraped}")
    print(f"  Succeeded : {inserted}")
    print(f"  Failed    : {failed}")
    print(f"────────────────────────────────────────────")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Venue Outreach DB — ScrapeGraphAI scraper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--url", help="Single URL to scrape")
    group.add_argument("--batch", metavar="FILE", help="Path to .txt file with one URL per line")

    parser.add_argument(
        "--source",
        choices=list(SOURCE_MODULES.keys()),
        default=None,
        help="Source type (auto-detected from URL if omitted)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print JSON only, do not write to Supabase")
    parser.add_argument("--tag", default=None, help="Tag string appended to all scraped records")

    args = parser.parse_args()

    source = args.source
    if args.url and not source:
        source = _detect_source(args.url)
        log.info("Auto-detected source: %s", source)

    if args.url:
        ok = scrape_url(args.url, source or "venue_website", args.tag, args.dry_run)
        sys.exit(0 if ok else 1)
    else:
        if not source:
            parser.error("--source is required with --batch")
        run_batch(args.batch, source, args.tag, args.dry_run)


if __name__ == "__main__":
    main()
