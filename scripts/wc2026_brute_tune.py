#!/usr/bin/env python3
"""Brute-force hyperparameter search over the WC2026 ensemble.

All results are measured out-of-sample via walk-forward cross-validation.
No future information is used.
"""
from __future__ import annotations

import itertools
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PY = REPO / ".venv" / "bin" / "python"
ENGINE = REPO / "scripts" / "worldcup_prediction_engine.py"
ENV = {
    "OMP_NUM_THREADS": "1",
    "OPENBLAS_NUM_THREADS": "1",
    "MKL_NUM_THREADS": "1",
    "NUMEXPR_NUM_THREADS": "1",
}


@dataclass(frozen=True)
class Config:
    l2: float
    weight_objective: str
    majority_pick: bool
    drop_models: str | None
    extreme_entropy: float | None
    extreme_margin: float | None
    rotate_entropy: float | None

    def label(self) -> str:
        parts = [
            f"l2={self.l2}",
            f"obj={self.weight_objective}",
            "maj" if self.majority_pick else "blend",
        ]
        if self.drop_models:
            parts.append(f"drop={self.drop_models}")
        if self.extreme_entropy is not None:
            parts.append(f"ent={self.extreme_entropy}")
        if self.extreme_margin is not None:
            parts.append(f"margin={self.extreme_margin}")
        if self.rotate_entropy is not None:
            parts.append(f"rot={self.rotate_entropy}")
        return "|".join(parts)

    def cmd(self) -> list[str]:
        cmd = [
            str(PY), str(ENGINE),
            "--mode", "walk-forward",
            "--strategy", "balanced",
            "--folds", "5",
            "--l2", str(self.l2),
            "--weight-objective", self.weight_objective,
        ]
        if self.majority_pick:
            cmd.append("--majority-pick")
        if self.drop_models:
            cmd.extend(["--drop-models", self.drop_models])
        if self.extreme_entropy is not None:
            cmd.extend(["--extreme-entropy", str(self.extreme_entropy)])
        if self.extreme_margin is not None:
            cmd.extend(["--extreme-margin", str(self.extreme_margin)])
        if self.rotate_entropy is not None:
            cmd.extend(["--rotate-entropy", str(self.rotate_entropy)])
        return cmd


@dataclass
class Result:
    config: Config
    matches: int
    single: float
    coverage: float
    value: float
    cost: float
    returncode: int
    stderr_tail: str


def _parse(report: str) -> dict[str, float | int]:
    out: dict[str, float | int] = {}
    m = re.search(r"Matches evaluated:\s+(\d+)", report)
    if m:
        out["matches"] = int(m.group(1))
    for key, pat in [
        ("single", r"Single-pick accuracy:\s+([0-9.]+)%"),
        ("coverage", r"Three-spread coverage:\s+([0-9.]+)%"),
        ("value", r"Betting value score:\s+([0-9.]+)%"),
        ("cost", r"Avg coverage cost:\s+([0-9.]+)"),
    ]:
        m = re.search(pat, report)
        if m:
            out[key] = float(m.group(1))
    return out


def _objective(r: Result) -> float:
    # Same composite used by the promotion logic: accuracy + coverage - cost penalty.
    return r.single + r.coverage - (r.cost - 1.0) * 2.0


def run_one(config: Config) -> Result:
    env = os.environ.copy()
    env.update(ENV)
    proc = subprocess.run(
        config.cmd(),
        cwd=str(REPO),
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )
    parsed = _parse(proc.stdout + proc.stderr)
    return Result(
        config=config,
        matches=int(parsed.get("matches", 0)),
        single=parsed.get("single", 0.0),
        coverage=parsed.get("coverage", 0.0),
        value=parsed.get("value", 0.0),
        cost=parsed.get("cost", 99.0),
        returncode=proc.returncode,
        stderr_tail=(proc.stderr or "")[-400:],
    )


def main() -> int:
    configs: list[Config] = []
    # Phase 1: core learning knobs
    for l2, obj, maj in itertools.product(
        [0.0, 0.0001, 0.001, 0.01, 0.1],
        ["logloss", "accuracy"],
        [False, True],
    ):
        configs.append(Config(l2=l2, weight_objective=obj, majority_pick=maj,
                              drop_models=None, extreme_entropy=None,
                              extreme_margin=None, rotate_entropy=None))

    # Phase 2: model ablation around the best core config
    best_core = Config(l2=0.0001, weight_objective="logloss", majority_pick=True,
                       drop_models=None, extreme_entropy=None,
                       extreme_margin=None, rotate_entropy=None)
    ablation_candidates = [
        "h2h", "roster_strength", "underdog_guard", "group_table",
        "goal_diff", "form_momentum", "tournament_elo", "rank", "rank_draw",
    ]
    for name in ablation_candidates:
        configs.append(Config(l2=best_core.l2, weight_objective=best_core.weight_objective,
                              majority_pick=best_core.majority_pick, drop_models=name,
                              extreme_entropy=None, extreme_margin=None, rotate_entropy=None))

    # Phase 3: threshold sweep around the best core config
    for ee, em, re in itertools.product(
        [0.97, 0.985, 0.995],
        [0.0, 0.03, 0.05, 0.08, 0.12],
        [0.90, 0.93, 0.95, 0.98],
    ):
        configs.append(Config(l2=best_core.l2, weight_objective=best_core.weight_objective,
                              majority_pick=best_core.majority_pick, drop_models=None,
                              extreme_entropy=ee, extreme_margin=em, rotate_entropy=re))

    print(f"Running {len(configs)} walk-forward configs in parallel...")
    results: list[Result] = []
    with ProcessPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(run_one, c): c for c in configs}
        for fut in as_completed(futures):
            res = fut.result()
            results.append(res)
            print(f"[{len(results)}/{len(configs)}] {res.config.label()} -> "
                  f"single={res.single:.1f}% cov={res.coverage:.1f}% value={res.value:.1f}% cost={res.cost:.2f} "
                  f"obj={_objective(res):.2f}")

    ok = [r for r in results if r.returncode == 0 and r.matches > 0]
    ok.sort(key=_objective, reverse=True)

    print("\n=== TOP 10 OUT-OF-SAMPLE CONFIGS ===")
    for i, r in enumerate(ok[:10], 1):
        print(f"{i}. {r.config.label()}")
        print(f"   single={r.single:.1f}% coverage={r.coverage:.1f}% value={r.value:.1f}% cost={r.cost:.2f} "
              f"objective={_objective(r):.3f}")

    out_path = REPO / "server" / "data" / "wc2026_brute_tune_results.json"
    out_path.write_text(json.dumps([
        {
            "config": r.config.label(),
            "matches": r.matches,
            "single_pick_accuracy": r.single,
            "three_spread_coverage": r.coverage,
            "betting_value_score": r.value,
            "avg_coverage_cost": r.cost,
            "objective": _objective(r),
        }
        for r in ok
    ], indent=2), encoding="utf-8")
    print(f"\nWrote results to {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
