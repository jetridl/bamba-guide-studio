# ruff: noqa: F811
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from test_guides import ROOT, client, load_example  # noqa: F401

from app.core.config import settings
from app.services.json_schema import validate_json_schema
from app.services.publish_service import folder_name

PUBLISHED = ROOT / "exports/curated_poems"
TYGER = "william-blake--the-tyger"


@pytest.fixture
def dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    exports_dir, guides_dir = tmp_path / "exports/curated_poems", tmp_path / "guides/json"
    exports_dir.mkdir(parents=True)
    guides_dir.mkdir(parents=True)
    monkeypatch.setattr(settings, "published_guides_dir", exports_dir)
    monkeypatch.setattr(settings, "guides_dir", guides_dir)
    return exports_dir, guides_dir


def _import_and_approve(client: TestClient, payload: dict) -> str:
    imported = client.post("/api/import/guide", json=payload)
    assert imported.status_code == 200, imported.text
    guide_id = imported.json()["id"]
    assert client.post(f"/api/guides/{guide_id}/approve").status_code == 200
    return guide_id


def test_folder_names_match_the_published_convention() -> None:
    for path in PUBLISHED.glob("*/guided_plan.json"):
        poem = json.loads(path.read_text())["poem"]
        assert folder_name(poem["author"], poem["title"]) == path.parent.name


def test_publish_new_guide_writes_file_and_link(client: TestClient, dirs: tuple[Path, Path]) -> None:
    exports_dir, guides_dir = dirs
    guide_id = _import_and_approve(client, load_example())

    response = client.post(f"/api/guides/{guide_id}/publish")

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["created"] is True and result["warnings"] == []
    plan = exports_dir / result["folder"] / "guided_plan.json"
    written = json.loads(plan.read_text())
    assert validate_json_schema(written, "guided-plan.schema.json") == []
    assert written["guide"]["status"] == "exported"
    assert plan.read_text().endswith("}\n")
    link = guides_dir / f"{result['folder']}.json"
    assert link.is_symlink() and not os.path.isabs(os.readlink(link))
    assert link.read_bytes() == plan.read_bytes()
    assert client.get(f"/api/guides/{guide_id}").json()["status"] == "exported"


def test_publish_existing_guide_updates_its_folder_and_replaces_its_draft(
    client: TestClient, dirs: tuple[Path, Path]
) -> None:
    exports_dir, guides_dir = dirs
    source_path = PUBLISHED / TYGER / "guided_plan.json"
    source = json.loads(source_path.read_text())
    # The canonical file sits under a different folder name: publish must find it by ID.
    (exports_dir / "renamed").mkdir()
    shutil.copy(source_path, exports_dir / "renamed/guided_plan.json")
    (guides_dir / "renamed.json").write_text(source_path.read_text())  # an unlinked draft copy
    guide_id = _import_and_approve(client, source)
    client.patch(f"/api/guides/{guide_id}", json={"title": "The Tyger, revised", "contentVersion": 2})
    client.post(f"/api/guides/{guide_id}/approve")

    result = client.post(f"/api/guides/{guide_id}/publish").json()

    assert (result["folder"], result["created"], result["warnings"]) == ("renamed", False, [])
    written = json.loads((exports_dir / "renamed/guided_plan.json").read_text())
    assert written["guide"]["title"] == "The Tyger, revised"
    assert written["guide"]["version"] == 2
    for key in ["stanzas", "lines", "chunks"]:
        assert written[key] == source[key]
    assert (guides_dir / "renamed.json").is_symlink()
    assert not (exports_dir / TYGER).exists()


def test_publish_keeps_a_different_draft_and_warns(client: TestClient, dirs: tuple[Path, Path]) -> None:
    exports_dir, guides_dir = dirs
    guide_id = _import_and_approve(client, load_example())
    folder = client.post(f"/api/guides/{guide_id}/publish").json()["folder"]
    client.patch(f"/api/guides/{guide_id}", json={"contentVersion": 2})
    (guides_dir / f"{folder}.json").unlink()
    other = {"guide": {"id": "someone_else"}, "poem": {"id": "another_poem"}}
    (guides_dir / f"{folder}.json").write_text(json.dumps(other))

    result = client.post(f"/api/guides/{guide_id}/publish").json()

    assert result["link"] is None and len(result["warnings"]) == 1
    assert json.loads((guides_dir / f"{folder}.json").read_text()) == other


def test_publish_refuses_a_folder_that_holds_another_guide(client: TestClient, dirs: tuple[Path, Path]) -> None:
    exports_dir, _ = dirs
    payload = load_example()
    guide_id = _import_and_approve(client, payload)
    folder = folder_name(payload["poem"]["author"], payload["poem"]["title"])
    (exports_dir / folder).mkdir()
    other = '{"guide": {"id": "other"}, "poem": {"id": "other"}}'
    (exports_dir / folder / "guided_plan.json").write_text(other)

    response = client.post(f"/api/guides/{guide_id}/publish")

    assert response.status_code == 409
    assert (exports_dir / folder / "guided_plan.json").read_text() == other
    assert client.get(f"/api/guides/{guide_id}").json()["status"] == "approved"


def test_publish_requires_approval(client: TestClient, dirs: tuple[Path, Path]) -> None:
    exports_dir, guides_dir = dirs
    guide_id = client.post("/api/import/guide", json=load_example()).json()["id"]

    assert client.post(f"/api/guides/{guide_id}/publish").status_code == 409
    assert list(exports_dir.iterdir()) == [] and list(guides_dir.iterdir()) == []


def test_write_failure_keeps_status(client: TestClient, dirs: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch,
                                    tmp_path: Path) -> None:
    blocker = tmp_path / "not-a-folder"
    blocker.write_text("")
    monkeypatch.setattr(settings, "published_guides_dir", blocker)
    guide_id = _import_and_approve(client, load_example())

    response = client.post(f"/api/guides/{guide_id}/publish")

    assert response.status_code == 500
    assert "Could not write" in response.json()["detail"]
    assert client.get(f"/api/guides/{guide_id}").json()["status"] == "approved"


def _publish_tyger(client: TestClient, dirs: tuple[Path, Path]) -> tuple[str, Path]:
    exports_dir, _ = dirs
    (exports_dir / TYGER).mkdir()
    shutil.copy(PUBLISHED / TYGER / "guided_plan.json", exports_dir / TYGER / "guided_plan.json")
    source = json.loads((PUBLISHED / TYGER / "guided_plan.json").read_text())
    return _import_and_approve(client, source), exports_dir / TYGER / "guided_plan.json"


def test_published_version_cannot_be_published_again(client: TestClient, dirs: tuple[Path, Path]) -> None:
    # The app's file lacks the chunkIds and roundType values Studio fills in. That is not a change.
    guide_id, plan = _publish_tyger(client, dirs)
    before = plan.read_text()

    response = client.post(f"/api/guides/{guide_id}/publish")

    assert response.status_code == 409
    assert "Version 1 is published already" in response.json()["detail"]
    assert "raise the version to 2" in response.json()["detail"]
    assert plan.read_text() == before
    assert client.get(f"/api/guides/{guide_id}").json()["publishedVersion"] == 1

    client.patch(f"/api/guides/{guide_id}", json={"contentVersion": 2})
    assert client.post(f"/api/guides/{guide_id}/publish").status_code == 200
    assert client.get(f"/api/guides/{guide_id}").json()["publishedVersion"] == 2
    versions = client.get(f"/api/guides/{guide_id}/versions").json()
    assert [(item["versionLabel"], item["status"]) for item in versions] == [("latest", "exported"), ("v2", "exported")]


def test_changed_guide_needs_a_higher_version(client: TestClient, dirs: tuple[Path, Path]) -> None:
    guide_id, plan = _publish_tyger(client, dirs)
    before = plan.read_text()
    client.patch(f"/api/guides/{guide_id}", json={"title": "The Tyger, revised"})

    response = client.post(f"/api/guides/{guide_id}/publish")

    assert response.status_code == 409
    assert "holds version 1 with different content" in response.json()["detail"]
    assert "raise the version to 2" in response.json()["detail"]
    assert plan.read_text() == before


def test_published_version_never_goes_down(client: TestClient, dirs: tuple[Path, Path]) -> None:
    guide_id, plan = _publish_tyger(client, dirs)
    newer = json.loads(plan.read_text())
    newer["guide"]["version"] = 5
    plan.write_text(json.dumps(newer))

    response = client.post(f"/api/guides/{guide_id}/publish")

    assert response.status_code == 409
    assert "never goes down" in response.json()["detail"] and "raise the version to 6" in response.json()["detail"]
    assert json.loads(plan.read_text())["guide"]["version"] == 5


def test_versions_cannot_go_down_in_the_editor(client: TestClient, dirs: tuple[Path, Path]) -> None:
    guide_id, _ = _publish_tyger(client, dirs)
    assert client.patch(f"/api/guides/{guide_id}", json={"contentVersion": 3}).json()["contentVersion"] == 3

    assert client.patch(f"/api/guides/{guide_id}", json={"contentVersion": 2}).status_code == 409


def test_saved_version_cannot_be_published(client: TestClient, dirs: tuple[Path, Path]) -> None:
    guide_id, _ = _publish_tyger(client, dirs)
    client.patch(f"/api/guides/{guide_id}", json={"contentVersion": 2})
    assert client.post(f"/api/guides/{guide_id}/publish").status_code == 200
    saved = client.get(f"/api/guides/{guide_id}/versions").json()[1]

    assert client.post(f"/api/guides/{saved['id']}/publish").status_code == 409


def test_list_shows_a_newer_unpublished_version(client: TestClient, dirs: tuple[Path, Path]) -> None:
    guide_id, _ = _publish_tyger(client, dirs)

    def summary() -> dict:
        return client.get("/api/guides").json()[0]

    assert (summary()["publishedVersion"], summary()["newerVersion"]) == (1, None)
    client.patch(f"/api/guides/{guide_id}", json={"contentVersion": 2})
    assert (summary()["publishedVersion"], summary()["newerVersion"]) == (1, 2)
    client.post(f"/api/guides/{guide_id}/approve")
    assert client.post(f"/api/guides/{guide_id}/publish").status_code == 200
    assert (summary()["publishedVersion"], summary()["newerVersion"]) == (2, None)


def test_unpublished_guide_has_no_newer_version(client: TestClient, dirs: tuple[Path, Path]) -> None:
    _import_and_approve(client, load_example())

    guide = client.get("/api/guides").json()[0]

    assert (guide["publishedVersion"], guide["newerVersion"]) == (None, None)
