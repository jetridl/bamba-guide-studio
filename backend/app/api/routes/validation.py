from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.guide_service import get_guide_or_404
from app.services.validation_service import validate_guide

router = APIRouter()


@router.get("/guides/{guide_id}/validate")
def validate_guide_json(guide_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    return validate_guide(get_guide_or_404(db, guide_id))
