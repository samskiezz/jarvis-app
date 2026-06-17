#!/usr/bin/env bash
# signalling-compat-patch.sh — compatibility shims for Epic's Pixel Streaming
# SignallingWebServer 2.x when paired with an older UE plugin (e.g. UE 5.4/5.5
# builds that do not yet speak the 1.3 protocol messages).
#
# Without this patch the streamer logs "Unsupported message ..." for
# endpointIdConfirm/layerPreference and, more importantly, can SIGSEGV inside
# webrtc::PeerConnection AddIceCandidate when a duplicate subscribe produces a
# second offer while the peer connection is already stable.
#
# Apply after every `npm ci` in PixelStreamingInfrastructure because npm install
# rewrites the CJS dist files.
set -euo pipefail

PSI_DIR="${1:-/workspace/PixelStreamingInfrastructure}"
if [[ ! -d "${PSI_DIR}/Signalling/dist/cjs" ]]; then
  echo "WARN: Signalling CJS dist not found at ${PSI_DIR}/Signalling/dist/cjs; skipping patch." >&2
  exit 0
fi

PLAYER="${PSI_DIR}/Signalling/dist/cjs/PlayerConnection.js"
REG="${PSI_DIR}/Signalling/dist/cjs/StreamerRegistry.js"
WEBSERVER="${PSI_DIR}/SignallingWebServer/dist/index.js"
WEBSERVER_CJS="${PSI_DIR}/Signalling/dist/cjs/WebServer.js"

python3 - "$PLAYER" "$REG" "$WEBSERVER" "$WEBSERVER_CJS" <<'PY'
import sys
player_path, reg_path, webserver_path, webserver_cjs_path = sys.argv[1:5]

# 1) Stop forwarding layerPreference to the streamer (older UE plugins don't support it).
with open(player_path) as f:
    p = f.read()
if "// PATCH: layerPreference forward removed" not in p:
    line = "        this.protocol.on(lib_pixelstreamingcommon_ue5_5_1.Messages.layerPreference.typeName, this.sendToStreamer.bind(this));\n"
    if line in p:
        p = p.replace(line, "        // PATCH: layerPreference forward removed\n")
        print("[signalling-compat-patch] removed layerPreference forward")
        with open(player_path, "w") as f:
            f.write(p)

# 2) Ignore duplicate subscribe requests for the same streamer to avoid duplicate offers.
with open(player_path) as f:
    p = f.read()
if "// PATCH: duplicate-subscribe guard" not in p:
    old = """        if (this.subscribedStreamer) {
            Logger_1.Logger.warn(`subscribe: Player ${this.playerId} is resubscribing to a streamer but is already subscribed to ${this.subscribedStreamer.streamerId}`);
            this.unsubscribe();
        }"""
    if old in p:
        guard = """        // PATCH: duplicate-subscribe guard
        if (this.subscribedStreamer && this.subscribedStreamer.streamerId === streamerId) {
            Logger_1.Logger.warn(`subscribe: Player ${this.playerId} already subscribed to ${streamerId}; ignoring duplicate subscribe.`);
            return;
        }
"""
        p = p.replace(old, guard + old, 1)
        print("[signalling-compat-patch] added duplicate-subscribe guard")
        with open(player_path, "w") as f:
            f.write(p)

# 3) Do not send endpointIdConfirm to the streamer (older UE plugins don't support it).
with open(reg_path) as f:
    r = f.read()
if "// PATCH: endpointIdConfirm disabled" not in r:
    old = "        streamer.sendMessage(lib_pixelstreamingcommon_ue5_5_1.MessageHelpers.createMessage(lib_pixelstreamingcommon_ue5_5_1.Messages.endpointIdConfirm, { committedId: streamer.streamerId }));"
    if old in r:
        r = r.replace(old, "        // PATCH: endpointIdConfirm disabled\n        // streamer.sendMessage(...endpointIdConfirm...)", 1)
        print("[signalling-compat-patch] disabled endpointIdConfirm send")
        with open(reg_path, "w") as f:
            f.write(r)

# 4) Parse peer_options JSON string into an object before sending it to older UE plugins.
#    SS 2.x stores it as a string but the UE plugin expects an object in the config message.
server_path = reg_path.replace("StreamerRegistry.js", "SignallingServer.js")
with open(server_path) as f:
    s = f.read()
if "// PATCH: parse peer_options string" not in s:
    old = "peerConnectionOptions: this.config.peerOptions || {}"
    if old in s:
        new = """peerConnectionOptions: (typeof this.config.peerOptions === 'string' && this.config.peerOptions
                ? JSON.parse(this.config.peerOptions)
                : this.config.peerOptions) || {} // PATCH: parse peer_options string"""
        s = s.replace(old, new, 1)
        print("[signalling-compat-patch] parse peer_options string into object")
        with open(server_path, "w") as f:
            f.write(s)

# 5) Trust reverse proxies (Hostinger nginx/Caddy) with a function that normalizes
#    addresses that include a trailing port (e.g. 127.0.0.1:54720). This keeps
#    request.ip clean and prevents express-rate-limit from rejecting proxied players.
with open(webserver_path) as f:
    s = f.read()
if "// PATCH: trust reverse proxies" not in s:
    old = "const app = (0, express_1.default)();"
    if old in s:
        new = old + """
app.set('trust proxy', function(ip) {
    // PATCH: trust reverse proxies
    // Caddy/SSH tunnels may append 127.0.0.1:<port> to X-Forwarded-For.
    // Strip zone/port and trust loopback/private/local ranges only.
    const clean = ip.split('%')[0].replace(/:\\d+$/, '');
    if (clean === '127.0.0.1' || clean === '::1') return true;
    if (/^10\\./.test(clean)) return true;
    if (/^192\\.168\\./.test(clean)) return true;
    if (/^172\\.(1[6-9]|2\\d|3[01])\\./.test(clean)) return true;
    if (/^fe[89ab][0-9a-f]:/i.test(clean)) return true;
    if (/^fc[0-9a-f]{2}:/i.test(clean) || /^fd[0-9a-f]{2}:/i.test(clean)) return true;
    return false;
});
"""
        s = s.replace(old, new, 1)
        print("[signalling-compat-patch] enabled Express trust proxy function")
        with open(webserver_path, "w") as f:
            f.write(s)
elif 'app.set("trust proxy", true)' in s or "app.set('trust proxy', true)" in s:
    # Upgrade an older permissive true setting to the normalizing function.
    old = 'app.set("trust proxy", true); // PATCH: trust reverse proxies'
    new = """app.set('trust proxy', function(ip) {
    // PATCH: trust reverse proxies
    const clean = ip.split('%')[0].replace(/:\\d+$/, '');
    if (clean === '127.0.0.1' || clean === '::1') return true;
    if (/^10\\./.test(clean)) return true;
    if (/^192\\.168\\./.test(clean)) return true;
    if (/^172\\.(1[6-9]|2\\d|3[01])\\./.test(clean)) return true;
    if (/^fe[89ab][0-9a-f]:/i.test(clean)) return true;
    if (/^fc[0-9a-f]{2}:/i.test(clean) || /^fd[0-9a-f]{2}:/i.test(clean)) return true;
    return false;
});
"""
    if old in s:
        s = s.replace(old, new, 1)
    else:
        s = s.replace("app.set('trust proxy', true); // PATCH: trust reverse proxies", new, 1)
    print("[signalling-compat-patch] upgraded trust proxy to normalizing function")
    with open(webserver_path, "w") as f:
        f.write(s)

# 6) Harden express-rate-limit against proxy addresses that include ports.
#    Provide a keyGenerator that strips trailing ports/zone info and disable the
#    strict validations that crash on 127.0.0.1:<port> style request.ip values.
with open(webserver_cjs_path) as f:
    s = f.read()
if "// PATCH: rate-limit proxy fixes" not in s:
    old = """const limiter = (0, express_rate_limit_1.default)({
            windowMs: 60 * 1000, // 1 minute
            max: config.perMinuteRateLimit ? config.perMinuteRateLimit : 3000
        });"""
    if old in s:
        new = """const limiter = (0, express_rate_limit_1.default)({
            windowMs: 60 * 1000, // 1 minute
            max: config.perMinuteRateLimit ? config.perMinuteRateLimit : 3000,
            keyGenerator: function(req, res) {
                // PATCH: rate-limit proxy fixes
                // X-Forwarded-For can carry ports (127.0.0.1:54720); normalize.
                const raw = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
                return raw.split('%')[0].replace(/:\\d+$/, '');
            },
            validate: false  // PATCH: disable express-rate-limit validations that choke on proxy IPv6
        });"""
        s = s.replace(old, new, 1)
        print("[signalling-compat-patch] added rate-limit proxy keyGenerator/validate")
        with open(webserver_cjs_path, "w") as f:
            f.write(s)

# 7) Make the bundled player default to the proxied path for its WebSocket.
#    Epic's player.js uses only hostname+port, so path-proxied deployments
#    (e.g. /jarvis/UnderworldUE5/) try to open wss://host/ and get disconnected.
#    Use window.location.host + pathname so the WS goes through the same path.
player_js_path = webserver_path.replace("dist/index.js", "www/player.js")
with open(player_js_path) as f:
    s = f.read()
if "// PATCH: proxied path signalling URL" not in s:
    old = """            : (location.protocol === 'https:' ? 'wss://' : 'ws://') +
                window.location.hostname +
                // for readability, we omit the port if it's 80
                (window.location.port === '80' || window.location.port === ''
                    ? ''
                    : `:${window.location.port}`), useUrlParams));"""
    new = """            : (location.protocol === 'https:' ? 'wss://' : 'ws://') +
                window.location.host +
                window.location.pathname +
                // PATCH: proxied path signalling URL
                '', useUrlParams)); // PATCH: proxied path signalling URL"""
    if old in s:
        s = s.replace(old, new, 1)
        print("[signalling-compat-patch] fixed player default signalling URL to include path")
        with open(player_js_path, "w") as f:
            f.write(s)
PY
