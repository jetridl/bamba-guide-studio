# Bamba Guide Studio Implementation Plan

## Summary

Implement Bamba Guide Studio as a vertical slice first, then broaden the editor, review, validation, and export workflows. The app uses the prepared FastAPI/PostgreSQL backend and Vite/React frontend scaffold. Guide generation, OpenAI API calls, auth, cloud sync, collaboration, and Flutter runtime rendering remain out of scope.

## Spec Clarifications

- `schemas/guided-plan.schema.json` remains the authoritative guide import/export contract.
- `schemas/guide-review.schema.json` remains the authoritative review import contract.
- Top-level poem sections are not added to guided-plan JSON.
- Internal `poem_sections` records are reconstructed from `chunks[].sectionId`.
- Reimporting a guide with an existing `guide.id` creates a new editable version/import snapshot instead of overwriting prior editorial work.
- Review suggestions mutate content only for whitelisted editable page fields: `title`, `bodyMarkdown`, and `prompt`.
- Exporting an approved guide marks the persisted guide as `exported`; exported guides can be downloaded again.

## Phase 1: Backend Foundation

- Add SQLAlchemy 2.x models for poems, reconstructed poem sections, chunks, guides, sessions, pages, reviews, and review comments.
- Add Alembic migration for the full schema, including stable external ID constraints.
- Add Pydantic v2 request schemas for guide/session/page patches, reorders, review comment status updates, and validation issues.
- Add services for JSON Schema validation, guide import/export, editorial validation, guide editing, and review workflows.

## Phase 2: Import, Read, and Round Trip

- Implement guide JSON import with schema validation, poem/chunk upsert, section reconstruction, new guide versioning, and raw import snapshots.
- Implement guide list/detail APIs with nested poem, chunks, sessions, pages, and review summary data.
- Implement export JSON assembly that preserves stable external IDs and matches `guided-plan.schema.json`.
- Add tests for schema rejection, successful import, duplicate version import, section reconstruction, and import/export preservation.

## Phase 3: Frontend Foundation

- Replace the Vite starter with routes for guide list, guide import, guide editor, and review import.
- Add a typed API client and frontend domain types.
- Establish the warm ivory, deep ink, amber-accent Bamba visual system in Tailwind tokens.
- Build loading, empty, error, and navigation states around the real backend API.

## Phase 4: Editor Vertical Slice

- Build the desktop 3-column editor: sessions navigator, page editor, and mobile preview/review panel.
- Support editing page type, title, body markdown, prompt, linked chunks, round type, estimated seconds, and page metadata.
- Support session title, subtitle, and focus summary editing.
- Autosave field patches after a 500ms debounce and show saved/error state.
- Reorder pages with dnd-kit while preserving stable external IDs.
- Add page create, duplicate, and delete actions.

## Phase 5: Review Workflow

- Implement review JSON import with schema validation and target resolution by stable external IDs.
- Store unresolved targets without dropping comment metadata.
- Display page/guide review cards beside the active page.
- Implement comment status transitions: open, accepted, dismissed, and resolved.
- Accept whitelisted field suggestions by applying `suggestedRevision`; all other accepted comments only update status.

## Phase 6: Validation, Approval, and Export

- Implement validation for schema issues, editorial blocking issues, warnings, suggestions, and open blocking review comments.
- Implement mark-in-review and approve transitions.
- Allow approval only when blocking validation issues are clear.
- Allow export only when the guide is approved or already exported, schema validation passes, and no blocking issues remain.
- Return export JSON as a download response and display the convention `assets/curated_poems/<poem_id>/guided_plan.json`.

## Phase 7: Polish, Tests, and Documentation

- Complete the mobile preview rendering for text, poem chunk, game, reflection, and completion pages.
- Update README with Docker Compose, backend, Alembic, frontend, test, import, review, validation, approval, and export instructions.
- Run backend pytest and frontend build/lint checks.
- Keep the UI calm and editorial, avoiding dense admin-table patterns.

## Acceptance Criteria

- A draft guide JSON can be imported from `example-guided-plan.json`.
- Imported guides preserve external IDs and create a new version on duplicate import.
- Editors can update all primary page fields and linked chunks.
- Review JSON can be imported, displayed, accepted, dismissed, or resolved.
- Validation blocks approval/export for blocking issues and open blocking review comments.
- Approved guides export as JSON matching `schemas/guided-plan.schema.json`.
- Exported JSON uses the Bamba Flutter asset path convention.
