"""PROOF PACK — capture evidence for a change or decision.

Collects git diff/status, changed route/service files, recent friction and dead-zone
findings, and stores everything as a second-brain note (kind=pack, tag=proof) so it
can be linked to specs, decisions, and deployments.
"""
from __future__ import annotations

import os
import re
import subprocess
import time
import uuid
from typing import Any, Optional

from . import dead_zone_finder
from . import friction_map
from . import llm_router
from . import mini_app_state as mas
from . import second_brain as sb

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
APP = "proof_pack"


def _now_ms() -> int:
    return int(time.time() * 1000)


def _run(cmd: list[str], timeout: int = 15) -> tuple[int, str, str]:
    try:
        r = subprocess.run(
            cmd,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except Exception as e:  # noqa: BLE001
        return 1, "", str(e)


def _git_diff_stat() -> str:
    rc, out, _ = _run(["git", "diff", "--stat"])
    return out if rc == 0 else ""


def _git_status_short() -> str:
    rc, out, _ = _run(["git", "status", "--short"])
    return out if rc == 0 else ""


def _changed_files() -> list[str]:
    """Files changed in the working tree vs HEAD."""
    rc, out, _ = _run(["git", "diff", "--name-only", "HEAD"])
    if rc != 0:
        return []
    return [f.strip() for f in out.splitlines() if f.strip()]


def _last_commit_sha() -> str:
    rc, out, _ = _run(["git", "rev-parse", "--short", "HEAD"])
    return out.strip() if rc == 0 else "unknown"


def _changed_endpoints(changed: list[str]) -> list[dict[str, Any]]:
    """Heuristic: list route/service files that changed and any router prefixes inside."""
    endpoints: list[dict[str, Any]] = []
    for path in changed:
        if not path.startswith("server/routes/") and not path.startswith("server/services/"):
            continue
        full = os.path.join(ROOT, path)
        prefixes: list[str] = []
        try:
            text = open(full, encoding="utf-8", errors="ignore").read()
            for m in re.finditer(r'APIRouter\s*\(\s*[^)]*prefix\s*=\s*["\']([^"\']+)["\']', text):
                prefixes.append(m.group(1))
        except Exception:  # noqa: BLE001
            pass
        endpoints.append({"file": path, "prefixes": prefixes})
    return endpoints


def _test_results() -> dict[str, Any]:
    path = os.path.join(ROOT, "server", "data", "test_results.json")
    try:
        import json

        with open(path, encoding="utf-8") as f:
            return {"available": True, "data": json.load(f)}
    except Exception:  # noqa: BLE001
        return {"available": False, "note": "No recent test results cached"}


def _recent_logs(lines: int = 20) -> list[str]:
    rc, out, _ = _run(["git", "log", f"--oneline", f"-{lines}"])
    if rc != 0:
        return []
    return [ln.strip() for ln in out.splitlines() if ln.strip()]


def _infer_risks(changed: list[str], friction: dict[str, Any], deadzone: list[dict[str, Any]]) -> list[str]:
    risks: list[str] = []
    if any(p.startswith("server/routes/") for p in changed):
        risks.append("API surface changed — verify frontend callers and contracts.")
    if any(p.startswith("server/services/") for p in changed):
        risks.append("Service logic changed — verify dependent routes and state files.")
    if any("migration" in p or p.startswith("database/") for p in changed):
        risks.append("Database or migration file changed — review rollback plan.")
    if friction.get("score", 0) > 50:
        risks.append(f"High friction score ({friction['score']}) — consider automation before shipping.")
    if deadzone:
        kinds = {d.get("kind") for d in deadzone}
        if "missing_file" in kinds:
            risks.append("DeadZoneFinder reports missing inventory files — may indicate stale docs.")
    if not risks:
        risks.append("No major risks flagged by heuristics.")
    return risks


def _rollback_steps(changed: list[str]) -> list[str]:
    steps = [f"git revert { _last_commit_sha() } or `git checkout HEAD -- <file>` for unintended changes"]
    if any(p.startswith("server/data/") for p in changed):
        steps.append("Restore affected JSON state files from snapshot if needed.")
    steps.append("Run `pm2 restart jarvis-backend jarvis-dashboard` after rollback.")
    return steps


def create_pack(
    title: str,
    spec_id: str = "",
    decision_ids: list[str] | None = None,
    include_diff: bool = True,
    screenshot_url: str = "",
    actor: Optional[str] = None,
) -> dict[str, Any]:
    if not title or not str(title).strip():
        return {"ok": False, "error": "empty title"}

    decision_ids = decision_ids or []
    changed = _changed_files()
    diff_stat = _git_diff_stat()
    status_short = _git_status_short()
    endpoints = _changed_endpoints(changed)
    tests = _test_results()
    friction = friction_map.scan(hours=24)
    deadzone = dead_zone_finder.scan(limit=20)
    commit = _last_commit_sha()
    log = _recent_logs(10)

    risks = _infer_risks(changed, friction, deadzone)
    rollback = _rollback_steps(changed)

    diff_body = ""
    if include_diff:
        rc, diff_out, _ = _run(["git", "diff", "--", ":!*.lock", ":!server/data/*"])
        if rc == 0:
            diff_body = diff_out[:12000]

    # Optionally ask the LLM to summarize the pack narrative.
    narrative = ""
    try:
        prompt = (
            "You are ProofPack. Summarize the following change evidence in 2-3 sentences. "
            "Be factual and concise."
        )
        msg = (
            f"Title: {title}\n"
            f"Changed files: {', '.join(changed[:20])}\n"
            f"Friction score: {friction.get('score', 0)}\n"
            f"Dead zone findings: {len(deadzone)}\n"
            f"Risks: {', '.join(risks[:5])}"
        )
        summary = llm_router.complete(message=msg, system_prompt=prompt, max_tokens=256)
        if summary:
            narrative = summary.strip()
    except Exception:  # noqa: BLE001
        narrative = ""

    body = f"# Proof Pack: {title}\n\n"
    if narrative:
        body += f"{narrative}\n\n"
    body += f"## Commit\n\n- `{commit}`\n\n"
    body += f"## Git diff stat\n\n```\n{diff_stat or '(no diff)'}\n```\n\n"
    body += f"## Working tree status\n\n```\n{status_short or '(clean)'}\n```\n\n"
    if endpoints:
        body += "## Changed endpoints / services\n\n"
        for ep in endpoints:
            body += f"- `{ep['file']}`" + (f" prefixes: {', '.join(ep['prefixes'])}" if ep["prefixes"] else "") + "\n"
        body += "\n"
    body += f"## Risks\n\n" + "\n".join(f"- {r}" for r in risks) + "\n\n"
    body += f"## Rollback steps\n\n" + "\n".join(f"- {r}" for r in rollback) + "\n\n"
    if friction.get("findings"):
        body += f"## Friction findings (24h)\n\nScore: {friction.get('score', 0)}\n"
        for f in friction["findings"][:10]:
            body += f"- {f.get('label')} (x{f.get('count', 1)})\n"
        body += "\n"
    if deadzone:
        body += f"## Dead zone findings\n\n"
        for d in deadzone[:10]:
            body += f"- {d.get('label')} — {d.get('suggestion')}\n"
        body += "\n"
    if include_diff and diff_body:
        body += f"## Diff excerpt\n\n```diff\n{diff_body}\n```\n\n"
    if log:
        body += f"## Recent commits\n\n" + "\n".join(f"- {ln}" for ln in log) + "\n\n"

    pack_id = str(uuid.uuid4())[:8]
    note_title = f"Proof: {title.strip()[:80]}"
    note = sb.upsert_note(
        kind="pack",
        title=note_title,
        body_md=body,
        frontmatter={
            "id": pack_id,
            "tag": "proof",
            "created_at": _now_ms(),
            "spec_id": spec_id,
            "decision_ids": decision_ids,
            "commit": commit,
            "changed_files": changed,
            "changed_endpoints": endpoints,
            "test_results": tests,
            "friction_score": friction.get("score", 0),
            "dead_zone_count": len(deadzone),
            "risks": risks,
            "rollback_steps": rollback,
            "screenshot_url": screenshot_url,
        },
        actor=actor,
    )
    if note is None:
        return {"ok": False, "error": "failed to save proof pack"}

    # Also log that a pack was created so the audit trail is visible.
    mas.mutate("proof_pack", lambda s: s.setdefault("log", []).append({"t": _now_ms(), "id": pack_id, "title": note_title}), default={"log": []})

    return {"ok": True, "pack": note}


def list_packs(limit: int = 50) -> list[dict[str, Any]]:
    notes = sb.list_notes(kind="pack", limit=limit)
    return [n for n in notes if (n.get("frontmatter") or {}).get("tag") == "proof"]


def get_pack(pack_id: str) -> Optional[dict[str, Any]]:
    note = sb.get_note(pack_id)
    if note and (note.get("frontmatter") or {}).get("tag") == "proof":
        return note
    # Fallback: search by frontmatter id.
    for n in list_packs(limit=500):
        if (n.get("frontmatter") or {}).get("id") == pack_id:
            return n
    return None


def export_pack(pack_id: str) -> dict[str, Any]:
    note = get_pack(pack_id)
    if note is None:
        return {"ok": False, "error": "pack not found"}
    return {
        "ok": True,
        "markdown": note.get("body_md", ""),
        "frontmatter": note.get("frontmatter", {}),
        "title": note.get("title", ""),
        "id": note.get("id", ""),
    }
