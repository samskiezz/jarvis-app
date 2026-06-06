"""The system must build itself on boot: orchestration is idempotent + never raises."""

from __future__ import annotations

from server.services import jarvis_autobuild as ab


def test_run_once_orchestrates_and_never_raises(monkeypatch):
    calls = []
    monkeypatch.setattr(ab, "_DOMAINS", {})  # keep live pipelines offline in tests
    # stub every heavy step so the test is fast + offline
    monkeypatch.setattr(ab, "docstore", type("D", (), {
        "restore": staticmethod(lambda: (calls.append("restore"), {"ok": True})[1]),
        "snapshot": staticmethod(lambda: (calls.append("snapshot"), {"ok": True})[1]),
        "stats": staticmethod(lambda: {"documents": 0}),
    }))
    monkeypatch.setattr(ab, "sysmod", type("S", (), {
        "startup": staticmethod(lambda: (calls.append("startup"), {"booted": True, "steps": {"a": 1}})[1]),
        "status": staticmethod(lambda: {"gotham": {"ontology_objects": 5}}),
    }))
    monkeypatch.setattr(ab, "grow", type("G", (), {
        "ensure_topics": staticmethod(lambda: (calls.append("topics"), 31)[1]),
    }))
    fin = []
    monkeypatch.setattr(ab, "scrape", type("C", (), {
        "document_finder": staticmethod(lambda **k: (fin.append(1), {"fetched": 3, "discovered": 5, "seeds": 6})[1]),
        "seeds_progress": staticmethod(lambda: {"crawled": 1, "total": 10}),
        "scraped_count": staticmethod(lambda: 3),
    }))

    out = ab.run_once(scrape_batches=2, depth=1)
    assert out["ok"] is True
    # ran the full chain in order
    assert "restore" in calls and "startup" in calls and "topics" in calls and "snapshot" in calls
    assert len(fin) == 2                      # two scrape batches
    assert out["fetched_this_run"] == 6       # 3 per batch
    assert out["status"]["gotham"]["ontology_objects"] == 5


def test_live_domains_strengthen_the_build(monkeypatch):
    monkeypatch.setattr(ab, "docstore", None)
    monkeypatch.setattr(ab, "scrape", None)
    monkeypatch.setattr(ab, "grow", None)
    monkeypatch.setattr(ab, "sysmod", type("S", (), {
        "startup": staticmethod(lambda: {"booted": True, "steps": {}}),
        "status": staticmethod(lambda: {}),
    }))
    fake = type("P", (), {"run_pipeline": staticmethod(lambda **k: {"ingested": 7})})
    monkeypatch.setattr(ab, "_DOMAINS", {"earthquake": fake, "cve": fake})
    out = ab.run_once(scrape_batches=0)
    assert out["steps"]["live_domains"] == {"earthquake": 7, "cve": 7}


def test_run_once_with_no_services_is_safe(monkeypatch):
    monkeypatch.setattr(ab, "_DOMAINS", {})
    monkeypatch.setattr(ab, "docstore", None)
    monkeypatch.setattr(ab, "sysmod", None)
    monkeypatch.setattr(ab, "scrape", None)
    monkeypatch.setattr(ab, "grow", None)
    out = ab.run_once(scrape_batches=0)
    assert out["ok"] is True  # degrades, never raises


def test_status_never_raises():
    assert isinstance(ab.status(), dict)
