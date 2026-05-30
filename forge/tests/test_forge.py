"""Tests for the APEX Forge agent — focus on the safety guarantees."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from forge import forge_agent as fa


# ── output validation guards ────────────────────────────────────────────────
def test_strip_fences():
    assert fa.strip_fences("```python\nx = 1\n```") == "x = 1"
    assert fa.strip_fences("plain") == "plain"


def test_is_safe_replacement_rejects_bad_outputs():
    original = "def f():\n    return 1 + 2 + 3\n" * 5
    assert not fa.is_safe_replacement(original, None)[0]
    assert not fa.is_safe_replacement(original, "")[0]
    assert not fa.is_safe_replacement(original, original)[0]            # no change
    assert not fa.is_safe_replacement(original, "x")[0]                  # truncation
    assert not fa.is_safe_replacement(original, "As an AI, I cannot")[0] # refusal
    # unbalanced braces
    assert not fa.is_safe_replacement("a(){}", "a(){{{{ " + "x" * 50)[0]


def test_is_safe_replacement_accepts_real_edit():
    original = "def f():\n    return 1\n" * 10
    improved = "def f():\n    # improved\n    return 1\n" * 10
    ok, reason = fa.is_safe_replacement(original, improved)
    assert ok, reason


# ── scanning: include/exclude/shard ─────────────────────────────────────────
def test_iter_source_files_respects_exclude_and_shard(tmp_path: Path):
    (tmp_path / "a.py").write_text("print(1)\n")
    (tmp_path / "b.js").write_text("console.log(1)\n")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "dep.js").write_text("x\n")
    (tmp_path / "big.py").write_text("x" * 100000)
    cfg = fa.Config(app_root=tmp_path, max_file_bytes=60000)  # big.py excluded by size
    files = {p.name for p in fa.iter_source_files(cfg)}
    assert files == {"a.py", "b.js"}  # node_modules + oversized excluded

    cfg2 = fa.Config(app_root=tmp_path, shard_count=2, shard_index=0)
    cfg3 = fa.Config(app_root=tmp_path, shard_count=2, shard_index=1)
    s0 = set(fa.iter_source_files(cfg2))
    s1 = set(fa.iter_source_files(cfg3))
    assert not (s0 & s1)  # disjoint shards — replicas never collide


# ── research never raises when offline ───────────────────────────────────────
def test_research_is_offline_safe(monkeypatch):
    monkeypatch.setattr(fa, "requests", None)
    assert fa.research_duckduckgo("anything") == ""
    assert fa.research_github_trending("python") == ""
    cfg = fa.Config(app_root=Path("."))
    assert fa.gather_research(cfg, Path("x.py")) == ""


# ── end-to-end cycle on a throwaway git repo ─────────────────────────────────
def _init_repo(tmp_path: Path) -> None:
    env = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.email", "t@t"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=tmp_path, check=True)
    # The sandbox enables commit signing globally; throwaway repos can't sign.
    subprocess.run(["git", "config", "commit.gpgsign", "false"], cwd=tmp_path, check=True)
    (tmp_path / "mod.py").write_text("def f():\n    return 1\n" * 12)
    subprocess.run(["git", "add", "."], cwd=tmp_path, check=True, env={**env})
    subprocess.run(["git", "commit", "-qm", "init"], cwd=tmp_path, check=True, env={**env})
    subprocess.run(["git", "checkout", "-qb", "work"], cwd=tmp_path, check=True)


def test_dry_run_never_writes(tmp_path: Path, monkeypatch):
    _init_repo(tmp_path)
    target = tmp_path / "mod.py"
    before = target.read_text()
    monkeypatch.setattr(fa, "ollama_improve",
                        lambda cfg, p, c, r: c.replace("return 1", "return 1  # better"))
    cfg = fa.Config(app_root=tmp_path, apply=False, research=False)
    report = fa.run_cycle(cfg)
    assert report["proposed"] >= 1
    assert report["applied"] == 0
    assert target.read_text() == before  # untouched


def test_apply_commits_and_backs_up_when_tests_pass(tmp_path: Path, monkeypatch):
    _init_repo(tmp_path)
    target = tmp_path / "mod.py"
    monkeypatch.setattr(fa, "ollama_improve",
                        lambda cfg, p, c, r: c.replace("return 1", "return 1  # improved"))
    cfg = fa.Config(app_root=tmp_path, apply=True, research=False, test_cmd="true")
    report = fa.run_cycle(cfg)
    assert report["applied"] == 1
    assert "# improved" in target.read_text()
    assert (tmp_path / ".forge" / "backups" / "mod.py").exists()
    log = subprocess.run(["git", "log", "--oneline"], cwd=tmp_path, capture_output=True, text=True).stdout
    assert "APEX Forge" in log


def test_apply_reverts_when_tests_fail(tmp_path: Path, monkeypatch):
    _init_repo(tmp_path)
    target = tmp_path / "mod.py"
    before = target.read_text()
    monkeypatch.setattr(fa, "ollama_improve",
                        lambda cfg, p, c, r: c.replace("return 1", "return 2  # bad"))
    cfg = fa.Config(app_root=tmp_path, apply=True, research=False, test_cmd="false")
    report = fa.run_cycle(cfg)
    assert report.get("checks_failed") is True
    assert report["applied"] == 0
    assert target.read_text() == before  # fully reverted


def test_refuses_to_write_on_protected_branch(tmp_path: Path, monkeypatch):
    _init_repo(tmp_path)
    subprocess.run(["git", "checkout", "-qb", "main"], cwd=tmp_path, check=True)
    target = tmp_path / "mod.py"
    before = target.read_text()
    monkeypatch.setattr(fa, "ollama_improve",
                        lambda cfg, p, c, r: c.replace("return 1", "return 9"))
    # base_branch=main so it would try to branch; ensure_work_branch makes a forge/* branch.
    cfg = fa.Config(app_root=tmp_path, apply=True, research=False, test_cmd="true")
    report = fa.run_cycle(cfg)
    # It must have moved OFF main onto a forge/* branch before any write.
    assert report["branch"] and report["branch"].startswith("forge/")
    cur = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"],
                         cwd=tmp_path, capture_output=True, text=True).stdout.strip()
    assert cur.startswith("forge/")
    # main itself was never modified
    main_mod = subprocess.run(["git", "show", "main:mod.py"], cwd=tmp_path,
                              capture_output=True, text=True).stdout
    assert main_mod == before
