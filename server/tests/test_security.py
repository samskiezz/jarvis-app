"""SECURITY tests — enforced ACL/classification + hash-chained audit log.

Fully OFFLINE. No network, no API key. A temp DB (env AUDIT_DB) is used so the
real on-disk audit.db is never touched. Run:

    python3 -m pytest server/tests/test_security.py -q
"""

import importlib
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402

from server.services import security as sec  # noqa: E402


# ── clearance / can_view ─────────────────────────────────────────────────────────
def test_can_view_enforces_clearance():
    # public sees only PUBLIC
    assert sec.can_view("PUBLIC", "public") is True
    assert sec.can_view("INTERNAL", "public") is False
    assert sec.can_view("FINANCIAL", "public") is False
    assert sec.can_view("PII", "public") is False
    assert sec.can_view("RESTRICTED", "public") is False

    # analyst sees PUBLIC/INTERNAL/FINANCIAL but not PII/RESTRICTED
    assert sec.can_view("FINANCIAL", "analyst") is True
    assert sec.can_view("INTERNAL", "analyst") is True
    assert sec.can_view("PII", "analyst") is False
    assert sec.can_view("RESTRICTED", "analyst") is False

    # admin sees everything
    for mark in sec.ALL_MARKS:
        assert sec.can_view(mark, "admin") is True


def test_can_view_fails_closed_on_unknowns():
    # unknown mark → treated as RESTRICTED (only admin)
    assert sec.can_view("MYSTERY", "analyst") is False
    assert sec.can_view("MYSTERY", "admin") is True
    # unknown role → treated as public
    assert sec.can_view("PUBLIC", "wizard") is True
    assert sec.can_view("INTERNAL", "wizard") is False


# ── redact ───────────────────────────────────────────────────────────────────────
def test_redact_masks_pii_for_low_role_not_admin():
    obj = {
        "id": "sam",
        "label": "Sam",
        "type": "person",
        "mark": "PII",
        "props": {"Email": "samkazangas@gmail.com", "Heritage": "Greek Cypriot"},
    }
    # admin sees raw PII props
    admin_view = sec.redact(obj, "admin")
    assert admin_view["props"]["Email"] == "samkazangas@gmail.com"
    assert admin_view["props"]["Heritage"] == "Greek Cypriot"

    # a role that cannot view PII at all gets a stub (no props leaked)
    analyst_view = sec.redact(obj, "analyst")
    assert "props" not in analyst_view or not analyst_view.get("props")
    assert analyst_view.get("redacted") is True
    assert "samkazangas@gmail.com" not in str(analyst_view)


def test_redact_masks_pii_props_in_viewable_object_for_low_role():
    # An INTERNAL object (analyst CAN view) that still carries a PII prop (Email):
    obj = {
        "id": "harrison",
        "label": "Harrison",
        "type": "person",
        "mark": "INTERNAL",
        "props": {"Email": "harrison@example.com", "Role": "Co-founder"},
    }
    view = sec.redact(obj, "analyst")
    assert view["props"]["Role"] == "Co-founder"  # non-PII prop preserved
    assert view["props"]["Email"] == "[REDACTED]"  # PII prop masked
    # admin sees it raw
    admin = sec.redact(obj, "admin")
    assert admin["props"]["Email"] == "harrison@example.com"


def test_redact_does_not_mutate_input():
    obj = {"id": "x", "mark": "PII", "props": {"Email": "a@b.com"}}
    sec.redact(obj, "analyst")
    assert obj["props"]["Email"] == "a@b.com"


# ── filter_objects ───────────────────────────────────────────────────────────────
def test_filter_objects_hides_restricted_from_public():
    objects = [
        {"id": "a", "mark": "PUBLIC", "props": {"k": "v"}},
        {"id": "t", "mark": "RESTRICTED", "props": {"Goal": "secret"}},
        {"id": "p", "mark": "PII", "props": {"Email": "x@y.com"}},
        {"id": "f", "mark": "FINANCIAL", "props": {"Net": "$1M"}},
    ]
    public = sec.filter_objects(objects, "public")
    ids = {o["id"] for o in public}
    assert ids == {"a"}  # only the PUBLIC object survives

    analyst = sec.filter_objects(objects, "analyst")
    a_ids = {o["id"] for o in analyst}
    assert a_ids == {"a", "f"}  # PUBLIC + FINANCIAL, not RESTRICTED/PII
    assert "secret" not in str(analyst)

    admin = sec.filter_objects(objects, "admin")
    assert {o["id"] for o in admin} == {"a", "t", "p", "f"}


def test_filter_objects_on_real_ontology():
    from server.data.ontology import OBJECTS

    public = sec.filter_objects(OBJECTS, "public")
    # No object in the seed ontology is marked PUBLIC, so public sees nothing.
    assert public == []
    # The $100M Target is RESTRICTED → hidden from analyst, visible to admin.
    analyst_ids = {o["id"] for o in sec.filter_objects(OBJECTS, "analyst")}
    assert "target" not in analyst_ids
    admin_ids = {o["id"] for o in sec.filter_objects(OBJECTS, "admin")}
    assert "target" in admin_ids


# ── role resolution ──────────────────────────────────────────────────────────────
def test_role_for_token(monkeypatch):
    monkeypatch.delenv("JARVIS_ROLES", raising=False)
    monkeypatch.setenv("JARVIS_API_KEY", "dev-key")
    assert sec.role_for_token("dev-key") == "admin"  # dev key → admin
    assert sec.role_for_token(None) == "public"      # no token → public
    assert sec.role_for_token("random") == "public"  # unknown → public

    monkeypatch.setenv("JARVIS_ROLES", "tok-an:analyst,tok-pub:public")
    assert sec.role_for_token("tok-an") == "analyst"
    assert sec.role_for_token("tok-pub") == "public"
    assert sec.role_for_token("dev-key") == "admin"  # still the dev super-user


# ── audit: hash chaining + tamper detection ──────────────────────────────────────
@pytest.fixture()
def audit(tmp_path, monkeypatch):
    db = tmp_path / "test_audit.db"
    monkeypatch.setenv("AUDIT_DB", str(db))
    from server.services import audit as audit_svc

    importlib.reload(audit_svc)
    audit_svc.init_db()
    return audit_svc, str(db)


def test_audit_record_chains_hashes(audit):
    audit_svc, _ = audit
    e1 = audit_svc.record("alice:admin", "entities.read", "sam", {"role": "admin"})
    e2 = audit_svc.record("bob:analyst", "audit.read", "audit_log", {"n": 10})
    e3 = audit_svc.record("alice:admin", "security.whoami", "self", {})

    assert e1 and e2 and e3
    # first row links to genesis
    assert e1["prev_hash"] == audit_svc.GENESIS
    # each subsequent row's prev_hash == previous row's hash
    assert e2["prev_hash"] == e1["hash"]
    assert e3["prev_hash"] == e2["hash"]
    # hashes are distinct, 64-hex sha256
    hashes = {e1["hash"], e2["hash"], e3["hash"]}
    assert len(hashes) == 3
    assert all(len(h) == 64 for h in hashes)

    result = audit_svc.verify_chain()
    assert result["ok"] is True
    assert result["length"] == 3


def test_verify_chain_detects_tamper(audit):
    audit_svc, db_path = audit
    audit_svc.record("alice:admin", "entities.read", "sam", {"role": "admin"})
    audit_svc.record("bob:analyst", "audit.read", "audit_log", {"n": 10})
    audit_svc.record("alice:admin", "security.whoami", "self", {})

    assert audit_svc.verify_chain()["ok"] is True

    # Tamper: mutate the content of an existing row directly in the DB without
    # recomputing its hash — the chain must now fail to verify.
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "UPDATE audit_log SET resource = ? WHERE id = ?",
            ("tampered-resource", 2),
        )
        conn.commit()
    finally:
        conn.close()

    result = audit_svc.verify_chain()
    assert result["ok"] is False
    assert result["broken_at"] == 2


def test_audit_tail_newest_first(audit):
    audit_svc, _ = audit
    audit_svc.record("a", "one", "r1")
    audit_svc.record("a", "two", "r2")
    audit_svc.record("a", "three", "r3")
    rows = audit_svc.tail(2)
    assert len(rows) == 2
    assert rows[0]["action"] == "three"  # newest first
    assert rows[1]["action"] == "two"


def test_audit_never_raises_on_bad_input(audit):
    audit_svc, _ = audit
    # None actor/action are coerced, not raised
    e = audit_svc.record(None, None, None, None)
    assert e is not None
    assert audit_svc.verify_chain()["ok"] is True
