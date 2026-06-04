"""LIVE FORWARD-TEST LOOP for the PATTERN ORACLE prediction engine (P0).

This closes the self-improvement loop end-to-end:

    issue a live prediction NOW
        -> PERSIST it to the History Lake (forecast row, with the resolve/target
           timestamp = issued_ts + horizon)
        -> when the horizon elapses, FETCH the realized value and SCORE it
           (realized_outcome + skill_score) — only ever against a TRULY realized
           value, never a fabricated one
        -> ACCUMULATE true out-of-sample skill
        -> EXPOSE a scorecard (via history_lake.skill_summary + a directional /
           coverage roll-up computed here).

It reuses the existing primitives verbatim — it does NOT duplicate them:
  * :mod:`server.services.history_lake` — ``record_forecast``, ``record_outcome``,
    ``score_due_forecasts(now, resolver)``, ``skill_summary``.
  * :mod:`server.services.prediction` — ``load_crypto_series`` (live feed).
  * :mod:`server.services.forecaster_ml` / ``forecaster`` — the trained
    forecasters (``MLForecaster`` default, ``ShortHorizonForecaster`` fallback).
  * :mod:`server.services.scrapers` — ``deep_history`` / ``yahoo_daily`` for the
    realized value of stocks / indices.

Doctrine: nothing here touches the network or the DB on import. The continuous
``forward_test_loop`` is opt-in via env (``FORWARD_TEST_ENABLE``); the live route
logging is opt-in via ``FORWARD_TEST_LOG``. Every function degrades gracefully
and never fabricates a score.

The ``baseline`` we persist into each forecast's drivers is the *persistence*
reference (the last observed value at issue time). The History Lake's
``score_due_forecasts`` reads that ``drivers["baseline"]`` to compute
skill-vs-baseline; we also use it here to compute directional accuracy
(did point and actual move the same way relative to the last value?).
"""

from __future__ import annotations

import asyncio
import math
import os
import time
from typing import Any, Callable, Optional, Sequence

from . import history_lake as _hl
from .prediction import load_crypto_series, load_crypto_history

# Forecasters are imported lazily inside ``_make_forecaster`` so importing this
# module never pulls scikit-learn / numpy heavy paths unless actually used.


# ── crypto-id mapping (mirror prediction._TICKER_TO_ID best-effort) ───────────
try:
    from .prediction import _TICKER_TO_ID as _CG_IDS
except Exception:  # pragma: no cover - defensive
    _CG_IDS = {}


def _truthy(val: Optional[str]) -> bool:
    return str(val or "").strip().lower() in ("1", "true", "yes", "on")


def _now_ms(now_ts: Optional[int]) -> int:
    return int(now_ts) if now_ts is not None else int(time.time() * 1000)


# ── data loaders ──────────────────────────────────────────────────────────────
def _load_live_series(asset: str, source: str, *, days: int = 90) -> list[dict]:
    """Load the live series for ``asset`` from the appropriate free feed.

    crypto/fx -> CoinGecko intraday (``load_crypto_series``).
    stocks/index -> deep_history (Yahoo) via scrapers.
    Returns ``[{"t": ms, "v": price}, ...]`` ascending, or ``[]``.
    """
    src = (source or "crypto").lower()
    if src in ("stock", "stocks", "index", "equity", "yahoo"):
        try:
            from .scrapers import deep_history

            return deep_history(asset)
        except Exception:  # noqa: BLE001
            return []
    # crypto / fx default
    series = load_crypto_series(asset, days=days)
    if not series:
        # deep daily history as a fallback (still crypto)
        try:
            series = load_crypto_history(asset, days=365)
        except Exception:  # noqa: BLE001
            series = []
    return series


def _step_hours(ts: Optional[Sequence[float]]) -> float:
    """Median sampling interval of the series, in hours (default 24h)."""
    if ts and len(ts) >= 2:
        diffs = [float(ts[i + 1] - ts[i]) for i in range(len(ts) - 1) if ts[i + 1] > ts[i]]
        if diffs:
            diffs.sort()
            med_ms = diffs[len(diffs) // 2]
            return med_ms / 3_600_000.0
    return 24.0


# ── forecaster construction ───────────────────────────────────────────────────
def _make_forecaster(model: str, *, fast: bool = False):
    """Return a (forecaster, model_name) pair. ``model='ml'`` -> MLForecaster
    (which itself falls back to ShortHorizonForecaster when sklearn is absent);
    anything else -> ShortHorizonForecaster directly."""
    m = (model or "ml").lower()
    if m in ("ml", "mlforecaster", "gbm_ml", "boosted"):
        try:
            from .forecaster_ml import MLForecaster

            return MLForecaster(fast=fast), "ml"
        except Exception:  # noqa: BLE001
            pass
    from .forecaster import ShortHorizonForecaster

    return ShortHorizonForecaster(), "short_horizon"


def _maybe_gpu_forecast(
    series: Sequence[dict], horizon_steps: int, *, confidence: float = 0.9
) -> Optional[dict]:
    """Best-effort remote GPU forecast (env-gated, transparent).

    Returns the remote forecast dict (in the same ``MLForecaster.predict_next``
    schema) when ``PREDICT_GPU_URL`` is set AND the remote call succeeds with a
    usable ``point``; otherwise returns ``None`` to signal "use the local model".
    NEVER raises — a broken GPU box must never break a forecast. No torch import,
    no network unless the operator opted in.
    """
    try:
        from . import gpu_client
    except Exception:  # noqa: BLE001 - defensive
        return None
    if not gpu_client.gpu_configured():
        return None
    try:
        out = gpu_client.remote_forecast(
            series, int(max(1, horizon_steps)), confidence=confidence
        )
    except Exception:  # noqa: BLE001 - belt-and-suspenders; client already guards
        return None
    if not isinstance(out, dict) or out.get("status") != "ok" or out.get("point") is None:
        return None
    return out


# ══════════════════════════════════════════════════════════════════════════════
# 1. ISSUE
# ══════════════════════════════════════════════════════════════════════════════
def issue_forecast(
    asset: str,
    *,
    horizon_steps: int = 1,
    source: str = "crypto",
    model: str = "ml",
    confidence: float = 0.9,
    now_ts: Optional[int] = None,
    series: Optional[list[dict]] = None,
    db_path: Optional[str] = None,
    fast: bool = False,
) -> dict:
    """Issue ONE live forecast and persist it to the History Lake.

    Loads the live series (unless ``series`` is supplied for offline use), trains
    the chosen forecaster, produces a forecast ``horizon_steps`` ahead, and
    records it via ``history_lake.record_forecast`` with the forecast ``horizon``
    set so that ``issued_ts + horizon`` equals the target/resolve timestamp.

    Returns the persisted forecast row as a dict (incl. its ``id`` and the
    resolved ``resolve_ts``). On insufficient data returns ``{"status":
    "insufficient_data", ...}`` and persists nothing.
    """
    issued_ts = _now_ms(now_ts)
    h = int(max(1, horizon_steps))

    data = series if series is not None else _load_live_series(asset, source)
    if not data or len(data) < 3:
        return {
            "status": "insufficient_data",
            "asset": asset,
            "reason": f"only {len(data) if data else 0} points loaded",
        }

    values = [float(p["v"]) for p in data]
    ts = [float(p["t"]) for p in data if "t" in p]
    ts = ts if len(ts) == len(values) else None
    last_value = values[-1]

    # Optional GPU accelerator (env-gated, best-effort). When PREDICT_GPU_URL is
    # set we try the remote PyTorch+CUDA forecaster first; on any miss we fall
    # back to the local forecaster below. ``compute`` records which path ran.
    compute = "cpu"
    out: Optional[dict] = None
    train_rep: Any = None
    model_name = model
    gpu_out = _maybe_gpu_forecast(data, h, confidence=confidence)
    if gpu_out is not None:
        out = gpu_out
        compute = "gpu"
        model_name = out.get("model", "gpu_remote")
        train_rep = {"status": "remote_gpu", "model": model_name}

    if out is None:
        fc, model_name = _make_forecaster(model, fast=fast)
        train_rep = fc.train(data, horizon_steps=h)
        out = fc.predict_next(data, horizon_steps=h, confidence=confidence)

    if not isinstance(out, dict) or out.get("status") != "ok" or out.get("point") is None:
        return {
            "status": "insufficient_data",
            "asset": asset,
            "reason": (out or {}).get("reason", "forecaster could not produce a point"),
            "train": train_rep if isinstance(train_rep, dict) else None,
        }

    point = float(out["point"])
    interval = out.get("interval") or {}
    low = interval.get("low")
    high = interval.get("high")
    conf = interval.get("confidence", confidence)
    prob_up = out.get("prob_up")

    # horizon in HOURS so that issued_ts + horizon*3600_000 == resolve timestamp.
    step_hours = _step_hours(ts)
    horizon_hours = step_hours * h
    resolve_ts = issued_ts + int(round(horizon_hours * 3_600_000))

    drivers = {
        "baseline": last_value,            # persistence reference (for skill + direction)
        "last_value": last_value,
        "horizon_steps": h,
        "step_hours": step_hours,
        "resolve_ts": resolve_ts,
        "source": source,
        "asset": asset,
        "forecaster": out.get("model", model_name),
        "prob_up": prob_up,
        "method": out.get("method"),
        "compute": compute,
    }

    fid = _hl.record_forecast(
        question=f"{asset} {h}-step forward test",
        domain="crypto" if source.lower() in ("crypto", "fx") else "series",
        target=asset,
        horizon=horizon_hours,
        point=point,
        low=low,
        high=high,
        confidence=conf,
        probability=prob_up,
        method=out.get("method", model_name),
        drivers=drivers,
        issued_ts=issued_ts,
        db_path=db_path,
    )

    return {
        "status": "ok",
        "id": fid,
        "asset": asset,
        "source": source,
        "model": model_name,
        "issued_ts": issued_ts,
        "resolve_ts": resolve_ts,
        "horizon": horizon_hours,
        "horizon_steps": h,
        "point": point,
        "low": low,
        "high": high,
        "confidence": conf,
        "prob_up": prob_up,
        "baseline": last_value,
        "compute": compute,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 2. RESOLVE
# ══════════════════════════════════════════════════════════════════════════════
def resolve_value(
    asset: str,
    target_ts: int,
    source: str,
    *,
    series: Optional[list[dict]] = None,
) -> Optional[float]:
    """Fetch the realized price AT/AFTER ``target_ts`` from the live feed.

    Returns the first observed value whose timestamp is >= ``target_ts`` (the
    realized value once the horizon has elapsed), or ``None`` when the feed has
    no point at/after the target yet (so the forecast stays unscored and is
    retried later — we NEVER fabricate a realized value).

    ``series`` may be supplied to resolve offline (used by ``--simulate`` and the
    tests); otherwise the live feed for the source is queried.
    """
    target_ts = int(target_ts)
    data = series if series is not None else _load_live_series(asset, source)
    if not data:
        return None
    # find the earliest observation with t >= target_ts
    realized: Optional[float] = None
    best_t: Optional[int] = None
    for p in data:
        t = p.get("t")
        if t is None:
            continue
        t = int(t)
        if t >= target_ts and (best_t is None or t < best_t):
            best_t = t
            realized = float(p["v"])
    if realized is None:
        return None
    return realized


# ══════════════════════════════════════════════════════════════════════════════
# 3. SCORE
# ══════════════════════════════════════════════════════════════════════════════
def _directional_rollup(domain: Optional[str], *, db_path: Optional[str] = None) -> dict:
    """Compute a directional-accuracy roll-up over scored forecasts by joining
    forecast.point / drivers.baseline / realized actual. Returns
    ``{"n_directional": k, "directional_accuracy": acc|None}``.

    Direction is correct when ``sign(point - baseline) == sign(actual - baseline)``
    (a flat call, point==baseline, counts as correct only if actual==baseline).
    Reuses the History Lake tables read-only; never raises.
    """
    import json

    n = 0
    correct = 0
    try:
        conn = _hl._connect(db_path)
        try:
            q = """
                SELECT f.point AS point, f.drivers_json AS drivers,
                       o.actual_value AS actual
                FROM skill_score s
                JOIN forecast f ON f.id = s.forecast_id
                JOIN realized_outcome o ON o.forecast_id = s.forecast_id
            """
            args: list[Any] = []
            if domain is not None:
                q += " WHERE f.domain = ?"
                args.append(domain)
            for r in conn.execute(q, args).fetchall():
                point = r["point"]
                actual = r["actual"]
                if point is None or actual is None:
                    continue
                try:
                    drivers = json.loads(r["drivers"] or "{}")
                except (TypeError, ValueError):
                    drivers = {}
                base = drivers.get("baseline")
                if base is None:
                    continue
                base = float(base)
                pred_dir = (point > base) - (point < base)
                act_dir = (actual > base) - (actual < base)
                n += 1
                if pred_dir == act_dir:
                    correct += 1
        finally:
            conn.close()
    except Exception:  # noqa: BLE001
        return {"n_directional": 0, "directional_accuracy": None}
    return {
        "n_directional": n,
        "directional_accuracy": (correct / n) if n else None,
    }


def score_due(
    now_ts: Optional[int] = None,
    *,
    source_hint: str = "crypto",
    db_path: Optional[str] = None,
    resolver: Optional[Callable[[dict], Optional[float]]] = None,
) -> dict:
    """Score every matured forecast against its TRULY realized value.

    Delegates to ``history_lake.score_due_forecasts(now, resolver=...)`` where the
    default resolver reconstructs (asset, resolve_ts, source) from the forecast
    row's drivers and calls :func:`resolve_value`. A custom ``resolver`` may be
    injected (offline tests / simulate). Returns the number newly scored plus the
    refreshed scorecard (``skill_summary`` + directional roll-up).
    """
    import json

    now = _now_ms(now_ts)

    def _default_resolver(fr: dict) -> Optional[float]:
        try:
            drivers = json.loads(fr.get("drivers_json") or "{}")
        except (TypeError, ValueError):
            drivers = {}
        asset = drivers.get("asset") or fr.get("target")
        source = drivers.get("source") or source_hint
        resolve_ts = drivers.get("resolve_ts")
        if resolve_ts is None:
            horizon = fr.get("horizon") or 0.0
            resolve_ts = int(fr.get("issued_ts", now)) + int(round(float(horizon) * 3_600_000))
        if not asset:
            return None
        return resolve_value(asset, int(resolve_ts), source)

    use_resolver = resolver if resolver is not None else _default_resolver
    scored = _hl.score_due_forecasts(now, use_resolver, db_path=db_path)

    return {
        "scored": int(scored),
        "now_ts": now,
        "skill_summary": _scorecard(db_path=db_path),
    }


def _scorecard(domain: Optional[str] = None, *, db_path: Optional[str] = None) -> dict:
    """Assemble the full live scorecard: history_lake.skill_summary enriched with
    the directional roll-up. n, MAE, RMSE, coverage, mean skill, directional."""
    summary = _hl.skill_summary(domain, db_path=db_path)
    direction = _directional_rollup(domain, db_path=db_path)
    merged = dict(summary)
    merged.update(direction)
    return merged


def scorecard(domain: Optional[str] = None, *, db_path: Optional[str] = None) -> dict:
    """Public scorecard accessor (n_scored, MAE, RMSE, coverage, mean skill,
    directional accuracy) over all truly-realized, scored forecasts."""
    return _scorecard(domain, db_path=db_path)


# ══════════════════════════════════════════════════════════════════════════════
# 4. CONTINUOUS LOOP (opt-in)
# ══════════════════════════════════════════════════════════════════════════════
async def forward_test_loop(
    assets: Sequence[str],
    *,
    horizon_steps: int = 1,
    interval_s: float = 3600.0,
    source: str = "crypto",
    model: str = "ml",
    confidence: float = 0.9,
    max_iterations: Optional[int] = None,
) -> None:
    """Run the closed loop forever (or ``max_iterations`` times): each interval,
    issue a forecast for every asset and score any matured ones.

    OPT-IN: callers must explicitly start this (e.g. an app-startup task gated on
    ``FORWARD_TEST_ENABLE``); it never auto-runs on import. Safe by contract — a
    failure on one asset never aborts the loop.
    """
    it = 0
    while max_iterations is None or it < max_iterations:
        for asset in assets:
            try:
                issue_forecast(
                    asset,
                    horizon_steps=horizon_steps,
                    source=source,
                    model=model,
                    confidence=confidence,
                )
            except Exception:  # noqa: BLE001 - robust by contract
                pass
        try:
            score_due(source_hint=source)
        except Exception:  # noqa: BLE001
            pass
        it += 1
        if max_iterations is not None and it >= max_iterations:
            break
        await asyncio.sleep(interval_s)


def start_loop_if_enabled() -> Optional["asyncio.Task"]:
    """Start :func:`forward_test_loop` as a background asyncio task IFF
    ``FORWARD_TEST_ENABLE`` is truthy. Returns the task or ``None``. Intended to
    be called from an app-startup hook; never raises."""
    if not _truthy(os.environ.get("FORWARD_TEST_ENABLE")):
        return None
    assets = [
        a.strip()
        for a in os.environ.get("FORWARD_TEST_ASSETS", "bitcoin,ethereum,xrp").split(",")
        if a.strip()
    ]
    try:
        horizon = int(os.environ.get("FORWARD_TEST_HORIZON_STEPS", "1"))
    except ValueError:
        horizon = 1
    try:
        interval = float(os.environ.get("FORWARD_TEST_INTERVAL_S", "3600"))
    except ValueError:
        interval = 3600.0
    source = os.environ.get("FORWARD_TEST_SOURCE", "crypto")
    model = os.environ.get("FORWARD_TEST_MODEL", "ml")
    try:
        loop = asyncio.get_event_loop()
        return loop.create_task(
            forward_test_loop(
                assets,
                horizon_steps=horizon,
                interval_s=interval,
                source=source,
                model=model,
            )
        )
    except Exception:  # noqa: BLE001
        return None


# ══════════════════════════════════════════════════════════════════════════════
# SIMULATE — prove the closed loop end-to-end WITHOUT waiting real time
# ══════════════════════════════════════════════════════════════════════════════
def simulate_forward_test(
    assets: Sequence[str],
    *,
    horizon_steps: int = 1,
    n_origins: int = 8,
    train_window: int = 250,
    source: str = "crypto",
    model: str = "ml",
    confidence: float = 0.9,
    db_path: Optional[str] = None,
    series_by_asset: Optional[dict[str, list[dict]]] = None,
    fast: bool = True,
) -> dict:
    """Replay the FULL closed loop deterministically against known history.

    For each asset we fetch deep history (or use ``series_by_asset`` offline),
    pick ``n_origins`` as-of dates T, and for each T:
      * issue a forecast AS-OF T training ONLY on data <= T (no leakage), with the
        issued_ts set to the timestamp of T and the horizon set so the resolve
        time equals the timestamp of T+horizon,
      * immediately resolve against the KNOWN realized value at T+horizon,
      * record forecast + outcome + score via the SAME History Lake primitives,

    then return the accumulated live-style scorecard. This demonstrates exactly
    the issue->resolve->score flow the live loop runs, but compressed in time.
    """
    issued_total = 0
    scored_total = 0
    per_asset: list[dict] = []

    for asset in assets:
        if series_by_asset is not None:
            series = series_by_asset.get(asset) or []
        else:
            series = _load_live_series(asset, source)
        if len(series) < train_window + horizon_steps + 5:
            per_asset.append({"asset": asset, "skipped": True, "n": len(series)})
            continue

        # choose n_origins evenly spaced origins in [train_window, last-horizon)
        first = train_window
        last = len(series) - horizon_steps - 1
        if last <= first:
            per_asset.append({"asset": asset, "skipped": True, "n": len(series)})
            continue
        step = max(1, (last - first) // max(1, n_origins))
        origins = list(range(first, last + 1, step))[:n_origins]

        a_issued = 0
        a_scored = 0
        for oi in origins:
            prefix = series[: oi + 1]              # data <= T (no leakage)
            issued_ts = int(series[oi]["t"])
            target_idx = oi + horizon_steps
            target_ts = int(series[target_idx]["t"])

            res = issue_forecast(
                asset,
                horizon_steps=horizon_steps,
                source=source,
                model=model,
                confidence=confidence,
                now_ts=issued_ts,
                series=prefix,
                db_path=db_path,
                fast=fast,
            )
            if res.get("status") != "ok":
                continue
            a_issued += 1

            # resolve immediately against the KNOWN future value, then score via
            # the same score_due path (now >= every resolve_ts we just issued).
            resolver = _replay_resolver(series)
            out = score_due(
                now_ts=target_ts + 1,
                db_path=db_path,
                resolver=resolver,
            )
            a_scored = out["scored"]  # cumulative count across all due forecasts

        issued_total += a_issued
        per_asset.append({"asset": asset, "issued": a_issued, "n": len(series)})

    # final cumulative scorecard
    card = _scorecard(db_path=db_path)
    scored_total = card.get("n_scored", 0)
    return {
        "issued": issued_total,
        "scored": scored_total,
        "per_asset": per_asset,
        "scorecard": card,
    }


def _replay_resolver(series: list[dict]) -> Callable[[dict], Optional[float]]:
    """Build a resolver bound to a known full ``series`` that returns the realized
    value at/after each forecast's resolve_ts (from the forecast's drivers)."""
    import json

    def _resolver(fr: dict) -> Optional[float]:
        try:
            drivers = json.loads(fr.get("drivers_json") or "{}")
        except (TypeError, ValueError):
            drivers = {}
        resolve_ts = drivers.get("resolve_ts")
        if resolve_ts is None:
            horizon = fr.get("horizon") or 0.0
            resolve_ts = int(fr.get("issued_ts", 0)) + int(round(float(horizon) * 3_600_000))
        return resolve_value(fr.get("target") or "", int(resolve_ts), "replay", series=series)

    return _resolver
