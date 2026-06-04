"""GOVERNANCE tests — fully OFFLINE / deterministic, temp DBs only.

Exercises purpose-based access (#77) + retention / subject-rights (#78) over
fresh temp SQLite DBs (env GOVERNANCE_DB / AUDIT_DB / ONTOLOGY_DB) so the real
on-disk stores are never touched. No network, no API key. Run:

    python3 -m pytest server/tests/test_governance.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def gov(tmp_path, monkeypatch):
    """Reload audit + ontology_store + governance against fresh temp DBs."""
    monkeypatch.setenv("AUDIT_DB", str(tmp_path / "audit.db"))
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ontology.db"))
    monkeypatch.setenv("GOVERNANCE_DB", str(tmp_path / "governance.db"))

    from server.services import audit as a
    importlib.reload(a)
    a.init_db()

    from server.services import ontology_store as o
    importlib.reload(o)
    o.init_db()

    from server.services import governance as g
    importlib.reload(g)
    g.init_db()
    return g, o, a


# ── purpose-based access (#77) ─────────────────────────────────────────────────────
def test_purpose_allow_deny_and_audited(gov):
    g, _o, a = gov
    res = g.register_purpose("fraud-review", "investigate fraud",
                             ["PUBLIC", "INTERNAL", "FINANCIAL"])
    assert res["ok"] is True
    assert "FINANCIAL" in res["allowed_marks"]

    listed = g.list_purposes()
    assert any(p["name"] == "fraud-review" for p in listed)

    # allow: FINANCIAL is permitted for this purpose.
    assert g.check_access("fraud-review", "FINANCIAL", actor="alice") is True
    # deny: PII is NOT in the purpose's allow-list.
    assert g.check_access("fraud-review", "PII", actor="alice") is False
    # deny: unknown purpose fails closed.
    assert g.check_access("no-such-purpose", "PUBLIC") is False

    # Decisions are written to the hash-chained audit ledger.
    actions = [r["action"] for r in a.tail(50)]
    assert "governance.access.allowed" in actions
    assert "governance.access.denied" in actions
    assert a.verify_chain()["ok"] is True


def test_log_use_persisted(gov):
    g, _o, _a = gov
    g.register_purpose("analytics", "agg analytics", ["INTERNAL"])
    uid = g.log_use("analytics", "obj-1", "bob")
    assert uid
    uses = g.list_uses("analytics")
    assert len(uses) == 1 and uses[0]["object_id"] == "obj-1"


# ── retention / due-for-deletion (#78) ──────────────────────────────────────────────
def test_retention_picks_aged_object(gov):
    g, o, _a = gov
    # Two objects of the same type; we'll age one of them past the TTL.
    fresh = o.upsert_object({"type": "note", "label": "fresh note"})
    aged = o.upsert_object({"type": "note", "label": "aged note"})
    assert fresh and aged

    # Backdate the aged object's created_ts to 40 days ago by writing directly.
    import sqlite3
    conn = sqlite3.connect(o._db_path())
    forty_days_ago = g._now_ms() - 40 * g._DAY_MS
    conn.execute("UPDATE object SET created_ts=? WHERE id=?",
                 (forty_days_ago, aged["id"]))
    conn.commit()
    conn.close()

    # Retain 'note' for 30 days → only the 40-day-old object is overdue.
    assert g.set_retention("note", 30)["ok"] is True
    due = g.due_for_deletion()
    due_ids = {d["id"] for d in due}
    assert aged["id"] in due_ids
    assert fresh["id"] not in due_ids
    aged_row = next(d for d in due if d["id"] == aged["id"])
    assert aged_row["ttl_days"] == 30
    assert aged_row["age_days"] >= 30


# ── subject-rights: erase is governed (#78) ─────────────────────────────────────────
def test_subject_erase_pending_then_execute_deletes_and_audits(gov):
    g, o, a = gov
    subject = o.upsert_object({"id": "person-1", "type": "person", "label": "Jane"})
    # Another object referencing the subject in a prop.
    ref = o.upsert_object({"type": "case", "label": "case-1",
                           "props": {"owner": "person-1"}})
    assert subject and ref

    # access request resolves immediately and gathers referencing objects.
    acc = g.subject_request("access", "person-1")
    assert acc["status"] == g.STATUS_DONE
    gathered = set(acc["result"]["object_ids"])
    assert "person-1" in gathered and ref["id"] in gathered

    # erase request lands as PENDING — nothing deleted yet.
    er = g.subject_request("erase", "person-1")
    assert er["status"] == g.STATUS_PENDING
    rid = er["id"]
    assert o.get_object("person-1") is not None  # still there

    pending = g.list_requests(status="PENDING")
    assert any(r["id"] == rid for r in pending)

    # missing approver rejected.
    assert g.execute_erasure(rid, "")["ok"] is False

    # governed execution with an approver deletes + audits.
    done = g.execute_erasure(rid, "officer-x")
    assert done["ok"] is True
    assert "person-1" in done["deleted"]
    assert o.get_object("person-1") is None  # actually deleted now
    assert o.get_object(ref["id"]) is None

    # request now DONE with the approver recorded.
    req = g.get_request(rid)
    assert req["status"] == g.STATUS_DONE and req["approver"] == "officer-x"

    # the erasure is in the tamper-evident ledger.
    actions = [r["action"] for r in a.tail(50)]
    assert "governance.subject.erase.executed" in actions
    assert a.verify_chain()["ok"] is True

    # re-executing an already-done request is rejected (idempotent guard).
    assert g.execute_erasure(rid, "officer-x")["ok"] is False
