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
    statuses = db.scalars(select(Guide.status)).all()
    assert statuses and set(statuses) == {"approved"}


def test_second_load_keeps_studio_edits(db: Session, tmp_path: Path) -> None:
    folder = _folder(tmp_path, INVICTUS)
    load_published_guides(db, folder)
    guide = db.scalars(select(Guide)).one()
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
    assert db.scalars(select(Guide.status)).one() == "draft"


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
    statuses = {guide.external_id: guide.status for guide in db.scalars(select(Guide))}
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
