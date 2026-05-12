from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import exports, guides, imports, reviews, validation
from app.core.config import settings

app = FastAPI(title="Bamba Guide Studio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(guides.router, prefix="/api", tags=["guides"])
app.include_router(imports.router, prefix="/api", tags=["imports"])
app.include_router(exports.router, prefix="/api", tags=["exports"])
app.include_router(validation.router, prefix="/api", tags=["validation"])
app.include_router(reviews.router, prefix="/api", tags=["reviews"])


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
