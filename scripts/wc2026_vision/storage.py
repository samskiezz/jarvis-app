"""Persistence for tracking features and raw frame-level tracking data."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import config


def ensure_schema(db_path: Path = config.TRACKING_DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS matches (
            match_id TEXT PRIMARY KEY,
            home TEXT,
            away TEXT,
            video_source TEXT,
            processed_at TEXT,
            possession_home REAL,
            possession_away REAL,
            n_passes INTEGER,
            avg_ball_speed REAL,
            features_json TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS frame_tracks (
            match_id TEXT,
            frame_idx INTEGER,
            timestamp REAL,
            player_id INTEGER,
            team TEXT,
            x REAL,
            y REAL,
            PRIMARY KEY (match_id, frame_idx, player_id)
        )
    """)
    conn.commit()
    return conn


def save_match_features(match_id: str, home: str, away: str, video_source: str,
                        summary: dict[str, Any], features: dict[str, Any],
                        possession_log: list[Any], conn: sqlite3.Connection | None = None) -> None:
    close = False
    if conn is None:
        conn = ensure_schema()
        close = True
    try:
        conn.execute(
            "INSERT OR REPLACE INTO matches VALUES (?,?,?,?,?,?,?,?,?,?)",
            (match_id, home, away, video_source,
             datetime.now(timezone.utc).isoformat(),
             summary.get("possession_home"),
             summary.get("possession_away"),
             summary.get("n_passes"),
             summary.get("avg_ball_speed"),
             json.dumps(features, ensure_ascii=False)),
        )
        conn.execute("DELETE FROM frame_tracks WHERE match_id = ?", (match_id,))
        rows = []
        for p in possession_log:
            if p.player_id is None:
                continue
            rows.append((match_id, p.frame_idx, p.timestamp, p.player_id, p.team or "unknown", 0, 0))
        if rows:
            conn.executemany(
                "INSERT OR REPLACE INTO frame_tracks (match_id, frame_idx, timestamp, player_id, team, x, y) VALUES (?,?,?,?,?,?,?)",
                rows,
            )
        conn.commit()
    finally:
        if close:
            conn.close()


def load_team_tracking_signature(team: str, last_n: int = 5,
                                 db_path: Path = config.TRACKING_DB_PATH) -> dict[str, Any]:
    """Aggregate recent tracking-derived stats for a national team."""
    if not db_path.exists():
        return {}
    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute(
            "SELECT features_json, home, away FROM matches WHERE home=? OR away=? ORDER BY processed_at DESC LIMIT ?",
            (team, team, last_n),
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        return {}

    possession = []
    transitions = []
    for features_json, home, away in rows:
        feats = json.loads(features_json or "{}")
        side = "home" if home == team else "away"
        overall = feats.get("rhythmic", {}).get("overall", {})
        possession.append(overall.get("possession_home" if side == "home" else "possession_away", 0.0))
        transitions.append(overall.get("transition_rate", 0.0))

    import statistics
    return {
        "matches": len(rows),
        "avg_possession": round(statistics.mean(possession), 3) if possession else 0.0,
        "avg_transition_rate": round(statistics.mean(transitions), 4) if transitions else 0.0,
    }


def export_features_json(path: Path = config.FEATURES_PATH) -> None:
    """Dump all per-match tracking features to JSON for the prediction engine."""
    if not config.TRACKING_DB_PATH.exists():
        path.write_text("{}", encoding="utf-8")
        return
    conn = sqlite3.connect(str(config.TRACKING_DB_PATH))
    try:
        rows = conn.execute(
            "SELECT match_id, home, away, possession_home, possession_away, n_passes, avg_ball_speed, features_json FROM matches"
        ).fetchall()
    finally:
        conn.close()

    doc: dict[str, Any] = {"generated_at": datetime.now(timezone.utc).isoformat(), "matches": {}}
    for mid, home, away, ph, pa, npass, speed, feats in rows:
        doc["matches"][mid] = {
            "home": home, "away": away,
            "possession_home": ph, "possession_away": pa,
            "n_passes": npass, "avg_ball_speed": speed,
            "features": json.loads(feats or "{}"),
        }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
