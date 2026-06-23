"""Generate plausible synthetic tracking features for demo/integration testing.

This is NOT for real prediction — it lets you verify the prediction-engine
integration before real match videos are processed.
"""
from __future__ import annotations

import json
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from wc2026_vision import config
from wc2026_vision.storage import ensure_schema, export_features_json, save_match_features


def _features(home_poss: float, home_territory: float, transition_rate: float,
              n_passes: int) -> dict:
    return {
        "player": {
            "teams": {
                "home": {"avg_x": home_territory, "avg_y": 0.5, "spread_x": 0.15, "spread_y": 0.12},
                "away": {"avg_x": round(1.0 - home_territory, 3), "avg_y": 0.5, "spread_x": 0.15, "spread_y": 0.12},
            }
        },
        "rhythmic": {
            "windows": [
                {"window": i, "possession_home": round(max(0.0, min(1.0, home_poss + random.uniform(-0.1, 0.1))), 3),
                 "possession_away": round(max(0.0, min(1.0, 1 - home_poss + random.uniform(-0.1, 0.1))), 3),
                 "transitions": random.randint(0, 3),
                 "avg_ball_speed": round(random.uniform(800, 1400), 1)}
                for i in range(4)
            ],
            "overall": {
                "possession_home": home_poss,
                "possession_away": round(1.0 - home_poss, 3),
                "transition_rate": transition_rate,
            },
        },
        "video_meta": {"fps": 25.0, "frames": 1500, "width": 1920, "height": 1080},
    }


def seed_demo_matches() -> None:
    """Insert synthetic tracking records for a few recent-ish national-team fixtures."""
    conn = ensure_schema()
    fixtures = [
        ("synth_001", "Argentina", "France", 0.55, 0.58, 0.08, 420),
        ("synth_002", "France", "Morocco", 0.48, 0.52, 0.10, 380),
        ("synth_003", "Argentina", "Croatia", 0.52, 0.55, 0.09, 400),
        ("synth_004", "Brazil", "South Korea", 0.60, 0.62, 0.11, 450),
        ("synth_005", "England", "Senegal", 0.58, 0.60, 0.07, 410),
    ]
    for mid, home, away, poss, terr, trans, npass in fixtures:
        feats = _features(poss, terr, trans, npass)
        summary = {
            "frames_total": 1500,
            "possession_home": poss,
            "possession_away": round(1 - poss, 3),
            "n_passes": npass,
            "passes_home": int(npass * poss),
            "passes_away": int(npass * (1 - poss)),
            "avg_ball_speed": round(random.uniform(900, 1300), 2),
        }
        save_match_features(mid, home, away, "synthetic", summary, feats, [], conn=conn)
    conn.close()
    export_features_json()
    print(f"Seeded {len(fixtures)} synthetic tracking matches.")


if __name__ == "__main__":
    seed_demo_matches()
