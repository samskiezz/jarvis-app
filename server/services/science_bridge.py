"""Bridge from the APEX backend to the underworld 489-method science registry.

The underworld package carries a large keyword->callable registry of
benchmark-verified scientific methods (sonar/submarine acoustics, meteor/impact,
ppm/atmospheric chemistry, buoys/oceanography, flight/aerodynamics, frequency/RF,
neurons, seismic, quantum, materials, ...). This module exposes a *graceful*
surface so APEX can list and run those methods without ever crashing if the
underworld dependencies aren't importable in this process.

Design rules:
  * The underworld import is best-effort and isolated in a try/except. If it
    fails, every public function returns a clear ``unavailable`` shape instead
    of raising — APEX boot/tests must never break on this bridge.
  * ``run_method`` catches *all* exceptions and returns an ``error`` dict.
"""
from __future__ import annotations

import inspect

# Best-effort import of the underworld science registry. If the underworld deps
# are missing in this process, the bridge degrades gracefully.
_IMPORT_ERROR: str | None = None
try:  # pragma: no cover - exercised both ways across environments
    from underworld.server.services.methods_registry import (
        ROUTES as _ROUTES,
        lookup as _lookup,
        run as _run,
    )
except Exception as exc:  # noqa: BLE001 - any failure must degrade, not raise
    _ROUTES = None
    _lookup = None
    _run = None
    _IMPORT_ERROR = f"{type(exc).__name__}: {exc}"


_UNAVAILABLE = {
    "status": "unavailable",
    "reason": "science engine not importable in this process",
}


def available() -> bool:
    """True when the underworld registry imported successfully."""
    return _ROUTES is not None and _run is not None


def _unavailable() -> dict:
    out = dict(_UNAVAILABLE)
    if _IMPORT_ERROR:
        out["detail"] = _IMPORT_ERROR
    return out


def _domain_of(fn) -> str:
    """Derive a human domain label from the callable's module name.

    Registry modules are named ``methods_<domain>`` (e.g. methods_physics,
    methods_rf). Strip the package path + ``methods_`` prefix.
    """
    mod = getattr(fn, "__module__", "") or ""
    leaf = mod.rsplit(".", 1)[-1]
    if leaf.startswith("methods_"):
        leaf = leaf[len("methods_"):]
    return leaf or "misc"


def _first_doc_line(fn) -> str:
    doc = inspect.getdoc(fn) or ""
    return doc.strip().split("\n", 1)[0].strip()


def list_methods() -> list[dict] | dict:
    """List every registry method as ``{key, domain, doc}`` grouped by domain.

    ``key`` is the primary keyword for the method (first keyword of its route),
    which is a valid ``field`` to pass to :func:`run_method`. Returns the
    ``unavailable`` dict if the registry didn't import.
    """
    if not available():
        return _unavailable()
    try:
        methods: list[dict] = []
        for keys, fn in _ROUTES:
            key = keys[0] if keys else getattr(fn, "__name__", "method")
            methods.append(
                {
                    "key": key,
                    "domain": _domain_of(fn),
                    "doc": _first_doc_line(fn),
                    "engine": getattr(fn, "__name__", str(fn)),
                    "aliases": list(keys),
                }
            )
        methods.sort(key=lambda m: (m["domain"], m["key"]))
        return methods
    except Exception as exc:  # noqa: BLE001 - never raise to the route
        return {"status": "error", "error": f"{type(exc).__name__}: {exc}"}


def run_method(field: str, params: dict | None = None) -> dict:
    """Run the registry method matched by ``field``.

    ``params`` is an optional dict of keyword arguments forwarded to the matched
    callable on a best-effort basis (the registry's own ``run`` only understands
    ``seed``; for richer control we call the looked-up callable directly when
    extra params are supplied). Never raises — all failures become an ``error``
    dict.
    """
    if not available():
        return _unavailable()

    params = params or {}
    try:
        # Fast path: no extra params -> use the registry's normalised runner,
        # honouring an optional integer seed.
        if not params or set(params) <= {"seed"}:
            seed = int(params.get("seed", 0)) if params else 0
            result = _run(field, seed=seed)
            if result is None:
                return {
                    "status": "error",
                    "error": f"no method matches field {field!r}",
                }
            return {"status": "ok", **result}

        # Rich path: caller supplied named arguments. Call the matched callable
        # directly with only the kwargs it actually accepts.
        fn = _lookup(field)
        if fn is None:
            return {"status": "error", "error": f"no method matches field {field!r}"}
        sig = inspect.signature(fn)
        accepts_kwargs = any(
            p.kind is inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()
        )
        if accepts_kwargs:
            kwargs = dict(params)
        else:
            kwargs = {k: v for k, v in params.items() if k in sig.parameters}
        data = fn(**kwargs)
        if not isinstance(data, dict):
            data = {"result": data}
        return {
            "status": "ok",
            "field": field,
            "engine": getattr(fn, "__name__", str(fn)),
            "data": {k: v for k, v in data.items()},
            "grounded": True,
        }
    except Exception as exc:  # noqa: BLE001 - bridge must never raise
        return {"status": "error", "error": f"{type(exc).__name__}: {exc}"}
