import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import exports, guides, imports, journeys, reviews, validation
from app.core.config import settings
from app.core.database import SessionLocal
from app.services.journey_loader import load_journey_folders
from app.services.published_guides import load_published_guides

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    if settings.load_published_guides:
        try:
            with SessionLocal() as db:
                load_published_guides(db, settings.published_guides_dir)
                # After the guides: a Journey needs its poems in Studio.
                load_journey_folders(db, [settings.published_journeys_dir])
        except Exception:
            # A loading problem must not stop the Studio from starting.
            logger.exception("Could not load published guides.")
    yield


app = FastAPI(title="Bamba Guide Studio API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(journeys.router, prefix="/api", tags=["journeys"])
app.include_router(guides.router, prefix="/api", tags=["guides"])
app.include_router(imports.router, prefix="/api", tags=["imports"])
app.include_router(exports.router, prefix="/api", tags=["exports"])
app.include_router(validation.router, prefix="/api", tags=["validation"])
app.include_router(reviews.router, prefix="/api", tags=["reviews"])


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
