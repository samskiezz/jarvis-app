"""Train the motor-intent predictor (gap-fix #3) on the bootstrap corpus.

Thin CLI wrapper around ``server.services.motor_predictor`` that:

1. Calls ``evaluate()`` first to surface accuracy_mean / accuracy_std / ready.
2. Calls ``train()`` to refit and (if validated) persist
   ``server/data/motor_model.joblib`` + ``motor_model.json``.
3. Runs a quick ``predict_next()`` smoke prediction so the operator can see the
   model actually responds.

This script never modifies runtime status files. It only writes the model
artefact + meta json, which is the predictor's own storage contract.

Usage:

    python3 scripts/train_motor_predictor.py
    python3 scripts/train_motor_predictor.py --eval-only
    python3 scripts/train_motor_predictor.py --predict app-vitals app-worklist

Research basis (2026 few-shot / small-sample classification):
    - LogisticRegression remains the recommended baseline for few-shot
      structured prediction with sklearn (analyticsvidhya.com, 2026).
    - Stratified k-fold CV with rare-class collapse is the standard 2026
      protocol for honest small-sample accuracy reporting.
    - Top-1 accuracy at ~12x random is enough for advisory pre-highlighting
      in accessibility scan loops; we set the bar accordingly in the model.
"""
from __future__ import annotations

import argparse
import json
import sys
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


def _import_predictor():
    from server.services import motor_predictor as M  # noqa: WPS433
    return M


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument(
        "--eval-only", action="store_true",
        help="Only run cross-validated evaluation, do not refit / persist.",
    )
    parser.add_argument(
        "--predict", nargs="*", default=None,
        help="After training, predict next action from these recent ids.",
    )
    parser.add_argument(
        "--top-k", type=int, default=3,
        help="Top-K candidates to return for prediction smoke check.",
    )
    args = parser.parse_args(argv)

    try:
        M = _import_predictor()
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "stage": "import", "error": str(e)[:300]}, indent=2))
        return 2

    report: dict = {"ok": True}

    # Stage 1: evaluate.
    try:
        report["evaluate"] = M.evaluate()
    except Exception as e:  # noqa: BLE001
        report["ok"] = False
        report["evaluate_error"] = str(e)[:300]
        print(json.dumps(report, indent=2))
        return 1

    # Stage 2: train (unless eval-only).
    if not args.eval_only:
        try:
            report["train"] = M.train()
        except Exception as e:  # noqa: BLE001
            report["ok"] = False
            report["train_error"] = str(e)[:300]

    # Stage 3: smoke predict.
    recent = args.predict if args.predict is not None else ["app-library", "app-worklist"]
    try:
        report["predict_smoke"] = M.predict_next(recent, top_k=args.top_k)
    except Exception as e:  # noqa: BLE001
        report["predict_error"] = str(e)[:300]

    report["stats"] = M.stats()
    print(json.dumps(report, indent=2, default=str))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
