from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# <repo root>; /srv in the Docker image.
ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://bamba:bamba@localhost:5432/bamba_guide_studio"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # At startup, import approved guides from this folder that Studio does not hold yet.
    load_published_guides: bool = True
    # Publish writes approved guides here, and links each one from guides_dir.
    published_guides_dir: Path = ROOT / "exports" / "curated_poems"
    guides_dir: Path = ROOT / "guides" / "json"
    # Publish writes approved Journeys here; startup and Refresh load them back.
    published_journeys_dir: Path = ROOT / "exports" / "journeys"
    # Journey drafts and their cover images. Refresh adds new ones from here.
    journeys_dir: Path = ROOT / "guides" / "journeys"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
