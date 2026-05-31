"""Per-Minion neural network (doc II.101).

Every Minion carries its own small policy network: a 10→8→8 multilayer perceptron
whose *innate* weights are a deterministic function of its DNA (so genetics shape
disposition), and whose output-layer biases it *learns* over its life from the
reward signal (did wellbeing rise after the action?). The net maps the Minion's
current state to a preference over its repertoire of actions. Pure-Python and
tiny, so thousands of Minions can each think with their own brain.
"""

from __future__ import annotations

import hashlib
import math

# The action repertoire the policy ranges over.
ACTIONS = ["study", "calculate", "kb_lookup", "teach", "meditate", "socialise",
           "search_patents", "rest"]
_I, _H, _K = 10, 8, len(ACTIONS)


def _seed(dna: str) -> int:
    return int(hashlib.sha256(dna.encode()).hexdigest()[:8], 16)


def _features(m) -> list[float]:
    g = lambda v, d=0.5: d if v is None else v  # noqa: E731
    return [
        m.hunger, m.thirst, m.fatigue, m.sanity, 1.0 - m.stress,
        g(m.morale), g(m.purpose), m.openness, m.intelligence, m.creativity,
    ]


def _innate(dna: str):
    """Deterministic innate weights from DNA (a tiny LCG, no numpy needed)."""
    state = _seed(dna)

    def rnd() -> float:
        nonlocal state
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        return state / 0x7FFFFFFF * 2.0 - 1.0   # [-1, 1)

    W1 = [[rnd() for _ in range(_I)] for _ in range(_H)]
    b1 = [0.5 * rnd() for _ in range(_H)]
    W2 = [[rnd() for _ in range(_H)] for _ in range(_K)]
    b2 = [0.3 * rnd() for _ in range(_K)]
    return W1, b1, W2, b2


def _forward(feat: list[float], dna: str, learned_b2: list[float] | None) -> list[float]:
    W1, b1, W2, b2 = _innate(dna)
    hidden = [math.tanh(sum(W1[j][i] * feat[i] for i in range(_I)) + b1[j]) for j in range(_H)]
    out = []
    for k in range(_K):
        z = sum(W2[k][j] * hidden[j] for j in range(_H)) + b2[k]
        if learned_b2:
            z += learned_b2[k]
        out.append(z)
    return out


def policy(m) -> dict[str, float]:
    """Action → preference score for this Minion right now."""
    learned = (m.brain or {}).get("b2")
    z = _forward(_features(m), m.dna, learned)
    return {ACTIONS[k]: round(z[k], 4) for k in range(_K)}


def choose(m, candidates) -> str | None:
    scores = policy(m)
    pool = [a for a in candidates if a in scores] or list(candidates)
    if not pool:
        return None
    return max(pool, key=lambda a: scores.get(a, -1e9))


def learn(m, action: str, reward: float, *, lr: float = 0.15) -> None:
    """Reinforce (or weaken) the bias for the action just taken by its reward."""
    if action not in ACTIONS:
        return
    brain = dict(m.brain or {})
    b2 = list(brain.get("b2") or [0.0] * _K)
    idx = ACTIONS.index(action)
    b2[idx] = max(-3.0, min(3.0, b2[idx] + lr * reward))
    brain["b2"] = b2
    m.brain = brain   # reassign so the JSON column is marked dirty
