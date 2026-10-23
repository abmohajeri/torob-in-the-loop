#!/usr/bin/env bash
# End-to-end smoke test against a running Torob in the Loop (local or Liara).
#   scripts/smoke.sh http://localhost:3000
#   scripts/smoke.sh https://torob-in-the-loop.liara.run
# Checks: health, meta, search «کتونی», product + stores of the first hit, places,
# POST inquiry + GET it, POST /api/chat SSE first frames. Exits 1 on the first failure.
set -euo pipefail
BASE="${1:-${BASE_URL:-http://localhost:3000}}"; BASE="${BASE%/}"
command -v curl >/dev/null || { echo "curl required" >&2; exit 2; }
command -v node >/dev/null || { echo "node required" >&2; exit 2; }
if [ -t 1 ]; then R=$'\e[31m'; G=$'\e[32m'; Y=$'\e[33m'; D=$'\e[2m'; N=$'\e[0m'; else R=; G=; Y=; D=; N=; fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0
pass() { PASS=$((PASS+1)); echo "${G}✔${N} $1 ${D}${2:-}${N}"; }
fail() { echo "${R}✘ $1${N}" >&2; [ -f "$TMP/body" ] && head -c 600 "$TMP/body" >&2 && echo >&2; exit 1; }
# req METHOD PATH [JSON] → body in $TMP/body, status in $CODE
req() {
  local data=()
  [ $# -ge 3 ] && data=(-H 'content-type: application/json' --data-binary "$3")
  CODE=$(curl -sS -m 30 -o "$TMP/body" -w '%{http_code}' -X "$1" ${data[@]+"${data[@]}"} "$BASE$2") || fail "$1 $2: connection failed"
}
# js EXPR → evaluates EXPR with `b` = parsed body; prints result (empty on null/undefined)
js() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=('"$1"');if(v!==undefined&&v!==null)process.stdout.write(String(v))' "$TMP/body"; }
enc() { node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"; }

echo "smoke → $BASE"
req GET /api/health
case "$CODE" in 200) ;; 503) echo "${Y}! health is degraded (503)${N}" ;; *) fail "health HTTP $CODE" ;; esac
pass health "$(js '`${b.status} products=${b.catalog.products} persistent=${b.state.persistent} llm=${b.llm.enabled}`')"

req GET /api/meta; [ "$CODE" = 200 ] || fail "meta HTTP $CODE"; pass meta

req GET "/api/search?q=$(enc 'کتونی')&limit=5"; [ "$CODE" = 200 ] || fail "search HTTP $CODE"
PID=$(js 'b.items[0]&&b.items[0].id'); TOTAL=$(js 'b.total')
[ -n "$PID" ] || fail "search «کتونی» returned no items"
pass "search «کتونی»" "total=$TOTAL first=$PID"

req GET "/api/products/$(enc "$PID")"; [ "$CODE" = 200 ] || fail "product HTTP $CODE"; pass product "$(js 'b.title||b.product&&b.product.title||""' | head -c 60)"
req GET "/api/products/$(enc "$PID")/stores"; [ "$CODE" = 200 ] || fail "stores HTTP $CODE"
SHOP=$(js 'b.stores[0]&&b.stores[0].shop.id')
pass stores "stores=$(js 'b.stores.length') first=$SHOP"

req GET "/api/places?q=$(enc 'ونک')&limit=3"; [ "$CODE" = 200 ] || fail "places HTTP $CODE"; pass places "n=$(js 'b.length')"

SID="smoke-$(date +%s)-$$"
if [ -n "$SHOP" ]; then
  req POST /api/inquiries "{\"sessionId\":\"$SID\",\"productId\":\"$PID\",\"shopIds\":[\"$SHOP\"],\"questions\":[\"stock\",\"price\"]}"
  [ "$CODE" = 200 ] || [ "$CODE" = 201 ] || fail "POST inquiries HTTP $CODE"
  IID=$(js 'b.inquiries[0]&&b.inquiries[0].id'); [ -n "$IID" ] || fail "no inquiry id returned"
  pass "inquiry create" "$IID"
  req GET "/api/inquiries/$(enc "$IID")"; [ "$CODE" = 200 ] || fail "GET inquiry HTTP $CODE"
  pass "inquiry get" "status=$(js 'b.status')"
else
  echo "${Y}! skipped inquiry: product has no stores${N}"
fi

curl -sS -N -m 20 -H 'content-type: application/json' -H 'accept: text/event-stream' \
  --data-binary "{\"sessionId\":\"$SID\",\"message\":\"سلام، کتونی می‌خواهم\",\"context\":{}}" \
  "$BASE/api/chat" > "$TMP/sse" 2>/dev/null || true   # timeout after frames is fine
FRAMES=$(grep -c '^data: ' "$TMP/sse" || true)
[ "${FRAMES:-0}" -gt 0 ] || { cp "$TMP/sse" "$TMP/body"; fail "chat: no SSE frames"; }
pass chat "frames=$FRAMES types=$(grep '^data: ' "$TMP/sse" | head -8 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(s.trim().split("\n").map(l=>{try{return JSON.parse(l.slice(6)).type}catch{return"?"}}).join(",")))')"

echo "${G}all $PASS checks passed${N}"
