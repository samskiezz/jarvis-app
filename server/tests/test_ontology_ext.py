"""Ontology EXT tests — fully OFFLINE / deterministic.

No network and no API key. Temp DBs are used (env ONTOLOGY_DB + ONTOLOGY_EXT_DB)
so the real on-disk stores are never touched. Run:

    python3 -m pytest server/tests/test_ontology_ext.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def ext(tmp_path, monkeypatch):
    """Reload ontology_store + ontology_ext against fresh temp DBs each test, and
    seed a couple of objects with numeric props directly via the store."""
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ont.db"))
    monkeypatch.setenv("ONTOLOGY_EXT_DB", str(tmp_path / "ont_ext.db"))

    from server.services import ontology_store as store

    importlib.reload(store)
    store.init_db()

    from server.services import ontology_ext as ext_mod

    importlib.reload(ext_mod)
    ext_mod.init_db()

    # Seed two "widget" objects with numeric props.
    store.upsert_object({"id": "w1", "type": "widget", "label": "Widget 1",
                         "props": {"a": 3, "b": 4, "tier": "gold"}})
    store.upsert_object({"id": "w2", "type": "widget", "label": "Widget 2",
                         "props": {"a": 10, "b": 5, "tier": "gold"}})
    store.upsert_object({"id": "x1", "type": "gadget", "label": "Gadget 1",
                         "props": {"a": 1, "b": 1, "tier": "silver"}})

    ext_mod._store = store  # expose for assertions
    return ext_mod


# ── #19 Computed functions + safe evaluator ────────────────────────────────────────
def test_compute_sums_numeric_props(ext):
    reg = ext.register_function("widget", "total", "a + b")
    assert reg["ok"] is True
    assert ext.compute("w1")["total"] == 7
    assert ext.compute("w2")["total"] == 15
    # function only applies to its own type
    assert "total" not in ext.compute("x1")


def test_compute_handles_expressions(ext):
    ext.register_function("widget", "ratio", "a / b")
    ext.register_function("widget", "flag", "a > b")
    out = ext.compute("w2")
    assert out["ratio"] == 2.0
    assert out["flag"] is True


def test_compute_missing_object_is_empty(ext):
    assert ext.compute("nope") == {}


def test_safe_eval_rejects_attribute_access(ext):
    res = ext.safe_eval("a.__class__", {"a": 1})
    assert res["ok"] is False
    assert res.get("value") is None or "value" not in res


def test_safe_eval_rejects_calls(ext):
    res = ext.safe_eval("__import__('os').system('echo hi')", {})
    assert res["ok"] is False
    # NEVER executed: error is reported instead of a value.
    assert "error" in res


def test_register_rejects_unsafe_expression(ext):
    res = ext.register_function("widget", "evil", "open('x')")
    assert res["ok"] is False
    # and it was not stored
    assert all(f["name"] != "evil" for f in ext.list_functions("widget"))


def test_safe_eval_accepts_arithmetic(ext):
    assert ext.safe_eval("2 * (3 + 4)", {})["value"] == 14


# ── #20 Object views ────────────────────────────────────────────────────────────────
def test_default_view_is_generated(ext):
    v = ext.get_view("widget")
    assert v["generated"] is True
    assert v["type_id"] == "widget"
    # observed props show up across summary+detail
    keys = set(v["summary"]) | set(v["detail"])
    assert {"a", "b", "tier"}.issubset(keys)


def test_set_and_get_view_round_trip(ext):
    res = ext.set_view("widget", {"summary": ["tier"], "detail": ["a", "b"]})
    assert res["ok"] is True
    v = ext.get_view("widget")
    assert v["summary"] == ["tier"]
    assert v["detail"] == ["a", "b"]
    assert v["generated"] is False


# ── #23 Object sets ──────────────────────────────────────────────────────────────────
def test_create_resolve_delete_set(ext):
    created = ext.create_set("gold widgets", {"type": "widget", "where": {"tier": "gold"}})
    assert created["ok"] is True
    sid = created["id"]

    assert any(s["id"] == sid for s in ext.list_sets())

    res = ext.resolve_set(sid)
    assert res["ok"] is True
    ids = {o["id"] for o in res["items"]}
    assert ids == {"w1", "w2"}  # live re-evaluation of the saved filter

    assert ext.delete_set(sid) is True
    assert ext.resolve_set(sid)["ok"] is False


def test_resolve_unknown_set(ext):
    res = ext.resolve_set("does-not-exist")
    assert res["ok"] is False
    assert res["items"] == []


# ── #24 Bulk action ──────────────────────────────────────────────────────────────────
def test_bulk_action_mutates_all_and_audits(ext):
    created = ext.create_set("widgets", {"type": "widget"})
    sid = created["id"]

    res = ext.bulk_action(sid, "set_property", {"key": "reviewed", "value": True}, actor="tester")
    assert res["ok"] is True
    assert res["count"] == 2
    assert all(r["ok"] for r in res["results"])

    store = ext._store
    for oid in ("w1", "w2"):
        obj = store.get_object(oid)
        assert obj["props"].get("reviewed") is True
        # audit row was recorded by apply_action
        actions = store.list_actions(oid)
        assert any(a["action"] == "set_property" for a in actions)


def test_bulk_action_with_inline_query(ext):
    res = ext.bulk_action({"type": "gadget"}, "flag", {"flag": "hot"}, actor="t")
    assert res["ok"] is True
    assert res["count"] == 1
    assert ext._store.get_object("x1")["props"].get("flag:hot") is True


# ── #26 Import / export round-trip ───────────────────────────────────────────────────
def test_export_import_round_trips(ext, tmp_path, monkeypatch):
    # link the two widgets so links survive the round-trip too
    store = ext._store
    store.upsert_link("w1", "w2", "PEER", strength=0.5)

    dump = ext.export_ontology()
    assert {o["id"] for o in dump["objects"]} >= {"w1", "w2", "x1"}
    assert any(lk["relation"] == "PEER" for lk in dump["links"])

    # Re-import into a brand new pair of DBs and confirm round-trip.
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ont2.db"))
    monkeypatch.setenv("ONTOLOGY_EXT_DB", str(tmp_path / "ont_ext2.db"))
    importlib.reload(store)
    store.init_db()
    importlib.reload(ext)
    ext.init_db()

    imp = ext.import_ontology(dump)
    assert imp["ok"] is True
    assert imp["objects"] >= 3
    assert imp["links"] >= 1

    w1 = store.get_object("w1")
    assert w1 is not None
    assert w1["props"]["a"] == 3
    assert any(lk["relation"] == "PEER" for lk in store.links_for("w1"))


def test_import_is_idempotent(ext):
    dump = ext.export_ontology()
    first = ext.import_ontology(dump)
    second = ext.import_ontology(dump)
    assert first["ok"] and second["ok"]
    # re-running yields the same object count (no duplicates created)
    assert len(ext._store.query_objects(type="widget")) == 2
