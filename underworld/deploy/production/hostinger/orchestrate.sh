#!/usr/bin/env bash
# orchestrate.sh — runs on the Hostinger control box. Vast maps container ports 8080/8081
# to RANDOM public ports that change whenever the instance restarts. This discovers the
# CURRENT mapping over SSH, fills nginx-underworld.conf.template, reloads nginx, and
# health-checks both streams. Run on a timer (systemd/cron) so the proxy self-heals.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

DOMAIN="${DOMAIN:?set DOMAIN (e.g. play.underworld.example)}"
VAST_SSH="${VAST_SSH:?set VAST_SSH (e.g. '-p 41154 root@211.72.13.201')}"
VAST_HOST="${VAST_HOST:?set VAST_HOST (Vast public IP)}"
NGINX_OUT="${NGINX_OUT:-/etc/nginx/sites-enabled/underworld.conf}"

echo "== discovering Vast public port mapping over SSH =="
# Vast injects VAST_TCP_PORT_<cport>=<public_port> into the container environment.
read -r HTTP1 HTTP2 < <(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=12 $VAST_SSH \
  'echo "${VAST_TCP_PORT_8080:-} ${VAST_TCP_PORT_8081:-}"')
[ -n "${HTTP1:-}" ] && [ -n "${HTTP2:-}" ] || {
  echo "ERROR: could not read VAST_TCP_PORT_8080/8081 from the Vast container." >&2
  echo "Check the instance is up and those ports are exposed in the Docker template." >&2
  exit 1; }
echo "session1 -> $VAST_HOST:$HTTP1    session2 -> $VAST_HOST:$HTTP2"

echo "== rendering nginx config =="
sed -e "s/__DOMAIN__/$DOMAIN/g" \
    -e "s/__VAST_HOST__/$VAST_HOST/g" \
    -e "s/__VAST_HTTP1__/$HTTP1/g" \
    -e "s/__VAST_HTTP2__/$HTTP2/g" \
    "$HERE/nginx-underworld.conf.template" > "$NGINX_OUT"

echo "== validating + reloading nginx =="
nginx -t && systemctl reload nginx

echo "== health-check both streams =="
for pair in "1:$HTTP1" "2:$HTTP2"; do
  n="${pair%%:*}"; p="${pair##*:}"
  code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "http://$VAST_HOST:$p/" || echo 000)
  echo "  stream$n ($VAST_HOST:$p): HTTP $code $([ "$code" = 200 ] && echo OK || echo '<-- not ready')"
done
echo "== done. play at: https://$DOMAIN/  (gpu0)  and  https://$DOMAIN/2/  (gpu1) =="
