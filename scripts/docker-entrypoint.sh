#!/bin/sh
# Torob in the Loop container entrypoint (POSIX sh: runs on Debian's dash).
#
#  1. Fails fast with a clear message when the read-only catalog is missing (otherwise the server
#     would log an uncaught error and never listen, and the platform would only see a failed health check).
#  2. Prepares the state directory. Liara disks (and some Docker volumes) are mounted root-owned, so
#     when started as root we hand the directory to the unprivileged `node` user and then DROP
#     privileges with util-linux `setpriv` (part of Debian's essential set, no extra packages).
#     If the directory still isn't writable for `node`, we keep root rather than silently losing
#     persistence, and say so in the logs.
#  3. `exec`s the command so Node is PID 1 and receives SIGTERM/SIGINT directly (the server
#     handles both and shuts down gracefully within 5 s).
set -eu

CATALOG_PATH="${CATALOG_PATH:-/app/data/catalog.db}"
STATE_DB_PATH="${STATE_DB_PATH:-/var/lib/torob-in-the-loop/state.db}"
APP_USER="${APP_USER:-node}"

log() {
  # One JSON line, like the server's logger (messages are plain ASCII, no quotes).
  printf '{"t":"%s","lvl":"%s","msg":"entrypoint: %s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >&2
}

# ── 1. catalog ─────────────────────────────────────────────────────────────
if [ "${SKIP_CATALOG_CHECK:-0}" != "1" ]; then
  if [ ! -s "$CATALOG_PATH" ]; then
    log error "catalog database not found (or empty) at $CATALOG_PATH. Build it locally with: npm run data:build, then rebuild the image / redeploy. See docs/DEPLOY.md"
    exit 1
  fi
  if [ ! -r "$CATALOG_PATH" ]; then
    log error "catalog database at $CATALOG_PATH is not readable"
    exit 1
  fi
fi

# ── 2. state directory + privilege drop ───────────────────────────────────
state_dir=$(dirname "$STATE_DB_PATH")

if [ "$(id -u)" = "0" ] && [ "${RUN_AS_ROOT:-0}" != "1" ] && id "$APP_USER" >/dev/null 2>&1; then
  uid=$(id -u "$APP_USER")
  gid=$(id -g "$APP_USER")
  mkdir -p "$state_dir" 2>/dev/null || true
  # Only the directory and our own DB files: never recurse into whatever else is on the disk.
  chown "$uid:$gid" "$state_dir" 2>/dev/null || true
  for f in "$STATE_DB_PATH" "$STATE_DB_PATH-wal" "$STATE_DB_PATH-shm" "$STATE_DB_PATH-journal"; do
    if [ -e "$f" ]; then chown "$uid:$gid" "$f" 2>/dev/null || true; fi
  done

  if command -v setpriv >/dev/null 2>&1; then
    if setpriv --reuid="$uid" --regid="$gid" --clear-groups test -w "$state_dir"; then
      export HOME="${APP_HOME:-/home/$APP_USER}"
      exec setpriv --reuid="$uid" --regid="$gid" --clear-groups -- "$@"
    fi
    log warn "state dir $state_dir is not writable for $APP_USER even after chown; staying root so state stays persistent"
  else
    log warn "setpriv not found; running as root"
  fi
  exec "$@"
fi

if ! { mkdir -p "$state_dir" 2>/dev/null && [ -w "$state_dir" ]; }; then
  log warn "state dir $state_dir is not writable for uid $(id -u); the server will fall back to EPHEMERAL temp storage (inquiries and chats are lost on restart). Mount a disk at $state_dir"
fi
exec "$@"
