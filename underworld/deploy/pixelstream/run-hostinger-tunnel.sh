#!/usr/bin/env bash
set -euo pipefail
# run-hostinger-tunnel.sh — persistent reverse SSH tunnel from Vast GPU box to Hostinger.
# Use this on container/Vast hosts that do not have systemd (PID 1).
#
# Usage:
#   HOSTINGER_SSH=vasttunnel@76.13.176.135 ./run-hostinger-tunnel.sh
#
# Add to crontab @reboot if you want it to survive restarts:
#   @reboot /workspace/pixelstream/run-hostinger-tunnel.sh >/tmp/jarvis_tunnel_launch.log 2>&1

HOSTINGER_SSH="${HOSTINGER_SSH:-vasttunnel@76.13.176.135}"
HOSTINGER_PORT="${HOSTINGER_PORT:-22}"
TUNNEL_REMOTE_PORT="${TUNNEL_REMOTE_PORT:-18081}"
TUNNEL_LOCAL_PORT="${TUNNEL_LOCAL_PORT:-8081}"
KEY="${HOME}/.ssh/id_ed25519_vast_tunnel"
LOG="${TUNNEL_LOG:-/tmp/jarvis_hostinger_tunnel.log}"

if ! command -v autossh >/dev/null 2>&1; then
  echo "autossh not found; installing..."
  apt-get update -qq && apt-get install -y -qq autossh
fi

# Allow user@host:port syntax
if [[ "$HOSTINGER_SSH" =~ :([0-9]+)$ ]]; then
  HOSTINGER_PORT="${BASH_REMATCH[1]}"
  HOSTINGER_SSH="${HOSTINGER_SSH%:$HOSTINGER_PORT}"
fi

HOSTINGER_HOST="${HOSTINGER_SSH#*@}"

# Add Hostinger host key so autossh doesn't prompt
mkdir -p "$HOME/.ssh"
ssh-keyscan -H -p "$HOSTINGER_PORT" "$HOSTINGER_HOST" >> "$HOME/.ssh/known_hosts" 2>/dev/null || true

# Kill stale tunnel processes for this exact forward
pkill -f "autossh.*-R ${TUNNEL_REMOTE_PORT}:127.0.0.1:${TUNNEL_LOCAL_PORT}" 2>/dev/null || true
sleep 1

echo "Starting reverse tunnel: Hostinger 127.0.0.1:${TUNNEL_REMOTE_PORT} -> Vast 127.0.0.1:${TUNNEL_LOCAL_PORT}"
nohup autossh -M 0 -N \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -o IdentitiesOnly=yes \
  -i "$KEY" \
  -p "$HOSTINGER_PORT" \
  -R "${TUNNEL_REMOTE_PORT}:127.0.0.1:${TUNNEL_LOCAL_PORT}" \
  "$HOSTINGER_SSH" >"$LOG" 2>&1 </dev/null &

sleep 3
echo "Tunnel PID: $!"
echo "Log: $LOG"
tail -n 5 "$LOG" || true
