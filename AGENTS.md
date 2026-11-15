# AGENTS.md — Bamba Guide Studio

## Role

You are implementing **Bamba Guide Studio**, a desktop-first web app for editing, reviewing, validating, approving, and exporting curated guided poem plans.

Guide generation is out of scope. Do not add OpenAI API calls or runtime generation features.

The app imports draft guide JSON, lets a human editor refine it, and exports approved guide JSON for the Bamba Flutter app.

---

## Required Tech Stack

Use:

### Backend
- FastAPI
- SQLAlchemy 2.x
- Alembic
- PostgreSQL
- Pydantic v2
- pytest

### Frontend
- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- react-router, not react-router-dom
- React Hook Form
- Zod
- dnd-kit
- react-markdown

Do not replace this with Next.js, Prisma, or SQLite unless the user explicitly asks.

---

## Must Follow

- Use TypeScript in the frontend.
- Use Python type hints in the backend.
- Use SQLAlchemy 2.x style.
- Use Alembic for migrations.
- Use PostgreSQL, preferably via Docker Compose for local development.
- Build the UI for a laptop and a phone. The bulk of authoring happens on a
  laptop; review, text edits, approval and publishing must work on a phone.
- Match Bamba’s warm, calm, literary design.
- Never create a generic admin dashboard aesthetic.
- JSON export must match `schemas/guided-plan.schema.json`.
- Review import must match `schemas/guide-review.schema.json`.
- Preserve stable external IDs when editing/importing/exporting.
- Preserve user-authored content unless the user explicitly accepts a review suggestion.

---

## Do Not Implement

- OpenAI API integration.
- Backend guide generation.
- User accounts.
- Cloud sync.
- Collaboration.
- Community features.
- Flutter runtime rendering.

---

## Output Expectations

When implementing, deliver:

1. Backend code.
2. Frontend code.
3. SQLAlchemy models.
4. Alembic migrations.
5. JSON schemas.
6. Seed example guide.
7. Import/export functionality.
8. Review import functionality.
9. Validation UI.
10. Mobile preview panel, in the app's own typography.
11. Tests.
12. README instructions.

---

## UX Requirements

The Guide Studio should feel like:

> an editor’s desk beside the fire

not:

> an enterprise CMS

Use:
- warm ivory backgrounds,
- deep ink typography,
- amber accents,
- soft borders,
- spacious forms,
- calm review cards.

Avoid:
- dense tables,
- harsh alerts,
- over-saturated colors,
- cluttered toolbars.

---

## Validation Requirements

Guide export is allowed only when:

- guide status is `approved`,
- schema validation passes,
- no blocking validation issues remain,
- no blocking review comments are open.

---

## File Format Rule

Approved guides must be exported as JSON in the exact same format expected by the Bamba Flutter app.

Target export path convention:

```text
exports/curated_poems/<author-name>--<poem-title>/guided_plan.json
```

The authoritative Hetzner Studio writes persistent exports outside its application
checkout (`STUDIO_EXPORTS_DIR` on the host, `/srv/exports` inside the container).
It is the sole publisher to private `jetridl/bamba-content`, branch `main`.
Publish saves locally, then commits/pushes the validated complete export snapshot.
A failed push leaves exports intact and is retried every 60 seconds and on restart;
never require a new authored version just to retry Git. Keep one backend worker:
publish routes and the retry worker share a process lock to avoid partial snapshots.

Approved Journeys live at `exports/journeys/<journey_id>/` (`journey.json` and
cover); `guides/journeys/<journey_id>/` links to them. Development exports tracked
here are retained as bootstrap/test fixtures, not the ongoing production source.
Do not enable `CONTENT_SYNC_ENABLED` on a development laptop.

Bamba's `./tool/flutter run/build …` fetches main, validates and registers content
before Flutter starts. No manual Studio commit, app pin or sync step is needed.
Never copy exports into the Flutter Git tree. Preserve stable IDs and increasing
authored versions. See `docs/content-publishing.md` for credentials, migration,
private-repo CI access and recovery.
