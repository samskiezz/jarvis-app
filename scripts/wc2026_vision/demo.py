"""Generate a synthetic match clip and run the vision pipeline on it."""
from __future__ import annotations

import logging
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import cv2
import numpy as np

from wc2026_vision import config
from wc2026_vision.pipeline import process_video

LOG = logging.getLogger("wc2026_vision")


def _draw_player(img: np.ndarray, x: float, y: float, color: tuple[int, int, int],
                 scale: float = 1.0) -> None:
    """Draw a very simple humanoid (torso + head) that YOLO can detect as a person."""
    w, h = int(22 * scale), int(50 * scale)
    x, y = int(x), int(y)
    # Head
    cv2.ellipse(img, (x, y - h // 2), (int(10 * scale), int(12 * scale)),
                0, 0, 360, (50, 50, 50), -1)
    # Torso jersey
    cv2.rectangle(img, (x - w // 2, y - h // 2 + 10),
                  (x + w // 2, y + h // 2), color, -1)
    # Shorts
    cv2.rectangle(img, (x - w // 2, y + h // 2),
                  (x + w // 2, y + h // 2 + int(15 * scale)), (30, 30, 30), -1)
    # Outline to make shape distinct.
    cv2.rectangle(img, (x - w // 2, y - h // 2 + 10),
                  (x + w // 2, y + h // 2 + int(15 * scale)), (0, 0, 0), 1)


def make_synthetic_match(out_path: Path, frames: int = 300, fps: int = 25,
                         width: int = 1280, height: int = 720) -> Path:
    """Create a fake match with two teams moving a ball around."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(out_path), fourcc, fps, (width, height))

    # Two teams of 4 players each.
    home_players = np.array([[250, 250], [250, 470], [450, 180], [450, 540]], dtype=float)
    away_players = np.array([[1030, 250], [1030, 470], [830, 180], [830, 540]], dtype=float)
    ball = np.array([640.0, 360.0])
    ball_target = np.array([640.0, 360.0])
    possession = 0  # 0=home, 1=away

    for t in range(frames):
        # Grass background with pitch lines.
        img = np.full((height, width, 3), (34, 139, 34), dtype=np.uint8)
        cv2.rectangle(img, (50, 50), (width - 50, height - 50), (255, 255, 255), 2)
        cv2.line(img, (width // 2, 50), (width // 2, height - 50), (255, 255, 255), 2)
        cv2.circle(img, (width // 2, height // 2), 80, (255, 255, 255), 2)

        # Move players sinusoidally.
        phase = t * 0.08
        hp = home_players + np.array([
            [np.sin(phase) * 30, np.cos(phase) * 20],
            [np.cos(phase) * 20, np.sin(phase) * 30],
            [np.sin(phase + 1) * 25, np.cos(phase + 1) * 25],
            [np.cos(phase + 2) * 20, np.sin(phase + 2) * 20],
        ])
        ap = away_players + np.array([
            [-np.sin(phase) * 30, np.cos(phase) * 20],
            [-np.cos(phase) * 20, np.sin(phase) * 30],
            [-np.sin(phase + 1) * 25, np.cos(phase + 1) * 25],
            [-np.cos(phase + 2) * 20, np.sin(phase + 2) * 20],
        ])

        # Ball moves toward target.
        if np.linalg.norm(ball - ball_target) < 15:
            if possession == 0:
                target_player = hp[np.random.randint(len(hp))]
            else:
                target_player = ap[np.random.randint(len(ap))]
            ball_target = target_player + np.random.normal(0, 25, 2)
            ball_target = np.clip(ball_target, [120, 120], [width - 120, height - 120])
        ball += (ball_target - ball) * 0.06

        # Draw players.
        for p in hp:
            _draw_player(img, p[0], p[1], (255, 255, 255), scale=1.0)
        for p in ap:
            _draw_player(img, p[0], p[1], (0, 0, 200), scale=1.0)
        # Ball.
        cv2.circle(img, tuple(ball.astype(int)), 8, (0, 255, 255), -1)

        writer.write(img)

        # Random possession switch every ~4 seconds.
        if t % 100 == 0 and t > 0:
            possession = 1 - possession

    writer.release()
    LOG.info("wrote synthetic demo video: %s", out_path)
    return out_path


def run_demo() -> dict:
    """Run the full pipeline on a synthetic match."""
    out = config.VIDEO_IN_DIR / "demo_synthetic.mp4"
    make_synthetic_match(out, frames=300)
    return process_video(out, match_id="demo_001", home="Demo Home", away="Demo Away",
                         output_video=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    print(run_demo())
