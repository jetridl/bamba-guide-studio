# Approved Bamba content

`curated_poems/<author-name>--<poem-title>/guided_plan.json` is the canonical
Git-tracked copy of each approved guide consumed by the Flutter app. The
`guides/json/<author-name>--<poem-title>.json` entries are symlinks to these same
files, so Studio imports and app builds use identical JSON.

The initial nine guides are copied byte-for-byte from the working Bamba app.
Folder and filename changes do not change any IDs inside the JSON. Older draft
JSON guides have been replaced; Markdown files remain editorial reference only.

To publish an update, import the canonical JSON into Studio, make and approve
the changes, and export it through Studio's validated export action. Replace
the corresponding canonical `guided_plan.json` with that download, retaining
poem, stanza, line and chunk IDs. Commit the export in this repository. New
guides also need a matching `guides/json/` symlink. Use the author's complete
name (including middle names), lowercase ASCII words separated by hyphens,
then `--`, then the title slug. Do not publish drafts here.

Bamba pins a Studio commit in `tool/studio_content.lock.json`. Advance that pin
only after committing and pushing the approved exports. Bamba's content setup
command checks out that exact revision and links it into the app's asset tree.
The app bundles the JSON and never contacts Studio at runtime.
