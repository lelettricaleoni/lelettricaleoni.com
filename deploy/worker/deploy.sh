#!/usr/bin/env bash
# deploy/worker/deploy.sh — deploys one digest of ghcr.io/lelettricaleoni/lelettricaleoni-worker to one environment, and can
# put the previous one back. Reached only through deploy-entry.sh.
#
#   deploy.sh deploy   <staging|production> <sha256 digest, no prefix>
#   deploy.sh rollback <staging|production>
#
# Like the site's script, the new container starts beside the old one and the switch happens only when the new one is
# healthy. Unlike the site's, the old container is not waited for: it is told to finish the job it is on and exit
# (`stop_timeout` is half an hour), so a deploy never cuts a transcode in half and never holds the connection open.
set -euo pipefail

REPO="ghcr.io/lelettricaleoni/lelettricaleoni-worker"
DIR="${MEDIA_WORKER_DIR:-$HOME/docker/media-worker}"

read -r -a ARGS <<<"$*"
ACTION="${ARGS[0]:-}"
ENV_NAME="${ARGS[1]:-}"
DIGEST="${ARGS[2]:-}"

usage() { echo "usage: deploy.sh deploy <staging|production> <digest> | rollback <staging|production>" >&2; exit 2; }
case "$ENV_NAME" in staging | production) ;; *) usage ;; esac

ENV_FILE="$DIR/$ENV_NAME.env"
LABEL="lelettrica.worker=$ENV_NAME"
[ -f "$ENV_FILE" ] || { echo "[deploy] missing $ENV_FILE" >&2; exit 2; }

running() { docker ps -q --filter "label=$LABEL" --filter status=running; }
stopped() { docker ps -aq --filter "label=$LABEL" --filter status=exited; }

wait_healthy() {
  local name="$1" i status
  for i in $(seq 1 60); do
    status=$(docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null || echo gone)
    [ "$status" = healthy ] && return 0
    [ "$status" = gone ] && return 1
    sleep 2
  done
  return 1
}

# Tell a container to finish its job and exit; do not wait, and do not let Docker bring it back.
drain() {
  docker update --restart no "$1" >/dev/null
  docker kill --signal SIGTERM "$1" >/dev/null
}

case "$ACTION" in
deploy)
  [[ "$DIGEST" =~ ^[a-f0-9]{64}$ ]] || { echo "[deploy] not a sha256 digest" >&2; exit 2; }
  IMAGE="$REPO@sha256:$DIGEST"
  NAME="media-worker-$ENV_NAME-${DIGEST:0:12}"

  if [ -n "$(docker ps -q --filter "name=^$NAME\$" --filter status=running)" ]; then
    echo "[deploy] $NAME is already running, nothing to do"
    exit 0
  fi

  echo "[deploy] pulling $IMAGE"
  docker pull "$IMAGE"

  # The image must be able to start with this environment's real settings before anything is replaced.
  echo "[deploy] cold check"
  if ! docker run --rm --env-file "$ENV_FILE" -e APP_ENV="$ENV_NAME" "$IMAGE" node worker.mjs --check; then
    echo "[deploy] the cold check failed, nothing changed" >&2
    exit 1
  fi

  OLD=$(running)
  SPARE=$(stopped)
  docker rm -f "$NAME" >/dev/null 2>&1 || true

  echo "[deploy] starting $NAME"
  docker run -d --name "$NAME" --label "$LABEL" \
    --env-file "$ENV_FILE" -e APP_ENV="$ENV_NAME" \
    --memory 4g --memory-swap 4g --cpu-shares 256 \
    --stop-timeout 1800 --restart unless-stopped \
    "$IMAGE" >/dev/null
  # Outbound access (R2) comes from the default network; Redis is on the internal one.
  docker network connect internal "$NAME"

  if ! wait_healthy "$NAME"; then
    echo "[deploy] $NAME is not healthy, leaving the running version alone. Last log lines:" >&2
    docker logs --tail 25 "$NAME" >&2 || true
    docker rm -f "$NAME" >/dev/null
    exit 1
  fi

  # Only one spare is kept.
  # shellcheck disable=SC2086
  [ -z "$SPARE" ] || docker rm $SPARE >/dev/null

  for id in $OLD; do drain "$id"; done
  docker image prune -f >/dev/null
  echo "[deploy] OK, $ENV_NAME runs $IMAGE (the previous one finishes its job and exits)"
  ;;

rollback)
  PREVIOUS=$(stopped | head -n 1)
  [ -n "$PREVIOUS" ] || { echo "[deploy] no previous version kept for $ENV_NAME" >&2; exit 1; }
  CURRENT=$(running)
  docker update --restart unless-stopped "$PREVIOUS" >/dev/null
  docker start "$PREVIOUS" >/dev/null
  NAME=$(docker inspect --format '{{.Name}}' "$PREVIOUS" | tr -d /)
  if ! wait_healthy "$NAME"; then
    echo "[deploy] the previous version does not come up healthy either; the running one is untouched" >&2
    docker stop --time 5 "$PREVIOUS" >/dev/null
    docker update --restart no "$PREVIOUS" >/dev/null
    exit 1
  fi
  for id in $CURRENT; do drain "$id"; done
  echo "[deploy] OK, $ENV_NAME is back on $NAME"
  ;;

*) usage ;;
esac
