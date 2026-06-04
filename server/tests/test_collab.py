"""COLLABORATION tests — notes / comments / activity / @mentions + the pipeline
SCHEDULER registry. Fully OFFLINE.

No network and no API key. Temp DBs are used (env COLLAB_DB / SCHEDULER_DB /
AUDIT_DB) so the real on-disk DBs are never touched. Run:

    python3 -m pytest server/tests/test_collab.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def svc(tmp_path, monkeypatch):
    """Reload collab + scheduler + audit against fresh temp DBs per test."""
    monkeypatch.setenv("COLLAB_DB", str(tmp_path / "collab.db"))
    monkeypatch.setenv("SCHEDULER_DB", str(tmp_path / "scheduler.db"))
    monkeypatch.setenv("AUDIT_DB", str(tmp_path / "audit.db"))
    # Default: scheduler OFF so the opt-in guard is exercised.
    monkeypatch.delenv("SCHEDULER_ENABLED", raising=False)

    from server.services import collab as collab_svc
    from server.services import scheduler_svc

    importlib.reload(collab_svc)
    importlib.reload(scheduler_svc)
    collab_svc.init_db()
    scheduler_svc.init_db()
    return collab_svc, scheduler_svc


# ── notes CRUD ────────────────────────────────────────────────────────────────────
def test_note_add_list_edit_delete(svc):
    collab_svc, _ = svc

    note = collab_svc.add_note("case", "42", "samkazangas@gmail.com", "initial finding")
    assert note is not None
    nid = note["id"]
    assert note["resource_type"] == "case"
    assert note["resource_id"] == "42"
    assert note["author"] == "samkazangas@gmail.com"
    assert note["deleted"] is False

    # list
    listed = collab_svc.list_notes("case", "42")
    assert len(listed) == 1
    assert listed[0]["id"] == nid

    # a different resource is isolated
    assert collab_svc.list_notes("object", "sam") == []

    # edit
    edited = collab_svc.edit_note(nid, "revised finding")
    assert edited is not None
    assert edited["body"] == "revised finding"
    assert edited["edited_ts"] is not None

    # delete (soft) -> hidden from default list
    assert collab_svc.delete_note(nid) is True
    assert collab_svc.list_notes("case", "42") == []
    # second delete is a no-op
    assert collab_svc.delete_note(nid) is False
    # edit on a deleted note returns None
    assert collab_svc.edit_note(nid, "x") is None


def test_note_ops_on_missing_id(svc):
    collab_svc, _ = svc
    assert collab_svc.get_note(999) is None
    assert collab_svc.edit_note(999, "x") is None
    assert collab_svc.delete_note(999) is False


# ── mentions ──────────────────────────────────────────────────────────────────────
def test_mentions_parse_and_link(svc):
    collab_svc, _ = svc

    note = collab_svc.add_note(
        "object", "pangani", "operator",
        "ping @sam and @pangani re land law, also @notarealentity",
    )
    assert note is not None
    by_id = {m["id"]: m for m in note["mentions"]}
    # @sam and @pangani are real ontology object ids -> linked
    assert by_id["sam"]["linked"] is True
    assert by_id["pangani"]["linked"] is True
    # an unknown token still parses, just not linked
    assert by_id["notarealentity"]["linked"] is False

    # standalone parser, dedup + email '@' guard (no false mention from email)
    parsed = collab_svc.parse_mentions("@sam @sam talk to sam@x.com @harrison")
    ids = [m["id"] for m in parsed]
    assert ids.count("sam") == 1          # deduped
    assert "harrison" in ids
    # 'x.com' from the email must NOT be parsed as a mention
    assert "x.com" not in ids


# ── activity feed ─────────────────────────────────────────────────────────────────
def test_activity_returns_recent_items(svc):
    collab_svc, _ = svc

    collab_svc.add_note("case", "1", "a", "first")
    collab_svc.add_note("case", "1", "b", "second")
    collab_svc.add_note("object", "sam", "c", "third @harrison")

    feed = collab_svc.activity(limit=10)
    assert len(feed) >= 3
    # newest-first
    assert feed[0]["body"] == "third @harrison"
    assert feed[0]["kind"] == "note"
    assert feed[0]["action"] == "note.added"
    # ts is monotonically non-increasing
    ts = [it["ts"] for it in feed if it.get("ts") is not None]
    assert ts == sorted(ts, reverse=True)


def test_activity_includes_audit_best_effort(svc):
    collab_svc, _ = svc
    # Record an audit entry into the temp AUDIT_DB; it should surface in activity.
    from server.services import audit

    importlib.reload(audit)
    audit.init_db()
    audit.record("samkazangas@gmail.com", "case.create", "case:7", {"title": "t"})

    collab_svc.add_note("case", "7", "operator", "kickoff")
    feed = collab_svc.activity(limit=20)
    kinds = {it["kind"] for it in feed}
    assert "note" in kinds
    assert "audit" in kinds


# ── scheduler registry ────────────────────────────────────────────────────────────
def test_schedule_create_list_toggle_persists(svc):
    _, sched = svc

    s = sched.schedule("nightly-ingest", "ingest_all", interval_s=3600, enabled=True)
    assert s is not None
    sid = s["id"]
    assert s["fn_key"] == "ingest_all"
    assert s["interval_s"] == 3600
    assert s["enabled"] is True
    assert s["fn_key_known"] is True

    listed = sched.list_schedules()
    assert any(x["id"] == sid for x in listed)

    # upsert on job_name (no duplicate row)
    sched.schedule("nightly-ingest", "ingest_all", interval_s=120, enabled=True)
    listed2 = sched.list_schedules()
    assert len(listed2) == 1
    assert listed2[0]["interval_s"] == 120

    # toggle persists
    toggled = sched.toggle(sid)
    assert toggled["enabled"] is False
    assert sched.get_schedule(sid)["enabled"] is False
    sched.set_enabled(sid, True)
    assert sched.get_schedule(sid)["enabled"] is True

    # unknown id
    assert sched.toggle(9999) is None
    assert sched.set_enabled(9999, True) is None


def test_run_due_skips_unknown_fn_key(svc):
    _, sched = svc
    sched.schedule("bogus", "no_such_job", interval_s=1, enabled=True)
    summaries = sched.run_due(now_ms=10**13)  # far future -> due
    assert len(summaries) == 1
    assert summaries[0]["status"] == "skipped"


def test_scheduler_loop_does_not_run_unless_enabled(svc, monkeypatch):
    _, sched = svc
    # SCHEDULER_ENABLED is unset by the fixture -> the loop must return
    # immediately (no infinite loop, no jobs run). Driven via asyncio.run with a
    # wait_for timeout so a regression that starts looping fails loudly rather
    # than hanging the suite. No pytest-asyncio plugin dependency.
    monkeypatch.delenv("SCHEDULER_ENABLED", raising=False)

    import asyncio

    async def _drive():
        await asyncio.wait_for(sched.scheduler_loop(tick_s=1), timeout=2.0)

    asyncio.run(_drive())
    assert sched.scheduler_enabled() is False


def test_scheduler_enabled_flag(svc, monkeypatch):
    _, sched = svc
    monkeypatch.setenv("SCHEDULER_ENABLED", "true")
    assert sched.scheduler_enabled() is True
    monkeypatch.setenv("SCHEDULER_ENABLED", "0")
    assert sched.scheduler_enabled() is False
