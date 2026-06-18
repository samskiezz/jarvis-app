"""Approval gate."""
from __future__ import annotations


class ApprovalRequired(Exception):
    """Raised when a dangerous command is dispatched without approval/dry-run."""


def approve(payload: dict, *, by: str, reason: str = "") -> dict:
    """Stamp approval metadata onto a command payload (returns a new dict)."""
    return {**payload, "_approved_by": by, "_approved_reason": reason}
