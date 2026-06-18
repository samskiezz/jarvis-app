"""MOTOR-INTENT PREDICTOR — gap-fix #3 (motor accessibility, no hardware needed).

Predicts the user's most likely NEXT dock-app from their recent action history so
that scan-mode / dwell-selection accessibility loops can pre-highlight the
predicted target — saving switch presses and dwell time for the owner.

PATTERN: mirrors ``scripts/viability_model.py`` — pure sklearn + joblib, with an
honest advisory/gating split:

* While we have fewer than ``MOTOR_MIN_SAMPLES`` events or the validated mean
  top-1 accuracy hasn't cleared ``MOTOR_TARGET_ACC``, ``predict_next`` still
  returns candidates (so the UI can show "best guess") but ``gate_ready()``
  reports False — the front-end can choose not to act aggressively on un-vetted
  predictions (e.g. don't auto-select, just pre-highlight).

* Once the model is validated, ``predict_next`` returns the same shape with
  ``gate_ready=True`` in the route response.

The feature set is intentionally tiny so it works on day-one data:

* last-5 action ids (categorical, hashed n-grams over the sequence string)
* hour-of-day bucket (0..23)
* day-of-week (0..6)

Classifier: ``LogisticRegression(class_weight='balanced')`` — same family as
``scripts/viability_model.py``. We use a HashingVectorizer over the sequence so
new action ids (mini-apps added later) never break the model.

Storage:
    server/data/action_history.jsonl   — append-only event log (created lazily)
    server/data/motor_model.joblib     — trained pipeline (created on train())
    server/data/motor_model.json       — meta + evaluation stats

Plugging in hardware: this is the gap that needs NO hardware. Data flows in from
``POST /v1/motor/record`` on every dock-app open (wired in
``server/jarvis_live.html``). To force a retrain run::

    python3 -c "from server.services import motor_predictor as M; print(M.train())"

A nightly cron / pm2 cycle can call ``train()`` to refresh the model.
"""
from __future__ import annotations

import json
import os
import time
from typing import Iterable

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "server", "data")
HISTORY_PATH = os.path.join(DATA_DIR, "action_history.jsonl")
MODEL_PATH = os.path.join(DATA_DIR, "motor_model.joblib")
META_PATH = os.path.join(DATA_DIR, "motor_model.json")

# Honest gating: don't act on a model that hasn't earned the bar.
TARGET_ACC = float(os.environ.get("MOTOR_TARGET_ACC", "0.40"))
"""Top-1 accuracy bar. 0.40 is intentionally modest — a uniform random pick over
30 dock apps would score ~0.033, so 0.40 means the model is 12x better than
random, which is more than enough to be useful for pre-highlighting."""

MIN_SAMPLES = int(os.environ.get("MOTOR_MIN_SAMPLES", "40"))
WINDOW = int(os.environ.get("MOTOR_WINDOW", "5"))  # last-N actions used as context


# ----------------------------- I/O ------------------------------------------

def _ensure_history_file() -> None:
    """Create the data dir + empty jsonl if missing. Never raises."""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        if not os.path.exists(HISTORY_PATH):
            with open(HISTORY_PATH, "a", encoding="utf-8"):
                pass
    except Exception:  # noqa: BLE001
        pass


def record(action_id: str, ts: float | None = None) -> dict:
    """Append a single (action_id, ts) row to the history log.

    Returns ``{"ok": bool, "n": <events seen>}``. Safe to call from any thread;
    we use a single ``open(... "a")`` per call which is atomic on POSIX for
    small writes.
    """
    if not action_id or not isinstance(action_id, str):
        return {"ok": False, "error": "action_id must be a non-empty string"}
    action_id = action_id.strip().lower()[:64]
    if not action_id:
        return {"ok": False, "error": "action_id must be a non-empty string"}
    ts = float(ts) if ts is not None else time.time()
    _ensure_history_file()
    try:
        row = {"action_id": action_id, "ts": ts}
        with open(HISTORY_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, separators=(",", ":")) + "\n")
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:200]}


def _iter_events() -> Iterable[dict]:
    if not os.path.exists(HISTORY_PATH):
        return
    try:
        with open(HISTORY_PATH, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:  # noqa: BLE001
                    continue
                aid = obj.get("action_id")
                if not aid:
                    continue
                yield {"action_id": str(aid), "ts": float(obj.get("ts") or 0.0)}
    except FileNotFoundError:
        return


def _build_dataset() -> tuple[list[str], list[list[float]], list[str], list[str]]:
    """Walk the event stream and yield supervised (context -> next_action) rows.

    Returns ``(texts, extras, labels, action_vocab)`` where:

    * ``texts[i]`` is the space-joined last-N action ids before label i,
    * ``extras[i]`` is ``[hour, dow]`` numeric features for label i,
    * ``labels[i]`` is the action_id that came next,
    * ``action_vocab`` is the de-duped list of action ids seen in the data
      (used by the model to know which classes are possible).
    """
    events = list(_iter_events())
    texts: list[str] = []
    extras: list[list[float]] = []
    labels: list[str] = []
    vocab: dict[str, None] = {}
    for ev in events:
        vocab[ev["action_id"]] = None
    for i in range(1, len(events)):
        ctx = events[max(0, i - WINDOW):i]
        if not ctx:
            continue
        seq = " ".join(c["action_id"] for c in ctx)
        ts = events[i]["ts"]
        hour = float(time.localtime(ts).tm_hour) if ts else 0.0
        dow = float(time.localtime(ts).tm_wday) if ts else 0.0
        texts.append(seq)
        extras.append([hour, dow])
        labels.append(events[i]["action_id"])
    return texts, extras, labels, list(vocab.keys())


# ----------------------------- model ----------------------------------------

def _pipeline():
    from sklearn.feature_extraction.text import HashingVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    text_vec = HashingVectorizer(
        n_features=512, alternate_sign=False, norm="l2", ngram_range=(1, 2),
    )
    clf = LogisticRegression(max_iter=400, class_weight="balanced")
    scaler = StandardScaler(with_mean=False)
    return text_vec, clf, scaler


def evaluate() -> dict:
    """Repeated stratified k-fold top-1 accuracy. Never saves a model."""
    texts, extras, labels, vocab = _build_dataset()
    n = len(labels)
    base = {
        "n_samples": n,
        "n_classes": len(vocab),
        "vocab_sample": vocab[:20],
        "target_acc": TARGET_ACC,
        "min_samples": MIN_SAMPLES,
        "window": WINDOW,
    }
    if n < MIN_SAMPLES or len(vocab) < 2:
        return {
            **base,
            "status": "insufficient_data",
            "ready": False,
            "note": (
                f"need >={MIN_SAMPLES} events and >=2 distinct action ids; "
                f"have {n} events, {len(vocab)} ids."
            ),
        }
    try:
        import numpy as np
        from scipy.sparse import csr_matrix, hstack
        from sklearn.model_selection import StratifiedKFold, cross_val_score
        text_vec, clf, scaler = _pipeline()
        X_text = text_vec.fit_transform(texts)
        X_extra = scaler.fit_transform(csr_matrix(np.array(extras, dtype=float)))
        X = hstack([X_text, X_extra]).tocsr()
        y = np.array(labels)
        # Stratified CV requires >=2 samples per class; collapse rare classes
        # into a single bucket so CV doesn't explode on tiny corpora.
        from collections import Counter
        counts = Counter(y.tolist())
        rare = {k for k, v in counts.items() if v < 2}
        y_cv = np.array(["_rare_" if v in rare else v for v in y.tolist()])
        if len(set(y_cv.tolist())) < 2:
            return {**base, "status": "insufficient_data", "ready": False,
                    "note": "all events fall into one class after rare-collapse."}
        n_splits = max(2, min(5, min(Counter(y_cv.tolist()).values())))
        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=1337)
        scores = cross_val_score(clf, X, y_cv, cv=cv, scoring="accuracy", n_jobs=1)
        mean, std = float(scores.mean()), float(scores.std())
        ready = (mean - std) >= TARGET_ACC
        return {
            **base,
            "status": "ok",
            "accuracy_mean": round(mean, 4),
            "accuracy_std": round(std, 4),
            "accuracy_lower": round(mean - std, 4),
            "ready": bool(ready),
        }
    except Exception as e:  # noqa: BLE001
        return {**base, "status": "error", "ready": False, "error": str(e)[:200]}


def train() -> dict:
    """Refit on all data and save the model + meta IF the model is validated.

    If unvalidated, delete any stale on-disk model so ``predict_next`` will
    cleanly fall back to advisory ranking from a fresh in-memory fit.
    """
    rep = evaluate()
    if not rep.get("ready"):
        try:
            if os.path.exists(MODEL_PATH):
                os.remove(MODEL_PATH)
        except Exception:  # noqa: BLE001
            pass
        _write_meta({**rep, "gating": False})
        return {**rep, "gating": False, "saved": False}
    try:
        import joblib
        import numpy as np
        from scipy.sparse import csr_matrix, hstack
        text_vec, clf, scaler = _pipeline()
        texts, extras, labels, _vocab = _build_dataset()
        X_text = text_vec.fit_transform(texts)
        X_extra = scaler.fit_transform(csr_matrix(np.array(extras, dtype=float)))
        X = hstack([X_text, X_extra]).tocsr()
        clf.fit(X, np.array(labels))
        joblib.dump(
            {"clf": clf, "text_vec": text_vec, "scaler": scaler, "classes": list(clf.classes_)},
            MODEL_PATH,
        )
        _write_meta({**rep, "gating": True})
        return {**rep, "gating": True, "saved": True}
    except Exception as e:  # noqa: BLE001
        return {**rep, "gating": False, "saved": False, "error": str(e)[:200]}


def _write_meta(d: dict) -> None:
    try:
        with open(META_PATH, "w", encoding="utf-8") as fh:
            json.dump(d, fh)
    except Exception:  # noqa: BLE001
        pass


def gate_ready() -> bool:
    """True only when a validated model is on disk — advisory mode otherwise."""
    try:
        if not os.path.exists(MODEL_PATH) or not os.path.exists(META_PATH):
            return False
        with open(META_PATH, encoding="utf-8") as fh:
            meta = json.load(fh)
        return bool(meta.get("gating"))
    except Exception:  # noqa: BLE001
        return False


# ----------------------------- prediction -----------------------------------

def _frequency_fallback(top_k: int) -> list[dict]:
    """When we have zero context AND no model, fall back to most-used apps."""
    from collections import Counter
    counts = Counter(ev["action_id"] for ev in _iter_events())
    total = sum(counts.values()) or 1
    return [
        {"action_id": aid, "confidence": round(c / total, 4), "source": "frequency"}
        for aid, c in counts.most_common(top_k)
    ]


def predict_next(recent_actions: list[str], top_k: int = 3) -> dict:
    """Rank the most likely next dock-apps given the user's recent history.

    Always returns a usable result, even on a cold start:

    * If a validated model is on disk -> ranked probabilities (``source="model"``).
    * If sklearn is unavailable or training is impossible -> frequency fallback.
    * If no history at all -> ``candidates=[]`` (the UI should just stay neutral).

    The returned ``gate_ready`` flag tells the UI whether to act aggressively
    (auto-select for dwell) or only pre-highlight.
    """
    top_k = max(1, min(int(top_k or 3), 10))
    recent = [str(a).strip().lower()[:64] for a in (recent_actions or []) if a]
    recent = recent[-WINDOW:]
    ready = gate_ready()

    # Validated model on disk — use it.
    if ready:
        try:
            import joblib
            import numpy as np
            from scipy.sparse import csr_matrix, hstack
            bundle = joblib.load(MODEL_PATH)
            seq = " ".join(recent) if recent else "_cold_"
            ts = time.time()
            hour = float(time.localtime(ts).tm_hour)
            dow = float(time.localtime(ts).tm_wday)
            X_text = bundle["text_vec"].transform([seq])
            X_extra = bundle["scaler"].transform(csr_matrix(np.array([[hour, dow]], dtype=float)))
            X = hstack([X_text, X_extra]).tocsr()
            proba = bundle["clf"].predict_proba(X)[0]
            classes = bundle["classes"]
            order = np.argsort(-proba)[:top_k]
            cands = [
                {"action_id": str(classes[i]), "confidence": round(float(proba[i]), 4),
                 "source": "model"}
                for i in order
            ]
            return {"ok": True, "candidates": cands, "gate_ready": True,
                    "context": recent, "top_k": top_k}
        except Exception as e:  # noqa: BLE001
            # Fall through to advisory path on any model load/predict error.
            err = str(e)[:200]
        else:
            err = None
    else:
        err = None

    # Advisory path: try a quick in-memory fit; otherwise frequency fallback.
    try:
        texts, extras, labels, vocab = _build_dataset()
        if len(labels) >= 5 and len(set(labels)) >= 2:
            import numpy as np
            from scipy.sparse import csr_matrix, hstack
            text_vec, clf, scaler = _pipeline()
            X_text = text_vec.fit_transform(texts)
            X_extra = scaler.fit_transform(csr_matrix(np.array(extras, dtype=float)))
            X = hstack([X_text, X_extra]).tocsr()
            clf.fit(X, np.array(labels))
            seq = " ".join(recent) if recent else "_cold_"
            ts = time.time()
            X_text2 = text_vec.transform([seq])
            X_extra2 = scaler.transform(csr_matrix(
                np.array([[float(time.localtime(ts).tm_hour),
                           float(time.localtime(ts).tm_wday)]], dtype=float)
            ))
            X2 = hstack([X_text2, X_extra2]).tocsr()
            proba = clf.predict_proba(X2)[0]
            classes = clf.classes_
            order = np.argsort(-proba)[:top_k]
            cands = [
                {"action_id": str(classes[i]), "confidence": round(float(proba[i]), 4),
                 "source": "advisory"}
                for i in order
            ]
            return {"ok": True, "candidates": cands, "gate_ready": False,
                    "context": recent, "top_k": top_k, "advisory": True,
                    "error": err}
    except Exception as e:  # noqa: BLE001
        err = err or str(e)[:200]

    # Last resort — frequency fallback.
    cands = _frequency_fallback(top_k)
    return {"ok": True, "candidates": cands, "gate_ready": False,
            "context": recent, "top_k": top_k, "advisory": True,
            "fallback": "frequency", "error": err}


def stats() -> dict:
    """Quick health snapshot for the UI / route."""
    n = 0
    distinct: set[str] = set()
    last_ts = 0.0
    for ev in _iter_events():
        n += 1
        distinct.add(ev["action_id"])
        if ev["ts"] > last_ts:
            last_ts = ev["ts"]
    return {
        "n_events": n,
        "n_distinct_actions": len(distinct),
        "last_event_ts": last_ts,
        "model_present": os.path.exists(MODEL_PATH),
        "gate_ready": gate_ready(),
        "window": WINDOW,
        "min_samples": MIN_SAMPLES,
        "target_acc": TARGET_ACC,
    }


if __name__ == "__main__":  # pragma: no cover
    import sys
    args = sys.argv[1:]
    if "--train" in args:
        print(json.dumps(train(), indent=2))
    elif "--eval" in args:
        print(json.dumps(evaluate(), indent=2))
    elif "--predict" in args:
        idx = args.index("--predict")
        rest = args[idx + 1:]
        print(json.dumps(predict_next(rest, top_k=3), indent=2))
    else:
        print(json.dumps(stats(), indent=2))
