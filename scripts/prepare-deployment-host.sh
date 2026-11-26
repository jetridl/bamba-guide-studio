#!/usr/bin/env bash
# One-time server administration, run interactively with sudo by the owner.
# This does not start services, migrate content, or change the database.
set -euo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run this script with sudo.' >&2; exit 1; }
test -x /usr/bin/docker
test -x /usr/sbin/visudo
id deploy > /dev/null
test -d /opt/bamba-studio

sudoers_path=/etc/sudoers.d/bamba-studio-deploy
sudoers_rule='deploy ALL=(root) NOPASSWD: /usr/bin/docker'
if [[ -e "$sudoers_path" ]] && [[ "$(cat "$sudoers_path")" != "$sudoers_rule" ]]; then
  echo "An existing $sudoers_path has different rules; inspect it before proceeding." >&2
  exit 1
fi
sudoers_temp="$(mktemp /etc/sudoers.d/.bamba-studio.XXXXXXXX)"
trap 'rm -f "$sudoers_temp"' EXIT
printf '%s\n' "$sudoers_rule" > "$sudoers_temp"
chmod 440 "$sudoers_temp"
/usr/sbin/visudo -cf "$sudoers_temp"
install -o root -g root -m 440 "$sudoers_temp" "$sudoers_path"
# Create only the parent. The agent copies the authoritative exports afterwards.
if [[ ! -e /opt/bamba-studio-data ]]; then
  install -d -o deploy -g deploy -m 755 /opt/bamba-studio-data
fi
echo 'Unattended Docker access is ready. Existing Studio data has not been changed.'
