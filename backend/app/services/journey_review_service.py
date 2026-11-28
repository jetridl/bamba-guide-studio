"""Review notes on Journeys. The same rules as guide notes (see review_notes)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.journey import Journey, JourneyReviewComment
from app.schemas.api import ReviewNoteInput
from app.services.review_notes import check_status, note_dict, reviewer_name


def back_to_review(journey: Journey) -> None:
    """Send an approved Journey back to the approval queue."""
    if journey.status in {"approved", "exported"}:
        journey.status = "in_review"


def note_to_dict(note: JourneyReviewComment) -> dict[str, Any]:
    return note_dict(note, note.reviewer)


def open_notes(journey: Journey) -> list[JourneyReviewComment]:
    return [note for note in journey.review_comments if note.status == "open"]


def list_notes(journey: Journey) -> list[dict[str, Any]]:
    return [note_to_dict(note) for note in journey.review_comments]


def add_note(db: Session, journey: Journey, data: ReviewNoteInput) -> dict[str, Any]:
    """Write a review note about the whole Journey or one of its poems."""
    if data.target_type == "journey":
        target_id = journey.external_id
    elif data.target_type == "poem":
        target_id = data.target_id
        if target_id not in {item.poem.external_id for item in journey.poems}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail=f"This Journey has no poem {target_id}.")
    else:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="A note is about the Journey or one of its poems.")
    note = JourneyReviewComment(
        journey=journey,
        external_id=f"studio_{uuid.uuid4().hex[:12]}",
        reviewer=reviewer_name(data.reviewer),
        target_type=data.target_type,
        target_external_id=target_id,
        severity=data.severity,
        category=data.category,
        comment=data.comment.strip(),
        status="open",
    )
    db.add(note)
    # A new note on an approved Journey: it waits for approval again.
    back_to_review(journey)
    db.commit()
    db.refresh(note)
    return note_to_dict(note)


def set_note_status(db: Session, note_id: uuid.UUID, value: str) -> dict[str, Any]:
    check_status(value)
    note = db.get(JourneyReviewComment, note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review note not found.")
    if value == "open" and note.status != "open":
        # A reopened note on an approved Journey: it waits for approval again.
        back_to_review(note.journey)
    note.status = value
    db.commit()
    db.refresh(note)
    return note_to_dict(note)
