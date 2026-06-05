"""BRAIN PLANNER — goal-oriented autopilot (GOAP / A* task decomposition).

The autopilot (``brain_autopilot.run``) fires a FIXED sequence of actions every
pass. This planner makes the autopilot GOAL-DIRECTED instead: given a target
health state, it models each capability as a GOAP action (preconditions +
estimated effects + cost), uses A* to find the cheapest action path to the goal,
executes it against the REAL vault, then re-scans and REPLANS whenever reality
diverges from the estimate (closed loop). External enrichment is a first-class
planned action, so the planner reaches outside the vault only when that's the
cheapest way to close a gap.

Concept credit: the GOAP A* goal-planner idea is adapted from ruvnet/ruflo (MIT);
this is a clean-room native Python reimplementation — no ruflo code is vendored.

Design rules (shared with the rest of the backend): stdlib only, NEVER raise,
every public function degrades to an honest result.
"""

from __future__ import annotations

import heapq
import time
from dataclasses import dataclass, field
from typing import Callable

try:
    from . import brain_autopilot as ap
except Exception:  # noqa: BLE001
    ap = None  # type: ignore
try:
    from . import brain_enrich as be
except Exception:  # noqa: BLE001
    be = None  # type: ignore

# planning dimensions we track in the symbolic world-state
_DIMS = ("gaps", "orphans", "themes")


# ───────────────────────────────────────────────────────────── world state
def observe() -> dict:
    """Read the real current world-state the planner reasons over."""
    state = {"gaps": 0, "orphans": 0, "themes": 0, "low_confidence": 0,
             "score": 100, "online": False}
    if ap is not None:
        try:
            s = ap.scan()
            for k in ("gaps", "orphans", "themes", "low_confidence", "score"):
                state[k] = int(s.get(k, 0))
        except Exception:  # noqa: BLE001
            pass
    if be is not None:
        try:
            state["online"] = bool(be.network_ok())
        except Exception:  # noqa: BLE001
            state["online"] = False
    return state


def _goal_unmet(state: dict, goal: dict) -> list[str]:
    """Which goal dimensions are still violated (state[k] > goal[k])."""
    return [k for k, cap in goal.items() if int(state.get(k, 0)) > int(cap)]


def _addressable(state: dict, goal: dict, actions: list["Action"]) -> dict:
    """Relax the goal to only the unmet dimensions some currently-applicable
    action can actually reduce — so one stuck dimension (e.g. unlinkable orphans)
    never blocks progress on the achievable ones."""
    relaxed = {}
    for k in _goal_unmet(state, goal):
        for a in actions:
            try:
                if a.precond(state) and int(a.effect(state).get(k, state.get(k, 0))) < int(state.get(k, 0)):
                    relaxed[k] = int(goal[k])
                    break
            except Exception:  # noqa: BLE001
                continue
    return relaxed


# ───────────────────────────────────────────────────────────── GOAP actions
@dataclass
class Action:
    name: str
    cost: float
    precond: Callable[[dict], bool]
    effect: Callable[[dict], dict]          # planning-time ESTIMATE of effect
    execute: Callable[[], int]              # real side-effecting run -> # items changed
    reaches: bool = field(default=False)    # touches network (informational)


def _with(state: dict, **changes) -> dict:
    new = dict(state)
    new.update(changes)
    return new


def _actions() -> list[Action]:
    """The action repertoire, each bound to a REAL autopilot capability.

    Costs encode preference: internal/grounded actions are cheap; external
    enrichment is pricier (network + politeness) so it's chosen only when it's
    the cheapest remaining way to close a gap."""
    acts: list[Action] = []
    if ap is None:
        return acts

    acts.append(Action(
        name="connect_orphans", cost=1.0,
        precond=lambda s: s.get("orphans", 0) > 0,
        effect=lambda s: _with(s, orphans=0),
        execute=lambda: ap._connect_orphans(),
    ))
    acts.append(Action(
        name="promote_themes", cost=1.0,
        precond=lambda s: s.get("themes", 0) > 0,
        effect=lambda s: _with(s, themes=0),
        execute=lambda: ap._promote_themes(),
    ))
    acts.append(Action(
        name="resolve_danglers", cost=1.5,
        precond=lambda s: s.get("gaps", 0) > 0,
        effect=lambda s: _with(s, gaps=0),
        execute=lambda: ap._resolve_danglers(),
    ))
    if be is not None:
        acts.append(Action(
            name="enrich_external", cost=4.0, reaches=True,
            precond=lambda s: s.get("gaps", 0) > 0 and s.get("online"),
            # external enrichment closes gaps AND deepens shallow notes
            effect=lambda s: _with(s, gaps=0, low_confidence=0),
            execute=lambda: be.enrich(limit=25).get("written", 0),
        ))
    return acts


# ───────────────────────────────────────────────────────────── A* planner
def _key(state: dict) -> tuple:
    return tuple(int(state.get(d, 0)) for d in _DIMS)


def _heuristic(state: dict, goal: dict) -> float:
    # admissible: at least one action per still-violated goal dimension
    return float(len(_goal_unmet(state, goal)))


def plan(state: dict, goal: dict, actions: list[Action] | None = None,
         max_expansions: int = 2000) -> list[str] | None:
    """A* over symbolic world-states → ordered list of action names, or None if
    the goal is unreachable with the available actions."""
    actions = actions if actions is not None else _actions()
    start = _key(state)
    # frontier: (f, counter, g, state_dict, path)
    counter = 0
    frontier = [(_heuristic(state, goal), counter, 0.0, state, [])]
    best_g = {start: 0.0}
    expansions = 0
    while frontier and expansions < max_expansions:
        _, _, g, st, path = heapq.heappop(frontier)
        expansions += 1
        if not _goal_unmet(st, goal):
            return path
        for a in actions:
            try:
                if not a.precond(st):
                    continue
                nxt = a.effect(st)
            except Exception:  # noqa: BLE001
                continue
            nk = _key(nxt)
            ng = g + a.cost
            if ng < best_g.get(nk, float("inf")):
                best_g[nk] = ng
                counter += 1
                f = ng + _heuristic(nxt, goal)
                heapq.heappush(frontier, (f, counter, ng, nxt, path + [a.name]))
    return None


# ───────────────────────────────────────────────────────────── executor
def run(goal: dict | None = None, *, max_steps: int = 12) -> dict:
    """Plan → execute → re-observe → replan until the goal holds, no action
    applies, or ``max_steps`` is spent. Returns a full audit trail.

    ``goal`` maps planning dims to a max allowed count; default = drive
    gaps/orphans/themes to zero.
    """
    out = {"goal": {}, "reached": False, "steps": [], "replans": 0,
           "state_before": {}, "state_after": {}, "duration_ms": 0}
    if ap is None:
        return out
    t0 = time.time()
    goal = {k: int(goal.get(k, 0)) for k in _DIMS} if goal else {k: 0 for k in _DIMS}
    out["goal"] = goal

    state = observe()
    out["state_before"] = dict(state)
    actions = {a.name: a for a in _actions()}
    by_name = lambda n: actions.get(n)

    try:
        max_steps = max(1, min(40, int(max_steps)))
    except (TypeError, ValueError):
        max_steps = 12

    steps_taken = 0
    current_plan: list[str] = []
    while steps_taken < max_steps:
        if not _goal_unmet(state, goal):
            out["reached"] = True
            break
        if not current_plan:
            acts = list(actions.values())
            p = plan(state, goal, acts)
            if not p:
                # full goal unreachable → relax to dims we can still move, replan
                relaxed = _addressable(state, goal, acts)
                if not relaxed:
                    break  # nothing left we can improve
                p = plan(state, relaxed, acts)
                if not p:
                    break
            current_plan = p
            out["replans"] += 1
        action_name = current_plan.pop(0)
        act = by_name(action_name)
        if act is None or not act.precond(state):
            current_plan = []  # stale plan vs reality → replan
            continue
        # execute the REAL action and re-observe the REAL world
        try:
            changed = int(act.execute())
        except Exception:  # noqa: BLE001
            changed = 0
        before = state
        predicted = act.effect(before)
        state = observe()
        steps_taken += 1
        out["steps"].append({
            "step": steps_taken, "action": action_name, "changed": changed,
            "predicted": {d: predicted.get(d) for d in _DIMS},
            "observed": {d: state.get(d) for d in _DIMS},
            "score": state.get("score"),
        })
        # if the action did nothing, drop it from the repertoire to avoid a loop
        if changed == 0:
            actions.pop(action_name, None)
            current_plan = [n for n in current_plan if n in actions]
        # reality may diverge from the estimate → discard plan tail, replan next loop
        if _key(state) != _key(act.effect(before)):
            current_plan = []

    out["state_after"] = dict(state)
    out["reached"] = not _goal_unmet(state, goal)
    out["steps_taken"] = steps_taken
    out["duration_ms"] = int((time.time() - t0) * 1000)
    return out


def preview(goal: dict | None = None) -> dict:
    """Compute the plan WITHOUT executing — dry-run for the UI / governance."""
    state = observe()
    goal = {k: int(goal.get(k, 0)) for k in _DIMS} if goal else {k: 0 for k in _DIMS}
    p = plan(state, goal)
    return {
        "state": state, "goal": goal,
        "plan": p, "reachable": p is not None,
        "unmet": _goal_unmet(state, goal),
    }
