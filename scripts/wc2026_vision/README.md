# WC2026 Vision Tracking System

Computer-vision pipeline that turns match videos into structured player/team
pattern features and feeds them into the WC2026 prediction engine.

## What it does

1. **Detect** players and the ball in every frame using YOLO (Ultralytics) +
   supervision ByteTrack.
2. **Assign teams** by clustering jersey colours (home / away / keeper).
3. **Detect events**: ball possession, passes, ball speed.
4. **Extract rhythmic/pattern features**: possession share, territory control,
   transition rate, per-player heatmaps.
5. **Store** everything in `server/data/wc2026_tracking.db` and export a JSON
   summary to `server/data/wc2026_tracking_features.json`.
6. **Predict**: the `vision_tracking` model in `worldcup_prediction_engine.py`
   uses recent tracking signatures when both teams have been seen on video.

## Quick start

```bash
# Drop match videos into the ingest folder, named with Home_vs_Away:
#   server/data/vision_videos_in/WC2022_Final_Argentina_vs_France.mp4

/opt/jarvis-app-1/.venv/bin/python scripts/wc2026_vision_ingest.py
```

The pipeline writes:
- Annotated tracking video: `server/data/vision_videos_out/`
- SQLite tracking DB: `server/data/wc2026_tracking.db`
- Prediction-engine feature file: `server/data/wc2026_tracking_features.json`

## Legal video sources

The system accepts three legal input paths:

### 1. Your own licensed/public-domain videos
Drop `.mp4`/`.mov`/`.avi`/`.mkv` files into `server/data/vision_videos_in/` and run
`scripts/wc2026_vision_ingest.py`.

### 2. SportsMOT (downloadable today, CC BY-NC 4.0)
SportsMOT contains 240 sports clips including real football footage. It can be
downloaded without an NDA:

```bash
# One-time download (~20.8 GB tar). Football clips are extracted automatically.
/opt/jarvis-app-1/.venv/bin/pip install dataset-tools
/opt/jarvis-app-1/.venv/bin/python -c "import dataset_tools as dt; dt.download(dataset='SportsMOT', dst_dir='server/data/vision_tracking/sportsmot_raw')"

# Extract only the football subset and run it through the vision pipeline
/opt/jarvis-app-1/.venv/bin/python scripts/wc2026_vision_sportsmot_ingest.py \
    --root server/data/vision_tracking/sportsmot --max-clips 100
```

The daily pipeline will also auto-ingest up to 100 SportsMOT football clips when
`server/data/vision_tracking/sportsmot` exists.

### 3. SoccerNet-v2 (500 full broadcast games, research NDA required)
SoccerNet videos require signing the research NDA at https://www.soccer-net.org/data
and receiving a password. After that:

```bash
/opt/jarvis-app-1/.venv/bin/pip install SoccerNet
/opt/jarvis-app-1/.venv/bin/python scripts/wc2026_vision/datasets/soccernet.py download \
    --password "YOUR_NDA_PASSWORD" --resolution 224p
/opt/jarvis-app-1/.venv/bin/python scripts/wc2026_vision/datasets/soccernet.py ingest \
    --max-games 10
```

## FIFA+ browser overlay

A Chrome extension that draws JARVIS predictions on top of the FIFA+ video player
while you watch matches is available at:

```
server/static/fifa-plus-overlay/
```

Install it via `chrome://extensions/` → **Developer mode** → **Load unpacked**.
It does **not** download or scrape the FIFA+ stream; it only renders predictions
on the page you are already watching.

## Demo (no real video needed)

```bash
/opt/jarvis-app-1/.venv/bin/python scripts/wc2026_vision/demo.py
```

This creates a synthetic match clip, runs the full pipeline, and prints a summary.
Because the players are computer-drawn stick figures, YOLO may not detect them
reliably; the demo is mainly to verify the pipeline wiring.

For integration testing without video, use:

```bash
/opt/jarvis-app-1/.venv/bin/python scripts/wc2026_vision/synthetic_data.py
```

## Requirements

Installed automatically by the daily wrapper:

- `torch` (CPU build by default)
- `torchvision`
- `ultralytics`
- `supervision`
- `scikit-learn`
- `opencv-python`

## Important limitations

- **Copyrighted match videos are not included.** You must supply your own video
  files, use a legal dataset such as SportsMOT/SoccerNet, or use the FIFA+ overlay
  for viewing-only predictions.
- **CPU-only by default.** Real-time processing of full matches needs a CUDA GPU
  and a football-specific YOLO checkpoint (e.g. a Roboflow football player model).
- **Team assignment is colour-based.** It can fail with similar kits, shadows, or
  low resolution. A trained re-ID model would be more robust.
- **Event detection is heuristic.** Passes, shots, and tackles are inferred from
  ball/player geometry, not from broadcast graphics or audio.

## Continuous learning

The daily update (`scripts/wc2026_daily_update.sh`) now runs the vision ingest
step before retraining. As new match videos are added, the tracking features are
re-exported and the `vision_tracking` model can gain weight in the ensemble if it
improves out-of-sample predictions.

## Architecture

```
scripts/wc2026_vision/
├── config.py          # paths, thresholds, pitch dims
├── detector.py        # YOLO player/ball detection
├── tracker.py         # ByteTrack multi-object tracking
├── team_assigner.py   # jersey-colour team clustering
├── events.py          # possession / pass heuristics
├── features.py        # aggregate player/team/rhythm features
├── storage.py         # SQLite + JSON persistence
├── pipeline.py        # end-to-end process_video()
├── datasets/          # legal dataset loaders (SportsMOT, SoccerNet)
├── demo.py            # synthetic match generator + runner
├── synthetic_data.py  # demo tracking records for integration tests
└── README.md          # this file
```
