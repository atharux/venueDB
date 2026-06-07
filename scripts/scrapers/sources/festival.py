from __future__ import annotations

from typing import Optional

from ..utils.logger import get_logger
from ..utils.schema import VenueRecord, from_llm_output
from ._base import run_smart_scraper

log = get_logger("source.festival")

PROMPT = """
Extract the following information about this music festival.
Return ONLY a valid JSON object with these exact keys:
name, category, city, district, website, instagram, facebook, email, phone,
booking_contact, music_type, genre, has_djs, has_events, has_audio, outdoor,
luxury_score, tourist_area, capacity, entity_type, notes, tags.

Additional context for festival pages:
- Set entity_type="festival"
- Set category="festival"
- Set has_events=true (festivals always have events)
- Set has_djs=true if DJs or electronic music are featured
- Set outdoor=true for outdoor or multi-stage festivals unless clearly indoors
- Put festival dates, edition info, and location details in notes
- Capacity is often stated as attendance numbers — use that
- Booking/artist contact may be labelled "artist bookings", "artist submissions", or "talent"
- Look for a dedicated booking email separate from press/media contact

Rules:
- has_djs, has_events, has_audio, outdoor, tourist_area must be true or false
- luxury_score must be an integer 0–5
- tags must be an array of lowercase strings
- entity_type must be "venue" or "festival"
- If a field cannot be determined, use null
- Do not invent data — only extract what is present on the page
"""


def scrape(url: str, tag: Optional[str] = None, city: str = "") -> Optional[VenueRecord]:
    log.info("Scraping festival site: %s", url)
    raw = run_smart_scraper(url, PROMPT)
    if raw is None:
        log.warning("No output from SmartScraperGraph for %s", url)
        return None

    # Enforce festival defaults if LLM left them null
    raw.setdefault("entity_type", "festival")
    raw.setdefault("category", "festival")
    if raw.get("has_events") is None:
        raw["has_events"] = True

    record = from_llm_output(raw, source_url=url, city=city, tag=tag)
    if record is None:
        log.warning("Missing name in output for %s — skipping", url)
        return None

    return record
