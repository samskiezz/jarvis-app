# Vision pipeline (Cluster C2)

Covers gap-fixes **#9** (camera capture), **#10** (object/face detection),
**#11** (vision-LLM bridge), **#14** (multimodal scene description).

Three layers behind one service; each fails soft and reports its install hint
through `GET /v1/vision/status`.

| Layer | Library | Install | Cost | 2026 ref |
|---|---|---|---|---|
| Capture | `opencv-python` (cv2 4.10 already in `.venv`) | already installed | free | — |
| Detect | `ultralytics` (YOLOv8n default; YOLO11 / YOLO26 supported) | `pip install ultralytics` | free, ~250 MB | https://docs.ultralytics.com/models/yolo11 |
| Describe | `anthropic` SDK + Claude Opus 4.x vision | `pip install anthropic` + `ANTHROPIC_API_KEY` env | per-token (image ~1568 tokens for non-Opus, ~4784 for Opus 4.8) | https://docs.claude.com/en/docs/build-with-claude/vision |

## Activation checklist

1. Plug a camera in (USB webcam at `/dev/video0`, CSI Pi cam, or RTSP URL).
2. `cd /opt/jarvis-app-1 && .venv/bin/pip install ultralytics anthropic`
3. `export ANTHROPIC_API_KEY=sk-ant-...` (already set in `.env.secrets` per
   `multi-llm-openclaw-feedback` memory; just make sure the running process
   has it).
4. `pm2 restart jarvis-fastapi` (or whichever process serves `server/main.py`).
5. `curl -s localhost:8000/v1/vision/status | jq` — every `available` should be `true`.
6. `curl -s -X POST localhost:8000/v1/vision/detect | jq` — should list COCO classes.
7. `curl -s -X POST localhost:8000/v1/vision/describe \
       -H 'content-type: application/json' \
       -d '{"prompt":"What is happening?"}' | jq` — Claude reply.

## Endpoints

- `GET  /v1/vision/status` — per-layer availability + default models.
- `POST /v1/vision/detect` — `{camera_id?, model?}` → bbox + label list.
- `POST /v1/vision/describe` — `{camera_id?, prompt?}` → Claude vision reply.

## Env knobs

- `JARVIS_VISION_CAMERA` (default `0`) — int index or RTSP/HTTP URL.
- `JARVIS_YOLO_MODEL` (default `yolov8n.pt`) — any ultralytics weight.
- `JARVIS_VISION_LLM` (default `claude-opus-4-5-20250929`).
- `ANTHROPIC_API_KEY` — required for `/describe`.

## Browser-side companion (not shipped here)

For privacy-friendly client-side face detection without round-tripping
frames to the server, use **MediaPipe Face Detector** (BlazeFace) via
`@mediapipe/tasks-vision` — see
https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js.
The current `jarvis_live.html` is UI-theme-locked; do **not** add this
inline. Wire it via a separate JS module behind a feature flag when ready.

## Smoke test

```bash
./.venv/bin/python -c "import sys; sys.path.insert(0,'/opt/jarvis-app-1'); \
    from server.services import vision; print(vision.status())"
```

## Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `capture.available: false` | `cv2` missing | `pip install opencv-python` |
| `capture` ok, but `read() returned no frame` | wrong camera index, no permission, device busy | check `ls /dev/video*`, kill other capturers |
| `detect.available: false` | `ultralytics` missing | `pip install ultralytics` |
| `describe.available: false` reason mentions API key | env var not set | `export ANTHROPIC_API_KEY=...` |
| describe latency >5 s | first call downloads ~30 MB YOLO weights + Claude rtt | warm-up second call should be <2 s |
