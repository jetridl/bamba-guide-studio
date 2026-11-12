"""Load guide JSON files from disk into the database.

Startup loads the canonical approved guides from exports/curated_poems. The
Refresh button scans guides/json, which links those guides and also holds new
drafts. Both follow the same rules:

- A guide Studio does not know is imported as a new guide.
- A version Studio does not hold yet is added as a read-only saved version.
- A version Studio holds already is skipped. If the file has different
  content, it is reported as a problem: one version number, one content.
- The working copy always has the highest version. When a higher version is
  saved, it becomes the working copy, and the old working copy is kept as a
  saved version. Unsaved changes in the working copy stop this; Studio reports
  it, and changes nothing.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Guide, Poem
from app.services.guide_service import approve_guide, get_guide_or_404
from app.services.guide_versions import holds_content, next_free_version, promote_highest
from app.services.import_service import add_saved_version, check_guide_schema, import_guide, upsert_poem
from app.services.validation_service import validate_guide

logger = logging.getLogger(__name__)

PUBLISHED_STATUSES = {"approved", "exported"}


@dataclass
class LoadReport:
    loaded: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    # One plain sentence per failed file, for the Studio page.
    problems: list[str] = field(default_factory=list)

    def fail(self, name: str, reason: str) -> None:
        logger.warning("Skipped %s: %s", name, reason)
        self.failed.append(name)
        self.problems.append(f"{name}: {reason}")


def load_published_guides(db: Session, directory: Path) -> LoadReport:
    """Load exports/curated_poems/<folder>/guided_plan.json files."""
    if not directory.is_dir():
        logger.info("Published guides folder %s not found; nothing to load.", directory)
        return LoadReport()
    paths = sorted(directory.glob("*/guided_plan.json"))
    report = _load_guide_files(db, [(path.parent.name, path) for path in paths])
    _log_report("Published guides", report)
    return report


def load_guide_folder(db: Session, directory: Path) -> LoadReport:
    """Load guides/json/<author-name>--<poem-title>.json files, including symlinks."""
    if not directory.is_dir():
        logger.info("Guides folder %s not found; nothing to load.", directory)
        return LoadReport()
    paths = sorted(directory.glob("*.json"))
    report = _load_guide_files(db, [(path.stem, path) for path in paths])
    _log_report("Guides folder", report)
    return report


def _load_guide_files(db: Session, files: list[tuple[str, Path]]) -> LoadReport:
    report = LoadReport()
    for name, path in files:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            guide_id = payload["guide"]["id"]
            poem_id = payload["poem"]["id"]
        except (OSError, ValueError, KeyError, TypeError) as error:
            report.fail(name, f"cannot read the guide JSON ({error}).")
            continue

        known = db.scalars(select(Guide).where(Guide.external_id == guide_id)).all()
        if known:
            before = len(report.loaded)
            _load_version(db, name, payload, list(known), report)
            _promote(db, name, guide_id, report, added=len(report.loaded) > before)
            continue
        other = db.scalar(select(Guide.external_id).join(Poem).where(Poem.external_id == poem_id).limit(1))
        if other is not None:
            report.fail(name, f"the guide ID {guide_id} is new, but guide {other} already uses poem {poem_id}. "
                        "Use the same guide ID to add a version.")
            continue

        try:
            imported = import_guide(db, payload)
        except HTTPException as error:
            db.rollback()
            report.fail(name, f"import failed ({_detail(error)}).")
            continue

        working = get_guide_or_404(db, uuid.UUID(imported["id"]))
        if payload["guide"].get("status") in PUBLISHED_STATUSES:
            try:
                approve_guide(db, working)
            except HTTPException as error:
                db.rollback()
                logger.warning("Loaded %s as draft: it does not pass approval (%s).", name, error.detail)
        _keep_file_version(db, payload, working.poem)
        report.loaded.append(name)
    return report


def _load_version(db: Session, name: str, payload: dict, known: list[Guide], report: LoadReport) -> None:
    """Add the file as a saved version when Studio does not hold its version yet."""
    try:
        check_guide_schema(payload)
    except HTTPException as error:
        report.fail(name, f"the file does not match the schema ({_detail(error)}).")
        return
    number = payload["guide"]["version"]
    saved = {guide.version: guide for guide in known if guide.version > 0}
    working = next((guide for guide in known if guide.version == 0), None)

    holder = saved.get(number) or (working if working and working.content_version == number else None)
    if holder is not None:
        if holds_content(holder, payload):
            if number not in saved:
                # Keep the file as a version, so later edits in Studio never clash with it.
                _keep_file_version(db, payload, holder.poem)
            report.skipped.append(name)
        else:
            highest = max([*saved, working.content_version if working else 0, number])
            report.fail(
                name,
                f"Studio already holds version {number} with different content. "
                f"Set the version in the file to {highest + 1} and click Refresh again.",
            )
        return

    newest = number > max([*saved, working.content_version if working else 0])
    try:
        # The poem is shared by every version. Only the newest version may change it.
        poem = upsert_poem(db, payload) if newest else known[0].poem
        _keep_file_version(db, payload, poem)
    except HTTPException as error:
        db.rollback()
        report.fail(name, f"import failed ({_detail(error)}).")
        return
    report.loaded.append(f"{name} (version {number})")


def _promote(db: Session, name: str, guide_id: str, report: LoadReport, added: bool) -> None:
    """Make the highest saved version the working copy. `added` says the file was just saved as a version."""
    working = db.scalar(select(Guide).where(Guide.external_id == guide_id, Guide.version == 0))
    if working is None:
        return
    try:
        number = promote_highest(db, working)
    except HTTPException:
        db.rollback()
        report.fail(
            name,
            f"a higher version is saved, but the latest copy (version {working.content_version}) has changes "
            f"that are not in a saved version. Raise its version to {next_free_version(db, working)} and click "
            "Save version, so the changes are kept.",
        )
        return
    if number is None:
        return
    db.commit()
    if added:
        report.loaded[-1] = f"{name} (version {number}, now the latest copy)"
    else:
        if report.skipped and report.skipped[-1] == name:
            report.skipped.pop()
        report.loaded.append(f"{name} (version {number} is now the latest copy)")


def _keep_file_version(db: Session, payload: dict, poem: Poem) -> None:
    """Save the file as the read-only version with its own number."""
    row = add_saved_version(db, payload, poem)
    if payload["guide"].get("status") in PUBLISHED_STATUSES and not _blocking(row):
        row.status = payload["guide"]["status"]
    db.commit()


def _blocking(guide: Guide) -> bool:
    return any(issue["severity"] == "blocking" for issue in validate_guide(guide)["issues"])


def _detail(error: HTTPException) -> str:
    detail = error.detail
    if isinstance(detail, dict):
        errors = detail.get("errors") or detail.get("issues") or []
        return f"{detail.get('message', '')} {errors[0] if errors else ''}".strip()
    return str(detail)


def _log_report(label: str, report: LoadReport) -> None:
    logger.info(
        "%s: %d loaded, %d already in Studio, %d failed.",
        label,
        len(report.loaded),
        len(report.skipped),
        len(report.failed),
    )
