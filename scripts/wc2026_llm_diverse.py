#!/usr/bin/env python3
"""WC2026 diverse-LLM predictor (OpenAI gpt-4o-mini channel).

This is the second LLM tier alongside `scripts/wc2026_llm_predictor.py`
(llama3.x/qwen2.5 via Ollama on the Vast box). The original plan said
"Claude + Kimi" but those keys are not present in this environment; the
real diverse channel we can build is OpenAI gpt-4o-mini — cheapest
diverse-provider option that still gives independent model error.

For each upcoming concrete WC2026 fixture, the script:
  1. Builds the same structured-context prompt the Ollama predictor uses.
  2. Calls https://api.openai.com/v1/chat/completions (model=gpt-4o-mini).
  3. Parses STRICT JSON {p_home, p_draw, p_away, predicted_score}.
  4. Logs every row to wc2026_predictions.db via wc2026_db.log_prediction
     (actuals resolved server-side — no actual_score/actual_wdl injection).
  5. Writes a verified JSON receipt to wc2026_llm_diverse.json with
     top-level "source" so wc2026_verify_sources.py --strict passes.

Graceful degradation:
  - Missing / placeholder OPENAI_API_KEY → skip cleanly, write a receipt
    explaining why, exit 2.
  - Non-JSON response → log raw text, skip that fixture.
  - HTTP 429 rate-limit → exponential sleep up to 3 retries, then skip.

Usage:
    /opt/jarvis-app-1/.venv/bin/python scripts/wc2026_llm_diverse.py --once
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Project-rule: use the existing DB module so actuals stay server-side.
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import wc2026_db  # noqa: E402

# python-dotenv is installed in the project venv (CLAUDE.md says to use it).
try:
    from dotenv import load_dotenv  # type: ignore
except ImportError:  # pragma: no cover
    def load_dotenv(path: str | os.PathLike) -> bool:  # type: ignore[misc]
        # Minimal fallback so the script still runs without python-dotenv.
        p = Path(path)
        if not p.is_file():
            return False
        for raw in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v
        return True


# ---------------------------------------------------------------------------
# Config / constants
# ---------------------------------------------------------------------------

MODEL_NAME = "gpt-4o-mini"
MODEL_TAG = f"openai:{MODEL_NAME}"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
REQUEST_TIMEOUT = 60.0
MAX_RETRIES = 3

FIXTURES_PATH = REPO_ROOT / "server" / "data" / "wc2026_fixtures_all.json"
RECEIPT_PATH = REPO_ROOT / "server" / "data" / "wc2026_llm_diverse.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
log = logging.getLogger("wc2026_llm_diverse")

# Load OPENAI_API_KEY from /root/.env (per task spec) AND project .env as
# a fallback — load_dotenv won't overwrite already-set vars by default.
load_dotenv("/root/.env")
load_dotenv(str(REPO_ROOT / ".env"))


# ---------------------------------------------------------------------------
# Key validation
# ---------------------------------------------------------------------------

_PLACEHOLDER_PATTERNS = ("REPLACE_ME", "your-key", "TODO", "<", "xxxx", "sk-...", "changeme")


def _key_is_real(key: str | None) -> bool:
    if not key or not isinstance(key, str):
        return False
    cleaned = key.strip()
    if not cleaned.startswith("sk-"):
        return False
    upper = cleaned.upper()
    for marker in _PLACEHOLDER_PATTERNS:
        if marker.upper() in upper:
            return False
    # An honest OpenAI key is at least ~40 chars; placeholders are short.
    return len(cleaned) >= 40


# ---------------------------------------------------------------------------
# Prompt (mirrors wc2026_llm_predictor._PROMPT_TEMPLATE)
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = (
    "You are a soccer match prediction expert. Return STRICT JSON only — "
    "no prose, no markdown, no code fences."
)

_USER_PROMPT_TEMPLATE = """\
Predict this FIFA World Cup 2026 fixture.

Match: {home} (home) vs {away} (away)
Venue: {venue}
Kickoff (UTC): {when}
Stage: {stage}{group_suffix}

Recent FIFA-rank context, venue, and home-field effect should all factor
into the win/draw/loss probabilities.

Respond with ONLY a single JSON object on one line. Schema:
{{"p_home": <float 0-1>, "p_draw": <float 0-1>, "p_away": <float 0-1>, \
"predicted_score": "<home_goals>-<away_goals>"}}

Constraints:
- p_home + p_draw + p_away MUST sum to 1.0 (within +/- 0.02).
- predicted_score uses integer goals, e.g. "2-1".
- Return ONLY the JSON object. No surrounding text.
"""


_JSON_OBJ_RE = re.compile(r"\{[^{}]*\}", re.DOTALL)


def _build_user_prompt(fixture: dict[str, Any]) -> str:
    group = fixture.get("group") or ""
    return _USER_PROMPT_TEMPLATE.format(
        home=fixture.get("home", ""),
        away=fixture.get("away", ""),
        venue=fixture.get("venue", "") or "neutral",
        when=fixture.get("kickoff_iso", "") or fixture.get("date", "TBD"),
        stage=fixture.get("stage", "GROUP"),
        group_suffix=f" (Group {group})" if group else "",
    )


def _extract_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None
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


def _validate_score(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    cleaned = value.strip()
    if re.fullmatch(r"\d{1,2}\s*[-:–]\s*\d{1,2}", cleaned):
        return re.sub(r"\s*[-:–]\s*", "-", cleaned)
    return ""


# ---------------------------------------------------------------------------
# OpenAI HTTP
# ---------------------------------------------------------------------------


def _call_openai(api_key: str, prompt: str) -> tuple[dict[str, Any] | None, str | None]:
    """Call gpt-4o-mini. Returns (parsed_json, error_message).

    Retries on HTTP 429 (rate limit) up to MAX_RETRIES with exponential
    backoff. All other errors return immediately so the caller can skip.
    """
    body = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 200,
        "response_format": {"type": "json_object"},
    }
    data = json.dumps(body).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }

    last_error: str | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        req = urllib.request.Request(OPENAI_URL, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:  # noqa: S310
                raw = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            err_body = ""
            try:
                err_body = exc.read().decode("utf-8", errors="replace")[:300]
            except Exception:  # noqa: BLE001
                pass
            if exc.code == 429 and attempt < MAX_RETRIES:
                sleep_s = 2 ** attempt
                log.warning("rate limited (429), retry %d/%d after %ss", attempt, MAX_RETRIES, sleep_s)
                time.sleep(sleep_s)
                last_error = f"http_429: {err_body}"
                continue
            return None, f"http_{exc.code}: {err_body}"
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            return None, f"network_error: {exc}"

        try:
            envelope = json.loads(raw)
        except json.JSONDecodeError:
            return None, f"non_json_envelope: {raw[:300]!r}"

        choices = envelope.get("choices") or []
        if not choices:
            return None, f"no_choices: {raw[:300]!r}"
        content = choices[0].get("message", {}).get("content", "")
        parsed = _extract_json_object(content)
        if parsed is None:
            return None, f"unparseable_content: {content[:300]!r}"
        return parsed, None

    return None, last_error or "exhausted_retries"


# ---------------------------------------------------------------------------
# Fixture loading
# ---------------------------------------------------------------------------


_PLACEHOLDER_TOKENS = ("winner", "runner", "3rd", "tbd", "loser", "best ")


def _is_concrete(team: str) -> bool:
    t = (team or "").strip().lower()
    if not t:
        return False
    return not any(p in t for p in _PLACEHOLDER_TOKENS)


def _load_upcoming_fixtures() -> list[dict[str, Any]]:
    """Load fixtures with concrete teams + kickoff in the future + not played."""
    try:
        doc = json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        log.error("could not read fixtures: %s", exc)
        return []

    now_utc = datetime.now(timezone.utc)
    out: list[dict[str, Any]] = []
    for m in doc.get("matches", []):
        home = m.get("home") or ""
        away = m.get("away") or ""
        if not _is_concrete(home) or not _is_concrete(away):
            continue
        if m.get("played"):
            continue
        ko = m.get("kickoff_iso") or ""
        if ko:
            try:
                ko_dt = datetime.fromisoformat(ko.replace("Z", "+00:00"))
                if ko_dt <= now_utc:
                    # Already kicked off / past — skip per spec
                    # ("kickoff in the future, status='predicted'").
                    continue
            except ValueError:
                pass
        out.append(m)
    return out


# ---------------------------------------------------------------------------
# Main predict + log loop
# ---------------------------------------------------------------------------


def predict_and_log(once: bool = True) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    run_id = f"llm_diverse_{uuid.uuid4().hex[:12]}"

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    key_present = _key_is_real(api_key)

    fixtures = _load_upcoming_fixtures()

    receipt: dict[str, Any] = {
        "model": MODEL_TAG,
        "run_id": run_id,
        "generated_at": generated_at,
        "verified": True,
        "source": (
            f"OpenAI Chat Completions {MODEL_NAME} via "
            f"https://api.openai.com/v1/chat/completions at {generated_at}"
        ),
        "n_fixtures_eligible": len(fixtures),
        "key_present": key_present,
        "predictions": [],
        "api_errors": [],
        "db_rows_inserted": 0,
        "n_predicted": 0,
        "n_skipped": 0,
    }

    if not key_present:
        msg = (
            "OPENAI_API_KEY missing or placeholder — skipping diverse-LLM "
            "predictor cleanly. No fabricated predictions written."
        )
        log.warning(msg)
        receipt["api_errors"].append(msg)
        receipt["skipped_reason"] = "openai_api_key_missing_or_placeholder"
        _write_receipt(receipt)
        return receipt

    if not fixtures:
        msg = "no eligible upcoming concrete fixtures found"
        log.warning(msg)
        receipt["api_errors"].append(msg)
        _write_receipt(receipt)
        return receipt

    conn = wc2026_db.init_db()
    try:
        wc2026_db.log_run(
            run_id=run_id,
            model=MODEL_TAG,
            notes=(
                f"diverse-LLM channel ({MODEL_TAG}) over "
                f"{len(fixtures)} upcoming concrete WC2026 fixtures via "
                "OpenAI Chat Completions"
            ),
            generated_at=generated_at,
            conn=conn,
        )

        for fixture in fixtures:
            home = fixture.get("home", "")
            away = fixture.get("away", "")
            prompt = _build_user_prompt(fixture)
            parsed, error = _call_openai(api_key, prompt)
            if error is not None or parsed is None:
                log.warning("skip %s vs %s: %s", home, away, error)
                receipt["api_errors"].append({
                    "home": home, "away": away, "error": error,
                })
                receipt["n_skipped"] += 1
                if once:
                    # spec: --once = a single end-to-end run, but we still
                    # want to attempt every fixture; "once" just means no
                    # outer scheduler loop. Continue to next fixture.
                    pass
                continue

            try:
                p_home = float(parsed.get("p_home", 0.0))
                p_draw = float(parsed.get("p_draw", 0.0))
                p_away = float(parsed.get("p_away", 0.0))
            except (TypeError, ValueError):
                receipt["api_errors"].append({
                    "home": home, "away": away,
                    "error": f"invalid_probabilities: {parsed!r}",
                })
                receipt["n_skipped"] += 1
                continue

            p_home, p_draw, p_away = _normalize_probs(p_home, p_draw, p_away)
            predicted_score = _validate_score(parsed.get("predicted_score", ""))

            prediction = {
                "predicted_score": predicted_score,
                "p_home": round(p_home, 4),
                "p_draw": round(p_draw, 4),
                "p_away": round(p_away, 4),
                "source": (
                    f"{MODEL_TAG} via OpenAI Chat Completions at {generated_at}"
                ),
            }

            match_payload = {
                "home": home,
                "away": away,
                "match_date": fixture.get("kickoff_iso") or fixture.get("date"),
                "competition": "WC2026",
            }

            try:
                row_id = wc2026_db.log_prediction(
                    run_id=run_id,
                    model=MODEL_TAG,
                    match=match_payload,
                    prediction=prediction,
                    conn=conn,
                    generated_at=generated_at,
                )
                receipt["db_rows_inserted"] += 1
            except Exception as exc:  # noqa: BLE001
                log.error("db log failed for %s vs %s: %s", home, away, exc)
                receipt["api_errors"].append({
                    "home": home, "away": away,
                    "error": f"db_log_failed: {exc}",
                })
                receipt["n_skipped"] += 1
                continue

            receipt["predictions"].append({
                "n": fixture.get("n"),
                "home": home,
                "away": away,
                "kickoff_iso": fixture.get("kickoff_iso"),
                "stage": fixture.get("stage"),
                "group": fixture.get("group"),
                "predicted_score": predicted_score,
                "p_home": prediction["p_home"],
                "p_draw": prediction["p_draw"],
                "p_away": prediction["p_away"],
                "db_row_id": row_id,
                "verified": True,
                "source": prediction["source"],
            })
            receipt["n_predicted"] += 1
    finally:
        conn.close()

    _write_receipt(receipt)
    return receipt


def _write_receipt(receipt: dict[str, Any]) -> None:
    RECEIPT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = RECEIPT_PATH.with_suffix(RECEIPT_PATH.suffix + ".tmp")
    tmp.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(RECEIPT_PATH)
    log.info("wrote %s (%d bytes)", RECEIPT_PATH, RECEIPT_PATH.stat().st_size)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _summary_for_agent(receipt: dict[str, Any]) -> dict[str, Any]:
    sample = receipt["predictions"][0] if receipt["predictions"] else None
    return {
        "file": str(RECEIPT_PATH),
        "n_predicted": receipt["n_predicted"],
        "n_skipped": receipt["n_skipped"],
        "sample": sample,
        "api_errors": receipt["api_errors"][:5],
        "db_rows_inserted": receipt["db_rows_inserted"],
        "key_present": receipt["key_present"],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="WC2026 diverse-LLM (OpenAI) predictor")
    parser.add_argument("--once", action="store_true",
                        help="Run a single end-to-end prediction pass (default).")
    args = parser.parse_args(argv)
    # --once is the default; keep arg for future scheduler integration.
    _ = args.once

    receipt = predict_and_log(once=True)
    summary = _summary_for_agent(receipt)
    print(json.dumps(summary, indent=2, ensure_ascii=False, default=str))
    if not receipt["key_present"]:
        return 2
    return 0 if receipt["n_predicted"] > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
