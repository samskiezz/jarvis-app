#!/usr/bin/env python3
"""WC2026 data-source integrity verifier.

Scans every wc2026_*.json under server/data/ and verifies that every
record/match/row carries either:
  - a record-level "verified": true PLUS a non-empty "source" field, OR
  - a top-level (file-level) "source" field that vouches for the whole
    file.

This is the data-integrity guardrail referenced in CLAUDE.md: it prevents
unsourced / hallucinated WC2026 facts from silently entering the pipeline.

Usage
-----
    python3 scripts/wc2026_verify_sources.py            # warn-only (exit 0)
    python3 scripts/wc2026_verify_sources.py --strict   # non-zero on any failure

The --strict mode is what cron / pre-commit should call. Default mode is
the developer-friendly warn-only mode for local exploration.

Exit codes
----------
    0   all files pass (or warn-only mode)
    1   one or more unverified records found (strict only)
    2   internal error (path missing, JSON unreadable, etc.)
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from typing import Any, Iterable, Optional


_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_THIS_DIR)
DATA_DIR = os.path.join(_REPO_ROOT, "server", "data")

# Keys that commonly hold arrays of records inside a wc2026_*.json file.
# We scan all of them; a file that puts its records under a different key
# still gets the file-level-source pass-through if it declares one.
_RECORD_ARRAY_KEYS = (
    "matches",
    "fixtures",
    "results",
    "records",
    "predictions",
    "rows",
    "items",
    "players",
    "data",
    "value_bets",
    "features",
)


def _has_nonempty_string(obj: Any, key: str) -> bool:
    v = obj.get(key) if isinstance(obj, dict) else None
    return isinstance(v, str) and v.strip() != ""


def _record_is_verified(rec: Any) -> bool:
    """A record passes if it carries verified=true AND a non-empty source."""
    if not isinstance(rec, dict):
        # Non-dict rows can't carry per-record provenance; they MUST rely
        # on the file-level source declaration.
        return False
    if rec.get("verified") is not True:
        return False
    return _has_nonempty_string(rec, "source")


def _iter_records(doc: Any) -> Iterable[tuple[str, int, Any]]:
    """Yield (container_key, index, record) for every record-like object
    discovered in `doc`. Top-level dict fields that aren't list/dict are
    skipped because they're metadata, not records."""
    if isinstance(doc, list):
        for i, rec in enumerate(doc):
            yield ("<root>", i, rec)
        return
    if not isinstance(doc, dict):
        return
    # First pass: known record-array keys.
    for key in _RECORD_ARRAY_KEYS:
        arr = doc.get(key)
        if isinstance(arr, list):
            for i, rec in enumerate(arr):
                yield (key, i, rec)
    # Second pass: any OTHER top-level list field of dicts (covers files
    # that use a non-standard container name).
    for key, val in doc.items():
        if key in _RECORD_ARRAY_KEYS:
            continue
        if isinstance(val, list) and val and all(isinstance(x, dict) for x in val):
            for i, rec in enumerate(val):
                yield (key, i, rec)


def _verify_file(path: str) -> list[str]:
    """Verify one JSON file. Returns a list of human-readable failures.

    An empty list means the file passes. Failures include both 'file
    unreadable' style errors and per-record verification failures.
    """
    failures: list[str] = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            doc = json.load(f)
    except OSError as exc:
        failures.append(f"{path}: cannot read ({exc})")
        return failures
    except ValueError as exc:
        failures.append(f"{path}: invalid JSON ({exc})")
        return failures

    file_level_source_ok = (
        isinstance(doc, dict) and _has_nonempty_string(doc, "source")
    )

    record_failures: list[str] = []
    record_count = 0
    for container, idx, rec in _iter_records(doc):
        record_count += 1
        if _record_is_verified(rec):
            continue
        if file_level_source_ok:
            # File-level source vouches for every record in the file —
            # individual records don't need their own provenance.
            continue
        # Try to produce a useful identifier for the failing row.
        ident = ""
        if isinstance(rec, dict):
            for k in ("id", "match_id", "name", "home", "team", "date"):
                v = rec.get(k)
                if v:
                    ident = f" {k}={v!r}"
                    break
            if not ident and "home" in rec and "away" in rec:
                ident = f" {rec.get('home')!r} vs {rec.get('away')!r}"
        record_failures.append(
            f"{path}: container={container!r} idx={idx}{ident} "
            f"missing verified=true + source AND no file-level source"
        )

    # If the file has zero record-like rows AND no file-level source,
    # treat it as a metadata-only file and let it pass — we don't want
    # to fail on, e.g., empty config blobs.
    if record_count == 0 and not file_level_source_ok:
        return failures
    failures.extend(record_failures)
    return failures


def _discover_files(data_dir: str) -> list[str]:
    pattern = os.path.join(data_dir, "wc2026_*.json")
    return sorted(glob.glob(pattern))


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Verify wc2026_*.json files carry source provenance",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero if any unverified record is found.",
    )
    parser.add_argument(
        "--data-dir",
        default=DATA_DIR,
        help=f"Directory to scan (default: {DATA_DIR})",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    if not os.path.isdir(args.data_dir):
        print(f"[wc2026_verify_sources] ERROR: data dir not found: {args.data_dir}",
              file=sys.stderr)
        return 2

    files = _discover_files(args.data_dir)
    if not files:
        print(f"[wc2026_verify_sources] no wc2026_*.json found in {args.data_dir}",
              file=sys.stderr)
        return 0

    all_failures: list[str] = []
    files_with_failures = 0
    for path in files:
        fails = _verify_file(path)
        if fails:
            files_with_failures += 1
            all_failures.extend(fails)

    if all_failures:
        label = "FAIL" if args.strict else "WARN"
        print(f"[wc2026_verify_sources] {label}: "
              f"{len(all_failures)} unverified record(s) across "
              f"{files_with_failures} file(s):",
              file=sys.stderr)
        for line in all_failures:
            print(f"  - {line}", file=sys.stderr)
        if args.strict:
            return 1
        return 0

    print(f"[wc2026_verify_sources] OK: {len(files)} file(s) all sourced")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
