# Bamba Flutter Guided Plan JSON Integration Spec

## Purpose

Guide Studio exports approved guided poem plans as JSON. The Bamba Flutter app bundles them as assets and plays them. The app does not generate or edit guides at runtime. It only parses them defensively.

The contract is:

```text
schemas/guided-plan.schema.json        (schemaVersion 2)
```

The Studio copy and the app copy (`bamba/schemas/guided-plan.schema.json`) must stay byte-identical. The app parser (`lib/features/study/domain/guided_plan.dart`) is the source of truth for what the app can render. Where the parser is stricter than the schema, Studio validation enforces the parser's rule.

Guided Journeys use a separate contract, `schemas/journey.schema.json`. See [Journey files](#journey-files).

## Asset location

Each approved guide goes at:

```text
assets/curated_poems/<poem_id>/guided_plan.json
```

Studio downloads it as `<poem_id>_guided_plan.json`. Rename it to `guided_plan.json` when you place it.

## File shape

```json
{
  "schemaVersion": 2,
  "guide": {},
  "poem": {},
  "stanzas": [],
  "lines": [],
  "chunks": [],
  "sessions": []
}
```

All seven top-level fields are required. The app rejects any other `schemaVersion`.

### guide

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable guide ID. |
| `poemId` | string | Must equal `poem.id`. |
| `title` | string | |
| `version` | integer ≥ 1 | Raise it when the content changes. Higher authored versions refresh at startup, except while a poem is being learned (see below). |
| `status` | `draft` · `in_review` · `approved` · `exported` | Release builds show only `approved` and `exported`. |
| `description` | string | Optional. |
| `metadata` | object | Optional. |

### poem

`id`, `title`, `author`, `text` (required), `year` (integer or null), `metadata`. `poem.id` is the slug the app uses everywhere, for example `the_tyger`.

Optional `coverImage` contains `path` (an image filename only, such as `cover.png`) and `alt` (a description). Keep the image beside `guided_plan.json` in its canonical `exports/curated_poems/<author-name>--<poem-title>/` folder. PNG, JPEG and WebP are supported. Studio preserves the reference through import/export; the Flutter build checks that the image exists, and loads bundled covers separately from stored study plans.

### stanzas

Ordered stanzas: `id`, `orderIndex`, optional `title` and `metadata`.

### lines

One record per poem line: `id`, `stanzaId`, `orderIndex` (across the whole poem), `stanzaOrderIndex` (within the stanza), `text`, optional `metadata`. Every `stanzaId` must match a stanza. Leading spaces in `text` are kept, because they carry indentation.

### chunks

Learning units made of lines: `id`, `orderIndex` (across the whole poem), `lineIds` (one or more line IDs), optional `label` and `metadata`. Every line ID must match a line. The app stores progress against `<poem_id>__<chunk_id>`, so chunk IDs must not change between releases.

### sessions

One session per learning day: `id`, `sessionNumber`, `title`, `subtitle`, `focusSummary`, `orderIndex`, `metadata`, `chunkIds`, `pages`.

`session.chunkIds` lists the chunks studied that day. The app parser does **not** read it. It is kept for Studio round trips.

### pages

`id`, `type`, `orderIndex`, `title`, `bodyMarkdown`, `prompt`, `chunkIds`, `roundType`, `estimatedSeconds`, `metadata`.

- `chunkIds` must reference known chunks. The app reads only the page's own `chunkIds`. In Studio, a game or `poem_chunk` page with no chunks uses its session's chunks, so **the export writes those inherited IDs onto the page**.
- One exception: a `poem_chunk` page with `metadata.scope = "whole_poem"` is the whole-poem reading page. It shows `bodyMarkdown` (the poem text) and keeps `chunkIds` empty.
- `roundType` is derived from `type` for game pages and is null otherwise. Never edit it by hand.
- Reflection pages put their text in `prompt`. Studio requires their `bodyMarkdown` to be null. (The app shows `prompt` first, so a body is never seen.)

## Page types

| Type | App rendering | Exportable from Studio |
| --- | --- | --- |
| `intro`, `context`, `poet_background`, `poem_background`, `recap`, `commentary`, `completion` | Text page from `bodyMarkdown` | Yes |
| `poem_chunk` | `bodyMarkdown`, then the text of the page's chunks | Yes |
| `reflection` | `prompt` | Yes |
| `first_word_game` → `firstWord` | Memory game over the page's chunks | Yes |
| `first_letter_game` → `firstLetter` | Memory game | Yes |
| `last_word_game` → `lastWord` | Memory game | Yes |
| `first_last_word_game` → `firstAndLast` | Memory game | Yes |
| `hidden_word_game` → `hiddenWord` | Memory game | Yes |
| `full_chunk_typing_game` → `fullChunkTyping` | **Not supported.** The parser throws on `fullChunkTyping`, so the whole guide fails to load. | **No** |
| `whole_poem` | **Not supported.** Falls back to an empty generic page. | **No** |
| `recap_previous` | **Not supported.** Falls back to a generic page without its chunk lines. | **No** |

The schema lists all of these types, so a file that uses them is structurally valid. Studio marks the last three as `page_type_not_supported_by_app` (blocking). Approval and export stay blocked until the app parser supports them. To read the whole poem today, use a `poem_chunk` page with `metadata.scope = "whole_poem"` and the poem text in `bodyMarkdown`.

## Intentional differences between Studio and the schema

The two schema files are identical. Studio is stricter in these places:

- A non-reflection page with a `prompt` is blocking in Studio. The schema allows it.
- A reflection page without a `prompt` is blocking in Studio.
- A reflection page with a `bodyMarkdown` is blocking in Studio. The schema allows it.
- The three unsupported page types above are blocking in Studio.

## Importing into Studio

> **Import the canonical approved export** from `exports/curated_poems/<author-name>--<poem-title>/guided_plan.json`, or its `guides/json/` symlink. These files replaced the older drafts with the app-compatible versions. The app keys saved progress by poem and chunk ID; preserve those external IDs in every export.

- **v2 files** (for example a guide copied back from the app assets) import without loss. Stanza, line and chunk IDs, labels, page `metadata` and `estimatedSeconds` all come back out on export.
- **v1 files** (`chunks[].sectionId` and `chunks[].text`, no stanzas or lines) still import, using `schemas/guided-plan-v1.schema.json`. On export, each v1 section becomes a stanza and each non-empty text line of a chunk becomes a line with ID `<chunk_id>__line_<n>`. Chunk IDs do not change.

## App runtime behaviour

1. Load each `guided_plan.json` asset.
2. Parse with `GuidedPlanJsonParser`. It checks `schemaVersion == 2`, `guide.poemId == poem.id`, and that every stanza, line and chunk reference resolves.
3. Skip a file that fails to parse, and log the asset path. One bad file must not crash the app.
4. Show only `approved` and `exported` guides in release builds.
5. At startup the app stores missing plans and refreshes stored authored plans when the bundled `guide.version` is higher. A poem in the Igniting stage, including one archived from that stage, keeps its existing plan so learning can resume safely. Other updates replace the poem and plan atomically without resetting lifecycle history. Bundled covers are loaded separately and are available even when a stored plan is retained.

## Journey files

Journeys are exported from Studio as `<journey_id>_journey.json` and placed at:

```text
assets/journeys/<journey_id>/journey.json
```

```json
{
  "schemaVersion": 1,
  "journey": {
    "id": "romantic-poets",
    "version": 1,
    "status": "approved",
    "title": "...",
    "subtitle": "...",
    "curator": "...",
    "introduction": ["paragraph"],
    "closing": ["paragraph"],
    "coverImage": { "path": "cover.jpg", "alt": "A lantern on a snowy path at dusk" }
  },
  "poems": [{ "poemId": "the_tyger", "note": ["paragraph"] }]
}
```

- `closing` is optional. Studio leaves it out when it is empty.
- `coverImage` is optional. Studio leaves it out when it is not set.
  - `path` is a file name only (no folders), ending in `.png`, `.jpg`, `.jpeg` or `.webp`. The file goes in the same folder as `journey.json`, for example `assets/journeys/romantic-poets/cover.jpg`. The app bundles the whole Journey folder, so no `pubspec.yaml` change is needed.
  - `alt` is required when there is a cover. It describes the image for screen readers.
  - The app's asset test fails if a Journey names a cover file that is not in its folder. Studio cannot check this, because it does not hold the image.
  - The app parses the cover into `Journey.coverImage`, but does not store it in its local database or show it yet.
- `poems` order is the Journey order. Each `poemId` appears once and must match a bundled poem folder.
- Raise `journey.version` when the content changes. The app replaces a stored Journey only when the bundled version is higher, and it keeps the user's progress.

## Reference files

- Guided plan schema: `schemas/guided-plan.schema.json`
- Legacy import schema: `schemas/guided-plan-v1.schema.json`
- Journey schema: `schemas/journey.schema.json`
- Example (v1, still importable): `example-guided-plan.json`
- App-format v2 example: `guides/json/william-ernest-henley--invictus.json`
