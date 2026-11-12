"""Guide versions: one content per version number.

Studio keeps one editable working copy of each guide (row version 0) and any
number of read-only saved versions (row version N > 0, always the same as its
content_version). A saved version never changes. Refresh, Save version and
Publish add saved versions.

The working copy ("Latest") always has the highest version number. When
Refresh adds a higher version, it becomes the working copy, and the old working
copy is kept as a saved version first.
"""

from __future__ import annotations

import copy
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Guide
from app.services.export_service import build_guided_plan
from app.services.import_service import infer_session_chunk_ids
from app.services.page_types import CHUNK_SCOPED_PAGE_TYPES, derive_round_type


def comparable(payload: dict[str, Any]) -> dict[str, Any]:
    """The content of guide JSON as the app sees it, so equal guides compare equal.

    It ignores the status, key order, and the values Studio fills in on export:
    session and page chunkIds taken from the pages or the session, roundType
    taken from the page type, and empty optional fields.
    """
    data = copy.deepcopy(payload)
    guide = data.get("guide") or {}
    guide.pop("status", None)
    guide.setdefault("metadata", {})
    guide["metadata"] = guide["metadata"] or {}
    poem = data.get("poem") or {}
    poem.setdefault("year", None)
    poem["metadata"] = poem.get("metadata") or {}
    if isinstance(data.get("chunks"), list):
        # Older Studio snapshots also stored each chunk's text and stanza.
        data["chunks"] = [
            {"id": chunk.get("id"), "orderIndex": chunk.get("orderIndex"),
             "lineIds": chunk.get("lineIds"), "metadata": chunk.get("metadata") or {}}
            for chunk in data["chunks"]
        ]
    sessions = sorted(data.get("sessions") or [], key=lambda item: item.get("orderIndex", 0))
    for session in sessions:
        session["chunkIds"] = session.get("chunkIds") or infer_session_chunk_ids(session)
        for key in ("subtitle", "focusSummary"):
            session.setdefault(key, None)
        session["metadata"] = session.get("metadata") or {}
        pages = sorted(session.get("pages") or [], key=lambda item: item.get("orderIndex", 0))
        for page in pages:
            for key in ("title", "bodyMarkdown", "prompt", "estimatedSeconds"):
                page.setdefault(key, None)
            page["metadata"] = page.get("metadata") or {}
            page["roundType"] = derive_round_type(page["type"])
            page["chunkIds"] = page.get("chunkIds") or _inherited_chunk_ids(page, session)
        session["pages"] = pages
    data["sessions"] = sessions
    return data


def _inherited_chunk_ids(page: dict[str, Any], session: dict[str, Any]) -> list[str]:
    if page["type"] not in CHUNK_SCOPED_PAGE_TYPES:
        return []
    if page["type"] == "poem_chunk" and page["metadata"].get("scope") == "whole_poem":
        return []
    return list(session["chunkIds"])


def holds_content(guide: Guide, payload: dict[str, Any]) -> bool:
    """True when this Studio copy has the same content as the guide JSON."""
    wanted = comparable(payload)
    if comparable(build_guided_plan(guide)) == wanted:
        return True
    snapshot = guide.import_snapshot_json
    return bool(snapshot) and comparable(snapshot) == wanted


def saved_versions(db: Session, external_id: str) -> dict[int, Guide]:
    rows = db.scalars(select(Guide).where(Guide.external_id == external_id, Guide.version > 0)).all()
    return {row.version: row for row in rows}


def next_free_version(db: Session, guide: Guide, *also: int) -> int:
    return max([guide.content_version, *saved_versions(db, guide.external_id), *also]) + 1


def record_version(db: Session, working: Guide, status_label: str | None = None) -> Guide:
    """Save the working copy as the read-only version with its content_version.

    If that version is saved already, it must hold the same content: a version
    number never names two different guides.
    """
    from app.services.guide_service import copy_guide_contents

    number = working.content_version
    existing = saved_versions(db, working.external_id).get(number)
    if existing is not None:
        if not holds_content(existing, build_guided_plan(working)):
            raise version_taken(number, next_free_version(db, working))
        return existing
    saved = Guide(external_id=working.external_id, version=number)
    db.add(saved)
    copy_guide_contents(db, source=working, target=saved)
    if status_label:
        saved.status = status_label
    db.flush()
    return saved


def highest_version(db: Session, working: Guide) -> int:
    return max([working.content_version, *saved_versions(db, working.external_id)])


def keep_working_copy(db: Session, working: Guide) -> None:
    """Save the working copy as its own version, so nothing is lost when it is replaced.

    Refuses when that version is saved already with other content: the working
    copy then has changes that only a higher version number can keep.
    """
    own = saved_versions(db, working.external_id).get(working.content_version)
    if own is None:
        record_version(db, working)
    elif not holds_content(own, build_guided_plan(working)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The latest copy has changes that are not in a saved version. Raise its version to "
            f"{next_free_version(db, working)} and click Save version first, so the changes are kept.",
        )


def promote_highest(db: Session, working: Guide) -> int | None:
    """Make the highest saved version the working copy when it is above it. Returns its number."""
    from app.services.guide_service import copy_guide_contents

    saved = saved_versions(db, working.external_id)
    number = max(saved, default=0)
    if number <= working.content_version:
        return None
    keep_working_copy(db, working)
    # The saved version's status comes along: "exported" stays exported.
    copy_guide_contents(db, source=saved[number], target=working)
    db.flush()
    return number


def version_taken(number: int, free: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"Version {number} is already saved with different content. "
        f"Raise the version to {free} first, so each version number keeps one content.",
    )
