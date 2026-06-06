#!/usr/bin/env bash
# diagnose.sh — run this ON THE SERVER and paste the output. It tells us exactly
# why the UI shows the old base44 page / zeros / no install pop-up.
#   bash scripts/diagnose.sh
cd "$(dirname "$0")/.." 2>/dev/null || cd .
API_PORT="${API_PORT:-8001}"; UI_PORT="${UI_PORT:-5173}"
ok(){ printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad(){ printf '  \033[31m✗\033[0m %s\n' "$*"; }
echo "==================== JARVIS DEPLOY DIAGNOSTIC ===================="

echo "[1] Git — is this the latest code?"
HEAD=$(git rev-parse --short HEAD 2>/dev/null)
echo "      current commit: ${HEAD:-<not a git repo>}"
git fetch origin >/dev/null 2>&1
REMOTE=$(git rev-parse --short origin/main 2>/dev/null)
echo "      origin/main   : ${REMOTE:-<unknown>}"
[ -n "$HEAD" ] && [ "$HEAD" = "$REMOTE" ] && ok "up to date with main" || bad "BEHIND main — run: git fetch && git reset --hard origin/main"

echo "[2] Does the NEW code exist in source?"
[ -f src/components/FirstRunSetup.jsx ] && ok "FirstRunSetup.jsx present" || bad "FirstRunSetup.jsx MISSING (stale clone)"
[ -f src/three/holoCore.js ] && ok "holoCore.js (WebGL engine) present" || bad "holoCore.js MISSING (stale clone)"
[ -f public/models/palantir/jarvis_core_avatar.glb ] && ok "Iron Man GLB present ($(du -h public/models/palantir/jarvis_core_avatar.glb 2>/dev/null|cut -f1))" || bad "GLBs MISSING (stale clone)"

echo "[3] Is the build current? (dist must be rebuilt AFTER pulling)"
if [ -d dist ]; then
  if grep -rl "FirstRunSetup\|holoMaterial\|UnrealBloom" dist/assets/*.js >/dev/null 2>&1; then ok "dist contains the new UI"; else bad "dist is STALE — run: npm run build"; fi
else bad "no dist/ — run: npm run build"; fi

echo "[4] Backend reachable on :$API_PORT ?"
if curl -s -m 5 "http://127.0.0.1:$API_PORT/" >/dev/null 2>&1; then
  ok "backend responds on 127.0.0.1:$API_PORT"
  OBJ=$(curl -s -m 8 "http://127.0.0.1:$API_PORT/v1/jarvis/system/status" 2>/dev/null | grep -o '"ontology_objects":[0-9]*' | head -1)
  echo "      data: ${OBJ:-<status call failed>}"
else bad "backend NOT running on :$API_PORT — start: python -m uvicorn server.main:app --host 0.0.0.0 --port $API_PORT"; fi

echo "[5] Is the UI server up on :$UI_PORT ?"
curl -s -m 5 "http://127.0.0.1:$UI_PORT/" >/dev/null 2>&1 && ok "UI server responds on :$UI_PORT" || bad "UI not serving on :$UI_PORT"
echo "      GLB over UI:"
GC=$(curl -s -m 8 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$UI_PORT/models/palantir/jarvis_core_avatar.glb" 2>/dev/null)
[ "$GC" = "200" ] && ok "GLB served (HTTP 200) — 3D assets reachable" || bad "GLB HTTP $GC — UI serving OLD build (no models)"

echo "[6] What is the UI built to call for the API?"
grep -roh "VITE_API_PORT[^,]*\|:80[0-9][0-9]" dist/assets/*.js 2>/dev/null | sort -u | head -3 | sed 's/^/      /'
echo "================================================================="
echo "VERDICT: fix every ✗ top-to-bottom. Most common: pull + rebuild:"
echo "  git fetch && git reset --hard origin/main && VITE_API_PORT=$API_PORT npm run build"
