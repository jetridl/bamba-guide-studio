from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Guide, GuidePage, GuideSession, PoemChunk
from app.services.chunk_ordering import chunk_sort_key
from app.services.json_schema import validate_json_schema
from app.services.page_types import CHUNK_SCOPED_PAGE_TYPES, derive_round_type


def build_guided_plan(guide: Guide) -> dict[str, Any]:
    chunks = sorted(guide.poem.chunks, key=chunk_sort_key)
    sessions = sorted(guide.sessions, key=lambda session: session.order_index)
    return {
        "schemaVersion": 2,
        "guide": {
            "id": guide.external_id,
            "poemId": guide.poem.external_id,
            "title": guide.title,
            # Version 0 is Studio's working copy, not an authored content version.
            "version": guide.version if guide.version > 0 else (
                (guide.import_snapshot_json or {}).get("guide", {}).get("version", 1)
            ),
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
            **({"coverImage": guide.poem.cover_image_json} if guide.poem.cover_image_json else {}),
        },
        **_poem_structure(guide, chunks),
        "sessions": [_session_json(session) for session in sessions],
    }


def export_guide(db: Session, guide: Guide) -> dict[str, Any]:
    payload = prepare_export(guide)
    mark_exported(db, guide)
    return payload


def mark_exported(db: Session, guide: Guide) -> None:
    if guide.status == "approved":
        guide.status = "exported"
        db.commit()


def prepare_export(guide: Guide) -> dict[str, Any]:
    """Check that the guide may be exported and build its JSON. Changes nothing."""
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

    payload = build_guided_plan(guide)
    payload["guide"]["status"] = "exported"
    schema_errors = validate_json_schema(payload, "guided-plan.schema.json")
    if schema_errors:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Export JSON does not match schema.", "errors": schema_errors},
        )
    return payload


def _poem_structure(guide: Guide, chunks: list[PoemChunk]) -> dict[str, Any]:
    if guide.poem.structure_json:
        return guide.poem.structure_json
    stanzas: list[dict[str, Any]] = []
    lines: list[dict[str, Any]] = []
    exported_chunks: list[dict[str, Any]] = []
    stanza_ids: dict[str, int] = {}
    stanza_line_counts: dict[str, int] = {}
    for chunk in chunks:
        stanza_id = chunk.section.external_id if chunk.section else "stanza_1"
        if stanza_id not in stanza_ids:
            stanza_ids[stanza_id] = len(stanzas)
            stanza_line_counts[stanza_id] = 0
            stanzas.append({"id": stanza_id, "orderIndex": len(stanzas),
                            "title": chunk.section.title if chunk.section else None})
        ids: list[str] = []
        for index, text in enumerate(chunk.text.splitlines()):
            if not text.strip():
                continue
            line_id = f"{chunk.external_id}__line_{index + 1}"
            ids.append(line_id)
            lines.append({"id": line_id, "stanzaId": stanza_id,
                          "orderIndex": len(lines),
                          "stanzaOrderIndex": stanza_line_counts[stanza_id], "text": text})
            stanza_line_counts[stanza_id] += 1
        exported_chunks.append({"id": chunk.external_id, "orderIndex": len(exported_chunks),
                                "lineIds": ids, "metadata": chunk.metadata_json or {}})
    return {"stanzas": stanzas, "lines": lines, "chunks": exported_chunks}


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


def _page_chunk_ids(page: GuidePage) -> list[str]:
    """Return the chunk IDs the app needs on the page itself.

    In Studio, a game or poem_chunk page with no chunkIds uses its session's chunks.
    The app parser reads only page chunkIds, so the export writes the inherited IDs out.
    A poem_chunk page with metadata scope "whole_poem" is the app's whole-poem reading
    page: it shows bodyMarkdown and must stay without chunks.
    """
    own = list(page.chunk_ids_json or [])
    if own or page.page_type not in CHUNK_SCOPED_PAGE_TYPES:
        return own
    if page.page_type == "poem_chunk" and (page.metadata_json or {}).get("scope") == "whole_poem":
        return own
    return list(page.session.chunk_ids_json or [])


def _page_json(page: GuidePage) -> dict[str, Any]:
    return {
        "id": page.external_id,
        "type": page.page_type,
        "orderIndex": page.order_index,
        "title": page.title,
        "bodyMarkdown": page.body_markdown,
        "prompt": page.prompt,
        "chunkIds": _page_chunk_ids(page),
        "roundType": derive_round_type(page.page_type),
        "estimatedSeconds": page.estimated_seconds,
        "metadata": page.metadata_json or {},
    }
