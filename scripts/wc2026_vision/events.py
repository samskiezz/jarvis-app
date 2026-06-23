"""Event detection from tracked frames: possession, passes, ball movement."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from . import config


@dataclass
class PossessionFrame:
    frame_idx: int
    timestamp: float
    team: str | None = None
    player_id: int | None = None
    ball_speed: float = 0.0


@dataclass
class PassEvent:
    frame_start: int
    frame_end: int
    timestamp: float
    from_team: str | None
    from_player: int | None
    to_player: int | None
    length_px: float = 0.0


class EventDetector:
    """Simple possession + pass detector from tracking data."""

    def __init__(self) -> None:
        self.possession_log: list[PossessionFrame] = []
        self.passes: list[PassEvent] = []
        self._prev_ball: np.ndarray | None = None
        self._prev_carrier: tuple[str | None, int | None] = (None, None)
        self._pass_candidate: PassEvent | None = None

    @staticmethod
    def _box_centre(box: np.ndarray) -> np.ndarray:
        return np.array([(box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0])

    def _closest_player(self, ball_box: np.ndarray, frame: np.ndarray,
                        ft: Any, teams: dict[int, str]) -> tuple[int | None, str | None, float]:
        ball_c = self._box_centre(ball_box)
        best_id: int | None = None
        best_team: str | None = None
        best_d = float("inf")
        for pid, box in zip(ft.player_ids, ft.player_boxes):
            pc = self._box_centre(box)
            d = float(np.linalg.norm(ball_c - pc))
            if d < best_d:
                best_d = d
                best_id = int(pid)
                best_team = teams.get(pid)
        # Require ball to be within ~1.5 player heights.
        if best_id is not None and best_d > 80:
            best_id, best_team = None, None
        return best_id, best_team, best_d

    def process(self, ft: Any, teams: dict[int, str], fps: float) -> None:
        ball_c = self._box_centre(ft.ball_box) if ft.ball_box is not None else None
        speed = 0.0
        if ball_c is not None and self._prev_ball is not None:
            speed = float(np.linalg.norm(ball_c - self._prev_ball)) * fps
        self._prev_ball = ball_c

        carrier_id, carrier_team, _ = (
            self._closest_player(ft.ball_box, np.empty(0), ft, teams)
            if ft.ball_box is not None else (None, None, float("inf"))
        )

        pf = PossessionFrame(frame_idx=ft.frame_idx, timestamp=ft.timestamp,
                             team=carrier_team, player_id=carrier_id, ball_speed=speed)
        self.possession_log.append(pf)

        # Pass heuristic: ball leaves one carrier and is caught by a teammate after moving fast.
        prev_team, prev_id = self._prev_carrier
        if carrier_id is not None and carrier_id != prev_id and speed > 80:
            if prev_team is not None and carrier_team == prev_team and prev_id != carrier_id:
                self.passes.append(PassEvent(
                    frame_start=ft.frame_idx - max(1, int(fps * 0.3)),
                    frame_end=ft.frame_idx,
                    timestamp=ft.timestamp,
                    from_team=prev_team,
                    from_player=prev_id,
                    to_player=carrier_id,
                    length_px=speed / max(fps, 1.0),
                ))
        self._prev_carrier = (carrier_team, carrier_id)

    def summarise(self) -> dict[str, Any]:
        if not self.possession_log:
            return {}
        teams = [p.team for p in self.possession_log if p.team]
        total = len(teams)
        return {
            "frames_total": len(self.possession_log),
            "possession_home": round(teams.count("home") / total, 3) if total else 0.0,
            "possession_away": round(teams.count("away") / total, 3) if total else 0.0,
            "n_passes": len(self.passes),
            "passes_home": sum(1 for p in self.passes if p.from_team == "home"),
            "passes_away": sum(1 for p in self.passes if p.from_team == "away"),
            "avg_ball_speed": round(float(np.mean([p.ball_speed for p in self.possession_log])), 2),
        }
