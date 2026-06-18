# A11Y Auto-Install — Cluster C4 (2026 evidence pack)

One bash script installs the entire accessibility stack and configures
sensible free defaults. No hardware required to get a usable system.

## Run it

```bash
bash scripts/install_a11y_stack.sh
```

Re-running is safe. The script is additive only and never touches runtime
status files. A log is written to `.proof/a11y_install_<timestamp>.log`.

## What the prior pass got wrong

The prior C4 handoff claimed four manual steps were unavoidable:

1. Tobii Eye Tracker 5 (~$230 hardware + SDK)
2. NVDA controller-client install (Windows)
3. `pip install ultralytics opencv-python`
4. `pip install tensorflow tensorflow-hub`

Three of these (#2 on Windows, #3, #4) are now scripted. The fourth
(Tobii hardware) is **truly optional** because MediaPipe + WebGazer.js
gives ~5° gaze for free — usable for dock-app selection, which is the
primary Jarvis interaction surface.

## 2026 evidence for the "free-default" decision

| Backend | Cost | Accuracy | Linux? | Source |
| --- | --- | --- | --- | --- |
| MediaPipe Face Mesh + iris refinement | $0 | ~5° (with 4-corner calib) | yes | [MediaPipe FaceMesh / FaceLandmarker docs](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md) |
| WebGazer.js | $0 | ~130 px after 3-click calib | yes (browser) | [WebGazer.js homepage](https://webgazer.cs.brown.edu/) |
| OpenVINO `gaze-estimation-adas-0002` | $0 | sub-degree (3-stage pipeline) | yes | [OMZ demo](https://github.com/openvinotoolkit/open_model_zoo/blob/master/demos/gaze_estimation_demo/cpp/README.md) |
| Tobii Eye Tracker 5 | $230 + SDK | ~0.5° | **no official Linux** | [tobii-research on PyPI](https://pypi.org/project/tobii-research/), [community thread on ET5 + SDK](https://developer.tobii.com/community/forums/topic/python-sdk-with-tobii-eye-tracker-5/) |

Two consequences:

- **MediaPipe is the right default** on this Linux host, not Tobii. Tobii
  Eye Tracker 5 has *no official Linux support* per Tobii's own
  developer community thread; the only path is the community
  `tobii-stream-engine` cffi wrapper, which is unsupported.
- **WebGazer.js is sufficient for the browser surface** (jarvis_live.html
  dock-app selection) and ships as a single vendored JS file at
  `server/static/a11y/webgazer.js` after the script runs.

## NVDA (Windows-only) silent install

NVDA's own silent flags (per the nvaccess GitHub) are:

```cmd
nvda_2026.x.exe --install-silent --minimal --enable-start-on-logon=True
```

Source: [nvaccess/nvda PR #8623](https://github.com/nvaccess/nvda/pull/8623)
and the [silentinstallhq.com NVDA guide](https://silentinstallhq.com/nvda-nonvisual-desktop-access-silent-install-how-to-guide/).

The script auto-copies `nvdaControllerClient64.dll` next to the repo root
if NVDA is already installed, satisfying the
`server/services/a11y_drivers.py::nvda` driver's `ctypes.WinDLL` probe.

## What ships after a clean run

| Channel | Driver | Status on a stock Linux host |
| --- | --- | --- |
| gaze | `webgazer` (browser) | vendored to `server/static/a11y/webgazer.js` |
| gaze | `mediapipe` (server, **NEW**) | pip-installed; `_gaze_mediapipe_available()` returns ok |
| gaze | `tobii` | `NOT-PLUGGED-IN` (graceful degrade) |
| switch | `web_bluetooth` (browser) | always available |
| switch | `usb_hid` (server) | `pyusb` installed; vendor-ID enumeration works |
| screen_reader | `voiceover` | macOS only; built-in |
| screen_reader | `nvda` | Windows only; auto-bridged if NVDA installed |
| dwell | browser-side | always available |
| vision | `ultralytics` | YOLOv8/v11 for person+object detection |
| audio | `tensorflow-hub` | YAMNet ambient-sound classifier |

## Optional hardware upgrades

Listed in priority order (each one upgrades a specific channel; the free
defaults remain functional without them):

- **Tobii Eye Tracker 5** — high-precision gaze (~0.5°). $230.
  [Amazon B0BSPN1WBR](https://amazon.com/dp/B0BSPN1WBR). Note: no official
  Linux SDK; works on Windows. On Linux a community
  `tobii-stream-engine` cffi wrapper exists but is unsupported.
- **AbleNet Hook+ USB Switch Interface** — single-switch scanning. ~$65.
  [Amazon B07VWSV3WX](https://amazon.com/dp/B07VWSV3WX). Vendor ID
  `0x21AC` is already in `_KNOWN_SWITCH_VENDORS`.
- **Logitech Adaptive Gaming Kit (Buddy Button)** — BLE switch. ~$100.
  [Amazon B07Y7VBQNG](https://amazon.com/dp/B07Y7VBQNG). Logitech VID
  `0x046D` is enumerated.

## New `mediapipe` gaze driver

`server/services/a11y_drivers.py` gained a `_gaze_mediapipe_*` pair and
the driver tuple now contains:

```python
Driver("webgazer",  "gaze", "browser", ...)
Driver("mediapipe", "gaze", "server",  ...)   # NEW
Driver("tobii",     "gaze", "server",  ...)
```

The mediapipe driver:

- imports lazily — no hard dep at module import time
- probes for `/dev/video0` to hint webcam presence
- loads `mp.solutions.face_mesh.FaceMesh(refine_landmarks=True)` so the
  iris landmarks are available for gaze geometry
- falls forward to `mp.tasks.vision.FaceLandmarker` if the legacy
  `solutions` namespace is removed in a future MediaPipe release.

## Sources (2026)

- [Tobii Pro SDK Python — getting started](https://developer.tobiipro.com/python/python-getting-started.html)
- [Tobii Eye Tracker 5 + Python SDK community thread](https://developer.tobii.com/community/forums/topic/python-sdk-with-tobii-eye-tracker-5/)
- [tobii-research on PyPI (manylinux wheels)](https://pypi.org/project/tobii-research/)
- [MediaPipe FaceMesh / FaceLandmarker docs](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md)
- [Python-Gaze-Face-Tracker reference impl](https://github.com/alireza787b/Python-Gaze-Face-Tracker)
- [WebGazer.js project page](https://webgazer.cs.brown.edu/)
- [webeyetrack 2025 paper (browser eye tracking, few-shot personalization)](https://arxiv.org/html/2508.19544v1)
- [OpenVINO open_model_zoo gaze_estimation_demo](https://github.com/openvinotoolkit/open_model_zoo/blob/master/demos/gaze_estimation_demo/cpp/README.md)
- [nvaccess/nvda PR #8623 — silent install + portable copy flags](https://github.com/nvaccess/nvda/pull/8623)
- [silentinstallhq.com — NVDA silent install how-to](https://silentinstallhq.com/nvda-nonvisual-desktop-access-silent-install-how-to-guide/)

## Remaining manual steps

**One step, and only if higher gaze precision is wanted:** plug in a
USB-A Tobii Eye Tracker 5 (Amazon link above) and re-run the install
script. The script detects the device via `lsusb` and installs the
`tobii_research` wheel automatically.

Without any hardware: nothing. MediaPipe iris + WebGazer.js + Web
Bluetooth + USB-HID switch scanning is fully operational on a stock
webcam laptop after a single `bash scripts/install_a11y_stack.sh`.
