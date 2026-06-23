#!/usr/bin/env python3
"""WC2026 LLM predictor.

Calls a real Ollama-served LLM (preferring 70B-class models, falling back to
llama3.1:8b) to produce W/D/L probabilities + predicted scorelines for the 12
MD2 fixtures, using the same late-news context surfaced in the predictions
page.

Output: /opt/jarvis-app-1/server/data/wc2026_llm_predictions.json
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path("/opt/jarvis-app-1")
DATA_OUT = PROJECT_ROOT / "server" / "data" / "wc2026_llm_predictions.json"

DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434"
REQUEST_TIMEOUT_TAGS = 10
REQUEST_TIMEOUT_GENERATE = 240  # 70B models can be slow on first token

# Preference order: largest / strongest first, llama3.1:8b last-resort.
PREFERRED_MODELS: tuple[str, ...] = (
    "llama3.3:70b",
    "llama3.1:70b",
    "qwen2.5:72b",
    "qwen2.5:32b",
    "qwen2.5:14b",
    "llama3.1:8b",
    "qwen2.5:7b",
)

LATE_NEWS_CONTEXT = """\
Late news (last 24h) — factor these into your prediction:
- Pulisic (USA): calf sleeve, modified training Thursday, day-to-day; unlikely
  to start vs Australia — bench at best.
- Yamal (Spain): expected to start vs Saudi Arabia; Yamal + Nico Williams in
  for Ferran Torres and Gavi.
- Çalhanoğlu (Türkiye): no fitness concerns, captain from deep-lying
  playmaker role vs Paraguay at Levi's.
- Neymar (Brazil): will NOT play or travel for Haiti match; targeting
  knockout-stage return.
- Tunisia XI: Renard switches to 4-3-3 (Dahmen; Valery, Bronn, Talbi, Abdi;
  Skhiri, Mejbri, Ben Slimane; Achouri, Chaouat, Saad). Mejbri roaming No.10.
- Japan: Mitoma cut pre-tournament (hamstring); Kubo also out for MD2 (knee).
  Sugawara likely starts right wing-back, Doan pushes forward; Maeda + Ueda
  lead attack.
- Iran: played MD1 in Tijuana amid travel/visa chaos after US–Israeli
  strikes; Jahanbakhsh + Torabi doubtful, Cheshmi fit, Taremi focal point.
- Vozinha (Cabo Verde): 40-year-old keeper made 7 saves to hold Spain 0-0
  and won MOTM; undisputed No.1 vs Uruguay.
"""

MD2_MATCHES: tuple[dict[str, Any], ...] = (
    {"n": 1,  "home": "USA",          "away": "Australia",    "venue": "Lumen Field, Seattle",   "when": "Fri Jun 19 · 3pm ET"},
    {"n": 2,  "home": "Scotland",     "away": "Morocco",      "venue": "Gillette, Foxborough",   "when": "Fri Jun 19 · 6pm ET"},
    {"n": 3,  "home": "Brazil",       "away": "Haiti",        "venue": "Lincoln Financial",      "when": "Fri Jun 19 · 9pm ET"},
    {"n": 4,  "home": "Türkiye",      "away": "Paraguay",     "venue": "Levi's, Santa Clara",    "when": "Fri Jun 19 · 11pm ET"},
    {"n": 5,  "home": "Netherlands",  "away": "Sweden",       "venue": "NRG, Houston",           "when": "Sat Jun 20 · 1pm ET"},
    {"n": 6,  "home": "Germany",      "away": "Côte d'Ivoire","venue": "BMO Field, Toronto",     "when": "Sat Jun 20 · 4pm ET"},
    {"n": 7,  "home": "Ecuador",      "away": "Curaçao",      "venue": "Arrowhead, Kansas City", "when": "Sat Jun 20 · 8pm ET"},
    {"n": 8,  "home": "Tunisia",      "away": "Japan",        "venue": "BBVA, Monterrey",        "when": "Sat Jun 20 · 12am ET"},
    {"n": 9,  "home": "Spain",        "away": "Saudi Arabia", "venue": "Atlanta Stadium",        "when": "Sun Jun 21 · 12pm ET"},
    {"n": 10, "home": "Belgium",      "away": "Iran",         "venue": "SoFi, Inglewood",        "when": "Sun Jun 21 · 3pm ET"},
    {"n": 11, "home": "Uruguay",      "away": "Cabo Verde",   "venue": "Hard Rock, Miami",       "when": "Sun Jun 21 · 6pm ET"},
    {"n": 12, "home": "New Zealand",  "away": "Egypt",        "venue": "BC Place, Vancouver",    "when": "Sun Jun 21 · 9pm ET"},
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
log = logging.getLogger("wc2026_llm_predictor")


# ---------------------------------------------------------------------------
# .env loader (lightweight, no python-dotenv dep)
# ---------------------------------------------------------------------------

def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    try:
        for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
    except OSError as exc:
        log.warning("could not read %s: %s", path, exc)


_load_dotenv(PROJECT_ROOT / ".env")


def _ollama_host() -> str:
    host = os.environ.get("OLLAMA_HOST", DEFAULT_OLLAMA_HOST).strip()
    if not host:
        host = DEFAULT_OLLAMA_HOST
    if not host.startswith(("http://", "https://")):
        host = "http://" + host
    return host.rstrip("/")


# ---------------------------------------------------------------------------
# Ollama HTTP helpers
# ---------------------------------------------------------------------------

def _http_json(url: str, payload: dict[str, Any] | None, timeout: float) -> dict[str, Any]:
    data: bytes | None = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - localhost ollama
        raw = resp.read().decode("utf-8", errors="replace")
    return json.loads(raw)


def detect_available_model(host: str | None = None) -> str | None:
    """Return the best available model from PREFERRED_MODELS, or None."""
    base = host or _ollama_host()
    try:
        body = _http_json(f"{base}/api/tags", payload=None, timeout=REQUEST_TIMEOUT_TAGS)
    except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as exc:
        log.warning("ollama /api/tags unreachable at %s: %s", base, exc)
        return None

    available = {entry.get("name", "") for entry in body.get("models", []) if entry.get("name")}
    log.info("ollama models available: %s", sorted(available))
    for candidate in PREFERRED_MODELS:
        if candidate in available:
            return candidate
    # Fall back to any model that matches a preferred family prefix.
    for candidate in PREFERRED_MODELS:
        family = candidate.split(":", 1)[0]
        for name in available:
            if name.startswith(f"{family}:"):
                return name
    return None


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------

_PROMPT_TEMPLATE = """\
You are a football analyst. Predict the outcome of this FIFA World Cup 2026
group-stage matchday-2 fixture using the context below.

Match: {home} (home) vs {away} (away)
Venue: {venue}
Kickoff: {when}

{context}

Respond with ONLY a single JSON object on one line, no prose, no markdown,
no code fences. Schema:
{{"p_home": <float 0-1>, "p_draw": <float 0-1>, "p_away": <float 0-1>, \
"predicted_score": "<home>-<away>", "rationale": "<<=180 chars>"}}

Constraints:
- p_home + p_draw + p_away must sum to 1.0 (+/- 0.02).
- predicted_score uses integer goals, e.g. "2-1".
- rationale must reference the late news where it materially affects the
  pick (e.g. Pulisic out, Neymar absent, Renard tactical reset).
"""

_JSON_OBJ_RE = re.compile(r"\{.*\}", re.DOTALL)


def _extract_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    # Try direct parse first.
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    match = _JSON_OBJ_RE.search(text)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _normalize_probs(p_home: float, p_draw: float, p_away: float) -> tuple[float, float, float]:
    total = p_home + p_draw + p_away
    if total <= 0:
        return 1 / 3, 1 / 3, 1 / 3
    return p_home / total, p_draw / total, p_away / total


# ---------------------------------------------------------------------------
# Isotonic calibrator loader (artifact written by wc2026_predictor.py main()).
# Applied to LLM outputs so the LLM channel benefits from the same per-class
# reliability correction that lifted the Elo+Poisson channel.
# ---------------------------------------------------------------------------

ISO_CAL_PATH = PROJECT_ROOT / "server" / "data" / "wc2026_isotonic_calibrator.json"
ISO_CLASSES = ("H", "D", "A")


def _piecewise_predict(
    x: float, x_thr: list[float], y_thr: list[float]
) -> float:
    """Replay sklearn IsotonicRegression.predict() without sklearn deps."""
    if not x_thr:
        return float(x)
    if x <= x_thr[0]:
        return float(y_thr[0])
    if x >= x_thr[-1]:
        return float(y_thr[-1])
    # Linear interp between breakpoints.
    for i in range(len(x_thr) - 1):
        lo, hi = x_thr[i], x_thr[i + 1]
        if lo <= x <= hi:
            if hi == lo:
                return float(y_thr[i])
            t = (x - lo) / (hi - lo)
            return float(y_thr[i] + t * (y_thr[i + 1] - y_thr[i]))
    return float(x)


def _load_iso_calibrator() -> dict[str, dict[str, list[float]]] | None:
    if not ISO_CAL_PATH.exists():
        return None
    try:
        blob = json.loads(ISO_CAL_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return None
    cals = blob.get("calibrators") or {}
    out: dict[str, dict[str, list[float]]] = {}
    for cls in ISO_CLASSES:
        spec = cals.get(cls)
        if not isinstance(spec, dict):
            return None
        try:
            out[cls] = {
                "X_thresholds": [float(x) for x in spec["X_thresholds"]],
                "y_thresholds": [float(y) for y in spec["y_thresholds"]],
            }
        except (KeyError, TypeError, ValueError):
            return None
    return out


def _apply_iso(
    cal: dict[str, dict[str, list[float]]],
    p_home: float,
    p_draw: float,
    p_away: float,
) -> tuple[float, float, float]:
    raw = (p_home, p_draw, p_away)
    calibrated = [
        _piecewise_predict(
            raw[idx],
            cal[cls]["X_thresholds"],
            cal[cls]["y_thresholds"],
        )
        for idx, cls in enumerate(ISO_CLASSES)
    ]
    s = sum(calibrated)
    if s <= 1e-12:
        return raw
    return (calibrated[0] / s, calibrated[1] / s, calibrated[2] / s)


def _validate_score(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    cleaned = value.strip()
    if re.fullmatch(r"\d{1,2}\s*[-:–]\s*\d{1,2}", cleaned):
        return re.sub(r"\s*[-:–]\s*", "-", cleaned)
    return ""


def predict_match(
    home: str,
    away: str,
    context_blob: str,
    *,
    model: str,
    host: str | None = None,
    venue: str = "",
    when: str = "",
) -> dict[str, Any]:
    base = host or _ollama_host()
    prompt = _PROMPT_TEMPLATE.format(
        home=home,
        away=away,
        venue=venue or "neutral",
        when=when or "TBD",
        context=context_blob.strip(),
    )
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.2,
            "num_predict": 200,
        },
    }
    started = time.monotonic()
    try:
        body = _http_json(f"{base}/api/generate", payload=payload, timeout=REQUEST_TIMEOUT_GENERATE)
    except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
        log.error("generate failed for %s vs %s: %s", home, away, exc)
        return {"error": f"ollama_request_failed: {exc}"}

    elapsed_ms = int((time.monotonic() - started) * 1000)
    raw_text = (body or {}).get("response", "") if isinstance(body, dict) else ""
    parsed = _extract_json_object(raw_text)
    if not parsed:
        log.warning("could not parse JSON from model response for %s vs %s: %r", home, away, raw_text[:200])
        return {"error": "model_returned_unparseable_json", "raw": raw_text[:300], "elapsed_ms": elapsed_ms}

    try:
        p_home = float(parsed.get("p_home", 0.0))
        p_draw = float(parsed.get("p_draw", 0.0))
        p_away = float(parsed.get("p_away", 0.0))
    except (TypeError, ValueError):
        return {"error": "invalid_probabilities", "raw": raw_text[:300], "elapsed_ms": elapsed_ms}

    p_home, p_draw, p_away = _normalize_probs(p_home, p_draw, p_away)
    predicted_score = _validate_score(parsed.get("predicted_score", ""))
    rationale = str(parsed.get("rationale", "")).strip()[:240]

    out: dict[str, Any] = {
        "p_home": round(p_home, 4),
        "p_draw": round(p_draw, 4),
        "p_away": round(p_away, 4),
        "predicted_score": predicted_score,
        "rationale": rationale,
        "elapsed_ms": elapsed_ms,
    }

    # Apply the isotonic calibrator artifact written by wc2026_predictor.py
    # (adopted upgrade: in-sample brier_delta=+0.214, 95% CI [0.064, 0.391]
    # excludes 0 on n=29 graded fixtures). LLM outputs go through the same
    # per-class reliability correction; raw probabilities preserved under
    # the *_raw keys for auditability.
    cal = _load_iso_calibrator()
    if cal is not None:
        ph_c, pd_c, pa_c = _apply_iso(cal, p_home, p_draw, p_away)
        out["p_home_raw"] = round(p_home, 4)
        out["p_draw_raw"] = round(p_draw, 4)
        out["p_away_raw"] = round(p_away, 4)
        out["p_home"] = round(ph_c, 4)
        out["p_draw"] = round(pd_c, 4)
        out["p_away"] = round(pa_c, 4)
        out["calibration"] = "isotonic_per_class_renormalised"
    return out


# ---------------------------------------------------------------------------
# Batch
# ---------------------------------------------------------------------------

def predict_all_md2() -> dict[str, Any]:
    host = _ollama_host()
    model = detect_available_model(host)
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    if not model:
        log.error("no usable model available via ollama at %s", host)
        return {
            "model_used": "unavailable",
            "generated_at": generated_at,
            "error": f"ollama_unreachable_or_no_preferred_model_at:{host}",
            "predictions": [],
        }

    log.info("using model %s via %s", model, host)
    predictions: list[dict[str, Any]] = []
    # Load ALL concrete upcoming fixtures from wc2026_fixtures_all.json (replaces the legacy 12-match MD2_MATCHES list).
    # Concrete = both teams are real names, not "Winner X" / "Runner-up X" / "3rd A/B/C/D" placeholders.
    fixtures_to_predict = MD2_MATCHES  # fallback default
    try:
        with open("/opt/jarvis-app-1/server/data/wc2026_fixtures_all.json") as _f:
            _all = json.load(_f)
        def _concrete(team: str) -> bool:
            t = (team or "").strip().lower()
            return bool(t) and not any(p in t for p in ("winner", "runner", "3rd", "tbd", "loser"))
        fixtures_to_predict = [
            {"n": m["n"], "home": m["home"], "away": m["away"],
             "venue": m.get("venue", ""), "when": m.get("kickoff_local", m.get("date", ""))}
            for m in _all.get("matches", [])
            if _concrete(m.get("home", "")) and _concrete(m.get("away", ""))
        ]
        log.info("loaded %d concrete fixtures from wc2026_fixtures_all.json (was hardcoded 12)", len(fixtures_to_predict))
    except Exception as _e:  # noqa: BLE001
        log.warning("fallback to MD2_MATCHES (12 fixtures): %s", _e)

    for fixture in fixtures_to_predict:
        log.info("predicting #%d %s vs %s", fixture["n"], fixture["home"], fixture["away"])
        result = predict_match(
            home=fixture["home"],
            away=fixture["away"],
            context_blob=LATE_NEWS_CONTEXT,
            model=model,
            host=host,
            venue=fixture["venue"],
            when=fixture["when"],
        )
        predictions.append({
            "n": fixture["n"],
            "home": fixture["home"],
            "away": fixture["away"],
            **result,
        })

    return {
        "model_used": model,
        "generated_at": generated_at,
        "predictions": predictions,
    }


def write_predictions(payload: dict[str, Any], out_path: Path = DATA_OUT) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(out_path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(out_path)
    log.info("wrote %s (%d bytes)", out_path, out_path.stat().st_size)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    if "--detect" in args:
        model = detect_available_model()
        log.info("detected model: %s", model)
        print(model or "unavailable")
        return 0 if model else 1

    payload = predict_all_md2()
    write_predictions(payload)
    if payload.get("model_used") == "unavailable":
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
