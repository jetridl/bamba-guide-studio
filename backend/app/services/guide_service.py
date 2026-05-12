from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Guide, GuidePage, GuideReview, GuideSession, Poem, PoemChunk
from app.schemas.api import GuidePatch, PagePatch, ReorderPayload, SessionPatch
from app.services.serialization import guide_to_dict
from app.services.validation_service import validate_guide


def guide_query():
    return (
        select(Guide)
        .options(
            selectinload(Guide.poem).selectinload(Poem.sections),
            selectinload(Guide.poem).selectinload(Poem.chunks).selectinload(PoemChunk.section),
            selectinload(Guide.sessions).selectinload(GuideSession.pages),
            selectinload(Guide.reviews).selectinload(GuideReview.comments),
        )
    )


def get_guide_or_404(db: Session, guide_id: uuid.UUID) -> Guide:
    guide = db.scalar(guide_query().where(Guide.id == guide_id))
    if guide is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guide not found.")
    return guide


def get_session_or_404(db: Session, session_id: uuid.UUID) -> GuideSession:
    session = db.get(GuideSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    return session


def get_page_or_404(db: Session, page_id: uuid.UUID) -> GuidePage:
    page = db.get(GuidePage, page_id)
    if page is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page not found.")
    return page


def patch_guide(db: Session, guide: Guide, patch: GuidePatch) -> dict[str, Any]:
    data = patch.model_dump(exclude_unset=True)
    for key, value in data.items():
        if key == "metadata":
            guide.metadata_json = value or {}
        else:
            setattr(guide, key, value)
    db.commit()
    db.refresh(guide)
    return guide_to_dict(guide)


def mark_in_review(db: Session, guide: Guide) -> dict[str, Any]:
    guide.status = "in_review"
    db.commit()
    db.refresh(guide)
    return guide_to_dict(guide)


def approve_guide(db: Session, guide: Guide) -> dict[str, Any]:
    validation = validate_guide(guide)
    blocking = [issue for issue in validation["issues"] if issue["severity"] == "blocking"]
    if blocking:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"message": "Guide has blocking issues.", "issues": blocking})
    guide.status = "approved"
    db.commit()
    db.refresh(guide)
    return guide_to_dict(guide)


def patch_session(db: Session, session: GuideSession, patch: SessionPatch) -> dict[str, Any]:
    data = patch.model_dump(exclude_unset=True)
    for key, value in data.items():
        if key == "metadata":
            session.metadata_json = value or {}
        elif key == "focus_summary":
            session.focus_summary = value
        elif key == "session_number":
            session.session_number = value
        elif key == "order_index":
            session.order_index = value
        else:
            setattr(session, key, value)
    db.commit()
    db.refresh(session)
    return {"id": str(session.id), "guideId": str(session.guide_id)}


def patch_page(db: Session, page: GuidePage, patch: PagePatch) -> dict[str, Any]:
    data = patch.model_dump(exclude_unset=True)
    for key, value in data.items():
        if key == "type":
            page.page_type = value
        elif key == "body_markdown":
            page.body_markdown = value
        elif key == "chunk_ids":
            page.chunk_ids_json = value or []
        elif key == "round_type":
            page.round_type = value
        elif key == "estimated_seconds":
            page.estimated_seconds = value
        elif key == "metadata":
            page.metadata_json = value or {}
        elif key == "order_index":
            page.order_index = value
        else:
            setattr(page, key, value)
    db.commit()
    db.refresh(page)
    return {"id": str(page.id), "sessionId": str(page.session_id)}


def reorder_sessions(db: Session, guide: Guide, payload: ReorderPayload) -> dict[str, Any]:
    sessions = {str(session.id): session for session in guide.sessions}
    for item in payload.items:
        session = sessions.get(item.id)
        if session is not None:
            session.order_index = item.order_index
    db.commit()
    return {"ok": True}


def reorder_pages(db: Session, session: GuideSession, payload: ReorderPayload) -> dict[str, Any]:
    pages = {str(page.id): page for page in session.pages}
    for item in payload.items:
        page = pages.get(item.id)
        if page is not None:
            page.order_index = item.order_index
    db.commit()
    return {"ok": True}


def duplicate_page(db: Session, page: GuidePage) -> dict[str, Any]:
    existing_ids = {sibling.external_id for sibling in page.session.pages}
    index = 1
    external_id = f"{page.external_id}_copy"
    while external_id in existing_ids:
        index += 1
        external_id = f"{page.external_id}_copy_{index}"
    duplicate = GuidePage(
        external_id=external_id,
        session=page.session,
        page_type=page.page_type,
        order_index=max((sibling.order_index for sibling in page.session.pages), default=-1) + 1,
        title=page.title,
        body_markdown=page.body_markdown,
        chunk_ids_json=list(page.chunk_ids_json or []),
        round_type=page.round_type,
        prompt=page.prompt,
        metadata_json=dict(page.metadata_json or {}),
        estimated_seconds=page.estimated_seconds,
    )
    db.add(duplicate)
    db.commit()
    db.refresh(duplicate)
    return {"id": str(duplicate.id), "externalId": duplicate.external_id}
