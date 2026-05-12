from __future__ import annotations

from collections import Counter
from typing import Any

from app.models import Guide, GuidePage, GuideSession
from app.services.export_service import build_guided_plan
from app.services.json_schema import validate_json_schema

TEXT_PAGE_TYPES = {"intro", "context", "poet_background", "poem_background", "recap", "commentary", "completion"}
GAME_PAGE_TYPES = {"last_word_game", "first_last_word_game", "hidden_word_game"}
KNOWN_PAGE_TYPES = TEXT_PAGE_TYPES | GAME_PAGE_TYPES | {"poem_chunk", "reflection"}


def validate_guide(guide: Guide) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    _schema_issues(guide, issues)
    _editorial_issues(guide, issues)
    blocking_count = len([issue for issue in issues if issue["severity"] == "blocking"])
    return {"valid": blocking_count == 0, "blockingCount": blocking_count, "issues": issues}


def _schema_issues(guide: Guide, issues: list[dict[str, Any]]) -> None:
    try:
        payload = build_guided_plan(guide)
    except Exception as exc:
        issues.append(_issue("blocking", "export_build_failed", str(exc), "guide", guide.external_id))
        return
    for message in validate_json_schema(payload, "guided-plan.schema.json"):
        issues.append(_issue("blocking", "schema", message, "guide", guide.external_id))


def _editorial_issues(guide: Guide, issues: list[dict[str, Any]]) -> None:
    if not guide.external_id:
        issues.append(_issue("blocking", "missing_guide_id", "Missing guide id.", "guide", None))
    if not guide.poem.external_id:
        issues.append(_issue("blocking", "missing_poem_id", "Missing poem id.", "guide", guide.external_id))
    if not guide.poem.title:
        issues.append(_issue("blocking", "missing_poem_title", "Missing poem title.", "guide", guide.external_id))
    if not guide.poem.text:
        issues.append(_issue("blocking", "missing_poem_text", "Missing poem text.", "guide", guide.external_id))
    if not guide.sessions:
        issues.append(_issue("blocking", "no_sessions", "Guide has no sessions.", "guide", guide.external_id))

    chunk_ids = {chunk.external_id for chunk in guide.poem.chunks}
    session_orders = Counter(session.order_index for session in guide.sessions)
    for order, count in session_orders.items():
        if count > 1:
            issues.append(_issue("blocking", "duplicate_session_order", f"Duplicate session order {order}.", "guide", guide.external_id))

    for session in guide.sessions:
        _validate_session(session, chunk_ids, issues)

    for review in guide.reviews:
        for comment in review.comments:
            if comment.status == "open" and comment.severity == "blocking":
                issues.append(
                    _issue(
                        "blocking",
                        "open_blocking_review_comment",
                        comment.comment,
                        comment.target_type,
                        comment.target_external_id,
                        comment.field,
                    )
                )


def _validate_session(session: GuideSession, chunk_ids: set[str], issues: list[dict[str, Any]]) -> None:
    if not session.pages:
        issues.append(_issue("blocking", "session_has_no_pages", "Session has no pages.", "session", session.external_id))
        return

    page_orders = Counter(page.order_index for page in session.pages)
    for order, count in page_orders.items():
        if count > 1:
            issues.append(_issue("blocking", "duplicate_page_order", f"Duplicate page order {order}.", "session", session.external_id))

    estimated_seconds = sum(page.estimated_seconds or 0 for page in session.pages)
    estimated_minutes = session.metadata_json.get("estimatedMinutes") if session.metadata_json else None
    if estimated_minutes is None and estimated_seconds:
        estimated_minutes = estimated_seconds / 60
    if estimated_minutes and estimated_minutes > 12:
        issues.append(_issue("warning", "session_too_long", "Session estimated time is over 12 minutes.", "session", session.external_id))

    if len(session.pages) > 8:
        issues.append(_issue("warning", "too_many_pages", "Session has more than 8 pages.", "session", session.external_id))
    if not any(page.page_type == "reflection" for page in session.pages):
        issues.append(_issue("warning", "missing_reflection", "Session is missing a reflection page.", "session", session.external_id))
    if not any(page.page_type == "completion" for page in session.pages):
        issues.append(_issue("warning", "missing_completion", "Session is missing a completion page.", "session", session.external_id))

    titles = [page.title for page in session.pages if page.title]
    for title, count in Counter(titles).items():
        if count > 1:
            issues.append(_issue("suggestion", "repeated_page_title", f'Repeated page title "{title}".', "session", session.external_id))

    _validate_runs(session.pages, issues)
    for page in session.pages:
        _validate_page(page, chunk_ids, issues)


def _validate_runs(pages: list[GuidePage], issues: list[dict[str, Any]]) -> None:
    run_type: str | None = None
    run_count = 0
    for page in sorted(pages, key=lambda item: item.order_index):
        current = "game" if page.page_type in GAME_PAGE_TYPES else "text" if page.page_type in {"context", "commentary"} else None
        if current and current == run_type:
            run_count += 1
        else:
            run_type = current
            run_count = 1 if current else 0
        if current == "game" and run_count > 3:
            issues.append(_issue("warning", "too_many_games_in_row", "More than 3 games in a row.", "page", page.external_id))
        if current == "text" and run_count > 3:
            issues.append(_issue("warning", "too_many_text_pages_in_row", "More than 3 context/commentary pages in a row.", "page", page.external_id))


def _validate_page(page: GuidePage, chunk_ids: set[str], issues: list[dict[str, Any]]) -> None:
    if page.page_type not in KNOWN_PAGE_TYPES:
        issues.append(_issue("blocking", "unknown_page_type", "Page type is unknown.", "page", page.external_id, "type"))
    if page.page_type in TEXT_PAGE_TYPES and not page.body_markdown:
        issues.append(_issue("blocking", "missing_body", "Text page is missing bodyMarkdown.", "page", page.external_id, "bodyMarkdown"))
    if page.page_type == "reflection" and not page.prompt:
        issues.append(_issue("blocking", "missing_prompt", "Reflection page is missing prompt.", "page", page.external_id, "prompt"))
    if page.page_type in GAME_PAGE_TYPES and not page.chunk_ids_json:
        issues.append(_issue("blocking", "game_without_chunks", "Game page references no chunks.", "page", page.external_id, "chunkIds"))
    if page.page_type == "poem_chunk" and not page.chunk_ids_json:
        issues.append(_issue("blocking", "poem_chunk_without_chunks", "Poem chunk page references no chunks.", "page", page.external_id, "chunkIds"))
    for chunk_id in page.chunk_ids_json or []:
        if chunk_id not in chunk_ids:
            issues.append(_issue("blocking", "missing_chunk_reference", f"Page references missing chunk {chunk_id}.", "page", page.external_id, "chunkIds"))
    if page.body_markdown and len(page.body_markdown.split()) > 120 and page.page_type == "commentary":
        issues.append(_issue("warning", "commentary_too_long", "Commentary page body is longer than 120 words.", "page", page.external_id))
    if page.page_type == "intro" and page.body_markdown and len(page.body_markdown.split()) < 8:
        issues.append(_issue("suggestion", "intro_very_short", "Intro page is very short.", "page", page.external_id))
    if page.page_type == "poem_chunk" and len(page.chunk_ids_json or []) > 4:
        issues.append(_issue("suggestion", "too_many_chunks", "Poem chunk page links many chunks.", "page", page.external_id, "chunkIds"))


def _issue(
    severity: str,
    code: str,
    message: str,
    target_type: str,
    target_id: str | None,
    field: str | None = None,
) -> dict[str, Any]:
    return {
        "severity": severity,
        "code": code,
        "message": message,
        "targetType": target_type,
        "targetId": target_id,
        "field": field,
    }
