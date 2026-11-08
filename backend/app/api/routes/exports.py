from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.services.export_service import export_guide
from app.services.guide_service import get_guide_or_404
from app.services.publish_service import publish_guide

router = APIRouter()


@router.post("/guides/{guide_id}/publish")
def publish_guide_json(guide_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    guide = get_guide_or_404(db, guide_id)
    return publish_guide(db, guide, settings.published_guides_dir, settings.guides_dir)


@router.get("/guides/{guide_id}/export")
def export_guide_json(guide_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    guide = get_guide_or_404(db, guide_id)
    payload = export_guide(db, guide)
    filename = f"{payload['poem']['id']}_guided_plan.json"
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
