#!/usr/bin/env python3
"""Self-test runner for secret_scanner.py.

Runs 8 scenarios against the hook, comparing actual exit code + stdout to the
expected (allow vs deny + label). Prints PASS/FAIL per case and a summary.
Exit 0 if all pass, 1 otherwise.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "secret_scanner.py")


def run_hook(payload: dict) -> tuple[int, str, str]:
    """Run the hook with `payload` on stdin. Return (exit_code, stdout, stderr)."""
    proc = subprocess.run(
        [sys.executable, HOOK],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=10,
    )
    return (proc.returncode, proc.stdout, proc.stderr)


def expect_deny(name: str, payload: dict, label_must_contain: str) -> bool:
    code, out, err = run_hook(payload)
    if code != 0:
        print(f"FAIL  {name}: expected exit 0, got {code}. stderr={err!r}")
        return False
    if not out.strip():
        print(f"FAIL  {name}: expected deny decision on stdout, got empty.")
        return False
    try:
        decision = json.loads(out)
    except Exception as exc:
        print(f"FAIL  {name}: stdout not JSON ({exc}). raw={out!r}")
        return False
    if decision.get("permissionDecision") != "deny":
        print(f"FAIL  {name}: expected permissionDecision=deny, got {decision!r}")
        return False
    reason = str(decision.get("permissionDecisionReason") or "")
    if label_must_contain.lower() not in reason.lower():
        print(
            f"FAIL  {name}: reason missing label {label_must_contain!r}. reason={reason!r}"
        )
        return False
    print(f"PASS  {name}")
    return True


def expect_allow(name: str, payload: dict) -> bool:
    code, out, err = run_hook(payload)
    if code != 0:
        print(f"FAIL  {name}: expected exit 0, got {code}. stderr={err!r}")
        return False
    if out.strip():
        print(f"FAIL  {name}: expected silent allow (empty stdout), got {out!r}")
        return False
    print(f"PASS  {name}")
    return True


def main() -> int:
    if not os.path.exists(HOOK):
        print(f"FAIL  secret_scanner.py not found at {HOOK}")
        return 1

    results: list[bool] = []

    # 1. AWS key in Write content → blocked
    results.append(
        expect_deny(
            "aws_key_in_write_blocked",
            {
                "tool_name": "Write",
                "tool_input": {
                    "file_path": "/opt/jarvis-app-1/server/config.py",
                    "content": 'AWS_KEY = "AKIAIOSFODNN7EXAMPLE"\n',
                },
            },
            "AWS access key",
        )
    )

    # 2. GitHub PAT in Edit new_string → blocked
    results.append(
        expect_deny(
            "github_pat_in_edit_blocked",
            {
                "tool_name": "Edit",
                "tool_input": {
                    "file_path": "/opt/jarvis-app-1/server/auth.py",
                    "old_string": "TOKEN = None",
                    "new_string": 'TOKEN = "ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"',
                },
            },
            "GitHub personal access token",
        )
    )

    # 3. Private key block in Write → blocked
    results.append(
        expect_deny(
            "private_key_in_write_blocked",
            {
                "tool_name": "Write",
                "tool_input": {
                    "file_path": "/opt/jarvis-app-1/server/keys/id_rsa",
                    "content": (
                        "-----BEGIN RSA PRIVATE KEY-----\n"
                        "MIIEpAIBAAKCAQEAxxx...\n"
                        "-----END RSA PRIVATE KEY-----\n"
                    ),
                },
            },
            "Private key block",
        )
    )

    # 4. Postgres URL with password → blocked
    results.append(
        expect_deny(
            "postgres_url_with_password_blocked",
            {
                "tool_name": "Write",
                "tool_input": {
                    "file_path": "/opt/jarvis-app-1/server/db.py",
                    "content": 'DATABASE_URL = "postgres://app:s3cretP@ss@db.internal:5432/jarvis"',
                },
            },
            "Database URL",
        )
    )

    # 5. Plain text "do not commit api_key" → ALLOWED (warning prose, no value)
    results.append(
        expect_allow(
            "warning_prose_allowed",
            {
                "tool_name": "Write",
                "tool_input": {
                    "file_path": "/opt/jarvis-app-1/docs/contributing.md",
                    "content": (
                        "Do not commit api_key or secret values to this repository.\n"
                        "Use the env var loader described in security.md instead.\n"
                    ),
                },
            },
        )
    )

    # 6. Write to audit/ with a fake key → ALLOWED (audit path skipped)
    results.append(
        expect_allow(
            "audit_path_skipped",
            {
                "tool_name": "Write",
                "tool_input": {
                    "file_path": "/opt/jarvis-app-1/audit/foo.json",
                    "content": '{"aws": "AKIAIOSFODNN7EXAMPLE"}',
                },
            },
        )
    )

    # 7. Write to tests/fixtures with a key → ALLOWED (test fixture skipped)
    results.append(
        expect_allow(
            "tests_fixtures_path_skipped",
            {
                "tool_name": "Write",
                "tool_input": {
                    "file_path": "/opt/jarvis-app-1/tests/fixtures/keys.py",
                    "content": 'FAKE_AWS = "AKIAIOSFODNN7EXAMPLE"\n',
                },
            },
        )
    )

    # 8. Empty content → ALLOWED
    results.append(
        expect_allow(
            "empty_content_allowed",
            {
                "tool_name": "Write",
                "tool_input": {
                    "file_path": "/opt/jarvis-app-1/server/blank.py",
                    "content": "",
                },
            },
        )
    )

    passed = sum(1 for r in results if r)
    total = len(results)
    print()
    print(f"Summary: {passed}/{total} passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
