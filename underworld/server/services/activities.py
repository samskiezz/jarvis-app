"""New lived actions that deepen the simulation — real effects, not stubs.

The sim shipped with 16 coarse actions. To give Minions a genuinely richer life
(and so the behavior bridge has more to express), this module adds seven new
actions, each with a real, bounded effect on the Minion's actual well-being
state (hunger/thirst/fatigue/sanity/health/stress/reputation) and grounded in an
existing world system (economy, ecosystem, religion). They are pure and
deterministic given an rng, so they unit-test without a database, then wire into
minion.run_tick's dispatch and the era-progression unlock ladder.

  forage   (stone)   gather food + water from the land      → ecosystem
  worship  (stone)   sky-belief ritual                      → religion
  craft    (bronze)  make a tool/artifact                   → manufacturing
  trade    (bronze)  exchange goods at market               → economy
  celebrate(bronze)  a festival / shared joy                → civics
  heal     (iron)    tend wounds (self or a neighbour)      → medicine
  mentor   (iron)    guide an apprentice                    → relationships
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field

# Era at which each new action becomes available (folded into progression.ERAS).
UNLOCKS_BY_ERA: dict[str, tuple[str, ...]] = {
    "stone": ("forage", "worship"),
    "bronze": ("craft", "trade", "celebrate"),
    "iron": ("heal", "mentor"),
    "information": ("gene_edit",),   # CRISPR epoch — real molecular genetics
}
NEW_ACTIONS: frozenset[str] = frozenset(a for v in UNLOCKS_BY_ERA.values() for a in v)


@dataclass
class Effect:
    summary: str
    deltas: dict[str, float] = field(default_factory=dict)   # field -> signed delta
    neighbour_deltas: dict[str, float] = field(default_factory=dict)  # applied to a target


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def apply_effect(minion, eff: Effect, target=None) -> str:
    """Mutate the Minion's (and optional target's) state within valid bounds."""
    for f, d in eff.deltas.items():
        cur = float(getattr(minion, f, 0.0) or 0.0)
        setattr(minion, f, max(0.0, cur + d) if f == "reputation" else _clamp01(cur + d))
    if target is not None and eff.neighbour_deltas:
        for f, d in eff.neighbour_deltas.items():
            cur = float(getattr(target, f, 0.0) or 0.0)
            setattr(target, f, max(0.0, cur + d) if f == "reputation" else _clamp01(cur + d))
    return eff.summary


# ── the seven activities — each returns a bounded, meaningful Effect ──────────
def forage(m, rng: random.Random) -> Effect:
    q = 0.12 + 0.10 * rng.random()                      # how good the gathering was
    return Effect("Foraged the land — gathered food and fresh water.",
                  {"hunger": +q, "thirst": +0.6 * q, "health": +0.02, "fatigue": -0.05})


def worship(m, rng: random.Random) -> Effect:
    devotion = 0.06 + 0.05 * rng.random()
    return Effect("Kept a quiet ritual before the sky-console; felt held.",
                  {"sanity": +devotion, "stress": -0.08, "fatigue": -0.02})


def craft(m, rng: random.Random) -> Effect:
    quality = 0.5 + 0.5 * rng.random()                  # crafted-item quality proxy
    return Effect(f"Crafted a tool by hand (quality {quality:.2f}); proud of the work.",
                  {"reputation": +0.04 * quality, "sanity": +0.05, "fatigue": -0.07})


def trade(m, rng: random.Random) -> Effect:
    # Value a staple via the real clearing-price curve; a good deal lifts standing.
    try:
        from underworld.server.services.economy import clearing_price
        margin = clearing_price(1.0, supply=0.8 + 0.4 * rng.random(),
                                demand=0.8 + 0.4 * rng.random()) - 1.0
    except Exception:
        margin = (rng.random() - 0.5) * 0.4
    return Effect(f"Bartered at the market (margin {margin:+.2f}).",
                  {"reputation": +max(-0.02, min(0.05, margin)), "hunger": +0.10, "fatigue": -0.03})


def celebrate(m, rng: random.Random) -> Effect:
    joy = 0.08 + 0.06 * rng.random()
    return Effect("Joined the festival — music, food, and good company.",
                  {"sanity": +joy, "stress": -0.12, "thirst": +0.05, "fatigue": -0.04},
                  neighbour_deltas={"sanity": +0.04, "stress": -0.05})


def heal(m, rng: random.Random) -> Effect:
    mend = 0.10 + 0.10 * rng.random()
    return Effect("Tended wounds and dressed them with care.",
                  {"health": +mend, "stress": -0.06},
                  neighbour_deltas={"health": +0.12, "stress": -0.04})


def mentor(m, rng: random.Random) -> Effect:
    return Effect("Mentored an apprentice; passing on the craft felt like purpose.",
                  {"reputation": +0.03, "sanity": +0.06, "fatigue": -0.04},
                  neighbour_deltas={"sanity": +0.03})


def gene_edit(m, rng: random.Random) -> Effect:
    """Perform a REAL CRISPR edit: unzip a DNA helix, find a PAM-adjacent target,
    cut and edit the sequence. The molecular result (before/after + colour-coded
    helix view) is stored on the Minion's brain for the renderer to show."""
    from underworld.server.services import molecular_genetics as MG

    dna = str(getattr(m, "dna", "") or "")
    if not MG.is_dna(dna) or len(dna) < 30:
        dna = "".join(rng.choice(MG.BASES) for _ in range(60))
    # take a real sample window, find a PAM, derive the on-target guide, then edit
    pams = MG.find_pam_sites(dna)
    guide, sample = None, dna
    for p in pams:
        if p - MG.SPACER_LEN >= 0:
            guide = dna[p - MG.SPACER_LEN:p]
            sample = dna[max(0, p - MG.SPACER_LEN - 4):p + 8]
            break
    if guide is None:                         # no PAM in this genome → engineer one
        sample = "".join(rng.choice(MG.BASES) for _ in range(20)) + "TGG"
        guide = sample[:20]
    choice = rng.random()
    if choice < 0.34:
        res = MG.crispr_edit(sample, guide, delete=3)        # knockout
    elif choice < 0.67:
        res = MG.crispr_edit(sample, guide, insert="ATG")    # knock-in
    else:
        res = MG.crispr_edit(sample, guide)                  # NHEJ frameshift
    melt = MG.denature(sample, temperature=98)               # unzip the helix
    try:
        brain = dict(getattr(m, "brain", None) or {})
        brain["gene_edit"] = {
            "kind": res.kind, "changed": res.changed,
            "on_target_mismatches": res.on_target.mismatches if res.on_target else None,
            "off_targets": len(res.off_targets),
            "helix": MG.helix_view(sample, edit=res),
            "denatured": melt.denatured, "tm_celsius": melt.tm,
        }
        m.brain = brain
    except Exception:
        pass
    verb = {"knockout": "knocked out", "knock_in": "inserted a gene into",
            "replace": "rewrote", "no_cut": "found no PAM site in"}.get(res.kind, "edited")
    return Effect(f"Unzipped a DNA helix and {verb} the sequence with CRISPR-Cas9 "
                  f"({res.off_targets and len(res.off_targets) or 0} off-targets).",
                  {"reputation": +0.05, "sanity": +0.06, "fatigue": -0.06})


_FN = {"forage": forage, "worship": worship, "craft": craft, "trade": trade,
       "celebrate": celebrate, "heal": heal, "mentor": mentor, "gene_edit": gene_edit}

# Actions that act on a neighbour when one is available (target the neediest).
_TARGETED = {"heal", "celebrate", "mentor"}


def perform(action: str, minion, rng: random.Random, *, neighbours=None) -> str:
    """Run one new action, applying its effect (and to a chosen neighbour)."""
    fn = _FN.get(action)
    if fn is None:
        return ""
    eff = fn(minion, rng)
    target = None
    if action in _TARGETED and neighbours:
        if action == "heal":
            target = min(neighbours, key=lambda n: float(getattr(n, "health", 1.0) or 1.0))
        else:
            target = min(neighbours, key=lambda n: float(getattr(n, "sanity", 1.0) or 1.0))
    return apply_effect(minion, eff, target=target)
