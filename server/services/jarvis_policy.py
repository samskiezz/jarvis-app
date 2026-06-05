"""JARVIS POLICY — the Policy Decision Point (ABAC / PBAC) where clones usually die.

RBAC ("is this user an admin?") is not enough for a Palantir-grade platform. The
real question is: *can this subject, in this role, for this declared purpose, with
this clearance and these compartments, access this property of this object at this
classification, and perform this action?*

This module answers that natively (stdlib only, never raises), layering on the
``jarvis_os`` RBAC spine:

  * CLASSIFICATION  — ordered levels (UNCLASSIFIED < OFFICIAL < SECRET < TOPSECRET).
  * CLEARANCE       — each subject has a clearance level, a set of compartments
                      (need-to-know) and a set of permitted purposes.
  * RESOURCE LABELS — objects AND individual properties carry a classification
                      level + optional compartment.
  * DECISION (PDP)  — permit iff clearance ≥ resource level AND (no compartment or
                      subject holds it) AND (no purpose constraint or purpose
                      declared). Every decision is audited.
  * REDACTION       — ``view_object`` returns an object with properties the subject
                      may not see masked, instead of leaking them.

This is attribute-based + purpose-based access control with property-level
redaction — the security model, not "is_admin".
"""

from __future__ import annotations

import json
import sqlite3
import time

from . import jarvis_os as jos

try:
    from . import jarvis_ontology as ont
except Exception:  # noqa: BLE001
    ont = None  # type: ignore
try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "jarvis_os.db")

# ordered classification lattice
LEVELS = ["UNCLASSIFIED", "OFFICIAL", "SECRET", "TOPSECRET"]
_RANK = {lvl: i for i, lvl in enumerate(LEVELS)}


def _rank(level: str) -> int:
    return _RANK.get((level or "UNCLASSIFIED").upper(), 0)


# ───────────────────────────────────────────────────────────── storage
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
                CREATE TABLE IF NOT EXISTS jpol_subject (
                    id TEXT PRIMARY KEY, clearance TEXT, compartments TEXT, purposes TEXT, ts INTEGER
                );
                CREATE TABLE IF NOT EXISTS jpol_label (
                    resource_id TEXT, prop TEXT, level TEXT, compartment TEXT, purpose TEXT,
                    PRIMARY KEY (resource_id, prop)
                );
                """
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


# ───────────────────────────────────────────────────────────── subjects + labels
def set_subject(subject_id: str, *, clearance: str = "UNCLASSIFIED",
                compartments: list[str] | None = None, purposes: list[str] | None = None) -> dict:
    init_db()
    rec = {"id": subject_id, "clearance": clearance.upper(),
           "compartments": compartments or [], "purposes": purposes or []}
    try:
        c = _conn()
        try:
            c.execute("INSERT OR REPLACE INTO jpol_subject (id,clearance,compartments,purposes,ts) VALUES (?,?,?,?,?)",
                      (subject_id, rec["clearance"], json.dumps(rec["compartments"]),
                       json.dumps(rec["purposes"]), int(time.time() * 1000)))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass
    jos.audit("policy.set_subject", target=subject_id,
              meta={"clearance": rec["clearance"], "compartments": rec["compartments"]})
    return rec


def get_subject(subject_id: str) -> dict:
    init_db()
    try:
        c = _conn()
        try:
            r = c.execute("SELECT * FROM jpol_subject WHERE id=?", (subject_id,)).fetchone()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        r = None
    if not r:
        return {"id": subject_id, "clearance": "UNCLASSIFIED", "compartments": [], "purposes": []}
    return {"id": r["id"], "clearance": r["clearance"],
            "compartments": json.loads(r["compartments"] or "[]"),
            "purposes": json.loads(r["purposes"] or "[]")}


def classify(resource_id: str, *, prop: str = "", level: str = "OFFICIAL",
             compartment: str = "", purpose: str = "") -> dict:
    """Label an object (``prop=""``) or a single property with a classification."""
    init_db()
    try:
        c = _conn()
        try:
            c.execute("INSERT OR REPLACE INTO jpol_label (resource_id,prop,level,compartment,purpose) VALUES (?,?,?,?,?)",
                      (resource_id, prop, level.upper(), compartment, purpose))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass
    jos.audit("policy.classify", target=resource_id,
              meta={"prop": prop or "*", "level": level.upper(), "compartment": compartment})
    return {"resource_id": resource_id, "prop": prop or "*", "level": level.upper(),
            "compartment": compartment, "purpose": purpose}


def _label(resource_id: str, prop: str = "") -> dict | None:
    init_db()
    try:
        c = _conn()
        try:
            r = c.execute("SELECT * FROM jpol_label WHERE resource_id=? AND prop=?", (resource_id, prop)).fetchone()
        finally:
            c.close()
        return dict(r) if r else None
    except Exception:  # noqa: BLE001
        return None


# ───────────────────────────────────────────────────────────── the PDP
def decide(subject_id: str, action: str, resource_id: str, *, prop: str = "",
           purpose: str = "") -> dict:
    """The runtime access decision. Returns {permit, reason, ...} and audits it."""
    subj = get_subject(subject_id)
    # the effective label = the most restrictive of object-level and property-level
    obj_label = _label(resource_id, "")
    prop_label = _label(resource_id, prop) if prop else None
    req_level = max(_rank(obj_label["level"]) if obj_label else 0,
                    _rank(prop_label["level"]) if prop_label else 0)
    req_compartments = {l["compartment"] for l in (obj_label, prop_label) if l and l.get("compartment")}
    req_purposes = {l["purpose"] for l in (obj_label, prop_label) if l and l.get("purpose")}

    permit, reason = True, "permit"
    if _rank(subj["clearance"]) < req_level:
        permit, reason = False, f"clearance {subj['clearance']} < required {LEVELS[req_level]}"
    elif req_compartments and not req_compartments.issubset(set(subj["compartments"])):
        permit, reason = False, f"missing compartment(s) {sorted(req_compartments - set(subj['compartments']))}"
    elif req_purposes and purpose not in req_purposes:
        permit, reason = False, f"purpose '{purpose or '∅'}' not in allowed {sorted(req_purposes)}"

    decision = {"permit": permit, "reason": reason, "subject": subject_id, "action": action,
                "resource": resource_id, "prop": prop or "*",
                "required_level": LEVELS[req_level], "subject_clearance": subj["clearance"]}
    jos.audit("policy.decide", actor=subject_id, target=f"{resource_id}.{prop or '*'}",
              meta={"permit": permit, "reason": reason, "action": action, "purpose": purpose})
    return decision


def view_object(subject_id: str, object_id: str, *, purpose: str = "") -> dict:
    """Return an ontology object with properties the subject may NOT see redacted,
    rather than leaking them. Object-level denial returns a stub."""
    if ont is None:
        return {"status": "ontology_unavailable"}
    obj = ont.get_object(object_id)
    if not obj:
        return {"status": "not_found", "id": object_id}
    # object-level gate first
    top = decide(subject_id, "read", object_id, purpose=purpose)
    if not top["permit"]:
        return {"id": object_id, "type": obj["type"], "state": obj["state"],
                "redacted": True, "reason": top["reason"], "props": {}}
    # property-level redaction
    subj = get_subject(subject_id)
    safe, redacted = {}, []
    for k, v in (obj.get("props") or {}).items():
        d = decide(subject_id, "read", object_id, prop=k, purpose=purpose)
        if d["permit"]:
            safe[k] = v
        else:
            lvl = (_label(object_id, k) or {}).get("level", "CLASSIFIED")
            safe[k] = f"▮▮▮ [{lvl}]"
            redacted.append(k)
    return {"id": object_id, "type": obj["type"], "state": obj["state"],
            "subject_clearance": subj["clearance"], "props": safe,
            "redacted_props": redacted, "redacted": bool(redacted)}


def summary() -> dict:
    init_db()
    try:
        c = _conn()
        try:
            subs = c.execute("SELECT COUNT(*) FROM jpol_subject").fetchone()[0]
            labels = c.execute("SELECT COUNT(*) FROM jpol_label").fetchone()[0]
        finally:
            c.close()
        return {"levels": LEVELS, "subjects": subs, "labels": labels}
    except Exception:  # noqa: BLE001
        return {"levels": LEVELS, "subjects": 0, "labels": 0}
