# ruff: noqa: F811
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from test_guides import client  # noqa: F401
from test_journeys import approved_poem

from app.core.config import settings

JOURNEY = "images-of-light"


def journey_file(poem_id: str, version: int, title: str, status: str = "approved") -> dict:
    return {
        "schemaVersion": 1,
        "journey": {"id": JOURNEY, "version": version, "status": status, "title": title,
                    "subtitle": "A small path", "curator": "Bamba", "introduction": ["Listen for the light."],
                    "coverImage": {"path": "cover.png", "alt": "A lamp on a desk."}},
        "poems": [{"poemId": poem_id, "note": ["Why it belongs."]}],
    }


def write(folder: Path, data: dict) -> None:
    (folder / JOURNEY).mkdir(parents=True, exist_ok=True)
    (folder / JOURNEY / "journey.json").write_text(json.dumps(data))


@pytest.fixture
def setup(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[TestClient, Path, Path, str]:
    exports, drafts, poems = tmp_path / "exports/journeys", tmp_path / "guides/journeys", tmp_path / "poems"
    for path in (exports, drafts, poems):
        path.mkdir(parents=True)
    monkeypatch.setattr(settings, "published_journeys_dir", exports)
    monkeypatch.setattr(settings, "journeys_dir", drafts)
    monkeypatch.setattr(settings, "published_guides_dir", poems)
    poem_id = approved_poem(client)["poem"]["externalId"]
    (poems / "author--poem").mkdir()
    (poems / "author--poem" / "guided_plan.json").write_text(json.dumps({"poem": {"id": poem_id}}))
    write(exports, journey_file(poem_id, 1, "Images of light", "exported"))
    assert client.post("/api/journeys/refresh").json()["loaded"] == [JOURNEY]
    return client, exports, drafts, poem_id


def only_journey(client: TestClient) -> dict:
    return client.get("/api/journeys").json()[0]


def test_new_version_becomes_the_latest_copy(setup) -> None:
    client, exports, drafts, poem_id = setup
    write(drafts, journey_file(poem_id, 3, "Images of light, revised"))

    result = client.post("/api/journeys/refresh").json()

    assert result["loaded"] == [f"{JOURNEY} (version 3, now the latest copy)"] and result["problems"] == []
    journey = only_journey(client)
    assert (journey["version"], journey["title"], journey["status"]) == (3, "Images of light, revised", "approved")
    assert journey["publishedVersion"] == 1
    versions = client.get(f"/api/journeys/{journey['id']}/versions").json()
    assert [(item["version"], item["title"]) for item in versions] == [
        (3, "Images of light, revised"), (1, "Images of light")]
    saved = client.get(f"/api/journeys/{journey['id']}/versions/3").json()
    assert saved["title"] == "Images of light, revised" and saved["poems"][0]["title"]

    again = client.post("/api/journeys/refresh").json()
    assert again["loaded"] == [] and again["failed"] == []


def test_same_version_with_other_content_is_a_problem(setup) -> None:
    client, exports, drafts, poem_id = setup
    write(drafts, journey_file(poem_id, 1, "Another title at the same version"))

    result = client.post("/api/journeys/refresh").json()

    assert result["failed"] == [JOURNEY]
    assert "already holds version 1 with different content" in result["problems"][0]
    assert "to 2" in result["problems"][0]
    assert only_journey(client)["title"] == "Images of light"


def test_studio_edits_do_not_clash_with_the_file(setup) -> None:
    client, exports, drafts, poem_id = setup
    journey = only_journey(client)
    data = {**{key: journey[key] for key in ("externalId", "title", "subtitle", "curator", "introduction",
                                             "closing", "coverImage")},
            "poems": [{"poemId": poem_id, "note": ["A new note."]}]}
    saved = client.put(f"/api/journeys/{journey['id']}", json=data).json()
    # The published version 1 is fixed, so the change starts version 2 by itself.
    assert (saved["version"], saved["status"], saved["versionFixed"]) == (2, "draft", False)

    result = client.post("/api/journeys/refresh").json()

    assert result["failed"] == [] and result["skipped"] == [JOURNEY]


def test_older_version_comes_back_under_the_next_number(setup) -> None:
    client, exports, drafts, poem_id = setup
    write(drafts, journey_file(poem_id, 3, "Images of light, revised"))
    client.post("/api/journeys/refresh")
    journey = only_journey(client)

    response = client.post(f"/api/journeys/{journey['id']}/versions/1/restore")

    assert response.status_code == 200, response.text
    restored = response.json()
    # A new version: it needs approval before it is published.
    assert (restored["version"], restored["title"], restored["status"]) == (4, "Images of light", "draft")
    versions = client.get(f"/api/journeys/{journey['id']}/versions").json()
    assert [item["version"] for item in versions] == [3, 1]
    assert client.post(f"/api/journeys/{journey['id']}/approve").status_code == 200
    (drafts / JOURNEY / "cover.png").write_bytes(b"cover")
    assert client.post(f"/api/journeys/{journey['id']}/publish").status_code == 200
    written = json.loads((exports / JOURNEY / "journey.json").read_text())
    assert (written["journey"]["version"], written["journey"]["title"]) == (4, "Images of light")


def test_a_change_to_a_saved_version_starts_the_next_one(setup) -> None:
    client, exports, drafts, poem_id = setup
    write(drafts, journey_file(poem_id, 3, "Images of light, revised"))
    client.post("/api/journeys/refresh")
    journey = only_journey(client)
    # Version 3 is the latest now, and saved: a change may not alter it.
    data = {**{key: journey[key] for key in ("externalId", "subtitle", "curator", "introduction",
                                             "closing", "coverImage")},
            "title": "Changed after version 3", "version": 3, "poems": [{"poemId": poem_id, "note": ["Changed."]}]}
    saved = client.put(f"/api/journeys/{journey['id']}", json=data).json()
    assert (saved["version"], saved["status"]) == (4, "draft")

    response = client.post(f"/api/journeys/{journey['id']}/versions/1/restore")

    # The changes are kept as version 4 first, and version 1 comes back as 5.
    assert response.status_code == 200, response.text
    assert (response.json()["version"], response.json()["status"]) == (5, "draft")
    versions = client.get(f"/api/journeys/{journey['id']}/versions").json()
    assert [(item["version"], item["title"]) for item in versions][:2] == [(4, "Changed after version 3"),
                                                                          (3, "Images of light, revised")]


def test_published_version_never_goes_down(setup) -> None:
    client, exports, drafts, poem_id = setup
    write(exports, journey_file(poem_id, 5, "Published elsewhere", "exported"))
    journey = only_journey(client)

    response = client.post(f"/api/journeys/{journey['id']}/publish")

    assert response.status_code == 409
    assert "never replaced" in response.json()["detail"] and "start version 6" in response.json()["detail"]
    assert json.loads((exports / JOURNEY / "journey.json").read_text())["journey"]["version"] == 5
