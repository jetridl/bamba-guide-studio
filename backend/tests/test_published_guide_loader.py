# ruff: noqa: F811
from __future__ import annotations

import json
import shutil
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from test_guides import ROOT

from app.core.database import Base, get_db
from app.main import app
from app.models import Guide
from app.services.published_guides import load_guide_folder, load_published_guides
from app.services.serialization import guide_to_dict

PUBLISHED = ROOT / "exports/curated_poems"
INVICTUS = "william-ernest-henley--invictus"
TYGER = "william-blake--the-tyger"


@pytest.fixture
def db() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    try:
        yield session
    finally:
        session.close()


def _folder(tmp_path: Path, *names: str) -> Path:
    for name in names:
        (tmp_path / name).mkdir()
        shutil.copy(PUBLISHED / name / "guided_plan.json", tmp_path / name / "guided_plan.json")
    return tmp_path


def test_loads_every_published_guide_as_approved(db: Session) -> None:
    report = load_published_guides(db, PUBLISHED)

    assert sorted(report.loaded) == sorted(path.parent.name for path in PUBLISHED.glob("*/guided_plan.json"))
    assert report.failed == []
    statuses = db.scalars(select(Guide.status).where(Guide.version == 0)).all()
    assert statuses and set(statuses) == {"approved"}


def test_second_load_keeps_studio_edits(db: Session, tmp_path: Path) -> None:
    folder = _folder(tmp_path, INVICTUS)
    load_published_guides(db, folder)
    guide = db.scalars(select(Guide).where(Guide.version == 0)).one()
    guide.title = "Edited in Studio"
    guide.status = "draft"
    db.commit()

    report = load_published_guides(db, folder)

    assert report.loaded == [] and report.skipped == [INVICTUS]
    db.refresh(guide)
    assert (guide.title, guide.status) == ("Edited in Studio", "draft")


def test_bad_files_are_skipped_and_others_still_load(db: Session, tmp_path: Path) -> None:
    folder = _folder(tmp_path, TYGER)
    (folder / "broken").mkdir()
    (folder / "broken/guided_plan.json").write_text("{ not json")
    (folder / "wrong-shape").mkdir()
    (folder / "wrong-shape/guided_plan.json").write_text(
        json.dumps({"schemaVersion": 2, "guide": {"id": "x"}, "poem": {"id": "x"}})
    )

    report = load_published_guides(db, folder)

    assert report.loaded == [TYGER]
    assert sorted(report.failed) == ["broken", "wrong-shape"]


def test_guide_that_fails_approval_loads_as_draft(db: Session, tmp_path: Path) -> None:
    folder = _folder(tmp_path, INVICTUS)
    path = folder / INVICTUS / "guided_plan.json"
    payload = json.loads(path.read_text())
    payload["sessions"][0]["pages"][0]["prompt"] = "A prompt on a page that is not a reflection."
    path.write_text(json.dumps(payload))

    report = load_published_guides(db, folder)

    assert report.loaded == [INVICTUS]
    assert db.scalars(select(Guide.status).where(Guide.version == 0)).one() == "draft"


def test_missing_folder_loads_nothing(db: Session, tmp_path: Path) -> None:
    report = load_published_guides(db, tmp_path / "absent")
    assert (report.loaded, report.skipped, report.failed) == ([], [], [])


def test_startup_loads_published_guides(db: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app import main

    folder = _folder(tmp_path, TYGER)
    monkeypatch.setattr(main.settings, "load_published_guides", True)
    monkeypatch.setattr(main.settings, "published_guides_dir", folder)
    monkeypatch.setattr(main, "SessionLocal", lambda: db)
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            guides = client.get("/api/guides").json()
    finally:
        app.dependency_overrides.clear()

    assert [guide["status"] for guide in guides] == ["approved"]


def _guides_json(tmp_path: Path) -> Path:
    """A guides/json folder: one symlink to a published guide, one plain draft file."""
    (tmp_path / "exports").mkdir()
    published = _folder(tmp_path / "exports", INVICTUS)
    guides = tmp_path / "guides"
    guides.mkdir()
    (guides / f"{INVICTUS}.json").symlink_to(published / INVICTUS / "guided_plan.json")
    draft = json.loads((PUBLISHED / TYGER / "guided_plan.json").read_text())
    draft["guide"]["status"] = "draft"
    (guides / f"{TYGER}.json").write_text(json.dumps(draft))
    return guides


def test_guide_folder_adds_new_files_and_follows_symlinks(db: Session, tmp_path: Path) -> None:
    guides = _guides_json(tmp_path)

    report = load_guide_folder(db, guides)

    assert sorted(report.loaded) == sorted([INVICTUS, TYGER]) and report.failed == []
    statuses = {guide.external_id: guide.status for guide in db.scalars(select(Guide).where(Guide.version == 0))}
    assert sorted(statuses.values()) == ["approved", "draft"]


def test_refresh_endpoint_adds_only_new_guides(
    db: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app import main

    guides = _guides_json(tmp_path)
    monkeypatch.setattr(main.settings, "load_published_guides", False)
    monkeypatch.setattr(main.settings, "guides_dir", guides)
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            first = client.post("/api/guides/refresh").json()
            second = client.post("/api/guides/refresh").json()
            listed = client.get("/api/guides").json()
    finally:
        app.dependency_overrides.clear()

    assert sorted(first["loaded"]) == sorted([INVICTUS, TYGER])
    assert second["loaded"] == [] and sorted(second["skipped"]) == sorted([INVICTUS, TYGER])
    assert len(listed) == 2


def _versions(db: Session, guide_id: str) -> dict[int, Guide]:
    return {guide.version: guide for guide in db.scalars(select(Guide).where(Guide.external_id == guide_id))}


def _write_version(folder: Path, number: int, title: str, name: str = TYGER) -> dict:
    payload = json.loads((PUBLISHED / name / "guided_plan.json").read_text())
    payload["guide"]["version"] = number
    payload["guide"]["title"] = title
    (folder / name).mkdir(exist_ok=True)
    (folder / name / "guided_plan.json").write_text(json.dumps(payload))
    return payload


def test_every_published_guide_matches_its_studio_copy(db: Session) -> None:
    from app.services.export_service import build_guided_plan
    from app.services.guide_versions import comparable

    load_published_guides(db, PUBLISHED)

    for path in PUBLISHED.glob("*/guided_plan.json"):
        payload = json.loads(path.read_text())
        guide = _versions(db, payload["guide"]["id"])[0]
        assert comparable(build_guided_plan(guide)) == comparable(payload), path.parent.name


def test_new_version_becomes_the_latest_copy(db: Session, tmp_path: Path) -> None:
    folder = _folder(tmp_path, TYGER)
    load_published_guides(db, folder)
    guide_id = json.loads((folder / TYGER / "guided_plan.json").read_text())["guide"]["id"]
    _write_version(folder, 2, "The Tyger, second edition")

    report = load_published_guides(db, folder)

    assert report.loaded == [f"{TYGER} (version 2, now the latest copy)"] and report.problems == []
    versions = _versions(db, guide_id)
    assert sorted(versions) == [0, 1, 2]
    assert versions[1].title != "The Tyger, second edition"
    assert (versions[0].title, versions[0].status, versions[0].content_version) == (
        "The Tyger, second edition", "approved", 2)

    again = load_published_guides(db, folder)
    assert again.loaded == [] and again.skipped == [TYGER]


def test_a_held_higher_version_becomes_the_latest_copy(db: Session, tmp_path: Path) -> None:
    folder = _folder(tmp_path, TYGER)
    load_published_guides(db, folder)
    guide_id = json.loads((folder / TYGER / "guided_plan.json").read_text())["guide"]["id"]
    _write_version(folder, 3, "The Tyger, third edition")
    load_published_guides(db, folder)
    # As after the migration: the working copy is older than a saved version.
    working = _versions(db, guide_id)[0]
    working.content_version = 1
    working.title = _versions(db, guide_id)[1].title
    db.commit()

    report = load_published_guides(db, folder)

    assert report.loaded == [f"{TYGER} (version 3 is now the latest copy)"] and report.skipped == []
    assert (_versions(db, guide_id)[0].title, _versions(db, guide_id)[0].content_version) == (
        "The Tyger, third edition", 3)


def test_unsaved_changes_keep_the_working_copy(db: Session, tmp_path: Path) -> None:
    folder = _folder(tmp_path, TYGER)
    load_published_guides(db, folder)
    guide_id = json.loads((folder / TYGER / "guided_plan.json").read_text())["guide"]["id"]
    working = _versions(db, guide_id)[0]
    working.description = "Edited in Studio"
    db.commit()
    _write_version(folder, 2, "The Tyger, second edition")

    report = load_published_guides(db, folder)

    assert report.loaded == [f"{TYGER} (version 2)"] and report.failed == [TYGER]
    assert "Raise its version to 3" in report.problems[0]
    versions = _versions(db, guide_id)
    assert sorted(versions) == [0, 1, 2] and versions[2].title == "The Tyger, second edition"
    assert (versions[0].description, versions[0].content_version) == ("Edited in Studio", 1)
    # "Raise to N" offers a number no copy uses yet.
    assert guide_to_dict(versions[0])["nextFreeVersion"] == 3


def test_same_version_with_other_content_is_a_problem(db: Session, tmp_path: Path) -> None:
    folder = _folder(tmp_path, TYGER)
    load_published_guides(db, folder)
    payload = _write_version(folder, 1, "A different Tyger")

    report = load_published_guides(db, folder)

    assert report.failed == [TYGER]
    assert "already holds version 1 with different content" in report.problems[0]
    assert "to 2" in report.problems[0]
    versions = _versions(db, payload["guide"]["id"])
    assert sorted(versions) == [0, 1]
    assert "A different Tyger" not in (versions[0].title, versions[1].title)


def test_older_version_is_kept_as_history_only(db: Session, tmp_path: Path) -> None:
    folder = tmp_path / "newer"
    folder.mkdir()
    payload = _write_version(folder, 3, "The Tyger, third edition")
    load_published_guides(db, folder)
    older = tmp_path / "older"
    older.mkdir()
    old_payload = _write_version(older, 2, "The Tyger, second edition")
    old_payload["poem"]["text"] = "An older text of the poem."
    (older / TYGER / "guided_plan.json").write_text(json.dumps(old_payload))

    report = load_published_guides(db, older)

    assert report.loaded == [f"{TYGER} (version 2)"]
    versions = _versions(db, payload["guide"]["id"])
    assert sorted(versions) == [0, 2, 3]
    assert versions[0].title == "The Tyger, third edition"
    assert versions[0].poem.text == payload["poem"]["text"]


def test_refresh_reports_problems(db: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app import main

    guides = _guides_json(tmp_path)
    monkeypatch.setattr(main.settings, "load_published_guides", False)
    monkeypatch.setattr(main.settings, "guides_dir", guides)
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            client.post("/api/guides/refresh")
            draft = json.loads((guides / f"{TYGER}.json").read_text())
            draft["guide"]["title"] = "Changed without a new version"
            (guides / f"{TYGER}.json").write_text(json.dumps(draft))
            result = client.post("/api/guides/refresh").json()
    finally:
        app.dependency_overrides.clear()

    assert result["failed"] == [TYGER] and len(result["problems"]) == 1


def test_older_version_comes_back_under_the_next_number(db: Session, tmp_path: Path) -> None:
    from app.services.guide_service import get_guide_or_404, restore_latest_from_version

    folder = _folder(tmp_path, TYGER)
    load_published_guides(db, folder)
    first_title = _versions(db, json.loads((folder / TYGER / "guided_plan.json").read_text())["guide"]["id"])[0].title
    payload = _write_version(folder, 2, "The Tyger, second edition")
    load_published_guides(db, folder)
    versions = _versions(db, payload["guide"]["id"])

    restored = restore_latest_from_version(db, get_guide_or_404(db, versions[1].id))

    assert (restored["title"], restored["contentVersion"], restored["status"]) == (first_title, 3, "approved")
    versions = _versions(db, payload["guide"]["id"])
    assert sorted(versions) == [0, 1, 2] and versions[2].title == "The Tyger, second edition"


def test_unsaved_changes_block_a_restore(db: Session, tmp_path: Path) -> None:
    from fastapi import HTTPException

    from app.services.guide_service import get_guide_or_404, restore_latest_from_version, save_guide_version

    folder = _folder(tmp_path, TYGER)
    load_published_guides(db, folder)
    payload = _write_version(folder, 2, "The Tyger, second edition")
    load_published_guides(db, folder)
    working = _versions(db, payload["guide"]["id"])[0]
    save_guide_version(db, get_guide_or_404(db, working.id))
    working.title = "Edited after the save"
    db.commit()

    with pytest.raises(HTTPException) as error:
        restore_latest_from_version(db, get_guide_or_404(db, _versions(db, payload["guide"]["id"])[1].id))

    assert error.value.status_code == 409 and "Raise its version to 3" in error.value.detail
    assert _versions(db, payload["guide"]["id"])[0].title == "Edited after the save"
