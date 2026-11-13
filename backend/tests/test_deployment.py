# ruff: noqa: F811
from unittest.mock import Mock

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import OperationalError
from test_guides import client  # noqa: F401

from app.core.config import Settings
from app.main import health


def test_database_password_with_reserved_characters() -> None:
    password = "p@ss:/%?#$' word"
    config = Settings(
        _env_file=None,
        db_password=SecretStr(password),
        db_host="postgres",
        db_user="bamba",
        db_name="bamba_guide_studio",
    )
    url = config.database_connection_url
    assert isinstance(url, URL)
    assert url.password == password
    assert make_url(url.render_as_string(hide_password=False)).password == password
    assert password not in repr(config)
    assert url.host == "postgres"
    assert url.drivername == "postgresql+psycopg"


def test_existing_database_url_still_supported() -> None:
    config = Settings(
        _env_file=None,
        db_password=None,
        database_url="postgresql+psycopg://editor:secret@localhost:55432/studio",
    )
    assert config.database_connection_url == config.database_url


def test_health_checks_database_connection(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_returns_503_without_exposing_database_error() -> None:
    db = Mock()
    db.execute.side_effect = OperationalError("SELECT 1", {}, Exception("private connection info"))
    try:
        health(db)
    except HTTPException as error:
        assert error.status_code == 503
        assert error.detail == "Database unavailable"
    else:
        raise AssertionError("Unavailable database was reported as healthy")
