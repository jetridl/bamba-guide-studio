# ruff: noqa: F811
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from test_guides import client  # noqa: F401
from test_journeys import approved_poem, journey_input

from app.core.config import settings

COVER = b"\x89PNG fake cover bytes"


@pytest.fixture
def folders(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, Path]:
    paths = {
        "exports": tmp_path / "exports/journeys",
        "poems": tmp_path / "exports/curated_poems",
        "drafts": tmp_path / "guides/journeys",
    }
    for path in paths.values():
        path.mkdir(parents=True)
    monkeypatch.setattr(settings, "published_journeys_dir", paths["exports"])
    monkeypatch.setattr(settings, "published_guides_dir", paths["poems"])
    monkeypatch.setattr(settings, "journeys_dir", paths["drafts"])
    return paths


def publish_poem_file(folders: dict[str, Path], poem_id: str) -> None:
    plan = folders["poems"] / f"author--{poem_id}" / "guided_plan.json"
    plan.parent.mkdir()
    plan.write_text(json.dumps({"poem": {"id": poem_id}}))


def approved_journey(client: TestClient, folders: dict[str, Path]) -> tuple[dict, dict]:
    poem_id = approved_poem(client)["poem"]["externalId"]
    publish_poem_file(folders, poem_id)
    data = journey_input(poem_id)
    data["coverImage"] = {"path": "cover.png", "alt": "A lamp on a desk."}
    draft = folders["drafts"] / data["externalId"]
    draft.mkdir()
    (draft / "cover.png").write_bytes(COVER)
    journey = client.post("/api/journeys", json=data).json()
    assert client.post(f"/api/journeys/{journey['id']}/approve").json()["status"] == "approved"
    return journey, data


def test_publish_writes_journey_and_cover_and_links_the_draft(client: TestClient, folders: dict[str, Path]) -> None:
    journey, data = approved_journey(client, folders)
    draft = folders["drafts"] / data["externalId"]
    (draft / "journey.json").write_text(json.dumps({"journey": {"id": data["externalId"]}}))
    (draft / "cover-brief.txt").write_text("Notes stay here.")

    response = client.post(f"/api/journeys/{journey['id']}/publish")

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["path"] == "exports/journeys/images-of-light/journey.json"
    assert result["link"] == "guides/journeys/images-of-light/journey.json"
    assert result["created"] is True and result["warnings"] == []
    published = folders["exports"] / "images-of-light"
    written = json.loads((published / "journey.json").read_text())
    assert written["journey"]["status"] == "exported"
    assert written["journey"]["coverImage"] == {"path": "cover.png", "alt": "A lamp on a desk."}
    assert (published / "cover.png").read_bytes() == COVER
    assert (draft / "journey.json").is_symlink() and (draft / "journey.json").resolve() == (published / "journey.json")
    assert (draft / "cover.png").is_symlink() and (draft / "cover.png").read_bytes() == COVER
    assert (draft / "cover-brief.txt").read_text() == "Notes stay here."
    assert client.get(f"/api/journeys/{journey['id']}").json()["status"] == "exported"

    # Publishing again without changes is harmless.
    again = client.post(f"/api/journeys/{journey['id']}/publish")
    assert again.status_code == 200, again.text
    assert again.json()["created"] is False


def test_publish_needs_the_cover_image(client: TestClient, folders: dict[str, Path]) -> None:
    journey, data = approved_journey(client, folders)
    (folders["drafts"] / data["externalId"] / "cover.png").unlink()

    response = client.post(f"/api/journeys/{journey['id']}/publish")

    assert response.status_code == 409
    assert "guides/journeys/images-of-light/cover.png" in response.json()["detail"]
    assert not (folders["exports"] / "images-of-light").exists()


def test_publish_needs_a_cover_image_set(client: TestClient, folders: dict[str, Path]) -> None:
    journey, data = approved_journey(client, folders)
    data["coverImage"] = None
    data["version"] = 2
    assert client.put(f"/api/journeys/{journey['id']}", json=data).status_code == 200

    response = client.post(f"/api/journeys/{journey['id']}/publish")

    assert response.status_code == 409
    assert not (folders["exports"] / "images-of-light").exists()


def test_publish_needs_every_poem_published(client: TestClient, folders: dict[str, Path]) -> None:
    journey, _ = approved_journey(client, folders)
    for plan in folders["poems"].glob("*/guided_plan.json"):
        plan.unlink()

    response = client.post(f"/api/journeys/{journey['id']}/publish")

    assert response.status_code == 409
    assert "Publish the guides for" in response.json()["detail"]
    assert not (folders["exports"] / "images-of-light").exists()


def test_publish_needs_approval(client: TestClient, folders: dict[str, Path]) -> None:
    poem_id = approved_poem(client)["poem"]["externalId"]
    publish_poem_file(folders, poem_id)
    journey = client.post("/api/journeys", json=journey_input(poem_id)).json()

    response = client.post(f"/api/journeys/{journey['id']}/publish")

    assert response.status_code == 409
    assert not (folders["exports"] / "images-of-light").exists()


def test_changed_journey_needs_a_higher_version(client: TestClient, folders: dict[str, Path]) -> None:
    journey, _ = approved_journey(client, folders)
    assert client.post(f"/api/journeys/{journey['id']}/publish").status_code == 200
    path = folders["exports"] / "images-of-light" / "journey.json"
    # Someone changed the published file by hand, at the same version.
    edited = json.loads(path.read_text())
    edited["journey"]["title"] = "Edited by hand"
    path.write_text(json.dumps(edited))

    response = client.post(f"/api/journeys/{journey['id']}/publish")

    assert response.status_code == 409
    assert "already holds version 1" in response.json()["detail"]
    assert json.loads(path.read_text())["journey"]["title"] == "Edited by hand"


def test_approved_file_can_be_published_as_exported_at_the_same_version(
    client: TestClient, folders: dict[str, Path]
) -> None:
    journey, _ = approved_journey(client, folders)
    assert client.post(f"/api/journeys/{journey['id']}/publish").status_code == 200
    path = folders["exports"] / "images-of-light" / "journey.json"
    approved = json.loads(path.read_text())
    approved["journey"]["status"] = "approved"
    path.write_text(json.dumps(approved))

    response = client.post(f"/api/journeys/{journey['id']}/publish")

    assert response.status_code == 200, response.text
    assert json.loads(path.read_text())["journey"]["status"] == "exported"


def test_new_version_replaces_the_published_journey(client: TestClient, folders: dict[str, Path]) -> None:
    journey, data = approved_journey(client, folders)
    assert client.post(f"/api/journeys/{journey['id']}/publish").status_code == 200
    data["version"] = 2
    data["poems"][0]["note"] = ["A revised note."]
    assert client.put(f"/api/journeys/{journey['id']}", json=data).status_code == 200
    assert client.post(f"/api/journeys/{journey['id']}/approve").status_code == 200

    response = client.post(f"/api/journeys/{journey['id']}/publish")

    assert response.status_code == 200, response.text
    written = json.loads((folders["exports"] / "images-of-light" / "journey.json").read_text())
    assert written["journey"]["version"] == 2
    assert written["poems"][0]["note"] == ["A revised note."]


def test_another_journeys_draft_is_never_replaced(client: TestClient, folders: dict[str, Path]) -> None:
    journey, data = approved_journey(client, folders)
    draft = folders["drafts"] / data["externalId"]
    other = json.dumps({"journey": {"id": "someone-else"}})
    (draft / "journey.json").write_text(other)

    result = client.post(f"/api/journeys/{journey['id']}/publish").json()

    assert result["link"] is None and "holds a different Journey" in result["warnings"][0]
    assert not os.path.islink(draft / "journey.json")
    assert (draft / "journey.json").read_text() == other


def test_startup_loads_published_journeys(
    folders: dict[str, Path], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from test_guides import ROOT

    from app import main
    from app.core.database import Base
    from app.models.journey import Journey

    engine = create_engine(
        "sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine, autoflush=False)()
    tyger = ROOT / "exports/curated_poems/william-blake--the-tyger"
    (folders["poems"] / tyger.name).mkdir()
    (folders["poems"] / tyger.name / "guided_plan.json").write_text((tyger / "guided_plan.json").read_text())
    poem_id = json.loads((tyger / "guided_plan.json").read_text())["poem"]["id"]
    published = folders["exports"] / "images-of-light"
    published.mkdir()
    journey = {"schemaVersion": 1, "journey": {
        "id": "images-of-light", "version": 3, "status": "exported", "title": "Images of light",
        "subtitle": "A small path", "curator": "Bamba", "introduction": ["Listen."],
        "coverImage": {"path": "cover.png", "alt": "A lamp."}},
        "poems": [{"poemId": poem_id, "note": ["Begin here."]}]}
    (published / "journey.json").write_text(json.dumps(journey))
    monkeypatch.setattr(main.settings, "load_published_guides", True)
    monkeypatch.setattr(main, "SessionLocal", lambda: db)

    with TestClient(main.app):
        pass

    loaded = db.scalars(select(Journey)).one()
    assert (loaded.external_id, loaded.version, loaded.status) == ("images-of-light", 3, "exported")
    db.close()
