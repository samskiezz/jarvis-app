#!/usr/bin/env python3
"""Hook: PreToolUse Write|Edit — block writes whose content contains credentials.

Reads the Claude Code tool-call JSON on stdin. If the Write `content` or Edit
`new_string` matches any of the credential patterns below, writes a deny
permission decision to stdout and exits 0 (Claude Code expects exit 0 with the
decision in stdout, not a non-zero exit). Otherwise prints nothing and exits 0,
which is "allow by default".

Audit/test artefact paths are skipped — those folders intentionally contain
fake credentials for fixture purposes.

Stdlib only: json, os, re, sys, pathlib.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import PurePosixPath

# (label, compiled_pattern) — order is signal-priority; first match wins.
SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("AWS access key", re.compile(r"AKIA[0-9A-Z]{16}")),
    (
        "Private key block",
        re.compile(r"-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----"),
    ),
    ("Slack token", re.compile(r"xox[baprs]-[0-9A-Za-z-]{10,}")),
    ("GitHub personal access token", re.compile(r"gh[pousr]_[A-Za-z0-9_]{36,}")),
    (
        "JWT",
        re.compile(r"ey[A-Za-z0-9_-]{20,}\.ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}"),
    ),
    (
        "Database URL with embedded password",
        re.compile(r"(?i)(postgres|mysql|mongodb|redis)://[^:\s]+:[^@\s]{4,}@"),
    ),
    (
        "Hardcoded credential assignment",
        re.compile(
            r"(?i)(api[_-]?key|secret|token|password)\s*[=:]\s*[\"'][A-Za-z0-9+/=_\-]{20,}[\"']"
        ),
    ),
]

# Path prefixes (resolved POSIX) that should be skipped — audit/test artefacts.
SKIP_PATH_PREFIXES: tuple[str, ...] = (
    "/opt/jarvis-app-1/audit/",
    "/opt/jarvis-app-1/.proof/",
    "/tmp/",
)

# Substrings in the path that mark it as a test fixture.
SKIP_PATH_SUBSTRINGS: tuple[str, ...] = (
    "/tests/",
    "/test/",
    "/fixtures/",
    "/__tests__/",
)

# File suffixes that mark a path as a test file.
SKIP_PATH_SUFFIXES: tuple[str, ...] = (
    ".test.py",
    ".spec.ts",
    ".test.ts",
    ".spec.js",
    ".test.js",
)


def should_skip_path(file_path: str) -> bool:
    """Return True when the path is an audit/test artefact and should not be scanned."""
    if not file_path:
        return False
    # Normalise to POSIX form for prefix/substring matching.
    try:
        posix = str(PurePosixPath(file_path))
    except Exception:
        posix = file_path
    for prefix in SKIP_PATH_PREFIXES:
        if posix.startswith(prefix):
            return True
    for needle in SKIP_PATH_SUBSTRINGS:
        if needle in posix:
            return True
    for suffix in SKIP_PATH_SUFFIXES:
        if posix.endswith(suffix):
            return True
    return False


def find_secret(content: str) -> tuple[str, str] | None:
    """Return (label, matched_snippet) for the first secret in `content`, or None."""
    if not content:
        return None
    for label, pattern in SECRET_PATTERNS:
        m = pattern.search(content)
        if m:
            snippet = m.group(0)
            # Truncate snippet so we never echo the full secret back into logs.
            if len(snippet) > 12:
                snippet = snippet[:6] + "…"
            return (label, snippet)
    return None


def extract_fields(payload: dict) -> tuple[str, str, str]:
    """Return (tool_name, file_path, content_to_scan) from a Claude Code hook payload."""
    tool_name = str(payload.get("tool_name") or payload.get("toolName") or "")
    tool_input = payload.get("tool_input") or payload.get("toolInput") or {}
    if not isinstance(tool_input, dict):
        tool_input = {}
    file_path = str(tool_input.get("file_path") or tool_input.get("filePath") or "")
    if tool_name == "Write":
        content = str(tool_input.get("content") or "")
        field = "content"
    elif tool_name == "Edit":
        content = str(tool_input.get("new_string") or tool_input.get("newString") or "")
        field = "new_string"
    else:
        content = ""
        field = ""
    return (file_path, field, content)


def build_deny(label: str, field: str) -> dict:
    return {
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            f"SECRET DETECTED: {label} in {field}. Use env var instead."
        ),
    }


def main() -> int:
    try:
        raw = sys.stdin.read() if not sys.stdin.isatty() else ""
        payload = json.loads(raw) if raw else {}
    except Exception:
        # Malformed input — do not block normal flow; allow by default.
        return 0
    if not isinstance(payload, dict):
        return 0

    file_path, field, content = extract_fields(payload)
    if not field:
        # Not a Write/Edit tool call — allow.
        return 0
    if should_skip_path(file_path):
        return 0

    hit = find_secret(content)
    if hit is None:
        return 0  # silent allow

    label, _snippet = hit
    decision = build_deny(label, field)
    sys.stdout.write(json.dumps(decision))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
