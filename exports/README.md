# Approved Bamba content

`curated_poems/<author-name>--<poem-title>/guided_plan.json` is the canonical
Git-tracked copy of each approved guide consumed by the Flutter app. The
`guides/json/<author-name>--<poem-title>.json` entries are symlinks to these same
files, so Studio imports and app builds use identical JSON.

Poem covers live beside `guided_plan.json`, normally as `cover.png`, and are
referenced by `poem.coverImage` (`path`, a filename only, and descriptive `alt`).
Keep image briefs beside the artwork, outside the guide JSON. Studio preserves
cover references on import/export. Raise `guide.version` when updating a
published guide; the app loads bundled covers and refreshes higher authored
plan versions at startup, while protecting plans currently being learned.

The initial nine guides are copied byte-for-byte from the working Bamba app.
Folder and filename changes do not change any IDs inside the JSON. Older draft
JSON guides have been replaced; Markdown files remain editorial reference only.

To publish an update, edit and approve the guide in Studio, then click
**Publish**. Studio loads these files into its database at startup, so a
shipped guide is already there; do not re-import it, because import resets the
Studio copy. Publish validates the guide, replaces the canonical
`guided_plan.json` of the folder that holds the same guide ID (or poem ID), and
keeps poem, stanza, line and chunk IDs. For a new guide it creates the folder
and the matching `guides/json/` symlink. Folder names use the author's complete
name (including middle names), lowercase ASCII words separated by hyphens, then
`--`, then the title slug. Commit the result in this repository. Do not put
drafts here.

Bamba pins a Studio commit in `tool/studio_content.lock.json`. Advance that pin
only after committing and pushing the approved exports. Bamba's content setup
command checks out that exact revision and links it into the app's asset tree.
The app bundles the JSON and never contacts Studio at runtime.

## Journeys

`journeys/<journey_id>/journey.json` is the canonical copy of each approved
Journey, with its cover image (if any) in the same folder. The folder name is
the Journey ID. Click **Publish** in the Journey editor to write it: Studio
copies the cover from `guides/journeys/<journey_id>/` and replaces the draft
`journey.json` and cover there with symlinks to these files. Publish refuses a
Journey whose poems are not all published under `curated_poems/`, and refuses
to change a published Journey without a higher version.

Bamba's content setup links this folder as `assets/journeys`, from the same
pinned commit as the poems, and checks that every Journey is approved, names
only bundled poems, and keeps its cover beside `journey.json`.
