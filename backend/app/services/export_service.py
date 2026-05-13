from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Guide, GuidePage, GuideSession, PoemChunk
from app.services.chunk_ordering import chunk_sort_key
from app.services.json_schema import validate_json_schema
from app.services.page_types import derive_round_type


def build_guided_plan(guide: Guide) -> dict[str, Any]:
    chunks = sorted(guide.poem.chunks, key=chunk_sort_key)
    sessions = sorted(guide.sessions, key=lambda session: session.order_index)
    return {
        "schemaVersion": 1,
        "guide": {
            "id": guide.external_id,
            "poemId": guide.poem.external_id,
            "title": guide.title,
            "version": guide.version if guide.version > 0 else 1,
            "status": guide.status,
            **({"description": guide.description} if guide.description is not None else {}),
            "metadata": guide.metadata_json or {},
        },
        "poem": {
            "id": guide.poem.external_id,
            "title": guide.poem.title,
            "author": guide.poem.author,
            "text": guide.poem.text,
            "year": guide.poem.year,
            "metadata": guide.poem.metadata_json or {},
        },
        "chunks": [_chunk_json(chunk) for chunk in chunks],
        "sessions": [_session_json(session) for session in sessions],
    }


def export_guide(db: Session, guide: Guide) -> dict[str, Any]:
    from app.services.validation_service import validate_guide

    if guide.status not in {"approved", "exported"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Guide must be approved before export.",
        )

    validation = validate_guide(guide)
    blocking = [issue for issue in validation["issues"] if issue["severity"] == "blocking"]
    if blocking:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Guide has blocking validation issues.", "issues": blocking},
        )

    if guide.status == "approved":
        guide.status = "exported"
        db.commit()
        db.refresh(guide)

    payload = build_guided_plan(guide)
    schema_errors = validate_json_schema(payload, "guided-plan.schema.json")
    if schema_errors:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Export JSON does not match schema.", "errors": schema_errors},
        )
    return payload


def _chunk_json(chunk: PoemChunk) -> dict[str, Any]:
    return {
        "id": chunk.external_id,
        "sectionId": chunk.section.external_id if chunk.section else None,
        "orderIndex": chunk.order_index,
        "text": chunk.text,
        "metadata": chunk.metadata_json or {},
    }


def _session_json(session: GuideSession) -> dict[str, Any]:
    return {
        "id": session.external_id,
        "sessionNumber": session.session_number,
        "title": session.title,
        "subtitle": session.subtitle,
        "focusSummary": session.focus_summary,
        "orderIndex": session.order_index,
        "chunkIds": session.chunk_ids_json or [],
        "metadata": session.metadata_json or {},
        "pages": [_page_json(page) for page in sorted(session.pages, key=lambda item: item.order_index)],
    }


def _page_json(page: GuidePage) -> dict[str, Any]:
    return {
        "id": page.external_id,
        "type": page.page_type,
        "orderIndex": page.order_index,
        "title": page.title,
        "bodyMarkdown": page.body_markdown,
        "prompt": page.prompt,
        "chunkIds": page.chunk_ids_json or [],
        "roundType": derive_round_type(page.page_type),
    }
