"""OPS tests — ALERTING/RULES engine + CASE MANAGEMENT. Fully OFFLINE.

No network and no API key. A temp DB is used (env OPS_DB) so the real on-disk
ops.db is never touched. Run:

    python3 -m pytest server/tests/test_ops.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def svc(tmp_path, monkeypatch):
    """Reload the alerts + cases services against a fresh temp DB per test."""
    db = tmp_path / "test_ops.db"
    monkeypatch.setenv("OPS_DB", str(db))
    from server.services import alerts as alerts_svc
    from server.services import cases as cases_svc

    importlib.reload(alerts_svc)
    importlib.reload(cases_svc)
    alerts_svc.init_db()
    cases_svc.init_db()
    return alerts_svc, cases_svc


# ── rules / alerts ───────────────────────────────────────────────────────────────
def test_tables_created(svc):
    alerts_svc, cases_svc = svc
    conn = alerts_svc._connect()
    try:
        names = {
            r["name"]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
    finally:
        conn.close()
    assert {"rule", "alert", "case"} <= names


def test_metric_rule_fires_and_ack(svc):
    alerts_svc, _ = svc

    rule_id = alerts_svc.create_rule(
        "big quake",
        {"metric": "earthquake_max_mag", "op": ">", "value": 5.0},
        target="earthquakes",
        severity=80,
    )
    assert rule_id is not None
    assert any(r["id"] == rule_id for r in alerts_svc.list_rules())

    # Context that should NOT fire.
    assert alerts_svc.evaluate({"earthquake_max_mag": 4.2}) == []
    assert alerts_svc.list_alerts() == []

    # Context that SHOULD fire.
    fired = alerts_svc.evaluate({"earthquake_max_mag": 6.1})
    assert len(fired) == 1
    alert_id = fired[0]["id"]

    open_alerts = alerts_svc.list_alerts(status="open")
    assert len(open_alerts) == 1
    assert open_alerts[0]["id"] == alert_id
    assert open_alerts[0]["rule_id"] == rule_id

    # Acknowledge it.
    assert alerts_svc.ack_alert(alert_id, "samkazangas@gmail.com") is True
    assert alerts_svc.list_alerts(status="open") == []
    acked = alerts_svc.list_alerts(status="acked")
    assert len(acked) == 1
    assert acked[0]["ack_by"] == "samkazangas@gmail.com"


def test_field_path_and_boolean_rules(svc):
    alerts_svc, _ = svc

    # Field-path leaf against a nested live-intel-style snapshot.
    alerts_svc.create_rule(
        "crypto dump",
        {"field": "markets.0.change_pct", "op": "<", "value": -5},
    )
    # Boolean composition.
    alerts_svc.create_rule(
        "quake AND dump",
        {
            "all": [
                {"metric": "earthquake_max_mag", "op": ">=", "value": 5},
                {"field": "markets.0.change_pct", "op": "<", "value": -5},
            ]
        },
    )

    ctx = {
        "earthquake_max_mag": 5.5,
        "markets": [{"sym": "XRP/AUD", "change_pct": -7.3}],
    }
    fired = alerts_svc.evaluate(ctx)
    assert len(fired) == 2  # both rules match

    # A context that matches neither.
    assert alerts_svc.evaluate({"earthquake_max_mag": 1.0, "markets": [{"change_pct": 1.0}]}) == []


def test_bad_rule_never_fires(svc):
    alerts_svc, _ = svc
    alerts_svc.create_rule("garbage", {"op": "??", "value": 1})
    alerts_svc.create_rule("missing field", {"field": "nope.nope", "op": ">", "value": 0})
    assert alerts_svc.evaluate({"x": 999}) == []


def test_disabled_rule_does_not_fire(svc):
    alerts_svc, _ = svc
    rid = alerts_svc.create_rule(
        "off", {"metric": "m", "op": ">", "value": 0}, enabled=False
    )
    assert alerts_svc.evaluate({"m": 100}) == []
    alerts_svc.set_rule_enabled(rid, True)
    assert len(alerts_svc.evaluate({"m": 100})) == 1


# ── cases ────────────────────────────────────────────────────────────────────────
def test_case_lifecycle(svc):
    _, cases_svc = svc

    case_id = cases_svc.create_case("Pangani DD anomaly", entity_ids=["pangani"])
    assert case_id is not None

    listed = cases_svc.list_cases()
    assert len(listed) == 1
    assert listed[0]["id"] == case_id
    assert listed[0]["entity_ids"] == ["pangani"]

    # Add a note.
    case = cases_svc.add_note(case_id, "Land law check pending", by="samkazangas@gmail.com")
    assert case is not None
    assert len(case["notes"]) == 1
    assert case["notes"][0]["text"] == "Land law check pending"
    assert case["notes"][0]["by"] == "samkazangas@gmail.com"

    # Attach an entity (deduped).
    case = cases_svc.attach_entity(case_id, "sam")
    assert set(case["entity_ids"]) == {"pangani", "sam"}
    case = cases_svc.attach_entity(case_id, "sam")  # dup
    assert case["entity_ids"].count("sam") == 1

    # Set status.
    case = cases_svc.set_status(case_id, "investigating")
    assert case["status"] == "investigating"
    assert cases_svc.get_case(case_id)["status"] == "investigating"


def test_case_ops_on_missing_id(svc):
    _, cases_svc = svc
    assert cases_svc.get_case(999) is None
    assert cases_svc.add_note(999, "x") is None
    assert cases_svc.attach_entity(999, "sam") is None
    assert cases_svc.set_status(999, "closed") is None
