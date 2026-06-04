"""METRICS — in-process observability registry (P0, stdlib-only).

A tiny, dependency-free metrics store for the JARVIS/APEX backend. It mirrors
the rest of the backend's doctrine: stdlib only (``numpy`` allowed but optional),
never raise — every public function degrades gracefully and returns a safe
value on error.

Two flavours of metric live in one registry:

  * **counters** — monotonically increasing tallies (``incr``). Keyed by
    ``name`` plus an optional sorted label set, so e.g.
    ``request_total{path=/v1/metrics,status=200}`` is its own series.
  * **timers / gauges** — value distributions (``observe``). Each series keeps a
    running count/sum/min/max so ``snapshot`` can report mean without storing
    every sample.

The registry is a module-level singleton guarded by a lock so the FastAPI
threadpool can update it concurrently. ``record_request(path, status, ms)`` is a
convenience that bumps a request counter and observes a latency timer — usable
from an ASGI middleware or anywhere else without importing Starlette.

``system_metrics()`` reports cheap process facts (RSS, uptime, python version).
``platform_summary()`` best-effort imports the platform's services and counts
the things that matter (ontology objects, datasets, alerts, cases, reports,
audit-chain length) — every count degrades to ``0`` when a store is empty or its
service can't be imported, so it is always safe to call (incl. offline / tests).
"""

from __future__ import annotations

import os
import platform
import sys
import threading
import time
from typing import Any, Optional

# ── registry state ───────────────────────────────────────────────────────────────
# Process start time, used by ``system_metrics`` for uptime. Captured at import.
_START_TS = time.time()

_LOCK = threading.Lock()

# counter series: key -> int. key is "name" or "name|k=v,k=v" (sorted labels).
_COUNTERS: dict[str, int] = {}
# timer/gauge series: key -> {count, sum, min, max, last}
_TIMERS: dict[str, dict[str, float]] = {}
# remember the human name + labels for each key so snapshot can render them.
_META: dict[str, dict[str, Any]] = {}


def _label_suffix(labels: Optional[dict]) -> str:
    """Render a label dict to a stable, sorted ``k=v,k=v`` suffix. Bad input → ''."""
    if not isinstance(labels, dict) or not labels:
        return ""
    try:
        parts = [f"{k}={labels[k]}" for k in sorted(labels, key=str)]
        return ",".join(parts)
    except Exception:  # noqa: BLE001 — labels must never break a metric write
        return ""


def _key(name: str, labels: Optional[dict]) -> str:
    suffix = _label_suffix(labels)
    return f"{name}|{suffix}" if suffix else str(name)


def _remember(key: str, name: str, labels: Optional[dict]) -> None:
    if key not in _META:
        _META[key] = {"name": str(name), "labels": dict(labels) if isinstance(labels, dict) else {}}


# ── writes ───────────────────────────────────────────────────────────────────────
def incr(name: str, by: float = 1, labels: Optional[dict] = None) -> None:
    """Increment a counter series ``name`` (with optional ``labels``) by ``by``.

    Defaults to +1. Negative/float values are accepted and coerced to int.
    Never raises.
    """
    try:
        delta = int(by)
    except (TypeError, ValueError):
        delta = 1
    key = _key(name, labels)
    with _LOCK:
        _COUNTERS[key] = _COUNTERS.get(key, 0) + delta
        _remember(key, name, labels)


def observe(name: str, value: float, labels: Optional[dict] = None) -> None:
    """Record a single ``value`` into a timer/gauge series ``name``.

    Keeps a running count/sum/min/max/last so the mean is available without
    retaining every sample. Non-finite/garbage values are ignored. Never raises.
    """
    try:
        v = float(value)
    except (TypeError, ValueError):
        return
    if v != v or v in (float("inf"), float("-inf")):  # NaN / inf guard (stdlib-only)
        return
    key = _key(name, labels)
    with _LOCK:
        slot = _TIMERS.get(key)
        if slot is None:
            _TIMERS[key] = {"count": 1.0, "sum": v, "min": v, "max": v, "last": v}
        else:
            slot["count"] += 1.0
            slot["sum"] += v
            slot["min"] = v if v < slot["min"] else slot["min"]
            slot["max"] = v if v > slot["max"] else slot["max"]
            slot["last"] = v
        _remember(key, name, labels)


def record_request(path: str, status: int, ms: float) -> None:
    """Convenience: tally one HTTP request and observe its latency.

    Bumps ``request_total{path,status}`` and observes ``request_latency_ms{path}``.
    ASGI-free — safe to call from a middleware or anywhere. Never raises.
    """
    try:
        status_i = int(status)
    except (TypeError, ValueError):
        status_i = 0
    p = str(path) if path is not None else ""
    incr("request_total", 1, {"path": p, "status": status_i})
    observe("request_latency_ms", ms, {"path": p})


def reset() -> None:
    """Clear all metrics. Intended for tests. Never raises."""
    with _LOCK:
        _COUNTERS.clear()
        _TIMERS.clear()
        _META.clear()


# ── snapshot ─────────────────────────────────────────────────────────────────────
def snapshot() -> dict:
    """Return a JSON-serialisable view of every metric in the registry.

    Shape::

        {
          "counters": [{"name", "labels", "value"}, ...],
          "timers":   [{"name", "labels", "count", "sum", "min", "max",
                        "mean", "last"}, ...],
        }

    Never raises; an empty registry yields empty lists.
    """
    with _LOCK:
        counters = []
        for key, value in _COUNTERS.items():
            meta = _META.get(key, {})
            counters.append(
                {
                    "name": meta.get("name", key),
                    "labels": meta.get("labels", {}),
                    "value": int(value),
                }
            )
        timers = []
        for key, slot in _TIMERS.items():
            meta = _META.get(key, {})
            count = slot.get("count", 0.0) or 0.0
            total = slot.get("sum", 0.0)
            mean = (total / count) if count else 0.0
            timers.append(
                {
                    "name": meta.get("name", key),
                    "labels": meta.get("labels", {}),
                    "count": int(count),
                    "sum": float(total),
                    "min": float(slot.get("min", 0.0)),
                    "max": float(slot.get("max", 0.0)),
                    "mean": float(mean),
                    "last": float(slot.get("last", 0.0)),
                }
            )
    return {"counters": counters, "timers": timers}


# ── system metrics ───────────────────────────────────────────────────────────────
def _rss_bytes() -> Optional[int]:
    """Best-effort resident-set-size in bytes.

    Tries ``resource.getrusage`` (ru_maxrss is KiB on Linux, bytes on macOS),
    falling back to reading ``/proc/self/statm``. Returns None if unavailable.
    """
    try:
        import resource  # POSIX-only; absent on Windows

        maxrss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        if maxrss:
            # Linux reports KiB, BSD/macOS report bytes. Heuristic: assume KiB on
            # linux, bytes elsewhere.
            if sys.platform == "darwin":
                return int(maxrss)
            return int(maxrss) * 1024
    except Exception:  # noqa: BLE001
        pass
    try:
        with open("/proc/self/statm", "r", encoding="ascii") as fh:
            fields = fh.read().split()
        if len(fields) >= 2:
            pages = int(fields[1])  # resident pages
            page_size = os.sysconf("SC_PAGE_SIZE") if hasattr(os, "sysconf") else 4096
            return pages * int(page_size)
    except Exception:  # noqa: BLE001
        pass
    return None


def system_metrics() -> dict:
    """Cheap process facts: RSS bytes, uptime seconds, pid, python + platform.

    Never raises; any field that cannot be resolved degrades to None/0.
    """
    rss = _rss_bytes()
    try:
        uptime = max(0.0, time.time() - _START_TS)
    except Exception:  # noqa: BLE001
        uptime = 0.0
    return {
        "pid": os.getpid(),
        "rss_bytes": rss,
        "rss_mb": round(rss / (1024 * 1024), 2) if rss else None,
        "uptime_s": round(uptime, 3),
        "python_version": platform.python_version(),
        "platform": sys.platform,
        "implementation": platform.python_implementation(),
    }


# ── platform summary ─────────────────────────────────────────────────────────────
def _safe_count(fn) -> int:
    """Run ``fn`` and return ``len`` of its result (or the int it returns).

    Any import/runtime failure → 0. Never raises.
    """
    try:
        out = fn()
    except Exception:  # noqa: BLE001 — a missing/broken service must not break the summary
        return 0
    if out is None:
        return 0
    if isinstance(out, int):
        return max(0, out)
    try:
        return len(out)
    except Exception:  # noqa: BLE001
        return 0


def platform_summary() -> dict:
    """Aggregate best-effort counts across the platform.

    Counts (each 0 when its store is empty OR its service can't be imported):
      * ``ontology_objects`` — rows in the ontology store.
      * ``datasets``         — registered datasets (pipelines catalog).
      * ``alerts``           — fired alerts.
      * ``cases``            — investigation cases.
      * ``reports``          — saved reports.
      * ``audit_length``     — entries in the hash-chained audit log.

    Always returns a dict of integer counts; never raises.
    """

    def _ontology_objects() -> int:
        from .ontology_store import query_objects

        return len(query_objects())

    def _datasets() -> int:
        from .pipelines import list_datasets

        return len(list_datasets())

    def _alerts() -> int:
        from .alerts import list_alerts

        return len(list_alerts())

    def _cases() -> int:
        from .cases import list_cases

        return len(list_cases())

    def _reports() -> int:
        from .reports import list_reports

        return len(list_reports())

    def _audit_length() -> int:
        from .audit import verify_chain

        chain = verify_chain()
        return int(chain.get("length", 0)) if isinstance(chain, dict) else 0

    return {
        "ontology_objects": _safe_count(_ontology_objects),
        "datasets": _safe_count(_datasets),
        "alerts": _safe_count(_alerts),
        "cases": _safe_count(_cases),
        "reports": _safe_count(_reports),
        "audit_length": _safe_count(_audit_length),
    }


# ── optional ASGI middleware (exported, NOT wired) ───────────────────────────────
async def metrics_middleware(request, call_next):
    """Optional Starlette/FastAPI HTTP middleware that records every request.

    Wire it (the app does NOT do this automatically) with::

        from .services.metrics import metrics_middleware
        app.middleware("http")(metrics_middleware)

    Measures wall-clock latency and calls :func:`record_request`. Records the
    request even when the handler raises (status 500), then re-raises. Never
    swallows the downstream response.
    """
    start = time.time()
    path = ""
    try:
        path = request.url.path
    except Exception:  # noqa: BLE001
        path = ""
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.time() - start) * 1000.0
        record_request(path, 500, elapsed_ms)
        raise
    elapsed_ms = (time.time() - start) * 1000.0
    status = getattr(response, "status_code", 0)
    record_request(path, status, elapsed_ms)
    return response
