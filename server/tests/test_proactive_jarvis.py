"""Tests for the Proactive JARVIS + Personality cluster.

Covers:
  * memory_store (remember, recall, summarize_user, traits)
  * persona_engine (listing, loading, setting, prompt building)
  * daddys_home (greeting structure, persona-specific salutation)
  * proactive_loop (notification store/list/ack/prune)

Runs offline, uses temp SQLite DBs, no API keys. Run from repo root:

    python3 -m pytest server/tests/test_proactive_jarvis.py -q
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest

# Isolate DBs for this test module
os.environ["MEMORY_DB"] = str(Path(__file__).resolve().parent / "_test_memory.db")
os.environ["PROACTIVE_DB"] = str(Path(__file__).resolve().parent / "_test_proactive.db")

from server.data import memory_store as mem
from server.services import persona_engine as pe
from server.services import daddys_home as dh
from server.services import proactive_loop as pl


# ── helpers ──────────────────────────────────────────────────────────────────

def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture(autouse=True)
def _cleanup():
    _run(mem.clear_user("test-user"))
    _run(mem.clear_user("anonymous"))
    yield
    _run(mem.clear_user("test-user"))
    _run(mem.clear_user("anonymous"))


# ── 1. memory_store ──────────────────────────────────────────────────────────

def test_remember_and_recall():
    r = _run(mem.remember("test-user", "fav_colour", "blue", importance=0.8))
    assert r["ok"] is True
    assert r["key"] == "fav_colour"
    rec = _run(mem.recall("test-user", key="fav"))
    assert len(rec) == 1
    assert rec[0]["value"] == "blue"
    assert rec[0]["importance"] == 0.8


def test_recall_without_key_returns_all():
    _run(mem.remember("test-user", "a", "1"))
    _run(mem.remember("test-user", "b", "2"))
    rec = _run(mem.recall("test-user", limit=10))
    keys = {row["key"] for row in rec}
    assert keys >= {"a", "b"}


def test_remember_overwrites_same_key():
    _run(mem.remember("test-user", "x", "old"))
    _run(mem.remember("test-user", "x", "new", importance=0.9))
    rec = _run(mem.recall("test-user", key="x"))
    assert len(rec) == 1
    assert rec[0]["value"] == "new"
    assert rec[0]["importance"] == 0.9


def test_forget_removes_memory():
    _run(mem.remember("test-user", "del_me", "val"))
    d = _run(mem.forget("test-user", "del_me"))
    assert d["ok"] is True
    assert d["deleted"] == 1
    rec = _run(mem.recall("test-user", key="del_me"))
    assert rec == []


def test_note_trait_and_get_traits():
    t = _run(mem.note_trait("test-user", "risk-averse", "Declines leveraged bets", confidence=0.7))
    assert t["ok"] is True
    traits = _run(mem.get_traits("test-user"))
    assert len(traits) == 1
    assert traits[0]["trait"] == "risk-averse"
    assert traits[0]["confidence"] == 0.7


def test_summarize_user_returns_profile():
    _run(mem.remember("test-user", "prefers_email", "true"))
    _run(mem.note_trait("test-user", "early_riser", "Logs in before 6am", confidence=0.6))
    prof = _run(mem.summarize_user("test-user"))
    assert prof["user_id"] == "test-user"
    assert prof["trait_count"] == 1
    assert prof["memory_count"] >= 1
    assert "Observed traits" in prof["profile_text"]
    assert "Top memories" in prof["profile_text"]


def test_recall_limit_respected():
    for i in range(5):
        _run(mem.remember("test-user", f"key{i}", f"val{i}"))
    rec = _run(mem.recall("test-user", limit=3))
    assert len(rec) == 3


# ── 2. persona_engine ────────────────────────────────────────────────────────

def test_list_personas_non_empty():
    personas = pe.list_personas()
    assert isinstance(personas, list)
    assert "butler" in personas
    assert "default" in personas


def test_load_persona_fallback():
    txt = pe._load_persona("nonexistent")
    assert isinstance(txt, str)
    assert len(txt) > 0


def test_set_and_get_active_persona():
    r = pe.set_active_persona("test-user", "tactical")
    assert r["ok"] is True
    assert r["persona"] == "tactical"
    assert pe.get_active_persona("test-user") == "tactical"


def test_build_system_prompt_contains_memory():
    _run(mem.remember("test-user", "prefers_tea", "Earl Grey"))
    prompt = _run(pe.build_system_prompt("butler", user_id="test-user"))
    assert "prefers_tea" in prompt or "Recent memories" in prompt or "Known traits" in prompt


def test_get_persona_with_memory():
    pkg = _run(pe.get_persona_with_memory("test-user"))
    assert "user_id" in pkg
    assert "persona" in pkg
    assert "prompt" in pkg


# ── 3. daddys_home ───────────────────────────────────────────────────────────

def test_greeting_structure():
    g = _run(dh.generate_greeting("test-user"))
    assert set(g) >= {"salutation", "status_summary", "health_alerts",
                      "simulation_results", "pending_proposals", "wit", "persona"}
    assert isinstance(g["salutation"], str)
    assert isinstance(g["wit"], str)


def test_greeting_persona_tactical():
    pe.set_active_persona("test-user", "tactical")
    g = _run(dh.generate_greeting("test-user"))
    assert g["persona"] == "tactical"
    assert "Tactical" in g["salutation"] or "systems nominal" in g["salutation"].lower()


def test_greeting_includes_memory_awareness():
    _run(mem.remember("test-user", "preference", "dark_mode"))
    g = _run(dh.generate_greeting("test-user"))
    assert "preference" in g["status_summary"].lower() or "stored" in g["status_summary"].lower()


# ── 4. proactive_loop ────────────────────────────────────────────────────────

def test_store_and_list_notification():
    n = _run(pl.store_notification("Test title", "Test body", severity="warning", category="test"))
    assert n["ok"] is True
    assert "id" in n
    items = _run(pl.list_notifications(acked=False, limit=10))
    assert any(i["title"] == "Test title" for i in items)


def test_ack_notification():
    n = _run(pl.store_notification("Ack me", "body", severity="info"))
    nid = n["id"]
    a = _run(pl.ack_notification(nid))
    assert a["ok"] is True
    assert a["acked"] is True
    items = _run(pl.list_notifications(acked=False, limit=10))
    assert not any(i["id"] == nid for i in items)


def test_prune_notifications():
    r = _run(pl.prune_notifications(older_than_seconds=0))
    assert r["ok"] is True
    assert "pruned" in r


def test_list_notifications_severity_filter():
    _run(pl.store_notification("High", "high body", severity="action"))
    _run(pl.store_notification("Low", "low body", severity="info"))
    actions = _run(pl.list_notifications(severity="action", acked=False, limit=10))
    assert all(i["severity"] == "action" for i in actions)
    assert any(i["title"] == "High" for i in actions)
