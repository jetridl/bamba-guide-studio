# Bamba Guide Studio

Desktop-first editorial tool for importing, editing, reviewing, validating, approving, and exporting curated guided poem plans for the Bamba mobile app.

## Stack

Backend:
- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL

Frontend:
- Vite
- React
- TypeScript
- Tailwind
- shadcn/ui
- react-router

## Local Development

Start Postgres:

```bash
docker compose up -d
```

Install backend dependencies:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create a backend `.env` if needed:

```text
DATABASE_URL=postgresql+psycopg://bamba:bamba@localhost:5432/bamba_guide_studio
```

Run migrations:

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

Start backend:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

Start frontend:

```bash
cd frontend
npm run dev
```

Open:

```text
http://localhost:5173
```

Guide generation is out of scope. Guide Studio imports, edits, reviews, validates, approves, and exports guides.

## Editorial Workflow

1. Open `/guides/import` and paste guided-plan JSON, such as `example-guided-plan.json`.
2. Edit sessions and pages in `/guides/:guideId`; page changes autosave after a short debounce.
3. Import structured review JSON from `/guides/:guideId/reviews/import`.
4. Resolve, dismiss, or accept review comments beside each page.
5. Validate the guide from the bottom utility bar.
6. Approve the guide when no blocking issues remain.
7. Export JSON for the Flutter asset convention:

```text
assets/curated_poems/<poem_id>/guided_plan.json
```

Full chunk typing uses page type `full_chunk_typing_game` and derived round type `fullChunkTyping`. The learner types all selected chunk text from memory without starting-letter cues. Select chunks on the page or leave `chunkIds` empty to use the session's chunks. The Flutter guided-plan parser and study game mappings must support these new values before consuming such exports; see [the integration spec](docs/flutter-guided-plan-json-integration-spec.md#game-pages).

## Checks

Backend:

```bash
cd backend
source .venv/bin/activate
pytest
```

Frontend:

```bash
cd frontend
npm run build
npm run lint
```
