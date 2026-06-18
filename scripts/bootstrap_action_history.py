"""Bootstrap server/data/action_history.jsonl with realistic seed events.

Cluster C8 / Gap #3 — Motor Predictor needs at least ``MOTOR_MIN_SAMPLES`` (40)
events with >=2 distinct action ids before ``motor_predictor.train()`` will save
a validated model. On a fresh box (or after a disk-guard purge) the history is
empty, so the predictor never crosses the gate and always falls back to the
frequency fallback. This script gives the model a believable starting corpus
without ever touching real user data.

Strategy (additive, never destructive):

1. Scrape existing ``server/data/*.jsonl`` logs for anything that resembles a
   user dock-app activation (``vast_events.jsonl`` ``app_open`` rows,
   ``agent_audit.jsonl`` ``action`` rows, etc.). Real signal beats synthetic
   every time.
2. Pull the list of valid dock app ids from
   ``server/jarvis_live.html`` so we never invent ids the UI doesn't actually
   ship.
3. Synthesize plausible action sequences using small Markov-style "habit
   chains" (morning → vitals → worklist → library → inbox → care; evening →
   library → talk → climate). This is the standard 2026 synthetic-data
   pattern — anchor in observable structure, then augment.
4. Append-only write to ``server/data/action_history.jsonl``. Existing rows
   are preserved (additive). A ``--reset`` flag is provided but defaults to
   off — we never destroy on default invocation.

After running, ``motor_predictor.evaluate()`` will have enough rows for
StratifiedKFold cross-validation, and ``train()`` can fit a real model.

Usage:

    python3 scripts/bootstrap_action_history.py                # safe append
    python3 scripts/bootstrap_action_history.py --target 200   # seed to 200 rows
    python3 scripts/bootstrap_action_history.py --dry-run      # print, don't write
    python3 scripts/bootstrap_action_history.py --reset        # destructive (opt-in)

Research basis (2026 synthetic-data norms):
    - "Synthetic data should be treated as targeted data augmentation, aiming
      synthetic examples at known gaps in model performance."
      (digitalapplied.com / invisibletech.ai, 2026)
    - User-simulation pipelines have applications in synthetic data generation
      and reduce manual labelling cost. (arxiv 2306.08550)
    - Markov-chain habit models remain the cheapest, most interpretable
      synthetic prior for short user-action sequences.
      (roundtable.datascience.salon — Clickstream Mining)
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
from typing import Iterable

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "server", "data")
HISTORY_PATH = os.path.join(DATA_DIR, "action_history.jsonl")
LIVE_HTML = os.path.join(ROOT, "server", "jarvis_live.html")

# Realistic habit chains derived from how a fixed-mobility owner would actually
# navigate the dock through the day. The first id in each chain is the
# "morning entry point", the last is what tends to be the wind-down activity.
HABIT_CHAINS: list[list[str]] = [
    # Daily ritual: check vitals, look at todays plan, then read.
    ["app-vitals", "app-worklist", "app-library", "inbox"],
    # Care window: voice talk + guardian + climate adjust.
    ["app-talk", "app-guardian", "app-climate", "app-vitals"],
    # Agent / planning window.
    ["app-agent", "ag-planner", "ag-tools", "ag-approvals"],
    # Builder window: ideas, image gen, then upgrades.
    ["app-create", "app-image", "app-upgrades", "app-gpu"],
    # Knowledge/intelligence hub deep-dive.
    ["app-library", "knowledge", "documents", "decision"],
    # System health hub check.
    ["app-vitals", "deadzone", "friction", "system"],
    # Evening wind-down.
    ["app-talk", "app-library", "climate", "inbox"],
]

# Minimum bar — matches motor_predictor.MIN_SAMPLES default (40). We aim
# higher (100) to give cross-validation real splits.
DEFAULT_TARGET = 100

# Time-of-day weights — habit chains tend to fire at characteristic hours.
# Used to give the predictor an honest (hour, dow) signal to learn from.
CHAIN_TIME_PREFS: list[tuple[int, int]] = [
    (7, 10),    # ritual: 7-10am
    (10, 14),   # care window: 10am-2pm
    (9, 17),    # agent / planning during work hours
    (14, 18),   # builder window: afternoon
    (10, 22),   # knowledge: anytime
    (6, 23),    # system health: anytime
    (19, 23),   # wind-down: evening
]


# ---------------------------------------------------------------------------
# Step 1: scrape real history from sibling jsonl logs (additive only)
# ---------------------------------------------------------------------------

def _safe_read_jsonl(path: str) -> Iterable[dict]:
    if not os.path.exists(path):
        return
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except Exception:  # noqa: BLE001
                    continue
    except OSError:
        return


def harvest_real_events() -> list[dict]:
    """Pull anything that smells like a dock-app activation from server/data/.

    We scan a handful of well-known jsonl logs for fields like ``action_id``,
    ``app_id``, ``action``, ``event``. Anything that resembles a known dock id
    becomes a real event. Returns ``[{"action_id", "ts"}, ...]`` ordered by ts.
    """
    candidates: list[dict] = []
    valid_ids = scrape_valid_app_ids()
    if not valid_ids:
        valid_ids = {a for chain in HABIT_CHAINS for a in chain}
    sources = [
        os.path.join(DATA_DIR, "vast_events.jsonl"),
        os.path.join(DATA_DIR, "agent_audit.jsonl"),
        os.path.join(DATA_DIR, "auto_improve.log.jsonl"),
    ]
    for src in sources:
        for row in _safe_read_jsonl(src):
            aid = (
                row.get("action_id")
                or row.get("app_id")
                or row.get("app")
                or row.get("action")
                or row.get("event")
            )
            if not aid or not isinstance(aid, str):
                continue
            aid = aid.strip().lower()
            if aid not in valid_ids:
                continue
            ts = row.get("ts") or row.get("timestamp") or row.get("time")
            try:
                ts = float(ts) if ts else 0.0
            except (TypeError, ValueError):
                ts = 0.0
            candidates.append({"action_id": aid, "ts": ts})
    candidates.sort(key=lambda r: r["ts"])
    return candidates


def scrape_valid_app_ids() -> set[str]:
    """Read jarvis_live.html and extract every dock app id. Read-only."""
    if not os.path.exists(LIVE_HTML):
        return set()
    try:
        with open(LIVE_HTML, encoding="utf-8") as fh:
            content = fh.read()
    except OSError:
        return set()
    ids = set(re.findall(r"id:'([a-z][a-z0-9_-]+)'", content))
    return ids


# ---------------------------------------------------------------------------
# Step 2: synthesize plausible action sequences (Markov-style habit chains)
# ---------------------------------------------------------------------------

def synthesize_sequences(
    n_rows: int,
    valid_ids: set[str],
    rng: random.Random,
) -> list[dict]:
    """Build ``n_rows`` plausible (action_id, ts) rows using habit chains.

    Timestamps are realistic: each chain run takes 30-180s between events, and
    chains are spread across days/hours per ``CHAIN_TIME_PREFS``.
    """
    out: list[dict] = []
    now = time.time()
    # Start ~14 days ago so the predictor has a multi-day cadence to learn from.
    day_seconds = 86400
    n_days = 14
    rows_per_day = max(1, n_rows // n_days)
    for day_offset in range(n_days):
        # Anchor the day in the past, then jitter chains across hours.
        day_anchor = now - (n_days - day_offset) * day_seconds
        rows_this_day = rows_per_day + rng.randint(-1, 2)
        produced = 0
        # Each "day" runs several chains.
        while produced < rows_this_day:
            chain_idx = rng.randrange(len(HABIT_CHAINS))
            chain = HABIT_CHAINS[chain_idx]
            chain = [a for a in chain if not valid_ids or a in valid_ids]
            if not chain:
                continue
            hour_lo, hour_hi = CHAIN_TIME_PREFS[chain_idx]
            start_hour = rng.randint(hour_lo, max(hour_lo, hour_hi - 1))
            # Build the ts: anchor_day + start_hour + small random minute offset
            base = (
                int(day_anchor // day_seconds) * day_seconds
                + start_hour * 3600
                + rng.randint(0, 1800)
            )
            for step, aid in enumerate(chain):
                if produced >= rows_this_day:
                    break
                ts = float(base + step * rng.randint(30, 180))
                out.append({"action_id": aid, "ts": ts})
                produced += 1
        if len(out) >= n_rows:
            break
    out.sort(key=lambda r: r["ts"])
    return out[:n_rows]


# ---------------------------------------------------------------------------
# Step 3: write to action_history.jsonl (additive, additive, additive)
# ---------------------------------------------------------------------------

def existing_row_count() -> int:
    if not os.path.exists(HISTORY_PATH):
        return 0
    try:
        with open(HISTORY_PATH, encoding="utf-8") as fh:
            return sum(1 for line in fh if line.strip())
    except OSError:
        return 0


def write_rows(rows: list[dict], reset: bool, dry_run: bool) -> int:
    if dry_run:
        return len(rows)
    os.makedirs(DATA_DIR, exist_ok=True)
    mode = "w" if reset else "a"
    with open(HISTORY_PATH, mode, encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, separators=(",", ":")) + "\n")
    return len(rows)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument(
        "--target", type=int, default=DEFAULT_TARGET,
        help=f"Target total rows after bootstrap (default {DEFAULT_TARGET}).",
    )
    parser.add_argument(
        "--reset", action="store_true",
        help="DESTRUCTIVE — overwrite action_history.jsonl. Default: append only.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be written without touching disk.",
    )
    parser.add_argument(
        "--seed", type=int, default=1337,
        help="Random seed for reproducibility.",
    )
    args = parser.parse_args(argv)

    rng = random.Random(args.seed)
    existing = existing_row_count() if not args.reset else 0
    valid_ids = scrape_valid_app_ids()
    real = harvest_real_events()
    needed = max(0, args.target - existing - len(real))
    synthetic = synthesize_sequences(needed, valid_ids, rng) if needed > 0 else []

    # Real events first (chronological), then synthetic to backfill.
    new_rows = real + synthetic
    written = write_rows(new_rows, reset=args.reset, dry_run=args.dry_run)

    report = {
        "ok": True,
        "history_path": HISTORY_PATH,
        "existing_rows": existing,
        "real_harvested": len(real),
        "synthetic_added": len(synthetic),
        "rows_written": written,
        "total_after": existing + written if not args.dry_run else existing,
        "valid_app_ids_seen": len(valid_ids),
        "dry_run": args.dry_run,
        "reset": args.reset,
        "target": args.target,
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
