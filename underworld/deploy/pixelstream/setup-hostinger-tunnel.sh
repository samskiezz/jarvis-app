#!/usr/bin/env bash
set -euo pipefail
# setup-hostinger-tunnel.sh — run on the Vast GPU box.
# Creates a persistent SSH reverse tunnel from this box into the Hostinger VPS,
# so Hostinger can proxy https://app.projectsolar.cloud/jarvis/UnderworldUE5/
# to the local Caddy path proxy on :8081 (no Cloudflare required).
#
# Usage:
#   HOSTINGER_SSH=ubuntu@76.13.176.135 bash setup-hostinger-tunnel.sh
#
# The script will:
#   1. Install autossh.
#   2. Generate a dedicated ed25519 key for the tunnel.
#   3. Print the public key — add it to Hostinger's ~/.ssh/authorized_keys.
#   4. Test SSH to Hostinger.
#   5. Install and start a systemd service that keeps the tunnel alive.

HOSTINGER_SSH="${HOSTINGER_SSH:-}"
HOSTINGER_PORT="${HOSTINGER_PORT:-22}"
TUNNEL_REMOTE_PORT="${TUNNEL_REMOTE_PORT:-18081}"   # port opened on Hostinger
TUNNEL_LOCAL_PORT="${TUNNEL_LOCAL_PORT:-8081}"      # Caddy path proxy on Vast
KEY="${HOME}/.ssh/id_ed25519_vast_tunnel"

if [ "$EUID" -ne 0 ]; then
  echo "This script must run as root (it installs a systemd service)."
  exit 1
fi

echo "== installing autossh =="
if ! command -v autossh >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq autossh
fi

echo "== generating tunnel key =="
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -N "" -f "$KEY" -C "vast-tunnel@$(hostname)"
  echo ""
  echo "Add this public key to Hostinger's ~/.ssh/authorized_keys:"
  echo ""
  cat "${KEY}.pub"
  echo ""
else
  echo "Tunnel key already exists at $KEY"
fi

if [ -z "$HOSTINGER_SSH" ]; then
  read -rp "Hostinger SSH destination (e.g. ubuntu@76.13.176.135): " HOSTINGER_SSH
fi

# Allow user@host or user@host:port syntax
if [[ "$HOSTINGER_SSH" =~ :([0-9]+)$ ]]; then
  HOSTINGER_PORT="${BASH_REMATCH[1]}"
  HOSTINGER_SSH="${HOSTINGER_SSH%:$HOSTINGER_PORT}"
fi

HOSTINGER_HOST="${HOSTINGER_SSH#*@}"

# Add Hostinger host key so autossh doesn't prompt
mkdir -p "$HOME/.ssh"
ssh-keyscan -H -p "$HOSTINGER_PORT" "$HOSTINGER_HOST" >> "$HOME/.ssh/known_hosts" 2>/dev/null || true

echo "== testing SSH to $HOSTINGER_SSH (port $HOSTINGER_PORT) =="
if ! ssh -i "$KEY" -p "$HOSTINGER_PORT" -o PasswordAuthentication=no -o ConnectTimeout=10 -o IdentitiesOnly=yes "$HOSTINGER_SSH" 'echo hostinger-ok'; then
  echo ""
  echo "ERROR: cannot SSH to $HOSTINGER_SSH with $KEY"
  echo "Fix: on Hostinger, append this line to ~/.ssh/authorized_keys for the tunnel user:"
  cat "${KEY}.pub"
  exit 1
fi

echo "== installing systemd tunnel service =="
SERVICE="/etc/systemd/system/vast-hostinger-tunnel.service"
cat > "$SERVICE" <<EOF
[Unit]
Description=Persistent reverse SSH tunnel from Vast GPU box to Hostinger VPS
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment="AUTOSSH_GATETIME=0"
Environment="AUTOSSH_POLL=30"
ExecStart=/usr/bin/autossh -M 0 -N \\
  -o ServerAliveInterval=30 \\
  -o ServerAliveCountMax=3 \\
  -o ExitOnForwardFailure=yes \\
  -o IdentitiesOnly=yes \\
  -i ${KEY} \\
  -p ${HOSTINGER_PORT} \\
  -R ${TUNNEL_REMOTE_PORT}:127.0.0.1:${TUNNEL_LOCAL_PORT} \\
  ${HOSTINGER_SSH}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable vast-hostinger-tunnel.service
systemctl restart vast-hostinger-tunnel.service
sleep 2
systemctl status vast-hostinger-tunnel.service --no-pager

echo ""
echo "== Tunnel is active =="
echo "Hostinger should now proxy:"
echo "  https://app.projectsolar.cloud/jarvis/UnderworldUE5/"
echo "  -> http://127.0.0.1:${TUNNEL_REMOTE_PORT}/jarvis/UnderworldUE5/"
echo "  -> this Vast box Caddy :${TUNNEL_LOCAL_PORT}"
echo ""
echo "Add this nginx location block to Hostinger (inside the app.projectsolar.cloud server block):"
echo ""
cat <<NGINX
location /jarvis/UnderworldUE5/ {
    proxy_pass http://127.0.0.1:${TUNNEL_REMOTE_PORT}/jarvis/UnderworldUE5/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 86400s;
}
NGINX
