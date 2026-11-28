from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, object_session, selectinload

from app.models import Guide, GuidePage, GuideReview, GuideSession, Poem, PoemChunk
from app.schemas.api import GuidePatch, PagePatch, ReorderPayload, SessionPatch
from app.services.page_types import derive_round_type
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


# Approval covers the words as they stood. Any change to the content sends an
# approved working copy back to in_review, the queue of guides waiting for
# approval, so it is approved again before the Studio exports or publishes it.
# A draft stays a draft and a guide in review stays in review. A published or saved version is fixed: the first
# change to it moves the working copy to the next version number by itself.
# The editor never sets the number.
APPROVED_STATUSES = {"approved", "exported"}

# The statuses an editor sets by hand. Approval goes through /approve, which
# checks the guide first.
ASSIGNABLE_STATUSES = {"draft", "in_review"}


def back_to_review(guide: Guide) -> None:
    """Send an approved working copy back to the approval queue (a new note, for example)."""
    if guide.version == 0 and guide.status in APPROVED_STATUSES:
        guide.status = "in_review"


def mark_edited(guide: Guide) -> None:
    """Record a real content change to the working copy.

    A fixed (published or saved) version moves to the next version number, and
    an approved copy goes back to in review, so it is approved again before publishing.
    """
    from app.services.guide_versions import start_next_version

    if guide.version != 0:
        return
    db = object_session(guide)
    if db is not None:
        start_next_version(db, guide)
    if guide.status in APPROVED_STATUSES:
        guide.status = "in_review"


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


def ensure_latest_working_copy(db: Session, guides: list[Guide]) -> Guide:
    latest = next((guide for guide in guides if guide.version == 0), None)
    if latest is not None:
        return latest
    source = max(guides, key=lambda guide: guide.version)
    latest = Guide(external_id=source.external_id, version=0)
    db.add(latest)
    copy_guide_contents(db, source=source, target=latest)
    db.commit()
    db.refresh(latest)
    guides.append(latest)
    return latest


def list_guide_versions(db: Session, guide: Guide) -> list[Guide]:
    versions = db.scalars(
        guide_query().where(Guide.external_id == guide.external_id)
    ).all()
    if not any(version.version == 0 for version in versions):
        ensure_latest_working_copy(db, versions)
    return sorted(versions, key=lambda item: (item.version != 0, -item.version))


def patch_guide(db: Session, guide: Guide, patch: GuidePatch) -> dict[str, Any]:
    _ensure_editable_guide(guide)
    data = patch.model_dump(exclude_unset=True)
    edited = False
    for key, value in data.items():
        if key == "metadata":
            value = value or {}
            edited = edited or (guide.metadata_json or {}) != value
            guide.metadata_json = value
        elif key == "content_version":
            if value != guide.content_version:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Studio sets the version number: an edit to a published version starts the next one. "
                    "To bring in a version by hand, put its file in guides/json and click Refresh.",
                )
        elif key == "status":
            guide.status = _assignable_status(value)
        else:
            edited = edited or getattr(guide, key) != value
            setattr(guide, key, value)
    if edited:
        mark_edited(guide)
    db.commit()
    db.refresh(guide)
    return guide_to_dict(guide)


def mark_in_review(db: Session, guide: Guide) -> dict[str, Any]:
    _ensure_editable_guide(guide)
    if guide.status == "exported":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This version is published and never changes. Edit the guide to start the next version.",
        )
    guide.status = "in_review"
    db.commit()
    db.refresh(guide)
    return guide_to_dict(guide)


def approve_guide(db: Session, guide: Guide, *, from_file: bool = False) -> dict[str, Any]:
    """Approve the working copy.

    One editor writes and marks the guide in review; a second editor approves it.
    So approval needs the in-review step and every review note closed (accepted,
    resolved or dismissed). `from_file` approves a file that was approved before
    Studio loaded it, where only validation applies.
    """
    _ensure_editable_guide(guide)
    if guide.status == "exported":
        # A published, unchanged guide has nothing new to approve.
        return guide_to_dict(guide)
    if not from_file:
        if guide.status != "in_review":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Mark the guide in review first. A second editor approves what the writer hands over.",
            )
        from app.services.review_notes import require_notes_closed

        require_notes_closed(
            sum(comment.status == "open" for review in guide.reviews for comment in review.comments)
        )
    validation = validate_guide(guide)
    blocking = [issue for issue in validation["issues"] if issue["severity"] == "blocking"]
    if blocking:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"message": "Guide has blocking issues.", "issues": blocking})
    guide.status = "approved"
    if not from_file:
        from app.services.publish_service import matches_published

        if matches_published(guide):
            # Re-approved after a note, with no edit: exports/ holds exactly this version.
            guide.status = "exported"
    db.commit()
    db.refresh(guide)
    return guide_to_dict(guide)


def save_guide_version(db: Session, guide: Guide) -> dict[str, Any]:
    """Save the working copy as the read-only version with its own version number."""
    from app.services.guide_versions import record_version

    if guide.version > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This is a saved version already.")
    record_version(db, guide)
    db.commit()
    db.refresh(guide)
    return guide_to_dict(guide)


def restore_latest_from_version(db: Session, guide: Guide) -> dict[str, Any]:
    """Make a saved version the working copy. The working copy is saved first, so nothing is lost.

    The working copy always has the highest version number. An older version
    comes back under the next free number, in review: it needs approval before
    it is published again.
    """
    from app.services.guide_versions import highest_version, keep_working_copy, next_free_version

    if guide.version == 0:
        return guide_to_dict(guide)
    latest = db.scalar(guide_query().where(Guide.external_id == guide.external_id, Guide.version == 0))
    if latest is None:
        latest = Guide(external_id=guide.external_id, version=0)
        db.add(latest)
        highest = guide.version
    else:
        keep_working_copy(db, latest)
        highest = highest_version(db, latest)
    copy_guide_contents(db, source=guide, target=latest)
    if guide.version < highest:
        latest.content_version = next_free_version(db, latest, highest)
        # A new version: approval covers one version, so it waits in review.
        latest.status = "in_review"
    db.commit()
    db.refresh(latest)
    return guide_to_dict(latest)


def copy_guide_contents(db: Session, source: Guide, target: Guide) -> None:
    for session in list(target.sessions):
        db.delete(session)
    if target.id is not None:
        db.flush()

    target.poem = source.poem
    target.title = source.title
    target.content_version = source.content_version
    target.description = source.description
    target.status = source.status
    target.metadata_json = dict(source.metadata_json or {})
    target.import_snapshot_json = source.import_snapshot_json

    for session in sorted(source.sessions, key=lambda item: item.order_index):
        saved_session = GuideSession(
            external_id=session.external_id,
            guide=target,
            session_number=session.session_number,
            title=session.title,
            subtitle=session.subtitle,
            focus_summary=session.focus_summary,
            order_index=session.order_index,
            chunk_ids_json=list(session.chunk_ids_json or []),
            metadata_json=dict(session.metadata_json or {}),
        )
        db.add(saved_session)
        db.flush()
        for page in sorted(session.pages, key=lambda item: item.order_index):
            db.add(
                GuidePage(
                    external_id=page.external_id,
                    session=saved_session,
                    page_type=page.page_type,
                    order_index=page.order_index,
                    title=page.title,
                    body_markdown=page.body_markdown,
                    chunk_ids_json=list(page.chunk_ids_json or []),
                    round_type=derive_round_type(page.page_type),
                    prompt=page.prompt,
                    metadata_json=dict(page.metadata_json or {}),
                    estimated_seconds=page.estimated_seconds,
                )
            )
    db.flush()


def _assignable_status(value: str | None) -> str:
    if value in APPROVED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Use Approve, so the Studio checks the guide before it counts as approved.",
        )
    if value not in ASSIGNABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A guide is draft or in_review until it is approved.",
        )
    return value


def _ensure_editable_guide(guide: Guide) -> None:
    if guide.version > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Saved versions are read-only. Restore this version to latest before editing.",
        )


def patch_session(db: Session, session: GuideSession, patch: SessionPatch) -> dict[str, Any]:
    _ensure_editable_guide(session.guide)
    data = patch.model_dump(exclude_unset=True)
    edited = False
    for key, value in data.items():
        if key == "metadata":
            value = value or {}
            edited = edited or (session.metadata_json or {}) != value
            session.metadata_json = value
        elif key == "chunk_ids":
            value = value or []
            edited = edited or list(session.chunk_ids_json or []) != value
            session.chunk_ids_json = value
        else:
            edited = edited or getattr(session, key) != value
            setattr(session, key, value)
    if edited:
        mark_edited(session.guide)
    db.commit()
    db.refresh(session)
    return {"id": str(session.id), "guideId": str(session.guide_id)}


def patch_page(db: Session, page: GuidePage, patch: PagePatch) -> dict[str, Any]:
    _ensure_editable_guide(page.session.guide)
    data = patch.model_dump(exclude_unset=True)
    edited = False
    for key, value in data.items():
        if key == "type":
            edited = edited or page.page_type != value
            page.page_type = value
        elif key == "chunk_ids":
            value = value or []
            edited = edited or list(page.chunk_ids_json or []) != value
            page.chunk_ids_json = value
        elif key == "round_type":
            continue
        else:
            edited = edited or getattr(page, key) != value
            setattr(page, key, value)
    page.round_type = derive_round_type(page.page_type)
    if edited:
        mark_edited(page.session.guide)
    db.commit()
    db.refresh(page)
    return {"id": str(page.id), "sessionId": str(page.session_id)}


def reorder_sessions(db: Session, guide: Guide, payload: ReorderPayload) -> dict[str, Any]:
    _ensure_editable_guide(guide)
    sessions = {str(session.id): session for session in guide.sessions}
    edited = False
    for item in payload.items:
        session = sessions.get(item.id)
        if session is not None:
            edited = edited or session.order_index != item.order_index
            session.order_index = item.order_index
    if edited:
        mark_edited(guide)
    db.commit()
    return {"ok": True}


def reorder_pages(db: Session, session: GuideSession, payload: ReorderPayload) -> dict[str, Any]:
    _ensure_editable_guide(session.guide)
    pages = {str(page.id): page for page in session.pages}
    edited = False
    for item in payload.items:
        page = pages.get(item.id)
        if page is not None:
            edited = edited or page.order_index != item.order_index
            page.order_index = item.order_index
    if edited:
        mark_edited(session.guide)
    db.commit()
    return {"ok": True}


def duplicate_page(db: Session, page: GuidePage) -> dict[str, Any]:
    _ensure_editable_guide(page.session.guide)
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
        round_type=derive_round_type(page.page_type),
        prompt=page.prompt,
        metadata_json=dict(page.metadata_json or {}),
        estimated_seconds=page.estimated_seconds,
    )
    db.add(duplicate)
    mark_edited(page.session.guide)
    db.commit()
    db.refresh(duplicate)
    return {"id": str(duplicate.id), "externalId": duplicate.external_id}
