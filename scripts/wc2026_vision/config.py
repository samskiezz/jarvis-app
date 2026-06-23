"""Vision pipeline configuration."""
from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = REPO_ROOT / "server" / "data"
VISION_DIR = DATA_DIR / "vision_tracking"
VIDEO_IN_DIR = DATA_DIR / "vision_videos_in"
VIDEO_OUT_DIR = DATA_DIR / "vision_videos_out"
FEATURES_PATH = DATA_DIR / "wc2026_tracking_features.json"
TRACKING_DB_PATH = DATA_DIR / "wc2026_tracking.db"

# Default YOLO model. For real football use a pitch-tuned model such as
# yolov8m-football or a Roboflow universe model. yolov8n is the fast CPU default.
DEFAULT_YOLO_MODEL = str((DATA_DIR / "vision_models" / "yolov8n.pt").resolve())

# COCO classes we care about.
PERSON_CLASS = 0
BALL_CLASS = 32
SPORTS_BALL_CLASS = 37

# Detection confidence thresholds.
PLAYER_CONF = 0.35
BALL_CONF = 0.15

# ByteTrack parameters.
TRACKER_MATCH_THRESH = 0.8
TRACKER_TRACK_THRESH = 0.5
TRACKER_LOST_BUFFER = 30

# Pitch dimensions (metres) — used for optional pitch-normalised features.
PITCH_LENGTH_M = 105.0
PITCH_WIDTH_M = 68.0

# How many frames to keep for smoothing player positions.
SMOOTHING_WINDOW = 5

# Team colours: jerseys are classified by dominant colour in the torso box.
# We use 2 clusters (home / away) plus a goalkeeper class.
N_TEAM_CLUSTERS = 2

# Speed switches for GPU inference.
# FP16 is disabled because ultralytics 8.2.18 + torch 2.4 raise a dtype mismatch
# in fuse_conv_and_bn on GeForce GPUs. Throughput on RTX 4090 is still ample.
YOLO_HALF_PRECISION = False
YOLO_BATCH_SIZE = 1             # >1 experimental; keep 1 for variable frame sizes
