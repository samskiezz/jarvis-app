#!/usr/bin/env python3
"""VIABILITY PREDICTOR — a learned pre-filter that estimates whether a proposed feature will actually
LAND (pass the crash-proof gate AND clear the 1,000-pt Claude audit) BEFORE we spend build tokens on it.

This is the "≥90% accuracy, repeatable, before Claude reviews" gate the owner asked for. The honesty rule
baked in: the model only EARNS the right to gate once it demonstrably reaches ≥90% accuracy under repeated
cross-validation on the real journal. Until then it runs ADVISORY (logs a pass-probability for calibration
but blocks nothing) — because gating on an unproven model would be worse than not gating at all.

Trains on server/data/auto_improve.log.jsonl (the engine's own outcome log). Reuses the repo's existing
sklearn pattern (see server/services/oracle_model.py). Pure sklearn + joblib; degrades gracefully to
"advisory / not ready" whenever sklearn is missing or there isn't enough labelled data yet.

CLI:
  python3 scripts/viability_model.py --eval     # honest repeated-CV accuracy on current data
  python3 scripts/viability_model.py --train     # retrain; save model ONLY if it hits >=90% repeatable
  python3 scripts/viability_model.py --predict '{"title":"...","category":"...","builder":"claude"}'
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, "server", "data", "auto_improve.log.jsonl")
MODEL_PATH = os.path.join(ROOT, "server", "data", "viability_model.joblib")
META_PATH = os.path.join(ROOT, "server", "data", "viability_model.json")

TARGET_ACC = float(os.environ.get("VIAB_TARGET_ACC", "0.90"))   # the ≥90% bar
MIN_SAMPLES = int(os.environ.get("VIAB_MIN_SAMPLES", "60"))      # don't trust tiny samples
MIN_PER_CLASS = int(os.environ.get("VIAB_MIN_PER_CLASS", "12"))


def _read_outcomes() -> list:
    """Each landed/rejected feature = one labelled row. label 1 = actually landed (passed gate+audit,
    not rolled back); label 0 = rejected by the audit or rolled back after landing."""
    rows = []
    try:
        with open(LOG, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    e = json.loads(line)
                except Exception:  # noqa: BLE001
                    continue
                ev = e.get("event")
                if ev == "feature_land":
                    label = 1 if (e.get("landed", True) and not e.get("rolled_back")) else 0
                elif ev == "feature_reject":
                    label = 0
                else:
                    continue
                rows.append({
                    "title": e.get("title", ""), "category": e.get("category", "other"),
                    "builder": e.get("builder", "claude"), "has_target": 0,
                    "label": label,
                })
    except FileNotFoundError:
        pass
    return rows


def _texts_and_meta(rows):
    """Build a text bag (title + category + builder tokens) per row — HashingVectorizer needs no fitted
    vocab, so it is stable across retrains and tiny datasets."""
    texts, extra, y = [], [], []
    for r in rows:
        texts.append(" ".join([
            str(r.get("title", "")),
            "cat_" + str(r.get("category", "other")),
            "builder_" + str(r.get("builder", "claude")),
        ]))
        t = str(r.get("title", ""))
        extra.append([len(t), len(t.split()), int(r.get("has_target", 0))])
        y.append(int(r.get("label", 0)))
    return texts, extra, y


def _pipeline():
    from sklearn.feature_extraction.text import HashingVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import FeatureUnion, Pipeline
    from sklearn.preprocessing import FunctionTransformer, StandardScaler
    import numpy as np

    text_vec = Pipeline([("hash", HashingVectorizer(n_features=128, alternate_sign=False,
                                                    norm="l2", ngram_range=(1, 2)))])
    # extra numeric features are passed as the 2nd element of the (texts, extra) tuple
    return text_vec, LogisticRegression(max_iter=1000, class_weight="balanced"), StandardScaler(with_mean=False), np


def evaluate() -> dict:
    """Honest repeated stratified k-fold accuracy. Returns the numbers; never saves."""
    rows = _read_outcomes()
    n = len(rows)
    pos = sum(r["label"] for r in rows)
    neg = n - pos
    base = {"n_samples": n, "positives": pos, "negatives": neg, "target_acc": TARGET_ACC}
    if n < MIN_SAMPLES or pos < MIN_PER_CLASS or neg < MIN_PER_CLASS:
        return {**base, "status": "insufficient_data", "ready": False,
                "note": f"need >={MIN_SAMPLES} samples and >={MIN_PER_CLASS}/class; the engine is still "
                        f"accruing labelled outcomes (have {n}: {pos} landed / {neg} rejected)."}
    try:
        from sklearn.model_selection import RepeatedStratifiedKFold, cross_val_score
        from scipy.sparse import hstack, csr_matrix
        text_vec, clf, scaler, np = _pipeline()
        texts, extra, y = _texts_and_meta(rows)
        X_text = text_vec.fit_transform(texts)
        X_extra = scaler.fit_transform(csr_matrix(np.array(extra, dtype=float)))
        X = hstack([X_text, X_extra]).tocsr()
        y = np.array(y)
        cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=5, random_state=1337)
        scores = cross_val_score(clf, X, y, cv=cv, scoring="accuracy")
        mean, std = float(scores.mean()), float(scores.std())
        # "repeatable ≥90%": the lower bound (mean − std) clears the bar, so it isn't a lucky fold.
        ready = (mean - std) >= TARGET_ACC
        return {**base, "status": "ok", "accuracy_mean": round(mean, 4), "accuracy_std": round(std, 4),
                "accuracy_lower": round(mean - std, 4), "ready": bool(ready)}
    except Exception as e:  # noqa: BLE001
        return {**base, "status": "error", "ready": False, "error": str(e)[:200]}


def train() -> dict:
    """Retrain on all data; SAVE the model + meta ONLY if it is repeatably ≥90%. Otherwise remove any
    stale saved model so the gate cannot rely on an unproven predictor."""
    rep = evaluate()
    if not rep.get("ready"):
        # don't leave a stale/over-trusted model around
        try:
            if os.path.exists(MODEL_PATH):
                os.remove(MODEL_PATH)
        except Exception:  # noqa: BLE001
            pass
        _write_meta({**rep, "gating": False})
        return {**rep, "gating": False, "saved": False}
    try:
        import joblib
        from scipy.sparse import hstack, csr_matrix
        text_vec, clf, scaler, np = _pipeline()
        rows = _read_outcomes()
        texts, extra, y = _texts_and_meta(rows)
        X_text = text_vec.fit_transform(texts)
        X_extra = scaler.fit_transform(csr_matrix(np.array(extra, dtype=float)))
        X = hstack([X_text, X_extra]).tocsr()
        clf.fit(X, np.array(y))
        joblib.dump({"clf": clf, "text_vec": text_vec, "scaler": scaler}, MODEL_PATH)
        _write_meta({**rep, "gating": True})
        return {**rep, "gating": True, "saved": True}
    except Exception as e:  # noqa: BLE001
        return {**rep, "gating": False, "saved": False, "error": str(e)[:200]}


def _write_meta(d: dict):
    try:
        with open(META_PATH, "w", encoding="utf-8") as fh:
            json.dump(d, fh)
    except Exception:  # noqa: BLE001
        pass


def gate_ready() -> bool:
    """True only if a validated (≥90% repeatable) model is saved and ready to gate."""
    try:
        if not os.path.exists(MODEL_PATH):
            return False
        meta = json.load(open(META_PATH, encoding="utf-8"))
        return bool(meta.get("gating"))
    except Exception:  # noqa: BLE001
        return False


def predict(feat: dict):
    """Pass-probability in [0,1], or None if there is no validated model yet (advisory mode)."""
    if not gate_ready():
        return None
    try:
        import joblib
        from scipy.sparse import hstack, csr_matrix
        import numpy as np
        bundle = joblib.load(MODEL_PATH)
        row = {"title": feat.get("title", ""), "category": feat.get("category", "other"),
               "builder": feat.get("_builder") or feat.get("builder", "claude"),
               "has_target": 1 if (feat.get("target") or feat.get("file")) else 0, "label": 0}
        texts, extra, _ = _texts_and_meta([row])
        X_text = bundle["text_vec"].transform(texts)
        X_extra = bundle["scaler"].transform(csr_matrix(np.array(extra, dtype=float)))
        X = hstack([X_text, X_extra]).tocsr()
        return float(bundle["clf"].predict_proba(X)[0][1])
    except Exception:  # noqa: BLE001
        return None


if __name__ == "__main__":
    a = sys.argv
    if "--train" in a:
        print(json.dumps(train(), indent=2))
    elif "--predict" in a:
        feat = json.loads(a[a.index("--predict") + 1])
        print(json.dumps({"pass_prob": predict(feat), "gate_ready": gate_ready()}, indent=2))
    else:
        print(json.dumps(evaluate(), indent=2))
