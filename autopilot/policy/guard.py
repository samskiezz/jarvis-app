"""Policy enforcement — wraps assurance.gates.dangerous + adds path/class checks."""
from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

POLICY_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(ROOT, "autopilot", "config", "autopilot.config.json")


def _load_json(path: str) -> dict[str, Any]:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}


_ACTION_POLICY = _load_json(os.path.join(POLICY_DIR, "action-policy.json"))
_BLOCKED = _load_json(os.path.join(POLICY_DIR, "blocked-actions.json"))
_PATHS = _load_json(os.path.join(POLICY_DIR, "allowed-write-paths.json"))
_PLANES = _load_json(os.path.join(POLICY_DIR, "plane-policies.json"))


@dataclass(frozen=True)
class GuardVerdict:
    allowed: bool
    blocked: bool
    requires_approval: bool
    dry_run_only: bool
    route: str | None  # "forge" | "approval" | None
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "allowed": self.allowed,
            "blocked": self.blocked,
            "requires_approval": self.requires_approval,
            "dry_run_only": self.dry_run_only,
            "route": self.route,
            "reason": self.reason,
        }


def classify_action(name: str) -> str:
    """Map a command name → action class. Best-effort heuristic."""
    n = name.lower()
    if any(p in n for p in ("dispose", "destroy", "delete", "rm.", "drop.", "purge.", "wipe.")):
        return "destructive"
    if any(p in n for p in ("deploy", "apollo.release", "release.")):
        return "deploy"
    if n.endswith(".publish") or n.startswith("publish."):
        return "publish"
    if any(p in n for p in ("send.", "email.", "sms.", "slack.", "notify.external")):
        return "external_write"
    if any(p in n for p in ("write.db", "db.write", "insert.", "update.", "migrate.")):
        return "database_write"
    if n.startswith("db.") or n.endswith(".read") or n.endswith(".list") or n.endswith(".get"):
        return "database_read"
    if n.startswith("worker.start") or n.endswith(".start"):
        return "worker_start"
    if n.startswith("worker.stop") or n.endswith(".stop"):
        return "worker_stop"
    if n.startswith("gpu.launch") or "paid" in n:
        return "paid_resource_launch"
    if n.startswith("fs.write") or n.startswith("write."):
        return "safe_write"
    if n.startswith("discover.") or n.startswith("scan.") or n.endswith(".scan"):
        return "read_only"
    if n.startswith("report.") or n.startswith("generate.report"):
        return "generated_write"
    if "secret" in n or "credential" in n or "token.read" in n:
        return "secret_access"
    if "code.modify" in n or "patch." in n or "refactor." in n:
        return "code_modify"
    return "read_only"


def _check_blocked_pattern(cmd_string: str) -> str | None:
    patterns = _BLOCKED.get("patterns", [])
    for p in patterns:
        try:
            if re.search(p, cmd_string, re.IGNORECASE):
                return p
        except re.error:
            continue
    return None


def is_blocked(name: str, raw_cmd: str = "") -> tuple[bool, str]:
    """Hard block: dangerous command names + dangerous shell patterns."""
    if name in _BLOCKED.get("commands", []):
        return True, f"command '{name}' in blocked-actions.json"
    if raw_cmd:
        hit = _check_blocked_pattern(raw_cmd)
        if hit:
            return True, f"shell pattern '{hit}' matches"
    # Reuse assurance.gates.dangerous
    try:
        from assurance.gates.dangerous import is_dangerous  # type: ignore
        if is_dangerous(name):
            return True, f"assurance.gates flagged '{name}' dangerous"
    except Exception:  # noqa: BLE001
        pass
    return False, ""


def is_allowed(klass: str) -> bool:
    rule = _ACTION_POLICY.get("classes", {}).get(klass, {})
    if rule.get("block"):
        return False
    if rule.get("auto"):
        return True
    cfg_key = rule.get("auto_if_config")
    if cfg_key:
        cfg = _load_json(CONFIG_PATH)
        return bool(cfg.get(cfg_key, False))
    return False


def _path_allowed(path: str) -> bool:
    if not path:
        return True
    norm = os.path.normpath(path).lstrip("/")
    # forbidden first
    for fb in _PATHS.get("forbidden_paths", []):
        if "*" in fb:
            # glob-lite
            import fnmatch
            if fnmatch.fnmatch(norm, fb.rstrip("/").lstrip("/")) or fnmatch.fnmatch(norm, fb):
                return False
        elif norm.startswith(fb.strip("/")):
            return False
    # then allowed
    for ap in _PATHS.get("paths", []):
        if norm.startswith(ap.strip("/")):
            return True
    return False


class PolicyGuard:
    """Combine all the checks: name → class → policy → path → verdict."""

    def evaluate(self, name: str, *, raw_cmd: str = "", paths: list[str] | None = None,
                 dry_run: bool = False, approved: bool = False) -> GuardVerdict:
        blocked, why = is_blocked(name, raw_cmd)
        if blocked:
            return GuardVerdict(False, True, False, False, None, why)

        klass = classify_action(name)
        rule = _ACTION_POLICY.get("classes", {}).get(klass, {})

        # explicit owner approval bypasses everything except hard-block
        if approved:
            return GuardVerdict(True, False, False, False, None, f"approved by owner; class={klass}")

        # dry-run is always safe (no actual mutation)
        if dry_run:
            return GuardVerdict(True, False, False, True, None, f"dry-run; class={klass}")

        # path check for safe_write / generated_write
        if klass in ("safe_write", "generated_write") and paths:
            for p in paths:
                if not _path_allowed(p):
                    return GuardVerdict(False, False, True, True, "approval",
                                         f"path '{p}' not in allowed-write-paths")

        if rule.get("block"):
            return GuardVerdict(False, True, False, False, None,
                                 f"class={klass} is blocked by policy")

        # forge route for code_modify
        if klass == "code_modify":
            return GuardVerdict(False, False, True, False, "forge",
                                 f"class={klass} routes to forge approval queue")

        # external_write routes to approval
        if klass == "external_write":
            return GuardVerdict(False, False, True, False, "approval",
                                 f"class={klass} requires owner approval")

        if rule.get("auto"):
            return GuardVerdict(True, False, False, False, None, f"auto class={klass}")
        cfg_key = rule.get("auto_if_config")
        if cfg_key:
            cfg = _load_json(CONFIG_PATH)
            if cfg.get(cfg_key, False):
                return GuardVerdict(True, False, False, False, None,
                                     f"auto class={klass} via cfg.{cfg_key}=true")
        return GuardVerdict(False, False, True, True, "approval",
                             f"class={klass} not auto-allowed; needs approval or dry-run")
