#!/usr/bin/env bash
# deploy/worker/make-env.sh — run on the VM: builds ~/docker/media-worker/<env>.env from what the site already has
# (the R2 credentials and bucket of that environment) and the worker's Redis connection string. Prints no secret.
set -euo pipefail

ENV_NAME="${1:?usage: make-env.sh <staging|production>}"
case "$ENV_NAME" in staging | production) ;; *) echo "unknown environment" >&2; exit 2 ;; esac

WEB_ENV="$HOME/docker/web/$ENV_NAME.env"
REDIS_URL_FILE="$HOME/docker/redis/worker-$ENV_NAME.redis-url"
OUT="$HOME/docker/media-worker/$ENV_NAME.env"
[ -f "$WEB_ENV" ] || { echo "missing $WEB_ENV" >&2; exit 1; }
[ -f "$REDIS_URL_FILE" ] || { echo "missing $REDIS_URL_FILE (run render-acl.sh first)" >&2; exit 1; }
[ ! -f "$OUT" ] || { echo "$OUT exists: remove it first if you mean to rebuild it" >&2; exit 1; }

umask 077
pick() { grep -E "^$1=" "$WEB_ENV" | head -n 1; }
{
  pick R2_ACCOUNT_ID
  pick R2_ACCESS_KEY_ID
  pick R2_SECRET_ACCESS_KEY
  echo "R2_BUCKETS=$(pick R2_BUCKET_NAME | cut -d= -f2-)"
  echo "REDIS_URL=$(cat "$REDIS_URL_FILE")"
} > "$OUT"
echo "written $OUT"
