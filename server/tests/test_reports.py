"""Reports + dashboards tests — fully OFFLINE / deterministic.

No network and no API key. Temp DBs are used (env REPORTS_DB + ONTOLOGY_DB) so
the real on-disk stores are never touched, and the ontology is seeded with the
static seed so a known entity ('sam') and its links are present. Run:

    python3 -m pytest server/tests/test_reports.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def svc(tmp_path, monkeypatch):
    """Reload reports + dashboards + ontology_store against fresh temp DBs."""
    monkeypatch.setenv("REPORTS_DB", str(tmp_path / "test_reports.db"))
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "test_ontology.db"))
    # Reload the ontology store first so its import-time seed targets the temp DB.
    from server.services import ontology_store as os_store

    importlib.reload(os_store)
    os_store.init_db()
    os_store.seed_from_static()

    from server.services import reports as reports_svc
    from server.services import dashboards as dash_svc

    importlib.reload(reports_svc)
    importlib.reload(dash_svc)
    reports_svc.init_db()
    dash_svc.init_db()
    return reports_svc, dash_svc, os_store


# ── brief generation ─────────────────────────────────────────────────────────────
def test_generate_brief_for_entity(svc):
    reports_svc, _dash, _os = svc
    brief = reports_svc.generate_brief(entity_ids=["sam"])
    md = brief["markdown"]
    # the entity itself appears
    assert "Sam Kazangas" in md
    # at least one of its linked neighbors appears (psg is linked to sam)
    assert "Project Solar Group" in md or "psg" in md
    # a non-empty Summary section exists
    summary = [s for s in brief["sections"] if s["title"] == "Summary"]
    assert summary and summary[0]["body"].strip()
    # structured sections present
    titles = {s["title"] for s in brief["sections"]}
    assert {"Summary", "Entities", "Relationships", "Risks", "Data"} <= titles


def test_generate_brief_by_query(svc):
    reports_svc, _dash, _os = svc
    brief = reports_svc.generate_brief(query="Sam")
    assert brief["title"]
    assert brief["markdown"].startswith("# ")


def test_generate_brief_empty_inputs_never_raises(svc):
    reports_svc, _dash, _os = svc
    brief = reports_svc.generate_brief()
    assert "Summary" in {s["title"] for s in brief["sections"]}


# ── saved-report round trip ──────────────────────────────────────────────────────
def test_save_get_list_export_round_trip(svc):
    reports_svc, _dash, _os = svc
    brief = reports_svc.generate_brief(entity_ids=["sam"])
    rid = reports_svc.save_report(brief["title"], brief["markdown"], meta={"k": "v"})
    assert rid is not None

    got = reports_svc.get_report(rid)
    assert got is not None
    assert got["title"] == brief["title"]
    assert got["body"] == brief["markdown"]
    assert got["meta"]["k"] == "v"

    listed = reports_svc.list_reports()
    assert any(r["id"] == rid for r in listed)

    md = reports_svc.export(rid, fmt="md")
    assert md == brief["markdown"]

    js = reports_svc.export(rid, fmt="json")
    import json

    parsed = json.loads(js)
    assert parsed["id"] == rid
    assert parsed["title"] == brief["title"]


def test_export_missing_report_returns_empty(svc):
    reports_svc, _dash, _os = svc
    assert reports_svc.export(999999, fmt="md") == ""


# ── dashboards ───────────────────────────────────────────────────────────────────
def test_save_dashboard_and_resolve_objects_widget(svc):
    _reports, dash_svc, os_store = svc
    widget = {"type": "stat", "source": "objects"}
    did = dash_svc.save_dashboard("Overview", [widget])
    assert did is not None

    dash = dash_svc.get_dashboard(did)
    assert dash is not None
    assert dash["name"] == "Overview"
    assert dash["widgets"][0]["source"] == "objects"

    resolved = dash_svc.resolve_widget(widget)
    # live count of objects matches the ontology store
    expected = len(os_store.query_objects())
    assert resolved["data"]["value"] == expected
    assert expected > 0


def test_resolve_objects_widget_filtered_by_type(svc):
    _reports, dash_svc, os_store = svc
    widget = {"type": "list", "source": "objects", "object_type": "person"}
    resolved = dash_svc.resolve_widget(widget)
    people = os_store.query_objects(type="person")
    assert resolved["data"]["value"] == len(people)
    assert all(it["type"] == "person" for it in resolved["data"]["items"])


def test_resolve_widget_unknown_source(svc):
    _reports, dash_svc, _os = svc
    resolved = dash_svc.resolve_widget({"type": "stat", "source": "nope"})
    assert resolved["data"]["value"] is None
    assert "error" in resolved["data"]


def test_dashboard_list_get_delete(svc):
    _reports, dash_svc, _os = svc
    did = dash_svc.save_dashboard("D1", [{"type": "stat", "source": "objects"}])
    assert any(d["id"] == did for d in dash_svc.list_dashboards())
    assert dash_svc.delete_dashboard(did) is True
    assert dash_svc.get_dashboard(did) is None


def test_resolve_dashboard_all_widgets(svc):
    _reports, dash_svc, _os = svc
    did = dash_svc.save_dashboard(
        "Multi",
        [
            {"type": "stat", "source": "objects"},
            {"type": "list", "source": "alerts"},
            {"type": "stat", "source": "skill"},
        ],
    )
    resolved = dash_svc.resolve_dashboard(did)
    assert resolved is not None
    assert len(resolved["resolved"]) == 3
