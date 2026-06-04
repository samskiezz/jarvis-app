# Running both backends (underworld + APEX)

APEX and underworld are two separate FastAPI backends. The frontend talks to
both. They must **not** share a port — running both on `8000` is the
port-collision gap this doc fixes. Pick one port for each and point the
frontend's two base-URL env vars at the right one.

## Ports

| Backend                | Module                         | Suggested port |
| ---------------------- | ------------------------------ | -------------- |
| underworld (worlds/sim, KG, optimizer, temporal) | `underworld.server.main:app` | `8000` |
| APEX (intel, predict, science bridge, **/v1/bridge**) | `server.main:app` | `8001` |

(Either order works — just keep them on distinct ports and keep the env vars
consistent with your choice.)

## Run underworld on 8000

```bash
uvicorn underworld.server.main:app --host 0.0.0.0 --port 8000 --reload
```

## Run APEX on 8001

```bash
# from the repo root
export JARVIS_API_KEY=dev-key            # any non-empty key for local dev
uvicorn server.main:app --host 0.0.0.0 --port 8001 --reload
```

## Frontend env vars

The frontend reads two base URLs (Vite `import.meta.env`). Point each at the
backend that owns it:

```bash
# .env (frontend)
VITE_API_BASE_URL=http://localhost:8001            # APEX backend
VITE_UNDERWORLD_API_URL=http://localhost:8000       # underworld backend
```

If you flip the ports (APEX on 8000, underworld on 8001), flip these two URLs to
match. The key rule: **`VITE_API_BASE_URL` → APEX**, **`VITE_UNDERWORLD_API_URL`
→ underworld**, and the two ports differ.

## The APEX → underworld bridge

APEX additionally reaches the underworld *platform* in-process via a best-effort
import (no network hop), exposed under `/v1/bridge` on the **APEX** backend:

| Route                          | What it runs                                            |
| ------------------------------ | ------------------------------------------------------- |
| `GET  /v1/bridge/status`       | Is the underworld platform importable here + what's wired |
| `POST /v1/bridge/graph`        | Knowledge-graph analytics (pagerank, prerequisites, novelty, shortest path) |
| `POST /v1/bridge/counterfactual` | World-model counterfactual (fork a baseline, report divergence) |
| `POST /v1/bridge/optimize`     | Real Bayesian optimization on a benchmark (Branin/Hartmann) |
| `POST /v1/bridge/temporal`     | Temporal KG time-slice (`nodes`+`tick`) or causal chain (`edges`+`start`) |

These degrade gracefully: if the underworld package isn't importable in the APEX
process, every route returns `{"status": "unavailable", ...}` with HTTP 200
rather than failing. So the two-backend split above is for the DB-backed
worlds/sim surface; the analytic platform layers are reachable directly from
APEX without the underworld server even running.

### Wiring the bridge router

The bridge router ships as a ready-to-mount `APIRouter`. Add to
`server/main.py`:

```python
from .routes import bridge as bridge_routes
app.include_router(bridge_routes.router)
```
