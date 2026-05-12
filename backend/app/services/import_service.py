from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Guide, GuidePage, GuideSession, Poem, PoemChunk, PoemSection
from app.services.json_schema import validate_json_schema
from app.services.serialization import guide_to_dict


def import_guide(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    schema_errors = validate_json_schema(payload, "guided-plan.schema.json")
    if schema_errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Guide JSON does not match schema", "errors": schema_errors},
        )

    poem_data = payload["poem"]
    poem = db.scalar(select(Poem).where(Poem.external_id == poem_data["id"]))
    if poem is None:
        poem = Poem(external_id=poem_data["id"])
        db.add(poem)
    poem.title = poem_data["title"]
    poem.author = poem_data["author"]
    poem.text = poem_data["text"]
    poem.year = poem_data.get("year")
    poem.metadata_json = poem_data.get("metadata") or {}
    db.flush()

    section_by_external_id = _reconstruct_sections(db, poem, payload["chunks"])
    _upsert_chunks(db, poem, section_by_external_id, payload["chunks"])

    guide_data = payload["guide"]
    max_version = db.scalar(
        select(func.max(Guide.version)).where(Guide.external_id == guide_data["id"])
    )
    guide = Guide(
        external_id=guide_data["id"],
        poem=poem,
        title=guide_data["title"],
        description=guide_data.get("description"),
        version=(max_version or 0) + 1,
        status="draft",
        metadata_json=guide_data.get("metadata") or {},
        import_snapshot_json=payload,
    )
    db.add(guide)
    db.flush()

    for session_data in payload["sessions"]:
        session = GuideSession(
            external_id=session_data["id"],
            guide=guide,
            session_number=session_data["sessionNumber"],
            title=session_data["title"],
            subtitle=session_data.get("subtitle"),
            focus_summary=session_data.get("focusSummary"),
            order_index=session_data["orderIndex"],
            metadata_json=session_data.get("metadata") or {},
        )
        db.add(session)
        db.flush()
        for page_data in session_data["pages"]:
            db.add(
                GuidePage(
                    external_id=page_data["id"],
                    session=session,
                    page_type=page_data["type"],
                    order_index=page_data["orderIndex"],
                    title=page_data.get("title"),
                    body_markdown=page_data.get("bodyMarkdown"),
                    prompt=page_data.get("prompt"),
                    chunk_ids_json=page_data.get("chunkIds") or [],
                    round_type=page_data.get("roundType"),
                    estimated_seconds=page_data.get("estimatedSeconds"),
                    metadata_json=page_data.get("metadata") or {},
                )
            )

    db.commit()
    db.refresh(guide)
    return guide_to_dict(guide)


def _reconstruct_sections(
    db: Session, poem: Poem, chunks: list[dict[str, Any]]
) -> dict[str, PoemSection]:
    section_ids: list[str] = []
    for chunk in sorted(chunks, key=lambda item: item["orderIndex"]):
        section_id = chunk.get("sectionId")
        if section_id and section_id not in section_ids:
            section_ids.append(section_id)

    existing_sections = {
        section.external_id: section
        for section in db.scalars(select(PoemSection).where(PoemSection.poem_id == poem.id)).all()
    }
    result: dict[str, PoemSection] = {}
    for order_index, external_id in enumerate(section_ids):
        section = existing_sections.get(external_id)
        if section is None:
            section = PoemSection(external_id=external_id, poem=poem)
            db.add(section)
        section.order_index = order_index
        section.title = None
        result[external_id] = section
    db.flush()
    return result


def _upsert_chunks(
    db: Session,
    poem: Poem,
    section_by_external_id: dict[str, PoemSection],
    chunks: list[dict[str, Any]],
) -> None:
    existing_chunks = {
        chunk.external_id: chunk
        for chunk in db.scalars(select(PoemChunk).where(PoemChunk.poem_id == poem.id)).all()
    }
    for chunk_data in chunks:
        chunk = existing_chunks.get(chunk_data["id"])
        if chunk is None:
            chunk = PoemChunk(external_id=chunk_data["id"], poem=poem)
            db.add(chunk)
        chunk.order_index = chunk_data["orderIndex"]
        chunk.text = chunk_data["text"]
        chunk.metadata_json = chunk_data.get("metadata") or {}
        section_id = chunk_data.get("sectionId")
        chunk.section = section_by_external_id.get(section_id) if section_id else None
    db.flush()
