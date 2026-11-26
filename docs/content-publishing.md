# Automatic content publishing

Production Studio on Hetzner is the sole writer to the private repository
`git@github.com:jetridl/bamba-content.git`, branch `main`. Publish retains all
existing approval and increasing-version checks, saves the JSON and cover in
the persistent exports directory, then attempts a push. A failed push returns
`sync.state: pending` while leaving the export and database version intact.
The UI shows the current sync status. No second Publish or version increase is
needed to retry: a worker reconciles the entire snapshot every 60 seconds and
immediately after startup. A newer export supersedes an older pending snapshot.

The two `exports/` trees in the content repo exactly mirror approved folders on
Hetzner, including artwork and briefs. Other root files such as README are
preserved. Do not edit content directly in GitHub or run another publishing
Studio: its local exports would win on the next pass. Pushes never force-update
the remote. A remote race is retried against the new head. The app validates
again using its actual parsers before bundling any snapshot.

## First migration (on Hetzner)

Back up the current database, `exports/` and `guides/` as described in
[the deployment runbook](hetzner-deployment.md). Use the existing Hetzner exports,
not a copy from a laptop. Keep one backend/Uvicorn worker so file publishing and
snapshotting share the process lock. Leave the frontend and backend stopped
while preparing the copy; PostgreSQL can keep running.

From the existing `/opt/bamba-studio` checkout, as `deploy`:

```bash
sudo docker compose --env-file .env -f compose.prod.yml stop frontend backend
# Back up the current, pre-migration paths before copying anything.
mkdir -p /home/deploy/studio-backups
chmod 700 /home/deploy/studio-backups
backup_dir="/home/deploy/studio-backups/content-migration-$(date -u +%Y%m%d-%H%M%S)"
mkdir -m 700 "$backup_dir"
sudo docker compose --env-file .env -f compose.prod.yml exec -T postgres \
  pg_dump -U bamba -d bamba_guide_studio -Fc > "$backup_dir/database.dump"
tar -czf "$backup_dir/content.tar.gz" exports guides
# Keep runtime exports outside the application Git checkout, so future code
# updates cannot replace published content with the old bootstrap exports.
sudo install -d -o "$(id -u)" -g "$(id -g)" /opt/bamba-studio-data
# Must fail if a previous destination exists: inspect it instead of overwriting.
test ! -e /opt/bamba-studio-data/exports
cp -a exports /opt/bamba-studio-data/exports
mkdir -p .content-publisher .content-ssh
chmod 700 .content-publisher .content-ssh
ssh-keygen -t ed25519 -N '' -C bamba-studio-content -f .content-ssh/id_ed25519
cp scripts/github_known_hosts .content-ssh/known_hosts
chmod 600 .content-ssh/id_ed25519
cat .content-ssh/id_ed25519.pub
```

Run these steps individually; if the destination or key exists, preserve it and
inspect it before proceeding. Relative `guides/` symlinks still point through
the `/srv/exports` mount inside the backend. Both mounts retain their container
paths. The UID/GID in `.env` must own the copied exports and publisher/key folders.
Do not run `git clean` against runtime data.

Add **the public key** to bamba-content → Settings → Deploy keys → Add deploy
key, with **Allow write access** enabled. The private key stays on Hetzner.
See [GitHub's deploy key instructions](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).
The supplied known_hosts entry is from
[GitHub's published SSH host keys](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints).

Build/load the new production images using `scripts/build-production.sh` and the
normal deployment runbook. Preserve the existing database password in `.env` and
add:

```dotenv
CONTENT_SYNC_ENABLED=true
STUDIO_EXPORTS_DIR=/opt/bamba-studio-data/exports
```

Update `STUDIO_IMAGE_TAG` and `compose.prod.yml`, then start:

```bash
sudo docker compose --env-file .env -f compose.prod.yml config --quiet
sudo docker compose --env-file .env -f compose.prod.yml up -d --wait --wait-timeout 180
sudo docker compose --env-file .env -f compose.prod.yml logs --tail=100 backend
curl --fail http://127.0.0.1:8080/api/content-sync
```

The startup worker seeds an empty `main` automatically from those exports. If
the local content README has been pushed first, it is preserved. Wait for
`state: synced`, verify the commit/files/covers in GitHub, and keep the old
export backup until an app build is verified. The historical exports tracked in
Studio remain bootstrap/test fixtures; production now uses the isolated runtime
directory and publishes new versions only to bamba-content. No source checkout
reset or deletion is part of this migration.

## App setup

The developer machine needs Git read access to bamba-content; the app defaults
to HTTPS and uses existing Git credentials. CI needs a
**separate read-only deploy key** stored as the bamba app repository's Actions
secret `BAMBA_CONTENT_READ_KEY`. Do not reuse the server's write key. The app
workflow configures this key and the GitHub host key, rewrites GitHub HTTPS URLs
to SSH for that runner, fetches main, registers
assets, and uploads the resolved content revision as an artifact. PR workflows
without access to that private-repo secret fail instead of using stale content.

From the app checkout:

```bash
./tool/flutter run
./tool/flutter build ipa
```

All usual Flutter arguments pass through. This command uses FVM locally. The
app's Xcode build phase now also fetches and validates content before bundling,
covering direct Xcode builds/archives and raw Flutter iOS builds. Its VS Code
launch configurations prepare content automatically too. Use the wrapper for
terminal work, especially non-iOS builds and tests. Hot reload/restart does not
fetch content; start a new build/run after publishing. Fetch failure stops the
build, even if content is cached. Studio publishing does not itself trigger an
app build or release. Compare Studio's synced revision with the bundled
`assets/content_revision.json` (or CI's content-revision artifact) to verify a
release uses that snapshot.

## Recovery and configuration

`CONTENT_SYNC_ENABLED` defaults to false in development. Never enable it on
the laptop. The production example enables it explicitly. The backend mounts
the deploy key read-only and uses strict host verification and batch SSH.
Git commands time out after 30 seconds. The disposable `.content-publisher/`
directory also holds passwd/group lookup files when the host's runtime UID has
no named account in the image. `libnss-wrapper` supplies this lookup to Git/SSH
without requiring root or changing container account files (see
[nss_wrapper](https://cwrap.org/nss_wrapper.html)). The disposable publisher
checkout is separate from editorial exports; losing it does not lose pending
work. Exports themselves are the durable queue. Fix key/network access and the
next pass will retry automatically. Poll `/api/content-sync` or reopen either
Studio list/editor to see the latest status. API health describes the database,
so a publishing outage does not make the editor unavailable.

Optional backend environment settings: `CONTENT_REPOSITORY`, `CONTENT_BRANCH`,
`CONTENT_SYNC_DIR`, `CONTENT_SYNC_INTERVAL_SECONDS`,
`CONTENT_GIT_TIMEOUT_SECONDS`, `CONTENT_GIT_NAME`, `CONTENT_GIT_EMAIL`.
If a cache is damaged, stop the backend, preserve the authoritative exports,
remove only the disposable `.content-publisher/checkout`, then restart. Never
remove `/opt/bamba-studio-data/exports` as part of Git recovery. Restore the
database and exports together from backups after a storage failure; never
start an enabled publisher from an older export backup without reconciling it
against the current content repo, since exports are authoritative.
