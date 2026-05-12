from __future__ import annotations

from typing import Any

from app.models import Guide, GuidePage, GuideReviewComment, GuideSession, Poem, PoemChunk


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
        "roundType": page.round_type,
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
        "chunks": [chunk_to_dict(chunk) for chunk in sorted(poem.chunks, key=lambda item: item.order_index)],
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
        "status": guide.status,
        "poemTitle": guide.poem.title,
        "poemAuthor": guide.poem.author,
        "sessionCount": len(guide.sessions),
        "updatedAt": guide.updated_at.isoformat() if guide.updated_at else None,
    }
