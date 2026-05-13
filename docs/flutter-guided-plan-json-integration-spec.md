# Bamba Flutter Guided Plan JSON Integration Spec

## Purpose

Update the Bamba Flutter app to consume curated guided poem plans from JSON assets instead of markdown guide files.

The source of truth for guided plans is now:

```text
schemas/guided-plan.schema.json
```

Guide Studio exports approved guide JSON for bundling into the Flutter app. The Flutter app should not generate, edit, or validate editorial content at runtime beyond defensive parsing.

## Asset Location

Each approved guide should be bundled at:

```text
assets/curated_poems/<poem_id>/guided_plan.json
```

Example:

```text
assets/curated_poems/the_tyger/guided_plan.json
```

The Flutter app should discover or load guided plans from this convention. If the app already has a curated poem registry, add a `guidedPlanAssetPath` field there. If not, use a generated/static list of known guided plan asset paths.

## JSON Contract

Each file is one complete guided plan:

```json
{
  "schemaVersion": 1,
  "guide": {},
  "poem": {},
  "chunks": [],
  "sessions": []
}
```

Required top-level fields:

- `schemaVersion`: integer, currently `1`
- `guide`: guide metadata
- `poem`: poem metadata and full poem text
- `chunks`: ordered poem chunks used by guide pages and games
- `sessions`: ordered guide sessions, each with ordered pages

The app should reject or ignore any file where `schemaVersion != 1`.

## Data Models

Create typed Dart models equivalent to the schema.

### GuidedPlan

Fields:

- `schemaVersion: int`
- `guide: GuideInfo`
- `poem: GuidedPoem`
- `chunks: List<PoemChunk>`
- `sessions: List<GuideSession>`

### GuideInfo

Fields:

- `id: String`
- `poemId: String`
- `title: String`
- `version: int`
- `status: GuideStatus`
- `description: String?`
- `metadata: Map<String, dynamic>`

Allowed statuses:

- `draft`
- `in_review`
- `approved`
- `exported`

Runtime behavior:

- The bundled app should normally load only `approved` or `exported` guides.
- `draft` and `in_review` may be useful in debug builds, but should not appear as published user-facing plans unless explicitly enabled.

### GuidedPoem

Fields:

- `id: String`
- `title: String`
- `author: String`
- `text: String`
- `year: int?`
- `metadata: Map<String, dynamic>`

### PoemChunk

Fields:

- `id: String`
- `sectionId: String?`
- `orderIndex: int`
- `text: String`
- `metadata: Map<String, dynamic>`

Notes:

- There are no top-level section records in the JSON.
- If the Flutter app needs section grouping, reconstruct sections from `chunks[].sectionId`.
- Chunks must be sorted by `orderIndex` before use.

### GuideSession

Fields:

- `id: String`
- `sessionNumber: int`
- `title: String`
- `subtitle: String?`
- `focusSummary: String?`
- `orderIndex: int`
- `chunkIds: List<String>`
- `metadata: Map<String, dynamic>`
- `pages: List<GuidePage>`

Sessions must be displayed in ascending `orderIndex`.
`chunkIds` defines the chunks studied on that day/session. For read-through and game pages, this is the default chunk scope.

### GuidePage

Fields:

- `id: String`
- `type: GuidePageType`
- `orderIndex: int`
- `title: String?`
- `bodyMarkdown: String?`
- `prompt: String?`
- `chunkIds: List<String>`
- `roundType: GuideRoundType?`

Pages must be displayed in ascending `orderIndex` within each session.

Allowed page types:

- `intro`
- `context`
- `poet_background`
- `poem_background`
- `recap`
- `recap_previous`
- `poem_chunk`
- `whole_poem`
- `commentary`
- `first_letter_game`
- `last_word_game`
- `first_last_word_game`
- `hidden_word_game`
- `reflection`
- `completion`

Derived round types:

- `readThrough`
- `firstLetter`
- `lastWord`
- `firstAndLast`
- `hiddenWord`

`roundType` is derived compatibility data. The Flutter app should not treat it as independently author-controlled. For game pages, the mechanic is determined by `type`; for non-game pages, `roundType` should be null. If `type` and `roundType` disagree, prefer `type`.

## Runtime Import Behavior

On app startup or asset seed refresh:

1. Load each `guided_plan.json` asset.
2. Decode JSON into typed models.
3. Confirm `schemaVersion == 1`.
4. Confirm `guide.poemId == poem.id`.
5. Sort chunks, sessions, and pages by `orderIndex`.
6. Build a chunk lookup by `chunk.id`.
7. Ensure all `session.chunkIds` and `page.chunkIds` resolve to known chunks.
8. Store or upsert the guide into the app database using stable external IDs.

Stable IDs:

- Use `guide.id`, `poem.id`, `chunks[].id`, `sessions[].id`, and `pages[].id` as stable external IDs.
- Do not generate replacement IDs for imported content.
- Database primary keys may be local IDs, but the external IDs must be preserved.

Upsert rules:

- Upsert poems by `poem.id`.
- Upsert guides by `guide.id`.
- Upsert chunks by `poem.id + chunk.id`.
- Upsert sessions by `guide.id + session.id`.
- Upsert pages by `session.id + page.id`.
- If `guide.version` increases, replace the prior imported guide structure for that `guide.id`.

## Rendering Requirements

The Flutter app should render guide pages according to `page.type`.

### Text Pages

Page types:

- `intro`
- `context`
- `poet_background`
- `poem_background`
- `recap`
- `commentary`
- `completion`

Rendering:

- Show `title` when present.
- Render `bodyMarkdown` with the app’s existing markdown renderer or a small supported markdown subset.
- If `bodyMarkdown` is null, render an empty body gracefully.

### Previous-Day Recap Pages

Page type:

- `recap_previous`

Rendering:

- Show `title` when present.
- Render `bodyMarkdown` when present.
- If `chunkIds` is present, resolve those chunks and display them as recap content.
- Unlike read-through and game pages, `recap_previous.chunkIds` may point to chunks outside the current session chunk scope.

### Poem Chunk Pages

Page type:

- `poem_chunk`

Rendering:

- Resolve effective chunks to `PoemChunk` records.
- Effective chunks are `page.chunkIds` when non-empty; otherwise they are `session.chunkIds`.
- `page.chunkIds`, when present, should be a subset of `session.chunkIds`.
- Display chunk text in resolved poem order.
- If a referenced chunk is missing, log a non-fatal content error and skip that chunk.

### Game Pages

Page types:

- `first_letter_game`
- `last_word_game`
- `first_last_word_game`
- `hidden_word_game`

Rendering:

- Resolve effective chunks. Effective chunks are `page.chunkIds` when non-empty; otherwise they are `session.chunkIds`.
- `page.chunkIds`, when present, should be a subset of `session.chunkIds`.
- Use `type` to select the game mechanic.
- Derived mapping:
  - `first_letter_game` -> `firstLetter`
  - `last_word_game` -> `lastWord`
  - `first_last_word_game` -> `firstAndLast`
  - `hidden_word_game` -> `hiddenWord`
- Game content should come from resolved chunk text, not from markdown.

### Whole Poem Pages

Page type:

- `whole_poem`

Rendering:

- Show the full `poem.text` in a scrollable reading view.
- Ignore `chunkIds` for this page type.

### Reflection Pages

Page type:

- `reflection`

Rendering:

- Show `title` when present.
- Show `prompt` as the main reflective prompt.
- `bodyMarkdown` must be null or absent. Reflection copy belongs in `prompt`.

## Database Migration Guidance

If the current app stores markdown-derived guide content, add a new import path for JSON guides rather than trying to parse markdown into the new structure at runtime.

Recommended local database tables/entities:

- `poems`
- `poem_chunks`
- `guided_plans`
- `guide_sessions`
- `guide_pages`

Minimum persisted fields should include:

- Local primary key
- Stable external ID
- Parent references
- Order index
- Type/status fields
- Display text fields
- Raw metadata JSON where useful
- Imported guide version

Migration strategy:

1. Keep existing markdown guides available for one release if needed.
2. Add JSON guided plan importer behind the current startup seed/import mechanism.
3. Bundle one known JSON guide and verify full runtime rendering.
4. Switch curated poem guide loading to JSON.
5. Remove markdown guide assets after JSON coverage is complete.

## Error Handling

The app should fail softly for content problems:

- Invalid JSON: skip the file and log the asset path.
- Unsupported `schemaVersion`: skip the file and log the version.
- Unknown page type: show a fallback unsupported-page view in debug; skip or show a neutral error in release.
- Missing chunk reference: log and skip the missing chunk.
- Empty sessions/pages: do not show the guide as playable.

The app should not crash because one guide asset is malformed.

## Acceptance Criteria

- The Flutter app can load `assets/curated_poems/<poem_id>/guided_plan.json`.
- Parsed models preserve all stable external IDs from JSON.
- Sessions and pages render in `orderIndex` order.
- Text pages render from `bodyMarkdown`.
- Poem chunk and game pages resolve content from `page.chunkIds` when present, otherwise from `session.chunkIds`.
- Whole poem pages render `poem.text`.
- Reflection pages render `prompt`.
- Only `approved` or `exported` plans are user-facing in release builds.
- Updating a bundled guide with a higher `guide.version` replaces the older imported version.
- Markdown guide files are no longer required for curated guided plan playback.

## Reference Files

- Schema: `schemas/guided-plan.schema.json`
- Example: `example-guided-plan.json`
- Export convention: `assets/curated_poems/<poem_id>/guided_plan.json`
