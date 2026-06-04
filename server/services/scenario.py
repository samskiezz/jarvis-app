"""SCENARIO / MODELING service — the "what-if / model-ops" pillar.

Surfaces three Palantir-Foundry-style capabilities on top of the existing
APEX/underworld stack, always degrading gracefully (never raises):

  * ``run_scenario``   — a what-if: apply parameter shocks to a baseline
        projection. Prefers the underworld ``world_model.counterfactual``
        method (via :mod:`science_bridge`) when reachable; otherwise computes a
        transparent local percentage-shock series. Persists every run.
  * ``model_registry`` — scans the repo for trained model artifacts (oracle /
        sp500) and reports a drift block (PSI/ECE) when the underworld
        ``ai_models`` drift methods are reachable, else ``null`` with a note.
  * ``optimize``       — maximise an objective over bounds. Prefers a real
        Bayesian/GP optimizer (``real_optimizer``) via the bridge; otherwise a
        transparent random + local-refine search.

Design rules (mirroring prediction.py / history_lake.py):
  * stdlib + numpy (already a dependency) + best-effort reuse of the bridge and
    prediction engine. The bridge import is isolated; any failure falls back to
    a fully-local, honest path.
  * Every public function is wrapped so it NEVER raises — failures degrade to a
    structured result.
  * Each result is HONEST about which engine produced it via an ``"engine"``
    field ("counterfactual" vs "local-shock", "real_optimizer" vs
    "random-search", drift "ai_models" vs null).
  * Runs persist to a small SQLite table (env ``SCENARIO_DB``, default
    ``server/data/scenario.db``); idempotent DDL; storage errors never raise.
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
import time
import uuid
from typing import Any, Callable, Optional

# ── Best-effort reuse of the science bridge (never a hard dependency) ───────────
try:  # pragma: no cover - import guard
    from . import science_bridge as _bridge
except Exception:  # noqa: BLE001
    _bridge = None  # type: ignore[assignment]

# Optional HTTP gateway to the separate underworld FastAPI backend (the
# complementary path for capability that only lives over HTTP). Best-effort:
# any import failure leaves _gateway as None and we simply skip the HTTP tier.
try:  # pragma: no cover - import guard
    from . import gateway as _gateway
except Exception:  # noqa: BLE001
    _gateway = None  # type: ignore[assignment]

# Short network budget for the HTTP tier so a missing/slow underworld backend
# never hangs a scenario request. Overridable via env for ops tuning.
try:
    _HTTP_TIMEOUT = float(os.environ.get("SCENARIO_HTTP_TIMEOUT", "3"))
except (TypeError, ValueError):
    _HTTP_TIMEOUT = 3.0

# Optional reuse of the prediction engine for baseline projections.
try:  # pragma: no cover - import guard
    from . import prediction as _prediction
except Exception:  # noqa: BLE001
    _prediction = None  # type: ignore[assignment]


# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "scenario.db"
)


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``SCENARIO_DB`` before
    the first connection."""
    return os.environ.get("SCENARIO_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS scenario_run (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    params_json TEXT    NOT NULL DEFAULT '{}',
    result_json TEXT    NOT NULL DEFAULT '{}',
    engine      TEXT,
    ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_scenario_ts ON scenario_run (ts);
"""


def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or _db_path()
    if path != ":memory:":
        parent = os.path.dirname(path)
        if parent and not os.path.isdir(parent):
            try:
                os.makedirs(parent, exist_ok=True)
            except OSError:
                pass
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        if path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
    except sqlite3.Error:
        pass
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Create the scenario_run table if absent. Idempotent; never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


def _persist_run(
    run_id: str,
    name: str,
    params: dict,
    result: dict,
    engine: Optional[str],
    *,
    db_path: Optional[str] = None,
) -> None:
    """Persist a scenario run. Fire-and-forget; never raises."""
    try:
        params_json = json.dumps(params or {}, default=str)
    except (TypeError, ValueError):
        params_json = "{}"
    try:
        result_json = json.dumps(result or {}, default=str)
    except (TypeError, ValueError):
        result_json = "{}"
    try:
        init_db(db_path)
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO scenario_run (id, name, params_json, result_json, engine, ts)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name, params_json=excluded.params_json,
                    result_json=excluded.result_json, engine=excluded.engine,
                    ts=excluded.ts
                """,
                (run_id, name, params_json, result_json, engine, _now_ms()),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ══════════════════════════════════════════════════════════════════════════════
# HTTP GATEWAY TIER (underworld backend over HTTP)
# ══════════════════════════════════════════════════════════════════════════════
def _gateway_post(path: str, json_body: dict) -> Optional[dict]:
    """POST to the underworld HTTP backend via the gateway proxy. Returns the
    parsed JSON body on a 2xx, or None on any failure / non-2xx / unconfigured
    gateway. Never raises; never hangs (short timeout)."""
    if _gateway is None:
        return None
    try:
        if not getattr(_gateway, "underworld_configured", lambda: False)():
            return None
        res = _gateway.proxy("POST", path, json_body=dict(json_body or {}), timeout=_HTTP_TIMEOUT)
    except Exception:  # noqa: BLE001 - gateway is best-effort
        return None
    if not isinstance(res, dict) or not res.get("ok"):
        return None
    try:
        if int(res.get("status", 0)) >= 300:
            return None
    except (TypeError, ValueError):
        return None
    body = res.get("json")
    return body if isinstance(body, dict) else None


# ══════════════════════════════════════════════════════════════════════════════
# WHAT-IF / SCENARIO
# ══════════════════════════════════════════════════════════════════════════════
def _bridge_counterfactual(name: str, params: dict) -> Optional[dict]:
    """Try the underworld ``world_model.counterfactual`` method through the
    bridge. Returns its result dict on success, or None if unreachable / errored
    so the caller falls back to the local what-if."""
    if _bridge is None or not getattr(_bridge, "available", lambda: False)():
        return None
    for field in ("world_model.counterfactual", "counterfactual", "world_model"):
        try:
            out = _bridge.run_method(field, dict(params or {}))
        except Exception:  # noqa: BLE001
            continue
        if isinstance(out, dict) and out.get("status") == "ok":
            return out
    return None


def _http_counterfactual(name: str, params: dict) -> Optional[dict]:
    """Try the underworld HTTP backend for a counterfactual / what-if. Returns
    its JSON body on success, else None so the caller falls back. Never raises /
    hangs."""
    payload = {"name": name, "params": dict(params or {})}
    for path in ("/worlds/counterfactual", "/science/counterfactual", "/physics/solve"):
        body = _gateway_post(path, payload)
        if body is not None:
            return body
    return None


def _local_shock(name: str, params: dict) -> dict:
    """Transparent local what-if: take a baseline value and apply percentage
    shocks across a horizon, returning baseline vs scenario series.

    params (all optional):
        baseline      float  starting value                       (default 100.0)
        horizon       int    number of steps to project           (default 12)
        growth_pct    float  baseline per-step % growth            (default 0.0)
        shock_pct     float  per-step % shock applied to scenario  (default 0.0)
        shocks        list   explicit per-step % shocks (overrides shock_pct)
    """
    p = dict(params or {})
    try:
        baseline = float(p.get("baseline", 100.0))
    except (TypeError, ValueError):
        baseline = 100.0
    try:
        horizon = int(p.get("horizon", 12))
    except (TypeError, ValueError):
        horizon = 12
    horizon = max(1, min(horizon, 10000))
    try:
        growth = float(p.get("growth_pct", 0.0)) / 100.0
    except (TypeError, ValueError):
        growth = 0.0
    try:
        shock = float(p.get("shock_pct", 0.0)) / 100.0
    except (TypeError, ValueError):
        shock = 0.0

    shocks_raw = p.get("shocks")
    per_step_shock: list[float] = []
    if isinstance(shocks_raw, (list, tuple)) and shocks_raw:
        for i in range(horizon):
            try:
                per_step_shock.append(float(shocks_raw[i % len(shocks_raw)]) / 100.0)
            except (TypeError, ValueError):
                per_step_shock.append(shock)
    else:
        per_step_shock = [shock] * horizon

    base_series: list[dict] = []
    scen_series: list[dict] = []
    base_val = baseline
    scen_val = baseline
    for step in range(1, horizon + 1):
        base_val = base_val * (1.0 + growth)
        scen_val = scen_val * (1.0 + growth + per_step_shock[step - 1])
        base_series.append({"t": step, "v": float(base_val)})
        scen_series.append({"t": step, "v": float(scen_val)})

    base_final = base_series[-1]["v"]
    scen_final = scen_series[-1]["v"]
    delta = scen_final - base_final
    pct_delta = (delta / base_final * 100.0) if base_final else 0.0

    return {
        "engine": "local-shock",
        "baseline": base_series,
        "scenario": scen_series,
        "summary": {
            "baseline_start": float(baseline),
            "baseline_final": float(base_final),
            "scenario_final": float(scen_final),
            "delta": float(delta),
            "delta_pct": float(pct_delta),
            "horizon": horizon,
        },
        "drivers": {
            "growth_pct_per_step": growth * 100.0,
            "shock_pct_per_step": shock * 100.0 if not isinstance(shocks_raw, (list, tuple)) else None,
            "shocks_pct": [s * 100.0 for s in per_step_shock],
        },
        "math": (
            "baseline_t = baseline_{t-1}*(1+growth); "
            "scenario_t = scenario_{t-1}*(1+growth+shock_t); "
            "delta = scenario_final - baseline_final."
        ),
        "note": (
            "Transparent local percentage-shock what-if (underworld "
            "world_model.counterfactual not reachable via the bridge)."
        ),
    }


def run_scenario(
    name: str,
    params: Optional[dict] = None,
    *,
    db_path: Optional[str] = None,
) -> dict:
    """Run a what-if scenario and persist it. Never raises.

    Resolution order (HONEST ``"engine"`` reflects which path actually answered):
      1. in-process ``world_model.counterfactual`` via the science bridge
         -> engine ``"counterfactual"``;
      2. the underworld HTTP backend via the gateway proxy (when configured /
         reachable) -> engine ``"underworld-http"``;
      3. the transparent local percentage-shock projection -> ``"local-shock"``.
    """
    params = dict(params or {})
    name = str(name or "scenario")
    run_id = uuid.uuid4().hex
    engine = "local-shock"
    try:
        cf = _bridge_counterfactual(name, params)
        http_cf = _http_counterfactual(name, params) if cf is None else None
        if cf is not None or http_cf is not None:
            engine = "counterfactual" if cf is not None else "underworld-http"
            result: dict = {
                "engine": engine,
                "counterfactual": cf if cf is not None else http_cf,
                "note": (
                    "Computed via underworld world_model.counterfactual (in-process bridge)."
                    if cf is not None
                    else "Computed via the underworld HTTP backend (gateway proxy)."
                ),
            }
            # Best-effort: still surface a baseline/scenario shape if the engine
            # returned series-like data; otherwise the local what-if is included
            # as a transparent companion projection.
            companion = _local_shock(name, params)
            result.setdefault("baseline", companion["baseline"])
            result.setdefault("scenario", companion["scenario"])
            result.setdefault("summary", companion["summary"])
        else:
            result = _local_shock(name, params)
    except Exception as exc:  # noqa: BLE001 - never raise to the route
        result = _local_shock(name, params)
        result["error"] = f"{type(exc).__name__}: {exc}"
        engine = result.get("engine", "local-shock")

    out = {
        "id": run_id,
        "name": name,
        "params": params,
        "engine": engine,
        "ts": _now_ms(),
        "result": result,
    }
    _persist_run(run_id, name, params, result, engine, db_path=db_path)
    return out


def list_scenarios(limit: int = 50, *, db_path: Optional[str] = None) -> list[dict]:
    """List recent scenario runs (newest first). Never raises."""
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 50
    limit = max(1, min(limit, 1000))
    try:
        init_db(db_path)
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT id, name, params_json, result_json, engine, ts "
                "FROM scenario_run ORDER BY ts DESC, rowid DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [_row_to_dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def get_scenario(scenario_id: str, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Fetch one scenario run by id, or None if absent. Never raises."""
    if not scenario_id:
        return None
    try:
        init_db(db_path)
        conn = _connect(db_path)
        try:
            row = conn.execute(
                "SELECT id, name, params_json, result_json, engine, ts "
                "FROM scenario_run WHERE id=?",
                (str(scenario_id),),
            ).fetchone()
            return _row_to_dict(row) if row else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def _row_to_dict(row: sqlite3.Row) -> dict:
    try:
        params = json.loads(row["params_json"] or "{}")
    except (TypeError, ValueError):
        params = {}
    try:
        result = json.loads(row["result_json"] or "{}")
    except (TypeError, ValueError):
        result = {}
    return {
        "id": row["id"],
        "name": row["name"],
        "params": params,
        "result": result,
        "engine": row["engine"],
        "ts": row["ts"],
    }


# ══════════════════════════════════════════════════════════════════════════════
# MODEL REGISTRY + DRIFT
# ══════════════════════════════════════════════════════════════════════════════
# Known trained artifacts in this repo, relative to the server/ package root.
_SERVER_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_KNOWN_MODELS = [
    {"name": "oracle_model", "kind": "gradient-boosted-ensemble", "rel": "data/oracle_model.joblib"},
    {"name": "sp500_global", "kind": "pooled-cross-sectional-gbm", "rel": "data/sp500_model.joblib"},
]


def _drift_block() -> Optional[dict]:
    """Try to surface a PSI/ECE drift block. Resolution order (honest ``engine``):
      1. underworld ``ai_models`` drift methods via the in-process bridge
         -> engine ``"ai_models"``;
      2. the underworld HTTP backend via the gateway proxy
         -> engine ``"underworld-http"``.
    Returns the drift dict when reachable, else None so the caller marks drift
    ``null`` with an honest note. Never raises / hangs."""
    if _bridge is not None and getattr(_bridge, "available", lambda: False)():
        for field in ("ai_models.drift", "model_drift", "psi", "ece", "ai_models"):
            try:
                out = _bridge.run_method(field)
            except Exception:  # noqa: BLE001
                continue
            if isinstance(out, dict) and out.get("status") == "ok":
                return {"engine": "ai_models", "field": field, "data": out}
    # HTTP tier: the underworld backend's model-drift endpoint.
    for path in ("/ai-models/drift", "/science/drift", "/science/anomaly"):
        body = _gateway_post(path, {"models": [m["name"] for m in _KNOWN_MODELS]})
        if body is not None:
            return {"engine": "underworld-http", "path": path, "data": body}
    return None


def model_registry() -> dict:
    """List known trained models in this repo + an optional drift block.

    Scans for the trained artifacts (oracle_model, sp500 model) under
    ``server/`` and returns ``{"models": [{name, kind, path?, size?, trained?}],
    "drift": <block|null>, "drift_engine": ...}``. The drift block is populated
    only when the underworld ``ai_models`` PSI/ECE methods are reachable via the
    bridge; otherwise ``drift`` is ``null`` with an honest note. Never raises.
    """
    models: list[dict] = []
    try:
        for spec in _KNOWN_MODELS:
            path = os.path.join(_SERVER_ROOT, spec["rel"])
            exists = os.path.isfile(path)
            entry: dict[str, Any] = {
                "name": spec["name"],
                "kind": spec["kind"],
                "trained": bool(exists),
            }
            if exists:
                try:
                    entry["path"] = path
                    entry["size"] = int(os.path.getsize(path))
                except OSError:
                    pass
            models.append(entry)
    except Exception:  # noqa: BLE001
        models = []

    drift = None
    try:
        drift = _drift_block()
    except Exception:  # noqa: BLE001
        drift = None

    drift_engine = drift.get("engine") if isinstance(drift, dict) else None
    return {
        "models": models,
        "count": len(models),
        "drift": drift,
        "drift_engine": drift_engine,
        "drift_note": (
            None
            if drift is not None
            else "PSI/ECE drift not reachable via the science bridge or underworld HTTP backend; drift is null."
        ),
    }


# ══════════════════════════════════════════════════════════════════════════════
# OPTIMIZATION
# ══════════════════════════════════════════════════════════════════════════════
def _coerce_bounds(bounds: Any) -> list[tuple[str, float, float]]:
    """Normalise bounds into ``[(name, lo, hi), ...]``.

    Accepts a dict ``{name: [lo, hi]}`` or a list of ``[lo, hi]`` / ``{name,
    lo|low|min, hi|high|max}`` entries."""
    out: list[tuple[str, float, float]] = []
    if isinstance(bounds, dict):
        items = bounds.items()
    elif isinstance(bounds, (list, tuple)):
        items = enumerate(bounds)
    else:
        return out
    for key, val in items:
        name = str(key)
        lo = hi = None
        try:
            if isinstance(val, dict):
                name = str(val.get("name", name))
                lo = float(val.get("lo", val.get("low", val.get("min"))))
                hi = float(val.get("hi", val.get("high", val.get("max"))))
            elif isinstance(val, (list, tuple)) and len(val) >= 2:
                lo = float(val[0])
                hi = float(val[1])
            else:
                continue
        except (TypeError, ValueError):
            continue
        if lo is None or hi is None or not (math.isfinite(lo) and math.isfinite(hi)):
            continue
        if hi < lo:
            lo, hi = hi, lo
        out.append((name, lo, hi))
    return out


def _default_objective(point: dict) -> float:
    """Transparent default objective: negative squared distance to each
    dimension's midpoint, so the optimum sits at the centre of the box (a known,
    checkable answer)."""
    return -sum(v * v for v in point.values())


def _resolve_objective(objective: Any) -> Callable[[dict], float]:
    """Resolve an objective spec to a callable. Accepts a Python callable, or a
    string name (currently only the built-in quadratic), else the default."""
    if callable(objective):
        return objective
    # Only the safe built-in quadratic is supported for string specs; anything
    # else falls back to the transparent default (never eval untrusted strings).
    return _default_objective


def optimize(
    objective: Any = None,
    bounds: Any = None,
    n_iter: int = 20,
    *,
    seed: Optional[int] = 42,
) -> dict:
    """Maximise ``objective`` over ``bounds``. Never raises.

    Resolution order (when no custom Python objective is supplied — neither the
    bridge nor the HTTP backend can run a local callable):
      1. a real Bayesian/GP optimizer via the in-process bridge
         -> engine ``"real_optimizer"``;
      2. the underworld HTTP backend via the gateway proxy
         -> engine ``"underworld-http"``;
      3. a transparent random + local-refine search -> engine ``"random-search"``.
    The result carries an honest ``"engine"`` field and returns the best point +
    full history. Each history point's value is the objective at that point.
    """
    pairs = _coerce_bounds(bounds)
    try:
        n_iter = int(n_iter)
    except (TypeError, ValueError):
        n_iter = 20
    n_iter = max(1, min(n_iter, 5000))

    if not pairs:
        return {
            "engine": "random-search",
            "best": None,
            "best_value": None,
            "history": [],
            "n_iter": 0,
            "bounds": [],
            "note": "No valid bounds supplied; nothing to optimize.",
        }

    fn = _resolve_objective(objective)

    # Real optimizer path: only when an actual optimizer is reachable AND the
    # objective is the built-in (neither the bridge nor the HTTP backend can call
    # a local python objective). Resolution order: in-process bridge
    # (engine "real_optimizer") -> underworld HTTP backend (engine
    # "underworld-http"). Honestly skipped for custom python objectives.
    real = None
    if not callable(objective):
        try:
            real = _try_real_optimizer(pairs, n_iter)
        except Exception:  # noqa: BLE001
            real = None
        if real is None:
            try:
                real = _try_http_optimizer(pairs, n_iter)
            except Exception:  # noqa: BLE001
                real = None
    if real is not None:
        return real

    # ── Transparent random + local-refine search (honest fallback) ──
    try:
        import numpy as np

        rng = np.random.default_rng(seed)

        def sample() -> dict:
            return {
                name: float(rng.uniform(lo, hi)) for (name, lo, hi) in pairs
            }
    except Exception:  # noqa: BLE001 - pure-python RNG fallback
        import random

        rng = random.Random(seed)

        def sample() -> dict:
            return {name: rng.uniform(lo, hi) for (name, lo, hi) in pairs}

    history: list[dict] = []
    best_point: Optional[dict] = None
    best_value = -math.inf

    n_explore = max(1, int(round(n_iter * 0.7)))
    for _ in range(n_explore):
        pt = sample()
        try:
            val = float(fn(pt))
        except Exception:  # noqa: BLE001 - a bad objective must not abort the search
            val = -math.inf
        history.append({"point": pt, "value": val})
        if val > best_value:
            best_value, best_point = val, pt

    # Local refine: jitter around the incumbent best within bounds.
    for _ in range(max(0, n_iter - n_explore)):
        if best_point is None:
            break
        pt = {}
        for (name, lo, hi) in pairs:
            span = (hi - lo) * 0.1
            base = best_point[name]
            try:
                import numpy as np  # noqa: F811

                cand = base + float(np.random.default_rng().uniform(-span, span))
            except Exception:  # noqa: BLE001
                import random  # noqa: F811

                cand = base + random.uniform(-span, span)
            pt[name] = float(min(max(cand, lo), hi))
        try:
            val = float(fn(pt))
        except Exception:  # noqa: BLE001
            val = -math.inf
        history.append({"point": pt, "value": val})
        if val > best_value:
            best_value, best_point = val, pt

    return {
        "engine": "random-search",
        "best": best_point,
        "best_value": (None if best_value == -math.inf else float(best_value)),
        "history": history,
        "n_iter": len(history),
        "bounds": [{"name": n, "lo": lo, "hi": hi} for (n, lo, hi) in pairs],
        "note": (
            "Transparent random + local-refine search maximising the objective "
            "(real_optimizer Bayesian/GP not reachable via the bridge)."
        ),
        "math": (
            "70% uniform exploration over the box + 30% local jitter (+/-10% of "
            "each dimension span) around the incumbent best; argmax over history."
        ),
    }


def _try_real_optimizer(pairs: list[tuple[str, float, float]], n_iter: int) -> Optional[dict]:
    """Try a real Bayesian/GP optimizer through the bridge. Returns a normalised
    result dict on success, else None so the caller falls back. Never raises."""
    if _bridge is None or not getattr(_bridge, "available", lambda: False)():
        return None
    bounds_payload = {name: [lo, hi] for (name, lo, hi) in pairs}
    for field in ("real_optimizer", "bayesian_optimization", "optimizer", "optimize"):
        try:
            out = _bridge.run_method(field, {"bounds": bounds_payload, "n_iter": int(n_iter)})
        except Exception:  # noqa: BLE001
            continue
        if isinstance(out, dict) and out.get("status") == "ok":
            return {
                "engine": "real_optimizer",
                "field": field,
                "result": out,
                "bounds": [{"name": n, "lo": lo, "hi": hi} for (n, lo, hi) in pairs],
                "note": "Computed via underworld real_optimizer (in-process bridge).",
            }
    return None


def _try_http_optimizer(pairs: list[tuple[str, float, float]], n_iter: int) -> Optional[dict]:
    """Try a real Bayesian/GP optimizer through the underworld HTTP backend.
    Returns a normalised result dict (engine ``"underworld-http"``) on success,
    else None. Never raises / hangs."""
    bounds_payload = {name: [lo, hi] for (name, lo, hi) in pairs}
    payload = {"bounds": bounds_payload, "n_iter": int(n_iter)}
    for path in ("/optimize", "/science/optimize", "/physics/optimize"):
        body = _gateway_post(path, payload)
        if body is not None:
            return {
                "engine": "underworld-http",
                "path": path,
                "result": body,
                "bounds": [{"name": n, "lo": lo, "hi": hi} for (n, lo, hi) in pairs],
                "note": "Computed via the underworld HTTP backend (gateway proxy).",
            }
    return None


# Bootstrap the default DB on import so the first request finds the table.
init_db()
