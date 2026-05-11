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