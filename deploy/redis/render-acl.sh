#!/usr/bin/env bash
# deploy/redis/render-acl.sh — run once on the VM, from ~/docker/redis.
#
# Makes a password for each of the four users (site and worker, staging and production), writes their hashes into
# users.acl, and the ready-to-use connection strings into web-staging.redis-url, web-production.redis-url,
# worker-staging.redis-url and worker-production.redis-url (mode 600). The passwords exist nowhere else.
# Run again with --rotate to replace them (and then rewrite the env files that hold the old ones).
set -euo pipefail
cd "$(dirname "$0")"

if [ -f users.acl ] && [ "${1:-}" != "--rotate" ]; then
  echo "users.acl exists: pass --rotate to replace the passwords" >&2
  exit 1
fi

umask 077
hash() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

# A Redis ACL file takes no comments: the template keeps them, the rendered file does not.
substitutions=(-e '/^#/d')
for role in web worker; do
  for env in staging production; do
    password=$(openssl rand -hex 24)
    placeholder="__$(printf '%s_%s' "$role" "$env" | tr '[:lower:]' '[:upper:]')_HASH__"
    substitutions+=(-e "s/$placeholder/$(hash "$password")/")
    printf 'redis://%s-%s:%s@redis:6379\n' "$role" "$env" "$password" > "$role-$env.redis-url"
  done
done

sed "${substitutions[@]}" users.acl.template > users.acl
# Only hashes in there, and the redis user inside the container has to read it.
chmod 644 users.acl
echo "written: users.acl and the four *.redis-url files"
