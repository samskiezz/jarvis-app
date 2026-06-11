# Stage 3 — ENGINEERING PLAN
## Backend real endpoints: `/vitals` · `/vpn` · `/solar` · `/tasks` control

**Input:** Stage 2 spec (`.proof/backend_endpoints_stage2_spec.md`)  
**Output:** Concrete code + integration points + verification gates  
**Execution standard:** Top-tier: no prototype shortcuts, production-grade architecture, zero JS console errors, never break lifeline.

---

## 0. Executive summary

| Item | State | Work | Owner |
|---|---|---|---|
| `/vitals` (CPU/mem/disk/GPU/pm2) | ✅ LIVE in working tree | Harden GPU branch + verify no regressions | Stage 3 → hardening |
| `/tasks` pause·cancel·clear | ✅ LIVE in working tree | Audit control flow + idempotency + pm2-guards | Stage 3 → audit |
| `/vpn` (WireGuard) | ❌ Missing | NEW module: `server/services/wireguard_vpn.py` + routes | Stage 3 → build |
| `/solar` (inverter framework) | ❌ Missing | NEW module: `server/services/solar_inverter.py` + routes | Stage 3 → build |
| Fake-module hunt | ⚠️ Scoped | Enumerate all endpoints + classify → fix/flag | Stage 3 → sweep |

**Net-new code:** ~600 lines (vpn + solar modules + routes + proofs).  
**Files to create:** 3 new (2 modules + 1 test harness).  
**Files to modify:** 1 (dashboard.py — surgical inserts only, no refactor).

---

## 1. File structure & ownership

```
server/
  dashboard.py                          [MODIFY] — add /vpn + /solar GET/POST routes (~40 lines)
  services/
    wireguard_vpn.py                    [NEW] — self-managed WireGuard adapter (~280 lines)
    solar_inverter.py                   [NEW] — inverter driver registry (~250 lines)
    secrets_vault.py                    [REUSE] — no change (audit calls from new modules)
    task_daemon.py                      [REUSE] — already has pause/cancel/clear

.proof/
  backend_endpoints_proof.cjs           [NEW] — headless test harness (assertions + guards)
```

---

## 2. Concrete function signatures

### 2.1 `server/services/wireguard_vpn.py`

```python
# Public API (all return JSON-able dicts, all honest on failure; never throw to the route)

def status() -> dict:
    """
    Source of truth from `wg show all dump` (tab-delimited). Returns:
    {
      "connected": bool,              # wg installed & interface up
      "installed": bool,              # wg/wg-quick tools present
      "provisioned": bool,            # wg0 config exists
      "reason": str|None,             # "not installed", "not provisioned", "not active"
      "action": str|None,             # e.g. "enable-secure-remote-support"
      "interface": str|None,          # "wg0"
      "listen_port": int|None,        # e.g. 51820
      "public_key": str|None,         # server public key (safe to show)
      "peers": [                      # per-peer status
        {
          "name": str,                # peer friendly name (e.g. "phone", "laptop")
          "public_key": str,          # peer pub key (from config)
          "endpoint": str|None,       # remote IP:port (e.g. "203.0.113.5:57234") or None
          "allowed_ips": str,         # e.g. "10.13.13.2/32"
          "last_handshake_age_s": int|None,  # seconds since last handshake, or None
          "rx_bytes": int,            # received bytes
          "tx_bytes": int,            # transmitted bytes
          "online": bool,             # age <= 180 s (not idle)
        },
        ...
      ],
      "ts": int,                      # unix timestamp
    }
    Honest baseline (wg not installed):
    {"connected": false, "installed": false, "reason": "not provisioned",
     "action": "enable-secure-remote-support"}
    """
    pass


def provision(name: str) -> dict:
    """
    Generate per-peer keypair + add [Peer] to `/etc/wireguard/wg0.conf`.
    On first run, also generates server keys + Address/ListenPort.
    Keys stored ONLY in vault.
    
    Args:
      name: peer friendly name (e.g. "phone", "laptop")
    
    Returns:
    {
      "ok": bool,
      "peer_name": str,
      "public_key": str,              # peer public key
      "allowed_ip": str,              # e.g. "10.13.13.2/32"
      "server_public_key": str,       # server public key
      "server_endpoint": str,         # e.g. "203.0.113.1:51820" (or FQDN if resolvable)
      "listen_port": int,             # e.g. 51820
      "config_wg_quick": str,         # full [Interface]+[Peer] client config
      "qr_payload": str,              # the config string for client-side QR render
      "error": str|None,              # on failure
      "ts": int,
    }
    """
    pass


def up() -> dict:
    """
    `systemctl enable --now wg-quick@wg0`. Idempotent.
    Returns new status().
    """
    pass


def down() -> dict:
    """
    `systemctl disable --now wg-quick@wg0`. Idempotent.
    Returns new status().
    """
    pass


def install() -> dict:
    """
    `apt-get install -y wireguard-tools`. Guarded; reports apt output tail.
    Only path that mutates the host package set.
    Token-gated, audited in the route.
    
    Returns:
    {
      "ok": bool,
      "installed": bool,
      "output": str,  # apt output (last 300 chars)
      "error": str|None,
    }
    """
    pass


def revoke(name: str) -> dict:
    """
    Remove peer from config + `wg set wg0 peer <pub> remove`.
    Delete vault keys.
    
    Returns:
    {
      "ok": bool,
      "peer_name": str,
      "removed": bool,
      "error": str|None,
    }
    """
    pass
```

**Data flow for `status()`:**
1. Check if `wg` binary exists: `/usr/bin/wg`.
2. If no → return honest `{connected: false, installed: false, …}`.
3. If yes, run `wg show all dump` (tab-delimited output):
   - Parse header: `interface public_key private_key listen_port fwmark`.
   - Parse peers: `public_key preshared_key protocol_version allowed_ips endpoint latest_handshake_ns transfer_rx transfer_tx persistent_keepalive_interval endpoint_src_ip4 endpoint_src_ip6`.
   - For each peer, compute `online = (now_ns - latest_handshake_ns) / 1e9 < 180`.
4. Resolve server endpoint IP (check if wg listens on 0.0.0.0 or specific IP; fallback to hostname -I public IP).
5. Return full struct with `peers` array.

**Error handling in status():**
- `wg` binary missing → no exception, honest `{connected: false, installed: false}`.
- `wg0` not active (unit exists but `systemctl is-active` says no) → `{connected: false, provisioned: true, reason: "not active"}`.
- Any subprocess error (timeout, permission denied) → catch, return `{connected: false, error: "<reason>"}`.

---

### 2.2 `server/services/solar_inverter.py`

```python
# Registry of driver callables (each returns the normalized payload or raises Exception)

DRIVERS = {
    "enphase": callable,      # EnphaseV4Driver
    "solaredge": callable,    # SolarEdgeDriver
    "fronius": callable,      # FroniusLocalDriver
    "powerwall": callable,    # TeslaPowerwallDriver
}

# Normalized payload contract (every driver MUST produce this shape, or honest error)
SCHEMA = {
    "connected": bool,
    "vendor": str|None,         # the active driver name
    "now_w": int|None,          # current power (watts)
    "today_kwh": float|None,    # energy today
    "lifetime_kwh": float|None, # cumulative
    "battery_soc": float|None,  # state of charge (0–100 %)
    "grid_w": int|None,         # grid power (signed: negative = importing)
    "ts": int,                  # unix timestamp of last read
    "stale_age_s": int|None,    # seconds since last good sample (None if fresh)
    "source": str|None,         # driver name + endpoint + cadence for debug
    "reason": str|None,         # if not connected: "not configured" | "unreachable" | "auth failed"
}


def read() -> dict:
    """
    Resolve active driver from env/vault.
    Call it with short timeout (~5s).
    Cache result (~60s via _cached).
    On any failure or missing creds: honest {connected: false, reason: "...", ts, stale_age_s}.
    
    Returns the normalized payload above.
    """
    pass


def configure(vendor: str, **kwargs) -> dict:
    """
    NOT implemented in v1 (credentials go in vault via existing tooling).
    Future opt-in: POST /solar?action=configure&vendor=enphase&key=...&system_id=...
    """
    pass
```

**Driver implementations (within the same file):**

```python
class EnphaseV4Driver:
    """
    OAuth 2.0 Bearer + key header. Enlighten v4 only (v2 deprecated 2026-03-16).
    Reads: production/summary/telemetry endpoints.
    """
    def __init__(self, system_id: str, auth_token: str, api_key: str):
        # Credentials from vault: solar:enphase:system_id, solar:enphase:token, solar:enphase:key
        pass
    
    def read(self, timeout_s: float = 5.0) -> dict:
        # Call /api/v4/systems/{system_id}/summary + normalize
        # Returns normalized payload or raises Exception
        pass


class SolarEdgeDriver:
    """
    Simple API key. /site/{id}/overview + /currentPowerFlow.
    15-minute resolution.
    """
    def __init__(self, site_id: str, api_key: str):
        pass
    
    def read(self, timeout_s: float = 5.0) -> dict:
        pass


class FroniusLocalDriver:
    """
    Local LAN JSON, no credentials.
    /GetPowerFlowRealtimeData — best latency, zero auth.
    """
    def __init__(self, gateway_ip: str = "192.168.1.1"):
        pass
    
    def read(self, timeout_s: float = 5.0) -> dict:
        pass


class TeslaPowerwallDriver:
    """
    Local gateway API. Reports inverter brand/model + flow.
    """
    def __init__(self, gateway_ip: str = "192.168.1.1"):
        pass
    
    def read(self, timeout_s: float = 5.0) -> dict:
        pass
```

---

## 3. Dashboard.py integration (surgical inserts)

### 3.1 GET routes (in `do_GET` method, after `/healthreport` at ~line 2144)

**Insert after line 2144 (after `/healthreport`):**

```python
        elif self.path.startswith("/vpn"):
            # WireGuard VPN status — real data from `wg show all dump`, honest baseline
            # if not installed. Token-gated (safe but already required by the universe page).
            from server.services import wireguard_vpn as VPN
            self._send(json.dumps(VPN.status()).encode(), "application/json")
        elif self.path.startswith("/solar"):
            # Inverter energy data — vendor-agnostic framework (Enphase/SolarEdge/Fronius/Powerwall).
            # Returns honest not-connected until credentials exist. Token-free read (no secrets exposed).
            from server.services import solar_inverter as SI
            self._send(json.dumps(SI.read()).encode(), "application/json")
```

**Line count:** 8 lines (including the elif blocks).

---

### 3.2 POST routes (in `do_POST` method, after `/task` control at ~line 2322)

**Insert after line 2322 (after the `/task` action dispatch):**

```python
        elif self.path.startswith("/vpn"):
            # WireGuard provisioning/control — token-gated behind the existing check at :2275.
            from server.services import wireguard_vpn as VPN
            from server.services import secrets_vault as SV
            a = q.get("action", [""])[0]
            name = q.get("name", [""])[0]
            res = ({"install": lambda: VPN.install(),
                    "provision": lambda: VPN.provision(name),
                    "up": lambda: VPN.up(),
                    "down": lambda: VPN.down(),
                    "revoke": lambda: VPN.revoke(name)}
                   .get(a, lambda: {"ok": False, "error": "bad action"}))()
            # Audit every mutating action (not 'status')
            if res.get("ok") and a in ("install", "provision", "up", "down", "revoke"):
                SV._audit(self.client_address[0], f"vpn:{a}", name or "server")
            self._send(json.dumps(res).encode(), "application/json")
```

**Line count:** 17 lines.

**Subtotal insertion:** 8 + 17 = 25 lines in dashboard.py. Minimal, surgical, no refactor.

---

## 4. Data flow diagrams (ASCII)

### 4.1 `/vitals` (already live, verify)
```
┌────────────────────────────────────────────────────────────┐
│ GET /vitals (token-free read)                              │
└────────────────────┬─────────────────────────────────────┘
                     │
    ┌────────────────┴──────────────┐
    │ _vitals() snapshots _SNAP     │  (reads ~200ms-old snapshot,
    │ (non-blocking)               │   never stalls)
    │
    ├─→ _SNAP.vps (CPU/mem/disk)
    │   ├─→ _cpu_pct() [real /proc]
    │   ├─→ _vps() [real statvfs]
    │   └─→ _host_meta() [real platform]
    │
    ├─→ _SNAP.box (GPU/VRAM/reachability)
    │   └─→ _box() [real Ollama /api/ps]
    │       └─ GPU_util/temp/power = null (honest, no nvidia-smi)
    │
    ├─→ _SNAP.workers (pm2 health)
    │   └─→ _workers() [real pm2 jlist]
    │
    └─→ _SNAP.health (derived score + alerts)
        └─→ _health(m) [alerts: CPU/mem/disk/VRAM/pm2 thresholds]

Response (JSON):
{
  "ok": true,
  "connected": true,
  "ts": <unix>,
  "score": 87,
  "level": "ok|warn|critical",
  "summary": "All systems nominal",
  "alerts": [...],
  "system": {...cpu_pct, mem_used_gb, disk_used_gb...},
  "brain": {...vram_used_gb, gpu_util: null...},
  "services": {
    "list": [{name, label, status:"online"|"stopped", cpu, mem_mb, restarts, up_min}, ...],
    "up": 6,
    "total": 7
  },
  "budget": {...},
  "uptime_min": 1234,
  "version": {...}
}
```

**Verification gates for /vitals:**
- [ ] JSON response (not HTML), `Content-Type: application/json`.
- [ ] `ok: true`, `connected: true`, `ts` is a valid unix timestamp.
- [ ] `system.cpu_pct` is numeric (0–100).
- [ ] `brain.gpu_util` is **null** (not fabricated).
- [ ] `services.list` has at least 7 entries (the JARVIS daemons).
- [ ] The 3 lifeline daemons (`jarvis-dashboard`, `jarvis-tasks`, `jarvis-voiceclone`) are in the list with `status: "online"`.
- [ ] No JS console errors when universe loads `/vitals`.

---

### 4.2 `/vpn` (new)
```
┌──────────────────────────────────────────┐
│ GET /vpn (status, token-gated)           │
└──────────┬───────────────────────────────┘
           │
           ├─→ wireguard_vpn.status()
           │   ├─→ Check `which wg` (binary exists?)
           │   ├─→ If no → return {connected:false, installed:false, reason:"...", action:"enable-secure-remote-support"}
           │   ├─→ If yes → run `wg show all dump` (tab-delimited)
           │   │   ├─→ Parse server: interface, listen_port, public_key
           │   │   ├─→ Parse peers: [name, endpoint, allowed_ips, last_handshake_age_s, rx/tx, online]
           │   │   └─→ Resolve server endpoint IP (public IP from `hostname -I`)
           │   └─→ Return {connected:true, peers:[...]}
           │
           └─→ JSON response

POST /vpn?action=install|provision|up|down|revoke&name=<peer>&token=<CTOKEN>
(token-gated behind :2275 check)
           │
           ├─→ action="install" → wireguard_vpn.install()
           │   ├─→ `apt-get install -y wireguard-tools`
           │   └─→ Audit: secrets_vault._audit(src, "vpn:install", "server")
           │
           ├─→ action="provision" → wireguard_vpn.provision(name)
           │   ├─→ Generate peer keypair (first run: also server keys)
           │   ├─→ Write /etc/wireguard/wg0.conf (Address=10.13.13.1/24, ListenPort=51820)
           │   ├─→ Add [Peer] with allowed_ips=10.13.13.<id>/32 (single IP, zero-trust)
           │   ├─→ Store keys in vault: wg:server:priv, wg:peer:<name>:priv (never echo)
           │   ├─→ Return config_text + qr_payload (for client-side QR render)
           │   └─→ Audit: secrets_vault._audit(src, "vpn:provision", name)
           │
           ├─→ action="up" → wireguard_vpn.up()
           │   ├─→ `systemctl enable --now wg-quick@wg0`
           │   └─→ Return new status()
           │
           ├─→ action="down" → wireguard_vpn.down()
           │   ├─→ `systemctl disable --now wg-quick@wg0`
           │   └─→ Return new status()
           │
           └─→ action="revoke" → wireguard_vpn.revoke(name)
               ├─→ Remove [Peer] from /etc/wireguard/wg0.conf
               ├─→ `wg set wg0 peer <pub> remove`
               ├─→ Delete vault keys
               └─→ Audit: secrets_vault._audit(src, "vpn:revoke", name)
```

---

### 4.3 `/solar` (new)
```
┌──────────────────────────────────────────┐
│ GET /solar (read, token-free)            │
└──────────┬───────────────────────────────┘
           │
           ├─→ solar_inverter.read()
           │   ├─→ Resolve active vendor from env: SOLAR_VENDOR → "enphase"|"solaredge"|"fronius"|"powerwall"
           │   ├─→ If no vendor → return {connected:false, reason:"not configured", ts, ...}
           │   │
           │   ├─→ If vendor="enphase" → EnphaseV4Driver.read()
           │   │   ├─→ Get system_id, token, api_key from vault: solar:enphase:*
           │   │   ├─→ GET /api/v4/systems/{id}/summary (Bearer + key header)
           │   │   └─→ Normalize: {connected, now_w, today_kwh, lifetime_kwh, battery_soc, grid_w, ts, source}
           │   │
           │   ├─→ If vendor="solaredge" → SolarEdgeDriver.read()
           │   │   ├─→ GET /site/{id}/overview + /currentPowerFlow (API-key query param)
           │   │   └─→ Normalize
           │   │
           │   ├─→ If vendor="fronius" → FroniusLocalDriver.read()
           │   │   ├─→ GET http://192.168.1.1:80/solar_api/v1/GetPowerFlowRealtimeData.fcgi (no auth)
           │   │   └─→ Normalize
           │   │
           │   └─→ If vendor="powerwall" → TeslaPowerwallDriver.read()
           │       ├─→ GET https://192.168.1.1/api/site_info/status (local gateway, self-signed)
           │       └─→ Normalize
           │
           ├─→ Timeout: 5s per driver call. Cached: ~60s (via _cached).
           │
           └─→ Any error or missing creds → {connected:false, vendor:<active>, reason:"unreachable"|"auth_failed", ts, stale_age_s}

Response (JSON):
{
  "connected": false,
  "vendor": null,
  "now_w": null,
  "today_kwh": null,
  "lifetime_kwh": null,
  "battery_soc": null,
  "grid_w": null,
  "ts": <unix>,
  "stale_age_s": null,
  "source": null,
  "reason": "not configured"
}
```

---

## 5. Edge cases & failure modes

### 5.1 `/vitals`
- **Snapshot warming up:** First 2s after dashboard restart, `_SNAP.loading=true` → returns `{ok:false, connected:false, reason:"warming up"}` (honest, no invented numbers).
- **Ollama unreachable:** `_box()` catches timeout, returns `{reachable:false, models:[], vram_used_gb:0}` — no exception bubbles.
- **GPU metrics unavailable:** No nvidia-smi on this box → `gpu_util`, `gpu_temp`, `power_w` are **always null** (never faked). Clearly documented in the response.
- **pm2 broken:** `pm2 jlist` timeout/error → empty workers list, service counts reflect reality.

### 5.2 `/vpn`
- **wg binary missing:** `status()` returns honest baseline; `install()` is the only path to add it (audited, token-gated).
- **wg0 config doesn't exist:** `status()` returns `{connected:false, provisioned:false}` (not "not installed", so user knows the tools are there but unconfigured).
- **Multiple peers with same name:** `provision(name)` overwrites the peer; `revoke(name)` removes it. Simple, idempotent.
- **systemctl not available (container):** `up()`/`down()` catch the error, return `{ok:false, error:"..."}` — honest.
- **Keypair generation fails:** `provision()` catches, returns `{ok:false, error:"keygen failed"}`.
- **QR payload too large:** The config string may be 500+ chars. Client-side QR render must handle it (use a compact QR lib or offer a text copy fallback).

### 5.3 `/solar`
- **No credentials in vault:** `read()` returns `{connected:false, reason:"not configured"}` instantly (no network call).
- **Driver timeout:** Catch `socket.timeout` (5s) → return `{connected:false, reason:"unreachable", stale_age_s:<age since last good sample>}`.
- **Auth token expired (Enphase):** OAuth token-refresh logic in the driver catches `401` → try refresh from vault; if refresh fails → `{connected:false, reason:"auth_failed"}`.
- **Local gateway (Fronius/Powerwall) on offline network:** Timeout → `{connected:false, reason:"unreachable"}` (no fake fallback).
- **API version mismatch:** Enphase v4 endpoint signature change → driver catches JSON parsing error, returns `{connected:false, reason:"api_mismatch"}`.

### 5.4 `/tasks` control (verify existing impl)
- **Signal already-done task:** If task already finished/cancelled, `pause()`/`cancel()` is a no-op, returns `{ok:true, already_<state>:true}`.
- **Clear with mixed states:** `clear_finished()` deletes only `status in ('done', 'failed', 'cancelled')`, leaves running/paused untouched.
- **Pause a paused task:** No-op; signal `SIGSTOP` to a process in state `T` is idempotent.
- **Resume a finished task:** No-op; can't send `SIGCONT` to a dead pid, so we check task status first.
- **Never signal pm2 pid:** The `tasks` table only contains spawned task pids, never pm2 daemon pids (pm2 owns them). Invariant: `task.parent_pid != pm2_pid`.

---

## 6. Accessibility & UX

### 6.1 `/vitals`
- **Screen reader:** Gauges are numeric (cpu_pct, mem_pct); alerts are plain text ("All systems nominal" or "5 warnings"). The universe app is responsible for a11y labelling (ARIA).
- **Mobile:** The payload is just JSON; the universe page handles responsive cards.

### 6.2 `/vpn`
- **QR code:** Client-side render using a vendored QR lib (e.g., qr.js from [cdnjs](https://cdnjs.com/libraries/qr.js), no server dep). Fallback: display raw config text in a monospace box with copy button.
- **Blind user:** The wg-quick config is plain text; read-aloud captures the peer lines and endpoint (sufficient for manual entry into the WireGuard app).
- **Confirmation on mutating actions:** (e.g., "Revoke peer 'phone'?") — the UI's responsibility; the endpoint assumes the user confirmed.

### 6.3 `/solar`
- **Not-connected state:** Card shows "Solar — not connected" with a list of available drivers (Enphase, SolarEdge, Fronius, Powerwall) so the user knows to configure one.
- **Stale data:** If `stale_age_s > 300` (5 min), the UI shows "Data may be out of date (5+ min old)" as a subtle hint.

### 6.4 `/tasks` control
- **Pause/resume/cancel buttons are disabled** when the task is in a terminal state (done/failed/cancelled).
- **Clear button is greyed out** when no finished tasks exist.

---

## 7. Lifeline guardrails (never break the box)

### 7.1 pm2 safety
- **No pm2 signals from task control:** The `/task` pause/cancel/resume/clear actions only ever signal child pids, never pm2 daemon pids. Verify before signalling (check `/proc/<pid>/stat` to confirm it's a real process, not a zombie or pm2 itself).
- **Proof:** Task row's `parent_pid` from the `tasks` table is never set to a pm2 daemon name. Root of all task pids is always `task_daemon.py` (spawn context).

### 7.2 /vpn safety
- **No inbound port opening beyond wg:** The `/vpn up` action does NOT modify iptables INPUT rules. It only adds the `PostUp`/`PostDown` scripts to the wg0 interface config, which manage the wg subnet traffic only. No `0.0.0.0/0` routes pushed; no SSH/API forwarding.
- **Key storage:** Private keys are in the vault (encrypted + audited reads only), never in the config file or echoed to logs.
- **systemctl commands:** `systemctl enable/disable` touch only `wg-quick@wg0`, not any JARVIS daemon.

### 7.3 /solar safety
- **No modifications to the host:** `read()` is purely read-only; no credential setup from the endpoint in v1 (future POST /solar?action=configure will be audited then too).
- **Timeout discipline:** Every driver call has a 5s socket timeout. If a hung local gateway blocks the call, the endpoint returns quickly (timeout → honest not-connected) and the main thread isn't starved.

---

## 8. Fake-module hunting strategy

### 8.1 Methodology
1. **Enumerate all `do_GET` branches** (dashboard.py `:1893`–`:2161`) → list the target function.
2. **Enumerate all `do_POST` branches** (`:2162`–`:2356`) → list the target.
3. **Classify each** as:
   - **REAL:** measured live data (e.g., /vitals, /metrics) or from a DB (e.g., /search, /children).
   - **MODEL:** honest simulation (e.g., /suggestions, /proposal — LLM predictions).
   - **NOT-CONNECTED:** explicit flag (e.g., /solar before credentials, /vpn before install).
   - **FAKE:** fabricated numbers or HTML fallthrough (e.g., old /vitals before this fix).
4. **Fix** FAKEs: convert to REAL (find the source) or NOT-CONNECTED (explicit flag) — never delete, never leave as-is.
5. **Cross-check universe pages** (jarvis_live.html, jarvis_voice.html, guardian.html, care.html, dashboard.html) for any `fetch()` whose endpoint 404s (indicating the endpoint was never wired).

### 8.2 Preliminary enumeration (Stage 2 finding: mostly clean)

| Endpoint | Function | Source | Status |
|---|---|---|---|
| `/metrics` | `_SNAP` (raw snapshot) | Real `_refresher` background thread | ✅ REAL |
| `/detail` | `_detail(kind, name)` | Brain.db query + label resolve | ✅ REAL |
| `/children` | `_children(id, kind, …)` | Brain.db ontology traversal | ✅ REAL |
| `/graphdata` | `_graph_data()` | Brain.db edge-first subgraph | ✅ REAL |
| `/search` | `_search_ontology(q, limit)` | Brain.db full-text search | ✅ REAL |
| `/graph` | Serve dashboard_graph.html | Static file | ✅ REAL |
| `/files` | List *.py files in services/ | Filesystem scan | ✅ REAL |
| `/tasks/poll` | `TD.tasks_poll(since)` | task_daemon.py live stream | ✅ REAL |
| `/tasks` | `TD.list_tasks()` | task_daemon.py sqlite | ✅ REAL |
| `/task/artifacts` | `TD.task_artifacts(tid)` | task_daemon.py sqlite | ✅ REAL |
| `/swarms/detail` | `TD.swarms_detail(since)` | task_daemon.py live stream | ✅ REAL |
| `/swarms` | `TD.swarm_list()` | task_daemon.py sqlite | ✅ REAL |
| `/swarm/artifacts` | `TD.swarm_artifacts(sid)` | task_daemon.py sqlite | ✅ REAL |
| `/swarm` | `TD.swarm_get(sid)` | task_daemon.py sqlite | ✅ REAL |
| `/library` | `MG.library()` | media_gen.py cache | ✅ REAL |
| `/tts` | `_tts(text, semitones, tempo)` | TTS generation + synthesis | ✅ REAL |
| `/suggestions` | `_suggestions(force)` | _SUGGEST cache (seeded + LLM bg) | ✅ MODEL |
| `/proposal` | `_proposal(sid)` | _SUGGEST lookup | ✅ MODEL |
| `/agent/tools` | `_agent_tools()` | server.agent registry | ✅ REAL |
| `/budget` | `TG.state()` | token_governor.py state | ✅ REAL |
| `/file` | Read file by path (sandboxed) | Filesystem read | ✅ REAL |
| `/rtc/poll` | `CS.poll(room, role, since)` | care_signal.py WebRTC relay | ✅ REAL |
| `/carerooms` | `CS.rooms()` | care_signal.py registry | ✅ REAL |
| `/talk` | Serve jarvis_voice.html | Static file | ✅ REAL |
| `/care` | Serve care.html | Static file | ✅ REAL |
| `/guardian` | Serve guardian.html | Static file | ✅ REAL |
| `/taskresult` | `TD.result(tid)` | task_daemon.py sqlite | ✅ REAL |
| `/a11y/…` | Serve a11y assets (CSS/JS) | Static allowlisted files | ✅ REAL |
| `/a11y` (GET) | `_a11y_read()` | a11y_state.json read | ✅ REAL |
| `/a11y` (POST) | `_a11y_write(state, source)` | a11y_state.json write | ✅ REAL |
| `/asset/…` | Serve GLB/PNG from jarvis_assets/ | Static file | ✅ REAL |
| `/assetlist` | List GLB/PNG | Filesystem scan | ✅ REAL |
| `/media/…` | Serve GLB (with fallback to real glb dir) | Static file (real 3D assets) | ✅ REAL |
| `/climate/poll` | `CR.poll()` | climate_relay.py outbound queue | ✅ REAL |
| `/climate/state` | `CR.state()` | climate_relay.py cached state | ✅ REAL |
| `/climate/report` | `CR.report(body)` | climate_relay.py inbound sync | ✅ REAL |
| `/climate/cmd` | `CR.enqueue(body)` or NL parse | climate_relay.py + _climate_handle | ✅ REAL |
| `/vitals` | `_vitals()` | Real measurements | ✅ REAL |
| `/healthreport` | Health score + alerts | _health(m) derived | ✅ REAL |
| `/godrays` | `_godrays_selfcheck()` | Static check + cached headless proof | ✅ REAL |
| `/health` | `{"ok": true}` | Liveness probe | ✅ REAL |
| `/` (GET) | Serve jarvis_live.html (cinematic) | Static file | ✅ REAL |
| `/control_all` | `_control_all(action)` | pm2 bulk action | ✅ REAL |
| `/control` | `_control(action, name)` | pm2 single action | ✅ REAL |
| `/ask` | `TD.ask_claude(q)` | task_daemon.py spawn | ✅ REAL |
| `/task` (POST) | `TD.create/genimage/gen3d/cancel/pause/resume/clear` | task_daemon.py actions | ✅ REAL |
| `/task/review` | `TD.record_review(…)` | task_daemon.py approval store | ✅ REAL |
| `/swarm` (POST) | `TD.swarm_build(q)` / `TD.swarm_cancel(sid)` | task_daemon.py swarm actions | ✅ REAL |
| `/agent/run` | `_agent_run(cmd)` | server.agent.CORE execution | ✅ REAL |
| `/upgrade` | `TD.run_upgrade(key, brief)` | task_daemon.py self-dev flow | ✅ REAL |

**Conclusion:** All listed endpoints are either REAL (measured/live) or honest MODEL (simulations labelled as such). **No FAKEs found in the enumeration.** The only historical fake was `/vitals` HTML fallthrough (already fixed in this task).

---

## 9. Test / proof plan (headless, `.proof/backend_endpoints_proof.cjs`)

**Non-mutating checks (safe to run always):**
```javascript
// 1. /vitals
assert(res.json().ok === true, "vitals must return ok:true")
assert(res.json().connected === true, "vitals must return connected:true")
assert(typeof res.json().system.cpu_pct === "number", "cpu_pct must be numeric")
assert(res.json().brain.gpu_util === null, "gpu_util must be null (no nvidia-smi)")
assert(Array.isArray(res.json().services.list), "services.list must be array")
assert(res.json().services.list.length >= 7, "must have at least 7 JARVIS daemons")
const lifelines = ["jarvis-dashboard", "jarvis-tasks", "jarvis-voiceclone"]
lifelines.forEach(name => {
  const svc = res.json().services.list.find(s => s.name === name)
  assert(svc && svc.status === "online", `${name} must be online`)
})
assert(res.headers["content-type"] === "application/json", "must be JSON, not HTML")

// 2. /vpn (without wg installed)
assert(res.json().connected === false, "vpn must be false without wg")
assert(res.json().installed === false, "vpn.installed must be false")
assert(res.json().action === "enable-secure-remote-support", "action must be clear")

// 3. /solar (without credentials)
assert(res.json().connected === false, "solar must be false without config")
assert(res.json().reason === "not configured", "reason must be explicit")
assert(res.json().now_w === null, "now_w must be null, not 0 or fake")
assert(Array.isArray(res.json().drivers || []), "drivers must be enumerated")
assert(res.json().drivers.length === 4, "must list 4 drivers")

// 4. /tasks (without running tasks)
assert(Array.isArray(res.json()), "tasks must return array")
// (no assertion on status without running task; just check it's valid JSON)

// 5. Lifeline guard (pm2 still running)
pm2_jlist = exec("pm2 jlist")
lifelines.forEach(name => {
  assert(pm2_jlist.includes(`"name":"${name}"`), `pm2 must still show ${name}`)
})

// 6. Universe page loads (smoke test)
assert(!fetch("/talk").text().includes("<h1>template"), "jarvis_voice.html must exist")
assert(!fetch("/").text().includes("<h1>template"), "jarvis_live.html must exist")
```

**Mutating checks (only with `--mutate` flag):**
```javascript
// Skipped in normal runs; only run if explicitly requested
// (Would test install/provision/up/down, but not in CI)
```

---

## 10. Implementation checklist (STAGE 3 BUILD)

### 10.1 New files to write
- [ ] **`server/services/wireguard_vpn.py`** (280 lines)
  - [ ] Import: subprocess, json, os, time, stat, secrets
  - [ ] Helper: `_run(cmd, timeout=10)` — subprocess.run with error handling
  - [ ] Helper: `_bin_exists(name)` — `which <name>`
  - [ ] Helper: `_read_vault(key)` — `secrets_vault.get_secret(key)`
  - [ ] Helper: `_write_vault(key, value)` — `secrets_vault.put_secret(key, value, owner="vpn")`
  - [ ] `status() -> dict` — parse `wg show all dump`
  - [ ] `provision(name) -> dict` — keygen + write config + return wg-quick text
  - [ ] `up() -> dict` — systemctl enable
  - [ ] `down() -> dict` — systemctl disable
  - [ ] `install() -> dict` — apt-get install
  - [ ] `revoke(name) -> dict` — remove peer

- [ ] **`server/services/solar_inverter.py`** (250 lines)
  - [ ] Import: urllib.request, json, time, os
  - [ ] `DRIVERS = {…}` registry
  - [ ] `SCHEMA` docstring (normalized contract)
  - [ ] Base `Driver` class (timeout + error handling)
  - [ ] `EnphaseV4Driver` class (OAuth + key header)
  - [ ] `SolarEdgeDriver` class (API key)
  - [ ] `FroniusLocalDriver` class (no auth)
  - [ ] `TeslaPowerwallDriver` class (local gateway)
  - [ ] `read() -> dict` — resolve vendor + call driver + normalize

- [ ] **`.proof/backend_endpoints_proof.cjs`** (150 lines, Node.js)
  - [ ] Import: http module, assert
  - [ ] Helper: `fetch(path)` — http.get + JSON parse
  - [ ] Test: `/vitals` response shape + lifeline guard
  - [ ] Test: `/vpn` honest baseline
  - [ ] Test: `/solar` honest not-connected
  - [ ] Test: `/tasks` valid JSON array
  - [ ] Test: pm2 lifelines still running
  - [ ] Test: universe pages load (no template error)

### 10.2 Modify dashboard.py
- [ ] **Line ~2144 (after `/healthreport`):** Insert 8 lines for GET `/vpn` + `/solar`
- [ ] **Line ~2322 (after `/task` POST dispatch):** Insert 17 lines for POST `/vpn` with action dispatch
- [ ] **Verify:** No refactor of `_SNAP` or `_refresher`; surgical inserts only.

### 10.3 Verify existing code (no changes)
- [ ] `/vitals` — confirm GPU branch returns null (no fabrication)
- [ ] `/tasks` GET/POST — confirm pause/cancel/clear wired + audit calls
- [ ] `secrets_vault` — confirm `_audit()` signature; audit each mutating action from vpn module

### 10.4 Testing & proof
- [ ] Run `.proof/backend_endpoints_proof.cjs` — all assertions pass
- [ ] Manual: `curl http://127.0.0.1:8095/vitals` — JSON, not HTML, gpu_util:null
- [ ] Manual: `curl http://127.0.0.1:8095/vpn` — {connected:false, installed:false, action:"…"}
- [ ] Manual: `curl http://127.0.0.1:8095/solar` — {connected:false, reason:"not configured"}
- [ ] Manual: Load /talk + /care + / in a browser → zero JS console errors
- [ ] Manual: pm2 list → jarvis-dashboard, jarvis-tasks, jarvis-voiceclone all online

---

## 11. Risk checklist & mitigation

| Risk | Mitigation |
|---|---|
| `/vpn up/down` breaks pm2 daemon | systemctl touches only wg-quick@wg0; never calls pm2. Proof: run `systemctl status wg-quick@wg0` after, confirm unrelated to pm2. |
| Task control signals wrong pid | Never store pm2 pid in tasks table (invariant: parent is task_daemon). Before signalling, verify pid exists + is a task child (check `/proc/<pid>/ppid`). |
| /solar blocks main thread | 5s socket timeout per driver; cached ~60s. If frozen, timeout fires, endpoint returns quickly. |
| QR payload too large | Client-side render (qr.js from CDN) handles up to 4K chars. Fallback: monospace text box + copy button. |
| WireGuard keys exposed | Keys ONLY in vault (encrypted at rest). status() never returns private keys. Audit log on every read/write. |
| Fake module sneaks past hunt | Stage 3 enumeration is exhaustive (all do_GET/do_POST paths listed). Stage 9 proof re-runs all endpoints + cross-checks universe pages. |

---

## 12. Definition of done (Stage 9 gate)

- [ ] `/vitals` returns JSON (never HTML), `gpu_util:null`, 3 lifelines online, no JS errors.
- [ ] `/vpn` status() works; install/provision/up/down/revoke are token-gated + audited; QR payload client-side.
- [ ] `/solar` read() works; 4 drivers registered; no credentials → honest not-connected.
- [ ] `/tasks` pause/cancel/clear verified (process state + DB); never touches pm2.
- [ ] Fake-module hunt table appended (all endpoints classified + cleaned).
- [ ] `.proof/backend_endpoints_proof.cjs` passes (all assertions green).
- [ ] pm2 lifelines untouched (jarvis-dashboard, jarvis-tasks, jarvis-voiceclone all online after all tests).
- [ ] Universe pages load + render VPN/Solar cards without JS errors.

---

## 13. Build order (dependency graph)

1. **Write `wireguard_vpn.py`** (standalone, no deps except subprocess + vault).
2. **Write `solar_inverter.py`** (standalone, no deps except urllib + vault).
3. **Modify `dashboard.py`** (add GET/POST routes for both; import new modules).
4. **Write `.proof/backend_endpoints_proof.cjs`** (test all 3 new endpoints + existing /vitals + guards).
5. **Manual verification** (curl + browser + pm2 check).
6. **Stage 9 gate** (headless proof + cross-check universe pages).

---

**Next:** Stage 3 BUILD begins. Start with wireguard_vpn.py (the simpler module, no network).
