"""CommandBus + API payload fuzzer.

Generates malformed payloads (oversized, unicode, missing fields, duplicate
idempotency keys, secret-laden strings) and dispatches them. The bus must
never crash on any input. Patterns inspired by AFL++ + onefuzz.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import string
import sys
import time
from typing import Any

import tempfile

from assurance import audit, events
from assurance.audit.redact import has_secret
from assurance.commands.bus import get_bus
from assurance.commands.types import Command
from assurance.invariants.runner import run_all

CORPUS_DIR = os.path.join(os.path.dirname(__file__), "corpus")
CRASHES_DIR = os.path.join(os.path.dirname(__file__), "crashes")
os.makedirs(CRASHES_DIR, exist_ok=True)


def _isolate_sinks() -> str:
    """Redirect audit + event JSONL into a temp dir so accumulated history
    from prior runs doesn't taint the invariant check at the end of the fuzz.
    """
    tmp = tempfile.mkdtemp(prefix="assurance-fuzz-")
    audit.log.AUDIT_FILE = os.path.join(tmp, "audit.jsonl")
    events.bus.EVENTS_FILE = os.path.join(tmp, "events.jsonl")
    events.bus._BUS = None
    from assurance.commands import bus as cmd_bus
    cmd_bus._BUS = None
    return tmp


def _rand_str(rng: random.Random, n: int) -> str:
    pool = string.ascii_letters + string.digits + " \t\n\"'<>{}[](),."
    return "".join(rng.choice(pool) for _ in range(n))


def _gen_payload(rng: random.Random) -> dict[str, Any]:
    shape = rng.choice(["small", "deep", "wide", "unicode", "binary_text",
                        "secret_like", "empty"])
    if shape == "small":
        return {"x": rng.randint(0, 999)}
    if shape == "deep":
        d: dict[str, Any] = {"v": rng.randint(0, 999)}
        for _ in range(rng.randint(2, 10)):
            d = {"x": d}
        return d
    if shape == "wide":
        return {f"k{i}": _rand_str(rng, 16) for i in range(rng.randint(8, 32))}
    if shape == "unicode":
        return {"text": "πø∆ßΩ‮𒀀😶‍🌫️​\x00 mixed"}
    if shape == "binary_text":
        return {"bytes_as_str": "".join(chr(rng.randint(0, 0xFFFF)) for _ in range(64))}
    if shape == "secret_like":
        # Bus should accept; audit/event sinks must redact.
        return {"password": "p4ssw0rd!", "key": "sk-" + "x" * 40,
                "bearer": "Bearer ghp_" + "x" * 40}
    return {}


def _gen_name(rng: random.Random) -> str:
    options = [
        "noop.echo", "ping", "gpu.dispose", "gpu.launch_disposable",
        "claude.run.archive", "claude.improve.land", "claude.improve.discard",
        "chat.dispatch",
        # Unknown ones to stress the unknown_command path
        "totally.unknown", "x.x.x.x.x",
    ]
    return rng.choice(options)


def _stress_iter(rng: random.Random, idx: int) -> dict[str, Any]:
    bus = get_bus()
    name = _gen_name(rng)
    payload = _gen_payload(rng)
    dry_run = rng.random() < 0.7
    approved = rng.random() < 0.3
    idem = f"k-{idx % 50}" if rng.random() < 0.4 else None  # reuse keys ~40%
    cmd = Command(name=name, actor=f"fuzz/{idx}", payload=payload,
                  dry_run=dry_run, approved=approved, idempotency_key=idem)
    out = bus.dispatch(cmd)
    return {"name": name, "ok": out.ok, "kind": getattr(out, "error_kind", None),
            "dry_run": dry_run, "approved": approved}


def _check_no_secret_leak() -> tuple[int, list[str]]:
    """Walk the JSONL sinks; flag any line that still contains a raw secret pattern."""
    from assurance.audit.log import AUDIT_FILE
    from assurance.events.bus import EVENTS_FILE

    leaks = 0
    samples: list[str] = []
    for f in (AUDIT_FILE, EVENTS_FILE):
        if not os.path.exists(f):
            continue
        try:
            with open(f, encoding="utf-8") as fh:
                for line in fh:
                    if has_secret(line):
                        leaks += 1
                        if len(samples) < 5:
                            samples.append(line[:240])
        except OSError:
            pass
    return leaks, samples


def main() -> int:
    p = argparse.ArgumentParser(description="Assurance fuzz harness.")
    p.add_argument("--seed", type=int, default=int(os.environ.get("FUZZ_SEED", 42)))
    p.add_argument("--iter", type=int, default=200, help="iterations")
    p.add_argument("--smoke", action="store_true",
                   help="quick CI mode: 200 iterations, hard fail on crash/secret.")
    p.add_argument("--corpus", action="store_true",
                   help="also replay every JSON file in fuzz/corpus/.")
    args = p.parse_args()

    rng = random.Random(args.seed)
    iters = 200 if args.smoke else args.iter

    _isolate_sinks()

    started = time.time()
    summary: dict[str, int] = {"ok": 0, "fail": 0, "by_kind": {}}  # type: ignore[assignment]
    by_kind: dict[str, int] = {}
    crashes = 0
    for i in range(iters):
        try:
            r = _stress_iter(rng, i)
            if r["ok"]:
                summary["ok"] += 1
            else:
                summary["fail"] += 1
                by_kind[r["kind"] or "?"] = by_kind.get(r["kind"] or "?", 0) + 1
        except Exception as exc:  # noqa: BLE001 — bus must never raise
            crashes += 1
            crash_path = os.path.join(CRASHES_DIR, f"crash-{int(time.time())}-{i}.json")
            try:
                with open(crash_path, "w", encoding="utf-8") as fh:
                    json.dump({"iter": i, "exc": str(exc)}, fh)
            except OSError:
                pass

    # Corpus replay (deterministic).
    if args.corpus and os.path.isdir(CORPUS_DIR):
        for fname in sorted(os.listdir(CORPUS_DIR)):
            path = os.path.join(CORPUS_DIR, fname)
            try:
                with open(path, encoding="utf-8") as fh:
                    seed_data = json.load(fh)
            except (OSError, json.JSONDecodeError):
                continue
            try:
                cmd = Command(
                    name=seed_data.get("name", "noop.echo"),
                    actor=seed_data.get("actor", "corpus"),
                    payload=seed_data.get("payload", {}),
                    dry_run=bool(seed_data.get("dry_run", True)),
                    approved=bool(seed_data.get("approved", False)),
                )
                get_bus().dispatch(cmd)
            except Exception:  # noqa: BLE001
                crashes += 1

    leaks, leak_samples = _check_no_secret_leak()
    inv = run_all()

    finished = time.time()
    report = {
        "iters": iters,
        "duration_s": finished - started,
        "summary": summary,
        "by_kind": by_kind,
        "crashes": crashes,
        "secret_leaks_in_jsonl": leaks,
        "secret_leak_samples": leak_samples,
        "invariants_overall_ok": inv.overall_ok,
        "invariants_passed": inv.passed,
        "invariants_total": inv.total,
        "invariants_failures": [{"name":r.name,"evidence":r.evidence} for r in inv.results if not r.passed],
    }
    print(json.dumps(report, indent=2, default=str))

    rc = 0
    if crashes:
        print(f"FAIL: {crashes} crashes", file=sys.stderr); rc = 2
    if leaks:
        print(f"FAIL: {leaks} secret leak(s) in JSONL sinks", file=sys.stderr); rc = 2
    if not inv.overall_ok:
        print("FAIL: invariants violated after fuzz", file=sys.stderr); rc = 2
    return rc


if __name__ == "__main__":
    sys.exit(main())
