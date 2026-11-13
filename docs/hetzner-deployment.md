# Hetzner production deployment

This implements deployment steps 10–12 for the AMD64 `bamba-studio` VPS.
Build on the Mac; the 1 GB server only loads and runs images. Cloudflare Access
and Tunnel are configured afterwards. The app has no accounts: protect the
entire `studio.bambapoetry.app` hostname, including `/api/*`, with Access before
making it available publicly.

## Production layout

- `compose.prod.yml` is standalone. Always use `-f compose.prod.yml`; combining
  it with the local Compose file can expose additional ports.
- PostgreSQL stays on **17**, using the existing **psycopg** driver and database
  name `bamba_guide_studio`. Neither PostgreSQL nor FastAPI publishes a host port.
- Only nginx publishes **127.0.0.1:8080**. Later, host-installed `cloudflared`
  should route `studio.bambapoetry.app` to **http://127.0.0.1:8080**. No TLS
  certificate is needed inside these containers. Do not open 8080 publicly.
- The frontend already uses a multi-stage production Dockerfile. nginx serves
  compiled Vite files, forwards `/api/` unchanged, preserves forwarded HTTPS,
  and resolves the backend again after container replacement. Client routes
  such as `/journeys` fall back to React. API calls use relative `/api` URLs.
- The backend starts with `alembic upgrade head`, then runs one Uvicorn worker
  on `0.0.0.0:8000`. Database failure makes `/api/health` return 503. Compose
  waits for the database and API before starting nginx.
- `bamba-studio_postgres_data` is a named volume on the server disk. It survives
  recreation and **is not a backup**. The separate production project name
  avoids sharing the local development database. If migrating an existing
  installation, explicitly restore its database; a fresh volume starts empty.
- `/opt/bamba-studio/exports` and `/opt/bamba-studio/guides` are writable bind
  mounts. They must exist and belong to the numeric UID/GID in `.env`.
  They retain canonical exports, covers, drafts, and relative symlinks across
  image updates. They are deliberately excluded from application images.
- Container logs rotate at 3 × 10 MB per service. Images are prebuilt for
  `linux/amd64`; application image pulls and builds are disabled in production.
- React Router and Zod use patched releases. The shadcn CLI and Tailwind build
  tooling are development dependencies; the final frontend image contains only
  nginx and compiled static assets, with no Node.js or `node_modules`.
  Full `npm audit` still reports build-tool dependencies; check those separately
  when updating tooling. `npm audit --omit=dev` checks the browser dependencies.

## 1. Build and package on the Mac (step 12)

From the repository root with Docker Desktop running:

```bash
bash scripts/build-production.sh
```

Or choose a release tag explicitly:

```bash
bash scripts/build-production.sh 20261113-release1
```

The script builds and loads both AMD64 images, checks their architecture, and
creates `output/deploy/<tag>/` containing:

- `bamba-studio-images.tar.gz` and `SHA256SUMS`;
- `compose.prod.yml`, `.env.production.example`, and this runbook;
- `IMAGE_TAG`, `SOURCE_COMMIT`, and `SOURCE_STATUS` to identify the source used.

It uses `backend/Dockerfile` with the **repository root** build context (required
for `schemas/`), and the existing `frontend/Dockerfile` with `frontend/` as its
context. There is no separate `Dockerfile.prod`. Both images share the tag;
keep that tag in `STUDIO_IMAGE_TAG` instead of relying on `latest`.

## 2. Transfer and load (step 12)

Substitute your generated tag below. These commands use the host and SSH key
from the supplied deployment spec:

```bash
scp -i ~/.ssh/bamba_hetzner -r output/deploy/<tag> deploy@77.42.44.66:/home/deploy/
ssh -i ~/.ssh/bamba_hetzner deploy@77.42.44.66
cd /home/deploy/<tag>
sha256sum -c SHA256SUMS
sudo docker load -i bamba-studio-images.tar.gz
sudo docker image inspect --format '{{.RepoTags}} {{.Os}}/{{.Architecture}}' \
  bamba-studio-backend:<tag> bamba-studio-frontend:<tag>
```

Both images must say `linux/amd64`. No application is started by these steps.

## 3. Prepare the server checkout and secrets (step 13 prerequisite)

Use an actual Studio Git checkout at `/opt/bamba-studio`, owned by `deploy`,
so approved exports can later be reviewed, committed, and pushed. Deploy the
revision containing these production files. If the production configuration
has not been committed yet, copy the supplied `compose.prod.yml` into that
checkout. Do not replace existing content directories with empty directories.

On a fresh server, transfer the local content to the checkout if it is newer
than Git, preserving relative symlinks. Run on the Mac from the repo root:

```bash
rsync -av -e 'ssh -i /Users/jethroridl/.ssh/bamba_hetzner' \
  exports guides deploy@77.42.44.66:/opt/bamba-studio/
```

Only do this initial content transfer into a fresh checkout. On future releases,
first commit and push server-published content; preserve both mounted directories.
Never use `rsync --delete` or blindly reset the server checkout. Database drafts,
reviews, and saved versions are separate from these files: moving an existing
local Studio also requires a PostgreSQL dump/restore before starting the API.

On the server:

```bash
cd /opt/bamba-studio
cp /home/deploy/<tag>/compose.prod.yml ./compose.prod.yml
# First deployment only; never overwrite an existing production .env.
test -e .env || (umask 077; cp /home/deploy/<tag>/.env.production.example .env)
chmod 600 .env
id -u
id -g
openssl rand -hex 32
nano .env
```

Replace `DB_PASSWORD` with the generated secret, set `STUDIO_UID` and
`STUDIO_GID` to `deploy`'s numeric IDs, and set `STUDIO_IMAGE_TAG` to `<tag>`.
Do not start with the example password. The password is passed separately to
SQLAlchemy's `URL.create`, so URL-reserved characters do not break connections.
Single-quote dotenv values containing `$`, `#`, or spaces. Do not commit `.env`.
Changing `.env` later does **not** change the password of an existing PostgreSQL
volume; rotate the database role password as well.

Ensure `exports/` and `guides/` and their contents are writable by the configured
UID/GID. The backend does not run as root. Missing mounts fail instead of
silently creating empty root-owned directories.

## 4. Start only after secrets and content are ready

```bash
cd /opt/bamba-studio
sudo docker compose --env-file .env -f compose.prod.yml config --quiet
sudo docker compose --env-file .env -f compose.prod.yml up -d --wait --wait-timeout 180
sudo docker compose --env-file .env -f compose.prod.yml ps
curl --fail http://127.0.0.1:8080/api/health
curl --fail -o /dev/null http://127.0.0.1:8080/journeys
sudo docker compose --env-file .env -f compose.prod.yml exec backend alembic current
```

Expected health response: `{"status":"ok"}`. Confirm `ps` shows only
`127.0.0.1:8080->80/tcp` as a published port; `8000/tcp` and `5432/tcp` without
a host arrow are private container ports. Review startup logs for skipped
content imports before considering deployment complete:

```bash
sudo docker compose --env-file .env -f compose.prod.yml logs --tail=100 backend
```

Before Tunnel is connected, inspect the UI through SSH from the Mac (choose
another local port if 18080 is occupied):

```bash
ssh -i ~/.ssh/bamba_hetzner -N -L 18080:127.0.0.1:8080 deploy@77.42.44.66
```

Open `http://localhost:18080`. Verify guides, Journeys, covers and version history.
Cloudflare Access and Tunnel can then be configured separately. Configure Access
for the whole hostname and ensure anonymous requests to both the UI and API
are challenged. nginx trusts the forwarded scheme and Uvicorn trusts nginx's
forwarded headers only because the origin remains private.

## Updates, backups, and rollback

Before an update, stop the frontend and backend so database and file backups
describe the same editorial state. Keep PostgreSQL running:

```bash
cd /opt/bamba-studio
sudo docker compose --env-file .env -f compose.prod.yml stop frontend backend
mkdir -p /home/deploy/studio-backups
chmod 700 /home/deploy/studio-backups
# Choose a new timestamp/name for every backup; do not overwrite an older one.
sudo docker compose --env-file .env -f compose.prod.yml exec -T postgres \
  pg_dump -U bamba -d bamba_guide_studio -Fc > /home/deploy/studio-backups/before-update.dump
tar -czf /home/deploy/studio-backups/before-update-content.tar.gz exports guides
```

Copy backups off the VPS. Preserve symlinks when archiving/restoring content.
Test database restores into a separate empty database with `pg_restore` before
relying on these backups. Include the protected `.env` in your secure recovery
process; keep it out of source control and release archives.

Load the next image archive, update the Compose file and `STUDIO_IMAGE_TAG` in
`.env`, then run the same `up -d --wait` command. Startup applies any new Alembic
migrations. Keep the previous image tag and backups until the release is verified.
To roll back images, restore the previous tag and run `up` again. If the migration
is incompatible with the old application, restore the matching database and
content backups first; changing image tags does not undo migrations.

Delete transferred archives after verification. Remove only specific old image
tags once a rollback option remains. Never run `docker compose down -v` or prune
volumes on this server. Canonical guide and Journey changes must still be committed
and pushed in Studio before advancing the Flutter app's pinned content commit;
do not copy content into the Flutter tree.

## Reference documentation

- [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/)
- [Docker AMD64 and multi-platform builds](https://docs.docker.com/build/building/multi-platform/)
- [SQLAlchemy URL.create and raw passwords](https://docs.sqlalchemy.org/en/20/core/engines.html#creating-urls-programmatically)
- [nginx upstream DNS resolution](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#resolve)
