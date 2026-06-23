"""WC2026 T-8h prediction locker.

Purpose
-------
Every fixture's prediction must be FROZEN exactly 8 hours before kickoff so
nobody (including the system itself) can retroactively rewrite what was
predicted once the match is close to starting. This is the "ensure your not
lying" audit guarantee — predictions made on the morning of the game stay
in the DB exactly as they were.

What it does
------------
1. Reads `server/data/wc2026_fixtures_all.json` (chronological kickoff list).
2. Reads `server/data/wc2026_model_predictions.json` (latest predictor run).
3. For every fixture whose `kickoff_iso` is within the next 8 hours and
   which is NOT already locked, writes the current prediction into the
   `locked_predictions` SQLite table.
4. Idempotent: the underlying INSERT uses `OR IGNORE` on the PRIMARY KEY
   (match_n), so re-running on the 15-min cron never double-locks.

Cron
----
*/15 * * * *  /opt/jarvis-app-1/.venv/bin/python \
               /opt/jarvis-app-1/scripts/wc2026_lock_predictions.py \
               >> /var/log/wc2026_lock.log 2>&1

The 8h window paired with the 15-min cadence means the lock fires within
~7.75h-8h of every kickoff, regardless of when the cron runs.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import wc2026_db as wdb  # noqa: E402

logger = logging.getLogger("wc2026_lock")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s: %(message)s"
    ))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


FIXTURES_PATH = Path("/opt/jarvis-app-1/server/data/wc2026_fixtures_all.json")
PREDICTIONS_PATH = Path(
    "/opt/jarvis-app-1/server/data/wc2026_model_predictions.json"
)
LOCK_WINDOW_HOURS = 8.0


def _parse_iso(iso_str: Optional[str]) -> Optional[datetime]:
    """Parse an ISO timestamp into a tz-aware UTC datetime. None on failure."""
    if not iso_str:
        return None
    s = iso_str.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _load_json(path: Path) -> dict:
    if not path.exists():
        logger.warning("file missing: %s", path)
        return {}
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("failed reading %s: %s", path, exc)
        return {}


def main() -> int:
    fixtures_doc = _load_json(FIXTURES_PATH)
    preds_doc = _load_json(PREDICTIONS_PATH)
    if not fixtures_doc or not preds_doc:
        logger.error("missing fixtures or predictions JSON; nothing to lock")
        return 1

    matches = fixtures_doc.get("matches") or []
    all_preds = preds_doc.get("all_fixture_predictions") or {}
    if not all_preds:
        logger.error(
            "all_fixture_predictions missing from %s — run "
            "wc2026_predictor.py first",
            PREDICTIONS_PATH,
        )
        return 1

    model_name = preds_doc.get("model") or "elo_bivariate_poisson_dixoncoles"
    source_run_id = (
        (preds_doc.get("all_fixture_summary") or {}).get("run_id")
        or preds_doc.get("generated_at")
        or "unknown"
    )

    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(hours=LOCK_WINDOW_HOURS)

    inserted = 0
    skipped_locked = 0
    skipped_outside = 0
    skipped_no_pred = 0
    skipped_played = 0

    conn = wdb.init_db()
    try:
        for m in matches:
            n = m.get("n")
            kickoff_iso = m.get("kickoff_iso")
            kickoff_dt = _parse_iso(kickoff_iso)
            if n is None or kickoff_dt is None:
                continue
            # Skip already-played fixtures — there is no point locking a
            # prediction after the actual score is known. The audit DB
            # already has those rows via the normal predictor log.
            if m.get("played"):
                skipped_played += 1
                continue
            # Only lock fixtures whose kickoff is within the 8h window.
            if kickoff_dt > cutoff:
                skipped_outside += 1
                continue
            if kickoff_dt < now - timedelta(hours=24):
                # Stale — safety guard so a misconfigured fixture file can't
                # backfill ancient locks.
                skipped_outside += 1
                continue
            if wdb.is_locked(int(n), conn=conn):
                skipped_locked += 1
                continue
            pred = all_preds.get(str(n))
            if not pred or pred.get("status") != "predicted":
                skipped_no_pred += 1
                continue
            wrote = wdb.lock_prediction(int(n), {
                "kickoff_iso": kickoff_iso,
                "model": model_name,
                "home": pred.get("home") or m.get("home"),
                "away": pred.get("away") or m.get("away"),
                "predicted_score": pred.get("predicted_score"),
                "predicted_wdl": pred.get("predicted_wdl"),
                "p_home": pred.get("p_home"),
                "p_draw": pred.get("p_draw"),
                "p_away": pred.get("p_away"),
                "source_run_id": source_run_id,
            }, conn=conn)
            if wrote:
                inserted += 1
                logger.info(
                    "locked match #%s %s vs %s -> %s (kickoff %s)",
                    n, pred.get("home"), pred.get("away"),
                    pred.get("predicted_score"), kickoff_iso,
                )
            else:
                # Race: another worker already locked it between is_locked
                # and the insert. Count as skipped, not error.
                skipped_locked += 1
    finally:
        conn.close()

    logger.info(
        "lock-pass complete: inserted=%d already_locked=%d outside_window=%d "
        "no_prediction=%d played=%d",
        inserted, skipped_locked, skipped_outside, skipped_no_pred,
        skipped_played,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
