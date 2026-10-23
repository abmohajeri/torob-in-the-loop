#!/usr/bin/env bash
# Deploy Torob in the Loop to Liara (Docker platform, Dockerfile.runtime from prebuilt artifacts).
#   scripts/deploy-liara.sh [--app NAME] [--api-token TOKEN] [--detach] [--skip-build] [--full]
#   env: LIARA_APP (default torob-in-the-loop), LIARA_API_TOKEN
#   --full : build from source on Liara with ./Dockerfile instead of Dockerfile.runtime (slower).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [ -t 1 ]; then R=$'\e[31m'; G=$'\e[32m'; Y=$'\e[33m'; B=$'\e[1m'; N=$'\e[0m'; else R=; G=; Y=; B=; N=; fi
info() { echo "${B}==>${N} $*"; }
ok()   { echo "${G}✔${N} $*"; }
warn() { echo "${Y}!${N} $*" >&2; }
die()  { echo "${R}✘ $*${N}" >&2; exit 1; }

APP="${LIARA_APP:-torob-in-the-loop}"; TOKEN="${LIARA_API_TOKEN:-}"; DETACH=0; SKIP_BUILD=0; FULL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --app) APP="${2:?}"; shift 2 ;;
    --api-token) TOKEN="${2:?}"; shift 2 ;;
    --detach) DETACH=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --full) FULL=1; shift ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done
[ -n "$APP" ] || die "app name is empty (use --app or LIARA_APP)"

command -v liara >/dev/null 2>&1 || die "Liara CLI not found: npm i -g @liara/cli"
command -v node >/dev/null 2>&1 || die "node >= 22 is required"
if [ -z "$TOKEN" ]; then
  # `liara login` stores accounts in ~/.liara-auth.json; without it, require a token.
  if [ ! -s "$HOME/.liara-auth.json" ]; then
    die "not logged in: run 'liara login' or pass --api-token / LIARA_API_TOKEN"
  fi
fi
ok "Liara CLI $(liara --version 2>/dev/null | head -1), app: ${B}$APP${N}"

# 1. catalog
if [ ! -s data/catalog.db ]; then
  if [ -f ../dataset/products.csv ] || [ -f dataset/products.csv ]; then
    info "data/catalog.db missing → npm run data:build"
    npm run data:build
  else
    die "data/catalog.db missing and the raw dataset isn't available. Build it on a machine that has the dataset (npm run data:build) or download a prebuilt catalog into data/catalog.db"
  fi
fi
ok "catalog: $(du -h data/catalog.db | cut -f1)"

# 2. builds
if [ "$SKIP_BUILD" = 0 ] && [ "$FULL" = 0 ]; then
  info "npm run build (web + server)"
  npm run build
fi
if [ "$FULL" = 0 ]; then
  for f in apps/server/dist/index.js apps/server/dist/state-schema.sql apps/web/dist/index.html; do
    [ -s "$f" ] || die "missing build artifact $f (run npm run build)"
  done
  ok "build artifacts present"
fi

# 3. size estimate
info "estimating upload size"
"$ROOT/scripts/check-size.sh" || warn "size check reported a problem (see above)"

# 4. deploy
args=(deploy --app "$APP" --platform docker --port 3000 --no-app-logs)
[ "$FULL" = 1 ] && args+=(--dockerfile Dockerfile)
[ -n "$TOKEN" ] && args+=(--api-token "$TOKEN")
[ "$DETACH" = 1 ] && args+=(--detach)
info "liara ${args[*]/$TOKEN/***}"
liara "${args[@]}"
ok "deploy submitted. Verify: scripts/smoke.sh https://$APP.liara.run"
