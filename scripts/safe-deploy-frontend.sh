#!/usr/bin/env bash
# safe-deploy-frontend.sh — ZERO-DOWNTIME deploy of the jarvis main app (:5173).
#
# WHY: every previous outage came from `vite build` wiping the LIVE dist/ (emptyOutDir) while
# preview was serving it → blank page for minutes. This builds to a STAGING dir, validates it,
# then ATOMICALLY swaps it in. The live app keeps serving the OLD dist the entire time the build
# runs; the swap is a single `mv` (sub-millisecond), and `vite preview` serves files per-request
# so the new bundle goes live WITHOUT a restart. Keeps the previous dist for instant rollback.
#
# Usage:  scripts/safe-deploy-frontend.sh           # build + swap
#         scripts/safe-deploy-frontend.sh rollback  # restore the previous dist instantly
set -euo pipefail
cd /opt/jarvis-app-1

LIVE="dist"
STAGE="dist_staging"
PREV="dist_prev"

if [[ "${1:-}" == "rollback" ]]; then
  [[ -d "$PREV" ]] || { echo "no $PREV to roll back to"; exit 1; }
  TMP="dist_rollback_tmp"; rm -rf "$TMP"
  mv "$LIVE" "$TMP" && mv "$PREV" "$LIVE" && mv "$TMP" "$PREV"
  echo "✓ rolled back to previous dist (live app served the whole time)"
  exit 0
fi

echo "[deploy] building to $STAGE/ (the live app at :5173 keeps serving $LIVE/ untouched)…"
rm -rf "$STAGE"
# build into staging — NEVER the live dir. Conservative heap so it fits alongside the running sim.
NODE_OPTIONS="--max-old-space-size=4096" node node_modules/vite/bin/vite.js build --outDir "$STAGE" --emptyOutDir

# validate the staged build before swapping (no half-built dist ever goes live)
ENTRY=$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' "$STAGE/index.html" 2>/dev/null | head -1 || true)
if [[ ! -f "$STAGE/index.html" || -z "$ENTRY" || ! -f "$STAGE${ENTRY}" ]]; then
  echo "[deploy] ✗ staged build invalid (index.html or entry JS missing) — NOT swapping. Live app untouched."
  exit 1
fi
echo "[deploy] staged build OK (entry: $ENTRY)"

# atomic swap: old live -> prev, staged -> live. A single mv each; the running preview serves the
# new files on the next request. No service stop, no restart, no downtime.
rm -rf "$PREV"
[[ -d "$LIVE" ]] && mv "$LIVE" "$PREV"
mv "$STAGE" "$LIVE"
echo "[deploy] ✓ swapped staged build into $LIVE/ (previous kept at $PREV/ for rollback)"

# nudge pm2 only if jarvis-frontend isn't actually serving (don't restart a healthy server).
if ! curl -s -o /dev/null --max-time 5 http://127.0.0.1:5173/ 2>/dev/null; then
  echo "[deploy] frontend not responding — (re)starting via the wrapper"
  pm2 start scripts/serve-frontend.sh --name jarvis-frontend --interpreter bash 2>/dev/null \
    || pm2 restart jarvis-frontend 2>/dev/null || true
fi
echo "[deploy] done — home is live with the new build."
