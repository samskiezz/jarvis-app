# Mini-App Product Specs — Cluster C6 (2026 stack choices)

Eight orphaned mini-apps now have working REST skeletons. This doc captures the
data contract per app and the 2026 vendor pick, so the owner can confirm and
the vendor wiring is then a one-day job per app.

All routes return `{"ok": true|false, "source": "live"|"stub-pending-spec", ...}`.
None ever raise 500 — they degrade to the stub shape when the backend isn't
configured. SQLite stores live under `server/data/*.db` (additive, never
destructive).

---

## #15 app-guardian — `server/routes/guardian.py`

Surface home-sensor events (motion / door / leak / smoke / CO / fall-detect)
and incident acks.

**2026 stack:** Home Assistant Long-Lived Access Token + REST API.
- Reference: https://developers.home-assistant.io/docs/api/rest/
- Alt: Zigbee2MQTT → MQTT → small bridge script.

**Endpoints**
- `POST /v1/guardian/event` — sensor adapter writes here
- `GET  /v1/guardian/incidents?limit=&since=&severity=`
- `GET  /v1/guardian/status`
- `POST /v1/guardian/ack`

**Event schema**
```json
{"sensor_id":"front_door","kind":"door","value":"open",
 "severity":"med","ts":1718735000,"source":"homeassistant"}
```

**Owner action to activate**: install `wireguard-tools` is irrelevant here;
add a cron that polls HA `/api/states` and forwards interesting entities.

---

## #16 app-vitals — `server/routes/vitals.py`

Biometric trends (HR, HRV, SpO2, sleep, steps, weight).

**2026 stack:** generic REST observation contract, fed by:
- Apple Health: HealthKit has no cloud API → iOS Shortcut or Open Wearables
  bridge (https://openwearables.io/integrations/apple-health) POSTs into
  `/v1/vitals/observation`.
- Garmin: Garmin Health API push webhook
  (https://developer.garmin.com/gc-developer-program/health-api/) →
  small adapter → same endpoint.

**Endpoints**
- `POST /v1/vitals/observation`
- `GET  /v1/vitals/trend?metric=hr&hours=24`
- `GET  /v1/vitals/latest`

**Observation schema**
```json
{"metric":"hr","value":62,"unit":"bpm","ts":1718735000,"source":"apple_health"}
```

**Owner action**: register a Garmin developer key (free for personal use) OR
install the Health Auto Export iOS Shortcut. Either way, one webhook.

---

## #18 run-builder + #19 run-correlator (workflow apps)

Not shipped as separate routes — these are workflow-engine apps. The product
decision is "self-host n8n vs Activepieces":

- **n8n** (https://n8n.io) — source-available (fair-code), 400+ integrations,
  first-class LangChain. Best when integration breadth matters.
- **Activepieces** (https://www.activepieces.com) — MIT-licensed, 200+ pieces,
  simpler UX, OpenAI/Claude as first-class blocks.

**Recommendation (2026):** Activepieces for run-builder (operator UX), n8n
for run-correlator (more integration depth, better for joining streams).
Both ship as Docker; expose their REST behind the JARVIS gateway later.

Source: https://www.activepieces.com/blog/activepieces-vs-n8n,
https://cedarops.com/blog/activepieces-vs-n8n/

**Owner action**: pick one (or both) and `docker compose up`. Nothing to ship
in code until the choice is confirmed — backend routes would be premature.

---

## #20 inf-swarm (inference fleet)

Not shipped as a separate route — already covered by the existing
Underworld/Gateway infrastructure (`server/routes/gateway.py`). Spec
deliverable here is **"unified inference seam"**: a single
`/v1/inference/route` that picks micro / base / strong / kimi / claude per
the existing multi-LLM matrix (see memory: `multi-llm-openclaw-feedback`).

**Owner action**: confirm the existing gateway already satisfies inf-swarm;
no new code unless additional providers are added.

---

## #21 VPN — `server/routes/vpn.py`

WireGuard status + up/down control.

**2026 stack:** direct `wg`/`wg-quick` shell-out — no extra service.
- Reference: https://github.com/WireGuard/wgctrl-go (canonical lib)
- UI alt: https://github.com/wg-easy/wg-easy (Docker admin UI)

**Endpoints**
- `GET  /v1/vpn/status`
- `POST /v1/vpn/toggle` (bearer-protected)

Probes for `wg`/`wg-quick` at runtime, returns `stub-pending-spec` with a
hint when WireGuard isn't installed. Toggle validates iface name against
`^[a-zA-Z0-9_-]{1,15}$` before any shell call.

**Owner action**: `apt install wireguard-tools`, drop `/etc/wireguard/wg0.conf`.
The backend will autodetect on next request.

---

## #22 Solar — `server/routes/solar.py`

Live inverter telemetry: power_w, lifetime_kwh, today_kwh.

**2026 stack:** SunSpec Modbus TCP as the primary path (vendor-neutral —
SolarEdge, Fronius, SMA, Kostal, Huawei, Sungrow). Enphase as alt via the
Envoy local API.

- pysunspec: https://github.com/sunspec/pysunspec
- pysunspec2 (newer): also auto-detected
- Enphase Envoy V7+ local JSON: `https://<envoy-ip>/production.json`

Backend selected by env: `INVERTER_KIND=sunspec|enphase`.

**Endpoints**
- `GET /v1/solar/now`
- `GET /v1/solar/config`

**Owner action**: set 3 env vars (`INVERTER_KIND`, `INVERTER_HOST`,
`INVERTER_SLAVE_ID`) or (`INVERTER_KIND=enphase`, `ENVOY_HOST`,
`ENVOY_TOKEN`). Restart pm2 backend.

---

## #25 Messages — `server/routes/messages.py`

Outbound + inbound text across Signal/Matrix/email.

**2026 stack:** signal-cli-rest-api as the primary backend.
- Repo: https://github.com/bbernhard/signal-cli-rest-api
- Docker: `docker run -v $PWD/cfg:/home/.local/share/signal-cli -p 8080:8080
  bbernhard/signal-cli-rest-api:latest`

**Endpoints**
- `POST /v1/messages/send`
- `GET  /v1/messages/recent?limit=&direction=in|out|any`
- `POST /v1/messages/inbound`  (webhook target)

**Send schema**
```json
{"to":"+15551234567","text":"hello","channel":"signal"}
```

**Owner action**: `docker run` the signal-cli container, register a number
(QR scan), set `MESSAGES_BACKEND=signal`, `SIGNAL_REST_URL`,
`SIGNAL_NUMBER`. Inbound webhook posts to `/v1/messages/inbound`.

---

## Sources

- Home Assistant REST: https://developers.home-assistant.io/docs/api/rest/
- Open Wearables (Apple Health bridge): https://openwearables.io/integrations/apple-health
- Garmin Health API: https://developer.garmin.com/gc-developer-program/health-api/
- n8n vs Activepieces 2026: https://cedarops.com/blog/activepieces-vs-n8n/
- wgctrl (Go): https://github.com/WireGuard/wgctrl-go
- wg-easy: https://github.com/wg-easy/wg-easy
- pysunspec: https://github.com/sunspec/pysunspec
- signal-cli-rest-api: https://github.com/bbernhard/signal-cli-rest-api
