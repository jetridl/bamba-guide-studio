"""Review notes: the rules guides and Journeys share.

A note is open until someone accepts, resolves or dismisses it. Approval needs
every note closed. A new or reopened note on an approved guide or Journey sends
it back to in review. Notes come from an imported review file (guides) or are
written in the Studio (guides and Journeys).
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status

SEVERITIES = ("note", "suggestion", "warning", "blocking")
CATEGORIES = (
    "tone", "pacing", "clarity", "difficulty", "memorisation",
    "literary_accuracy", "schema", "chunking", "ux", "copy",
)
CLOSED_STATUSES = {"accepted", "dismissed", "resolved"}
STATUSES = {"open", *CLOSED_STATUSES}
# The reviewer name when a note written in the Studio gives none.
STUDIO_REVIEWER = "Studio editor"


def reviewer_name(name: str | None) -> str:
    return (name or "").strip() or STUDIO_REVIEWER


def check_status(value: str) -> None:
    if value not in STATUSES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid comment status.")


def require_notes_closed(open_count: int) -> None:
    """Refuse approval while any review note is open."""
    if open_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Close every review note first: accept, resolve or dismiss it. "
            f"{open_count} {'note is' if open_count == 1 else 'notes are'} still open.",
        )


def note_dict(note: Any, reviewer: str) -> dict[str, Any]:
    """One shape for guide and Journey notes."""
    return {
        "id": str(note.id),
        "externalId": note.external_id,
        "targetType": note.target_type,
        "targetId": note.target_external_id,
        "field": getattr(note, "field", None),
        "severity": note.severity,
        "category": note.category,
        "comment": note.comment,
        "suggestedRevision": note.suggested_revision,
        "status": note.status,
        "reviewer": reviewer,
        "createdAt": note.created_at.isoformat() if note.created_at else None,
    }
