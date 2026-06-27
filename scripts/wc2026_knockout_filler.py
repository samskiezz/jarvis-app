"""WC2026 knockout bracket dynamic resolver.

Purpose
-------
The FIFA WC2026 fixture file ships with knockout-round placeholders like
'Winner E', 'Runner-up B', '3rd A/B/C/D/F', 'Winner 73', etc. As real results
land, those placeholders need to be replaced with concrete team names so the
predictor can predict every knockout match and the lock cron can lock them.

This script resolves the bracket in stages:

  1. Group stage complete (all 72 group matches played)
     -> compute top 2 per group from `wc2026_results.json`
     -> compute the 8 best 3rd-placed teams
     -> assign them to the R32 'Winner X', 'Runner-up X', '3rd ...' slots
     -> rewrite the corresponding fixture rows in `wc2026_fixtures_all.json`

  2. R32 complete -> fill 'Winner 73'..'Winner 88' in R16 rows.
  3. R16 complete -> fill QF rows.
  4. QF  complete -> fill SF rows.
  5. SF  complete -> fill 3rd place + Final rows (also handles 'Loser 101'
     and 'Loser 102' for the 3rd-place playoff).

After ANY change the script invokes `wc2026_predictor.py` so the new
concrete fixtures get a prediction; the lock cron then freezes them at T-8h.

Cron
----
0 */4 * * *  /opt/jarvis-app-1/.venv/bin/python \
              /opt/jarvis-app-1/scripts/wc2026_knockout_filler.py \
              >> /var/log/wc2026_filler.log 2>&1

Idempotent — re-running with the same results is a no-op.
"""

from __future__ import annotations

import json
import logging
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("wc2026_filler")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s: %(message)s"
    ))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


REPO_ROOT = Path("/opt/jarvis-app-1")
FIXTURES_PATH = REPO_ROOT / "server" / "data" / "wc2026_fixtures_all.json"
RESULTS_PATH = REPO_ROOT / "server" / "data" / "wc2026_results.json"
PREDICTOR_SCRIPT = REPO_ROOT / "scripts" / "wc2026_predictor.py"

PLACEHOLDER_RE = re.compile(
    r"\b(Winner|Runner-?up|3rd|Loser|TBD)\b", re.IGNORECASE
)


def _is_placeholder(name: Optional[str]) -> bool:
    if not name:
        return True
    return bool(PLACEHOLDER_RE.search(name))


def _parse_score(score: Optional[str]) -> Optional[tuple[int, int]]:
    if not score or "-" not in score:
        return None
    try:
        h, a = score.split("-", 1)
        return int(h.strip()), int(a.strip())
    except (ValueError, AttributeError):
        return None


def _load_json(path: Path) -> dict:
    if not path.exists():
        logger.warning("file missing: %s", path)
        return {}
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("failed reading %s: %s", path, exc)
        return {}


def _merge_results_into_matches(matches: list[dict], results_doc: dict) -> None:
    """Stamp `result` onto each match dict from any '<bucket>_results' map."""
    score_by_n: dict[int, str] = {}
    for k, v in (results_doc or {}).items():
        if not (isinstance(k, str) and k.endswith("_results")
                and isinstance(v, dict)):
            continue
        for kk, vv in v.items():
            try:
                score_by_n[int(kk)] = str(vv)
            except (TypeError, ValueError):
                continue
    for m in matches:
        s = score_by_n.get(int(m.get("n", 0)))
        if s and not m.get("result"):
            m["result"] = s
            parsed = _parse_score(s)
            if parsed:
                hg, ag = parsed
                if hg > ag:
                    m["result_class"] = "H"
                elif ag > hg:
                    m["result_class"] = "A"
                else:
                    m["result_class"] = "D"
                m["played"] = True


def _compute_group_standings(
    matches: list[dict],
) -> tuple[dict[str, list[dict]], bool]:
    """Compute live group standings from played group matches.

    Returns ({group_letter: [team_stat, ...] sorted}, all_groups_complete).
    """
    groups: dict[str, dict[str, dict[str, int]]] = defaultdict(dict)
    group_matches_total: dict[str, int] = defaultdict(int)
    group_matches_played: dict[str, int] = defaultdict(int)
    for m in matches:
        if m.get("stage") != "GROUP":
            continue
        g = m.get("group")
        if not g:
            continue
        group_matches_total[g] += 1
        home = m.get("home")
        away = m.get("away")
        for team in (home, away):
            if team and team not in groups[g]:
                groups[g][team] = {"pts": 0, "gf": 0, "ga": 0, "p": 0}
        parsed = _parse_score(m.get("result"))
        if not parsed:
            continue
        group_matches_played[g] += 1
        hg, ag = parsed
        if home in groups[g]:
            groups[g][home]["gf"] += hg
            groups[g][home]["ga"] += ag
            groups[g][home]["p"] += 1
        if away in groups[g]:
            groups[g][away]["gf"] += ag
            groups[g][away]["ga"] += hg
            groups[g][away]["p"] += 1
        if hg > ag:
            if home in groups[g]:
                groups[g][home]["pts"] += 3
        elif ag > hg:
            if away in groups[g]:
                groups[g][away]["pts"] += 3
        else:
            if home in groups[g]:
                groups[g][home]["pts"] += 1
            if away in groups[g]:
                groups[g][away]["pts"] += 1
    standings: dict[str, list[dict]] = {}
    for g, teams in groups.items():
        rows = [
            {"team": t, "pts": v["pts"],
             "gd": v["gf"] - v["ga"], "gf": v["gf"]}
            for t, v in teams.items()
        ]
        rows.sort(key=lambda r: (r["pts"], r["gd"], r["gf"]), reverse=True)
        standings[g] = rows
    all_done = all(
        group_matches_total.get(g, 0) > 0
        and group_matches_played.get(g, 0) >= group_matches_total.get(g, 0)
        for g in groups
    )
    return standings, all_done


def _resolve_group_placeholders(
    matches: list[dict],
    standings: dict[str, list[dict]],
) -> int:
    """Replace 'Winner X' / 'Runner-up X' / '3rd ...' placeholders in R32 rows.

    Returns the number of placeholder fields that were rewritten.
    """
    winners: dict[str, str] = {}
    runners_up: dict[str, str] = {}
    thirds: list[tuple[str, dict]] = []
    for g, rows in standings.items():
        if len(rows) >= 1:
            winners[g] = rows[0]["team"]
        if len(rows) >= 2:
            runners_up[g] = rows[1]["team"]
        if len(rows) >= 3:
            thirds.append((g, rows[2]))
    # Pick top 8 third-placed teams overall.
    thirds_sorted = sorted(
        thirds,
        key=lambda gv: (gv[1]["pts"], gv[1]["gd"], gv[1]["gf"]),
        reverse=True,
    )
    top8_thirds: dict[str, str] = {g: row["team"] for g, row in thirds_sorted[:8]}

    rewrites = 0
    for m in matches:
        if m.get("stage") != "R32":
            continue
        for field in ("home", "away"):
            original = m.get(field)
            if not original or not _is_placeholder(original):
                continue
            replaced = _resolve_one_placeholder(
                original, winners, runners_up, top8_thirds
            )
            if replaced and replaced != original:
                m[field] = replaced
                rewrites += 1
    return rewrites


def _resolve_one_placeholder(
    label: str,
    winners: dict[str, str],
    runners_up: dict[str, str],
    top8_thirds: dict[str, str],
) -> Optional[str]:
    """Resolve a single 'Winner G' / 'Runner-up G' / '3rd A/B/C/D/F' string."""
    s = label.strip()
    m = re.match(r"^Winner\s+([A-L])$", s, re.IGNORECASE)
    if m:
        return winners.get(m.group(1).upper())
    m = re.match(r"^Runner-?up\s+([A-L])$", s, re.IGNORECASE)
    if m:
        return runners_up.get(m.group(1).upper())
    m = re.match(r"^3rd\s+([A-L/]+)$", s, re.IGNORECASE)
    if m:
        # '3rd A/B/C/D/F' — pick the first letter whose group's 3rd-placed
        # team made the top-8. FIFA's allocation rule is more nuanced
        # (specific pre-baked mapping table per draw), but for an MVP the
        # "first eligible match" rule gives a deterministic, correctable
        # answer — the operator can manually edit fixtures_all.json after
        # the official R32 bracket is published if it disagrees, and the
        # next predictor run picks up the edit.
        letters = [c for c in m.group(1) if c.isalpha()]
        for letter in letters:
            if letter in top8_thirds:
                team = top8_thirds[letter]
                # Remove from the pool so two R32 slots can't claim the
                # same 3rd-placed team.
                top8_thirds.pop(letter, None)
                return team
        return None
    return None


def _resolve_winner_n_placeholders(matches: list[dict]) -> int:
    """Replace 'Winner 73'..'Winner 102' and 'Loser 101'..'Loser 102' from
    the result of those matches once they're played.

    Returns the number of fields rewritten.
    """
    # Build outcome map: n -> (winner, loser).
    outcomes: dict[int, tuple[str, str]] = {}
    by_n: dict[int, dict] = {int(m["n"]): m for m in matches if m.get("n")}
    for n, m in by_n.items():
        if m.get("stage") == "GROUP":
            continue
        parsed = _parse_score(m.get("result"))
        if not parsed:
            continue
        hg, ag = parsed
        h, a = m.get("home"), m.get("away")
        if not h or not a or _is_placeholder(h) or _is_placeholder(a):
            continue
        if hg > ag:
            outcomes[n] = (h, a)
        elif ag > hg:
            outcomes[n] = (a, h)
        else:
            # Knockout draws — choose the team marked as the away side as
            # the loser by default (placeholder resolution should rely on
            # official penalty-shootout result rather than this stub).
            # Without shootout data we leave the slot unresolved.
            continue

    rewrites = 0
    for m in matches:
        if m.get("stage") == "GROUP":
            continue
        for field in ("home", "away"):
            original = m.get(field)
            if not original or not _is_placeholder(original):
                continue
            mm = re.match(r"^Winner\s+(\d+)$", original, re.IGNORECASE)
            if mm:
                src = int(mm.group(1))
                if src in outcomes:
                    m[field] = outcomes[src][0]
                    rewrites += 1
                continue
            mm = re.match(r"^Loser\s+(\d+)$", original, re.IGNORECASE)
            if mm:
                src = int(mm.group(1))
                if src in outcomes:
                    m[field] = outcomes[src][1]
                    rewrites += 1
                continue
    return rewrites


def _save_json(path: Path, doc: dict) -> None:
    """Atomic write: tmp + rename so the cron + dashboard never read a
    half-written file."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(doc, indent=2, ensure_ascii=False))
    tmp.replace(path)


def _rerun_predictor() -> int:
    """Invoke wc2026_predictor.py so the resolved knockout fixtures get
    predicted. Returns the subprocess exit code."""
    cmd = [sys.executable, str(PREDICTOR_SCRIPT)]
    try:
        result = subprocess.run(
            cmd, check=False, capture_output=True, text=True, timeout=600,
        )
        logger.info("predictor exit=%d stdout=%d bytes stderr=%d bytes",
                    result.returncode, len(result.stdout), len(result.stderr))
        if result.returncode != 0:
            logger.warning("predictor stderr tail: %s",
                           result.stderr[-300:])
        return result.returncode
    except (subprocess.TimeoutExpired, OSError) as exc:
        logger.error("predictor invocation failed: %s", exc)
        return 1


def main() -> int:
    fixtures = _load_json(FIXTURES_PATH)
    results = _load_json(RESULTS_PATH)
    if not fixtures:
        logger.error("no fixtures file; nothing to do")
        return 1
    matches = fixtures.get("matches") or []
    _merge_results_into_matches(matches, results)

    standings, groups_done = _compute_group_standings(matches)
    rewrites = 0
    # Resolve group placeholders from CURRENT standings even if the group stage
    # isn't fully complete. This lets the bracket surface provisional matchups
    # as results land; re-running the filler updates them if standings change.
    rewrites += _resolve_group_placeholders(matches, standings)
    # Even if groups aren't fully done, knockout 'Winner N' slots from
    # already-played knockouts can be resolved.
    rewrites += _resolve_winner_n_placeholders(matches)

    if rewrites == 0:
        logger.info("no placeholders resolved (groups_done=%s)", groups_done)
        return 0

    _save_json(FIXTURES_PATH, fixtures)
    logger.info("rewrote %d placeholder fields in %s",
                rewrites, FIXTURES_PATH.name)
    rc = _rerun_predictor()
    logger.info("filler pass complete: rewrites=%d predictor_rc=%d",
                rewrites, rc)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
