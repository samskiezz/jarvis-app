"""Engine registry availability + recon governance (no network/tools required)."""

from __future__ import annotations

from server.services import scrape_engines as eng


def test_registry_lists_all_named_tools():
    r = eng.list_engines()
    names = {e["name"] for grp in r["engines"].values() for e in grp}
    for tool in ("scrapling", "scrapy", "cloudscraper", "katana", "ffuf",
                 "kiterunner", "arjun", "camoufox"):
        assert tool in names
    assert set(r["available_counts"]) == {"content", "browser", "recon"}


def test_sequential_always_available():
    out = eng.list_engines()["engines"]["content"]
    seq = next(e for e in out if e["name"] == "sequential")
    assert seq["available"] is True


def test_best_content_engine_is_a_real_engine():
    assert eng.best_content_engine() in ("scrapling", "cloudscraper", "scrapy", "sequential")


def test_recon_blocked_without_authorization():
    out = eng.run_recon("ffuf", "https://example.com/FUZZ", authorized=False)
    assert out["ok"] is False and out.get("blocked") is True


def test_recon_blocked_when_not_allowlisted(monkeypatch):
    monkeypatch.setenv("RECON_ALLOWLIST", "myapp.internal")
    out = eng.run_recon("ffuf", "https://nasa.gov/FUZZ", authorized=True)
    assert out["ok"] is False and "not in RECON_ALLOWLIST" in out["reason"]


def test_recon_allowed_for_owned_target(monkeypatch):
    monkeypatch.setenv("RECON_ALLOWLIST", "myapp.internal")
    ok, reason = eng.recon_allowed("api.myapp.internal", authorized=True)
    assert ok is True


def test_elf_check_rejects_script(tmp_path):
    p = tmp_path / "fake"
    p.write_text("#!/usr/bin/env python\nprint('hi')\n")
    assert eng._is_elf(str(p)) is False


def test_ffuf_argv_injects_default_wordlist():
    argv = eng._ffuf_argv("http://127.0.0.1:8000/", [])
    assert argv[0] == "ffuf" and "FUZZ" in argv[2]
    assert "-w" in argv  # default wordlist injected


def test_ffuf_argv_respects_explicit_wordlist():
    argv = eng._ffuf_argv("http://h/FUZZ", ["-w", "/my/list.txt"])
    assert argv.count("-w") == 1 and "/my/list.txt" in argv
