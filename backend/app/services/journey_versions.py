"""Journey versions: one content per version number.

The Journey row is Studio's editable copy. Each JourneyVersion row is a
read-only copy of one version's journey.json content. Refresh and Publish add
versions. The editable copy always has the highest version number: when Refresh
adds a higher version, it becomes the editable copy. "Use as latest" copies an
older version back under the next free number. Both keep the editable copy as a
version of its own first.
"""

from __future__ import annotations

import copy
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Poem
from app.models.journey import Journey, JourneyPoem, JourneyVersion
from app.services.journey_service import payload, validation

PUBLISHED_STATUSES = {"approved", "exported"}


def comparable(data: Any) -> Any:
    """The content the app sees: no status, and no empty closing."""
    if not isinstance(data, dict) or not isinstance(data.get("journey"), dict):
        return data
    result = copy.deepcopy(data)
    result["journey"].pop("status", None)
    if not result["journey"].get("closing"):
        result["journey"].pop("closing", None)
    return result


def same_content(first: Any, second: Any) -> bool:
    return comparable(first) == comparable(second)


def saved_versions(db: Session, journey: Journey) -> dict[int, JourneyVersion]:
    rows = db.scalars(select(JourneyVersion).where(JourneyVersion.journey_id == journey.id)).all()
    return {row.version: row for row in rows}


def next_free_version(db: Session, journey: Journey, *also: int) -> int:
    return max([journey.version, *saved_versions(db, journey), *also]) + 1


def version_taken(number: int, free: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"Version {number} is already saved with different content. "
        f"Raise the version to {free} and save first, so each version number keeps one content.",
    )


def record_version(db: Session, journey: Journey, status_label: str | None = None) -> JourneyVersion:
    """Keep the editable copy as the version with its own number. A number never names two contents."""
    data = payload(journey)
    existing = saved_versions(db, journey).get(journey.version)
    if existing is not None:
        if not same_content(existing.payload_json, data):
            raise version_taken(journey.version, next_free_version(db, journey))
        return existing
    row = JourneyVersion(journey=journey, version=journey.version,
                         status=status_label or journey.status, payload_json=data)
    db.add(row)
    db.flush()
    return row


def add_version(db: Session, journey: Journey, data: dict[str, Any]) -> JourneyVersion:
    """Keep a journey.json file as a read-only version. The editable copy does not change."""
    row = JourneyVersion(journey=journey, version=data["journey"]["version"],
                         status=data["journey"]["status"], payload_json=data)
    db.add(row)
    db.flush()
    return row


def poems_for(db: Session, data: dict[str, Any]) -> dict[str, Poem]:
    """The Studio poems a journey.json uses. Raises a plain message when one is missing or repeated."""
    poem_ids = [item["poemId"] for item in data["poems"]]
    if len(poem_ids) != len(set(poem_ids)):
        raise ValueError("a poem appears more than once.")
    poems = {poem.external_id: poem for poem in db.scalars(select(Poem).where(Poem.external_id.in_(poem_ids)))}
    missing = [poem_id for poem_id in poem_ids if poem_id not in poems]
    if missing:
        raise ValueError(f"Studio does not hold {', '.join(missing)} yet. Refresh the guides first.")
    return poems


def apply_content(journey: Journey, data: dict[str, Any], poems: dict[str, Poem]) -> None:
    """Copy journey.json content into the editable Journey."""
    info = data["journey"]
    cover = info.get("coverImage")
    journey.external_id = info["id"]
    journey.title, journey.subtitle, journey.curator = info["title"], info["subtitle"], info["curator"]
    journey.version = info["version"]
    journey.introduction_json = info["introduction"]
    journey.closing_json = info.get("closing") or []
    journey.cover_image_json = {"path": cover["path"], "alt": cover["alt"]} if cover else None
    old = {item.poem.external_id: item for item in journey.poems}
    rows: list[JourneyPoem] = []
    for index, item in enumerate(data["poems"]):
        row = old.get(item["poemId"]) or JourneyPoem(
            external_id=f"{info['id']}:{item['poemId']}", poem=poems[item["poemId"]])
        row.order_index, row.note_json = index, item["note"]
        rows.append(row)
    journey.poems = rows


def published_status(db: Session, journey: Journey, wanted: str) -> str:
    """Approved when the file was approved or exported and the Journey passes validation; else draft."""
    db.flush()
    if wanted in PUBLISHED_STATUSES and validation(db, journey)["valid"]:
        return "approved"
    return "draft"


def keep_editable_copy(db: Session, journey: Journey) -> None:
    """Keep the editable copy as its own version. Refuses when that version holds other content."""
    own = saved_versions(db, journey).get(journey.version)
    if own is None:
        record_version(db, journey)
    elif not same_content(own.payload_json, payload(journey)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The latest copy has changes that are not in a saved version. Raise its version to "
            f"{next_free_version(db, journey)} and save first, so the changes are kept.",
        )


def _take(db: Session, journey: Journey, row: JourneyVersion) -> None:
    try:
        poems = poems_for(db, row.payload_json)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=f"Cannot use version {row.version}: {error}") from error
    keep_editable_copy(db, journey)
    apply_content(journey, row.payload_json, poems)


def promote_highest(db: Session, journey: Journey) -> int | None:
    """Make the highest saved version the editable copy when it is above it. Returns its number."""
    saved = saved_versions(db, journey)
    number = max(saved, default=0)
    if number <= journey.version:
        return None
    row = saved[number]
    _take(db, journey, row)
    status_label = published_status(db, journey, row.status)
    # An exported file stays exported: it is the published copy.
    journey.status = row.status if status_label == "approved" else status_label
    db.flush()
    return number


def restore_version(db: Session, journey: Journey, number: int) -> None:
    """Make a saved version the editable copy. The editable copy is kept as a version first.

    The editable copy always has the highest number, so an older version comes
    back under the next free number, ready to publish again.
    """
    row = saved_versions(db, journey).get(number)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Version {number} is not saved.")
    _take(db, journey, row)
    highest = max(saved_versions(db, journey))
    journey.status = published_status(db, journey, row.status)
    if number < highest:
        journey.version = highest + 1
    elif row.status == "exported" and journey.status == "approved":
        journey.status = "exported"
    db.commit()
