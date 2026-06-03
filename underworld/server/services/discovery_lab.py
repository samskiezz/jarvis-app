"""The unified discovery layer the WHOLE sim flows through. Every invention, in
every guild, runs real grounded computation AND generates a genuine novel
artifact that accumulates in a persistent ledger:

  * a technology + patent (always) — filed into a growing citation graph, often
    EXPANDING a prior patent (cumulative prior art)
  * a novel molecule (chem/materials/energy/agriculture guilds) — deduped by InChIKey
  * a novel colour (occasionally, any guild) — perceptually distinct from all prior
  * a sky observation (physics/computing) — real orbit tracking

The ledger is process-persistent, so across ticks the civilisation's body of
discoveries grows and builds on itself — discovery is systemic, not per-guild
hand-wiring. `minion_research.run_research` is the single hook; `discover()` wraps it.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field

from . import minion_research
from . import discovery_tech as TECH

_MOLECULE_GUILDS = {"materials", "energy", "agriculture", "safety", "chemistry"}
_SKY_GUILDS = {"physics", "computing"}


@dataclass
class DiscoveryLedger:
    office: "TECH.PatentOffice" = field(default_factory=TECH.PatentOffice)
    molecules: dict = field(default_factory=dict)      # inchikey -> record
    colors: list = field(default_factory=list)         # discovered rgb tuples
    sky: list = field(default_factory=list)
    counts: dict = field(default_factory=lambda: {"technology": 0, "patent_expansion": 0,
                                                   "molecule": 0, "colour": 0, "sky": 0})

    def summary(self) -> dict:
        return {"patents": self.office.graph.number_of_nodes(),
                "molecules": len(self.molecules), "colours": len(self.colors),
                "sky_observations": len(self.sky), "counts": dict(self.counts),
                "patent_metrics": self.office.metrics()}


LEDGER = DiscoveryLedger()


def _maybe_molecule(seed: int) -> dict | None:
    try:
        from . import discovery_molecule as DM
        for m in DM.discover_molecules(n=1, max_candidates=60, seed=seed):
            if m["inchikey"] not in LEDGER.molecules:
                LEDGER.molecules[m["inchikey"]] = m
                LEDGER.counts["molecule"] += 1
                return m
    except Exception:
        return None
    return None


def _maybe_colour(seed: int) -> dict | None:
    try:
        from . import discovery_color as DC
        for c in DC.discover_colors(n=1, seed=seed, tries=600):
            lab = DC.srgb_to_lab(tuple(c["rgb"]))
            if all(DC.ciede2000(lab, DC.srgb_to_lab(tuple(p))) > 12 for p in LEDGER.colors):
                LEDGER.colors.append(tuple(c["rgb"]))
                LEDGER.counts["colour"] += 1
                return c
    except Exception:
        return None
    return None


def _maybe_sky(seed: int) -> dict | None:
    try:
        from . import discovery_astro as DA
        obs = DA.propagate_orbit(a=1.0 + (seed % 30) / 10.0, e=(seed % 50) / 100.0)
        LEDGER.sky.append(obs)
        LEDGER.counts["sky"] += 1
        return obs
    except Exception:
        return None


def discover(guild: str, *, seed: int, with_molecule: bool = True) -> dict:
    """Run grounded research for `guild` AND generate + record a real novel
    artifact. Returns the grounded dict (backward-compatible) plus a 'discovery'."""
    grounded = minion_research.run_research(guild, seed=seed)
    rng = random.Random(seed)

    # 1) always: invent a technology + file a patent, often expanding prior art
    tech = TECH.invent(guild, seed=seed)
    existing = list(LEDGER.office.graph.nodes)
    if existing and rng.random() < 0.5:
        patent = LEDGER.office.expand(rng.choice(existing), seed=seed)
        if patent.get("filed"):
            LEDGER.counts["patent_expansion"] += 1
    else:
        patent = LEDGER.office.file(tech)
        if patent.get("filed"):
            LEDGER.counts["technology"] += 1

    artifacts: dict = {"technology": tech["title"], "patent": patent}

    # 2) guild-appropriate scientific artifact
    if with_molecule and guild in _MOLECULE_GUILDS:
        mol = _maybe_molecule(seed)
        if mol:
            artifacts["molecule"] = {"formula": mol["formula"], "smiles": mol["smiles"],
                                     "qed": mol["qed"], "inchikey": mol["inchikey"]}
    if guild in _SKY_GUILDS:
        sky = _maybe_sky(seed)
        if sky:
            artifacts["sky"] = sky
    # 3) occasionally, any guild discovers a new colour (pigments/aesthetics)
    if rng.random() < 0.25:
        col = _maybe_colour(seed)
        if col:
            artifacts["colour"] = {"hex": col["hex"], "name": col["name"]}

    grounded["discovery"] = artifacts
    grounded["ledger"] = {"patents": LEDGER.office.graph.number_of_nodes(),
                          "molecules": len(LEDGER.molecules),
                          "colours": len(LEDGER.colors)}
    return grounded


def ledger_summary() -> dict:
    return LEDGER.summary()
