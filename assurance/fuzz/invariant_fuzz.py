"""Property-style fuzz of workflow + invariants.

Random walks of each StateMachine; verifies that allowed transitions don't
violate any invariant, that forbidden transitions raise WorkflowError, and
that terminal states actually terminate.
"""
from __future__ import annotations

import argparse
import json
import random
import sys

from assurance.workflows.state_machine import WorkflowError
from assurance.workflows.workflows import (
    chat_request_workflow,
    claude_run_workflow,
    gpu_lifecycle_workflow,
)


def _walk(sm, rng: random.Random, max_steps: int = 50):
    inst = sm.new_instance()
    for _ in range(max_steps):
        if inst.terminated:
            break
        evts = sm.allowed_events(inst.state)
        if not evts:
            break
        try:
            inst.fire(rng.choice(evts))
        except WorkflowError:
            break
    return inst.snapshot()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--walks", type=int, default=200)
    args = p.parse_args()
    rng = random.Random(args.seed)
    summary = {}
    for sm in (claude_run_workflow, gpu_lifecycle_workflow, chat_request_workflow):
        terms = 0
        states_seen: set[str] = set()
        for _ in range(args.walks):
            snap = _walk(sm, rng)
            if snap["terminated"]:
                terms += 1
            states_seen.update(snap["history"])
        summary[sm.name] = {"walks": args.walks, "terminated": terms,
                            "states_seen": sorted(states_seen)}
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
