#!/usr/bin/env bash
# Build on the development machine, never on the 1 GB Hetzner host.
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
tag="${1:-$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)}"
if [[ ! "$tag" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$ ]]; then
  echo "Invalid Docker image tag: $tag" >&2
  exit 1
fi
release_dir="$repo_dir/output/deploy/$tag"
if [[ -e "$release_dir" ]]; then
  echo "Release directory already exists: $release_dir. Choose a new tag." >&2
  exit 1
fi
docker info >/dev/null
docker buildx version >/dev/null
mkdir -p "$release_dir"

# The backend needs the repository root as context to include schemas/.
docker buildx build --platform linux/amd64 --load \
  -f backend/Dockerfile -t "bamba-studio-backend:$tag" .
docker buildx build --platform linux/amd64 --load \
  -f frontend/Dockerfile -t "bamba-studio-frontend:$tag" ./frontend

for image in "bamba-studio-backend:$tag" "bamba-studio-frontend:$tag"; do
  platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")"
  [[ "$platform" == linux/amd64 ]] || { echo "Wrong platform for $image: $platform" >&2; exit 1; }
done

archive="$release_dir/bamba-studio-images.tar.gz"
trap 'rm -f "$archive.partial"' EXIT
docker save "bamba-studio-backend:$tag" "bamba-studio-frontend:$tag" | gzip > "$archive.partial"
mv "$archive.partial" "$archive"
cp compose.prod.yml .env.production.example "$release_dir/"
cp docs/hetzner-deployment.md "$release_dir/"
git rev-parse HEAD > "$release_dir/SOURCE_COMMIT"
git status --short > "$release_dir/SOURCE_STATUS"
printf '%s\n' "$tag" > "$release_dir/IMAGE_TAG"
(
  cd "$release_dir"
  shasum -a 256 bamba-studio-images.tar.gz > SHA256SUMS
)
printf '\nRelease prepared in %s\nImages use STUDIO_IMAGE_TAG=%s\n' "$release_dir" "$tag"
echo 'Follow hetzner-deployment.md to transfer, load, and configure the server.'
