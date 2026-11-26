#!/usr/bin/env bash
# Run on Hetzner as deploy, after transferring a build-production.sh release.
set -euo pipefail
umask 077

release_dir="$(realpath "${1:?Usage: deploy-production.sh RELEASE_DIR [STUDIO_DIR]}")"
studio_dir="$(realpath "${2:-/opt/bamba-studio}")"
backup_root="${STUDIO_BACKUP_DIR:-$HOME/studio-backups}"
cd "$studio_dir"
test -f .env
test -f compose.prod.yml
command -v flock > /dev/null
exec 9> .deploy.lock
flock -n 9 || { echo 'Another deployment holds the server lock.' >&2; exit 1; }

tag="$(cat "$release_dir/IMAGE_TAG")"
[[ "$tag" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$ ]] || { echo 'Invalid release tag.' >&2; exit 1; }
[[ "$(cat "$release_dir/SOURCE_COMMIT")" =~ ^[a-f0-9]{40}$ ]]
(
  cd "$release_dir"
  sha256sum --strict -c SHA256SUMS
)
docker_command=(sudo -n docker)
current=("${docker_command[@]}" compose --project-directory "$studio_dir" --env-file "$studio_dir/.env" -f "$studio_dir/compose.prod.yml")
next_env="$(mktemp "$studio_dir/.deploy-env.XXXXXXXX")"
candidate=("${docker_command[@]}" compose --project-directory "$studio_dir" --env-file "$next_env" -f "$release_dir/compose.prod.yml")
stopped=false
activated=false

cleanup() {
  result=$?
  trap - EXIT
  rm -f "$next_env"
  if [[ "$result" != 0 ]]; then
    if [[ "$stopped" == true && "$activated" == false ]]; then
      echo 'Deployment stopped before activation; restarting the existing release.' >&2
      "${current[@]}" start frontend backend || true
    elif [[ "$activated" == true ]]; then
      echo "Release failed after activation. Backups: $backup_dir" >&2
      echo 'Inspect migrations before rollback; the database has not been automatically restored.' >&2
      "${current[@]}" ps || true
      "${current[@]}" logs --tail=80 backend frontend || true
    fi
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

# Treat dotenv as data, never executable shell input. Preserve all other settings.
python3 - "$studio_dir/.env" "$next_env" "$tag" <<'PY'
import re
import sys
from pathlib import Path

source, destination, tag = sys.argv[1:]
lines = Path(source).read_text().splitlines(keepends=True)
lines = [line for line in lines if not re.match(r"^\s*(?:export\s+)?STUDIO_IMAGE_TAG\s*=", line)]
text = "".join(lines)
Path(destination).write_text(text.rstrip("\n") + f"\nSTUDIO_IMAGE_TAG={tag}\n")
PY
"${current[@]}" config --quiet
"${candidate[@]}" config --quiet

# Read only the exports path from resolved config. Never print production secrets.
exports_dir="$("${current[@]}" config --format json | python3 -c '
import json, sys
from pathlib import Path
config = json.load(sys.stdin)
mount = next(v for v in config["services"]["backend"]["volumes"] if v["target"] == "/srv/exports")
exports = Path(mount["source"]).resolve(strict=True)
studio = Path(sys.argv[1]).resolve()
if exports == studio or studio in exports.parents:
    sys.exit("Migrate authoritative exports outside the checkout before automatic deployment.")
print(exports)
' "$studio_dir")"
test -d "$exports_dir"
test -d "$studio_dir/guides"
"${docker_command[@]}" load -i "$release_dir/bamba-studio-images.tar.gz"
for image in "bamba-studio-backend:$tag" "bamba-studio-frontend:$tag"; do
  [[ "$("${docker_command[@]}" image inspect --format '{{.Os}}/{{.Architecture}}' "$image")" == linux/amd64 ]]
done

mkdir -p -m 700 "$backup_root"
backup_dir="$(mktemp -d "$backup_root/$(date -u +%Y%m%d-%H%M%S)-$tag.XXXXXXXX")"
cp -p .env "$backup_dir/production.env"
cp compose.prod.yml "$backup_dir/compose.prod.yml"
cp "$release_dir/SOURCE_COMMIT" "$backup_dir/NEXT_SOURCE_COMMIT"
echo "Taking consistent database and content backups in $backup_dir"
# Mark stopped before the command: recover even if only one service stops.
stopped=true
"${current[@]}" stop --timeout 60 frontend backend
"${current[@]}" exec -T postgres pg_dump -U bamba -d bamba_guide_studio -Fc > "$backup_dir/database.dump.partial"
test -s "$backup_dir/database.dump.partial"
mv "$backup_dir/database.dump.partial" "$backup_dir/database.dump"
tar -czf "$backup_dir/content.tar.gz.partial" \
  -C "$(dirname "$exports_dir")" "$(basename "$exports_dir")" -C "$studio_dir" guides
mv "$backup_dir/content.tar.gz.partial" "$backup_dir/content.tar.gz"
(
  cd "$backup_dir"
  sha256sum database.dump content.tar.gz production.env compose.prod.yml > SHA256SUMS
)

# No checkout reset, content transfer, volume deletion, or second publisher.
# From this point a migration may have run; automatic database rollback is unsafe.
activated=true
install -m 644 "$release_dir/compose.prod.yml" "$studio_dir/compose.prod.yml"
mv "$next_env" "$studio_dir/.env"
"${current[@]}" up -d --wait --wait-timeout 180
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:8080/api/health
curl --fail --silent --show-error --max-time 15 -o /dev/null http://127.0.0.1:8080/journeys
"${current[@]}" exec -T backend alembic current
"${current[@]}" ps
printf '%s\n' "$tag" > "$studio_dir/.deployed-release"
cp "$release_dir/SOURCE_COMMIT" "$studio_dir/.deployed-commit"
echo "Deployment verified: $tag (backup: $backup_dir)"
# Remove the transferred image archive only after all checks pass. Images remain
# loaded for rollback; metadata and the deployment script remain in the release.
rm "$release_dir/bamba-studio-images.tar.gz"
