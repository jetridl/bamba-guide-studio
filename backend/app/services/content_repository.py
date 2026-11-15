"""Mirror authoritative exports to a separate Git repository, with durable retries.

Exports themselves are the durable queue. Every pass reconciles them with main,
including after a crash/restart or an ambiguous push result. Only the disposable
publisher checkout is reset; the editorial exports and drafts are never reset.
Run one Studio worker: its publish routes and this worker share publication_lock.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import pwd
import re
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock
from typing import Any

from app.core.config import settings
from app.services.json_schema import validate_json_schema

logger = logging.getLogger(__name__)
publication_lock = RLock()
_last_status: dict[str, Any] = {"state": "pending", "revision": None, "lastSyncedAt": None}


def sync_status() -> dict[str, Any]:
    if not settings.content_sync_enabled:
        return {"state": "disabled", "revision": None, "lastSyncedAt": None}
    # Requiring a fresh successful pass after restart avoids reporting stale success.
    return dict(_last_status)


def _git_environment() -> dict[str, str]:
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    try:
        pwd.getpwuid(os.getuid())
    except KeyError:
        # Compose runs as the host's numeric UID. OpenSSH requires a passwd
        # entry even when the key and SSH username are explicit. Supply one to
        # child processes without root access or changing /etc/passwd.
        library = next(Path("/usr/lib").glob("*/libnss_wrapper.so"), None)
        if library is None:
            raise RuntimeError("The publisher image needs libnss-wrapper for its runtime UID.") from None
        state = settings.content_sync_dir
        passwd_file, group_file = state / "passwd", state / "group"
        passwd_file.write_text(Path("/etc/passwd").read_text() +
                               f"\nbamba-runtime:x:{os.getuid()}:{os.getgid()}:Bamba:{state}:/bin/false\n")
        group_file.write_text(Path("/etc/group").read_text())
        env.update({
            "LD_PRELOAD": f"{library}:{env['LD_PRELOAD']}" if env.get("LD_PRELOAD") else str(library),
            "NSS_WRAPPER_PASSWD": str(passwd_file), "NSS_WRAPPER_GROUP": str(group_file),
        })
    return env


def _git(checkout: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", "-C", str(checkout), *args],
        capture_output=True, text=True, timeout=settings.content_git_timeout_seconds,
        env=_git_environment(),
    )
    if check and result.returncode:
        logger.error("Content git %s failed: %s", args[0], result.stderr.strip())
        raise RuntimeError(f"Content git {args[0]} failed. Check the publisher's Git access and logs.")
    return result


def _export_files() -> dict[str, Path]:
    """Publish only complete approved folders; check covers and Journey references."""
    files: dict[str, Path] = {}
    poem_ids: set[str] = set()
    guide_ids: set[str] = set()
    journeys: list[dict[str, Any]] = []
    for kind, root, filename, schema, key in (
        ("curated_poems", settings.published_guides_dir, "guided_plan.json", "guided-plan.schema.json", "guide"),
        ("journeys", settings.published_journeys_dir, "journey.json", "journey.schema.json", "journey"),
    ):
        for document in sorted(root.glob(f"*/{filename}")):
            data = json.loads(document.read_text(encoding="utf-8"))
            errors = validate_json_schema(data, schema)
            if errors or data[key]["status"] not in {"approved", "exported"}:
                raise ValueError(f"Cannot sync invalid or unapproved export: {document.name} in {document.parent.name}")
            if kind == "curated_poems":
                if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*", document.parent.name):
                    raise ValueError(f"Invalid poem export folder: {document.parent.name}")
                if data["poem"]["id"] in poem_ids or data["guide"]["id"] in guide_ids:
                    raise ValueError("Duplicate exported poem or guide identity.")
                poem_ids.add(data["poem"]["id"])
                guide_ids.add(data["guide"]["id"])
                cover = data["poem"].get("coverImage")
            else:
                if data["journey"]["id"] != document.parent.name:
                    raise ValueError("Journey folder must match its ID.")
                journeys.append(data)
                cover = data["journey"].get("coverImage")
            if cover and (Path(cover["path"]).name != cover["path"] or not (document.parent / cover["path"]).is_file()):
                raise ValueError(f"Missing cover for {document.parent.name}.")
            # JSON, artwork and editorial briefs travel together. Dotfiles/temp files do not.
            for path in document.parent.iterdir():
                if path.name.startswith("."):
                    continue
                if path.is_symlink() or not path.is_file():
                    raise ValueError(f"Exports must contain regular files: {path}")
                files[f"exports/{kind}/{document.parent.name}/{path.name}"] = path
    if not poem_ids:
        raise ValueError("No published poems found; refusing to replace remote content with an empty export.")
    for journey in journeys:
        if any(poem["poemId"] not in poem_ids for poem in journey["poems"]):
            raise ValueError(f"Journey {journey['journey']['id']} names an unpublished poem.")
    return files


def _sync() -> str:
    files = _export_files()
    state_dir = settings.content_sync_dir
    state_dir.mkdir(parents=True, exist_ok=True)
    checkout = state_dir / "checkout"
    marker = state_dir / "publisher-owned"
    if checkout.exists() and not marker.is_file():
        raise ValueError("Publisher cache is not marked disposable; refusing to change it.")
    if not checkout.exists():
        checkout.mkdir()
        marker.write_text("Disposable content publisher checkout. Not editorial storage.\n")
        _git(checkout, "init", "--initial-branch", settings.content_branch)
    _git(checkout, "check-ref-format", "--branch", settings.content_branch)
    _git(checkout, "config", "user.name", settings.content_git_name)
    _git(checkout, "config", "user.email", settings.content_git_email)
    # This checkout and its origin are managed solely by this service.
    if _git(checkout, "remote", "get-url", "origin", check=False).returncode:
        _git(checkout, "remote", "add", "origin", settings.content_repository)
    else:
        _git(checkout, "remote", "set-url", "origin", settings.content_repository)
    heads = _git(checkout, "ls-remote", "--heads", "origin").stdout.splitlines()
    branch_ref = f"refs/heads/{settings.content_branch}"
    if any(line.endswith(f"\t{branch_ref}") for line in heads):
        _git(checkout, "fetch", "--depth=1", "origin", branch_ref)
        _git(checkout, "reset", "--hard", "FETCH_HEAD")
    elif heads:
        raise ValueError("The content repository has branches but no configured publishing branch.")
    # Mirror only the two managed trees. Preserve README and other root files.
    for kind in ("curated_poems", "journeys"):
        target = checkout / "exports" / kind
        if target.is_symlink():
            target.unlink()
        elif target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True, exist_ok=True)
    for relative, source in files.items():
        target = checkout / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    _git(checkout, "add", "--all", "--", "exports/curated_poems", "exports/journeys")
    if _git(checkout, "diff", "--cached", "--quiet", check=False).returncode == 1:
        _git(checkout, "commit", "-m", "Publish approved Studio content")
    revision = _git(checkout, "rev-parse", "HEAD").stdout.strip()
    # Never force. A concurrent remote change causes a retry from the new head.
    _git(checkout, "push", "origin", f"HEAD:{branch_ref}")
    return revision


def sync_content() -> dict[str, Any]:
    """Try now; a failure retains exports and will be retried by the worker."""
    global _last_status
    if not settings.content_sync_enabled:
        return sync_status()
    with publication_lock:
        _last_status = {**_last_status, "state": "pending"}
        try:
            revision = _sync()
            _last_status = {
                "state": "synced", "revision": revision,
                "lastSyncedAt": datetime.now(UTC).isoformat(),
            }
        except Exception as error:
            logger.exception("Content is saved locally; repository sync will retry automatically.")
            _last_status = {
                **_last_status, "state": "pending",
                "message": (f"Waiting to sync: {error} Studio will retry automatically." if isinstance(error, ValueError)
                            else "Saved in Studio. Waiting to sync; Studio will retry automatically."),
            }
        return sync_status()


async def content_sync_worker() -> None:
    # Exports are the queue: there is no volatile task to lose on restart.
    while True:
        await asyncio.to_thread(sync_content)
        await asyncio.sleep(max(1, settings.content_sync_interval_seconds))
