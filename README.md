# Bamba Guide Studio

Desktop-first editorial tool for importing, editing, reviewing, validating, approving, and exporting curated guided poem plans and Guided Journeys for the Bamba mobile app.

Guide generation is out of scope. Guide Studio imports, edits, reviews, validates, approves, and exports.

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

## Run with Docker Compose

One command starts Postgres, the API, and the web app:

```bash
docker compose up -d --build
```

Open:

```text
http://localhost:8090
```

- The backend runs `alembic upgrade head` on every start, so a new or existing database is always migrated.
- nginx serves the web app and forwards `/api` to the backend, so there is no CORS setup.
- Postgres has no host port. Only the backend can reach it.
- `exports/` and `guides/` are mounted into the backend. It loads the approved guides on start (see [Loading published guides](#loading-published-guides)), and **Publish** writes into them.

### From your phone

The Studio is built for a laptop and a phone. Write and shape a guide on the
laptop; read it through, edit its words, settle review notes, approve and
publish from the phone.

The web app calls `/api` on its own origin, so nothing needs configuring:

1. Find the Mac's address on your network, for example with
   `ipconfig getifaddr en0`.
2. Open `http://<that address>:8090` on the phone, on the same Wi-Fi.

In development, `npm run dev` listens on the network too and proxies `/api` to
`http://127.0.0.1:8000`, so `http://<that address>:5173` works the same way.
Set `STUDIO_API_TARGET` if the API runs somewhere else.

Publish writes `exports/` on the machine that runs the Studio. Committing and
pushing stays laptop work: the phone says so when it finishes.

What the phone deliberately leaves to the laptop: adding, deleting and
reordering pages, changing a page type, linking chunks, reordering a Journey's
poems, and starting a new Journey. Each of those says on screen where to do it
instead. Importing a guide or a review works on the phone, but picking a file
is easier on the laptop.
- Data lives in the `postgres_data` volume. `docker compose down` keeps it; `docker compose down -v` deletes it.

Settings (put them in a `.env` file next to `docker-compose.yml`, or set them in the shell):

| Variable | Default | Use |
| --- | --- | --- |
| `STUDIO_PORT` | `8090` | Host port for the web app. |
| `STUDIO_UID` / `STUDIO_GID` | `1000` / `1000` | User the backend runs as, so files it publishes belong to you. Docker Desktop on macOS ignores this. On Linux, set them to the output of `id -u` and `id -g`. |
| `POSTGRES_PORT` | `5432` | Local development only (`docker-compose.dev.yml`): host port for Postgres, bound to `127.0.0.1`. Change it if 5432 is in use. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `bamba` / `bamba` / `bamba_guide_studio` | Database credentials. Set a real password before you deploy anywhere shared. |

## Local Development

Start only Postgres, published on `127.0.0.1:5432`:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
```

If port 5432 is in use, add `POSTGRES_PORT=55432` before the command, and use that port in `DATABASE_URL`.

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

## Editorial Workflow: guides

A guide moves from a draft file to the app like this. `<slug>` is `<author-name>--<poem-title>`, for example `william-blake--the-tyger`.

```text
guides/json/<slug>.json                          draft you write (for example with Claude)
        │  Import: paste the JSON at /guides/import
        ▼
Studio database                                  edit, review, validate, approve
        │  Publish: Studio writes the file and links guides/json/<slug>.json to it
        ▼
exports/curated_poems/<slug>/guided_plan.json    canonical approved copy; commit and push
        │  Bamba: advance tool/studio_content.lock.json, run its sync tool
        ▼
Bamba app bundle
```

### A new guide

1. Save the draft as `guides/json/<slug>.json`. Give `poem.id` the stable ID the app will use (for example `the_tyger`); it does not have to match the slug.
2. Click **Refresh** on the guide list. Studio imports every new file in `guides/json/` as a draft. (Or open `/guides/import` and paste the JSON.) See [Versions](#versions) for files of a guide Studio already holds.
3. Edit sessions and pages in `/guides/:guideId`. Page changes autosave.
4. Optional: import review JSON from `/guides/:guideId/reviews/import`, then resolve, dismiss, or accept each comment.
5. Validate from the bottom bar, and approve when no blocking issues remain.
6. Click **Publish**. Studio checks the guide again, writes `exports/curated_poems/<slug>/guided_plan.json`, and replaces your draft `guides/json/<slug>.json` with a link to it. The guide's status becomes `exported`.
7. Commit and push both paths.
8. In the Bamba repo, set `revision` in `tool/studio_content.lock.json` to that commit and run `dart tool/sync_studio_content.dart`. To try a guide before you push it, run `dart tool/sync_studio_content.dart --local ../bamba-guide-studio` instead.

**Download** saves the same JSON through the browser and writes nothing to the repo.

### A guide the app already ships

The guide is already in the Studio, because the backend loads it from `exports/` (see below). Edit it there. In the Publish sheet, click **Raise to N** so the changed guide gets a new version number. Then approve and click **Publish**. Studio finds the folder that holds the same guide ID (or poem ID) and replaces its `guided_plan.json`. Then do steps 7 and 8.

### What Publish protects

- It writes nothing unless the guide is approved and passes validation.
- The version in `exports/` never goes down. Publish refuses a version lower than the published one.
- A version is published once. Publish refuses the version that `exports/` holds already, even with the same content. To publish a change, raise the version first. The Publish sheet shows this and turns off **Publish**.
- One version number keeps one content. Publish refuses changed content at a version that is already saved, and tells you which version to raise it to.
- It refuses to write into a folder that holds a different guide.
- It replaces a file in `guides/json/` only when that file is a link or a draft of the same guide. Otherwise it leaves the file alone and shows a warning.
- It writes the file in one step, so a failed write never leaves half a file. The status changes only after the file is saved.
- The first Publish of a new version of a shipped guide can produce a large Git diff, because Studio writes the keys in its own order. The content changes are small: `status` becomes `exported`, `roundType: "readThrough"` becomes `null` (the app shows it the same way), and sessions list their `chunkIds` (the app ignores them).

Do not re-import a shipped guide to start an edit. Import replaces the Studio copy and sets it back to draft. Keep every poem, stanza, line and chunk ID: the app keys saved progress by them.

The app refreshes higher authored guide versions at startup, while preserving a plan that is currently being learned (including an archived learning plan). Bundled poem covers load separately from stored plans. See [the integration spec](docs/flutter-guided-plan-json-integration-spec.md#app-runtime-behaviour).

### Loading published guides

When the backend starts, it reads every `exports/curated_poems/*/guided_plan.json`. **Refresh** on the guide list reads every `guides/json/*.json` (links included) with the same rules:

- **A new guide:** Studio imports it and approves it with the normal validation. A file that fails validation loads as a draft. Studio also keeps the file as a saved version.
- **A new version of a guide Studio holds** (by guide ID): Studio adds it as a read-only saved version. If it is the highest version, it also becomes the latest copy, and Studio keeps the old latest copy as a saved version first.
- **A version Studio holds already, with the same content:** skipped.
- **A version Studio holds already, with different content:** not added. The Refresh notice says so and names the version to use instead.
- **A file with a new guide ID for a poem Studio holds:** not added. The Refresh notice says so.
- **Unsaved changes in the latest copy:** the higher version is saved, but it does not become the latest copy. The Refresh notice asks you to raise the latest copy's version and click **Save version**, so the changes are kept.
- **A file Studio cannot read:** skipped, and the other files still load.

The log shows a summary, for example `Published guides: 9 loaded, 0 already in Studio, 0 failed.` Note: if you delete a guide in the Studio and its file is still in `guides/json/`, Refresh adds it again. Set `LOAD_PUBLISHED_GUIDES=false` to turn this off, or `PUBLISHED_GUIDES_DIR` to read another folder.

### Versions

Each guide has one copy you edit (**Latest**) and any number of read-only saved versions. The number in the `guide.version` field names one content only, so a saved version never changes. The latest copy always has the highest version number.

- **Refresh**, **Publish** and **Save version** add saved versions. Save version keeps the latest copy under its current number.
- Open **Version history** from the guide's actions menu to read any version.
- To edit an older version, open it and choose **Use as latest**. It comes back under the next free number, so you can publish it again. Studio first keeps the latest copy as a version of its own. If the latest copy has changes that are not in a saved version, Studio asks you to raise its version and save it first, so nothing is lost.
- To publish a newer version from a file: put the file in `guides/json/` with a higher `guide.version`, click **Refresh**, and click **Publish**. Refresh makes it the latest copy.
- When the latest copy is not in `exports/` yet, the guide list shows **New version** beside the status, and the editor shows **Not published**.
- Only the newest published version is in `exports/`. Older versions live in Studio's database and in Git history.
- All versions share one poem record. Only the newest version can change the poem's text and chunks.

See [exports/README.md](exports/README.md) for the naming rules and the app checkout. `example-guided-plan.json` is a test fixture, not a source for a shipped guide.

### Guide format

- Exports use `schemaVersion: 2`: top-level `stanzas` and `lines`, and chunks that list `lineIds`. `schemas/guided-plan.schema.json` is a byte-identical copy of the app's schema.
- Import accepts v2 (for example a guide copied from the app assets) and the older v1 format (`schemas/guided-plan-v1.schema.json`). v2 imports keep stanza, line and chunk IDs, page `metadata` and `estimatedSeconds`. v1 imports are converted on export.
- To change a poem the app already ships, import its canonical approved JSON from `exports/curated_poems/` (or its `guides/json/` symlink). Preserve the IDs: the app keys saved progress by poem and chunk ID.
- The app reads only a page's own `chunkIds`. If a game or `poem_chunk` page uses its session's chunks in Studio, the export writes those chunk IDs onto the page.
- The app cannot render `full_chunk_typing_game`, `whole_poem`, or `recap_previous` yet. Studio still lets you author them, but they are blocking validation issues, so a guide that uses them cannot be approved or exported.

See [the integration spec](docs/flutter-guided-plan-json-integration-spec.md) for the full contract.

## Editorial Workflow: Guided Journeys

1. Open **Journeys** in the top bar and choose **New Journey**.

   To start from a file instead, save it as `guides/journeys/<journey_id>/journey.json` and click **Refresh** on the Journeys page. Studio reads `exports/journeys/` and then `guides/journeys/`:
   - It adds each Journey it does not hold yet. A file marked `approved` or `exported` keeps that status if it passes validation; any other file loads as a draft.
   - It adds a new version of a Journey it holds as a read-only saved version. The highest version becomes the latest copy, unless the latest copy has unsaved changes.
   - It skips a version it holds with the same content, and lists a version it holds with different content as a problem.

   Every poem in the file must already be in Studio (click **Refresh** on the guide list first). The page lists any file it cannot import, with the reason.
2. Enter a stable Journey ID (letters, numbers, `-` and `_`; it cannot change after the first save), title, subtitle, and curator.
3. Under **Cover image**, enter the image file name (for example `cover.jpg`; `.png`, `.jpg`, `.jpeg` or `.webp`, no folders) and a description of the image for screen readers. Studio stores only the name and the description. Put the image itself at `guides/journeys/<journey_id>/<file name>`. A Journey without a cover cannot be approved or published.
4. Write the Journey Introduction and the optional closing text. Leave a blank line between paragraphs.
5. Add poems. Only poems with an approved or exported guide can be added; the API refuses any other poem. Drag poems, or use **Up** and **Down**, to set the order. Write a Journey Note for each poem.
6. Save. The Validation panel lists what still blocks approval, for example a missing note or a cover without a description.
7. Mark in review, then approve.
8. Click **Publish**. Studio checks the Journey again and refuses to publish when:
   - a poem's guide is not published to `exports/curated_poems/` yet (the app hides a Journey with a poem it does not bundle),
   - the cover image is not in `guides/journeys/<journey_id>/`,
   - the published file already holds this version, or a higher one (raise the version first; a version is published once).

   Then it writes the canonical files and links the draft to them:

   ```text
   exports/journeys/<journey_id>/journey.json   canonical file, status "exported"
   exports/journeys/<journey_id>/cover.jpg      copied from guides/journeys/<journey_id>/
   guides/journeys/<journey_id>/journey.json    symlink to the canonical file
   guides/journeys/<journey_id>/cover.jpg       symlink to the published copy
   ```

   Other files in `guides/journeys/<journey_id>/`, such as notes, stay as they are.
9. Commit and push `exports/journeys` (and `guides/journeys`), then move the Studio pin in the Bamba repo, the same way as for guides. The app's sync tool links `exports/journeys` as `assets/journeys`.

**Download** still saves `<journey_id>_journey.json` without publishing it.

When the backend starts, it loads `exports/journeys/*/journey.json` after the guides, with the same rules as **Refresh**.

To change an exported Journey, raise its version first. Saving returns it to draft. The app replaces a bundled Journey only when the version is higher, and it keeps each user's progress.

Journeys keep versions the same way as guides (see [Versions](#versions)). Refresh and Publish keep each version they see, and the latest copy always has the highest version. Open **Version history** from the Journey's actions menu to read one, and choose **Use as latest** to edit it. `exports/journeys/` holds only the newest published version, and its version never goes down. The Journey list shows **New version** when the latest copy is not published yet.

The Journey file format is `schemas/journey.schema.json`, a copy of the app's schema.

## Checks

Backend:

```bash
cd backend
source .venv/bin/activate
pytest
ruff check .
```

Frontend:

```bash
cd frontend
npm run build
npm run lint
```
