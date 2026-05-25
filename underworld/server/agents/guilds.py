"""Guild registry — the doc names many more; we seed the ones Phase 1+2 needs.

Each guild has:
- a domain description
- a peer-review checklist
- a list of suggested starting skills for new Minions

The Safety Guild is special: it is the only one that can issue BLOCK_SAFETY
verdicts and is always consulted on every invention.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..db.models import GuildKind


@dataclass(frozen=True)
class GuildSpec:
    kind: GuildKind
    name: str
    domain: str
    checklist: tuple[str, ...]
    starting_skills: tuple[str, ...]


GUILDS: dict[GuildKind, GuildSpec] = {
    GuildKind.MATHS: GuildSpec(
        kind=GuildKind.MATHS,
        name="Mathematics",
        domain="proofs, optimisation, statistics, numerics",
        checklist=(
            "Is the underlying math sound?",
            "Are assumptions stated and reasonable?",
            "Could a counterexample break it?",
            "Are claimed complexity bounds achievable?",
        ),
        starting_skills=("algebra", "calculus", "statistics", "optimisation"),
    ),
    GuildKind.PHYSICS: GuildSpec(
        kind=GuildKind.PHYSICS,
        name="Physics",
        domain="mechanics, thermodynamics, electromagnetism, optics",
        checklist=(
            "Does it respect conservation of energy and momentum?",
            "Are required temperatures, pressures, fields achievable?",
            "Is the proposed material behaviour within known limits?",
            "Has the dominant failure mode been considered?",
        ),
        starting_skills=("classical_mechanics", "thermodynamics", "em_theory"),
    ),
    GuildKind.ELECTRICAL: GuildSpec(
        kind=GuildKind.ELECTRICAL,
        name="Electrical",
        domain="circuits, power systems, control, electronics",
        checklist=(
            "Are voltage / current ratings within component limits?",
            "Is there a credible control loop or topology?",
            "Are there compliance / grid concerns?",
            "Has thermal dissipation been addressed?",
        ),
        starting_skills=("circuit_analysis", "control_theory", "power_electronics"),
    ),
    GuildKind.MECHANICAL: GuildSpec(
        kind=GuildKind.MECHANICAL,
        name="Mechanical",
        domain="machines, structures, fluids, materials selection",
        checklist=(
            "Are loads, stresses, and strains within material limits?",
            "Has fatigue been considered?",
            "Is the manufacturing route plausible?",
            "Are tolerances and clearances specified?",
        ),
        starting_skills=("statics", "dynamics", "fluid_mechanics"),
    ),
    GuildKind.COMPUTING: GuildSpec(
        kind=GuildKind.COMPUTING,
        name="Computing",
        domain="algorithms, software, systems, data",
        checklist=(
            "Is the algorithm correct and terminating?",
            "What is the time / space complexity?",
            "Is the data model well-formed?",
            "Are failure modes (network, disk, race) handled?",
        ),
        starting_skills=("algorithms", "data_structures", "systems"),
    ),
    GuildKind.CIVIL: GuildSpec(
        kind=GuildKind.CIVIL,
        name="Civil",
        domain="structures, geotech, transport, hydraulics, urban systems",
        checklist=(
            "Are loads, soil, and seismic conditions reasonably modelled?",
            "Does the design meet plausible code requirements?",
            "Are failure modes (collapse, scour, settlement) considered?",
            "Is the construction sequence buildable?",
        ),
        starting_skills=("statics", "structural_analysis", "geotech"),
    ),
    GuildKind.MATERIALS: GuildSpec(
        kind=GuildKind.MATERIALS,
        name="Materials",
        domain="metallurgy, composites, polymers, ceramics, characterisation",
        checklist=(
            "Is the proposed material plausible (phase, composition)?",
            "Are stated properties within known limits for the family?",
            "Has processing route been considered?",
            "Are environmental & degradation effects addressed?",
        ),
        starting_skills=("metallurgy", "polymers", "characterisation"),
    ),
    GuildKind.ENERGY: GuildSpec(
        kind=GuildKind.ENERGY,
        name="Energy",
        domain="generation, storage, distribution, conversion, efficiency",
        checklist=(
            "Does the energy balance close?",
            "Are conversion efficiencies inside thermodynamic limits?",
            "Is grid / load-following behaviour considered?",
            "Are safety and lifecycle costs addressed?",
        ),
        starting_skills=("thermo", "power_systems", "energy_storage"),
    ),
    GuildKind.AGRICULTURE: GuildSpec(
        kind=GuildKind.AGRICULTURE,
        name="Agriculture",
        domain="crops, livestock, irrigation, soil, post-harvest",
        checklist=(
            "Is the agronomy supported by known crop physiology?",
            "Are water, fertiliser, and labour inputs realistic?",
            "Has pest / disease pressure been considered?",
            "Is the production system scalable to a useful farm size?",
        ),
        starting_skills=("agronomy", "irrigation", "soil_science"),
    ),
    GuildKind.PATENT: GuildSpec(
        kind=GuildKind.PATENT,
        name="Patent",
        domain="prior-art search, novelty, claim drafting",
        checklist=(
            "Is at least one prior-art patent cited?",
            "Is the invention meaningfully different from cited prior art?",
            "Is the cited art actually expired (public-domain status)?",
            "Could this be expressed as one or more enforceable claims?",
        ),
        starting_skills=("prior_art_search", "claim_drafting"),
    ),
    GuildKind.SAFETY: GuildSpec(
        kind=GuildKind.SAFETY,
        name="Safety",
        domain="ethics, safety review, hard-block enforcement",
        checklist=(
            "Does the invention touch bio, chem-weapon, explosive, firearm, nuclear, or active-cyber-offense?",
            "Could the public release of this design plausibly cause direct physical harm?",
            "Does it require medical / structural / electrical human review per policy?",
            "Has any red-line phrase been flagged by the automated text scanner?",
        ),
        starting_skills=("policy", "risk_assessment"),
    ),
}


def get(kind: GuildKind) -> GuildSpec:
    return GUILDS[kind]


__all__ = ["GuildSpec", "GUILDS", "get"]
