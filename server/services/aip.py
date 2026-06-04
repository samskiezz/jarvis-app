"""AIP — the AI/Prediction layer: grounded retrieval + the prediction engine tools.

This is the "AI grounded on the data" surface for JARVIS/APEX. It does NOT invent
its own model or its own retriever — it COMPOSES the pieces the backend already
ships:

  * ``services.search.search``      — the TF-IDF retriever over the ontology
    objects (RAG context). Falls back to the static ontology when the index is
    empty for any reason.
  * ``services.analyst``            — the local, LLM-free compose style (terse,
    "·"-separated, factual). Reused verbatim for the grounded answer body.
  * ``data.ontology.RISK_SIGNALS``  — risk signals matched to the retrieved
    objects, folded into the answer.
  * ``services.live_intel``         — the live market feed, folded in when a
    market question is detected (best-effort; skipped offline).
  * ``services.prediction.predict`` — the unified prediction engine (``predict_tool``).
  * ``services.oracle_model``       — the trained conviction/direction/volatility
    model loaded from ``data/oracle_model.joblib`` (``oracle_signal``).
  * ``services.history_lake.skill_summary`` + ``services.forward_test.scorecard``
    — the self-improvement scorecard (``skill_scorecard``).

Doctrine (mirrors the rest of the backend):
  * numpy / sklearn / stdlib only.
  * NEVER raise on normal use — every public function degrades gracefully and
    returns a structured value on any failure.
  * graceful WITHOUT a Kimi key, WITHOUT the joblib model, WITHOUT the network.
    Kimi is used ONLY as an optional grounding layer when ``KIMI_API_KEY`` is set;
    its absence never changes the contract.
"""

from __future__ import annotations

import os
from typing import Any, Optional

# ── retrieval / grounding sources ────────────────────────────────────────────
try:
    from . import search as _search
except Exception:  # noqa: BLE001 - defensive
    _search = None  # type: ignore[assignment]

try:
    from ..data.ontology import OBJECTS as _OBJECTS, RISK_SIGNALS as _RISK_SIGNALS
except Exception:  # noqa: BLE001
    _OBJECTS, _RISK_SIGNALS = [], []

_BY_ID = {o.get("id"): o for o in _OBJECTS if isinstance(o, dict)}


# ══════════════════════════════════════════════════════════════════════════════
# 1. RETRIEVE — the RAG context
# ══════════════════════════════════════════════════════════════════════════════
def _ontology_fallback(query: str, k: int) -> list[dict]:
    """Pure-substring fallback over the static ontology when the index is empty
    or unavailable. Deterministic; never raises."""
    q = (query or "").lower().strip()
    out: list[dict] = []
    for o in _OBJECTS:
        if not isinstance(o, dict):
            continue
        label = str(o.get("label", ""))
        blob = " ".join(
            [label, str(o.get("type", "")), str(o.get("props", ""))]
        ).lower()
        score = 0.0
        if q and q in label.lower():
            score = 1.0
        elif q and q in blob:
            score = 0.5
        elif not q:
            score = 0.0
        if score > 0.0 or not q:
            out.append(
                {
                    "id": o.get("id"),
                    "label": label,
                    "type": o.get("type"),
                    "snippet": f"{label} — {o.get('type', '')}",
                    "score": round(float(score), 6),
                }
            )
    out.sort(key=lambda r: -r["score"])
    return out[: max(1, int(k or 8))]


def retrieve(query: str, k: int = 8) -> list[dict]:
    """Grounded retrieval over the ontology — the RAG context.

    Returns a ranked list of ``{id, label, type, snippet, score}`` using the
    TF-IDF ``search.search``; if that yields nothing (empty index, OOV query)
    we fall back to a substring scan of the static ontology so a known term
    always grounds. Never raises.
    """
    try:
        k = int(k)
    except (TypeError, ValueError):
        k = 8
    if k <= 0:
        k = 8

    hits: list[dict] = []
    if _search is not None:
        try:
            raw = _search.search(query or "", limit=k) or []
        except Exception:  # noqa: BLE001
            raw = []
        for r in raw:
            if not isinstance(r, dict):
                continue
            hits.append(
                {
                    "id": r.get("id"),
                    "label": r.get("label"),
                    "type": r.get("type"),
                    "snippet": r.get("snippet") or str(r.get("label") or ""),
                    "score": round(float(r.get("score", 0.0) or 0.0), 6),
                }
            )
    if not hits:
        hits = _ontology_fallback(query, k)
    return hits[:k]


# ══════════════════════════════════════════════════════════════════════════════
# 2. ANSWER_GROUNDED — assemble a factual, grounded answer
# ══════════════════════════════════════════════════════════════════════════════
def _risks_for_ids(ids: list[Optional[str]]) -> list[dict]:
    """Risk signals linked to any of the retrieved object ids, by severity."""
    idset = {i for i in ids if i}
    rows = [r for r in _RISK_SIGNALS if isinstance(r, dict) and r.get("linked") in idset]
    return sorted(rows, key=lambda r: -int(r.get("severity", 0)))


def _is_market_question(question: str) -> bool:
    q = (question or "").lower()
    return any(
        w in q
        for w in ("market", "price", "quote", "btc", "xrp", "eth", "bitcoin", "portfolio")
    )


def _fetch_live() -> Optional[dict]:
    """Best-effort live-intel fetch. Runs the async loader synchronously; returns
    None on ANY failure (offline / no loop / network down). Never raises."""
    try:
        import asyncio

        from .live_intel import get_live_intel
    except Exception:  # noqa: BLE001
        return None
    try:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(get_live_intel())
        # An event loop is already running (e.g. inside an async route) — run the
        # coroutine on a private loop in a worker thread to avoid re-entrancy.
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            return ex.submit(lambda: asyncio.run(get_live_intel())).result(timeout=10)
    except Exception:  # noqa: BLE001
        return None


def _compose(question: str, hits: list[dict], risks: list[dict], live: Optional[dict]) -> str:
    """Compose the factual answer body in the analyst house style (plain text,
    "·" separators). Reuses ``analyst._entity_block`` / ``_markets_summary`` for
    the canonical formatting where available."""
    lines: list[str] = []
    try:
        from . import analyst as _analyst
    except Exception:  # noqa: BLE001
        _analyst = None  # type: ignore[assignment]

    # Grounded entity blocks for the top retrieved objects.
    if hits:
        lines.append("GROUNDED ON:")
        for h in hits[:3]:
            oid = h.get("id")
            block = ""
            if _analyst is not None and oid in _BY_ID:
                try:
                    block = _analyst._entity_block(oid)
                except Exception:  # noqa: BLE001
                    block = ""
            if not block:
                block = f"{h.get('label')} · {str(h.get('type') or '').upper()}\n· {h.get('snippet')}"
            lines.append(block)
    else:
        lines.append("No grounded objects matched the query.")

    # Risk signals attached to the retrieved objects.
    if risks:
        lines.append("")
        lines.append("RISK SIGNALS:")
        for r in risks[:5]:
            tgt = _BY_ID.get(r.get("linked"), {}).get("label", r.get("linked"))
            lines.append(
                f"· [{r.get('severity')}] {r.get('title')} — "
                f"{r.get('type')}/{r.get('trend')} → {tgt}"
            )

    # Live markets when the question is market-flavoured and a feed is present.
    if live and _is_market_question(question) and _analyst is not None:
        try:
            ms = _analyst._markets_summary(live)
            if ms and "No live market feed" not in ms:
                lines.append("")
                lines.append(ms)
        except Exception:  # noqa: BLE001
            pass

    return "\n".join(lines).strip()


def _maybe_kimi_ground(question: str, context: str) -> Optional[str]:
    """OPTIONAL: when a Kimi key is configured, pass the retrieved context as
    grounding and return Kimi's grounded answer. Returns None when no key is set
    or on ANY failure — the factual local answer is always the fallback, so the
    contract never depends on Kimi or the network."""
    try:
        from ..config import KIMI_API_KEY
    except Exception:  # noqa: BLE001
        return None
    if not KIMI_API_KEY:
        return None
    try:
        import asyncio

        from ..llm.kimi import stream_chat

        prompt = (
            "Answer the question using ONLY the grounded context below. Be terse "
            "and factual; do not invent facts not in the context.\n\n"
            f"CONTEXT:\n{context}\n\nQUESTION: {question}"
        )

        async def _collect() -> str:
            parts: list[str] = []
            async for chunk in stream_chat(prompt):
                parts.append(chunk)
            return "".join(parts)

        try:
            asyncio.get_running_loop()
        except RuntimeError:
            text = asyncio.run(_collect())
        else:
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                text = ex.submit(lambda: asyncio.run(_collect())).result(timeout=60)
        text = (text or "").strip()
        # Kimi's no-key diagnostic starts with "// Kimi" — never surface that.
        if text and not text.startswith("// Kimi"):
            return text
    except Exception:  # noqa: BLE001
        return None
    return None


def answer_grounded(question: str) -> dict:
    """Assemble a grounded answer for ``question``.

    Pulls the retrieved objects + any matching risk signals + (when relevant)
    live markets, and composes a factual response in the analyst house style. If
    a Kimi key exists, the retrieved context is passed as grounding and Kimi's
    reply is used; otherwise the local composition is returned. The factual local
    answer is ALWAYS computed first, so this never requires Kimi/network.

    Returns ``{answer, sources, used}``. Never raises.
    """
    q = (question or "").strip()
    hits = retrieve(q, k=8)
    risks = _risks_for_ids([h.get("id") for h in hits])

    live = None
    if _is_market_question(q):
        live = _fetch_live()

    local_answer = _compose(q, hits, risks, live)

    used = {
        "retrieval": True,
        "n_sources": len(hits),
        "n_risk_signals": len(risks),
        "live_markets": bool(live and (live.get("markets"))),
        "kimi": False,
        "compose": "analyst",
    }

    answer = local_answer
    kimi_answer = _maybe_kimi_ground(q, local_answer)
    if kimi_answer:
        answer = kimi_answer
        used["kimi"] = True
        used["compose"] = "kimi_grounded"

    sources = [
        {
            "id": h.get("id"),
            "label": h.get("label"),
            "type": h.get("type"),
            "score": h.get("score"),
        }
        for h in hits
    ]
    return {"answer": answer, "sources": sources, "used": used}


# ══════════════════════════════════════════════════════════════════════════════
# 3. PREDICT_TOOL — surface the unified prediction engine
# ══════════════════════════════════════════════════════════════════════════════
def predict_tool(question: str, params: Optional[dict] = None) -> dict:
    """Call the existing ``services.prediction.predict``. Never raises — on a
    hard import/runtime failure returns a structured error dict."""
    try:
        from .prediction import predict as _predict
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "reason": f"prediction engine unavailable: {exc}"}
    try:
        return _predict(question or "", params or None)
    except Exception as exc:  # noqa: BLE001 - predict() already guards, belt+braces
        return {"status": "error", "reason": str(exc)}


# ══════════════════════════════════════════════════════════════════════════════
# 4. ORACLE_SIGNAL — the trained conviction/direction/volatility model
# ══════════════════════════════════════════════════════════════════════════════
_ORACLE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "oracle_model.joblib",
)

# Process-wide cached model (load once). None until first attempt; False marks a
# failed/absent load so we don't retry the joblib on every call.
_ORACLE_CACHE: Any = None


def _load_oracle() -> Any:
    """Load (and cache) the trained OracleModel from joblib. Returns the model or
    None when the file/model is absent or unloadable. Never raises."""
    global _ORACLE_CACHE
    if _ORACLE_CACHE is not None:
        return _ORACLE_CACHE if _ORACLE_CACHE is not False else None
    path = os.environ.get("ORACLE_MODEL_PATH", _ORACLE_PATH)
    if not os.path.isfile(path):
        _ORACLE_CACHE = False
        return None
    try:
        from .oracle_model import OracleModel

        model = OracleModel.load(path)
        _ORACLE_CACHE = model
        return model
    except Exception:  # noqa: BLE001
        _ORACLE_CACHE = False
        return None


def _load_series_for_asset(asset: str, source: str) -> list[dict]:
    """Best-effort recent series for ``asset``. Tries the History Lake first
    (offline-safe), then the live crypto feed. Returns [] on any failure."""
    asset = (asset or "").strip()
    if not asset:
        return []
    # 1. History Lake (no network).
    try:
        from . import history_lake as _hl

        for src in (source or "crypto", "crypto", "series"):
            for metric in ("price", "close", "usd"):
                sid = _hl.upsert_series(src, asset, metric)
                rows = _hl.read_series(sid, limit=400)
                if rows and len(rows) >= 3:
                    return rows
    except Exception:  # noqa: BLE001
        pass
    # 2. Live crypto feed (network; skipped gracefully when offline).
    try:
        from .prediction import load_crypto_series

        series = load_crypto_series(asset, days=120)
        if series:
            return series
    except Exception:  # noqa: BLE001
        pass
    return []


def oracle_signal(
    asset: str,
    source: str = "crypto",
    *,
    series: Optional[list[dict]] = None,
) -> dict:
    """Return the trained model's conviction/direction/volatility for ``asset``.

    Loads ``data/oracle_model.joblib`` (cached) and predicts at the most recent
    bar of a recent series for the asset. ``series`` may be supplied for offline
    / deterministic use; otherwise it is loaded best-effort. Graceful when the
    model file or the series is absent: returns a structured ``status`` dict and
    NEVER raises.
    """
    model = _load_oracle()
    if model is None:
        return {
            "status": "no_model",
            "asset": asset,
            "reason": "oracle_model.joblib not present or unloadable",
        }
    if not getattr(model, "fitted", False):
        return {"status": "not_fitted", "asset": asset}

    data = series if series is not None else _load_series_for_asset(asset, source)
    if not data or len(data) < 3:
        return {
            "status": "insufficient_data",
            "asset": asset,
            "reason": f"only {len(data) if data else 0} points available",
        }

    try:
        out = model.predict(data)
    except Exception as exc:  # noqa: BLE001 - predict() guards, belt+braces
        return {"status": "error", "asset": asset, "reason": str(exc)}

    if not isinstance(out, dict) or out.get("status") != "ok":
        return {
            "status": (out or {}).get("status", "insufficient_data"),
            "asset": asset,
            "reason": (out or {}).get("reason"),
        }
    out = dict(out)
    out["asset"] = asset
    out["source"] = source
    return out


# ══════════════════════════════════════════════════════════════════════════════
# 5. SKILL_SCORECARD — self-improvement scorecard
# ══════════════════════════════════════════════════════════════════════════════
def skill_scorecard(domain: Optional[str] = None) -> dict:
    """Return the History Lake ``skill_summary`` plus the forward-test scorecard
    (skill_summary enriched with the directional roll-up). Graceful: missing
    modules / empty store yield zeroed shapes. Never raises."""
    summary: dict = {
        "domain": domain,
        "n_scored": 0,
        "mae": None,
        "rmse": None,
        "coverage": None,
        "mean_skill_vs_baseline": None,
    }
    try:
        from . import history_lake as _hl

        s = _hl.skill_summary(domain)
        if isinstance(s, dict):
            summary = s
    except Exception:  # noqa: BLE001
        pass

    forward: dict
    try:
        from . import forward_test as _ft

        forward = _ft.scorecard(domain)
        if not isinstance(forward, dict):
            forward = dict(summary)
    except Exception:  # noqa: BLE001
        forward = dict(summary)

    return {"domain": domain, "skill_summary": summary, "scorecard": forward}
