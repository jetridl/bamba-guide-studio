"""Load guide JSON files from disk into the database.

Startup loads the canonical approved guides from exports/curated_poems. The
Refresh button scans guides/json, which links those guides and also holds new
drafts. Both only add guides the database does not know yet, so work done in
Studio is never overwritten by the file on disk.
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
from app.services.import_service import import_guide

logger = logging.getLogger(__name__)

PUBLISHED_STATUSES = {"approved", "exported"}


@dataclass
class LoadReport:
    loaded: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)


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
            logger.warning("Skipped %s: cannot read guide JSON (%s).", name, error)
            report.failed.append(name)
            continue

        # Skip anything Studio already holds: the database copy may have edits.
        known = db.scalar(select(Guide.id).where(Guide.external_id == guide_id).limit(1)) or db.scalar(
            select(Poem.id).where(Poem.external_id == poem_id).limit(1)
        )
        if known is not None:
            report.skipped.append(name)
            continue

        try:
            imported = import_guide(db, payload)
        except HTTPException as error:
            db.rollback()
            logger.warning("Skipped %s: import failed (%s).", name, error.detail)
            report.failed.append(name)
            continue

        if payload["guide"].get("status") in PUBLISHED_STATUSES:
            try:
                approve_guide(db, get_guide_or_404(db, uuid.UUID(imported["id"])))
            except HTTPException as error:
                db.rollback()
                logger.warning("Loaded %s as draft: it does not pass approval (%s).", name, error.detail)
        report.loaded.append(name)
    return report


def _log_report(label: str, report: LoadReport) -> None:
    logger.info(
        "%s: %d loaded, %d already in Studio, %d failed.",
        label,
        len(report.loaded),
        len(report.skipped),
        len(report.failed),
    )
