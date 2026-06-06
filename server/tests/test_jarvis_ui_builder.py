"""The interface must build itself from live data: a window per object type."""

from __future__ import annotations

import sqlite3

import pytest

from server.services import jarvis_ui_builder as ui


@pytest.fixture()
def db(tmp_path, monkeypatch):
    p = tmp_path / "brain.db"
    c = sqlite3.connect(p)
    c.execute("CREATE TABLE ont_object (id TEXT PRIMARY KEY, type TEXT, props TEXT, state TEXT, created_ts INT, updated_ts INT)")
    rows = [("DataSource", 92000), ("Document", 30000), ("Vulnerability", 55), ("Topic", 31)]
    i = 0
    for t, n in rows:
        for _ in range(min(n, 5)):  # a few rows each is enough to be counted
            c.execute("INSERT INTO ont_object VALUES (?,?,?,?,?,?)", (f"o{i}", t, "{}", "active", 0, 0)); i += 1
    c.commit(); c.close()
    monkeypatch.setattr(ui, "_db_path", lambda: str(p))
    ui.invalidate()
    return str(p)


def test_builds_a_window_per_object_type(db):
    s = ui.build_spec()
    types = {m["object_type"] for m in s["modules"]}
    assert {"DataSource", "Document", "Vulnerability", "Topic"} <= types
    # each window carries widgets + buttons + a render assignment
    for m in s["modules"]:
        assert m["widgets"] and m["buttons"] and "render" in m
        assert m["plane"] in ("foundry", "gotham", "apollo", "aip", "audit", "jarvis")


def test_grows_when_a_new_type_appears(db, monkeypatch):
    before = ui.build_spec()["object_types"]
    c = sqlite3.connect(db)
    c.execute("INSERT INTO ont_object VALUES ('newx','EarthquakeEvent','{}','observed',0,0)")
    c.commit(); c.close()
    ui.invalidate()
    after = ui.build_spec()
    assert after["object_types"] == before + 1
    assert any(m["object_type"] == "EarthquakeEvent" for m in after["modules"])


def test_render_auto_assigned_or_marked_gap(db):
    s = ui.build_spec()
    assert s["renders_assigned"] + len(s["render_gaps"]) == s["object_types"]
