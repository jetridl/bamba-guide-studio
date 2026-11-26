# Automatic Hetzner deployment

The Studio repository's default branch is **master** (the separate content
repository still uses **main**). `.github/workflows/deploy.yml` runs backend
tests, Ruff, PostgreSQL 17 migrations, deployment failure tests, frontend lint
and a production frontend build. Pull requests run checks without server access.

After checks pass, pushes to master build Linux AMD64 Docker images on a GitHub
runner, transfer a checksummed release over SSH, and run
`scripts/deploy-production.sh` on Hetzner. A manual **Run workflow** on master
uses the same path. Each release tag includes the source commit, run ID and
attempt, so reruns do not overwrite a previous release. Deployments are
serialized with GitHub concurrency and a server `flock`; a superseded source
commit is skipped before transfer. Deployments are briefly unavailable while
database and file backups are taken and containers are replaced.

## GitHub configuration

The `production` environment is restricted to master. Its environment secrets:

| Secret | Purpose |
| --- | --- |
| `HETZNER_HOST` | Hetzner address, currently `77.42.44.66` |
| `HETZNER_USER` | Existing `deploy` user |
| `HETZNER_SSH_KEY` | Dedicated, unencrypted deployment private key |
| `HETZNER_KNOWN_HOSTS` | Verified SSH host key; strict verification is always enabled |

The matching public key belongs in `deploy`'s `~/.ssh/authorized_keys` with
the `restrict` option (no forwarding or interactive terminal). It is separate
from personal SSH keys and the content publisher's write key. The production
`.env`, database password and publisher private key remain on Hetzner.

Repository variable **`STUDIO_DEPLOY_ENABLED=true`** enables deployments. Set it
to `false` to pause deployments while keeping checks active. It starts disabled
until server access, the dedicated key and production prerequisites are ready.
No approval click is required for normal master deployments. Actions are pinned
to commit SHAs; update those pins deliberately when upgrading the actions.

## Server prerequisites

The existing installation described in [the production runbook](hetzner-deployment.md)
must be running at `/opt/bamba-studio`. The deploy user needs noninteractive
`sudo docker`, plus Bash, Python 3, `flock`, `realpath`, `sha256sum`, tar and curl.
GitHub-hosted runners must be able to reach SSH; the web Cloudflare Tunnel is
independent. The script uses only standalone `compose.prod.yml` and never builds
on the 1 GB host.

For a server whose deploy user still requires a sudo password, the owner can
run `sudo bash scripts/prepare-deployment-host.sh` interactively once. It validates
and installs `/etc/sudoers.d/bamba-studio-deploy` allowing passwordless
`/usr/bin/docker`, and creates the exports parent directory. Docker management
grants administrator-level control of the host; this access belongs only to the
trusted deployment user. The script does not change existing content or start
services.

Authoritative exports must already live **outside** the checkout, as described
in [content migration](content-publishing.md). The script refuses checkout-bound
exports. Production `.env`, numeric UID/GID, guides, publisher credentials and
PostgreSQL volume must already be correct. Deployment does not overwrite content
from repository fixtures or change publishing settings.

## What each deployment does

1. Acquire the server lock, verify the release checksums, and validate the old
   and candidate Compose configurations without printing secrets.
2. Load and verify AMD64 images while the existing Studio is still available.
3. Stop frontend/backend, leaving PostgreSQL running. Save a unique private
   directory under `/home/deploy/studio-backups/` with `production.env`, the
   previous Compose file, `database.dump`, symlink-preserving `content.tar.gz`,
   next source commit and checksums.
4. Install the release Compose file, change only `STUDIO_IMAGE_TAG` in `.env`,
   and start Compose with `--wait`. Backend startup applies Alembic migrations.
5. Check `/api/health`, `/journeys`, the Alembic revision and service status.
   Record `.deployed-release` and `.deployed-commit`, then remove the transferred
   image archive. Loaded images, backup files and release metadata remain.

A failed backup restarts the old services without activating the release. A
failure after activation reports service logs and the recovery directory, and
fails the GitHub run. It does not blindly roll back a potentially migrated
database. A rerun creates a new release and a new backup.

## Verification and recovery

Check the Actions run's **Deploy to Hetzner** log for the deployed tag and backup
directory, then open `https://studio.bambapoetry.app` through Cloudflare Access.
Confirm the guides, Journeys and recent editorial changes. Check
`/api/content-sync` for publishing status; database health alone does not prove
that content has reached GitHub.

For image-only rollback with a compatible schema, set `STUDIO_IMAGE_TAG` to the
previous value from the backup's `production.env`, restore the matching Compose
file, and use the production `up -d --wait` command. For an incompatible
migration, stop the app and restore the matching database and content together
using the [runbook](hetzner-deployment.md). Keep publisher reconciliation in mind
before restarting from old exports. Do not automatically restore old content
or force-push the content repository.

Backups remain on the same disk and need off-server copies. No automated backup
or image deletion is enabled: review disk space and remove selected old releases
only after preserving a verified rollback point. Never prune volumes or use
`docker compose down -v`. Environment backups contain secrets and must stay
private. Test restores separately before relying on them.

GitHub reference: [deployment environments and concurrency](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments).
