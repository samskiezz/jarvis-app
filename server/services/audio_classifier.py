#!/usr/bin/env python3
"""JARVIS ambient-audio classifier (Gap C3 #13) — YAMNet wrapper.

Wraps Google's YAMNet model (521 AudioSet classes — speech, music, alarms,
glass breaking, dog bark, running water, vehicle horn, etc.) behind a tiny
synchronous API so the assistant can ask "what is the room sounding like
right now?" the moment a wav arrives.

Why YAMNet
----------
* Free + open weights, MobileNet-v1 backbone, ~17 MB tflite or ~3.8 MB
  saved-model — trivial to host on a single CPU box.
* Trained on AudioSet's 521-class ontology so it covers the ambient-context
  events the assistant cares about (alarms, sirens, footsteps, knocks,
  appliance sounds, vehicle, water, glass break).
* Same model is the recommended classifier for Google's MediaPipe Tasks
  Audio Classifier, so swapping to MediaPipe later is one import change.

Degradation policy
------------------
This module imports lazily. If ``tensorflow`` and ``tensorflow_hub`` are not
installed, :func:`classify` returns an ``ok=False`` envelope explaining what
to install — it does NOT crash the server. The dashboard tile keeps working
in "stub" mode (returns the labels schema with ``available=False``).

Wiring checklist
----------------
1. ``pip install tensorflow tensorflow-hub soundfile numpy`` into the
   project venv (~600 MB; consider tflite-runtime + tflite weights for the
   small footprint path).
2. Optionally pre-warm with::

       from server.services import audio_classifier as ac
       ac.warmup()

   so the first user-facing inference is fast. Otherwise the model loads on
   the first ``classify`` call (~3–5 s cold start).
3. POST a ``wav`` path or raw float32 mono array (16 kHz) to
   ``/v1/sensors/audio/classify`` (see ``server/routes/sensors.py``).

References
----------
* YAMNet model card — https://tfhub.dev/google/yamnet/1
* AudioSet class map — googleresearch/audioset/yamnet_class_map.csv
* MediaPipe Audio Classifier — https://ai.google.dev/edge/mediapipe/solutions/audio/audio_classifier
"""

from __future__ import annotations

import csv
import os
import threading
import time
import wave
from pathlib import Path
from typing import Any, Optional

# Default model + class-map URLs — kept here so a deploy can pin/version them.
YAMNET_HUB_HANDLE = os.environ.get("YAMNET_HUB_HANDLE", "https://tfhub.dev/google/yamnet/1")
YAMNET_SAMPLE_RATE = 16_000

_MODEL_LOCK = threading.Lock()
_MODEL: Any = None  # tensorflow_hub.KerasLayer module
_CLASS_NAMES: list[str] | None = None
_LAST_ERROR: Optional[str] = None


def _availability() -> tuple[bool, Optional[str]]:
    """Return (tf+hub-available, error_message)."""
    try:
        import tensorflow  # noqa: F401
        import tensorflow_hub  # noqa: F401
    except Exception as exc:  # pragma: no cover - environment-dependent
        return False, f"tensorflow/tensorflow_hub not installed: {exc!r}"
    return True, None


def is_available() -> bool:
    """Cheap check the dashboard can call without paying model-load cost."""
    ok, _ = _availability()
    return ok


def _load_class_names(model: Any) -> list[str]:
    """Pull the 521-class AudioSet display-name map from the loaded model."""
    try:
        class_map_path = model.class_map_path().numpy().decode("utf-8")
        with open(class_map_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader, None)  # header
            return [row[2] for row in reader if len(row) >= 3]
    except Exception:
        # Fall back to anonymous indexes so we never break the response shape.
        return [f"class_{i}" for i in range(521)]


def _ensure_loaded() -> tuple[bool, Optional[str]]:
    """Idempotently load YAMNet. Returns (loaded, error)."""
    global _MODEL, _CLASS_NAMES, _LAST_ERROR
    if _MODEL is not None and _CLASS_NAMES is not None:
        return True, None
    ok, err = _availability()
    if not ok:
        _LAST_ERROR = err
        return False, err
    with _MODEL_LOCK:
        if _MODEL is not None and _CLASS_NAMES is not None:
            return True, None
        try:
            import tensorflow_hub as hub  # type: ignore

            model = hub.load(YAMNET_HUB_HANDLE)
            _MODEL = model
            _CLASS_NAMES = _load_class_names(model)
            _LAST_ERROR = None
            return True, None
        except Exception as exc:  # pragma: no cover - network/model-dependent
            _LAST_ERROR = f"yamnet load failed: {exc!r}"
            return False, _LAST_ERROR


def warmup() -> dict[str, Any]:
    """Pre-load YAMNet so the first user request is fast."""
    ok, err = _ensure_loaded()
    return {"ok": ok, "error": err, "classes": len(_CLASS_NAMES) if _CLASS_NAMES else 0}


def _wav_to_float_mono(path: str) -> tuple[Any, int]:
    """Load a wav into a float32 mono ndarray at YAMNET_SAMPLE_RATE.

    Tries soundfile first (handles 24-bit, float, anything ffmpeg knows),
    falls back to the stdlib ``wave`` module for plain 16-bit PCM.
    """
    import numpy as np  # local import — keeps cold-start light

    try:
        import soundfile as sf  # type: ignore

        data, sr = sf.read(path, dtype="float32", always_2d=False)
        if data.ndim > 1:
            data = data.mean(axis=1)
        if sr != YAMNET_SAMPLE_RATE:
            # Lightweight resample to 16 kHz without scipy.
            ratio = YAMNET_SAMPLE_RATE / float(sr)
            n_out = int(round(len(data) * ratio))
            if n_out > 0:
                idx = np.linspace(0, len(data) - 1, n_out).astype(np.int64)
                data = data[idx]
            sr = YAMNET_SAMPLE_RATE
        return data.astype(np.float32), sr
    except Exception:
        pass

    with wave.open(path, "rb") as w:
        sr = w.getframerate()
        n = w.getnframes()
        ch = w.getnchannels()
        raw = w.readframes(n)
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        samples = samples.reshape(-1, ch).mean(axis=1)
    if sr != YAMNET_SAMPLE_RATE and len(samples):
        ratio = YAMNET_SAMPLE_RATE / float(sr)
        n_out = int(round(len(samples) * ratio))
        if n_out > 0:
            idx = np.linspace(0, len(samples) - 1, n_out).astype(np.int64)
            samples = samples[idx]
        sr = YAMNET_SAMPLE_RATE
    return samples, sr


def classify(audio_path: str, top_k: int = 5) -> dict[str, Any]:
    """Run YAMNet on a wav file.

    Parameters
    ----------
    audio_path : str
        Path to a wav-readable file (16 kHz mono ideal; we resample
        otherwise). The file must exist; we do not download.
    top_k : int
        Number of ranked classes to include in ``top_classes``.

    Returns
    -------
    dict
        ``{ok, available, top_class, confidence, top_classes, duration_s,
        latency_ms, error?}``. ``ok=False`` always carries a human-readable
        ``error`` so the UI can surface it without guessing.
    """
    t0 = time.time()
    path = Path(audio_path)
    if not path.exists():
        return {
            "ok": False,
            "available": is_available(),
            "error": f"audio_path_not_found: {audio_path}",
        }

    ok, err = _ensure_loaded()
    if not ok or _MODEL is None or _CLASS_NAMES is None:
        return {
            "ok": False,
            "available": False,
            "error": err or "yamnet_unavailable",
            "hint": "pip install tensorflow tensorflow-hub soundfile numpy",
        }

    try:
        import numpy as np
        import tensorflow as tf  # type: ignore

        waveform, _sr = _wav_to_float_mono(str(path))
        if waveform.size == 0:
            return {"ok": False, "available": True, "error": "empty_waveform"}
        tensor = tf.convert_to_tensor(waveform, dtype=tf.float32)
        scores, _embeddings, _spectrogram = _MODEL(tensor)
        mean_scores = tf.reduce_mean(scores, axis=0).numpy()
        order = np.argsort(mean_scores)[::-1][: max(1, int(top_k))]
        top_classes = [
            {"label": _CLASS_NAMES[int(i)], "score": float(mean_scores[int(i)])}
            for i in order
        ]
        duration_s = float(len(waveform)) / float(YAMNET_SAMPLE_RATE)
        return {
            "ok": True,
            "available": True,
            "top_class": top_classes[0]["label"],
            "confidence": top_classes[0]["score"],
            "top_classes": top_classes,
            "duration_s": round(duration_s, 3),
            "latency_ms": int((time.time() - t0) * 1000),
        }
    except Exception as exc:  # pragma: no cover - inference-dependent
        return {
            "ok": False,
            "available": True,
            "error": f"yamnet_inference_failed: {exc!r}",
        }


def status() -> dict[str, Any]:
    """Status tile — used by the dashboard before calling classify."""
    available = is_available()
    return {
        "ok": True,
        "available": available,
        "loaded": _MODEL is not None,
        "classes": len(_CLASS_NAMES) if _CLASS_NAMES else 0,
        "sample_rate": YAMNET_SAMPLE_RATE,
        "model": YAMNET_HUB_HANDLE,
        "last_error": _LAST_ERROR,
    }


__all__ = ["classify", "is_available", "status", "warmup", "YAMNET_SAMPLE_RATE"]
