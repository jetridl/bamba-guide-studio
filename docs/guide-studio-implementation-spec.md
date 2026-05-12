# Bamba Guide Studio — Implementation Specification

## 1. Purpose

Bamba Guide Studio is a desktop-first web application for editing, reviewing, validating, approving, and exporting curated guided poem plans for the Bamba mobile app.

Guide generation happens outside this tool using ChatGPT, Codex CLI, or manual writing. Guide Studio is **not** responsible for generating guides. It is responsible for turning draft JSON into reviewed, structured, validated, exportable guide assets.

The exported guide JSON is bundled into the Bamba Flutter app. On app startup, approved guides are imported into the mobile app database.

---

## 2. Product Goal

Build an internal editorial tool that lets the user:

1. Import a draft guide JSON.
2. View poem, sessions, and pages.
3. Edit pages individually.
4. Reorder sessions and pages.
5. Link pages to poem chunks.
6. Preview each page in a Bamba-style mobile preview.
7. Import structured review comments from ChatGPT.
8. See review comments side-by-side with each page.
9. Accept, dismiss, or resolve review suggestions.
10. Validate the guide against schema and editorial rules.
11. Mark guide as approved.
12. Export approved guide JSON in the exact same schema consumed by the Bamba app.

---

## 3. Required Stack

Use the user's normal stack.

### Backend

- FastAPI
- SQLAlchemy 2.x
- Alembic
- PostgreSQL
- Pydantic v2
- python-jsonschema or equivalent for JSON Schema validation
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
- dnd-kit for drag-and-drop ordering
- react-markdown for markdown preview

### Development

- Docker Compose for Postgres
- Separate backend and frontend folders
- Clear README with local setup

Use this stack unless an existing repo already has a conflicting structure.

---

## 4. Suggested Repository Structure

```text
bamba-guide-studio/
  backend/
    app/
      main.py
      api/
        routes/
          guides.py
          imports.py
          exports.py
          reviews.py
          validation.py
      core/
        config.py
        database.py
      models/
        guide.py
        poem.py
        review.py
      schemas/
        guide.py
        review.py
        validation.py
      services/
        import_service.py
        export_service.py
        validation_service.py
        review_service.py
      repositories/
        guide_repository.py
      migrations/
      tests/
    alembic.ini
    pyproject.toml

  frontend/
    src/
      app/
        router.tsx
      components/
      features/
        guides/
        editor/
        preview/
        reviews/
        validation/
      lib/
        api.ts
        schemas.ts
      styles/
    index.html
    package.json
    vite.config.ts

  schemas/
    guided-plan.schema.json
    guide-review.schema.json

  AGENTS.md
  docker-compose.yml
  README.md
```

---

## 5. Visual Direction

Match the Bamba mobile app:

- warm ivory background
- deep ink text
- amber accent
- soft borders
- rounded cards
- spacious typography
- calm, literary, editorial feel

Avoid:
- admin-dashboard heaviness
- harsh tables
- saturated colors
- dense enterprise UI

The Guide Studio should feel like an editorial writing desk, not a CMS.

---

## 6. Core Layout

Use a 3-column desktop layout.

```text
┌─────────────────────────────────────────────────────────────┐
│ Top Bar                                                    │
├─────────────┬──────────────────────┬────────────────────────┤
│ Sessions    │ Page Editor          │ Mobile Preview + Review│
│ Navigator   │                      │                        │
├─────────────┴──────────────────────┴────────────────────────┤
│ Bottom Utility Bar                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Data Model

Use PostgreSQL as the editable source of truth. JSON is import/export format only.

Use UUID primary keys represented as strings in API responses.

Clarifications:

- The guided-plan JSON format does not contain top-level poem sections.
- Internal `poem_sections` rows are reconstructed from `chunks[].sectionId`.
- Reimporting an existing `guide.id` creates a new guide version instead of overwriting earlier editorial work.
- Accepting review suggestions mutates only whitelisted editable page fields; otherwise it only changes review comment status.
- Export marks an approved guide as `exported`, and exported guides may be downloaded again.

### guides

- id: uuid primary key
- external_id: text unique
- poem_id: uuid foreign key
- title: text
- version: int
- status: draft | in_review | approved | exported
- metadata_json: jsonb
- import_snapshot_json: jsonb nullable
- created_at: timestamptz
- updated_at: timestamptz

### poems

- id: uuid primary key
- external_id: text unique
- title: text
- author: text
- text: text
- year: int nullable
- metadata_json: jsonb
- created_at: timestamptz
- updated_at: timestamptz

### poem_sections

- id: uuid primary key
- external_id: text
- poem_id: uuid foreign key
- title: text nullable
- order_index: int

Unique: poem_id + external_id

### poem_chunks

- id: uuid primary key
- external_id: text
- poem_id: uuid foreign key
- section_id: uuid nullable foreign key
- order_index: int
- text: text
- metadata_json: jsonb

Unique: poem_id + external_id

### guide_sessions

- id: uuid primary key
- external_id: text
- guide_id: uuid foreign key
- session_number: int
- title: text
- subtitle: text nullable
- focus_summary: text nullable
- order_index: int
- metadata_json: jsonb

Unique: guide_id + external_id

### guide_pages

- id: uuid primary key
- external_id: text
- session_id: uuid foreign key
- page_type: text
- order_index: int
- title: text nullable
- body_markdown: text nullable
- chunk_ids_json: jsonb
- round_type: text nullable
- prompt: text nullable
- metadata_json: jsonb
- estimated_seconds: int nullable

Unique: session_id + external_id

### guide_reviews

- id: uuid primary key
- guide_id: uuid foreign key
- reviewer: text
- summary: text nullable
- imported_at: timestamptz
- raw_json: jsonb

### guide_review_comments

- id: uuid primary key
- external_id: text
- review_id: uuid foreign key
- target_type: guide | session | page | field
- target_external_id: text nullable
- target_db_id: uuid nullable
- field: text nullable
- severity: note | suggestion | warning | blocking
- category: tone | pacing | clarity | difficulty | memorisation | literary_accuracy | schema | chunking | ux | copy
- comment: text
- suggested_revision: text nullable
- status: open | accepted | dismissed | resolved
- created_at: timestamptz
- updated_at: timestamptz

---

## 8. Backend API

Base path: `/api`

### Guides

```http
GET /api/guides
GET /api/guides/{guide_id}
PATCH /api/guides/{guide_id}
DELETE /api/guides/{guide_id}
POST /api/guides/{guide_id}/approve
POST /api/guides/{guide_id}/mark-in-review
```

### Sessions

```http
POST /api/guides/{guide_id}/sessions
PATCH /api/sessions/{session_id}
DELETE /api/sessions/{session_id}
POST /api/guides/{guide_id}/sessions/reorder
```

### Pages

```http
POST /api/sessions/{session_id}/pages
PATCH /api/pages/{page_id}
DELETE /api/pages/{page_id}
POST /api/sessions/{session_id}/pages/reorder
POST /api/pages/{page_id}/duplicate
```

### Import / Export

```http
POST /api/import/guide
POST /api/import/review
GET /api/guides/{guide_id}/export
```

### Validation

```http
GET /api/guides/{guide_id}/validate
```

---

## 9. Import Guide Flow

Endpoint: `POST /api/import/guide`

Input:
- JSON body matching `guided-plan.schema.json`

Steps:
1. Validate JSON Schema.
2. Validate editorial rules.
3. Upsert poem by `poem.id`.
4. Upsert chunks by `chunk.id`.
5. Create guide.
6. Create sessions.
7. Create pages.
8. Store raw import snapshot.
9. Return guide ID.

Imported guide starts as `draft`.

Preserve external IDs from JSON. Database IDs can be different UUIDs.

---

## 10. Export Guide Flow

Endpoint: `GET /api/guides/{guide_id}/export`

Only allow export if:
- guide status = approved
- schema validation passes
- no blocking editorial validation issues
- no open blocking review comments

Export JSON must:
- match `guided-plan.schema.json`
- preserve external IDs
- include poem, chunks, sessions, pages
- output status as `approved` unless already `exported`

Target file convention:

```text
assets/curated_poems/<poem_id>/guided_plan.json
```

The backend returns JSON as a download response.

---

## 11. Import Review Flow

Endpoint: `POST /api/import/review`

Input:
- JSON matching `guide-review.schema.json`

Steps:
1. Validate schema.
2. Find guide by `guideId`.
3. Store raw review.
4. Store comments.
5. Resolve targets by external IDs where possible.
6. Return imported review ID.

Accepting suggestion:
- if targetType = field and field is editable:
  - update target field with suggested revision
  - set comment status = accepted
- otherwise:
  - set status = resolved or accepted without field mutation

---

## 12. Validation Rules

### Blocking

- Missing guide id
- Missing poem id
- Missing poem title
- Missing poem text
- No sessions
- Session has no pages
- Page type unknown
- Required field missing for page type
- Game page references no chunks
- Page references chunk ID that does not exist
- Duplicate session order
- Duplicate page order within session
- Open blocking review comments

### Warning

- Commentary page body longer than 120 words
- Session estimated time > 12 minutes
- More than 3 commentary/context pages in a row
- More than 3 games in a row
- Missing reflection in session
- Completion page missing
- More than 8 pages in a session

### Suggestion

- Intro page is very short
- Repeated page title
- Consecutive pages use same wording
- Tone may be too academic
- Too many chunks in one poem_chunk page

---

## 13. Frontend Routes

Use `react-router`.

```text
/
  redirect to /guides

/guides
  guide list

/guides/import
  import guide JSON

/guides/:guideId
  guide editor

/guides/:guideId/reviews/import
  import review JSON
```

---

## 14. Required Frontend Components

- TopBar
- GuideStatusPill
- SessionsNavigator
- SessionNode
- PageNode
- PageEditor
- PageTypeForm
- ChunkSelector
- MobilePreview
- ReviewPanel
- ReviewCommentCard
- ValidationPanel
- BottomUtilityBar
- ImportJsonDialog
- ExportDialog

---

## 15. Page Editor Behavior

### Autosave

Autosave after 500ms debounce.

### Reordering

When sessions or pages are reordered:
- call reorder endpoint
- update `orderIndex`
- preserve stable external IDs

### Page Type Change

Changing page type should:
- preserve shared fields where possible
- clear incompatible fields only after confirmation

---

## 16. Mobile Preview Behavior

Preview must render:

- intro/context/commentary/background pages as text pages
- poem_chunk pages using linked chunk text
- game pages as mock game pages with blanks/badges
- reflection pages as prompt pages
- completion pages as closing pages

Preview should show:
- session progress
- page number
- current day/session label

---

## 17. Delivery Requirements

The implementation agent must deliver:

- working FastAPI backend
- working Vite React frontend
- SQLAlchemy models
- Alembic migrations
- Postgres Docker Compose
- JSON schemas
- import validation
- export validation
- review import
- side-by-side page review UI
- mobile preview
- README with setup instructions
- tests for schema validation and import/export round trip

---

## 18. Non-Goals

Do not implement:

- guide generation
- OpenAI API integration
- user authentication
- cloud deployment
- collaborative editing
- mobile responsive layout
- Bamba Flutter app renderer
