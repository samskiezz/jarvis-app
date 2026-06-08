#!/usr/bin/env bash
# service-watchdog.sh — overnight self-healing. Runs from cron every few minutes: if any core
# service stops answering, pm2-restart it. This is the "it must be running when I wake up"
# insurance on top of pm2's own autorestart. Read-only health checks; only ever (re)starts.
set -uo pipefail
LOG=/var/log/jarvis-watchdog.log
ts() { date -u +%H:%M:%S; }
check() { # name  url  expected-substring-or-code
  local name="$1" url="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 12 "$url" 2>/dev/null || echo 000)
  if [ "$code" != "200" ]; then
    echo "$(ts) $name DOWN ($code @ $url) → pm2 restart" >> "$LOG"
    pm2 restart "$name" >/dev/null 2>&1 || pm2 start /opt/jarvis-app-1/ecosystem.config.cjs --only "$name" >/dev/null 2>&1 || true
  fi
}
check jarvis-frontend    http://127.0.0.1:5173/
check underworld-web     http://127.0.0.1:5180/
check jarvis-backend     http://127.0.0.1:8001/v1/metrics
check underworld-backend http://127.0.0.1:8091/health
