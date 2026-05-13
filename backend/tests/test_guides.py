from __future__ import annotations

import json
import os
import sys
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def load_example() -> dict:
    return json.loads((ROOT / "example-guided-plan.json").read_text())


def test_import_guide_reconstructs_sections_and_returns_detail(client: TestClient) -> None:
    response = client.post("/api/import/guide", json=load_example())

    assert response.status_code == 200
    data = response.json()
    assert data["externalId"] == "the_tyger_guide_v1"
    assert data["version"] == 0
    assert data["versionLabel"] == "latest"
    assert data["status"] == "draft"
    assert data["poem"]["chunks"][0]["sectionId"] == "stanza_1"


def test_duplicate_import_overwrites_latest_without_new_list_entry(client: TestClient) -> None:
    payload = load_example()

    first = client.post("/api/import/guide", json=payload).json()
    second = client.post("/api/import/guide", json=payload).json()
    guides = client.get("/api/guides").json()

    assert first["id"] == second["id"]
    assert second["version"] == 0
    assert len(guides) == 1
    assert guides[0]["versionLabel"] == "latest"


def test_save_version_snapshots_latest_and_keeps_grouped_list(client: TestClient) -> None:
    imported = client.post("/api/import/guide", json=load_example()).json()

    save_response = client.post(f"/api/guides/{imported['id']}/save-version")
    guides = client.get("/api/guides").json()

    assert save_response.status_code == 200
    assert save_response.json()["versionLabel"] == "latest"
    assert len(guides) == 1
    assert guides[0]["savedVersions"] == [1]
    assert guides[0]["savedVersionCount"] == 1


def test_versions_endpoint_lists_latest_and_saved_versions_with_timestamps(client: TestClient) -> None:
    imported = client.post("/api/import/guide", json=load_example()).json()
    client.post(f"/api/guides/{imported['id']}/save-version")

    versions = client.get(f"/api/guides/{imported['id']}/versions").json()

    assert [version["versionLabel"] for version in versions] == ["latest", "v1"]
    assert versions[0]["isLatest"] is True
    assert versions[1]["isLatest"] is False
    assert versions[1]["timestamp"]


def test_saved_version_is_read_only_and_can_restore_latest(client: TestClient) -> None:
    imported = client.post("/api/import/guide", json=load_example()).json()
    client.post(f"/api/guides/{imported['id']}/save-version")
    versions = client.get(f"/api/guides/{imported['id']}/versions").json()
    saved = next(version for version in versions if version["version"] == 1)
    saved_detail = client.get(f"/api/guides/{saved['id']}").json()
    saved_page = saved_detail["sessions"][0]["pages"][0]

    patch_response = client.patch(f"/api/pages/{saved_page['id']}", json={"title": "Changed"})
    restore_response = client.post(f"/api/guides/{saved['id']}/restore-latest")

    assert patch_response.status_code == 409
    assert restore_response.status_code == 200
    assert restore_response.json()["versionLabel"] == "latest"


def test_import_rejects_invalid_schema(client: TestClient) -> None:
    response = client.post("/api/import/guide", json={"schemaVersion": 1})

    assert response.status_code == 422
    assert "Guide JSON does not match schema" in response.text


def test_game_round_type_is_derived_from_page_type(client: TestClient) -> None:
    payload = load_example()
    payload["sessions"][0]["pages"][0]["type"] = "first_letter_game"
    payload["sessions"][0]["pages"][0]["roundType"] = "hiddenWord"
    payload["sessions"][0]["pages"][0]["chunkIds"] = ["stanza_1_line_1"]

    response = client.post("/api/import/guide", json=payload)
    validation = client.get(f"/api/guides/{response.json()['id']}/validate")
    approve = client.post(f"/api/guides/{response.json()['id']}/approve")
    exported = client.get(f"/api/guides/{response.json()['id']}/export").json()

    assert response.status_code == 200
    assert validation.status_code == 200
    assert approve.status_code == 200
    assert exported["sessions"][0]["pages"][0]["roundType"] == "firstLetter"
    assert not [
        issue
        for issue in validation.json()["issues"]
        if issue["severity"] == "blocking" and issue["code"] in {"schema", "unknown_page_type"}
    ]


def test_chunk_scoped_page_uses_session_chunks_by_default(client: TestClient) -> None:
    payload = load_example()
    payload["sessions"][0]["chunkIds"] = ["stanza_1_line_1", "stanza_1_line_2"]
    payload["sessions"][0]["pages"][0]["type"] = "poem_chunk"
    payload["sessions"][0]["pages"][0]["chunkIds"] = []

    imported = client.post("/api/import/guide", json=payload).json()
    validation = client.get(f"/api/guides/{imported['id']}/validate").json()
    approve = client.post(f"/api/guides/{imported['id']}/approve")
    exported = client.get(f"/api/guides/{imported['id']}/export").json()

    assert approve.status_code == 200
    assert exported["sessions"][0]["chunkIds"] == ["stanza_1_line_1", "stanza_1_line_2"]
    assert exported["sessions"][0]["pages"][0]["chunkIds"] == []
    assert not [
        issue
        for issue in validation["issues"]
        if issue["severity"] == "blocking" and issue["code"] == "poem_chunk_without_chunks"
    ]


def test_page_chunk_selection_must_stay_inside_session_chunks(client: TestClient) -> None:
    payload = load_example()
    payload["sessions"][0]["chunkIds"] = ["stanza_1_line_1"]
    payload["sessions"][0]["pages"][0]["type"] = "hidden_word_game"
    payload["sessions"][0]["pages"][0]["chunkIds"] = ["stanza_1_line_2"]

    imported = client.post("/api/import/guide", json=payload).json()
    validation = client.get(f"/api/guides/{imported['id']}/validate").json()

    assert any(issue["code"] == "page_chunk_outside_session" for issue in validation["issues"])


def test_whole_poem_and_previous_recap_page_types_are_valid(client: TestClient) -> None:
    payload = load_example()
    payload["sessions"][0]["pages"] = [
        {
            "id": "day1_full_poem",
            "type": "whole_poem",
            "orderIndex": 0,
            "title": "The whole poem",
            "bodyMarkdown": None,
            "prompt": None,
            "chunkIds": [],
            "roundType": None,
        },
        {
            "id": "day1_recap_previous",
            "type": "recap_previous",
            "orderIndex": 1,
            "title": "Yesterday's lines",
            "bodyMarkdown": "Return to the sound before moving on.",
            "prompt": None,
            "chunkIds": ["stanza_1_line_1"],
            "roundType": None,
        },
    ]

    response = client.post("/api/import/guide", json=payload)
    validation = client.get(f"/api/guides/{response.json()['id']}/validate").json()

    assert response.status_code == 200
    assert not [
        issue
        for issue in validation["issues"]
        if issue["severity"] == "blocking" and issue["code"] in {"schema", "unknown_page_type", "missing_body"}
    ]


def test_reflection_pages_use_prompt_not_body_markdown(client: TestClient) -> None:
    payload = load_example()
    payload["sessions"][0]["pages"][0]["type"] = "reflection"
    payload["sessions"][0]["pages"][0]["bodyMarkdown"] = None
    payload["sessions"][0]["pages"][0]["prompt"] = "What image from these lines stayed with you?"

    response = client.post("/api/import/guide", json=payload)
    validation = client.get(f"/api/guides/{response.json()['id']}/validate").json()
    approve = client.post(f"/api/guides/{response.json()['id']}/approve")
    exported = client.get(f"/api/guides/{response.json()['id']}/export").json()

    assert response.status_code == 200
    assert approve.status_code == 200
    assert exported["sessions"][0]["pages"][0]["prompt"] == "What image from these lines stayed with you?"
    assert exported["sessions"][0]["pages"][0]["bodyMarkdown"] is None
    assert not [
        issue
        for issue in validation["issues"]
        if issue["severity"] == "blocking" and issue["code"] in {"missing_prompt", "reflection_body_not_allowed", "schema"}
    ]


def test_reflection_body_markdown_is_rejected_by_schema(client: TestClient) -> None:
    payload = load_example()
    payload["sessions"][0]["pages"][0]["type"] = "reflection"
    payload["sessions"][0]["pages"][0]["bodyMarkdown"] = "This should be a prompt."
    payload["sessions"][0]["pages"][0]["prompt"] = "What image stayed with you?"

    response = client.post("/api/import/guide", json=payload)

    assert response.status_code == 422


def test_chunks_are_ordered_by_section_then_chunk_order(client: TestClient) -> None:
    payload = load_example()
    payload["chunks"] = [
        {
            "id": "s1_l1",
            "sectionId": "section_1",
            "orderIndex": 0,
            "text": "Section one line one",
        },
        {
            "id": "s1_l2",
            "sectionId": "section_1",
            "orderIndex": 1,
            "text": "Section one line two",
        },
        {
            "id": "s2_l1",
            "sectionId": "section_2",
            "orderIndex": 0,
            "text": "Section two line one",
        },
        {
            "id": "s2_l2",
            "sectionId": "section_2",
            "orderIndex": 1,
            "text": "Section two line two",
        },
    ]
    payload["sessions"][0]["chunkIds"] = ["s1_l1", "s1_l2", "s2_l1", "s2_l2"]
    payload["sessions"][0]["pages"][0]["type"] = "poem_chunk"
    payload["sessions"][0]["pages"][0]["chunkIds"] = ["s1_l1", "s1_l2", "s2_l1", "s2_l2"]

    imported = client.post("/api/import/guide", json=payload).json()
    detail = client.get(f"/api/guides/{imported['id']}").json()

    assert [chunk["externalId"] for chunk in detail["poem"]["chunks"]] == ["s1_l1", "s1_l2", "s2_l1", "s2_l2"]


def test_approve_and_export_round_trip_marks_exported(client: TestClient) -> None:
    imported = client.post("/api/import/guide", json=load_example()).json()

    approve_response = client.post(f"/api/guides/{imported['id']}/approve")
    assert approve_response.status_code == 200

    export_response = client.get(f"/api/guides/{imported['id']}/export")

    assert export_response.status_code == 200
    exported = export_response.json()
    assert exported["guide"]["id"] == "the_tyger_guide_v1"
    assert exported["guide"]["version"] == 1
    assert exported["guide"]["status"] == "exported"
    assert exported["chunks"][0]["id"] == "stanza_1_line_1"
    assert exported["sessions"][0]["pages"][0]["id"] == "day1_page1"


def test_open_blocking_review_comment_blocks_approval(client: TestClient) -> None:
    imported = client.post("/api/import/guide", json=load_example()).json()
    review = {
        "schemaVersion": 1,
        "guideId": "the_tyger_guide_v1",
        "reviewer": "editor",
        "summary": "Needs a fix.",
        "comments": [
            {
                "id": "blocking_1",
                "targetType": "page",
                "targetId": "day1_page1",
                "severity": "blocking",
                "category": "clarity",
                "comment": "This page needs revision before export.",
                "suggestedRevision": "Revised copy.",
            }
        ],
    }

    review_response = client.post("/api/import/review", json=review)
    approve_response = client.post(f"/api/guides/{imported['id']}/approve")

    assert review_response.status_code == 200
    assert approve_response.status_code == 409
