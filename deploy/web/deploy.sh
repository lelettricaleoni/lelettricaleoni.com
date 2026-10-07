#!/usr/bin/env bash
# Deploys one digest of ghcr.io/lelettricaleoni/lelettricaleoni-web to one environment, with no gap in service,
# and can put the previous one back.
#
#   deploy.sh deploy   <staging|production> <sha256 digest, no prefix>
#   deploy.sh rollback <staging|production>
#
# Meant to be run only through the forced-command entry in authorized_keys of the GitHub Actions deploy key, which
# passes the arguments in SSH_ORIGINAL_COMMAND. Everything is validated, because that string comes from outside.
#
# How the switch works: the new container starts next to the old one with the same network alias, so the tunnel
# keeps finding a healthy container the whole time. Only when the new one reports healthy (and its database check
# passes) is the old one stopped. The old container is kept stopped, not removed, which is what `rollback` starts
# again. The one before that is removed.
set -euo pipefail

REPO="ghcr.io/lelettricaleoni/lelettricaleoni-web"
DIR="${WEB_DEPLOY_DIR:-$HOME/docker/web}"

read -r -a ARGS <<<"${SSH_ORIGINAL_COMMAND:-$*}"
ACTION="${ARGS[0]:-}"
ENV_NAME="${ARGS[1]:-}"
DIGEST="${ARGS[2]:-}"

case "$ENV_NAME" in staging | production) ;; *)
  echo "usage: deploy.sh deploy <staging|production> <digest> | rollback <staging|production>" >&2
  exit 2
  ;;
esac

ENV_FILE="$DIR/$ENV_NAME.env"
ALIAS="web-$ENV_NAME"
LABEL="lelettrica.web=$ENV_NAME"
[ -f "$ENV_FILE" ] || { echo "[deploy] missing $ENV_FILE" >&2; exit 2; }

# Containers of this environment, by state. `docker ps` sorts newest first.
running() { docker ps -q --filter "label=$LABEL" --filter status=running; }
stopped() { docker ps -aq --filter "label=$LABEL" --filter status=exited; }

wait_healthy() {
  local name="$1" i status
  for i in $(seq 1 45); do
    status=$(docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null || echo gone)
    [ "$status" = healthy ] && return 0
    [ "$status" = gone ] && return 1
    sleep 2
  done
  return 1
}

deep_check() {
  # The container's own health check is shallow on purpose; this one also asks the database.
  docker exec "$1" node -e "fetch('http://127.0.0.1:3000/api/health?deep=1').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
}

case "$ACTION" in
deploy)
  [[ "$DIGEST" =~ ^[a-f0-9]{64}$ ]] || { echo "[deploy] not a sha256 digest" >&2; exit 2; }
  IMAGE="$REPO@sha256:$DIGEST"
  NAME="$ALIAS-${DIGEST:0:12}"

  if [ -n "$(docker ps -q --filter "name=^$NAME\$" --filter status=running)" ]; then
    echo "[deploy] $NAME is already running, nothing to do"
    exit 0
  fi

  echo "[deploy] pulling $IMAGE"
  docker pull "$IMAGE"

  OLD=$(running)
  SPARE=$(stopped)
  docker rm -f "$NAME" >/dev/null 2>&1 || true

  echo "[deploy] starting $NAME"
  docker run -d --name "$NAME" --label "$LABEL" \
    --network edge --network-alias "$ALIAS" \
    --env-file "$ENV_FILE" -e APP_ENV="$ENV_NAME" -e APP_VERSION="${DIGEST:0:12}" \
    --memory 1g --memory-swap 1g --cpu-shares 1024 \
    --restart unless-stopped \
    "$IMAGE" >/dev/null

  # The internal network, where Redis is, exists once Redis has been set up; until then there is nothing to join.
  if docker network inspect internal >/dev/null 2>&1; then
    docker network connect internal "$NAME"
  fi

  if ! { wait_healthy "$NAME" && deep_check "$NAME"; }; then
    echo "[deploy] $NAME is not healthy, leaving the running version alone. Last log lines:" >&2
    docker logs --tail 25 "$NAME" >&2 || true
    docker rm -f "$NAME" >/dev/null
    exit 1
  fi

  # Only one spare is kept: the one from the deploy before this is no longer needed.
  # shellcheck disable=SC2086
  [ -z "$SPARE" ] || docker rm $SPARE >/dev/null

  # Stop the old ones last: for a moment both answer, which is the point.
  for id in $OLD; do
    docker stop --time 20 "$id" >/dev/null
    docker update --restart no "$id" >/dev/null
  done
  docker image prune -f >/dev/null
  echo "[deploy] OK, $ENV_NAME is running $IMAGE"
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
    docker stop "$PREVIOUS" >/dev/null
    docker update --restart no "$PREVIOUS" >/dev/null
    exit 1
  fi
  for id in $CURRENT; do
    docker stop --time 20 "$id" >/dev/null
    docker update --restart no "$id" >/dev/null
  done
  echo "[deploy] OK, $ENV_NAME is back on $NAME"
  ;;

*)
  echo "usage: deploy.sh deploy <staging|production> <digest> | rollback <staging|production>" >&2
  exit 2
  ;;
esac
