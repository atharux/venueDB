from __future__ import annotations

from typing import Optional

from ..utils.logger import get_logger
from ..utils.schema import VenueRecord, from_llm_output
from ._base import run_smart_scraper

log = get_logger("source.linkedin")

PROMPT = """
Extract the following information about this company or venue from LinkedIn or a contact page.
Return ONLY a valid JSON object with these exact keys:
name, category, city, district, website, instagram, facebook, email, phone,
booking_contact, music_type, genre, has_djs, has_events, has_audio, outdoor,
luxury_score, tourist_area, capacity, entity_type, notes, tags,
decision_maker_name, decision_maker_title, linkedin_url.

Additional context for LinkedIn / contact pages:
- booking_contact should be the name of the most senior relevant person (Booking Manager, Events Director, etc.)
- decision_maker_name: full name of the primary decision-maker found
- decision_maker_title: their exact job title
- linkedin_url: the full LinkedIn URL of the company or person profile
- Look for email addresses in the About section or contact info
- Use city from the company location field
- Set entity_type based on whether it's a venue, club, or festival brand

Rules:
- has_djs, has_events, has_audio, outdoor, tourist_area must be true or false
- luxury_score must be an integer 0–5
- tags must be an array of lowercase strings
- entity_type must be "venue" or "festival"
- If a field cannot be determined, use null
- Do not invent data — only extract what is present on the page
"""


def scrape(url: str, tag: Optional[str] = None, city: str = "") -> Optional[VenueRecord]:
    log.info("Scraping LinkedIn / contact page: %s", url)
    raw = run_smart_scraper(url, PROMPT)
    if raw is None:
        log.warning("No output from SmartScraperGraph for %s", url)
        return None

    # Lift LinkedIn-specific fields into custom_fields
    custom: dict = {}
    dm_name = raw.pop("decision_maker_name", None)
    dm_title = raw.pop("decision_maker_title", None)
    li_url = raw.pop("linkedin_url", None)

    if dm_title:
        custom["decision_maker_title"] = dm_title
    if li_url:
        custom["linkedin_url"] = li_url
    if dm_name and not raw.get("booking_contact"):
        raw["booking_contact"] = dm_name

    if custom:
        existing = raw.get("custom_fields") or {}
        if isinstance(existing, dict):
            custom.update(existing)
        raw["custom_fields"] = custom

    record = from_llm_output(raw, source_url=url, city=city, tag=tag)
    if record is None:
        log.warning("Missing name in output for %s — skipping", url)
        return None

    return record
