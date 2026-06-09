"""Agent OS — permission engine.

A *pure, deterministic* policy that decides, for a given tool call, whether the
Agent OS may run it automatically, must ask the human first, or must refuse.

It is intentionally dependency-free and side-effect-free: it only reads the tool
metadata + args it is handed and returns a verdict. It NEVER raises — an
unexpected input degrades to the safest verdict ("confirm"), never to "auto".

Risk taxonomy (matches the Tool.risk values):
    safe_read           — reads only; no mutation                 -> auto
    safe_write          — writes inside the repo                  -> auto (if path in repo)
    system_change       — touches host state (services, packages) -> confirm
    destructive         — irreversible (delete/prune/overwrite)   -> confirm + backup-first
    deployment          — ships/deploys something                 -> confirm
    financial           — spends money                            -> confirm
    security_sensitive  — secrets/keys/auth surface               -> confirm

The verdict is {mode, reason, risk, requires_backup} where mode is one of
"auto" | "confirm" | "deny".
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

# Repo root — used to keep safe_write inside the tree.
# server/agent/permission.py -> .../server/agent -> .../server -> <repo>
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

VALID_RISKS = (
    "safe_read",
    "safe_write",
    "system_change",
    "destructive",
    "financial",
    "deployment",
    "security_sensitive",
)

# Keys whose values we treat as filesystem paths for the safe_write containment check.
_PATH_KEYS = (
    "path",
    "file",
    "dest",
    "target",
    "out",
    "output",
    "dir",
    "directory",
    "filename",
)

# If an arg value looks like one of these obviously dangerous patterns we never
# auto-run, regardless of the declared risk. Cheap defence-in-depth, checked
# first across all string/number args.
_HARD_DENY_SUBSTRINGS = (
    "rm -rf /",
    "mkfs",
    ":(){:|:&};:",  # fork bomb
    "> /dev/sda",
    "dd if=/dev/zero of=/dev/",
)


def _coerce_args(args: Any) -> Dict[str, Any]:
    """Return a dict no matter what was passed in. Never raises."""
    try:
        return args if isinstance(args, dict) else {}
    except Exception:  # noqa: BLE001 — defensive; isinstance shouldn't raise
        return {}


def _within_repo(path: str) -> bool:
    """True if `path` resolves inside the repo tree (and isn't an escape)."""
    try:
        if not path or not isinstance(path, str):
            return False
        candidate = path if os.path.isabs(path) else os.path.join(REPO_ROOT, path)
        real = os.path.realpath(candidate)
        root = os.path.realpath(REPO_ROOT)
        return real == root or real.startswith(root + os.sep)
    except Exception:  # noqa: BLE001
        return False


def _extract_paths(args: Dict[str, Any]) -> List[str]:
    """Pull every string arg whose key looks path-like."""
    out: List[str] = []
    try:
        for k, v in args.items():
            if not isinstance(v, str):
                continue
            if any(pk in str(k).lower() for pk in _PATH_KEYS):
                out.append(v)
    except Exception:  # noqa: BLE001
        return out
    return out


def _looks_hard_dangerous(args: Dict[str, Any]) -> Optional[str]:
    """Return the matched deny-substring if any string/number arg contains one."""
    try:
        blob = " ".join(
            str(v) for v in args.values() if isinstance(v, (str, int, float))
        )
        low = blob.lower()
        for bad in _HARD_DENY_SUBSTRINGS:
            if bad in low:
                return bad
    except Exception:  # noqa: BLE001
        return None
    return None


def _resolve_risk(tool: Any) -> Tuple[Optional[str], str]:
    """Extract (risk, tool_id_for_messaging) from a Tool / dict / bare string."""
    risk: Optional[str] = None
    tool_id = "tool"
    try:
        if isinstance(tool, str):
            # Either a risk level or a bare tool id; treat known risks as risk.
            risk = tool if tool in VALID_RISKS else None
            tool_id = tool or "tool"
        elif isinstance(tool, dict):
            risk = tool.get("risk")
            tool_id = str(tool.get("id") or tool.get("name") or "tool")
        else:
            risk = getattr(tool, "risk", None)
            tool_id = str(
                getattr(tool, "id", None) or getattr(tool, "name", None) or "tool"
            )
    except Exception:  # noqa: BLE001
        risk = None
        tool_id = "tool"
    return risk, tool_id


def decide(tool: Any, args: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Return {mode, reason, risk, requires_backup}.

    `tool` may be a Tool-like object (with `.risk`/`.id`), a plain string risk
    level (or bare tool id), or a dict carrying a "risk" key. Pure &
    deterministic. Never raises.
    """
    args = _coerce_args(args)
    risk, tool_id = _resolve_risk(tool)

    # --- hard, content-based deny (defence in depth, checked FIRST) ------------
    bad = _looks_hard_dangerous(args)
    if bad is not None:
        return {
            "mode": "deny",
            "reason": f"Refused: arguments contain a destructive pattern ({bad!r}).",
            "risk": risk if risk in VALID_RISKS else (risk or "unknown"),
            "requires_backup": False,
        }

    # --- unknown / unset risk -> safest non-deny default -----------------------
    if risk not in VALID_RISKS:
        return {
            "mode": "confirm",
            "reason": (
                f"Unknown or unset risk level for '{tool_id}'; "
                "defaulting to confirm for safety."
            ),
            "risk": risk or "unknown",
            "requires_backup": False,
        }

    # --- per-risk policy -------------------------------------------------------
    if risk == "safe_read":
        return {
            "mode": "auto",
            "reason": "Read-only operation.",
            "risk": risk,
            "requires_backup": False,
        }

    if risk == "safe_write":
        paths = _extract_paths(args)
        if not paths:
            # No explicit path arg -> nothing to write outside; allow.
            return {
                "mode": "auto",
                "reason": "Safe write with no external path argument.",
                "risk": risk,
                "requires_backup": False,
            }
        outside = [p for p in paths if not _within_repo(p)]
        if outside:
            return {
                "mode": "confirm",
                "reason": (
                    f"Write targets outside the repo: {outside}. "
                    "Confirm before proceeding."
                ),
                "risk": risk,
                "requires_backup": False,
            }
        return {
            "mode": "auto",
            "reason": f"Safe write within the repo ({paths}).",
            "risk": risk,
            "requires_backup": False,
        }

    if risk == "destructive":
        return {
            "mode": "confirm",
            "reason": (
                "Irreversible/destructive operation — confirm; a "
                "backup/manifest is taken first."
            ),
            "risk": risk,
            "requires_backup": True,
        }

    if risk == "system_change":
        return {
            "mode": "confirm",
            "reason": "Changes host/system state — confirm before applying.",
            "risk": risk,
            "requires_backup": False,
        }

    if risk == "deployment":
        return {
            "mode": "confirm",
            "reason": "Deployment action — confirm before shipping.",
            "risk": risk,
            "requires_backup": False,
        }

    if risk == "financial":
        return {
            "mode": "confirm",
            "reason": "Spends money — explicit confirmation required.",
            "risk": risk,
            "requires_backup": False,
        }

    if risk == "security_sensitive":
        return {
            "mode": "confirm",
            "reason": "Touches secrets/auth surface — confirm before proceeding.",
            "risk": risk,
            "requires_backup": False,
        }

    # Unreachable given the VALID_RISKS guard, but stay safe.
    return {
        "mode": "confirm",
        "reason": "Unclassified operation; confirm for safety.",
        "risk": risk,
        "requires_backup": False,
    }


if __name__ == "__main__":
    # ----------------------------------------------------------------------
    # Self-contained smoke test. Asserts the full decision table from ARCH.
    # Pure & deterministic, so these assertions hold on any machine.
    # ----------------------------------------------------------------------
    inside = os.path.join(REPO_ROOT, "server", "data", "x.txt")
    outside = "/etc/passwd"

    # (tool, args, expected_mode, expected_requires_backup, label)
    cases = [
        ("safe_read", None, "auto", False, "safe_read always auto"),
        ("safe_write", {}, "auto", False, "safe_write no path -> auto"),
        ("safe_write", {"path": inside}, "auto", False, "safe_write in-repo -> auto"),
        ("safe_write", {"path": outside}, "confirm", False, "safe_write out-of-repo -> confirm"),
        ("safe_write", {"dest": "../../../etc/x"}, "confirm", False, "safe_write traversal -> confirm"),
        ("system_change", None, "confirm", False, "system_change -> confirm"),
        ("destructive", None, "confirm", True, "destructive -> confirm + backup"),
        ("deployment", None, "confirm", False, "deployment -> confirm"),
        ("financial", None, "confirm", False, "financial -> confirm"),
        ("security_sensitive", None, "confirm", False, "security_sensitive -> confirm"),
        ("totally_unknown", None, "confirm", False, "unknown risk -> confirm"),
        (None, None, "confirm", False, "None tool -> confirm"),
        ({"id": "x", "risk": "safe_read"}, None, "auto", False, "dict tool -> auto"),
        # Hard deny patterns beat the declared risk, even safe_read.
        ("safe_read", {"cmd": "rm -rf /"}, "deny", False, "hard-deny rm -rf /"),
        ("safe_read", {"cmd": "mkfs.ext4 /dev/sdb"}, "deny", False, "hard-deny mkfs"),
        ("safe_write", {"cmd": ":(){:|:&};:"}, "deny", False, "hard-deny fork bomb"),
        ("destructive", {"cmd": "dd if=/dev/zero of=/dev/sda"}, "deny", False, "hard-deny dd to device"),
    ]

    # A minimal Tool-like object to prove duck-typing works.
    class _T:
        risk = "safe_write"
        id = "file.write"

    failures = 0
    for tool, args, exp_mode, exp_backup, label in cases:
        v = decide(tool, args)
        ok = (
            isinstance(v, dict)
            and v.get("mode") == exp_mode
            and bool(v.get("requires_backup")) == exp_backup
            and v.get("mode") in ("auto", "confirm", "deny")
            and isinstance(v.get("reason"), str)
            and "risk" in v
        )
        status = "OK  " if ok else "FAIL"
        if not ok:
            failures += 1
        print(f"[{status}] {label:42s} -> mode={v.get('mode')} backup={v.get('requires_backup')}")

    # Tool-like object path.
    v = decide(_T(), {"path": inside})
    assert v["mode"] == "auto", v
    v = decide(_T(), {"path": outside})
    assert v["mode"] == "confirm", v
    print("[OK  ] Tool-like object resolves .risk/.id")

    # Never-raises contract on garbage input.
    for junk in (12345, [1, 2, 3], object(), {"risk": ["weird"]}, "  "):
        out = decide(junk, "not-a-dict")
        assert isinstance(out, dict) and out["mode"] in ("auto", "confirm", "deny"), out
    print("[OK  ] decide() never raises on junk input")

    if failures:
        raise SystemExit(f"{failures} case(s) failed")
    print(f"\nAll {len(cases)} table cases + duck-typing + never-raises checks passed.")
