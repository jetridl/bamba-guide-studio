from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Guide, GuidePage, GuideReview, GuideReviewComment, GuideSession
from app.services.json_schema import validate_json_schema
from app.services.serialization import comment_to_dict

EDITABLE_REVIEW_FIELDS = {
    ("page", "title"): "title",
    ("field", "title"): "title",
    ("page", "bodyMarkdown"): "body_markdown",
    ("field", "bodyMarkdown"): "body_markdown",
    ("page", "prompt"): "prompt",
    ("field", "prompt"): "prompt",
}


def import_review(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    errors = validate_json_schema(payload, "guide-review.schema.json")
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Review JSON does not match schema", "errors": errors},
        )
    guide = db.scalar(select(Guide).where(Guide.external_id == payload["guideId"]).order_by(Guide.version.desc()))
    if guide is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guide not found for review.")
    review = GuideReview(
        guide=guide,
        reviewer=payload["reviewer"],
        summary=payload.get("summary"),
        raw_json=payload,
    )
    db.add(review)
    db.flush()

    for comment_data in payload.get("comments", []):
        target_external_id = comment_data.get("targetId")
        target_db_id = _resolve_target(db, guide, comment_data["targetType"], target_external_id)
        db.add(
            GuideReviewComment(
                review=review,
                external_id=comment_data["id"],
                target_type=comment_data["targetType"],
                target_external_id=target_external_id,
                target_db_id=target_db_id,
                field=comment_data.get("field"),
                severity=comment_data["severity"],
                category=comment_data["category"],
                comment=comment_data["comment"],
                suggested_revision=comment_data.get("suggestedRevision"),
                status="open",
            )
        )

    db.commit()
    db.refresh(review)
    return {
        "id": str(review.id),
        "guideId": str(guide.id),
        "comments": [comment_to_dict(comment) for comment in review.comments],
    }


def set_comment_status(db: Session, comment_id: uuid.UUID, status_value: str) -> dict[str, Any]:
    if status_value not in {"open", "accepted", "dismissed", "resolved"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid comment status.")
    comment = db.get(GuideReviewComment, comment_id)
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review comment not found.")
    comment.status = status_value
    db.commit()
    db.refresh(comment)
    return comment_to_dict(comment)


def accept_comment(db: Session, comment_id: uuid.UUID) -> dict[str, Any]:
    comment = db.get(GuideReviewComment, comment_id)
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review comment not found.")
    if comment.suggested_revision and comment.target_db_id and comment.field:
        target = _load_mutation_target(db, comment)
        field_name = EDITABLE_REVIEW_FIELDS.get((comment.target_type, comment.field))
        if target is not None and field_name:
            setattr(target, field_name, comment.suggested_revision)
    comment.status = "accepted"
    db.commit()
    db.refresh(comment)
    return comment_to_dict(comment)


def list_comments_for_guide(guide: Guide) -> list[dict[str, Any]]:
    return [
        comment_to_dict(comment)
        for review in guide.reviews
        for comment in review.comments
    ]


def _resolve_target(db: Session, guide: Guide, target_type: str, target_external_id: str | None) -> uuid.UUID | None:
    if target_type == "guide":
        return guide.id
    if not target_external_id:
        return None
    if target_type == "session":
        target = db.scalar(
            select(GuideSession).where(
                GuideSession.guide_id == guide.id,
                GuideSession.external_id == target_external_id,
            )
        )
        return target.id if target else None
    if target_type in {"page", "field"}:
        target = db.scalar(
            select(GuidePage)
            .join(GuideSession)
            .where(
                GuideSession.guide_id == guide.id,
                GuidePage.external_id == target_external_id,
            )
        )
        return target.id if target else None
    return None


def _load_mutation_target(db: Session, comment: GuideReviewComment) -> Any | None:
    if comment.target_type in {"page", "field"}:
        return db.get(GuidePage, comment.target_db_id)
    return None
