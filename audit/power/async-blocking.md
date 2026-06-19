# Async-blocking audit — FastAPI handlers (`server/`)

Read-only audit. Scope: `server/routes/`, `server/agent/`, `server/services/`.
Out-of-scope: `server/dashboard.py` uses stdlib `http.server` (sync, not FastAPI) so its `time.sleep`/`subprocess`/`sqlite3` calls are not event-loop blockers.

Identifies sync blocking calls inside `async def` FastAPI handlers (event-loop stalls).

## Method
Grep across `server/{routes,agent,services}` for:
- `sqlite3.connect(...)` + `.execute/.fetchall/.commit` (sync DB)
- `urllib.request.urlopen` and `requests.get/post` (sync HTTP)
- `subprocess.run/check_output/Popen` (sync child process)
- `time.sleep` (sync delay)
- `open()` / `read_text()` / `json.load(fh)` in handler bodies
- `os.popen(...).read()` (sync subprocess)
Cross-referenced each match against the enclosing `async def` and against existing `asyncio.to_thread` / `run_in_executor` calls so wrappers don't get falsely tagged.

Aggregate counts:
- `sqlite3.connect` occurrences across audited tree: **126**
- `urllib.request.urlopen` occurrences: **30+**
- `subprocess.run/Popen` occurrences across services: **30+**
- `time.sleep` calls: **20+** (almost all inside daemon loops in `services/`, not handlers — OK)
- `os.popen(...).read()` inside async handler: **3** in `routes/admin.py` (pipeline endpoints)

Most `time.sleep` and subprocess calls live in `services/` daemons / sync helpers, NOT async handlers. The real cost is the **DB + HTTP + subprocess inside async route handlers**.

## Findings table — sync-blocking inside async FastAPI handlers

| # | Route | File:line | Blocking pattern | Est traffic | Est gain |
|---|---|---|---|---|---|
| 1 | `GET /v1/jarvis/analytics/object/{id}` | `routes/jarvis_analytics.py:30` (conn at 23-25) | `sqlite3.connect` + 3 `.execute().fetchall()` + per-neighbor sub-query (N+1) inside `async def` | HIGH (UI polls per node) | very high — N+1 + sync DB per request |
| 2 | `GET /v1/jarvis/analytics/top-objects` | `routes/jarvis_analytics.py:197` | `sqlite3.connect` + `.execute(... LIMIT 5000).fetchall()` + JSON parse 5000 rows in handler | HIGH | very high — 5000-row scan blocks loop |
| 3 | `GET /v1/jarvis/analytics/forecast/{metric}` | `routes/jarvis_analytics.py:234` | sync sqlite + CPU regression on 500 rows in handler | MED | high — CPU + DB combined |
| 4 | `GET /v1/jarvis/analytics/anomalies` | `routes/jarvis_analytics.py:306` | sync sqlite + JSON-parse scan | MED | high |
| 5 | `GET /v1/jarvis/analytics/page/{name}` | `routes/jarvis_analytics.py:104` | sync sqlite chain | MED | high |
| 6 | `POST /v1/inf-swarm/spawn` `GET /agents` `POST /kill` `POST /heartbeat` | `routes/inf_swarm.py:86,132,202,229` (`_db` at 66) | `sqlite3.connect` + INSERT/UPDATE/SELECT in async handler | HIGH (agents heartbeat) | very high — heartbeat is hot path |
| 7 | `POST /v1/messages/send` + `_send_signal` | `routes/messages.py:113` + `urlopen` at line 105 | **sync `urllib.request.urlopen` to Signal REST** + sync sqlite in same handler | MED-HIGH | very high — 8s timeout blocks loop |
| 8 | `GET /v1/messages/recent` | `routes/messages.py:151` | sync sqlite SELECT in async handler | MED | medium |
| 9 | `POST /v1/guardian/event` `GET /incidents` `GET /status` `POST /ack` | `routes/guardian.py:119,154,192,218` (`_db` at 87) | sync sqlite + INSERT/SELECT/COUNT in async | MED-HIGH (sensor events) | high |
| 10 | `POST /v1/run-correlator/correlate` `GET /clusters` `GET /cluster/{id}` | `routes/run_correlator.py:141,198,251` (`_db` at 57, GUARDIAN_DB read at 81) | sync sqlite cross-DB + INSERT loop in handler | MED | high |
| 11 | `POST /v1/run-builder/build` etc. | `routes/run_builder.py:134,182,233,277` (`_db` at 77) | sync sqlite in async | MED | medium |
| 12 | `POST /v1/voice/history` `GET /v1/voice/history` `DELETE /v1/voice/history` | `routes/voice.py:445,466,485` (sqlite at 75, 453, 471, 488) | sync sqlite under `_db_lock` (which serialises all event loop tasks too) in async | HIGH (every voice cmd logged) | very high — lock+sync magnifies stall |
| 13 | `GET /v1/admin/pm2` | `routes/admin.py:347` calling `_pm2_list` (line 317) | `subprocess.run(['pm2','jlist'], timeout=10)` inside async (sync 10s ceiling) | LOW-MED (panel refresh) | high — 10s ceiling for one slow shell |
| 14 | `POST /v1/admin/pm2/{name}/{action}` | `routes/admin.py:362` (subprocess.run at 377) | `subprocess.run(['pm2',action,name], timeout=30)` in async | LOW | high — 30s ceiling |
| 15 | `GET /v1/admin/pipeline` | `routes/admin.py:387` (line 413 `os.popen('pgrep -f ...').read()`) | sync `os.popen(...).read()` in async; also `open(path)`/`json.load(f)` | LOW-MED | medium |
| 16 | `POST /v1/admin/pipeline/start` | `routes/admin.py:427` (line 432) | sync `os.popen(...).read()` inside async | LOW | medium |
| 17 | `POST /v1/admin/pipeline/deploy` | `routes/admin.py:442` (line 449) | sync `os.popen(...).read()` inside async | LOW | medium |
| 18 | `GET /v1/admin/gpu/status` | `routes/admin.py:143` (line 170) | sync `urllib.request.urlopen(... ollama /api/tags, timeout=10)` inside async | MED (status polled by UI) | very high — 10s tail blocks loop |
| 19 | `POST /v1/brain-research/research` `/ingest` `/reconcile` `/synthesize` | `routes/brain_research.py:64,72,79,87` | async handler calls `br.research()` which in `services/brain_research.py:100` does sync `urllib.request.urlopen(..., timeout=N)` against Wikipedia/HN/arXiv/Crossref | LOW-MED | very high — multi-second external HTTP blocks loop |
| 20 | `POST /v1/bridge/*` and `POST /v1/brain-extras/*` | `routes/bridge.py:49-77`, `routes/brain_extras.py:72-164` | async handlers wrap sync service code (no `to_thread`); services hit sqlite + sometimes urlopen | LOW-MED | medium |
| 21 | `POST /v1/cinematic/*` `_h_*` hydrators | `routes/cinematic.py:122` + 11 `_h_*` async helpers | sync `sqlite3.connect` in `_conn()` (line 122) — **but** wrapped in `_cache(...)` TTL + `_live()` uses `loop.run_in_executor` (line 89) | HIGH but cached | low — already mitigated |
| 22 | `POST /v1/functions/analystChat` (agent path) | `routes/functions.py:144` | already uses `asyncio.to_thread` — **NOT blocking** | — | — already fixed |

(Note: `_seed_from_ontology()` in `routes/entities.py` opens sqlite, but it runs once at import — not per request. Entities CRUD is in-memory dict.)

## TOP 10 by impact (frequency × blocking time)

| Rank | Endpoint(s) | File:line | Why this hurts most |
|---:|---|---|---|
| 1 | `/v1/voice/history` POST + GET + DELETE | `routes/voice.py:445,466,485` (conn 75/453/471/488) | Hot path — every voice/text command logs here. Sync sqlite **under a `threading.Lock`** also serialises async tasks. |
| 2 | `/v1/jarvis/analytics/object/{id}` and `/top-objects` | `routes/jarvis_analytics.py:30,197` | UI polls per node + JSON-parse of up to 5000 rows on the event loop. Pure CPU + sync DB. |
| 3 | `/v1/inf-swarm/heartbeat` + `/agents` | `routes/inf_swarm.py:132,229` | Heartbeat called on a schedule by every live agent. Sync UPDATE every beat. |
| 4 | `/v1/guardian/event`/`/incidents`/`/status` | `routes/guardian.py:119,154,192` | Sensor event ingestion is bursty; sync INSERT/COUNT in async stalls every burst. |
| 5 | `/v1/admin/gpu/status` | `routes/admin.py:143` (urlopen 170) | UI polls GPU/Ollama health; 10s `urllib.request.urlopen` worst-case blocks the loop for 10s. |
| 6 | `/v1/messages/send` (signal backend) | `routes/messages.py:113` (urlopen 105) | Mixes sync HTTP (`urllib`, 8s timeout) + sync sqlite in one async handler. |
| 7 | `/v1/admin/pm2` list and action | `routes/admin.py:347,362` | `subprocess.run(pm2 jlist)` 10s + `pm2 action` 30s ceiling on async path. |
| 8 | `/v1/run-correlator/correlate` | `routes/run_correlator.py:141` (also opens guardian_events.db at 81) | Cross-DB sync sqlite + per-cluster INSERT loop. |
| 9 | `/v1/brain-research/*` | `routes/brain_research.py:64-87` → `services/brain_research.py:100` urlopen | External HTTP (Wikipedia/HN/arXiv/Crossref) blocks loop per request. |
| 10 | `/v1/admin/pipeline` status/start/deploy | `routes/admin.py:387,427,442` (os.popen at 413/432/449 + open/json.load at 393) | `os.popen(...).read()` + sync `open()`+`json.load()` in async. |

## Minimum-diff fix pattern

For sync sqlite in async handlers (covers items 1–11):

```python
import asyncio

@router.get("/whatever")
async def handler(...):
    def _work():
        c = _db()           # existing sync helper
        try:
            return c.execute(SQL, args).fetchall()
        finally:
            c.close()
    rows = await asyncio.to_thread(_work)
    return {...}
```

For sync HTTP (items 5, 6, 9, 18):

```python
import httpx
async with httpx.AsyncClient(timeout=10.0) as client:
    r = await client.get(url)
```

If the sync helper is shared (e.g. `services/brain_research.py:100`), wrap the
call site instead of rewriting the helper:

```python
data = await asyncio.to_thread(br.research, body.topic)
```

For sync subprocess (items 13, 14):

```python
proc = await asyncio.create_subprocess_exec(
    pm2, "jlist", stdout=PIPE, stderr=PIPE,
)
stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
```

For `os.popen(...).read()` (items 15–17):

Replace with `await asyncio.create_subprocess_exec("pgrep","-f","ue5_pipeline.py")`,
or wrap the entire handler body in `asyncio.to_thread(...)`.

## Total estimated capacity gain

Fixing items 1–10:

- Items 1, 3, 6 (`voice.history`, `inf-swarm.heartbeat`, `messages.send`) eliminate
  per-request 5–50 ms event-loop stalls on the **hot** path. With FastAPI on a
  single Uvicorn worker, this is the difference between ~50 RPS and ~500+ RPS
  for those routes — **~10x throughput** on the affected endpoints.
- Items 5, 7, 18 (sync `urllib`/`subprocess` with 10–30 s ceilings) eliminate
  worst-case event-loop freezes that today cause **all** in-flight requests to
  stall for seconds. Largest tail-latency win — p99 on `/chat`, `/vitals`,
  `/metrics` should drop from multi-second spikes to <100 ms.
- Items 2, 4, 8 (CPU-heavy JSON parse in handler) move 50–200 ms of CPU off the
  loop per call; freeing capacity for concurrent `/chat` streams.

Conservative estimate across the affected hot endpoints: **5–10× concurrent
request capacity**, with p99 tail-latency reduction from seconds to
sub-100 ms on the admin/voice/inf-swarm routes. No change for already-fixed
routes (`functions.analystChat`, `cinematic._live`).
