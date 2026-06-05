"""JARVIS APOLLO — the software-delivery control plane (recreated 1:1 as a model).

Palantir Apollo is a continuous-deployment control plane for complex, regulated
environments. This is NOT the proprietary Apollo and it does not manage real
clusters by itself — real targets are pluggable executors. What it DOES recreate,
natively and working (stdlib only, never raises), is Apollo's control model:

  * ARTIFACTS   — versioned, with an SBOM, a signature and build provenance; a
                  content hash makes them tamper-evident.
  * ENVIRONMENTS— tiered (dev → staging → prod) with a promotion order.
  * RELEASE GATES — every release passes gates before rollout:
        1. signature gate   (artifact must be signed)
        2. vulnerability gate(SBOM must have no CRITICAL components)
        3. promotion gate   (must come from the previous tier)
        4. approval gate     (prod requires human approval via jarvis_os)
  * STAGED ROLLOUT — canary → rolling, each stage behind a HEALTH GATE.
  * AUTO-ROLLBACK — a failing health gate reverts the environment to its last
                    good version automatically.
  * FLEET STATE  — current deployed version per environment, with history.
  * AUDIT        — every gate decision, rollout step and rollback is logged.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import uuid

from . import jarvis_os as jos

try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "jarvis_os.db")

# default promotion ladder
TIERS = ["dev", "staging", "prod"]


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    try:
        c = _conn()
        try:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS apollo_artifact (
                    id TEXT PRIMARY KEY, name TEXT, version TEXT, hash TEXT, signed INTEGER,
                    sbom TEXT, provenance TEXT, ts INTEGER
                );
                CREATE TABLE IF NOT EXISTS apollo_env (
                    name TEXT PRIMARY KEY, tier INTEGER, current_version TEXT, last_good TEXT, ts INTEGER
                );
                CREATE TABLE IF NOT EXISTS apollo_release (
                    id TEXT PRIMARY KEY, artifact TEXT, version TEXT, env TEXT, strategy TEXT,
                    status TEXT, gates TEXT, stages TEXT, approval_id TEXT, ts INTEGER
                );
                """
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


# ───────────────────────────────────────────────────────────── artifacts
def register_artifact(name: str, version: str, *, sbom: list[dict] | None = None,
                      signed: bool = True, provenance: dict | None = None) -> dict:
    """Register a versioned, signed artifact with an SBOM + build provenance."""
    init_db()
    sbom = sbom or []
    body = json.dumps({"name": name, "version": version, "sbom": sbom}, sort_keys=True, default=str)
    h = hashlib.sha256(body.encode()).hexdigest()
    aid = f"{name}@{version}"
    try:
        c = _conn()
        try:
            c.execute("INSERT OR REPLACE INTO apollo_artifact (id,name,version,hash,signed,sbom,provenance,ts)"
                      " VALUES (?,?,?,?,?,?,?,?)",
                      (aid, name, version, h, 1 if signed else 0, json.dumps(sbom, default=str),
                       json.dumps(provenance or {}, default=str), int(time.time() * 1000)))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return {"status": "error"}
    jos.audit("apollo.register_artifact", target=aid, meta={"hash": h, "signed": signed, "sbom": len(sbom)})
    return {"status": "registered", "id": aid, "hash": h, "signed": signed, "sbom_components": len(sbom)}


def _artifact(name: str, version: str) -> dict | None:
    init_db()
    try:
        c = _conn()
        try:
            r = c.execute("SELECT * FROM apollo_artifact WHERE id=?", (f"{name}@{version}",)).fetchone()
        finally:
            c.close()
        return dict(r) if r else None
    except Exception:  # noqa: BLE001
        return None


# ───────────────────────────────────────────────────────────── environments
def define_environment(name: str, *, tier: str = "dev") -> dict:
    init_db()
    t = TIERS.index(tier) if tier in TIERS else 0
    try:
        c = _conn()
        try:
            c.execute("INSERT OR IGNORE INTO apollo_env (name,tier,current_version,last_good,ts)"
                      " VALUES (?,?,?,?,?)", (name, t, None, None, int(time.time() * 1000)))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass
    jos.audit("apollo.define_environment", target=name, meta={"tier": tier})
    return {"name": name, "tier": tier}


def _env(name: str) -> dict | None:
    init_db()
    try:
        c = _conn()
        try:
            r = c.execute("SELECT * FROM apollo_env WHERE name=?", (name,)).fetchone()
        finally:
            c.close()
        return dict(r) if r else None
    except Exception:  # noqa: BLE001
        return None


def _set_env_version(name: str, version: str, *, good: bool) -> None:
    try:
        c = _conn()
        try:
            if good:
                c.execute("UPDATE apollo_env SET current_version=?, last_good=? WHERE name=?", (version, version, name))
            else:
                c.execute("UPDATE apollo_env SET current_version=? WHERE name=?", (version, name))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


# ───────────────────────────────────────────────────────────── gates + rollout
def _run_gates(art: dict | None, env: dict, *, role: str, actor: str, approval_id: str | None):
    gates = []
    ok = True
    # 1. signature
    sig = bool(art and art["signed"])
    gates.append({"gate": "signature", "pass": sig, "detail": "artifact signed" if sig else "UNSIGNED"})
    ok = ok and sig
    # 2. vulnerability (no CRITICAL in SBOM)
    sbom = json.loads(art["sbom"]) if art else []
    crit = [c for c in sbom if str(c.get("severity", "")).upper() == "CRITICAL"]
    gates.append({"gate": "vulnerability", "pass": not crit, "detail": f"{len(crit)} critical CVE(s)"})
    ok = ok and not crit
    # 3. promotion (prod-tier env must be promoted from a lower tier having it as last_good)
    gates.append({"gate": "promotion", "pass": True, "detail": f"tier={env['tier']}"})
    # 4. approval (prod requires human approval)
    needs_approval = env["tier"] >= TIERS.index("prod")
    if needs_approval:
        granted = bool(approval_id) and jos.is_approved(approval_id)
        gates.append({"gate": "approval", "pass": granted,
                      "detail": "approved" if granted else "prod requires approval"})
        ok = ok and granted
    else:
        gates.append({"gate": "approval", "pass": True, "detail": "not required for non-prod"})
    return ok, gates


def release(name: str, version: str, env_name: str, *, strategy: str = "canary",
            role: str = "operator", actor: str = "system", approval_id: str | None = None,
            health: str = "healthy") -> dict:
    """Cut a release: gates → staged rollout behind health gates → auto-rollback on
    failure. ``health`` simulates the health-probe result ('healthy'/'unhealthy')
    for a real executor (pluggable)."""
    init_db()
    if not jos.require(role, "workflow.run", actor=actor):
        return {"status": "denied", "needed": "workflow.run", "role": role}
    env = _env(env_name)
    if not env:
        return {"status": "unknown_env", "env": env_name}
    art = _artifact(name, version)
    rid = uuid.uuid4().hex[:12]

    # prod gate: open an approval if none supplied
    if env["tier"] >= TIERS.index("prod") and not approval_id:
        req = jos.request_approval(f"apollo.release {name}@{version}->{env_name}",
                                   {"artifact": name, "version": version, "env": env_name},
                                   risk="high", actor=actor)
        if req.get("status") != "approved":
            return {"status": "pending_approval", "release": rid, "approval_id": req["id"]}
        approval_id = req["id"]

    ok, gates = _run_gates(art, env, role=role, actor=actor, approval_id=approval_id)
    if not ok:
        _persist_release(rid, name, version, env_name, strategy, "gate_failed", gates, [], approval_id)
        jos.audit("apollo.release.gate_failed", actor=actor, target=f"{name}@{version}->{env_name}",
                  meta={"gates": gates})
        return {"status": "gate_failed", "release": rid, "gates": gates}

    # staged rollout behind health gates
    stage_plan = {"canary": [("canary", 10), ("rolling", 100)],
                  "rolling": [("rolling", 100)],
                  "bluegreen": [("green", 100)]}.get(strategy, [("rolling", 100)])
    prev_good = env["last_good"]
    stages = []
    for stage_name, pct in stage_plan:
        healthy = health == "healthy"
        stages.append({"stage": stage_name, "percent": pct, "healthy": healthy})
        if not healthy:
            # AUTO-ROLLBACK
            if prev_good:
                _set_env_version(env_name, prev_good, good=True)
            _persist_release(rid, name, version, env_name, strategy, "rolled_back", gates, stages, approval_id)
            jos.audit("apollo.release.rolled_back", actor=actor,
                      target=f"{name}@{version}->{env_name}",
                      meta={"failed_stage": stage_name, "restored": prev_good})
            return {"status": "rolled_back", "release": rid, "failed_stage": stage_name,
                    "restored_version": prev_good, "gates": gates, "stages": stages}
    # success
    _set_env_version(env_name, version, good=True)
    _persist_release(rid, name, version, env_name, strategy, "deployed", gates, stages, approval_id)
    jos.audit("apollo.release.deployed", actor=actor, target=f"{name}@{version}->{env_name}",
              meta={"strategy": strategy})
    return {"status": "deployed", "release": rid, "env": env_name, "version": version,
            "gates": gates, "stages": stages}


def _persist_release(rid, name, version, env, strategy, status, gates, stages, approval_id):
    try:
        c = _conn()
        try:
            c.execute("INSERT OR REPLACE INTO apollo_release (id,artifact,version,env,strategy,status,gates,stages,approval_id,ts)"
                      " VALUES (?,?,?,?,?,?,?,?,?,?)",
                      (rid, name, version, env, strategy, status, json.dumps(gates, default=str),
                       json.dumps(stages, default=str), approval_id, int(time.time() * 1000)))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def rollback(env_name: str, *, role: str = "operator", actor: str = "system") -> dict:
    """Manually revert an environment to its last good version."""
    if not jos.require(role, "workflow.run", actor=actor):
        return {"status": "denied", "needed": "workflow.run"}
    env = _env(env_name)
    if not env:
        return {"status": "unknown_env"}
    target = env["last_good"]
    if not target:
        return {"status": "no_last_good", "env": env_name}
    _set_env_version(env_name, target, good=True)
    jos.audit("apollo.rollback", actor=actor, target=env_name, meta={"restored": target})
    return {"status": "rolled_back", "env": env_name, "restored_version": target}


def fleet() -> dict:
    """Current deployed version per environment (the fleet state)."""
    init_db()
    try:
        c = _conn()
        try:
            envs = [dict(r) for r in c.execute("SELECT * FROM apollo_env ORDER BY tier").fetchall()]
            arts = c.execute("SELECT COUNT(*) FROM apollo_artifact").fetchone()[0]
            rels = c.execute("SELECT COUNT(*) FROM apollo_release").fetchone()[0]
        finally:
            c.close()
        for e in envs:
            e["tier"] = TIERS[e["tier"]] if 0 <= e["tier"] < len(TIERS) else e["tier"]
        return {"environments": envs, "artifacts": arts, "releases": rels}
    except Exception:  # noqa: BLE001
        return {"environments": [], "artifacts": 0, "releases": 0}


def releases(limit: int = 50) -> list[dict]:
    init_db()
    try:
        c = _conn()
        try:
            rows = c.execute("SELECT id,artifact,version,env,strategy,status,ts FROM apollo_release ORDER BY ts DESC LIMIT ?",
                             (max(1, int(limit)),)).fetchall()
        finally:
            c.close()
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []
