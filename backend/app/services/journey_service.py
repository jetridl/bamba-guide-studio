"""Journey reads, JSON payloads and validation, shared by routes, loader and publish."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Guide
from app.models.journey import Journey, JourneyPoem
from app.services.json_schema import validate_json_schema

# Same rule as journey.schema.json: a file name beside journey.json, no folders.
COVER_FILE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*\.(png|jpg|jpeg|webp)$")


def get_journey(db: Session, journey_id: uuid.UUID) -> Journey:
    journey = db.scalar(select(Journey).options(selectinload(Journey.poems).selectinload(JourneyPoem.poem))
                        .where(Journey.id == journey_id))
    if journey is None:
        raise HTTPException(status_code=404, detail="Journey not found.")
    return journey


def payload(journey: Journey) -> dict[str, Any]:
    return {"schemaVersion": 1, "journey": {
        "id": journey.external_id, "version": journey.version, "status": journey.status,
        "title": journey.title, "subtitle": journey.subtitle, "curator": journey.curator,
        "introduction": journey.introduction_json,
        **({"closing": journey.closing_json} if journey.closing_json else {}),
        **({"coverImage": journey.cover_image_json} if journey.cover_image_json else {}),
    }, "poems": [{"poemId": item.poem.external_id, "note": item.note_json}
                  for item in sorted(journey.poems, key=lambda item: item.order_index)]}


def published_version(journey: Journey) -> int | None:
    """The version in exports/journeys of this Journey, or None when it is not published."""
    from app.core.config import settings

    if not journey.external_id:
        return None
    try:
        path = settings.published_journeys_dir / journey.external_id / "journey.json"
        version = json.loads(path.read_text(encoding="utf-8"))["journey"]["version"]
    except (OSError, ValueError, KeyError, TypeError):
        return None
    return version if isinstance(version, int) else None


def detail(journey: Journey) -> dict[str, Any]:
    data = payload(journey)
    return {"id": str(journey.id), "externalId": journey.external_id,
            **{key: value for key, value in data["journey"].items() if key != "id"},
            "publishedVersion": published_version(journey),
            "closing": journey.closing_json,
            "coverImage": journey.cover_image_json,
            "poems": [{**item, "title": row.poem.title, "author": row.poem.author}
                      for item, row in zip(data["poems"], sorted(journey.poems, key=lambda item: item.order_index))]}


def _issue(code: str, message: str, target_type: str, target_id: str) -> dict[str, Any]:
    return {"severity": "blocking", "code": code, "message": message,
            "targetType": target_type, "targetId": target_id}


def validation(db: Session, journey: Journey) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    if not journey.introduction_json:
        issues.append(_issue("missing_introduction", "Write a Journey Introduction.", "journey", journey.external_id))
    if not journey.poems:
        issues.append(_issue("no_poems", "Add at least one poem.", "journey", journey.external_id))
    cover = journey.cover_image_json
    if not cover or not cover.get("path"):
        issues.append(_issue("missing_cover", "Add a cover image. A Journey cannot be published without one.",
                             "journey", journey.external_id))
    elif not COVER_FILE_NAME.match(cover["path"]):
        issues.append(_issue("cover_image_path", "Give the cover image a file name such as cover.jpg: "
                             "letters, numbers, - or _, ending in .png, .jpg, .jpeg or .webp, with no folders.",
                             "journey", journey.external_id))
    if cover and not cover.get("alt"):
        issues.append(_issue("missing_cover_alt", "Describe the cover image for readers who cannot see it.",
                             "journey", journey.external_id))
    for item in journey.poems:
        if not item.note_json:
            issues.append(_issue("missing_note", f"Write a Journey Note for {item.poem.title}.",
                                 "poem", item.poem.external_id))
    if not issues:
        issues = [_issue("schema", message, "journey", journey.external_id)
                  for message in validate_json_schema(payload(journey), "journey.schema.json")]
    for item in journey.poems:
        if not db.scalar(select(Guide.id).where(Guide.poem_id == item.poem_id,
                                              Guide.status.in_(["approved", "exported"]))):
            issues.append({"severity": "blocking", "code": "poem_without_approved_guide",
                           "message": f"{item.poem.title} needs an approved or exported guide.",
                           "targetType": "poem", "targetId": item.poem.external_id})
    return {"valid": not issues, "blockingCount": len(issues), "issues": issues}
