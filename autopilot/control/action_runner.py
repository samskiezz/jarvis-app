"""Wraps assurance.commands.bus for safe actions; for code_modify routes to forge."""
from __future__ import annotations

import os
import sys
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from autopilot.policy.guard import PolicyGuard


class ActionRunner:
    def __init__(self) -> None:
        self.guard = PolicyGuard()

    def execute(self, *, name: str, payload: dict[str, Any] | None = None,
                paths: list[str] | None = None, dry_run: bool = False,
                approved: bool = False, raw_cmd: str = "",
                actor: str = "autopilot") -> dict[str, Any]:
        verdict = self.guard.evaluate(name, raw_cmd=raw_cmd, paths=paths,
                                       dry_run=dry_run, approved=approved)
        if not verdict.allowed:
            return {"ok": False, "verdict": verdict.to_dict(), "skipped": True}

        # Route through assurance.commands.bus
        try:
            from assurance.commands.bus import get_bus  # type: ignore
            from assurance.commands.types import Command  # type: ignore
            bus = get_bus()
            cmd = Command(
                name=name,
                actor=actor,
                payload=payload or {},
                dry_run=dry_run or verdict.dry_run_only,
                approved=approved,
            )
            outcome = bus.dispatch(cmd)
            return {"ok": getattr(outcome, "ok", False),
                    "verdict": verdict.to_dict(),
                    "outcome": outcome.model_dump()}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "verdict": verdict.to_dict(),
                    "error": f"{type(exc).__name__}: {exc}"}

    def propose(self, *, kind: str, title: str, body: str,
                affected_files: list[str] | None = None,
                risk: str = "low") -> str:
        """Write a proposal markdown to autopilot/reports/proposals/."""
        from autopilot.control.state_store import _now  # type: ignore
        prop_dir = os.path.join(ROOT, "autopilot", "reports", "proposals")
        os.makedirs(prop_dir, exist_ok=True)
        slug = "-".join(title.lower().split()[:6]).replace("/", "-")[:60]
        path = os.path.join(prop_dir, f"{int(_now())}-{slug}.md")
        affected_files = affected_files or []
        try:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(f"# {title}\n\n")
                fh.write(f"**Kind**: {kind}\n")
                fh.write(f"**Risk**: {risk}\n")
                fh.write(f"**Affected files**: {len(affected_files)}\n\n")
                if affected_files:
                    fh.write("Files:\n")
                    for f in affected_files[:20]:
                        fh.write(f"- `{f}`\n")
                    fh.write("\n")
                fh.write("## Body\n\n")
                fh.write(body + "\n")
        except OSError:
            pass
        return path
