"""Load Journey files (<folder>/<journey_id>/journey.json) into the database.

Startup loads the published Journeys in exports/journeys. The Refresh button on
the Journeys page loads exports/journeys and then the drafts in guides/journeys.
Both follow the same rules:

- A Journey Studio does not know is added. A file marked approved or exported
  keeps that status when it passes validation; any other Journey is a draft.
- A version Studio does not hold yet is added as a read-only saved version.
- A version Studio holds already is skipped. If the file has different
  content, it is reported as a problem: one version number, one content.
- The latest copy always has the highest version. When a higher version is
  saved, it becomes the latest copy, and the old one is kept as a version.
  Unsaved changes in the latest copy stop this; Studio reports it.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.journey import Journey
from app.services.journey_service import payload as journey_payload
from app.services.journey_versions import (
    PUBLISHED_STATUSES,
    add_version,
    apply_content,
    next_free_version,
    poems_for,
    promote_highest,
    published_status,
    same_content,
    saved_versions,
)
from app.services.json_schema import validate_json_schema

logger = logging.getLogger(__name__)


@dataclass
class JourneyLoadReport:
    loaded: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    # One plain sentence per failed folder, for the Studio page.
    problems: list[str] = field(default_factory=list)

    def fail(self, name: str, reason: str) -> None:
        logger.warning("Skipped Journey %s: %s", name, reason)
        self.failed.append(name)
        self.problems.append(f"{name}: {reason}")


def load_journey_folders(db: Session, directories: list[Path]) -> JourneyLoadReport:
    """Load every folder in order. A file found twice (a guides/journeys link) is read once."""
    report = JourneyLoadReport()
    seen: set[Path] = set()
    for directory in directories:
        if not directory.is_dir():
            logger.info("Journeys folder %s not found; nothing to load.", directory)
            continue
        for path in sorted(directory.glob("*/journey.json")):
            if path.resolve() not in seen:
                seen.add(path.resolve())
                _load_journey_file(db, path, report)
    logger.info(
        "Journeys: %d loaded, %d already in Studio, %d failed.",
        len(report.loaded),
        len(report.skipped),
        len(report.failed),
    )
    return report


def _load_journey_file(db: Session, path: Path, report: JourneyLoadReport) -> None:
    name = path.parent.name
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        report.fail(name, f"cannot read journey.json ({error}).")
        return

    errors = validate_json_schema(payload, "journey.schema.json") if isinstance(payload, dict) else ["$: not an object"]
    if errors:
        report.fail(name, f"journey.json does not match the schema ({errors[0]}).")
        return

    data = payload["journey"]
    journey = db.scalar(select(Journey).where(Journey.external_id == data["id"]))
    if journey is not None:
        before = len(report.loaded)
        _load_version(db, name, journey, payload, report)
        _promote(db, name, journey, report, added=len(report.loaded) > before)
        return
    try:
        poems = poems_for(db, payload)
    except ValueError as error:
        report.fail(name, str(error))
        return

    journey = Journey(status="draft")
    apply_content(journey, payload, poems)
    db.add(journey)
    if data["status"] in PUBLISHED_STATUSES:
        status = published_status(db, journey, data["status"])
        # An exported file stays exported: it is the published copy.
        journey.status = data["status"] if status == "approved" else status
        if status == "draft":
            logger.warning("Loaded Journey %s as a draft: it does not pass validation.", name)
    add_version(db, journey, payload)
    db.commit()
    report.loaded.append(name)


def _load_version(db: Session, name: str, journey: Journey, data: dict, report: JourneyLoadReport) -> None:
    number = data["journey"]["version"]
    saved = saved_versions(db, journey)
    if number in saved or number == journey.version:
        held = saved[number].payload_json if number in saved else journey_payload(journey)
        if same_content(held, data):
            if number not in saved:
                # Keep the file as a version, so later edits in Studio never clash with it.
                add_version(db, journey, data)
                db.commit()
            report.skipped.append(name)
        else:
            report.fail(
                name,
                f"Studio already holds version {number} with different content. "
                f"Set the version in the file to {next_free_version(db, journey, number)} and click Refresh again.",
            )
        return
    try:
        poems_for(db, data)
    except ValueError as error:
        report.fail(name, str(error))
        return
    add_version(db, journey, data)
    db.commit()
    report.loaded.append(f"{name} (version {number})")


def _promote(db: Session, name: str, journey: Journey, report: JourneyLoadReport, added: bool) -> None:
    """Make the highest saved version the editable copy. `added` says the file was just saved as a version."""
    current = journey.version
    try:
        number = promote_highest(db, journey)
    except HTTPException as error:
        db.rollback()
        report.fail(name, f"a higher version is saved, but it cannot become the latest copy (version {current}): "
                    f"{error.detail}")
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
