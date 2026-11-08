from __future__ import annotations

import uuid
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.database import get_db
from app.models import Guide, GuidePage, GuideSession
from app.schemas.api import GuidePatch, PagePatch, ReorderPayload, SessionPatch
from app.services.guide_service import (
    approve_guide,
    duplicate_page,
    ensure_latest_working_copy,
    get_guide_or_404,
    get_page_or_404,
    get_session_or_404,
    guide_query,
    list_guide_versions,
    mark_in_review,
    patch_guide,
    patch_page,
    patch_session,
    reorder_pages,
    reorder_sessions,
    restore_latest_from_version,
    save_guide_version,
)
from app.services.published_guides import load_guide_folder
from app.services.serialization import guide_group_summary_to_dict, guide_to_dict, guide_version_to_dict

router = APIRouter()


@router.get("/guides")
def list_guides(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    guides = db.scalars(
        select(Guide)
        .options(selectinload(Guide.poem), selectinload(Guide.sessions))
        .order_by(Guide.external_id, Guide.version.desc())
    ).all()
    groups: dict[str, list[Guide]] = {}
    for guide in guides:
        groups.setdefault(guide.external_id, []).append(guide)
    for group in groups.values():
        ensure_latest_working_copy(db, group)
    summaries = [guide_group_summary_to_dict(group) for group in groups.values()]
    return sorted(summaries, key=lambda item: item["updatedAt"] or "", reverse=True)


@router.post("/guides/refresh")
def refresh_guides(db: Session = Depends(get_db)) -> dict[str, list[str]]:
    """Add guides from guides/json that Studio does not hold yet. Never overwrites Studio edits."""
    return asdict(load_guide_folder(db, settings.guides_dir))


@router.get("/guides/{guide_id}")
def get_guide(guide_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    return guide_to_dict(get_guide_or_404(db, guide_id))


@router.get("/guides/{guide_id}/versions")
def get_guide_versions(guide_id: uuid.UUID, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return [guide_version_to_dict(guide) for guide in list_guide_versions(db, get_guide_or_404(db, guide_id))]


@router.patch("/guides/{guide_id}")
def update_guide(guide_id: uuid.UUID, payload: GuidePatch, db: Session = Depends(get_db)) -> dict[str, Any]:
    return patch_guide(db, get_guide_or_404(db, guide_id), payload)


@router.delete("/guides/{guide_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_guide(guide_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    guide = get_guide_or_404(db, guide_id)
    db.delete(guide)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/guides/{guide_id}/mark-in-review")
def mark_guide_in_review(guide_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    return mark_in_review(db, get_guide_or_404(db, guide_id))


@router.post("/guides/{guide_id}/approve")
def approve(guide_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    return approve_guide(db, get_guide_or_404(db, guide_id))


@router.post("/guides/{guide_id}/save-version")
def save_version(guide_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    return save_guide_version(db, get_guide_or_404(db, guide_id))


@router.post("/guides/{guide_id}/restore-latest")
def restore_latest(guide_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    return restore_latest_from_version(db, get_guide_or_404(db, guide_id))


@router.post("/guides/{guide_id}/sessions")
def create_session(guide_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    guide = db.scalar(guide_query().where(Guide.id == guide_id))
    if guide is None:
        return get_guide_or_404(db, guide_id)
    if guide.version > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Saved versions are read-only. Restore this version to latest before editing.",
        )
    order_index = max((session.order_index for session in guide.sessions), default=-1) + 1
    session = GuideSession(
        guide=guide,
        external_id=f"{guide.external_id}_session_{order_index + 1}",
        session_number=order_index + 1,
        title="Untitled session",
        order_index=order_index,
        chunk_ids_json=[],
        metadata_json={},
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": str(session.id), "externalId": session.external_id}


@router.patch("/sessions/{session_id}")
def update_session(session_id: uuid.UUID, payload: SessionPatch, db: Session = Depends(get_db)) -> dict[str, Any]:
    return patch_session(db, get_session_or_404(db, session_id), payload)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    session = get_session_or_404(db, session_id)
    db.delete(session)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/guides/{guide_id}/sessions/reorder")
def reorder_guide_sessions(guide_id: uuid.UUID, payload: ReorderPayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    return reorder_sessions(db, get_guide_or_404(db, guide_id), payload)


@router.post("/sessions/{session_id}/pages")
def create_page(session_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    session = db.scalar(
        select(GuideSession)
        .options(selectinload(GuideSession.pages), selectinload(GuideSession.guide))
        .where(GuideSession.id == session_id)
    )
    if session is None:
        session = get_session_or_404(db, session_id)
    order_index = max((page.order_index for page in session.pages), default=-1) + 1
    page = GuidePage(
        session=session,
        external_id=f"{session.external_id}_page_{order_index + 1}",
        page_type="commentary",
        order_index=order_index,
        title="Untitled page",
        body_markdown="",
        chunk_ids_json=[],
        metadata_json={},
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return {"id": str(page.id), "externalId": page.external_id}


@router.patch("/pages/{page_id}")
def update_page(page_id: uuid.UUID, payload: PagePatch, db: Session = Depends(get_db)) -> dict[str, Any]:
    return patch_page(db, get_page_or_404(db, page_id), payload)


@router.delete("/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_page(page_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    page = get_page_or_404(db, page_id)
    db.delete(page)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sessions/{session_id}/pages/reorder")
def reorder_session_pages(session_id: uuid.UUID, payload: ReorderPayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    return reorder_pages(db, get_session_or_404(db, session_id), payload)


@router.post("/pages/{page_id}/duplicate")
def duplicate_guide_page(page_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    return duplicate_page(db, get_page_or_404(db, page_id))
