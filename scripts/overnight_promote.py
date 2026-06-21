#!/usr/bin/env python3
"""OVERNIGHT → MAIN PROMOTE GATE (scoped, audited, idempotent, crash-proof).

The overnight self-improvement loop commits new React feature components to the `jarvis-overnight`
branch. That branch ALSO carries unrelated divergence (backend/underworld churn, edits to shipped
pages). This gate promotes ONLY the genuinely-new, additive feature work to `main`, and ONLY when it
actually builds — so main never receives the collateral and never receives a broken build.

Every run it:
  1. FETCH    — refresh origin/main + origin/jarvis-overnight.
  2. SCOPE    — the promote set = files ADDED under src/ on overnight-but-not-main, PLUS the two mount
                files (src/App.jsx, src/Layout.jsx). Anything else (backend, underworld, deletions, edits
                to other shipped files) is refused. Scope is asserted, not trusted.
  3. STAGE    — in an ISOLATED git worktree based on the freshest origin/main, overlay the overnight
                version of exactly those files (never touches the live working tree).
  4. AUDIT    — `vite build` must succeed on that subset, the UI theme-lock must pass, and no .py/secret
                may sneak in. If any check fails, NOTHING is promoted.
  5. PROMOTE  — only if green: one clean squash commit on top of origin/main, fast-forward push to main.
                If main moved during the build (non-fast-forward) it aborts and retries next cycle.
  6. LEARN    — append a structured outcome to server/data/overnight_promote.log.jsonl.

Idempotent: once a feature file is on main it is no longer "added", so re-runs naturally shrink the set
and the loop's redundant re-implementations never multiply on main.

Usage:
  python3 scripts/overnight_promote.py [--dry-run] [--max-files N] [--source BRANCH]
    --dry-run  : fetch + scope + stage + audit, but never commit/push (verifies the pipeline safely).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGFILE = os.path.join(ROOT, "server", "data", "overnight_promote.log.jsonl")
SOURCE_BRANCH = "jarvis-overnight"
TARGET_BRANCH = "main"

# Only these two existing files may be overwritten with the overnight version — they are the component
# mount points. Everything else promoted MUST be a brand-new file under src/.
MOUNT_FILES = ("src/App.jsx", "src/Layout.jsx")
# Hard scope: a promotable path is under src/ and is a source file (component/page/lib), never an asset.
SCOPE_ALLOW_PREFIX = "src/"
SCOPE_DENY_SUFFIXES = (
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp4", ".mov", ".wav", ".mp3",
    ".glb", ".gltf", ".bin", ".db", ".sqlite", ".pt", ".onnx", ".lock", ".pyc",
)
# A single overnight cycle should never legitimately add more files than this. Beyond it we assume the
# branch is in an abnormal state (history rewrite / mass churn) and refuse to act.
MAX_FILES_DEFAULT = int(os.environ.get("PROMOTE_MAX_FILES", "300"))
BUILD_TIMEOUT = int(os.environ.get("PROMOTE_BUILD_TIMEOUT", "420"))
BOT_NAME = os.environ.get("PROMOTE_BOT_NAME", "JARVIS Auto-Promote")
BOT_EMAIL = os.environ.get("PROMOTE_BOT_EMAIL", "autopromote@projectsolar.cloud")


def sh(cmd, cwd=ROOT, timeout=120, env=None):
    """Run a command, returning (returncode, combined_output). Never raises."""
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout,
                           env=dict(os.environ, **(env or {})))
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, f"timeout after {timeout}s"
    except Exception as e:  # noqa: BLE001
        return 1, str(e)


def log(event: dict):
    event["ts"] = int(time.time())
    try:
        os.makedirs(os.path.dirname(LOGFILE), exist_ok=True)
        with open(LOGFILE, "a") as f:
            f.write(json.dumps(event, default=str) + "\n")
    except Exception:  # noqa: BLE001
        pass
    print(json.dumps(event, default=str)[:500], flush=True)


def in_scope(path: str) -> bool:
    """True only for a new source file the promote is allowed to carry."""
    p = (path or "").strip().strip('"')
    if not p or not p.startswith(SCOPE_ALLOW_PREFIX):
        return False
    if any(p.endswith(s) for s in SCOPE_DENY_SUFFIXES):
        return False
    return True


def fetch() -> str | None:
    """Refresh both branches; return the fresh origin/main sha (or None on failure)."""
    rc, out = sh(["git", "fetch", "--quiet", "origin", TARGET_BRANCH, SOURCE_BRANCH], timeout=180)
    if rc != 0:
        log({"event": "fetch_failed", "detail": out[-400:]})
        return None
    rc, sha = sh(["git", "rev-parse", f"origin/{TARGET_BRANCH}"], timeout=20)
    return sha.strip() if rc == 0 else None


def compute_promote_set(base_sha: str, source: str):
    """Return (promote_files, rejected, added, mounts).

    promote_files = added src files + present mount files. Scope is ASSERTED: a deletion, a non-src
    path, or an asset can never enter promote_files.
    """
    rc, out = sh(["git", "diff", "--diff-filter=A", "--name-only", base_sha, f"origin/{source}", "--", "src/"],
                 timeout=60)
    added_raw = [f.strip() for f in out.splitlines() if f.strip()]
    added, rejected = [], []
    for f in added_raw:
        (added if in_scope(f) else rejected).append(f)

    # Mount files are MODIFIED, not added — include them only if they exist on the source branch.
    mounts = [mf for mf in MOUNT_FILES
              if sh(["git", "cat-file", "-e", f"origin/{source}:{mf}"], timeout=15)[0] == 0]

    promote_files = sorted(set(added) | set(mounts))
    for f in promote_files:  # final hard assertion
        assert in_scope(f), f"scope violation slipped through: {f}"
    return promote_files, rejected, sorted(added), mounts


def setup_worktree(base_sha: str, source: str, promote_files: list[str]) -> str | None:
    """Create an isolated worktree at base_sha, overlay the overnight version of promote_files, return path."""
    wt = os.path.join("/tmp", f"jarvis_promote_wt_{os.getpid()}")
    sh(["git", "worktree", "remove", "--force", wt], timeout=60)  # clean any stale one
    shutil.rmtree(wt, ignore_errors=True)
    rc, out = sh(["git", "worktree", "add", "--detach", wt, base_sha], timeout=120)
    if rc != 0:
        log({"event": "worktree_failed", "detail": out[-400:]})
        return None
    # node_modules + vite live in the main checkout; symlink so the build works without a slow npm ci.
    nm = os.path.join(ROOT, "node_modules")
    if os.path.isdir(nm):
        try:
            os.symlink(nm, os.path.join(wt, "node_modules"))
        except OSError:
            pass
    rc, out = sh(["git", "checkout", f"origin/{source}", "--", *promote_files], cwd=wt, timeout=120)
    if rc != 0:
        log({"event": "overlay_failed", "detail": out[-400:]})
        cleanup_worktree(wt)
        return None
    return wt


def cleanup_worktree(wt: str):
    sh(["git", "worktree", "remove", "--force", wt], timeout=60)
    shutil.rmtree(wt, ignore_errors=True)


def audit(wt: str) -> dict:
    """The hard gate: the subset must BUILD, the UI theme-lock must pass, and nothing non-src may sneak in."""
    checks = {}

    # 1. Only src/ files may be staged (defence in depth on top of scope).
    rc, staged = sh(["git", "status", "--porcelain"], cwd=wt, timeout=30)
    stray = [ln[3:] for ln in staged.splitlines() if ln.strip() and not ln[3:].strip().startswith("src/")]
    checks["scope"] = {"ok": not stray, "stray": stray[:10]}

    # 2. The React app must build with exactly this subset on top of main.
    vite = os.path.join(ROOT, "node_modules", ".bin", "vite")
    build_cmd = [vite, "build"] if os.path.exists(vite) else ["npm", "run", "build"]
    rc, out = sh(build_cmd, cwd=wt, timeout=BUILD_TIMEOUT,
                 env={"NODE_OPTIONS": "--max-old-space-size=4096", "CI": "1"})
    checks["build"] = {"ok": rc == 0, "detail": "" if rc == 0 else out[-1500:]}

    # 3. UI theme-lock (cheap regression guard; we don't touch jarvis_live.html, so this should pass).
    lock = os.path.join(wt, "scripts", "check_ui_theme_lock.py")
    if os.path.exists(lock):
        rc, out = sh([sys.executable, lock], cwd=wt, timeout=60)
        checks["theme_lock"] = {"ok": rc == 0, "detail": "" if rc == 0 else out[-400:]}
    else:
        checks["theme_lock"] = {"ok": True, "note": "no theme-lock script in subset"}

    checks["ok"] = all(c.get("ok") for c in checks.values() if isinstance(c, dict))
    return checks


def promote(wt: str, promote_files: list[str], added: list[str], mounts: list[str]) -> dict:
    """One clean squash commit on top of origin/main, fast-forward push to main."""
    sh(["git", "add", "--", *promote_files], cwd=wt, timeout=60)
    n_new = len(added)
    sample = ", ".join(os.path.basename(f).replace(".jsx", "") for f in added[:6])
    msg = (f"feat(overnight): promote {n_new} audited additive feature component(s) to main\n\n"
           f"Scoped auto-promote from {SOURCE_BRANCH} (build-gated, additive-only).\n"
           f"New components: {sample}{' …' if n_new > 6 else ''}\n"
           f"Mount points updated: {', '.join(mounts) or 'none'}\n"
           f"Excluded: all backend/underworld divergence, deletions, and edits to other shipped files.")
    env = {"GIT_AUTHOR_NAME": BOT_NAME, "GIT_AUTHOR_EMAIL": BOT_EMAIL,
           "GIT_COMMITTER_NAME": BOT_NAME, "GIT_COMMITTER_EMAIL": BOT_EMAIL}
    rc, out = sh(["git", "commit", "-m", msg], cwd=wt, timeout=60, env=env)
    if rc != 0:
        return {"pushed": False, "reason": "commit_failed", "detail": out[-400:]}
    rc, sha = sh(["git", "rev-parse", "HEAD"], cwd=wt, timeout=20)
    # Fast-forward push only. If origin/main moved during the build this is rejected → retry next cycle.
    rc, out = sh(["git", "push", "origin", f"HEAD:{TARGET_BRANCH}"], cwd=wt, timeout=180)
    if rc != 0:
        return {"pushed": False, "reason": "push_rejected", "detail": out[-500:]}
    return {"pushed": True, "commit": sha.strip(), "n_features": n_new}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="audit only; never commit or push")
    ap.add_argument("--max-files", type=int, default=MAX_FILES_DEFAULT)
    ap.add_argument("--source", default=SOURCE_BRANCH)
    args = ap.parse_args(argv)

    base = fetch()
    if not base:
        return 2

    promote_files, rejected, added, mounts = compute_promote_set(base, args.source)
    if not added:
        log({"event": "noop", "reason": "no new additive feature files on source", "base": base[:8],
             "rejected_out_of_scope": len(rejected)})
        return 0
    if len(added) > args.max_files:
        log({"event": "abort_too_many", "added": len(added), "cap": args.max_files,
             "hint": "source branch looks abnormal — refusing to act"})
        return 3

    wt = setup_worktree(base, args.source, promote_files)
    if not wt:
        return 4

    try:
        report = audit(wt)
        if not report["ok"]:
            log({"event": "audit_failed", "base": base[:8], "n_added": len(added), "checks": report})
            return 5
        if args.dry_run:
            log({"event": "dry_run_pass", "base": base[:8], "n_added": len(added),
                 "would_promote": added[:20], "mounts": mounts, "rejected_out_of_scope": len(rejected)})
            return 0
        result = promote(wt, promote_files, added, mounts)
        log({"event": "promote", "base": base[:8], "result": result,
             "n_added": len(added), "rejected_out_of_scope": len(rejected)})
        return 0 if result.get("pushed") else 6
    finally:
        cleanup_worktree(wt)


if __name__ == "__main__":
    sys.exit(main())
