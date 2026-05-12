from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.api import ReviewCommentPatch
from app.services.guide_service import get_guide_or_404
from app.services.review_service import accept_comment, list_comments_for_guide, set_comment_status

router = APIRouter()


@router.get("/guides/{guide_id}/review-comments")
def list_guide_review_comments(guide_id: uuid.UUID, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return list_comments_for_guide(get_guide_or_404(db, guide_id))


@router.patch("/review-comments/{comment_id}")
def update_review_comment(
    comment_id: uuid.UUID, payload: ReviewCommentPatch, db: Session = Depends(get_db)
) -> dict[str, Any]:
    return set_comment_status(db, comment_id, payload.status)


@router.post("/review-comments/{comment_id}/accept")
def accept_review_comment(comment_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    return accept_comment(db, comment_id)
