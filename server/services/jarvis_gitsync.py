"""JARVIS GITSYNC — the platform auto-commits + pushes its own new data to GitHub.

After each autobuild the system produces fresh artifacts — the document-store
snapshot, generated GLB models, the manifests — and this commits + pushes them so
the GitHub repo self-updates (the "syncs to GitHub on its own" behaviour).

Gated behind GIT_AUTOSYNC=1 so it never pushes unexpectedly. On a server, set the
remote with a token once so the push is authenticated, e.g.:
    git remote set-url origin https://<GITHUB_TOKEN>@github.com/<owner>/<repo>.git

Bounded subprocess.run (same pattern as scrape_engines._run_tool); never raises.
"""

from __future__ import annotations

import os
import subprocess
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Artifact paths the autobuild changes — only these are staged (never the whole tree).
SYNC_PATHS = [
    "server/data/documents.db.gz",   # durable scraped-content snapshot
    "public/models",                 # generated GLB renders
    "docs/PALANTIR_MANIFEST.json",
]


def enabled() -> bool:
    return os.environ.get("GIT_AUTOSYNC", "").lower() in ("1", "true", "yes")


def _git(args: list[str], timeout: float = 120.0) -> dict:
    try:
        p = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=timeout)
        return {"ok": p.returncode == 0, "code": p.returncode,
                "out": (p.stdout or "").strip(), "err": (p.stderr or "").strip()[:300]}
    except FileNotFoundError:
        return {"ok": False, "err": "git not installed"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "err": f"git timeout after {timeout}s"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "err": str(e)}


def _ensure_identity() -> None:
    if not _git(["config", "user.email"]).get("out"):
        _git(["config", "user.email", os.environ.get("GIT_AUTOSYNC_EMAIL", "jarvis@autobuild.local")])
    if not _git(["config", "user.name"]).get("out"):
        _git(["config", "user.name", os.environ.get("GIT_AUTOSYNC_NAME", "Jarvis Autobuild")])


def sync(message: str | None = None, *, paths: list[str] | None = None,
         branch: str | None = None) -> dict:
    """Stage the artifact paths, commit if anything changed, and push. Gated by
    GIT_AUTOSYNC. Returns a structured report. Never raises."""
    if not enabled():
        return {"ok": False, "skipped": "GIT_AUTOSYNC not set",
                "hint": "export GIT_AUTOSYNC=1 (and set an authenticated remote) to enable"}
    _ensure_identity()
    paths = paths or SYNC_PATHS
    existing = [p for p in paths if os.path.exists(os.path.join(ROOT, p))]
    if not existing:
        return {"ok": True, "nothing": "no artifact paths present"}

    add = _git(["add", "-A", "--", *existing])
    if not add["ok"]:
        return {"ok": False, "stage_error": add.get("err")}

    # anything staged?
    diff = _git(["diff", "--cached", "--quiet"])
    if diff.get("code") == 0:
        return {"ok": True, "no_changes": True}  # nothing new to sync

    msg = message or f"data(autosync): platform self-update {time.strftime('%Y-%m-%d %H:%M:%S')}"
    commit = _git(["commit", "-m", msg])
    if not commit["ok"]:
        return {"ok": False, "commit_error": commit.get("err"), "out": commit.get("out")}

    br = branch or _git(["rev-parse", "--abbrev-ref", "HEAD"]).get("out") or "main"
    push = _git(["push", "origin", br], timeout=300)
    return {"ok": push["ok"], "committed": msg, "branch": br,
            "pushed": push["ok"], "push_error": None if push["ok"] else push.get("err")}


def status() -> dict:
    """Sync readiness for monitoring. Never raises."""
    remote = _git(["remote", "get-url", "origin"]).get("out", "")
    # redact any token embedded in the remote URL
    if "@" in remote and "://" in remote:
        scheme, rest = remote.split("://", 1)
        remote = f"{scheme}://***@{rest.split('@', 1)[1]}"
    head = _git(["rev-parse", "--short", "HEAD"]).get("out")
    return {"enabled": enabled(), "remote": remote, "head": head, "sync_paths": SYNC_PATHS}
