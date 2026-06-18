"""Dry-run helpers."""
from __future__ import annotations

from typing import Any


def enforce_dry_run(dry_run: bool, would_do: str, args: dict[str, Any]) -> dict[str, Any] | None:
    """If dry_run, return a structured "what we would have done" dict. Otherwise None."""
    if not dry_run:
        return None
    return {"dry_run": True, "would_do": would_do, "args": args}
