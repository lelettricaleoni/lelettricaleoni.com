#!/usr/bin/env bash
# deploy/deploy-entry.sh — the one command the GitHub Actions deploy key may run (forced command in authorized_keys).
#
#   deploy <env> <digest>          the site (the original form, kept so the existing workflow works unchanged)
#   rollback <env>                 the site
#   worker deploy <env> <digest>   the media worker
#   worker rollback <env>
#
# Each script validates its own arguments; this only chooses which one.
set -euo pipefail

read -r -a ARGS <<<"${SSH_ORIGINAL_COMMAND:-}"
case "${ARGS[0]:-}" in
  deploy | rollback) exec "$HOME/docker/web/deploy.sh" ;;
  worker) exec "$HOME/docker/media-worker/deploy.sh" "${ARGS[@]:1}" ;;
  *)
    echo "unknown command" >&2
    exit 2
    ;;
esac
