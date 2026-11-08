"""Publish an approved Journey into exports/journeys and link it from guides/journeys.

Layout (see exports/README.md):
    exports/journeys/<journey_id>/journey.json      canonical file
    exports/journeys/<journey_id>/<cover image>     copied from guides/journeys/<journey_id>/
    guides/journeys/<journey_id>/journey.json       symlink to the canonical file

The Bamba app links exports/journeys as assets/journeys, beside the poems in
exports/curated_poems. It shows a Journey only when every poem is bundled, and
it refreshes a Journey on a device only when the version rises.
"""

from __future__ import annotations

import filecmp
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.journey import Journey
from app.services.journey_service import payload, validation
from app.services.publish_service import PLAN_FILENAME, _write_atomically

JOURNEY_FILENAME = "journey.json"


def _conflict(detail: Any) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def publish_journey(
    db: Session, journey: Journey, exports_dir: Path, poems_dir: Path, drafts_dir: Path | None
) -> dict[str, Any]:
    if journey.status not in {"approved", "exported"}:
        raise _conflict("Approve the Journey before you publish it.")
    result = validation(db, journey)
    if not result["valid"]:
        raise _conflict({"message": "The Journey has blocking issues.", **result})

    bundled = _published_poem_ids(poems_dir)
    ordered = sorted(journey.poems, key=lambda item: item.order_index)
    unpublished = [item.poem.title for item in ordered if item.poem.external_id not in bundled]
    if unpublished:
        raise _conflict(
            f"Publish the guides for {', '.join(unpublished)} first. "
            "The app shows a Journey only when it bundles every poem in it."
        )

    folder = journey.external_id
    data = payload(journey)
    data["journey"]["status"] = "exported"
    plan_path = exports_dir / folder / JOURNEY_FILENAME
    display = f"exports/journeys/{folder}/{JOURNEY_FILENAME}"

    existing = _read_json(plan_path)
    created = existing is None
    if existing is not None and _without_status(existing) != _without_status(data):
        existing_journey = existing.get("journey") if isinstance(existing, dict) else None
        if not isinstance(existing_journey, dict) or existing_journey.get("id") != folder:
            raise _conflict(f"{display} holds a different Journey. Nothing was written.")
        published_version = existing_journey.get("version")
        if isinstance(published_version, int) and journey.version <= published_version:
            raise _conflict(
                f"{display} already holds version {published_version}. Raise the Journey version above "
                f"{published_version} and save, so the app refreshes it on devices that have it."
            )

    cover = journey.cover_image_json
    cover_name = cover["path"] if cover else None
    if cover_name:
        _place_cover(folder, cover_name, exports_dir / folder, drafts_dir)

    try:
        _write_atomically(plan_path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    except OSError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not write {plan_path}: {error.strerror or error}. Check that the folder exists and is writable.",
        ) from error
    journey.status = "exported"
    db.commit()

    warnings: list[str] = []
    link = None
    if drafts_dir is not None:
        link = _link_journey(drafts_dir / folder, plan_path, folder, warnings)
        if cover_name:
            _link_cover(drafts_dir / folder / cover_name, exports_dir / folder / cover_name, folder, warnings)
    return {"folder": folder, "path": display, "link": link, "created": created, "warnings": warnings}


def _published_poem_ids(poems_dir: Path) -> set[str]:
    ids: set[str] = set()
    for path in poems_dir.glob(f"*/{PLAN_FILENAME}"):
        data = _read_json(path)
        try:
            ids.add(data["poem"]["id"])  # type: ignore[index]
        except (KeyError, TypeError):
            continue
    return ids


def _without_status(data: Any) -> Any:
    """The content the app sees. Publishing an approved file as exported is not a change."""
    if not isinstance(data, dict) or not isinstance(data.get("journey"), dict):
        return data
    return {**data, "journey": {key: value for key, value in data["journey"].items() if key != "status"}}


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _place_cover(folder: str, name: str, target_dir: Path, drafts_dir: Path | None) -> None:
    """Copy the cover from guides/journeys/<id>/ beside the published journey.json."""
    target = target_dir / name
    source = drafts_dir / folder / name if drafts_dir is not None else None
    if source is not None and source.is_file():
        if target.exists() and os.path.samefile(source, target):
            return
        target_dir.mkdir(parents=True, exist_ok=True)
        handle, temp_name = tempfile.mkstemp(dir=target_dir, prefix=f".{target.stem}.", suffix=".tmp")
        os.close(handle)
        try:
            shutil.copyfile(source, temp_name)
            os.chmod(temp_name, 0o644)
            os.replace(temp_name, target)
        except BaseException:
            Path(temp_name).unlink(missing_ok=True)
            raise
        return
    if not target.is_file():
        raise _conflict(
            f"The cover image {name} is missing. Put it at guides/journeys/{folder}/{name} and publish again. "
            "The app loads the cover from the same folder as journey.json."
        )


def _link_journey(draft_dir: Path, plan_path: Path, folder: str, warnings: list[str]) -> str | None:
    """Point guides/journeys/<id>/journey.json at the published file. Never discards another Journey's draft."""
    link_path = draft_dir / JOURNEY_FILENAME
    display = f"guides/journeys/{folder}/{JOURNEY_FILENAME}"
    target = os.path.relpath(plan_path, draft_dir)
    try:
        if link_path.is_symlink():
            if os.readlink(link_path) == target:
                return display
            link_path.unlink()
        elif link_path.exists():
            data = _read_json(link_path)
            journey = data.get("journey") if isinstance(data, dict) else None
            if not isinstance(journey, dict) or journey.get("id") != folder:
                warnings.append(f"{display} holds a different Journey, so it was not replaced with a link.")
                return None
            # The draft of this same Journey: the published file replaces it.
            link_path.unlink()
        draft_dir.mkdir(parents=True, exist_ok=True)
        link_path.symlink_to(target)
    except OSError as error:
        warnings.append(f"Could not link {display}: {error.strerror or error}.")
        return None
    return display


def _link_cover(source: Path, published: Path, folder: str, warnings: list[str]) -> None:
    """Replace the draft cover with a link to the published copy, so Git holds the image once."""
    if source.is_symlink() or not source.is_file():
        return
    try:
        if not filecmp.cmp(source, published, shallow=False):
            return
        source.unlink()
        source.symlink_to(os.path.relpath(published, source.parent))
    except OSError as error:
        warnings.append(f"Could not link guides/journeys/{folder}/{source.name}: {error.strerror or error}.")
