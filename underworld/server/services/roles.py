"""Swarm-role assignment + project domain detection.

Roles derive from a Minion's guild + DNA aptitude profile. The mapping is
calibrated so that:
- Safety guild members are always Toxicity Checkers.
- Patent guild members lean Literature Scout / Regulatory Reasoner.
- Maths guild members tend to Formula Oracle.
- Computing guild members lean Genome Analyst / Trial Simulator.
- Materials guild members lean Chemistry Generator / Protein Modeller.
- Physics guild members lean Experimental Designer.
- Anyone else is a Generalist unless their DNA gives a strong signal.

Domain detection scans invention / project text for tokens that move them
into a regulated pipeline (clinical, genetic, or chem-synthesis). This is
the bridge between an open-ended creative idea and the validation pipeline
described in Master Reference Section 8.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ..db.models import GuildKind, SwarmRoleKind
from ..genetics import dna as dna_mod


# Cheap regex-based domain detector. The intent is to *flag*, not to censor —
# the safety module is the censor; this module decides whether a project
# needs the longer validation pipeline.

_CLINICAL_PATTERNS = (
    r"\bclinical\b", r"\bpatient(s)?\b", r"\btrial(s)?\b", r"\bdosing\b",
    r"\bdose[- ]response\b", r"\bdrug\b", r"\btherapy\b", r"\btreatment\b",
    r"\bdisease\b", r"\bcure\b", r"\bvaccine\b", r"\bclinical[- ]trial\b",
)
_GENETIC_PATTERNS = (
    r"\bcrispr\b", r"\bcas9\b", r"\bcas12\b", r"\bgene[- ]?(editing|therapy)?\b",
    r"\bgenome\b", r"\brna\b", r"\bdna\b", r"\bgrna\b", r"\bguide rna\b",
    r"\bsplice?\b", r"\bsplicing\b", r"\bvariant(s)?\b", r"\ballele(s)?\b",
)
_CHEM_SYNTH_PATTERNS = (
    # `synthesis` / `synthesise` only — the verb 'compound' is a noun-trap.
    r"\bsynthesis\b", r"\bsynthesi[sz]e[sd]?\b", r"\bsynthesi[sz]ation\b",
    r"\breagent\b", r"\bcatalyst\b", r"\bsolvent\b",
    r"\bmolecule\b", r"\bligand\b",
    # `organic compound` / `inorganic compound` are unambiguous chemistry.
    r"\b(organic|inorganic)\s+(compound|chemistry|molecule|polymer)\b",
)


@dataclass(frozen=True)
class DomainFlags:
    clinical: bool
    genetic: bool
    chem_synth: bool

    @property
    def any(self) -> bool:
        return self.clinical or self.genetic or self.chem_synth


def _any_match(text: str, patterns: tuple[str, ...]) -> bool:
    if not text:
        return False
    for p in patterns:
        if re.search(p, text, re.IGNORECASE):
            return True
    return False


def detect_domain(*texts: str) -> DomainFlags:
    """Inspect free-form text and return regulatory-relevant domain flags."""
    blob = " ".join(t for t in texts if t)
    return DomainFlags(
        clinical=_any_match(blob, _CLINICAL_PATTERNS),
        genetic=_any_match(blob, _GENETIC_PATTERNS),
        chem_synth=_any_match(blob, _CHEM_SYNTH_PATTERNS),
    )


# Guild → default role distribution. Each entry lists (role, weight).
# At assignment time we add the DNA aptitude into the weight.

_GUILD_ROLE_BIAS: dict[GuildKind, tuple[tuple[SwarmRoleKind, float], ...]] = {
    GuildKind.SAFETY: ((SwarmRoleKind.TOXICITY_CHECKER, 1.0),),
    GuildKind.PATENT: (
        (SwarmRoleKind.LITERATURE_SCOUT, 0.55),
        (SwarmRoleKind.REGULATORY_REASONER, 0.45),
    ),
    GuildKind.MATHS: (
        (SwarmRoleKind.FORMULA_ORACLE, 0.65),
        (SwarmRoleKind.TRIAL_SIMULATOR, 0.35),
    ),
    GuildKind.COMPUTING: (
        (SwarmRoleKind.GENOME_ANALYST, 0.40),
        (SwarmRoleKind.TRIAL_SIMULATOR, 0.40),
        (SwarmRoleKind.GENERALIST, 0.20),
    ),
    GuildKind.MATERIALS: (
        (SwarmRoleKind.CHEMISTRY_GENERATOR, 0.55),
        (SwarmRoleKind.PROTEIN_MODELLER, 0.45),
    ),
    GuildKind.PHYSICS: (
        (SwarmRoleKind.EXPERIMENTAL_DESIGNER, 0.50),
        (SwarmRoleKind.FORMULA_ORACLE, 0.30),
        (SwarmRoleKind.GENERALIST, 0.20),
    ),
    GuildKind.ELECTRICAL: ((SwarmRoleKind.EXPERIMENTAL_DESIGNER, 0.6), (SwarmRoleKind.GENERALIST, 0.4)),
    GuildKind.MECHANICAL: ((SwarmRoleKind.EXPERIMENTAL_DESIGNER, 0.6), (SwarmRoleKind.GENERALIST, 0.4)),
    GuildKind.CIVIL: ((SwarmRoleKind.EXPERIMENTAL_DESIGNER, 0.5), (SwarmRoleKind.GENERALIST, 0.5)),
    GuildKind.ENERGY: ((SwarmRoleKind.EXPERIMENTAL_DESIGNER, 0.5), (SwarmRoleKind.CHEMISTRY_GENERATOR, 0.5)),
    GuildKind.AGRICULTURE: ((SwarmRoleKind.GENOME_ANALYST, 0.4), (SwarmRoleKind.GENERALIST, 0.6)),
}


def assign_role(guild: GuildKind, dna: str) -> SwarmRoleKind:
    """Pick a swarm role for a freshly-spawned Minion.

    Combines the guild's role bias table with a tie-breaker derived from
    DNA traits (creativity boosts generators, intelligence boosts analysts).
    """
    bias = _GUILD_ROLE_BIAS.get(guild) or ((SwarmRoleKind.GENERALIST, 1.0),)
    intelligence = dna_mod.trait(dna, "intelligence")
    creativity = dna_mod.trait(dna, "creativity")
    conscientiousness = dna_mod.trait(dna, "conscientiousness")

    boost = {
        SwarmRoleKind.GENOME_ANALYST: 0.3 * intelligence,
        SwarmRoleKind.TRIAL_SIMULATOR: 0.3 * intelligence,
        SwarmRoleKind.CHEMISTRY_GENERATOR: 0.3 * creativity,
        SwarmRoleKind.PROTEIN_MODELLER: 0.2 * creativity + 0.1 * intelligence,
        SwarmRoleKind.LITERATURE_SCOUT: 0.2 * conscientiousness,
        SwarmRoleKind.REGULATORY_REASONER: 0.3 * conscientiousness,
        SwarmRoleKind.FORMULA_ORACLE: 0.3 * intelligence,
        SwarmRoleKind.EXPERIMENTAL_DESIGNER: 0.2 * conscientiousness + 0.1 * intelligence,
        SwarmRoleKind.TOXICITY_CHECKER: 0.2 * conscientiousness,
        SwarmRoleKind.GENERALIST: 0.0,
    }

    weighted = [(role, w + boost.get(role, 0.0)) for role, w in bias]
    return max(weighted, key=lambda kv: kv[1])[0]


# Quick lookup: which role advances which project stage?
ROLE_FOR_STAGE: dict[str, SwarmRoleKind] = {
    "hypothesis": SwarmRoleKind.LITERATURE_SCOUT,
    "in_silico": SwarmRoleKind.TRIAL_SIMULATOR,
    "bench_plan": SwarmRoleKind.EXPERIMENTAL_DESIGNER,
    "preclinical_plan": SwarmRoleKind.TOXICITY_CHECKER,
    "clinical_plan": SwarmRoleKind.REGULATORY_REASONER,
    "regulatory_review": SwarmRoleKind.REGULATORY_REASONER,
}


__all__ = [
    "DomainFlags",
    "detect_domain",
    "assign_role",
    "ROLE_FOR_STAGE",
]
