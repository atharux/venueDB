from __future__ import annotations

import os
from typing import Optional

from supabase import create_client, Client

from .logger import get_logger
from .schema import VenueRecord

log = get_logger("supabase_client")


def _get_client() -> Client:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError(
            "Supabase credentials missing. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env"
        )
    return create_client(url, key)


def _is_empty(value) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    if isinstance(value, list) and not value:
        return True
    if isinstance(value, dict) and not value:
        return True
    return False


def upsert_venue(record: VenueRecord) -> tuple[bool, str]:
    """
    Insert or partial-update a venue in Supabase.

    Dedup key: name (case-insensitive) + city.
    - If exists: fill only currently-null/empty fields, never overwrite.
    - If new: insert with status='new'.

    Returns (inserted: bool, record_id: str).
    """
    client = _get_client()

    # Search for existing record
    resp = (
        client.table("venues")
        .select("*")
        .ilike("name", record.name)
        .eq("city", record.city)
        .limit(1)
        .execute()
    )

    if resp.data:
        existing = resp.data[0]
        existing_id = existing["id"]

        # Build patch: only fields that are currently null/empty in DB
        patch: dict = {}
        for field, new_val in record.to_db_dict().items():
            if field in ("id", "status", "name", "city"):
                continue
            if not _is_empty(new_val) and _is_empty(existing.get(field)):
                patch[field] = new_val

        if patch:
            client.table("venues").update(patch).eq("id", existing_id).execute()
            log.info("Updated %d fields on existing record '%s' (%s)", len(patch), record.name, existing_id)
        else:
            log.info("No new fields to update for '%s' (%s)", record.name, existing_id)

        return False, existing_id

    # New record
    data = record.to_db_dict()
    data["status"] = "new"
    client.table("venues").insert(data).execute()
    log.info("Inserted new record '%s' → %s", record.name, record.id)
    return True, record.id


def upsert_many(records: list[VenueRecord]) -> tuple[int, int, int]:
    """
    Upsert a list of VenueRecords.
    Returns (inserted, updated, failed) counts.
    """
    inserted = updated = failed = 0
    for record in records:
        try:
            was_new, _ = upsert_venue(record)
            if was_new:
                inserted += 1
            else:
                updated += 1
        except Exception as exc:
            log.error("Supabase upsert failed for '%s' (%s): %s", record.name, record.source, exc)
            failed += 1
    return inserted, updated, failed
