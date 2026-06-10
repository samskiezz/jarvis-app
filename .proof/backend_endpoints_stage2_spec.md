# Stage 2 — DESIGN / SPEC DRAFT
## Backend real endpoints: `/vitals` · `/vpn` · `/solar` · `/tasks` control + fake-module hunt
### `server/dashboard.py` + `server/services/*`

> Reference doc for the Stage 9 final comparison. First-draft spec of **exactly what to
> build and where**, grounded in the real substrate read in Stage 1 + re-verified here
> (line anchors from the working tree at time of writing — re-grep before editing; the
> dashboard.py changes are **uncommitted working-tree**, HEAD is `b371ce52`).

---

## 0. One-line goal

Every backend module the universe/dashboard surfaces returns **genuinely measured data or an
explicit `not-connected`** — never HTML-fallthrough, never fabricated. Specifically: finalize
real `/vitals` (CPU/mem/disk/GPU/pm2), ship real `/vpn` (self-managed WireGuard, zero-trust,
honest baseline since `wg` isn't installed), ship real `/solar` (vendor-agnostic inverter
adapter framework, honest not-connected), confirm/harden `/tasks` pause·cancel·clear, and
sweep the remaining endpoints for any fake/stub module. Never risk the pm2 lifeline
(`jarvis-dashboard` / `jarvis-voiceclone` / `jarvis-tasks`); never leave a JS error.

---

## 1. CURRENT-STATE TRUTH TABLE (re-verified this stage — do **not** rebuild what's real)

| Target | State | Evidence | What remains |
|---|---|---|---|
| `/vitals` | ✅ **REAL** (working tree, uncommitted) | `_vitals()` `dashboard.py:692`; route `:1906` (`json.dumps(_vitals())`). HEAD has neither → it's new in the working tree. | Harden GPU branch + add light verification; **do not regress**. |
| `/tasks` pause·cancel·resume·clear | ✅ **REAL** (working tree) | POST `/task?action=…` `:2050-2061` → `task_daemon.cancel(:200, SIGTERM+killpg)`, `pause(:254, SIGSTOP)`, `resume(:261, SIGCONT)`, `clear_finished(:275, DELETE done/failed/cancelled)`. Token-gated `:2025`. | Confirm GET `/tasks` exposes per-task status so UI buttons map to ids; add `clear` idempotency + audit. |
| `/vpn` | ❌ **MISSING** | No route in `do_GET`/`do_POST`; `wg`/`wg-quick` **not installed** (`which wg` → none). | Build from scratch — §3. |
| `/solar` | ❌ **MISSING** | No route; no driver module. (Unrelated `solarflow` pm2 app at `/opt/solarflowminoinworldlloader` is a different project, currently `exit_code:1` — **out of scope, do not touch**.) | Build from scratch — §4. |
| Fake modules | ⚠️ **MOSTLY CLEAN** | `dashboard.py` core endpoints carry only honest "NEVER faked / null not fabricated" comments (`:175,:726,:1291,:1486`). `random.*` users (`prediction`, `backtest`, `scenario`, `geo`, `world_pack`) are legitimate **stochastic models**, not fake data. | Run the systematic hunt in §6 and fix only true fakes. |

**Headline:** the heavy lifting on `/vitals` and `/tasks` control is already done in the working
tree. The net-new build is **`/vpn` + `/solar`**, plus a disciplined **fake-module sweep** and
**verification/hardening** of the two existing endpoints.

---

## 2. Substrate we REUSE (verified line anchors)

| Capability | Symbol | Anchor |
|---|---|---|
| Periodic snapshot consumed by all read endpoints | `_SNAP` (`{ts,loading,…}`), refreshed every 2.5 s by `_refresher` thread | `:869`, `:2121` |
| CPU/mem/disk/load/host (real, `/proc`+`statvfs`) | `_vps()` `:128`, `_cpu_pct()` `:99`, `_cpu_cores()` `:111`, `_host_meta()` `:148` |
| GPU/LLM brain reachability + VRAM (real, Ollama `/api/ps`) | `_box()` `:173` — `gpu_util/temp/power=None` honestly (no nvidia-smi) |
| pm2 service health (real, `pm2 jlist`) | `_workers()` `:223`, `_runners()` `:192` |
| Health score + alerts + gauges | `_health(m)` `:~660`, surfaced by `_vitals()` `:710` |
| 12-line response cache (TTL) | `_cached(key, ttl, fn)` `:88` |
| HTTP send + token replace | `_send()` `:1722`, `__CTOKEN__` inject `:1734` |
| Routing | `do_GET` `:1738`, `do_POST` `:1934` |
| Control auth | `CONTROL_TOKEN` `:63` (from `DASH_CONTROL_TOKEN` env / `server/data/.control_token`), enforced `:2025` |
| Bridge-key pattern (token sibling) | `CLIMATE_BRIDGE_KEY` `:67`, used `:1954` |
| Encrypted secret store | `secrets_vault.py`: `put_secret(name,value,owner)` `:140`, `get_secret(name)` `:182`, `list_secrets()` `:203`, `delete_secret(name)` `:230`, `_audit()` `:126` |
| Task control daemon | `task_daemon.py` (no-timeout, SIGSTOP/SIGCONT/SIGTERM, sqlite `tasks`) |

**Environment facts (this box):** root (`id -u`=0), `systemctl` present, `wg`/`wg-quick`
absent, no `nvidia-smi`, no `qrcode` python lib, Python 3.12, stdlib-only dashboard (no Flask).

---

## 3. `/vpn` — self-managed WireGuard, zero-trust, honest baseline

**Design stance (from Stage-0 research):** the pragmatic best-in-class for *this single box* is a
**self-managed WireGuard interface the dashboard observes + provisions**, with a documented
mesh upgrade path (Headscale/NetBird + DERP) for later. No SaaS dependency, no inbound port
opened beyond the single UDP listen, least-privilege `/32` per peer, full audit.

### 3.1 New module: `server/services/wireguard_vpn.py`
Pure-stdlib + `subprocess`. Public API (all return JSON-able dicts, all honest on failure):

| Fn | Behaviour |
|---|---|
| `status() -> dict` | Source of truth = `wg show all dump` (tab-delimited, stable; mirrors upstream `wg-json`). Returns `{installed, provisioned, interface, listen_port, public_key, peers:[…]}`. Each peer: `{name, endpoint, allowed_ips, last_handshake_age_s, rx_bytes, tx_bytes, online}` where `online = 0 < age ≤ 180`, `idle = age > 180`. **If `wg` not installed →** `{"connected": false, "installed": false, "reason": "not provisioned", "action": "enable-secure-remote-support"}`. Never throws to the route. |
| `provision(name) -> dict` | `wg genkey`/`pubkey` → server keypair (if first run) + **per-peer** keypair. Writes `/etc/wireguard/wg0.conf` (server) with `Address=10.13.13.1/24`, `ListenPort` (default 51820), `PrivateKey` from vault. Adds `[Peer]` with **single `/32` AllowedIPs** (e.g. `10.13.13.2/32` — the box only, never the LAN), `PersistentKeepalive=25`. Returns the **client** `wg-quick` config text + a `qr_payload` (the config string) for client-side QR render. **Keys stored only in `secrets_vault`** (`wg:server:priv`, `wg:peer:<name>:priv`) — never echoed to logs, never returned in `status()`. |
| `up()` / `down()` | `systemctl enable --now wg-quick@wg0` / `disable --now`. Idempotent. Returns new `status()`. |
| `install() -> dict` | One-touch `apt-get install -y wireguard-tools` (guarded; reports apt output tail). Only path that mutates the host package set; **token-gated, audited.** |
| `revoke(name) -> dict` | Remove peer from conf + `wg set wg0 peer <pub> remove`, delete vault keys, audit. |

**Zero-trust defaults baked in:** one `/32` per peer; `PersistentKeepalive=25`; no `0.0.0.0/0`
route pushed; server `PostUp`/`PostDown` add/remove a single `iptables` ACCEPT for the wg
subnet only. Document (comment + spec) the Headscale/DERP mesh upgrade as future opt-in.

### 3.2 Routes (in `dashboard.py`)
- **GET `/vpn`** → `wireguard_vpn.status()` (token-free read is acceptable since it leaks no
  keys — but **default to token-gated** to be safe; decision: gate it, the universe app already
  carries `__CTOKEN__`). JSON.
- **POST `/vpn?action=install|provision|up|down|revoke&name=<peer>&token=…`** → behind the
  existing `CONTROL_TOKEN` check (`:2025`). Returns the action result; `provision` returns config
  + `qr_payload`. Mutating actions call `secrets_vault._audit(actor, action, "vpn:"+name)`.

### 3.3 QR
No `qrcode` python lib → return `qr_payload` (the client config string) in the JSON; the
universe/dashboard page renders the QR **client-side** (tiny embedded QR JS, or a pure-python
SVG fallback in the module if we prefer server-side — **decision: client-side**, keeps the
module dependency-free). Sam scans with the WireGuard phone app.

### 3.4 Honest baseline (today, `wg` absent)
`GET /vpn` → `{connected:false, installed:false, reason:"not provisioned",
action:"enable-secure-remote-support"}`. The UI shows a single **"Enable secure remote
support"** button → POST `/vpn?action=install` then `provision`. Nothing is faked; status is
literally what the kernel reports.

---

## 4. `/solar` — vendor-agnostic inverter framework, honest not-connected

**Design stance (Stage-0):** there is **no single 2026 standard** — each vendor ships its own
API. Top-tier move = a **driver/adapter registry** (one normalized schema, pluggable backends),
the Home-Assistant model. Ship the **framework now, real data the moment credentials exist.**

### 4.1 New module: `server/services/solar_inverter.py`
- **Normalized payload** (the contract every driver fills):
  `{connected, vendor, now_w, today_kwh, lifetime_kwh, battery_soc, grid_w, ts, stale_age_s, source}`.
- **Driver registry** `DRIVERS = {name: callable}`. Each driver is honest about auth + cadence:

| Driver | Auth | Notes |
|---|---|---|
| `enphase` | OAuth2 Bearer **+** `key:` API header | Enlighten v4 only; ⚠ v2/old endpoints **deprecate 2026-03-16** — target only v4 `production`/`summary`/`telemetry`. Token-refresh handled. |
| `solaredge` | API key | 15-min resolution: `/site/{id}/overview`, `/currentPowerFlow`. |
| `fronius` | **none** (local LAN JSON) | `GetPowerFlowRealtimeData` — best latency, zero credentials. |
| `powerwall` | local gateway | reports inverter brand/model + flow. |

- **Credential source:** `secrets_vault.get_secret("solar:<vendor>:<field>")`. Active vendor +
  site id from env `SOLAR_VENDOR` / vault. **No credentials → `connected:false`.**
- `read() -> dict`: resolve active driver → call it (short timeout, cached via `_cached`
  ~60 s) → normalize. On any failure or missing creds: `{connected:false, vendor:<active|null>,
  reason:"not configured"|"unreachable", ts}`. `stale_age_s` from last good sample.

### 4.2 Route
- **GET `/solar`** → `solar_inverter.read()`. Token-free read (no secrets in payload). JSON.
- Credential setup is **not** a web action in v1 (keys go in the vault via existing tooling) —
  documented; a `POST /solar?action=configure` is a logged future opt-in, not built now.

### 4.3 Honest not-connected (today)
`GET /solar` → `{connected:false, vendor:null, reason:"not configured", now_w:null, …}`. UI
shows "Solar — not connected" + which drivers are available to configure. Zero fabrication.

---

## 5. `/tasks` pause · cancel · clear — verify + harden (already real)

Already implemented (§1). This task **finalizes + proves** it:
- Confirm **GET `/tasks`** (`:1769` → `task_daemon.list_tasks()`) returns `id,status,label,pct`
  so the UI maps each row's pause/cancel button to the right id.
- `clear` (`clear_finished()` `:275`) — confirm idempotent (no-op returns `cleared:0`), add an
  `_audit` line for parity with other mutating control actions.
- Edge cases to assert in proof: pause a running task → `status='paused'` + process actually
  `SIGSTOP`'d (state in `/proc/<pid>/stat` = `T`); resume → `R/S`; cancel → group killed +
  `status='cancelled'`; clear → finished rows gone, running rows untouched.
- **Guardrail:** control actions must only ever signal **task_daemon child pids**, never a pm2
  daemon pid — verify the `tasks` table can't contain a lifeline pid (it can't; tasks are
  spawned children). Document this invariant.

---

## 6. Fake-module hunt — methodology + policy

**Definition of "fake":** an endpoint/module that returns **fabricated numbers** (random or
hard-coded) **presented as live measured data**, OR silently serves the HTML page instead of
data (the original `/vitals` bug). **Not fake:** stochastic *models* (Monte-Carlo forecast,
scenario sim, backtest) that are honestly labelled as simulations.

**Sweep procedure (Stage 3+ executes, Stage 2 scopes it):**
1. Enumerate every `do_GET`/`do_POST` branch (`:1738`, `:1934`) → list the function each calls.
2. For each, classify: REAL (measured/DB/live source) · MODEL (honest simulation) · NOT-CONNECTED
   (explicit flag) · **FAKE** (fabricated-as-live / HTML-fallthrough).
3. Cross-check the universe front-ends (`jarvis_live.html`, `jarvis_voice.html`, `guardian.html`,
   `dashboard` HTML) for any `fetch()` whose endpoint 404s or returns HTML → those are the
   "loads nothing" modules the contract flags.
4. Fix policy: a FAKE module is converted to **real data** if a source exists, else to an
   **explicit `{connected:false, reason}`** with a UI "not connected" state. **Never delete a
   feature; never fabricate.**

**Stage-2 preliminary finding:** core `dashboard.py` read endpoints are clean; the only
historical fake was `/vitals` HTML-fallthrough (already fixed). The hunt's likely yield is
**any universe app whose endpoint was never wired** (e.g. a card action pointing at `/vpn` or
`/solar` before they existed — now resolved by §3/§4). Full enumerated table is a Stage-3
deliverable appended here.

---

## 7. Security model

- All **mutating** actions (`/vpn` install/provision/up/down/revoke, `/task` control) sit behind
  the existing `CONTROL_TOKEN` gate (`:2025`); read endpoints (`/vitals`, `/solar`, `/vpn`
  status) are safe to expose but `/vpn` status is gated anyway (token already in the page).
- **Secrets never leave the vault:** WG private keys + solar credentials via `secrets_vault`
  (obfuscated at rest, `:109`); `status()`/`read()` payloads carry **public** data only.
- **Audit:** every mutating call → `secrets_vault._audit(actor, action, resource)`.
- **No new inbound exposure** beyond WG's single configurable UDP `ListenPort`; `/32` per-peer
  routing; keepalive 25 s; no full-tunnel push.

---

## 8. Files to touch / create

| Path | Change |
|---|---|
| `server/services/wireguard_vpn.py` | **NEW** — §3.1 API (status/provision/up/down/install/revoke). Stdlib + subprocess. |
| `server/services/solar_inverter.py` | **NEW** — §4.1 normalized schema + driver registry (enphase/solaredge/fronius/powerwall). |
| `server/dashboard.py` | GET `/vpn`, GET `/solar` in `do_GET` (near `:1906`); POST `/vpn?action=…` in `do_POST` (after `:2030` control block, inside token gate). `/tasks` audit line + GET status confirm. **Surgical inserts only — no refactor of `_SNAP`/routing.** |
| `server/services/secrets_vault.py` | REUSE only (no change expected). |
| `.proof/backend_endpoints_proof.cjs` | **NEW** — §9 verification. |

**Optional (only if `_SNAP` integration is wanted):** fold `vpn`/`solar` summaries into the
2.5 s snapshot so the universe header shows them without extra fetches — *deferred*, keep v1
as discrete endpoints to avoid touching the hot refresher path.

---

## 9. Test / proof plan (`.proof/backend_endpoints_proof.cjs`, headless)

1. **`/vitals`** — assert JSON (not HTML), `ok:true`, `system.cpu_pct` numeric, `services.list`
   non-empty with the 3 lifeline daemons `online`, `brain.reachable` boolean, GPU fields `null`
   (honest, no nvidia-smi). Assert `Content-Type: application/json`.
2. **`/vpn`** — with `wg` absent assert `{connected:false, installed:false,
   action:"enable-secure-remote-support"}`. (Provision/up paths tested behind a guard flag so
   the proof never mutates the host unless explicitly run with `--mutate`.)
3. **`/solar`** — assert `{connected:false, reason:"not configured", now_w:null}` and that the
   driver registry lists 4 vendors.
4. **`/tasks` control** — create a throwaway sleep task → pause (assert `/proc` state `T` +
   `status=paused`) → resume (`status=running`) → cancel (group gone, `status=cancelled`) →
   clear (row removed; a still-running task survives). Never touches pm2.
5. **Lifeline guard** — after every action, `pm2 jlist` shows `jarvis-dashboard`,
   `jarvis-voiceclone`, `jarvis-tasks` still `online`.
6. **No-JS-error** — load each universe page that consumes these endpoints; assert zero console
   errors and that the VPN/Solar cards render their real-or-not-connected state.

---

## 10. Risks & guardrails

- **Lifeline:** never signal a pm2 pid; `/vpn up/down` touches only `wg-quick@wg0`. Test #5.
- **Host mutation:** `apt-get install wireguard-tools` + writing `/etc/wireguard/` are the only
  host-level changes — token-gated, audited, behind an explicit user action, never auto-run.
- **Hot path:** do **not** add blocking subprocess calls into `_refresher`/`_SNAP`; `/vpn` and
  `/solar` are independently cached (`_cached`, ~60 s for solar, ~5 s for vpn status).
- **Honesty contract:** any unreachable source → explicit `connected:false` + `reason`; never a
  fabricated number, never silent HTML fallthrough.
- **Front-end:** wire VPN/Solar cards to real state; a missing field renders `—`, never throws.

---

## 11. Definition of done (Stage-9 comparison checklist)

- [ ] `GET /vitals` returns measured JSON; GPU honest-null; 3 lifelines `online`; not HTML.
- [ ] `server/services/wireguard_vpn.py` exists; `GET /vpn` honest baseline today; provision/up/
      down/install/revoke implemented, token-gated, audited, keys vault-only, `/32` zero-trust.
- [ ] `server/services/solar_inverter.py` exists; `GET /solar` honest not-connected today;
      4-driver registry + normalized schema; reads real data when creds present.
- [ ] `/task` pause·cancel·resume·clear verified real (signals + DB), audited, idempotent clear.
- [ ] Fake-module sweep table appended; every flagged module → real data or explicit
      not-connected (no feature deleted, nothing fabricated).
- [ ] `.proof/backend_endpoints_proof.cjs` green; pm2 lifelines untouched; zero JS console errors.
