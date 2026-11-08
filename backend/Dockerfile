# Build context is the repository root, so the image can include ../schemas.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv/backend

COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# json_schema.py loads schemas from <repo root>/schemas, which is /srv/schemas here.
COPY schemas /srv/schemas
COPY backend/alembic.ini ./alembic.ini
COPY backend/migrations ./migrations
COPY backend/app ./app

RUN useradd --system --no-create-home studio
USER studio

EXPOSE 8000

# Apply migrations on every start, then serve the API.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
