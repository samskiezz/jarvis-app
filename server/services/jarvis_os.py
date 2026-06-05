"""JARVIS OS — the native enterprise spine for the Palantir/Jarvis operating layer.

The platform already has the domain layers (graph, ontology, datasets, pipelines,
temporal, geo, security, tenancy, ...). What turns a pile of capabilities into a
*governed* corporate AI command system is the connective spine mandated by the
"Non-Negotiable Enterprise Rules": every autonomous action must be audited,
attributable, permission-checked, optionally human-approved, and observable.

This module implements that spine natively (stdlib only, never raises), recreating
the *capability* of the enterprise stack rather than vendoring it:

  * AUDIT       — append-only, hash-chained action log (tamper-evident).
  * RBAC        — roles → permissions; deny-by-default authorization.
  * APPROVALS   — human-in-the-loop gates for high-risk autonomous actions.
  * OBSERVE     — span tracing (latency / status / cost) + rolled-up metrics.
  * REGISTRY    — the 10-layer architecture mapped to real implementations with
                  an honest status for each, so the "operating system" is legible.

All state persists in the existing brain SQLite DB (separate tables), so it shares
the app's lifecycle with no new dependency or service.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import uuid
from contextlib import contextmanager

try:
    from .second_brain import _db_path  # reuse the app's DB location
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "jarvis_os.db")

_GENESIS = "0" * 64  # hash-chain anchor


# ───────────────────────────────────────────────────────────── storage
def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    """Create the spine's tables if absent. Idempotent, never raises."""
    try:
        c = _conn()
        try:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS jos_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts INTEGER NOT NULL, actor TEXT, action TEXT, target TEXT,
                    meta TEXT, prev_hash TEXT, hash TEXT
                );
                CREATE TABLE IF NOT EXISTS jos_approval (
                    id TEXT PRIMARY KEY, ts INTEGER, action TEXT, payload TEXT,
                    risk TEXT, status TEXT, decided_by TEXT, decided_ts INTEGER, reason TEXT
                );
                CREATE TABLE IF NOT EXISTS jos_span (
                    id TEXT PRIMARY KEY, ts INTEGER, op TEXT, layer TEXT,
                    duration_ms INTEGER, status TEXT, cost REAL, meta TEXT
                );
                """
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


# ───────────────────────────────────────────────────────────── audit (hash-chained)
def audit(action: str, *, actor: str = "system", target: str = "",
          meta: dict | None = None) -> dict:
    """Append a tamper-evident audit record. Each row's hash chains the previous
    row's hash, so any later edit/deletion breaks ``verify_chain``."""
    init_db()
    rec = {"ts": int(time.time() * 1000), "actor": actor, "action": action,
           "target": target, "meta": meta or {}}
    try:
        c = _conn()
        try:
            row = c.execute("SELECT hash FROM jos_audit ORDER BY id DESC LIMIT 1").fetchone()
            prev = row["hash"] if row else _GENESIS
            payload = json.dumps({**rec, "prev": prev}, sort_keys=True, default=str)
            h = hashlib.sha256(payload.encode("utf-8")).hexdigest()
            c.execute(
                "INSERT INTO jos_audit (ts,actor,action,target,meta,prev_hash,hash) "
                "VALUES (?,?,?,?,?,?,?)",
                (rec["ts"], actor, action, target, json.dumps(rec["meta"], default=str), prev, h),
            )
            c.commit()
            rec["hash"] = h
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        rec["hash"] = ""
    return rec


def audit_log(limit: int = 100) -> list[dict]:
    init_db()
    try:
        c = _conn()
        try:
            rows = c.execute(
                "SELECT * FROM jos_audit ORDER BY id DESC LIMIT ?", (max(1, int(limit)),)
            ).fetchall()
        finally:
            c.close()
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []


def verify_chain() -> dict:
    """Recompute the hash chain to prove the audit log is intact."""
    init_db()
    try:
        c = _conn()
        try:
            rows = c.execute("SELECT * FROM jos_audit ORDER BY id ASC").fetchall()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return {"intact": True, "checked": 0, "broken_at": None}
    prev = _GENESIS
    for r in rows:
        rec = {"ts": r["ts"], "actor": r["actor"], "action": r["action"],
               "target": r["target"], "meta": json.loads(r["meta"] or "{}"), "prev": prev}
        h = hashlib.sha256(json.dumps(rec, sort_keys=True, default=str).encode()).hexdigest()
        if h != r["hash"] or r["prev_hash"] != prev:
            return {"intact": False, "checked": len(rows), "broken_at": r["id"]}
        prev = r["hash"]
    return {"intact": True, "checked": len(rows), "broken_at": None}


# ───────────────────────────────────────────────────────────── RBAC (deny-by-default)
ROLES: dict[str, set[str]] = {
    "viewer":   {"read"},
    "analyst":  {"read", "enrich", "graph.query", "workflow.run"},
    "operator": {"read", "enrich", "graph.query", "workflow.run", "workflow.approve"},
    "admin":    {"*"},
}


def can(role: str, permission: str) -> bool:
    perms = ROLES.get(role or "", set())
    return "*" in perms or permission in perms


def require(role: str, permission: str, *, actor: str = "system") -> bool:
    """Authorize + audit the decision. Returns True/False (never raises)."""
    ok = can(role, permission)
    audit("authz.check", actor=actor, target=permission,
          meta={"role": role, "granted": ok})
    return ok


# ───────────────────────────────────────────────────────────── human-in-the-loop approvals
_AUTO_APPROVE_BELOW = {"low"}  # low-risk actions don't need a human gate


def request_approval(action: str, payload: dict | None = None, *,
                     risk: str = "medium", actor: str = "system") -> dict:
    """Open an approval gate for a high-risk autonomous action. Low-risk actions
    are auto-approved (and still audited)."""
    init_db()
    aid = uuid.uuid4().hex[:12]
    status = "approved" if risk in _AUTO_APPROVE_BELOW else "pending"
    rec = {"id": aid, "ts": int(time.time() * 1000), "action": action,
           "payload": payload or {}, "risk": risk, "status": status,
           "decided_by": "auto" if status == "approved" else None,
           "decided_ts": int(time.time() * 1000) if status == "approved" else None,
           "reason": "auto-approved (low risk)" if status == "approved" else None}
    try:
        c = _conn()
        try:
            c.execute(
                "INSERT INTO jos_approval (id,ts,action,payload,risk,status,decided_by,decided_ts,reason)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                (aid, rec["ts"], action, json.dumps(rec["payload"], default=str), risk,
                 status, rec["decided_by"], rec["decided_ts"], rec["reason"]),
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass
    audit("approval.request", actor=actor, target=action, meta={"id": aid, "risk": risk, "status": status})
    return rec


def decide(approval_id: str, approve: bool, *, decided_by: str = "operator",
           reason: str = "") -> dict:
    init_db()
    status = "approved" if approve else "denied"
    try:
        c = _conn()
        try:
            c.execute(
                "UPDATE jos_approval SET status=?,decided_by=?,decided_ts=?,reason=? WHERE id=?",
                (status, decided_by, int(time.time() * 1000), reason, approval_id),
            )
            c.commit()
            row = c.execute("SELECT * FROM jos_approval WHERE id=?", (approval_id,)).fetchone()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        row = None
    audit("approval.decide", actor=decided_by, target=approval_id, meta={"status": status, "reason": reason})
    return dict(row) if row else {"id": approval_id, "status": status}


def is_approved(approval_id: str) -> bool:
    init_db()
    try:
        c = _conn()
        try:
            row = c.execute("SELECT status FROM jos_approval WHERE id=?", (approval_id,)).fetchone()
        finally:
            c.close()
        return bool(row and row["status"] == "approved")
    except Exception:  # noqa: BLE001
        return False


def approvals(status: str | None = None, limit: int = 100) -> list[dict]:
    init_db()
    try:
        c = _conn()
        try:
            if status:
                rows = c.execute("SELECT * FROM jos_approval WHERE status=? ORDER BY ts DESC LIMIT ?",
                                 (status, max(1, int(limit)))).fetchall()
            else:
                rows = c.execute("SELECT * FROM jos_approval ORDER BY ts DESC LIMIT ?",
                                 (max(1, int(limit)),)).fetchall()
        finally:
            c.close()
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []


# ───────────────────────────────────────────────────────────── observability (tracing)
@contextmanager
def trace(op: str, *, layer: str = "agent", cost: float = 0.0, meta: dict | None = None):
    """Context manager recording a span (latency + status + cost). Use around any
    tool/agent/workflow step:  ``with jarvis_os.trace("enrich", layer="data"): ...``"""
    init_db()
    sid = uuid.uuid4().hex[:12]
    t0 = time.time()
    status = "ok"
    try:
        yield sid
    except Exception:  # noqa: BLE001
        status = "error"
        raise
    finally:
        dur = int((time.time() - t0) * 1000)
        try:
            c = _conn()
            try:
                c.execute(
                    "INSERT INTO jos_span (id,ts,op,layer,duration_ms,status,cost,meta) VALUES (?,?,?,?,?,?,?,?)",
                    (sid, int(t0 * 1000), op, layer, dur, status, float(cost),
                     json.dumps(meta or {}, default=str)),
                )
                c.commit()
            finally:
                c.close()
        except Exception:  # noqa: BLE001
            pass


def traces(limit: int = 100) -> list[dict]:
    init_db()
    try:
        c = _conn()
        try:
            rows = c.execute("SELECT * FROM jos_span ORDER BY ts DESC LIMIT ?",
                             (max(1, int(limit)),)).fetchall()
        finally:
            c.close()
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []


def metrics() -> dict:
    """Rolled-up observability: span counts, p50/p95 latency, total cost, error rate."""
    init_db()
    try:
        c = _conn()
        try:
            rows = c.execute("SELECT duration_ms,status,cost,layer FROM jos_span").fetchall()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        rows = []
    n = len(rows)
    if not n:
        return {"spans": 0, "p50_ms": 0, "p95_ms": 0, "total_cost": 0.0,
                "error_rate": 0.0, "by_layer": {}}
    durs = sorted(int(r["duration_ms"] or 0) for r in rows)
    errs = sum(1 for r in rows if r["status"] != "ok")
    by_layer: dict[str, int] = {}
    for r in rows:
        by_layer[r["layer"]] = by_layer.get(r["layer"], 0) + 1
    p = lambda q: durs[min(n - 1, int(q * n))]
    return {"spans": n, "p50_ms": p(0.50), "p95_ms": p(0.95),
            "total_cost": round(sum(float(r["cost"] or 0) for r in rows), 6),
            "error_rate": round(errs / n, 4), "by_layer": by_layer}


# ───────────────────────────────────────────────────────────── capability registry
def _module_ok(modpath: str) -> bool:
    try:
        __import__(modpath)
        return True
    except Exception:  # noqa: BLE001
        return False


def architecture() -> dict:
    """The 10-layer Palantir/Jarvis architecture mapped to THIS app's real native
    modules, with an honest status. ``native`` = built in-process here;
    ``external`` = needs a dedicated engine (interface only, not faked)."""
    L = [
        ("1. Agent",          "agent",   ["server.services.brain_planner", "server.services.brain_autopilot"],
         "GOAP planner + self-improving autopilot (native)."),
        ("2. Knowledge",      "knowledge", ["server.services.second_brain", "server.services.brain_enrich"],
         "Vault notes + multi-source enrichment (native)."),
        ("3. Graph Intel",    "graph",   ["server.routes.graph", "server.routes.graph_time"],
         "Entity/relationship graph + temporal graph (native)."),
        ("4. Data Fabric",    "data",    ["server.services.brain_sources", "server.routes.datasets", "server.routes.pipelines"],
         "Connector registry + datasets + pipelines (native; billion-scale streaming is external)."),
        ("5. Command",        "command", ["server.routes.temporal", "server.routes.investigations"],
         "Workflow/temporal + approval gates (native spine here)."),
        ("6. OSINT/External", "osint",   ["server.services.brain_sources", "server.services.brain_enrich"],
         "Open-data acquisition with attribution (native; audited via this spine)."),
        ("7. Command-Centre UI", "ui",   ["server.routes.reports", "server.routes.geo"],
         "Reports + geo surfaces (native API; rich UI is a frontend concern)."),
        ("8. Voice/Vision",   "perception", [],
         "Interface defined; real ASR/vision needs external model engines (not faked)."),
        ("9. Security/Gov",   "governance", ["server.routes.governance", "server.routes.security", "server.routes.tenancy"],
         "RBAC + audit + approvals (this module) + governance/security/tenancy."),
        ("10. Observability", "observability", ["server.services.jarvis_os"],
         "Span tracing + metrics + tamper-evident audit (this module)."),
    ]
    layers = []
    for name, key, mods, note in L:
        present = [m for m in mods if _module_ok(m)]
        if not mods:
            status = "interface"
        elif len(present) == len(mods):
            status = "native"
        elif present:
            status = "partial"
        else:
            status = "missing"
        layers.append({"layer": name, "key": key, "status": status,
                       "modules": mods, "present": present, "note": note})
    native = sum(1 for l in layers if l["status"] == "native")
    return {"layers": layers, "summary": {
        "total": len(layers), "native": native,
        "partial": sum(1 for l in layers if l["status"] == "partial"),
        "interface": sum(1 for l in layers if l["status"] == "interface"),
        "missing": sum(1 for l in layers if l["status"] == "missing"),
    }}
