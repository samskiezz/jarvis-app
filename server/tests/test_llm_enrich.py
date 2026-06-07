"""Deep + concurrent self-enrichment, verified FULLY OFFLINE with a mock model.

No network: the LLM seam (``llm_research.llm_complete`` / ``available`` / ``backend``)
is monkeypatched to a fake backend, ``document_store.all_docs`` returns fake docs, and
both ENRICH_DB and BRAIN_DB point at temp files. Proves the resumable marker design,
the deeper multi-pass note injection, the concurrency path, and graceful no-LLM
behaviour — all in well under 8s.
"""

import importlib

from server.services import llm_enrich as le
from server.services import llm_research as lr
from server.services import document_store as ds
from server.services import second_brain as sb


def _fake_docs():
    return [
        {"id": "d1", "url": "https://ex/1", "title": "Doc One",
         "full_text": "Acme Corp signed a deal with Globex in Berlin using System X."},
        {"id": "d2", "url": "https://ex/2", "title": "Doc Two",
         "full_text": "The summit in Paris involved Alice and the United Nations."},
        {"id": "d3", "url": "https://ex/3", "title": "Doc Three",
         "full_text": "A report on satellite imagery from the Pacific fleet."},
        {"id": "d4", "url": "", "title": "Empty Doc", "full_text": "   "},
    ]


def _fake_complete(prompt, *, system="", max_tokens=400, fmt=None, temperature=0.2):
    # Deterministic per-pass output keyed off the prompt instructions.
    if "bullet points" in prompt:
        return "- key fact one\n- key fact two"
    if "named entities" in prompt:
        return '{"people": ["Alice"], "organizations": ["Acme Corp"]}'
    if "relationships and claims" in prompt:
        return "- Acme Corp — partnered_with — Globex"
    if "analyst questions" in prompt:
        return "Q: Who signed? A: Acme Corp."
    return "generic"


def _wire(monkeypatch, tmp_path, *, depth="3", workers="2"):
    monkeypatch.setenv("ENRICH_DB", str(tmp_path / "enrich.db"))
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "brain.db"))
    monkeypatch.setenv("ENRICH_DEPTH", depth)
    monkeypatch.setenv("ENRICH_WORKERS", workers)
    monkeypatch.setattr(lr, "available", lambda: True)
    monkeypatch.setattr(lr, "backend", lambda: "ollama-fake")
    monkeypatch.setattr(lr, "llm_complete", _fake_complete)
    monkeypatch.setattr(ds, "all_docs", lambda limit=None: _fake_docs())


def test_no_llm_is_graceful(monkeypatch, tmp_path):
    monkeypatch.setenv("ENRICH_DB", str(tmp_path / "enrich.db"))
    monkeypatch.setattr(lr, "available", lambda: False)
    out = le.enrich_documents(limit=5)
    assert out["available"] is False
    assert out["enriched"] == 0
    assert "reason" in out


def test_deep_passes_write_multiple_note_kinds(monkeypatch, tmp_path):
    _wire(monkeypatch, tmp_path, depth="3", workers="1")
    out = le.enrich_documents(limit=10)
    assert out["available"] is True
    assert out["backend"] == "ollama-fake"
    # 3 docs with text get enriched, the empty one is skipped (marked, 0 notes)
    assert out["enriched"] == 3
    # depth 3 => 4 passes per text doc; 4 notes per text doc
    assert out["passes"] == 12
    assert out["notes_written"] == 12
    assert out["depth"] == 3

    # all four note kinds are really present in the brain for a text doc
    for kind in ("document_summary", "document_entities",
                 "document_relations", "document_questions"):
        notes = sb.list_notes(kind=kind)
        assert any(n["title"] == "Doc One" for n in notes), kind


def test_resumable_second_run_enriches_zero(monkeypatch, tmp_path):
    _wire(monkeypatch, tmp_path, depth="2", workers="1")
    first = le.enrich_documents(limit=10)
    assert first["enriched"] == 3
    # depth 2 => 2 passes per text doc
    assert first["passes"] == 6
    second = le.enrich_documents(limit=10)
    assert second["enriched"] == 0
    assert second["passes"] == 0
    assert second["pending_remaining"] == 0


def test_concurrency_path(monkeypatch, tmp_path):
    _wire(monkeypatch, tmp_path, depth="2", workers="3")
    out = le.enrich_documents(limit=10)
    assert out["available"] is True
    assert out["workers"] >= 2  # capped to batch size but parallel
    assert out["enriched"] == 3
    # every text doc got marked, so a re-run does nothing
    again = le.enrich_documents(limit=10)
    assert again["enriched"] == 0


def test_status_reports_depth_and_workers(monkeypatch, tmp_path):
    _wire(monkeypatch, tmp_path, depth="3", workers="2")
    le.enrich_documents(limit=10)
    st = le.status()
    assert st["depth"] == 3
    assert st["workers"] == 2
    assert st["enriched"] == 4  # marker table counts all 4 processed docs (incl. the empty one)
    assert le.enrich_status()["depth"] == 3


def test_limit_bounds_the_batch(monkeypatch, tmp_path):
    _wire(monkeypatch, tmp_path, depth="1", workers="1")
    out = le.enrich_documents(limit=2)
    # only 2 docs processed; depth 1 => 1 pass each
    assert out["enriched"] + 0 <= 2
    assert out["passes"] <= 2
    assert out["pending_remaining"] == 2  # 4 total - 2 processed


def test_module_reloads_clean():
    # the module imports/reloads without side effects (no network on import)
    importlib.reload(le)
    assert hasattr(le, "enrich_documents")
    assert hasattr(le, "status")
