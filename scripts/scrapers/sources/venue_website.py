from __future__ import annotations

import os
from typing import Optional

from ..utils.logger import get_logger
from ..utils.schema import VenueRecord, from_llm_output
from ._base import run_smart_scraper

log = get_logger("source.venue_website")

PROMPT = """
Extract the following information about this venue or festival.
Return ONLY a valid JSON object with these exact keys:
name, category, city, district, website, instagram, facebook, email, phone,
booking_contact, music_type, genre, has_djs, has_events, has_audio, outdoor,
luxury_score, tourist_area, capacity, entity_type, notes, tags.

Additional context for venue websites:
- Look for booking/contact emails specifically (booking@, info@, management@)
- Check About/About Us sections for music genres and history
- Look for sound system mentions to set has_audio=true
- Infer outdoor=true from terrace, rooftop, open-air, garden mentions
- Infer luxury_score from language: exclusive, bottle service, premium → 4-5; standard club → 2-3; underground/DIY → 0-1
- Infer has_djs=true if DJ bookings or lineups are mentioned

Rules:
- has_djs, has_events, has_audio, outdoor, tourist_area must be true or false
- luxury_score must be an integer 0–5
- tags must be an array of lowercase strings
- entity_type must be "venue" or "festival"
- If a field cannot be determined, use null
- Do not invent data — only extract what is present on the page
"""


def scrape(url: str, tag: Optional[str] = None, city: str = "") -> Optional[VenueRecord]:
    log.info("Scraping venue website: %s", url)
    raw = run_smart_scraper(url, PROMPT)
    if raw is None:
        log.warning("No output from SmartScraperGraph for %s", url)
        return None

    record = from_llm_output(raw, source_url=url, city=city, tag=tag)
    if record is None:
        log.warning("Missing name in output for %s — skipping", url)
        return None

    return record
