from __future__ import annotations

from typing import Any

from sqlalchemy.orm import object_session

from app.models import Guide, GuidePage, GuideReviewComment, GuideSession, Poem, PoemChunk
from app.services.chunk_ordering import chunk_sort_key
from app.services.page_types import derive_round_type


def page_to_dict(page: GuidePage) -> dict[str, Any]:
    return {
        "id": str(page.id),
        "externalId": page.external_id,
        "type": page.page_type,
        "orderIndex": page.order_index,
        "title": page.title,
        "bodyMarkdown": page.body_markdown,
        "prompt": page.prompt,
        "chunkIds": page.chunk_ids_json or [],
        "roundType": derive_round_type(page.page_type),
        "estimatedSeconds": page.estimated_seconds,
        "metadata": page.metadata_json or {},
    }


def session_to_dict(session: GuideSession) -> dict[str, Any]:
    return {
        "id": str(session.id),
        "externalId": session.external_id,
        "sessionNumber": session.session_number,
        "title": session.title,
        "subtitle": session.subtitle,
        "focusSummary": session.focus_summary,
        "orderIndex": session.order_index,
        "chunkIds": session.chunk_ids_json or [],
        "metadata": session.metadata_json or {},
        "pages": [page_to_dict(page) for page in sorted(session.pages, key=lambda item: item.order_index)],
    }


def chunk_to_dict(chunk: PoemChunk) -> dict[str, Any]:
    return {
        "id": str(chunk.id),
        "externalId": chunk.external_id,
        "sectionId": chunk.section.external_id if chunk.section else None,
        "orderIndex": chunk.order_index,
        "text": chunk.text,
        "metadata": chunk.metadata_json or {},
    }


def poem_to_dict(poem: Poem) -> dict[str, Any]:
    return {
        "id": str(poem.id),
        "externalId": poem.external_id,
        "title": poem.title,
        "author": poem.author,
        "text": poem.text,
        "year": poem.year,
        "metadata": poem.metadata_json or {},
        **({"coverImage": poem.cover_image_json} if poem.cover_image_json else {}),
        "chunks": [chunk_to_dict(chunk) for chunk in sorted(poem.chunks, key=chunk_sort_key)],
    }


def comment_to_dict(comment: GuideReviewComment) -> dict[str, Any]:
    return {
        "id": str(comment.id),
        "externalId": comment.external_id,
        "targetType": comment.target_type,
        "targetId": comment.target_external_id,
        "field": comment.field,
        "severity": comment.severity,
        "category": comment.category,
        "comment": comment.comment,
        "suggestedRevision": comment.suggested_revision,
        "status": comment.status,
    }


def guide_to_dict(guide: Guide) -> dict[str, Any]:
    from app.services.guide_versions import next_free_version
    from app.services.publish_service import published_version

    db = object_session(guide)
    comments = [
        comment
        for review in guide.reviews
        for comment in review.comments
    ]
    open_blocking_comments = [
        comment for comment in comments if comment.status == "open" and comment.severity == "blocking"
    ]
    return {
        "id": str(guide.id),
        "externalId": guide.external_id,
        "title": guide.title,
        "description": guide.description,
        "version": guide.version,
        "versionLabel": "latest" if guide.version == 0 else f"v{guide.version}",
        "contentVersion": guide.content_version,
        "publishedVersion": published_version(guide.external_id),
        # The number "Raise to N" offers: above the latest copy and every saved version.
        "nextFreeVersion": next_free_version(db, guide) if db is not None else guide.content_version + 1,
        "status": guide.status,
        "metadata": guide.metadata_json or {},
        "poem": poem_to_dict(guide.poem),
        "sessions": [session_to_dict(session) for session in sorted(guide.sessions, key=lambda item: item.order_index)],
        "reviewSummary": {
            "openComments": len([comment for comment in comments if comment.status == "open"]),
            "openBlockingComments": len(open_blocking_comments),
        },
    }


def guide_summary_to_dict(guide: Guide) -> dict[str, Any]:
    return {
        "id": str(guide.id),
        "externalId": guide.external_id,
        "title": guide.title,
        "description": guide.description,
        "version": guide.version,
        "versionLabel": "latest" if guide.version == 0 else f"v{guide.version}",
        "contentVersion": guide.content_version,
        "status": guide.status,
        "poemTitle": guide.poem.title,
        "poemAuthor": guide.poem.author,
        "sessionCount": len(guide.sessions),
        "updatedAt": guide.updated_at.isoformat() if guide.updated_at else None,
    }


def guide_version_to_dict(guide: Guide) -> dict[str, Any]:
    timestamp = guide.updated_at if guide.version == 0 else guide.created_at
    return {
        "id": str(guide.id),
        "version": guide.version,
        "versionLabel": "latest" if guide.version == 0 else f"v{guide.version}",
        "contentVersion": guide.content_version,
        "status": guide.status,
        "isLatest": guide.version == 0,
        "timestamp": timestamp.isoformat() if timestamp else None,
    }


def guide_group_summary_to_dict(guides: list[Guide], published_version: int | None = None) -> dict[str, Any]:
    saved_versions = sorted([guide.version for guide in guides if guide.version > 0])
    latest = next((guide for guide in guides if guide.version == 0), None)
    if latest is None:
        latest = max(guides, key=lambda guide: guide.version)
    return {
        **guide_summary_to_dict(latest),
        "versionLabel": "latest" if latest.version == 0 else f"v{latest.version}",
        "savedVersions": saved_versions,
        "savedVersionCount": len(saved_versions),
        "latestSavedVersion": saved_versions[-1] if saved_versions else None,
        # The version in exports/, and the highest version Studio holds above it (not published yet).
        "publishedVersion": published_version,
        "newerVersion": _newer_version(guides, published_version),
    }


def _newer_version(guides: list[Guide], published_version: int | None) -> int | None:
    if published_version is None:
        return None
    highest = max(guide.content_version for guide in guides)
    return highest if highest > published_version else None
