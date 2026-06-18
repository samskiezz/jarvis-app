# Sensors + ambient audio (Gap C3 #12, #13)

Two thin services + one FastAPI router give the assistant real-time access to
motion and ambient sound, so the moment a phone is paired and YAMNet is
installed, the dashboard starts answering questions like
"what's the room sounding like?" and "have I been still for too long?".

## Files

| File | Purpose |
|------|---------|
| `server/services/sensors.py` | IMU ring buffer + activity summaries. Stdlib only. |
| `server/services/audio_classifier.py` | YAMNet wrapper with graceful TF-missing fallback. |
| `server/routes/sensors.py` | FastAPI router mounted at `/v1/sensors`. |

## API surface

| Method | Path | Body / query | Returns |
|--------|------|--------------|---------|
| POST | `/v1/sensors/imu` | one sample or `{samples:[...]}` batch | `{ok, ingested, buffered}` |
| GET  | `/v1/sensors/recent` | `?window_s=60&samples=0` | summary + optional raw rows |
| GET  | `/v1/sensors/status` | — | IMU + audio status tiles |
| POST | `/v1/sensors/audio/classify` | `{audio_path, top_k}` | YAMNet result |
| GET  | `/v1/sensors/audio/status` | — | `{available, loaded, classes}` |

All routes use `optional_bearer` (same gate as the rest of the platform) and
never raise on bad input — they always return a JSON envelope.

## Mobile-side IMU snippet

Drop this into the mobile shell where the user has already granted "motion &
orientation" permission. Batches at ~20 Hz to keep bandwidth low.

```html
<script>
(async function () {
  // iOS Safari (and modern Chrome) require an explicit permission gesture.
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== "granted") return;
    } catch (e) { return; }
  }
  const buf = [];
  const FLUSH_EVERY = 20;        // ~1 s of samples at 20 Hz
  const FLUSH_INTERVAL_MS = 2000;

  function flush() {
    if (!buf.length) return;
    const payload = { samples: buf.splice(0, buf.length), source: "mobile" };
    fetch("/v1/sensors/imu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }

  window.addEventListener("devicemotion", (e) => {
    const a = e.accelerationIncludingGravity || e.acceleration || {};
    const r = e.rotationRate || {};
    buf.push({
      ts: Date.now() / 1000,
      acceleration: { x: a.x, y: a.y, z: a.z },
      rotationRate: { alpha: r.alpha, beta: r.beta, gamma: r.gamma },
    });
    if (buf.length >= FLUSH_EVERY) flush();
  });

  setInterval(flush, FLUSH_INTERVAL_MS);
})();
</script>
```

Add `accelerometer=(self), gyroscope=(self)` to the response
`Permissions-Policy` header on the page that hosts this snippet so the
Generic Sensor API is permitted in the document
(see [MDN: Permissions-Policy: accelerometer](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/accelerometer)).

## YAMNet install (~600 MB venv, ~17 MB tflite weights)

```bash
pip install tensorflow tensorflow-hub soundfile numpy
```

Lightweight alternative (no TF):

```bash
pip install tflite-runtime numpy soundfile
# then download yamnet.tflite + yamnet_class_map.csv manually
curl -L -o /opt/jarvis-app-1/server/models/yamnet.tflite \
  https://storage.googleapis.com/tfhub-lite-models/google/lite-model/yamnet/tflite/1.tflite
```

Pre-warm at boot (optional, saves the 3–5 s first-call latency):

```python
from server.services import audio_classifier as ac
ac.warmup()
```

If TF is missing, the service stays alive and `/v1/sensors/audio/status`
returns `{available: false}` with a hint string so the dashboard can show a
"install to enable" pill instead of crashing.

## How the assistant consumes it

```python
from server.services import sensors as imu
summary = imu.recent_motion(window_s=300)
# {activity: "still" | "fidget" | "walking" | "running_or_vehicle" | "impact_or_fall" | "vigorous", ...}
```

The activity label is heuristic — RMS linear acceleration + peak rotation
rate over the window — and is good enough for the assistant's "are you
moving?" reasoning without ML. Swap in a YAMNet-equivalent IMU classifier
later (e.g. MediaPipe Gesture Recognizer or a small TFLite CNN) without
changing the public API.

## STT (faster-whisper) — adjacent, not in this router

The bigger STT story (faster-whisper, real-time mic streaming) lives in
`server/services/voice_clone_service.py`'s neighbourhood. faster-whisper
(`pip install faster-whisper`) is the 2026 baseline — 4x speed of openai/
whisper at the same accuracy, CTranslate2 backend, optional GPU. The audio
classifier here covers the *non-speech* half of the same problem; pair them
so the assistant can answer both "what did they say?" and "what just happened
around them?".

## References

- MDN — DeviceMotionEvent: <https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent>
- W3C — Generic Sensor API: <https://www.w3.org/TR/generic-sensor/>
- YAMNet model card: <https://tfhub.dev/google/yamnet/1>
- MediaPipe Audio Classifier: <https://ai.google.dev/edge/mediapipe/solutions/audio/audio_classifier>
- faster-whisper: <https://github.com/SYSTRAN/faster-whisper>
