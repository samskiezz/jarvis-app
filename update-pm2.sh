#!/usr/bin/env bash
# update-pm2.sh — one command to get the newest version live on THIS (PM2-managed) box.
# Untracked on purpose: survives `git reset --hard` and never fights PM2.
#   bash update-pm2.sh
set -uo pipefail
cd "$(dirname "$0")"
PY=".venv/bin/python"; [ -x "$PY" ] || PY="python3"
say(){ printf '\033[36m[update-pm2]\033[0m %s\n' "$*"; }

say "1/3 pulling latest (main)…"
git pull --ff-only origin main
say "    now at: $(git rev-parse --short HEAD)  ($(git log -1 --pretty=%s | cut -c1-60))"

say "2/3 installing backend deps into .venv…"
"$PY" -m pip install -q -r server/requirements.txt || true

say "3/3 restarting PM2 services…"
pm2 restart jarvis-backend jarvis-frontend --update-env >/dev/null
sleep 4
b=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/auth/me -H "Authorization: Bearer dev-key")
f=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/)
say "done. backend=$b frontend=$f  (200 = healthy)"
