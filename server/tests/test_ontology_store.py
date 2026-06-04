"""Ontology store tests — fully OFFLINE / deterministic.

No network and no API key. A temp DB is used (env ONTOLOGY_DB) so the real
on-disk store is never touched. Run:

    python3 -m pytest server/tests/test_ontology_store.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def ont(tmp_path, monkeypatch):
    """Reload ontology_store against a fresh temp DB for each test."""
    db = tmp_path / "test_ontology.db"
    monkeypatch.setenv("ONTOLOGY_DB", str(db))
    from server.services import ontology_store as os_store

    importlib.reload(os_store)
    os_store.init_db()
    return os_store


def _table_names(ont):
    conn = ont._connect()
    try:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        return {r["name"] for r in rows}
    finally:
        conn.close()


# ── DDL ──────────────────────────────────────────────────────────────────────────
def test_init_db_creates_tables(ont):
    names = _table_names(ont)
    for t in ("object_type", "object", "link", "object_action"):
        assert t in names, f"missing table {t}"


def test_init_db_idempotent(ont):
    ont.init_db()
    ont.init_db()
    assert "object" in _table_names(ont)


# ── Seed ─────────────────────────────────────────────────────────────────────────
def test_seed_from_static(ont):
    # Module import already seeds the (empty) temp DB; an explicit re-seed is a
    # no-op (returns 0) — what matters is the seeded state is present.
    ont.seed_from_static()
    assert len(ont.query_objects()) > 0
    sam = ont.get_object("sam")
    assert sam is not None
    assert sam["type"] == "person"
    assert sam["props"].get("Email") == "samkazangas@gmail.com"


def test_seed_idempotent(ont):
    ont.seed_from_static()
    first = len(ont.query_objects())
    again = ont.seed_from_static()
    assert again == 0
    assert len(ont.query_objects()) == first


def test_seed_creates_types(ont):
    ont.seed_from_static()
    types = {t["type_id"] for t in ont.list_types()}
    assert "person" in types
    assert "org" in types


# ── Query ────────────────────────────────────────────────────────────────────────
def test_query_by_type(ont):
    ont.seed_from_static()
    people = ont.query_objects(type="person")
    assert len(people) >= 3
    assert all(o["type"] == "person" for o in people)


def test_query_where_prop(ont):
    ont.seed_from_static()
    res = ont.query_objects(where={"Email": "samkazangas@gmail.com"})
    assert len(res) == 1
    assert res[0]["id"] == "sam"


def test_query_limit(ont):
    ont.seed_from_static()
    res = ont.query_objects(limit=2)
    assert len(res) == 2


# ── Upsert ───────────────────────────────────────────────────────────────────────
def test_upsert_new_object(ont):
    obj = ont.upsert_object({"id": "x1", "type": "org", "label": "Acme", "props": {"k": "v"}})
    assert obj is not None
    assert obj["id"] == "x1"
    assert obj["props"]["k"] == "v"
    assert ont.get_object("x1")["label"] == "Acme"


def test_upsert_merges_props(ont):
    ont.upsert_object({"id": "x2", "type": "org", "props": {"a": 1}})
    ont.upsert_object({"id": "x2", "type": "org", "props": {"b": 2}})
    obj = ont.get_object("x2")
    assert obj["props"] == {"a": 1, "b": 2}


def test_upsert_generates_id(ont):
    obj = ont.upsert_object({"type": "asset", "label": "auto"})
    assert obj is not None and obj["id"]


def test_delete_object(ont):
    ont.upsert_object({"id": "x3", "type": "org"})
    assert ont.delete_object("x3") is True
    assert ont.get_object("x3") is None


# ── Links ────────────────────────────────────────────────────────────────────────
def test_links_for(ont):
    ont.seed_from_static()
    links = ont.links_for("sam")
    assert len(links) > 0
    assert any(lk["b"] == "psg" or lk["a"] == "psg" for lk in links)


def test_upsert_link_idempotent(ont):
    ont.upsert_object({"id": "n1", "type": "org"})
    ont.upsert_object({"id": "n2", "type": "org"})
    ont.upsert_link("n1", "n2", "PARTNER", strength=2)
    ont.upsert_link("n1", "n2", "PARTNER", strength=5)
    links = ont.links_for("n1")
    partner = [lk for lk in links if lk["relation"] == "PARTNER"]
    assert len(partner) == 1
    assert partner[0]["strength"] == 5


# ── Governed write-back + audit ──────────────────────────────────────────────────
def test_apply_action_set_property_records_audit(ont):
    ont.seed_from_static()
    res = ont.apply_action("sam", "set_property", {"key": "Status", "value": "ACTIVE"}, actor="tester")
    assert res["ok"] is True
    # mutation persisted
    assert ont.get_object("sam")["props"]["Status"] == "ACTIVE"
    # audit row written
    audit = ont.list_actions("sam")
    assert len(audit) >= 1
    assert audit[0]["action"] == "set_property"
    assert audit[0]["actor"] == "tester"
    assert audit[0]["payload"]["value"] == "ACTIVE"


def test_apply_action_flag(ont):
    ont.seed_from_static()
    res = ont.apply_action("psg", "flag", {"flag": "review", "value": True})
    assert res["ok"] is True
    assert ont.get_object("psg")["props"]["flag:review"] is True


def test_apply_action_add_link(ont):
    ont.seed_from_static()
    res = ont.apply_action("sam", "add_link", {"to": "music", "relation": "TEST"})
    assert res["ok"] is True
    assert any(lk["relation"] == "TEST" for lk in ont.links_for("sam"))


def test_apply_action_rejects_unknown(ont):
    ont.seed_from_static()
    res = ont.apply_action("sam", "drop_table", {})
    assert res["ok"] is False
    assert res["error"] == "action not allowed"
    # rejection still audited
    assert any(a["action"] == "drop_table" for a in ont.list_actions("sam"))


def test_apply_action_missing_object(ont):
    res = ont.apply_action("nope", "set_property", {"key": "k", "value": "v"})
    assert res["ok"] is False
    assert res["error"] == "object not found"


# ── Neighbors ────────────────────────────────────────────────────────────────────
def test_neighbors_depth1(ont):
    ont.seed_from_static()
    res = ont.neighbors("sam", depth=1)
    assert res["center"] == "sam"
    ids = {o["id"] for o in res["objects"]}
    assert "psg" in ids
    assert "sam" not in ids  # center excluded
    assert len(res["links"]) > 0


def test_neighbors_depth2_expands(ont):
    ont.seed_from_static()
    d1 = ont.neighbors("sam", depth=1)
    d2 = ont.neighbors("sam", depth=2)
    assert len(d2["objects"]) >= len(d1["objects"])


def test_neighbors_missing_object(ont):
    res = ont.neighbors("ghost", depth=1)
    assert res["objects"] == []
    assert res["links"] == []
