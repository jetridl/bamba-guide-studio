from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

# <repo root>; /srv in the Docker image.
ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://bamba:bamba@localhost:5432/bamba_guide_studio"
    # Production passes the raw password separately; URL.create handles @, %, /, etc.
    db_password: SecretStr | None = None
    db_host: str = "localhost"
    db_port: int = 5432
    db_user: str = "bamba"
    db_name: str = "bamba_guide_studio"
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

    @property
    def database_connection_url(self) -> URL | str:
        if self.db_password is None:
            return self.database_url
        return URL.create(
            "postgresql+psycopg",
            username=self.db_user,
            password=self.db_password.get_secret_value(),
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )


settings = Settings()
