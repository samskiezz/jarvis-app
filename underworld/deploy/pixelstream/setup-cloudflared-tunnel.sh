#!/usr/bin/env bash
# setup-cloudflared-tunnel.sh — run ONCE on the GPU box to create a permanent
# Cloudflare Tunnel for app.projectsolar.cloud/jarvis/UnderworldUE5.
set -euo pipefail

CFG_DIR="/workspace/pixelstream"
CONFIG="$CFG_DIR/cloudflared-config.yml"

if [ -f "$CONFIG" ]; then
  echo "Tunnel config already exists at $CONFIG"
  echo "To recreate, delete it and run again."
  exit 0
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Installing cloudflared..."
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
  chmod +x /usr/local/bin/cloudflared
fi

echo "== Authenticating cloudflared with Cloudflare =="
cloudflared tunnel login

echo "== Creating tunnel 'jarvis-ue5' =="
TUNNEL_OUT=$(cloudflared tunnel create jarvis-ue5)
TUNNEL_ID=$(echo "$TUNNEL_OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | tail -1)
if [ -z "$TUNNEL_ID" ]; then
  echo "ERROR: could not extract tunnel ID from output:" >&2
  echo "$TUNNEL_OUT" >&2
  exit 1
fi
CRED="/root/.cloudflared/${TUNNEL_ID}.json"

echo "== Writing tunnel config =="
sed -e "s|__TUNNEL_ID__|$TUNNEL_ID|g" \
    -e "s|__TUNNEL_CREDENTIALS_FILE__|$CRED|g" \
    "$CFG_DIR/cloudflared-config.yml.template" > "$CONFIG"

echo "== Creating DNS CNAME for app.projectsolar.cloud =="
cloudflared tunnel route dns "$TUNNEL_ID" app.projectsolar.cloud

echo "== Done =="
echo "Tunnel ID: $TUNNEL_ID"
echo "Config:    $CONFIG"
echo ""
echo "Start the tunnel with:"
echo "  cloudflared tunnel --config $CONFIG run"
echo "Or enable systemd:"
echo "  cp /workspace/pixelstream/cloudflared-tunnel.service /etc/systemd/system/"
echo "  systemctl daemon-reload && systemctl enable --now cloudflared-tunnel"
echo ""
echo "Stream will be live at: https://app.projectsolar.cloud/jarvis/UnderworldUE5/"
