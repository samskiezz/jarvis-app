"""Aggregate per-player and per-team rhythmic/pattern features from tracking."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

import numpy as np

from . import config


def _centre(box: np.ndarray) -> np.ndarray:
    return np.array([(box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0])


def extract_player_features(tracks: list[Any], teams: dict[int, str],
                            frame_shape: tuple[int, int]) -> dict[str, Any]:
    """Compute heatmap centroids, speed, territory control per team."""
    if not tracks:
        return {}

    player_positions: dict[int, list[np.ndarray]] = defaultdict(list)
    player_speeds: dict[int, list[float]] = defaultdict(list)
    team_positions: dict[str, list[np.ndarray]] = defaultdict(list)

    prev: dict[int, np.ndarray] = {}
    for ft in tracks:
        for pid, box in zip(ft.player_ids, ft.player_boxes):
            pid = int(pid)
            c = _centre(box)
            player_positions[pid].append(c)
            team = teams.get(pid, "unknown")
            if team in ("home", "away"):
                team_positions[team].append(c)
            if pid in prev:
                player_speeds[pid].append(float(np.linalg.norm(c - prev[pid])))
            prev[pid] = c

    h, w = frame_shape[:2]
    features: dict[str, Any] = {"teams": {}, "players": {}}

    for team, pts in team_positions.items():
        arr = np.vstack(pts)
        # Territory = average x position as fraction of pitch width.
        features["teams"][team] = {
            "avg_x": round(float(np.mean(arr[:, 0])) / w, 3),
            "avg_y": round(float(np.mean(arr[:, 1])) / h, 3),
            "spread_x": round(float(np.std(arr[:, 0])) / w, 3),
            "spread_y": round(float(np.std(arr[:, 1])) / h, 3),
            "n_tracks": len(pts),
        }

    for pid, pts in player_positions.items():
        arr = np.vstack(pts)
        speeds = player_speeds.get(pid, [0.0])
        features["players"][str(pid)] = {
            "team": teams.get(pid, "unknown"),
            "avg_x": round(float(np.mean(arr[:, 0])) / w, 3),
            "avg_y": round(float(np.mean(arr[:, 1])) / h, 3),
            "distance_px": round(float(np.sum([np.linalg.norm(arr[i] - arr[i - 1])
                                                for i in range(1, len(arr))])), 1),
            "avg_speed_px": round(float(np.mean(speeds)), 2),
            "n_frames": len(pts),
        }

    return features


def extract_rhythmic_features(possession_log: list[Any], n_windows: int = 4) -> dict[str, Any]:
    """Extract momentum / rhythm: possession sequences, transitions, pressing."""
    if not possession_log:
        return {}
    window_size = max(1, len(possession_log) // n_windows)
    out: dict[str, Any] = {"windows": []}
    for i in range(n_windows):
        start = i * window_size
        end = start + window_size
        seg = possession_log[start:end]
        teams = [p.team for p in seg if p.team]
        total = len(teams)
        if total == 0:
            continue
        home = teams.count("home") / total
        away = teams.count("away") / total
        # Transition count = number of times possession team changes.
        transitions = sum(1 for j in range(1, len(seg))
                          if seg[j].team != seg[j - 1].team and seg[j].team and seg[j - 1].team)
        out["windows"].append({
            "window": i,
            "possession_home": round(home, 3),
            "possession_away": round(away, 3),
            "transitions": transitions,
            "avg_ball_speed": round(float(np.mean([p.ball_speed for p in seg])), 2),
        })
    # Overall.
    teams = [p.team for p in possession_log if p.team]
    total = len(teams)
    out["overall"] = {
        "possession_home": round(teams.count("home") / total, 3) if total else 0.0,
        "possession_away": round(teams.count("away") / total, 3) if total else 0.0,
        "transition_rate": round(sum(1 for j in range(1, len(possession_log))
                                      if possession_log[j].team != possession_log[j - 1].team
                                      and possession_log[j].team and possession_log[j - 1].team)
                                 / max(1, len(possession_log)), 4),
    }
    return out
