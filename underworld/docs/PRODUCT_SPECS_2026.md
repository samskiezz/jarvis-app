# Product Specs 2026 — Cluster C5 mini-app default schemas

This doc fixes the 2026 default contracts for the 8 mini-apps that the prior
pass left tagged `source: pending-spec`. Each section gives:

1. The route surface (HTTP method + path).
2. The default JSON envelope returned when no real backend is wired.
3. The 2026 vendor / standard the schema mirrors, with URLs.
4. The single env variable that the owner can override to swap the backend.

All apps degrade safely — if the backend is unreachable, the response stays
`200 OK` with `source: "default-schema"` and a populated demo row so the UI
renders something useful.

---

## 1. app-guardian (`server/routes/guardian.py`)

**Routes**
- `POST /v1/guardian/event`
- `GET  /v1/guardian/incidents`
- `GET  /v1/guardian/status`
- `POST /v1/guardian/ack`

**Default event row (2026.1):**

```json
{
  "id": 0,
  "ts": 0,
  "sensor_id": "demo.front_door",
  "kind": "door",
  "value": "closed",
  "severity": "low",
  "source": "homeassistant",
  "ack": true,
  "location": "Front door",
  "device_class": "opening"
}
```

**Vendor references**
- Home Assistant binary_sensor device classes (2026):
  https://developers.home-assistant.io/docs/core/entity/binary-sensor
- Home Assistant REST API (poll `/api/states`):
  https://developers.home-assistant.io/docs/api/rest/
- OASIS Common Alerting Protocol v1.2 severity bands.
- Zigbee2MQTT MQTT → HTTP bridge sample:
  https://www.zigbee2mqtt.io/guide/usage/integrations/home_assistant.html

**Owner override:** point a HA long-lived token poller at `/v1/guardian/event`.

---

## 2. app-vitals (`server/routes/vitals.py`)

**Routes**
- `POST /v1/vitals/observation`
- `GET  /v1/vitals/trend?metric=hr&hours=24`
- `GET  /v1/vitals/latest`

**Default observation row (2026.1):**

```json
{
  "ts": 0,
  "metric": "hr",
  "value": 68,
  "unit": "bpm",
  "source": "apple_health"
}
```

**Vendor references**
- Apple HealthKit `HKQuantityType` (2026):
  https://developer.apple.com/documentation/healthkit/hkquantitytype
- HL7 FHIR R5 Observation resource:
  https://www.hl7.org/fhir/observation.html
- Open Wearables Apple Health bridge:
  https://openwearables.io/integrations/apple-health
- Garmin Health API:
  https://developer.garmin.com/gc-developer-program/health-api/

**Owner override:** point an iOS Shortcut at `/v1/vitals/observation`.

---

## 3. run-builder (`server/routes/run_builder.py`)

**Routes**
- `POST /v1/run-builder/build {graph_json}`
- `GET  /v1/run-builder/runs`
- `GET  /v1/run-builder/run/{run_id}`
- `POST /v1/run-builder/run/{run_id}/cancel`

**Default graph envelope (2026.1, n8n-shaped):**

```json
{
  "name": "demo.echo",
  "nodes": [
    {"id": "trigger", "type": "n8n-nodes-base.manualTrigger",
     "typeVersion": 1, "position": [240, 300], "parameters": {}}
  ],
  "connections": {
    "trigger": {"main": [[{"node": "echo", "type": "main", "index": 0}]]}
  }
}
```

**Vendor references**
- n8n workflow JSON format:
  https://docs.n8n.io/workflows/export-import/
- Node-RED flows.json:
  https://nodered.org/docs/api/admin/methods/get/flows/
- Prefect 3 flow run schema:
  https://docs.prefect.io/3.0/develop/write-flows/
- Temporal workflow execution envelope:
  https://docs.temporal.io/workflows
- Dagster Mesh asset materialization:
  https://docs.dagster.io/concepts/assets/asset-materializations

**Owner override:** set `RUN_BUILDER_EXECUTOR=n8n|prefect|temporal` and wire
`_dispatch()` in `run_builder.py`.

---

## 4. run-correlator (`server/routes/run_correlator.py`)

**Routes**
- `POST /v1/run-correlator/correlate {event_ids, window_s?}`
- `GET  /v1/run-correlator/clusters`
- `GET  /v1/run-correlator/cluster/{cluster_id}`

**Default cluster row (2026.1):**

```json
{
  "cluster_id": "demo000000000000",
  "ts": 0,
  "window_s": 120,
  "event_count": 0,
  "max_severity": "low",
  "event_ids": [],
  "summary": "no correlations yet"
}
```

**Vendor references**
- OpenSearch Security Analytics correlation rules:
  https://opensearch.org/docs/latest/security-analytics/usage/correlation-rules/
- OCSF v1.4 base_event schema:
  https://schema.ocsf.io/1.4.0/classes/base_event
- Elastic SIEM Detection Engine:
  https://www.elastic.co/guide/en/security/current/about-detection-engine.html

**Owner override:** set `CORRELATOR_BACKEND=opensearch` and inject an
OpenSearch client into `_cluster()`.

---

## 5. inf-swarm (`server/routes/inf_swarm.py`)

**Routes**
- `POST /v1/inf-swarm/spawn {agent_kind, count, params?}`
- `GET  /v1/inf-swarm/agents`
- `POST /v1/inf-swarm/kill {agent_id}`
- `POST /v1/inf-swarm/heartbeat {agent_id, status?, queue_depth?}`

**Default agent row (2026.1):**

```json
{
  "agent_id": "demo0000000kind",
  "kind": "summarizer",
  "status": "declared",
  "queue_depth": 0,
  "spawned_ts": 0,
  "last_heartbeat": 0,
  "error": null,
  "description": "long text → tldr"
}
```

**Vendor references**
- Kubernetes Operator pattern:
  https://kubernetes.io/docs/concepts/extend-kubernetes/operator/
- AutoGen 0.6 A2A agent envelope:
  https://microsoft.github.io/autogen/0.6/reference/python/autogen_core.html
- CrewAI 0.80 agent contract:
  https://docs.crewai.com/concepts/agents
- Ray Serve autoscaling 2.40:
  https://docs.ray.io/en/latest/serve/autoscaling.html

**Owner override:** set `INF_SWARM_RUNNER=ray|k8s|procmgr` and write a
poller that picks rows with `status='declared'`.

---

## 6. VPN (`server/routes/vpn.py`)

**Routes**
- `GET  /v1/vpn/status`
- `POST /v1/vpn/toggle {iface, action}` (bearer-protected)

**Default status envelope (2026.1):**

```json
{
  "installed": false,
  "active": false,
  "interfaces": [
    {"iface": "wg0", "listen_port": 51820, "public_key": null,
     "peers": [{"public_key": "demo-peer-1-pubkey",
                "allowed_ips": "10.7.0.2/32", "latest_handshake": 0,
                "rx_bytes": 0, "tx_bytes": 0, "name": "phone"}]}
  ]
}
```

**Vendor references**
- WireGuard CLI quickstart (`wg show dump` field order):
  https://www.wireguard.com/quickstart/#command-line-interface
- wg-easy v15 REST API:
  https://github.com/wg-easy/wg-easy/blob/master/docs/REST_API.md
- WireGuard Portal v2:
  https://github.com/h44z/wg-portal
- wgctrl-go canonical types:
  https://github.com/WireGuard/wgctrl-go

**Owner override:** `apt install wireguard-tools` and grant the FastAPI
process CAP_NET_ADMIN (or run wg-easy and proxy through).

---

## 7. Solar (`server/routes/solar.py`)

**Routes**
- `GET /v1/solar/now`
- `GET /v1/solar/config`

**Default `solar/now` envelope (2026.1):**

```json
{
  "kw_now": 0.0,
  "kw_today_kwh": 0.0,
  "lifetime_kwh": 0.0,
  "ac_v": 240.0,
  "freq_hz": 60.0,
  "temp_c": 30.0,
  "batteries": [{"id": "demo.bat1", "soc_pct": 100.0, "dc_v": 51.2,
                 "kw": 0.0, "temp_c": 25.0}],
  "grid_export_kw": 0.0,
  "grid_import_kw": 0.0,
  "ts": 0
}
```

**Vendor references**
- SunSpec Information Model reference (2025-11):
  https://sunspec.org/wp-content/uploads/2015/06/SunSpec-Information-Model-Reference.xlsx
- pysunspec2 client:
  https://github.com/sunspec/pysunspec2
- Enphase Envoy local `/production.json` (V7+):
  https://enphase.com/installers/resources/ieee-1547-2018
- Modbus TCP common model (model 103 inverter, 124 battery, 203 meter):
  https://sunspec.org/sunspec-specifications/

**Owner override:** `INVERTER_KIND=sunspec INVERTER_HOST=<ip>` or
`INVERTER_KIND=enphase ENVOY_HOST=<ip> ENVOY_TOKEN=<jwt>`.

---

## 8. Messages (`server/routes/messages.py`)

**Routes**
- `POST /v1/messages/send {to, text, channel?}`
- `GET  /v1/messages/recent?limit=&direction=`
- `POST /v1/messages/inbound` (webhook target)

**Default message row (2026.1):**

```json
{
  "id": 0,
  "ts": 0,
  "direction": "in",
  "channel": "signal",
  "peer": "+15555550100",
  "text": "Welcome — wire MESSAGES_BACKEND=signal to enable real delivery.",
  "status": "received"
}
```

**Vendor references**
- signal-cli-rest-api v0.94+ (`POST /v2/send`):
  https://github.com/bbernhard/signal-cli-rest-api
- Matrix Client-Server v1.11 room events:
  https://spec.matrix.org/v1.11/client-server-api/#room-events
- Twilio Conversations API:
  https://www.twilio.com/docs/conversations/api
- Synapse home server:
  https://github.com/element-hq/synapse

**Owner override:** `MESSAGES_BACKEND=signal SIGNAL_REST_URL=http://...
SIGNAL_NUMBER=+1...` (drop in the dockerized signal-cli-rest-api).

---

## How to accept these defaults wholesale

The defaults are already live — boot the backend and every route above will
respond with a populated `default-schema` row until the matching env vars are
set. There is nothing to do unless you want to override a specific schema:
drop a one-liner monkeypatch inside `server/routes/<app>.py` and replace the
`_DEFAULT_*` constant.
