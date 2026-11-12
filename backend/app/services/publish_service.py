"""Publish an approved guide into exports/curated_poems and link it from guides/json.

Layout (see exports/README.md):
    exports/curated_poems/<author-name>--<poem-title>/guided_plan.json   canonical file
    guides/json/<author-name>--<poem-title>.json                         symlink to it

The folder holds only the newest published version, and its version never goes
down. A version is published once: to publish a change, raise the version
first. Each published version is also kept as a saved version.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import unicodedata
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Guide
from app.services.export_service import mark_exported, prepare_export

PLAN_FILENAME = "guided_plan.json"


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def folder_name(author: str, title: str) -> str:
    author_slug, title_slug = slugify(author), slugify(title)
    if not author_slug or not title_slug:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The poem needs an author and a title with letters or numbers before it can be published.",
        )
    return f"{author_slug}--{title_slug}"


def publish_guide(db: Session, guide: Guide, exports_dir: Path, guides_dir: Path | None) -> dict[str, Any]:
    from app.services.guide_versions import (
        comparable,
        holds_content,
        next_free_version,
        record_version,
        saved_versions,
        version_taken,
    )

    if guide.version > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This is a saved version. Use it as the latest, approve it, and publish the latest.",
        )
    payload = prepare_export(guide)
    guide_id, poem_id = payload["guide"]["id"], payload["poem"]["id"]
    number = payload["guide"]["version"]
    saved = saved_versions(db, guide_id).get(number)
    if saved is not None and not holds_content(saved, payload):
        raise version_taken(number, next_free_version(db, guide))

    folder = _existing_folder(exports_dir, guide_id, poem_id)
    created = folder is None
    if folder is None:
        folder = folder_name(payload["poem"]["author"], payload["poem"]["title"])
        if (exports_dir / folder / PLAN_FILENAME).exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"exports/curated_poems/{folder} already holds a different guide. Nothing was written.",
            )

    plan_path = exports_dir / folder / PLAN_FILENAME
    existing = _read_json(plan_path)
    published = existing.get("guide", {}).get("version") if isinstance(existing, dict) else None
    if isinstance(published, int) and number <= published:
        display = f"exports/curated_poems/{folder}/{PLAN_FILENAME}"
        free = next_free_version(db, guide, published)
        if number < published:
            reason = f"{display} holds version {published}, and a published version never goes down."
        elif comparable(existing) == comparable(payload):
            reason = f"Version {number} is published already."
        else:
            reason = f"{display} holds version {published} with different content."
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{reason} To publish a change, raise the version to {free} first.",
        )
    try:
        _write_atomically(plan_path, json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    except OSError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not write {plan_path}: {error.strerror or error}. Check that the folder exists and is writable.",
        ) from error
    mark_exported(db, guide)
    record_version(db, guide, "exported")
    db.commit()

    warnings: list[str] = []
    link = _link(guides_dir, folder, plan_path, guide_id, poem_id, warnings) if guides_dir else None
    return {
        "folder": folder,
        "path": f"exports/curated_poems/{folder}/{PLAN_FILENAME}",
        "link": link,
        "created": created,
        "warnings": warnings,
    }


def published_versions(exports_dir: Path) -> dict[str, int]:
    """The version in exports/ of each published guide, by guide ID."""
    versions: dict[str, int] = {}
    for path in exports_dir.glob(f"*/{PLAN_FILENAME}"):
        data = _read_json(path)
        try:
            guide_id, version = data["guide"]["id"], data["guide"]["version"]
        except (KeyError, TypeError):
            continue
        if isinstance(version, int):
            versions[guide_id] = version
    return versions


def published_version(guide_id: str) -> int | None:
    """The version in exports/ of one guide, or None when it is not published."""
    from app.core.config import settings

    return published_versions(settings.published_guides_dir).get(guide_id)


def _existing_folder(exports_dir: Path, guide_id: str, poem_id: str) -> str | None:
    """The folder that already holds this guide (by guide ID, then poem ID), if any."""
    by_poem = None
    for path in sorted(exports_dir.glob(f"*/{PLAN_FILENAME}")):
        ids = _ids(path)
        if ids is None:
            continue
        if ids[0] == guide_id:
            return path.parent.name
        if ids[1] == poem_id and by_poem is None:
            by_poem = path.parent.name
    return by_poem


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _ids(path: Path) -> tuple[str, str] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data["guide"]["id"], data["poem"]["id"]
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _write_atomically(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.stem}.", suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as temp_file:
            temp_file.write(content)
        os.chmod(temp_name, 0o644)
        os.replace(temp_name, path)
    except BaseException:
        Path(temp_name).unlink(missing_ok=True)
        raise


def _link(
    guides_dir: Path, folder: str, plan_path: Path, guide_id: str, poem_id: str, warnings: list[str]
) -> str | None:
    """Point guides/json/<folder>.json at the published file. Never discards another guide's draft."""
    link_path = guides_dir / f"{folder}.json"
    display = f"guides/json/{folder}.json"
    target = os.path.relpath(plan_path, guides_dir)
    try:
        if link_path.is_symlink():
            if os.readlink(link_path) == target:
                return display
            link_path.unlink()
        elif link_path.exists():
            ids = _ids(link_path)
            if ids is None or (ids[0] != guide_id and ids[1] != poem_id):
                warnings.append(f"{display} holds a different guide, so it was not replaced with a link.")
                return None
            # The draft of this same guide: the published file replaces it.
            link_path.unlink()
        guides_dir.mkdir(parents=True, exist_ok=True)
        link_path.symlink_to(target)
    except OSError as error:
        warnings.append(f"Could not link {display}: {error.strerror or error}.")
        return None
    return display
