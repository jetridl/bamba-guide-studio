from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.import_service import import_guide
from app.services.review_service import import_review

router = APIRouter()


@router.post("/import/guide")
def import_guide_json(payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    return import_guide(db, payload)


@router.post("/import/review")
def import_review_json(payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    return import_review(db, payload)
