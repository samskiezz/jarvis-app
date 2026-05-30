#!/usr/bin/env python3
"""
APEX Forge — Autonomous App Evolution Engine (safe edition)

Runs on K3s + Ollama (open-source local models, no cloud credits). It scans the
codebase, researches improvements (DuckDuckGo / arXiv / GitHub trending), asks a
local LLM to improve files, and lands changes — but only through a reviewable,
test-gated pipeline that NEVER touches main directly.

Why this differs from a naive "rewrite-and-push" loop:
  * It works on a dedicated `forge/*` branch (refuses to apply on a protected
    branch such as main/master).
  * Every candidate rewrite is validated (non-empty, not truncated, no model
    refusal/markdown leakage) BEFORE it touches disk.
  * After applying a batch it runs the project's test/lint command; if that
    fails the whole batch is reverted.
  * Backups go to .forge/backups/, never alongside the source.
  * A file lock + work sharding let replicas run in parallel without clobbering
    each other. The agent never spawns itself (no self-replication); horizontal
    scale is done by K8s replicas.
  * Dry-run is the default. Applying, pushing, and PR creation are explicit
    opt-ins.

Run:  python3 forge/forge_agent.py            # dry-run report, no writes
      FORGE_APPLY=1 python3 forge/forge_agent.py   # apply on a forge/* branch
Env:  see Config below (all FORGE_* / OLLAMA_* / GITHUB_TOKEN).
"""

from __future__ import annotations

import fnmatch
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

try:  # requests is optional at import time so unit tests don't require it
    import requests
except Exception:  # pragma: no cover
    requests = None  # type: ignore

try:  # works under `python -m forge.forge_agent`
    from . import approvals as approvals_mod
    from . import notify
except ImportError:  # running as a plain script: `python3 forge/forge_agent.py`
    try:
        import approvals as approvals_mod  # type: ignore
        import notify  # type: ignore
    except Exception:  # pragma: no cover
        approvals_mod = None  # type: ignore
        notify = None  # type: ignore


PROTECTED_BRANCHES = {"main", "master", "release", "prod", "production"}

DEFAULT_INCLUDE = ("*.py", "*.js", "*.jsx", "*.ts", "*.tsx", "*.go", "*.rs", "*.java")
DEFAULT_EXCLUDE = (
    "*/node_modules/*", "*/.git/*", "*/dist/*", "*/build/*", "*/.venv/*",
    "*/venv/*", "*/__pycache__/*", "*/.forge/*", "*.min.js", "*.bak",
    "*/coverage/*", "*/.next/*", "*/public/models/*",
)

_REFUSAL_MARKERS = (
    "i'm sorry", "i am sorry", "as an ai", "i cannot", "i can't help",
    "language model", "no improvement needed and here is",
)


@dataclass
class Config:
    app_root: Path = field(default_factory=lambda: Path(os.environ.get("APP_ROOT", ".")).resolve())
    ollama_url: str = os.environ.get("OLLAMA_URL", "http://localhost:11434")
    model: str = os.environ.get("FORGE_MODEL", os.environ.get("MODEL", "deepseek-coder:6.7b"))
    apply: bool = os.environ.get("FORGE_APPLY", "0") == "1"
    push: bool = os.environ.get("FORGE_PUSH", "0") == "1"
    open_pr: bool = os.environ.get("FORGE_OPEN_PR", "0") == "1"
    # "whatsapp" → propose each change on its own branch + request phone approval
    # (the webhook merges on APPROVE). "" → legacy batch-on-branch behaviour.
    approval: str = os.environ.get("FORGE_APPROVAL", "").lower()
    research: bool = os.environ.get("FORGE_RESEARCH", "1") == "1"
    branch_prefix: str = os.environ.get("FORGE_BRANCH_PREFIX", "forge")
    base_branch: str = os.environ.get("FORGE_BASE_BRANCH", "")  # default: current branch
    test_cmd: str = os.environ.get("FORGE_TEST_CMD", "")
    lint_cmd: str = os.environ.get("FORGE_LINT_CMD", "")
    interval_s: int = int(os.environ.get("FORGE_INTERVAL_S", "1800"))
    max_runtime_s: int = int(os.environ.get("FORGE_MAX_RUNTIME_S", "3600"))  # hourly fresh restart
    max_cycles: int = int(os.environ.get("FORGE_MAX_CYCLES", "0"))          # 0 = unbounded
    max_files_per_cycle: int = int(os.environ.get("FORGE_MAX_FILES", "8"))
    max_file_bytes: int = int(os.environ.get("FORGE_MAX_FILE_BYTES", "60000"))
    shard_index: int = int(os.environ.get("FORGE_SHARD_INDEX", "0"))
    shard_count: int = int(os.environ.get("FORGE_SHARD_COUNT", "1"))
    include: tuple[str, ...] = field(default_factory=lambda: tuple(
        os.environ.get("FORGE_INCLUDE", "").split(",")) if os.environ.get("FORGE_INCLUDE") else DEFAULT_INCLUDE)
    exclude: tuple[str, ...] = DEFAULT_EXCLUDE
    request_timeout_s: int = int(os.environ.get("FORGE_HTTP_TIMEOUT_S", "20"))

    def log(self, msg: str) -> None:
        print(f"[{time.strftime('%H:%M:%S')}] forge[{self.shard_index}/{self.shard_count}] {msg}", flush=True)


# ---------- SCAN ----------
def iter_source_files(cfg: Config) -> list[Path]:
    """All in-scope source files for this shard, deterministically ordered."""
    out: list[Path] = []
    for path in sorted(cfg.app_root.rglob("*")):
        if not path.is_file():
            continue
        rel = str(path)
        if not any(fnmatch.fnmatch(path.name, pat) for pat in cfg.include):
            continue
        if any(fnmatch.fnmatch(rel, pat) for pat in cfg.exclude):
            continue
        try:
            if path.stat().st_size > cfg.max_file_bytes:
                continue
        except OSError:
            continue
        out.append(path)
    # Stable shard split so parallel replicas take disjoint files.
    if cfg.shard_count > 1:
        out = [p for i, p in enumerate(out) if i % cfg.shard_count == cfg.shard_index]
    return out


# ---------- RESEARCH (best-effort, never fatal) ----------
def _get_json(url: str, params: dict, timeout: int) -> dict | None:
    if requests is None:
        return None
    try:
        resp = requests.get(url, params=params, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return None


def research_duckduckgo(topic: str, timeout: int = 10) -> str:
    data = _get_json("https://api.duckduckgo.com/",
                     {"q": topic, "format": "json", "no_html": 1, "skip_disambig": 1}, timeout)
    if not data:
        return ""
    bits = [it["Text"] for it in data.get("RelatedTopics", []) if isinstance(it, dict) and it.get("Text")]
    return " ".join(bits[:3])


def research_arxiv(topic: str, timeout: int = 10) -> str:
    if requests is None:
        return ""
    try:
        resp = requests.get("http://export.arxiv.org/api/query",
                            params={"search_query": f"all:{topic}", "max_results": 3}, timeout=timeout)
        resp.raise_for_status()
        return " ".join(re.findall(r"<title>(.*?)</title>", resp.text, re.S)[1:4])
    except Exception:
        return ""


def research_github_trending(language: str, timeout: int = 10) -> str:
    data = _get_json("https://api.github.com/search/repositories",
                     {"q": f"language:{language} stars:>500", "sort": "stars", "per_page": 3}, timeout)
    if not data:
        return ""
    return " ".join(f"{r['full_name']}: {r.get('description') or ''}" for r in data.get("items", [])[:3])


def gather_research(cfg: Config, path: Path) -> str:
    if not cfg.research:
        return ""
    ext = path.suffix.lower()
    lang = {".py": "python", ".js": "javascript", ".jsx": "javascript",
            ".ts": "typescript", ".tsx": "typescript", ".go": "go", ".rs": "rust"}.get(ext, "")
    topic = f"{lang or 'software'} best practices performance security 2025"
    parts = [research_duckduckgo(topic, cfg.request_timeout_s)]
    if lang:
        parts.append(research_github_trending(lang, cfg.request_timeout_s))
    return " ".join(p for p in parts if p)[:1500]


# ---------- LLM ----------
def ollama_improve(cfg: Config, path: Path, content: str, research: str) -> str | None:
    """Ask the local model to return an improved full-file version, or None."""
    if requests is None:
        return None
    prompt = (
        "You are an expert software engineer. Improve the following file for "
        "correctness, performance, security and readability WITHOUT changing its "
        "public behaviour or removing functionality. Return ONLY the complete, "
        "valid contents of the improved file — no prose, no markdown fences. If no "
        "improvement is warranted, return the file unchanged.\n\n"
        f"FILE: {path.name}\n"
        f"RESEARCH NOTES: {research}\n\n"
        f"--- BEGIN FILE ---\n{content}\n--- END FILE ---\n"
    )
    try:
        resp = requests.post(
            f"{cfg.ollama_url}/api/generate",
            json={"model": cfg.model, "prompt": prompt, "stream": False,
                  "options": {"temperature": 0.2}},
            timeout=max(60, cfg.request_timeout_s),
        )
        resp.raise_for_status()
        return resp.json().get("response")
    except Exception as exc:
        cfg.log(f"ollama unavailable ({exc}); skipping {path.name}")
        return None


def strip_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z0-9_+-]*\n?", "", t)
        if t.endswith("```"):
            t = t[: t.rfind("```")]
    return t.strip("\n")


def is_safe_replacement(original: str, candidate: str | None) -> tuple[bool, str]:
    """Guard against the failure modes that corrupt files with small local LLMs."""
    if candidate is None:
        return False, "no candidate"
    new = strip_fences(candidate)
    if not new.strip():
        return False, "empty output"
    low = new.lower()
    if any(m in low for m in _REFUSAL_MARKERS):
        return False, "model refusal / prose leaked into output"
    if new.strip() == original.strip():
        return False, "no change"
    # Truncation guard: a wholesale shrink usually means the model cut the file.
    if len(new) < 0.5 * len(original):
        return False, f"suspicious shrink ({len(new)} < 50% of {len(original)})"
    if len(new) > 3.0 * len(original) + 2000:
        return False, "suspicious bloat"
    # Cheap structural sanity: balanced braces/parens for brace languages.
    for open_c, close_c in (("{", "}"), ("(", ")"), ("[", "]")):
        if abs(new.count(open_c) - new.count(close_c)) > abs(original.count(open_c) - original.count(close_c)):
            return False, f"unbalanced {open_c}{close_c}"
    return True, "ok"


# ---------- GIT / CHECKS ----------
def _git(cfg: Config, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=cfg.app_root, check=check,
                          capture_output=True, text=True)


def current_branch(cfg: Config) -> str:
    try:
        return _git(cfg, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    except subprocess.CalledProcessError:
        return ""


def ensure_work_branch(cfg: Config) -> str:
    """Create/switch to a dedicated forge branch. Refuse protected branches."""
    base = cfg.base_branch or current_branch(cfg)
    if base in PROTECTED_BRANCHES:
        # We may branch FROM main, but we will never commit ON it.
        cfg.log(f"base branch is protected ({base}); forge will branch off it, not modify it.")
    work = f"{cfg.branch_prefix}/auto-{time.strftime('%Y%m%d-%H%M%S')}-s{cfg.shard_index}"
    _git(cfg, "checkout", "-b", work)
    return work


def run_checks(cfg: Config) -> bool:
    """Run lint then tests. Empty command = skipped (returns True)."""
    for label, cmd in (("lint", cfg.lint_cmd), ("test", cfg.test_cmd)):
        if not cmd:
            continue
        cfg.log(f"running {label}: {cmd}")
        res = subprocess.run(cmd, cwd=cfg.app_root, shell=True, capture_output=True, text=True)
        if res.returncode != 0:
            cfg.log(f"{label} FAILED — reverting batch")
            return False
    return True


def backup_file(cfg: Config, path: Path) -> None:
    rel = path.relative_to(cfg.app_root)
    dest = cfg.app_root / ".forge" / "backups" / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(path.read_text(encoding="utf-8", errors="ignore"), encoding="utf-8")


class FileLock:
    """Cross-process advisory lock so parallel replicas don't write at once."""

    def __init__(self, cfg: Config):
        self.path = cfg.app_root / ".forge" / "forge.lock"
        self._fh = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = open(self.path, "w")
        try:
            import fcntl
            fcntl.flock(self._fh, fcntl.LOCK_EX)
        except (ImportError, OSError):
            pass
        return self

    def __exit__(self, *exc):
        try:
            import fcntl
            fcntl.flock(self._fh, fcntl.LOCK_UN)
        except (ImportError, OSError):
            pass
        if self._fh:
            self._fh.close()


def _propose_for_approval(cfg: Config, path: Path, new_content: str, base: str,
                          store, notifier) -> dict | None:
    """Put one change on its own branch and request WhatsApp approval.

    Returns a record dict on success (branch committed + notified), else None.
    The merge to `base` happens later, only when the human replies APPROVE
    (handled by forge.webhook). `base` may be a protected branch — we never
    commit on it here, only branch off it.
    """
    cid = store.new_id()
    work = f"{cfg.branch_prefix}/auto-{time.strftime('%Y%m%d-%H%M%S')}-{cid}"
    _git(cfg, "checkout", "-b", work, base)
    backup_file(cfg, path)
    path.write_text(new_content, encoding="utf-8")
    if not run_checks(cfg):
        _git(cfg, "checkout", "--", str(path), check=False)
        _git(cfg, "checkout", base, check=False)
        _git(cfg, "branch", "-D", work, check=False)
        return None
    _git(cfg, "add", str(path))
    _git(cfg, "commit", "-m", f"APEX Forge: propose {cid} — {path.name}")
    diff = _git(cfg, "diff", f"{base}...{work}", "--", check=False).stdout
    if cfg.push:
        _git(cfg, "push", "-u", "origin", work, check=False)
    _git(cfg, "checkout", base, check=False)  # leave tree clean for the next change

    change = store.create(branch=work, base=base, files=[str(path)],
                          summary=f"Improve {path.name}", diff=diff, change_id=cid)
    sent = notifier.send(notify.build_request_text(change))
    cfg.log(f"proposed {cid} on {work}; whatsapp sent={sent}")
    return {"id": cid, "branch": work, "file": str(path), "notified": sent}


# ---------- CYCLE ----------
def run_cycle(cfg: Config) -> dict:
    """One scan→research→improve→validate→test pass. Returns a report dict."""
    files = iter_source_files(cfg)[: cfg.max_files_per_cycle] if cfg.max_files_per_cycle else iter_source_files(cfg)
    report = {"scanned": len(files), "proposed": 0, "applied": 0, "rejected": [], "branch": None}
    cfg.log(f"scanned {len(files)} in-scope files")

    # Approval mode: each change goes on its own branch + a WhatsApp sign-off
    # request. The merge to base happens later via the webhook on APPROVE, so
    # base may safely be a protected branch (main) — we never commit on it here.
    if cfg.apply and cfg.approval == "whatsapp" and approvals_mod is not None:
        store = approvals_mod.ApprovalStore(cfg.app_root / ".forge" / "approvals.db")
        notifier = notify.from_env()
        base = cfg.base_branch or current_branch(cfg)
        report["base"] = base
        report["pending"] = []
        for path in files:
            content = path.read_text(encoding="utf-8", errors="ignore")
            candidate = ollama_improve(cfg, path, content, gather_research(cfg, path))
            ok, reason = is_safe_replacement(content, candidate)
            if not ok:
                report["rejected"].append({"file": str(path), "reason": reason})
                continue
            report["proposed"] += 1
            rec = _propose_for_approval(cfg, path, strip_fences(candidate), base, store, notifier)
            if rec:
                report["pending"].append(rec)
        return report

    work_branch = None
    if cfg.apply:
        cur = current_branch(cfg)
        if cur in PROTECTED_BRANCHES:
            work_branch = ensure_work_branch(cfg)
        else:
            work_branch = cur
        report["branch"] = work_branch
        if work_branch in PROTECTED_BRANCHES:
            cfg.log("refusing to write on a protected branch")
            cfg.apply = False

    applied_paths: list[Path] = []
    for path in files:
        content = path.read_text(encoding="utf-8", errors="ignore")
        research = gather_research(cfg, path)
        candidate = ollama_improve(cfg, path, content, research)
        ok, reason = is_safe_replacement(content, candidate)
        if not ok:
            report["rejected"].append({"file": str(path), "reason": reason})
            continue
        report["proposed"] += 1
        if not cfg.apply:
            cfg.log(f"[dry-run] would improve {path}")
            continue
        backup_file(cfg, path)
        path.write_text(strip_fences(candidate), encoding="utf-8")
        applied_paths.append(path)

    if cfg.apply and applied_paths:
        if run_checks(cfg):
            for p in applied_paths:
                _git(cfg, "add", str(p))
            _git(cfg, "commit", "-m",
                 f"APEX Forge: improve {len(applied_paths)} file(s)")
            report["applied"] = len(applied_paths)
            if cfg.push and work_branch and work_branch not in PROTECTED_BRANCHES:
                _git(cfg, "push", "-u", "origin", work_branch, check=False)
                if cfg.open_pr:
                    _open_pr(cfg, work_branch)
        else:
            # Revert every applied file to its backup; never leave a broken tree.
            for p in applied_paths:
                _git(cfg, "checkout", "--", str(p), check=False)
            report["applied"] = 0
            report["checks_failed"] = True
    return report


def _open_pr(cfg: Config, branch: str) -> None:
    base = cfg.base_branch or "main"
    try:
        subprocess.run(
            ["gh", "pr", "create", "--base", base, "--head", branch,
             "--title", "APEX Forge: automated improvements",
             "--body", "Generated by APEX Forge. Review before merge."],
            cwd=cfg.app_root, check=False, capture_output=True, text=True,
        )
    except FileNotFoundError:
        cfg.log("gh CLI not found; skipping PR creation")


def main() -> None:
    cfg = Config()
    cfg.log(f"APEX Forge starting — app_root={cfg.app_root} apply={cfg.apply} "
            f"model={cfg.model} dry_run={not cfg.apply}")
    started = time.time()
    cycles = 0
    while True:
        with FileLock(cfg):
            report = run_cycle(cfg)
        cfg.log("cycle report: " + json.dumps(report))
        cycles += 1
        if cfg.max_cycles and cycles >= cfg.max_cycles:
            cfg.log("max cycles reached; exiting 0")
            return
        # Hourly fresh-context restart: exit cleanly so K8s restarts us.
        if time.time() - started >= cfg.max_runtime_s:
            cfg.log("max runtime reached; exiting 0 for a fresh restart")
            return
        time.sleep(cfg.interval_s)


if __name__ == "__main__":
    sys.exit(main())
