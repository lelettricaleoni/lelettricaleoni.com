#!/usr/bin/env bash
# deploy/redis/render-acl.sh — run once on the VM, from ~/docker/redis.
#
# Makes a password for the site and one for the worker, writes their hashes into users.acl, and the ready-to-use
# connection strings into web.redis-url and worker.redis-url (mode 600). The passwords exist nowhere else.
# Run again with --rotate to replace them (and then rewrite the env files that hold the old ones).
set -euo pipefail
cd "$(dirname "$0")"

if [ -f users.acl ] && [ "${1:-}" != "--rotate" ]; then
  echo "users.acl exists: pass --rotate to replace the passwords" >&2
  exit 1
fi

umask 077
web_password=$(openssl rand -hex 24)
worker_password=$(openssl rand -hex 24)
hash() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

# A Redis ACL file takes no comments: the template keeps them, the rendered file does not.
sed -e '/^#/d' -e "s/__WEB_HASH__/$(hash "$web_password")/" -e "s/__WORKER_HASH__/$(hash "$worker_password")/" users.acl.template > users.acl
# Only hashes in there, and the redis user inside the container has to read it.
chmod 644 users.acl

printf 'redis://web:%s@redis:6379\n' "$web_password" > web.redis-url
printf 'redis://worker:%s@redis:6379\n' "$worker_password" > worker.redis-url
echo "written: users.acl, web.redis-url, worker.redis-url"
