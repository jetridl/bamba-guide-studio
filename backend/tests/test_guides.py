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
    assert data["version"] == 1
    assert data["status"] == "draft"
    assert data["poem"]["chunks"][0]["sectionId"] == "stanza_1"


def test_duplicate_import_creates_new_version(client: TestClient) -> None:
    payload = load_example()

    first = client.post("/api/import/guide", json=payload).json()
    second = client.post("/api/import/guide", json=payload).json()

    assert first["id"] != second["id"]
    assert first["version"] == 1
    assert second["version"] == 2


def test_import_rejects_invalid_schema(client: TestClient) -> None:
    response = client.post("/api/import/guide", json={"schemaVersion": 1})

    assert response.status_code == 422
    assert "Guide JSON does not match schema" in response.text


def test_approve_and_export_round_trip_marks_exported(client: TestClient) -> None:
    imported = client.post("/api/import/guide", json=load_example()).json()

    approve_response = client.post(f"/api/guides/{imported['id']}/approve")
    assert approve_response.status_code == 200

    export_response = client.get(f"/api/guides/{imported['id']}/export")

    assert export_response.status_code == 200
    exported = export_response.json()
    assert exported["guide"]["id"] == "the_tyger_guide_v1"
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
