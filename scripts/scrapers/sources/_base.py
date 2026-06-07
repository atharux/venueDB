from __future__ import annotations

import os
from typing import Any, Optional

from ..utils.logger import get_logger

log = get_logger("source._base")


def _build_graph_config() -> dict:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set")
    # scrapegraphai splits "openai/gpt-4o-mini" → provider=openai, model=gpt-4o-mini.
    # base_url redirects the OpenAI client to OpenRouter's compatible endpoint.
    model = os.environ.get("SCRAPER_MODEL", "openai/gpt-4o-mini")
    return {
        "llm": {
            "api_key": api_key,
            "model": model,
            "base_url": "https://openrouter.ai/api/v1",
        },
        "verbose": False,
        "headless": True,
    }


def run_smart_scraper(url: str, prompt: str) -> Optional[dict]:
    """
    Run ScrapeGraphAI SmartScraperGraph against `url` with `prompt`.
    Returns the parsed dict output or None on failure.
    """
    try:
        from scrapegraphai.graphs import SmartScraperGraph
    except ImportError as exc:
        raise ImportError(
            "scrapegraphai is not installed. Run: pip install -r scripts/requirements.txt"
        ) from exc

    config = _build_graph_config()
    try:
        scraper = SmartScraperGraph(
            prompt=prompt.strip(),
            source=url,
            config=config,
        )
        result = scraper.run()
    except Exception as exc:
        log.error("SmartScraperGraph failed for %s: %s", url, exc)
        return None

    if not isinstance(result, dict):
        log.warning("SmartScraperGraph returned non-dict for %s: %r", url, result)
        return None

    return result
