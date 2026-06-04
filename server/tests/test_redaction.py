"""REDACTION tests — enforced classification marks (Palantir pillar #74-76).

Fully OFFLINE / deterministic. A temp ONTOLOGY_DB (and AUDIT_DB) is used so the
real on-disk stores are never touched. Run:

    python3 -m pytest server/tests/test_redaction.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def store(tmp_path, monkeypatch):
    """Fresh temp ontology + audit DBs, seeded with a PUBLIC and a RESTRICTED object."""
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "test_ontology.db"))
    monkeypatch.setenv("AUDIT_DB", str(tmp_path / "test_audit.db"))

    from server.services import ontology_store as os_store
    from server.services import audit as audit_svc

    importlib.reload(audit_svc)
    importlib.reload(os_store)
    os_store.init_db()
    audit_svc.init_db()

    os_store.upsert_object(
        {
            "id": "pub1",
            "type": "org",
            "label": "Public Co",
            "mark": "PUBLIC",
            "props": {"Note": "open info", "Website": "example.com"},
        }
    )
    os_store.upsert_object(
        {
            "id": "secret1",
            "type": "target",
            "label": "Secret Target",
            "mark": "RESTRICTED",
            "props": {"Goal": "$100M acquisition", "Plan": "classified"},
        }
    )
    return os_store


# ── service-level redaction ───────────────────────────────────────────────────────
def test_public_caller_sees_public_intact(store):
    from server.services import redaction

    pub = store.get_object("pub1")
    view = redaction.redact_object(pub, "PUBLIC")
    assert view["_redacted"] is False
    assert view["props"]["Note"] == "open info"
    assert view["props"]["Website"] == "example.com"
    assert view["mark"] == "PUBLIC"


def test_public_caller_sees_restricted_redacted(store):
    from server.services import redaction

    secret = store.get_object("secret1")
    view = redaction.redact_object(secret, "PUBLIC")
    assert view["_redacted"] is True
    # id/type/label/mark preserved so the node still shows it exists
    assert view["id"] == "secret1"
    assert view["type"] == "target"
    assert view["label"] == "Secret Target"
    assert view["mark"] == "RESTRICTED"
    # sensitive prop values replaced
    assert view["props"]["Goal"] == "[REDACTED]"
    assert view["props"]["Plan"] == "[REDACTED]"
    assert "$100M" not in str(view)
    assert "classified" not in str(view)


def test_restricted_caller_sees_both_intact(store):
    from server.services import redaction

    pub = redaction.redact_object(store.get_object("pub1"), "RESTRICTED")
    secret = redaction.redact_object(store.get_object("secret1"), "RESTRICTED")
    assert pub["props"]["Note"] == "open info"
    assert secret["_redacted"] is False
    assert secret["props"]["Goal"] == "$100M acquisition"
    assert secret["props"]["Plan"] == "classified"


# ── ranking / can_read ────────────────────────────────────────────────────────────
def test_can_read_ordering():
    from server.services import redaction

    assert redaction.can_read("PUBLIC", "PUBLIC") is True
    assert redaction.can_read("PUBLIC", "RESTRICTED") is False
    assert redaction.can_read("RESTRICTED", "PUBLIC") is True
    assert redaction.can_read("FINANCIAL", "INTERNAL") is True
    assert redaction.can_read("FINANCIAL", "PII") is False
    # fail closed: unknown clearance → PUBLIC; unknown mark → RESTRICTED
    assert redaction.can_read("MYSTERY", "INTERNAL") is False
    assert redaction.can_read("RESTRICTED", "MYSTERY") is True


def test_filter_denied_drop_removes_restricted(store):
    from server.services import redaction

    objs = [store.get_object("pub1"), store.get_object("secret1")]
    dropped = redaction.filter_denied(objs, "PUBLIC", drop=True)
    assert {o["id"] for o in dropped} == {"pub1"}
    redacted = redaction.filter_denied(objs, "PUBLIC", drop=False)
    assert {o["id"] for o in redacted} == {"pub1", "secret1"}


def test_audit_read_best_effort(store):
    from server.services import redaction
    from server.services import audit as audit_svc

    redaction.audit_read("tester", "PUBLIC", "secret1", False)
    rows = audit_svc.tail(5)
    assert any(r["action"] == "ontology.read.denied" for r in rows)


def test_never_raises_on_bad_input():
    from server.services import redaction

    assert redaction.redact_object(None, "PUBLIC") == {}
    assert redaction.redact_objects(None, "PUBLIC") == []
    assert redaction.filter_denied(None, "PUBLIC") == []
    assert redaction.clearance_for(None) == "PUBLIC"


# ── route-level smoke test via TestClient ─────────────────────────────────────────
def test_route_objects_redaction_smoke(store, monkeypatch):
    # The app reads ONTOLOGY_DB at call-time via store._db_path(), so the temp DB
    # seeded above is what the route sees.
    from fastapi.testclient import TestClient
    from server.main import app

    client = TestClient(app)

    # PUBLIC caller (no X-Clearance): restricted object stubbed/redacted.
    res = client.get("/v1/ontology/objects")
    assert res.status_code == 200
    by_id = {o["id"]: o for o in res.json()["items"]}
    assert by_id["pub1"]["props"]["Note"] == "open info"
    assert by_id["secret1"]["_redacted"] is True
    assert by_id["secret1"]["props"]["Goal"] == "[REDACTED]"

    # RESTRICTED clearance via header: everything intact.
    res2 = client.get("/v1/ontology/objects", headers={"X-Clearance": "RESTRICTED"})
    assert res2.status_code == 200
    by_id2 = {o["id"]: o for o in res2.json()["items"]}
    assert by_id2["secret1"]["_redacted"] is False
    assert by_id2["secret1"]["props"]["Goal"] == "$100M acquisition"
