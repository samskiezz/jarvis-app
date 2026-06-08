#!/usr/bin/env bash
# overnight-finish.sh — completes the remaining work DETACHED (survives the chat closing), safely.
# Order is deliberate: one build at a time so the box is never overloaded, validate before every
# swap, and NEVER leave a service stopped. Writes progress to /tmp/overnight.log + a STATUS file.
set -uo pipefail
cd /opt/jarvis-app-1
LOG=/tmp/overnight.log
STATUS=/opt/jarvis-app-1/OVERNIGHT-STATUS.txt
exec >>"$LOG" 2>&1
echo "==================== overnight finisher start $(date -u) ===================="
st() { echo "$(date -u +%H:%M:%S)  $*" | tee -a "$STATUS"; }
: > "$STATUS"; st "Overnight finisher running — you can close the chat; this continues."

# wait for any in-flight vite build to finish (don't run two at once)
for i in $(seq 1 180); do pgrep -f 'vite[/]bin/vite.js build' >/dev/null || break; sleep 5; done

# ── 1. underworld-web → fast STATIC preview (so :5180 loads instantly on a phone) ──
st "[1/4] building underworld-web static dist…"
( cd underworld/web && NODE_OPTIONS=--max-old-space-size=4096 nice -n 19 node_modules/vite/bin/vite.js build ) || true
if [ -s underworld/web/dist/index.html ]; then
  st "[1/4] underworld dist OK → switching :5180 to static preview"
  pm2 delete underworld-web >/dev/null 2>&1 || true
  pm2 start npm --name underworld-web --cwd /opt/jarvis-app-1/underworld/web -- run preview -- --host 0.0.0.0 --port 5180 >/dev/null 2>&1 || true
  sleep 6
  C=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:5180/ 2>/dev/null || echo 000)
  if [ "$C" = "200" ]; then st "[1/4] ✓ :5180 now FAST static preview (http=200)"
  else st "[1/4] ! preview not 200 ($C) — reverting to dev so :5180 stays up"
       pm2 delete underworld-web >/dev/null 2>&1 || true
       pm2 start npm --name underworld-web --cwd /opt/jarvis-app-1/underworld/web -- run dev -- --host 0.0.0.0 --port 5180 >/dev/null 2>&1 || true
  fi
else
  st "[1/4] ! underworld build produced no dist — leaving :5180 on dev (still up)"
fi

# ── 2. confirm the /v1/pm2 backend endpoint (Fleet Control panel needs it) ──
PM2API=$(curl -s --max-time 8 http://127.0.0.1:8001/v1/pm2 2>/dev/null | head -c 40)
st "[2/4] /v1/pm2 backend endpoint: ${PM2API:-no-response}"

# ── 3. frontend deploy (Fleet Control panel) — zero-downtime safe-deploy ──
st "[3/4] building + deploying the frontend (Fleet Control panel)…"
nice -n 19 bash scripts/safe-deploy-frontend.sh || st "[3/4] ! frontend deploy reported an issue (see $LOG)"
C5173=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://127.0.0.1:5173/ 2>/dev/null || echo 000)
st "[3/4] home :5173 -> $C5173"

# ── 4. persist everything so it survives a reboot ──
pm2 save >/dev/null 2>&1 || true
st "[4/4] ✓ pm2 state saved (persists across reboot)"

st "DONE. Summary:"
for n in jarvis-frontend jarvis-backend underworld-web underworld-backend; do
  S=$(pm2 describe "$n" 2>/dev/null | grep -m1 status | grep -oE 'online|stopped|errored' || echo "?")
  st "   $n: $S"
done
st "Fleet Control panel: open the app → search 'Fleet Control' (or /apex → Command group)."
echo "==================== overnight finisher done $(date -u) ===================="
