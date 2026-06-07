from __future__ import annotations

from typing import Optional

from ..utils.logger import get_logger
from ..utils.schema import VenueRecord, from_llm_output
from ._base import run_smart_scraper

log = get_logger("source.resident_advisor")

PROMPT = """
Extract the following information about this club or venue from Resident Advisor (ra.co).
Return ONLY a valid JSON object with these exact keys:
name, category, city, district, website, instagram, facebook, email, phone,
booking_contact, music_type, genre, has_djs, has_events, has_audio, outdoor,
luxury_score, tourist_area, capacity, entity_type, notes, tags.

Additional context for Resident Advisor pages:
- The page title and header usually contain the venue name
- City is listed on the profile page
- Genre tags are usually listed below the venue name
- If the page shows upcoming events, set has_events=true
- RA venue profiles almost always book DJs — set has_djs=true unless clearly otherwise
- Set entity_type="festival" only if this is clearly a festival, otherwise "venue"
- Extract any linked external website or social handles from the profile

Rules:
- has_djs, has_events, has_audio, outdoor, tourist_area must be true or false
- luxury_score must be an integer 0–5
- tags must be an array of lowercase strings
- entity_type must be "venue" or "festival"
- If a field cannot be determined, use null
- Do not invent data — only extract what is present on the page
"""


def scrape(url: str, tag: Optional[str] = None, city: str = "") -> Optional[VenueRecord]:
    log.info("Scraping Resident Advisor: %s", url)
    raw = run_smart_scraper(url, PROMPT)
    if raw is None:
        log.warning("No output from SmartScraperGraph for %s", url)
        return None

    # RA venues always book DJs — apply default if LLM left it null
    if raw.get("has_djs") is None:
        raw["has_djs"] = True

    record = from_llm_output(raw, source_url=url, city=city, tag=tag)
    if record is None:
        log.warning("Missing name in output for %s — skipping", url)
        return None

    return record
