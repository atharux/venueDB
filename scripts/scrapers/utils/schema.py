from __future__ import annotations

from typing import Any, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator, model_validator


class VenueRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    category: str = "nightclub"
    city: str = ""
    district: Optional[str] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    facebook: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    booking_contact: Optional[str] = None
    music_type: Optional[str] = None
    genre: Optional[str] = None
    has_djs: bool = False
    has_events: bool = False
    has_audio: bool = False
    outdoor: bool = False
    luxury_score: int = 0
    tourist_area: bool = False
    capacity: Optional[str] = None
    entity_type: str = "venue"
    source: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    status: str = "new"
    custom_fields: dict = Field(default_factory=dict)

    @field_validator("luxury_score", mode="before")
    @classmethod
    def clamp_luxury_score(cls, v: Any) -> int:
        try:
            score = int(v) if v is not None else 0
        except (TypeError, ValueError):
            return 0
        return max(0, min(5, score))

    @field_validator("has_djs", "has_events", "has_audio", "outdoor", "tourist_area", mode="before")
    @classmethod
    def coerce_bool(cls, v: Any) -> bool:
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.lower() in ("true", "yes", "1")
        if isinstance(v, int):
            return bool(v)
        return False

    @field_validator("entity_type", mode="before")
    @classmethod
    def validate_entity_type(cls, v: Any) -> str:
        if isinstance(v, str) and v.lower() in ("venue", "festival"):
            return v.lower()
        return "venue"

    @field_validator("tags", mode="before")
    @classmethod
    def coerce_tags(cls, v: Any) -> List[str]:
        if v is None:
            return []
        if isinstance(v, list):
            return [str(t).lower().strip() for t in v if t]
        if isinstance(v, str):
            return [t.lower().strip() for t in v.split(",") if t.strip()]
        return []

    @field_validator("custom_fields", mode="before")
    @classmethod
    def coerce_custom_fields(cls, v: Any) -> dict:
        if isinstance(v, dict):
            return v
        return {}

    @model_validator(mode="before")
    @classmethod
    def strip_nulls_from_raw(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        # Replace the string "null" or "None" with actual None
        cleaned = {}
        for k, v in data.items():
            if isinstance(v, str) and v.lower() in ("null", "none", "n/a", ""):
                cleaned[k] = None
            else:
                cleaned[k] = v
        return cleaned

    def to_db_dict(self) -> dict:
        """Return a dict ready for Supabase insert/update, excluding generated-only fields."""
        d = self.model_dump()
        # Supabase handles created_at / updated_at via triggers
        d.pop("created_at", None)
        d.pop("updated_at", None)
        return d


def from_llm_output(raw: Any, source_url: str, city: str = "", tag: Optional[str] = None) -> Optional[VenueRecord]:
    """
    Parse whatever the LLM returned into a VenueRecord.
    Returns None if `name` is missing or empty.
    """
    if not isinstance(raw, dict):
        return None

    raw["source"] = source_url
    if city and not raw.get("city"):
        raw["city"] = city

    # Merge extra tag
    existing_tags = raw.get("tags") or []
    if isinstance(existing_tags, str):
        existing_tags = [t.strip() for t in existing_tags.split(",") if t.strip()]
    if tag:
        existing_tags = list(existing_tags) + [tag.lower()]
    raw["tags"] = existing_tags

    name = raw.get("name")
    if not name or str(name).lower() in ("null", "none", "n/a", ""):
        return None

    try:
        return VenueRecord(**raw)
    except Exception:
        return None
