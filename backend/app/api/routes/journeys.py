from __future__ import annotations

import json
import uuid
from dataclasses import asdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import Guide, Poem
from app.models.journey import Journey, JourneyPoem
from app.services.journey_loader import load_journey_folders
from app.services.journey_publish_service import publish_journey
from app.services.journey_service import detail, get_journey, payload, validation

router = APIRouter()
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Draft = Annotated[str, StringConstraints(strip_whitespace=True)]


class JourneyCoverInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Drafts may save gaps; validation blocks them before approval.
    path: Draft = ""
    alt: Draft = ""


class JourneyPoemInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    poemId: Text
    note: list[Text] = Field(default_factory=list)


class JourneyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    externalId: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")]
    title: Text
    subtitle: Text
    curator: Text
    version: int = Field(default=1, ge=1)
    introduction: list[Text] = Field(default_factory=list)
    closing: list[Text] = Field(default_factory=list)
    coverImage: JourneyCoverInput | None = None
    poems: list[JourneyPoemInput] = Field(default_factory=list)


def save(db: Session, journey: Journey, data: JourneyInput) -> dict[str, Any]:
    if journey.external_id and journey.external_id != data.externalId:
        raise HTTPException(status_code=409, detail="Journey IDs stay unchanged after creation.")
    if journey.version is not None and data.version < journey.version:
        raise HTTPException(status_code=409, detail="Journey versions cannot decrease.")
    ids = [item.poemId for item in data.poems]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=422, detail="A poem may appear only once in a Journey.")
    candidates = {poem.external_id: poem for poem in db.scalars(select(Poem).where(Poem.external_id.in_(ids)))}
    for poem_id in ids:
        poem = candidates.get(poem_id)
        if poem is None or not db.scalar(select(Guide.id).where(Guide.poem_id == poem.id,
                                                             Guide.status.in_(["approved", "exported"]))):
            raise HTTPException(status_code=409, detail=f"{poem_id} needs an approved or exported guide.")
    if journey.status == "exported" and data.version <= journey.version:
        raise HTTPException(status_code=409, detail="Raise the Journey version before editing an exported Journey.")
    journey.external_id = data.externalId
    journey.title, journey.subtitle, journey.curator = data.title, data.subtitle, data.curator
    journey.version, journey.status = data.version, "draft"
    journey.introduction_json, journey.closing_json = data.introduction, data.closing
    cover = data.coverImage
    journey.cover_image_json = {"path": cover.path, "alt": cover.alt} if cover and (cover.path or cover.alt) else None
    old = {item.poem.external_id: item for item in journey.poems}
    keep: list[JourneyPoem] = []
    for index, item in enumerate(data.poems):
        row = old.get(item.poemId) or JourneyPoem(external_id=f"{data.externalId}:{item.poemId}", poem=candidates[item.poemId])
        row.order_index, row.note_json = index, item.note
        keep.append(row)
    journey.poems = keep
    db.add(journey)
    db.commit()
    return detail(get_journey(db, journey.id))


@router.get("/journeys")
def list_journeys(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return [detail(journey) for journey in db.scalars(select(Journey).order_by(Journey.title)).all()]


@router.post("/journeys/refresh")
def refresh_journeys(db: Session = Depends(get_db)) -> dict[str, list[str]]:
    """Add published Journeys, then drafts, that Studio does not hold yet. Never overwrites Studio edits."""
    return asdict(load_journey_folders(db, [settings.published_journeys_dir, settings.journeys_dir]))


@router.get("/journey-poems")
def eligible_poems(db: Session = Depends(get_db)) -> list[dict[str, str]]:
    poems = db.scalars(select(Poem).where(Poem.id.in_(select(Guide.poem_id).where(
        Guide.status.in_(["approved", "exported"]))))).all()
    return [{"poemId": poem.external_id, "title": poem.title, "author": poem.author} for poem in poems]


@router.post("/journeys")
def create(data: JourneyInput, db: Session = Depends(get_db)) -> dict[str, Any]:
    if db.scalar(select(Journey.id).where(Journey.external_id == data.externalId)):
        raise HTTPException(status_code=409, detail="A Journey already has that ID.")
    return save(db, Journey(), data)


@router.get("/journeys/{journey_id}")
def read(journey_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    return detail(get_journey(db, journey_id))


@router.put("/journeys/{journey_id}")
def update(journey_id: uuid.UUID, data: JourneyInput, db: Session = Depends(get_db)) -> dict[str, Any]:
    return save(db, get_journey(db, journey_id), data)


@router.get("/journeys/{journey_id}/validate")
def validate(journey_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    return validation(db, get_journey(db, journey_id))


@router.post("/journeys/{journey_id}/mark-in-review")
def mark_in_review(journey_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    journey = get_journey(db, journey_id)
    if journey.status == "exported":
        raise HTTPException(status_code=409, detail="Raise the Journey version and save before changing exported content.")
    journey.status = "in_review"
    db.commit()
    return detail(journey)


@router.post("/journeys/{journey_id}/approve")
def approve(journey_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    journey = get_journey(db, journey_id)
    if journey.status == "exported":
        return detail(journey)
    result = validation(db, journey)
    if not result["valid"]:
        raise HTTPException(status_code=409, detail=result)
    journey.status = "approved"
    db.commit()
    return detail(journey)


@router.get("/journeys/{journey_id}/export")
def export(journey_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    journey = get_journey(db, journey_id)
    result = validation(db, journey)
    if journey.status not in {"approved", "exported"} or not result["valid"]:
        raise HTTPException(status_code=409, detail={"message": "Approve a valid Journey before export.", **result})
    journey.status = "exported"
    db.commit()
    return Response(content=json.dumps(payload(journey), indent=2), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{journey.external_id}_journey.json"'})


@router.post("/journeys/{journey_id}/publish")
def publish(journey_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Write exports/journeys/<journey_id>/ for the Bamba app, with its cover image."""
    return publish_journey(db, get_journey(db, journey_id), settings.published_journeys_dir,
                           settings.published_guides_dir, settings.journeys_dir)
