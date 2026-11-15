# ruff: noqa: F811
from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from test_guides import ROOT, client, load_example  # noqa: F401

from app.core.config import settings
from app.services import content_repository as publisher


def git(path: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(path), *args], check=True, capture_output=True, text=True).stdout.strip()


@pytest.fixture
def repository(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    remote = tmp_path / "remote.git"
    remote.mkdir()
    git(remote, "init", "--bare", "--initial-branch=main")
    exports = tmp_path / "exports"
    poem = exports / "curated_poems/william-blake--the-tyger"
    shutil.copytree(ROOT / "exports/curated_poems/william-blake--the-tyger", poem)
    monkeypatch.setattr(settings, "published_guides_dir", exports / "curated_poems")
    monkeypatch.setattr(settings, "published_journeys_dir", exports / "journeys")
    monkeypatch.setattr(settings, "guides_dir", tmp_path / "drafts")
    monkeypatch.setattr(settings, "content_sync_enabled", True)
    monkeypatch.setattr(settings, "content_repository", str(remote))
    monkeypatch.setattr(settings, "content_sync_dir", tmp_path / "publisher-cache")
    monkeypatch.setattr(publisher, "_last_status", {"state": "pending", "revision": None, "lastSyncedAt": None})
    return remote, exports


def test_seeds_empty_repository_and_repeated_sync_is_idempotent(repository: tuple[Path, Path]) -> None:
    remote, exports = repository
    first = publisher.sync_content()
    assert first["state"] == "synced"
    revision = git(remote, "rev-parse", "main")
    assert revision == first["revision"]
    for path in exports.rglob("*"):
        if path.is_file():
            relative = path.relative_to(exports).as_posix()
            remote_bytes = subprocess.run(["git", "-C", str(remote), "show", f"main:exports/{relative}"],
                                          check=True, capture_output=True).stdout
            assert remote_bytes == path.read_bytes()
    assert publisher.sync_content()["revision"] == revision
    assert git(remote, "rev-list", "--count", "main") == "1"


def test_push_failure_preserves_exports_and_retry_recovers_after_cache_loss(repository: tuple[Path, Path]) -> None:
    remote, exports = repository
    hook = remote / "hooks/pre-receive"
    hook.write_text("#!/bin/sh\nexit 1\n")
    hook.chmod(0o755)
    before = {path: path.read_bytes() for path in exports.rglob("*") if path.is_file()}
    assert publisher.sync_content()["state"] == "pending"
    assert all(path.read_bytes() == data for path, data in before.items())
    # Nothing depends on the failed commit or a volatile queue surviving restart.
    shutil.rmtree(settings.content_sync_dir)
    hook.unlink()
    assert publisher.sync_content()["state"] == "synced"
    assert git(remote, "rev-parse", "main")


def test_retry_publishes_latest_snapshot_and_removes_obsolete_artwork(repository: tuple[Path, Path]) -> None:
    remote, exports = repository
    extra = exports / "curated_poems/william-blake--the-tyger/old-cover.txt"
    extra.write_text("Old artwork notes")
    assert publisher.sync_content()["state"] == "synced"
    first = git(remote, "rev-parse", "main")
    extra.unlink()
    assert publisher.sync_content()["state"] == "synced"
    assert git(remote, "rev-parse", "main") != first
    assert "old-cover.txt" not in git(remote, "ls-tree", "-r", "--name-only", "main")


def test_incomplete_cover_never_replaces_remote(repository: tuple[Path, Path]) -> None:
    remote, exports = repository
    assert publisher.sync_content()["state"] == "synced"
    before = git(remote, "rev-parse", "main")
    plan = exports / "curated_poems/william-blake--the-tyger/guided_plan.json"
    data = json.loads(plan.read_text())
    data["poem"]["coverImage"] = {"path": "missing.png", "alt": "An absent image"}
    plan.write_text(json.dumps(data))
    assert publisher.sync_content()["state"] == "pending"
    assert git(remote, "rev-parse", "main") == before


def test_publish_api_keeps_saved_export_when_remote_is_unavailable(
    client: TestClient, repository: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch,
) -> None:
    remote, exports = repository
    shutil.rmtree(exports)
    monkeypatch.setattr(settings, "content_repository", str(remote / "unavailable"))
    guide_id = client.post("/api/import/guide", json=load_example()).json()["id"]
    assert client.post(f"/api/guides/{guide_id}/approve").status_code == 200
    response = client.post(f"/api/guides/{guide_id}/publish")
    assert response.status_code == 200, response.text
    assert response.json()["sync"]["state"] == "pending"
    assert client.get(f"/api/guides/{guide_id}").json()["status"] == "exported"
    assert list(exports.glob("curated_poems/*/guided_plan.json"))
    monkeypatch.setattr(settings, "content_repository", str(remote))
    assert publisher.sync_content()["state"] == "synced"
    assert client.get("/api/content-sync").json()["state"] == "synced"


def test_worker_retries_without_another_publish(repository: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch) -> None:
    remote, _ = repository
    monkeypatch.setattr(settings, "content_sync_interval_seconds", 1)
    hook = remote / "hooks/pre-receive"
    hook.write_text("#!/bin/sh\nexit 1\n")
    hook.chmod(0o755)

    async def scenario() -> None:
        task = asyncio.create_task(publisher.content_sync_worker())
        try:
            for _ in range(100):
                if publisher.sync_status().get("message"):
                    break
                await asyncio.sleep(0.05)
            assert publisher.sync_status()["state"] == "pending"
            hook.unlink()
            for _ in range(100):
                if publisher.sync_status()["state"] == "synced":
                    break
                await asyncio.sleep(0.05)
            assert publisher.sync_status()["state"] == "synced"
        finally:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
    asyncio.run(scenario())


def test_git_supports_container_uid_without_passwd_entry(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def unknown_uid(_: int) -> None:
        raise KeyError("Runtime UID is absent from the image passwd file")

    library = tmp_path / "libnss_wrapper.so"
    monkeypatch.setattr(publisher.pwd, "getpwuid", unknown_uid)
    monkeypatch.setattr(settings, "content_sync_dir", tmp_path)
    monkeypatch.setattr(Path, "glob", lambda self, pattern: iter([library]))
    env = publisher._git_environment()
    assert str(library) in env["LD_PRELOAD"]
    assert f"bamba-runtime:x:{publisher.os.getuid()}:{publisher.os.getgid()}" in Path(env["NSS_WRAPPER_PASSWD"]).read_text()
    assert Path(env["NSS_WRAPPER_GROUP"]).read_text() == Path("/etc/group").read_text()
    assert env["GIT_TERMINAL_PROMPT"] == "0"
