#!/usr/bin/env bash
# Calls one of the site's cron endpoints from inside the running container, with the shared secret.
# Vercel used to do this; on the VM a systemd timer does (see cron.timer).
#
#   run-cron.sh <staging|production> <path>      e.g. run-cron.sh production /api/cron/google-calendar
#
# Runs inside the container so that nothing needs a published port and the secret never leaves the VM.
set -euo pipefail

ENV_NAME="${1:?usage: run-cron.sh <staging|production> <path>}"
CRON_PATH="${2:?usage: run-cron.sh <staging|production> <path>}"
case "$ENV_NAME" in staging | production) ;; *) echo "unknown environment" >&2; exit 2 ;; esac
[[ "$CRON_PATH" =~ ^/api/cron/[a-z0-9-]+$ ]] || { echo "not a cron path" >&2; exit 2; }

CONTAINER=$(docker ps -q --filter "label=lelettrica.web=$ENV_NAME" --filter status=running | head -n 1)
[ -n "$CONTAINER" ] || { echo "no running $ENV_NAME container" >&2; exit 1; }

docker exec -e CRON_PATH="$CRON_PATH" "$CONTAINER" node -e "
fetch('http://127.0.0.1:3000' + process.env.CRON_PATH, {
  headers: { authorization: 'Bearer ' + process.env.CRON_SECRET },
}).then(async (r) => {
  console.log(r.status, (await r.text()).slice(0, 300))
  process.exit(r.ok ? 0 : 1)
}).catch((e) => { console.error(e); process.exit(1) })
"
