"""JARVIS Agent OS.

A real, self-contained agent operating system for JARVIS. Every tool runs an
actual command or HTTP call and returns real data — there are no placeholder
handlers.

Modules
-------
    events      EventBus (BUS)            ring buffer + monotonic seq stream
    memory      durable agent memory      sqlite (server/data/agent_memory.db)
    permission  deterministic policy      decide(tool, args) -> verdict
    jobs        async job store/runner    sqlite (server/data/agent_jobs.db) + daemon threads
    tools       tool registry + REAL handlers (df/free/docker/pm2/ollama/brain/...)
    catalog     extra REAL handlers       registers the full tool catalog on import
    core        AgentCore (CORE)          LLM planner + permission-gated executor

Public surface (later wired into the dashboard, NOT in this run)
----------------------------------------------------------------
    from server.agent import CORE, BUS, tools, jobs, memory, permission, catalog

    run_id  = CORE.execute("how is disk and gpu looking?")  # async; stream via BUS
    stream  = BUS.since(0)        # or BUS.wait(cursor, 25) for the live UI long-poll
    palette = tools.all()         # render the tool palette
    ids     = catalog.CATALOG_IDS # the catalog tool ids registered on import

Importing this package never starts a server, never touches pm2, and never
mutates the dashboard. All optional submodule imports are best-effort: a
failure in one optional submodule (e.g. catalog) must not make the core agent
unimportable.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Direct-execution bootstrap
# ---------------------------------------------------------------------------
# A package __init__ has no parent package on sys.path when executed directly
# (`python server/agent/__init__.py`), so the relative imports below would fail
# with "attempted relative import with no known parent package". When that
# happens we put the repo root on sys.path, import the package by its real
# absolute name (which loads this very module the normal way), run the smoke
# test against it, and exit — so the module body below only ever runs in proper
# package context.
if __package__ in (None, ""):  # executed as a top-level script, not a package
    import importlib as _importlib
    import os as _os
    import sys as _sys

    _here = _os.path.dirname(_os.path.abspath(__file__))   # .../server/agent
    _repo = _os.path.dirname(_os.path.dirname(_here))      # repo root
    if _repo not in _sys.path:
        _sys.path.insert(0, _repo)
    _pkg = _importlib.import_module("server.agent")        # proper package load
    if __name__ == "__main__":
        _sys.exit(_pkg._smoke_test(_pkg))
    _sys.exit(0)

# --- Core submodules (required) -------------------------------------------
# These define the agent's contract. If any of these fail to import the package
# is genuinely broken, so we let the error surface.
from . import events  # noqa: F401
from . import memory  # noqa: F401
from . import permission  # noqa: F401
from . import jobs  # noqa: F401
from . import tools  # noqa: F401
from . import core  # noqa: F401

# --- Hoisted singletons / classes -----------------------------------------
from .events import BUS, EventBus  # noqa: F401
from .core import CORE, AgentCore  # noqa: F401

# --- Catalog (optional) ----------------------------------------------------
# `catalog` registers the REAL TOOL CATALOG on import. It depends on shell
# tooling and the box being describable; if it cannot import for any reason we
# must NOT take the whole Agent OS down with it — the base `tools` handlers
# stay available either way.
try:  # pragma: no cover - defensive
    from . import catalog  # noqa: F401  registers the catalog on import
    _CATALOG_OK = True
    _CATALOG_ERR = None
except Exception as _exc:  # noqa: BLE001 - never raise on import
    catalog = None  # type: ignore[assignment]
    _CATALOG_OK = False
    _CATALOG_ERR = repr(_exc)

__all__ = [
    "core",
    "events",
    "jobs",
    "memory",
    "permission",
    "tools",
    "catalog",
    "CORE",
    "AgentCore",
    "BUS",
    "EventBus",
    "status",
]

__version__ = "2.0.0"


def status() -> dict:
    """Return a cheap, side-effect-free snapshot of the imported Agent OS.

    Safe for a dashboard health check: it never starts work, never touches
    pm2, and never raises.
    """
    info: dict = {"version": __version__, "catalog_loaded": _CATALOG_OK}
    if not _CATALOG_OK:
        info["catalog_error"] = _CATALOG_ERR
    try:
        info["tool_count"] = len(tools.all())
    except Exception as exc:  # noqa: BLE001
        info["tool_count"] = -1
        info["tools_error"] = repr(exc)
    try:
        info["latest_seq"] = BUS.latest_seq()
    except Exception:  # noqa: BLE001
        info["latest_seq"] = None
    try:
        info["catalog_ids"] = list(getattr(catalog, "CATALOG_IDS", []) or [])
    except Exception:  # noqa: BLE001
        info["catalog_ids"] = []
    return info


def _smoke_test(pkg) -> int:
    """Self-contained smoke test. Returns a process exit code (0 == pass).

    Verifies the package wired everything together: submodules present, the
    CORE/BUS singletons are the right types, the tool registry is live, the
    EventBus round-trips, the permission policy is deterministic, and status()
    reports a healthy snapshot. Uses only the public surface.
    """
    failures = []

    def check(label: str, cond: bool, detail: str = "") -> None:
        mark = "ok " if cond else "FAIL"
        line = f"  [{mark}] {label}"
        if detail:
            line += f"  ({detail})"
        print(line)
        if not cond:
            failures.append(label)

    print("[smoke] server.agent imported — running checks ...")

    # 1. required submodules present
    for name in ("events", "memory", "permission", "jobs", "tools", "core"):
        check(f"submodule {name}", getattr(pkg, name, None) is not None)

    # 2. hoisted singletons / classes
    check("CORE is an AgentCore", isinstance(pkg.CORE, pkg.AgentCore))
    check("BUS is an EventBus", isinstance(pkg.BUS, pkg.EventBus))

    # 3. tool registry is live and non-empty
    try:
        registered = pkg.tools.all()
    except Exception as exc:  # noqa: BLE001
        registered = []
        print(f"  [FAIL] tools.all() raised: {exc!r}")
        failures.append("tools.all()")
    check("tools.all() non-empty", len(registered) > 0, f"{len(registered)} tools")

    # 4. EventBus emit/since round-trips
    try:
        seq0 = pkg.BUS.latest_seq()
        new_seq = pkg.BUS.emit("agent.thinking", {"smoke": True})
        out = pkg.BUS.since(seq0)
        got = any(e.get("data", {}).get("smoke") for e in out.get("events", []))
        check("BUS emit/since round-trip", new_seq > seq0 and got, f"seq {seq0}->{new_seq}")
    except Exception as exc:  # noqa: BLE001
        check("BUS emit/since round-trip", False, repr(exc))

    # 5. permission.decide is deterministic and never raises
    try:
        v_read = pkg.permission.decide("safe_read", {})
        v_dest = pkg.permission.decide("destructive", {})
        ok = (
            v_read.get("mode") == "auto"
            and v_dest.get("mode") == "confirm"
            and v_dest.get("requires_backup") is True
        )
        check("permission.decide policy", ok, f"read={v_read.get('mode')} dest={v_dest.get('mode')}")
    except Exception as exc:  # noqa: BLE001
        check("permission.decide policy", False, repr(exc))

    # 6. status() snapshot
    try:
        snap = pkg.status()
        check("status() snapshot", isinstance(snap, dict) and snap.get("tool_count", 0) > 0, str(snap))
    except Exception as exc:  # noqa: BLE001
        check("status() snapshot", False, repr(exc))

    print("")
    if failures:
        print(f"[smoke] FAILED: {len(failures)} check(s): {', '.join(failures)}")
        return 1
    print(
        f"[smoke] PASS — {len(registered)} tools, "
        f"catalog_loaded={pkg._CATALOG_OK}, version={pkg.__version__}"
    )
    return 0


# When imported normally as a package, `python -m server.agent` sets
# __name__ == "__main__" with proper package context, so run the smoke test
# directly. (Direct file execution is handled by the bootstrap at the top.)
if __name__ == "__main__":
    import sys as _sys2

    _sys2.exit(_smoke_test(_sys2.modules[__name__]))
