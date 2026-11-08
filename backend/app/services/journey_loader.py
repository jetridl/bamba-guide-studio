"""Load Journey files (<folder>/<journey_id>/journey.json) into the database.

Startup loads the published Journeys in exports/journeys. The Refresh button on
the Journeys page loads exports/journeys and then the drafts in guides/journeys.
Both only add Journeys the database does not know yet, so work done in Studio is
never overwritten by the file on disk. A file marked approved or exported keeps
that status when it passes validation; every other Journey loads as a draft.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Poem
from app.models.journey import Journey, JourneyPoem
from app.services.journey_service import validation
from app.services.json_schema import validate_json_schema

logger = logging.getLogger(__name__)

PUBLISHED_STATUSES = {"approved", "exported"}


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
    """Load every folder in order. A Journey found twice (a guides/journeys link) is reported once."""
    report = JourneyLoadReport()
    seen: set[str] = set()
    for directory in directories:
        if not directory.is_dir():
            logger.info("Journeys folder %s not found; nothing to load.", directory)
            continue
        for path in sorted(directory.glob("*/journey.json")):
            if path.parent.name not in seen:
                seen.add(path.parent.name)
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
    if db.scalar(select(Journey.id).where(Journey.external_id == data["id"]).limit(1)) is not None:
        report.skipped.append(name)
        return

    poem_ids = [item["poemId"] for item in payload["poems"]]
    if len(poem_ids) != len(set(poem_ids)):
        report.fail(name, "a poem appears more than once.")
        return
    poems = {poem.external_id: poem for poem in db.scalars(select(Poem).where(Poem.external_id.in_(poem_ids)))}
    missing = [poem_id for poem_id in poem_ids if poem_id not in poems]
    if missing:
        report.fail(name, f"Studio does not hold {', '.join(missing)} yet. Refresh the guides first.")
        return

    cover = data.get("coverImage")
    journey = Journey(
        external_id=data["id"],
        title=data["title"],
        subtitle=data["subtitle"],
        curator=data["curator"],
        version=data["version"],
        status="draft",
        introduction_json=data["introduction"],
        closing_json=data.get("closing") or [],
        cover_image_json={"path": cover["path"], "alt": cover["alt"]} if cover else None,
        poems=[
            JourneyPoem(
                external_id=f"{data['id']}:{item['poemId']}",
                poem=poems[item["poemId"]],
                order_index=index,
                note_json=item["note"],
            )
            for index, item in enumerate(payload["poems"])
        ],
    )
    db.add(journey)
    db.flush()
    if data["status"] in PUBLISHED_STATUSES:
        if validation(db, journey)["valid"]:
            journey.status = data["status"]
        else:
            logger.warning("Loaded Journey %s as a draft: it does not pass validation.", name)
    db.commit()
    report.loaded.append(name)
