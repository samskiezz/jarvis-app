"""Patent Intelligence Engine — the analysis layer over raw patent records.

Doc reference: section #4 "Patent Intelligence Engine" and the hardest-problem
#3 "claims parser + dependency extractor". `patent_search.py` (and the new
`open_data_portal.py`) fetch *records*; this module turns a record into the
things the simulation actually needs:

  - a parsed claim tree (independent vs dependent + dependency refs),
  - the materials / skills / principles a build truly requires,
  - the comprehension prerequisites that feed the knowledge_graph gate (#4),
  - a multi-axis patent quality score, and
  - a playable "artifact" translation (visible object + reliability + failures).

Everything here is a pure function over a `PatentRecord`-like mapping — no DB,
no LLM, no network. That mirrors the storage-agnostic, fully-unit-testable
core in `services/knowledge_graph.py`, so the same record can be analysed
identically whether it came from PatentsView, the Open Data Portal, or the
embedded offline corpus.

A record is anything with `id`, `title`, `abstract`, `cpc_class` keys — a
`PatentRecord` dataclass works via `dataclasses.asdict`, and so does a plain
dict, which is what the rest of the engine passes around.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Mapping


# ── record access ────────────────────────────────────────────────────────────
# Callers pass either a PatentRecord (dataclass) or a plain dict. We read the
# four fields we care about through one tolerant accessor so both work.
def _field(patent: Any, name: str, default: Any = "") -> Any:
    if isinstance(patent, Mapping):
        val = patent.get(name, default)
    else:
        val = getattr(patent, name, default)
    return default if val is None else val


def _text(patent: Any) -> str:
    """Lower-cased title + abstract — the heuristic search surface."""
    return (str(_field(patent, "title")) + " " + str(_field(patent, "abstract"))).lower()


def _cpc(patent: Any) -> str:
    return str(_field(patent, "cpc_class", "")).strip().upper().replace(" ", "")


# ── #3 (hardest) Claims parser + dependency extractor ────────────────────────
class ClaimKind(str, Enum):
    INDEPENDENT = "independent"
    DEPENDENT = "dependent"


@dataclass(frozen=True)
class Claim:
    number: int
    kind: ClaimKind
    text: str
    depends_on: tuple[int, ...]


# Claim N usually opens a line/segment with its number; we split on leading
# integers that begin a claim. "1." / "1)" / "Claim 1." / a bare "1 " all occur.
_CLAIM_HEAD = re.compile(
    r"(?:^|\n|\.\s+)\s*(?:claim\s+)?(\d{1,3})\s*[\.\):\-]?\s+",
    re.IGNORECASE,
)

# Dependency phrases: "as in claim 1", "of claims 1 to 3", "according to any of
# claims 1, 2 and 5", "the apparatus of claim 4". We capture the whole numeric
# tail after the trigger word and expand ranges / lists.
_DEP_TRIGGER = re.compile(
    r"\b(?:as\s+(?:in|recited\s+in|claimed\s+in)|of|according\s+to|in)\s+"
    r"(?:any\s+(?:one\s+)?of\s+)?claims?\s+([0-9,\s\-toand]+)",
    re.IGNORECASE,
)


def _expand_refs(tail: str) -> tuple[int, ...]:
    """Turn '1, 2 and 5' or '1 to 3' into (1,2,5) / (1,2,3)."""
    refs: set[int] = set()
    # Range form first: "1 to 3" or "1-3".
    for a, b in re.findall(r"(\d+)\s*(?:to|\-)\s*(\d+)", tail):
        lo, hi = int(a), int(b)
        if lo <= hi:
            refs.update(range(lo, hi + 1))
    # Then any remaining standalone numbers (covers list form + range endpoints).
    for n in re.findall(r"\d+", tail):
        refs.add(int(n))
    return tuple(sorted(refs))


def parse_claims(claims_text: str) -> list[dict]:
    """Split a patent's claims block into structured claims.

    Returns a list of dicts: ``{number, kind, text, depends_on}``. A claim is
    *dependent* when its body references one or more other claims ("as in claim
    1"); the referenced numbers land in ``depends_on``. Otherwise it is
    *independent* (``depends_on == []``).

    This is the spec's hardest sub-problem: real claim language is messy, so we
    parse defensively and never raise on malformed input — worst case a claim
    falls back to independent.
    """
    if not claims_text or not claims_text.strip():
        return []

    # Locate every claim head and slice the text between consecutive heads.
    heads = list(_CLAIM_HEAD.finditer(claims_text))
    claims: list[Claim] = []
    seen: set[int] = set()
    for i, m in enumerate(heads):
        number = int(m.group(1))
        # Guard against picking up a number that is itself a dependency ref of a
        # claim we already started (e.g. ". 1 to 3" inside a body). We accept a
        # head only if its number is monotonically the next unseen claim.
        if number in seen:
            continue
        start = m.end()
        end = heads[i + 1].start() if i + 1 < len(heads) else len(claims_text)
        body = claims_text[start:end].strip()
        if not body:
            continue
        seen.add(number)

        refs: set[int] = set()
        for dm in _DEP_TRIGGER.finditer(body):
            for r in _expand_refs(dm.group(1)):
                if r != number:  # a claim never depends on itself
                    refs.add(r)
        kind = ClaimKind.DEPENDENT if refs else ClaimKind.INDEPENDENT
        claims.append(
            Claim(number=number, kind=kind, text=body, depends_on=tuple(sorted(refs)))
        )

    claims.sort(key=lambda c: c.number)
    return [
        {
            "number": c.number,
            "kind": c.kind.value,
            "text": c.text,
            "depends_on": list(c.depends_on),
        }
        for c in claims
    ]


# ── #4 requirement inference ─────────────────────────────────────────────────
# Heuristic CPC-subclass → engineering-requirement map. Keys are matched as
# prefixes against the normalised CPC code, longest-prefix wins. Kept within the
# safe allow-list domains (B/E/F/G/H); blocked sections never reach here.
@dataclass(frozen=True)
class _DomainProfile:
    label: str
    materials: tuple[str, ...]
    skills: tuple[str, ...]
    principles: tuple[str, ...]
    difficulty: float          # base manufacturing_difficulty 0..1
    safety_risks: tuple[str, ...]


_CPC_PROFILES: dict[str, _DomainProfile] = {
    "H01L": _DomainProfile(
        "semiconductors",
        ("ultrapure silicon", "photoresist", "dopant gases", "high-purity copper"),
        ("photolithography", "thin-film deposition", "cleanroom processing"),
        ("quantum band theory", "semiconductor physics", "diffusion"),
        0.95,
        ("toxic dopant gases", "hydrofluoric acid handling"),
    ),
    "H01": _DomainProfile(
        "electrical components",
        ("copper", "insulating polymer", "ferrite"),
        ("circuit assembly", "soldering"),
        ("electromagnetism", "ohmic conduction"),
        0.55,
        ("high voltage",),
    ),
    "H04": _DomainProfile(
        "telecom / signalling",
        ("copper wire", "printed circuit board"),
        ("signal processing", "electronics assembly"),
        ("electromagnetism", "information theory"),
        0.5,
        (),
    ),
    "G11B": _DomainProfile(
        "data storage media",
        ("substrate glass", "reflective metal film", "chalcogenide glass"),
        ("thin-film deposition", "precision optics alignment"),
        ("optics", "phase-change physics"),
        0.7,
        (),
    ),
    "G02": _DomainProfile(
        "optics",
        ("optical glass", "anti-reflective coating"),
        ("lens grinding", "optical alignment"),
        ("geometric optics", "refraction"),
        0.5,
        (),
    ),
    "G06": _DomainProfile(
        "computing",
        ("silicon logic", "printed circuit board"),
        ("digital logic design", "programming"),
        ("boolean algebra", "computation theory"),
        0.6,
        (),
    ),
    "B01D": _DomainProfile(
        "separation processes",
        ("corrosion-resistant steel", "filter media"),
        ("fluid mechanics design", "metal fabrication"),
        ("fluid dynamics", "centrifugal separation"),
        0.45,
        ("pressurised vessels",),
    ),
    "B62": _DomainProfile(
        "land vehicles",
        ("steel", "ball bearings", "rubber"),
        ("machining", "mechanical assembly"),
        ("newtonian mechanics", "friction"),
        0.3,
        (),
    ),
    "B": _DomainProfile(
        "performing operations / transport",
        ("steel", "fasteners"),
        ("machining", "mechanical assembly"),
        ("newtonian mechanics",),
        0.35,
        (),
    ),
    "E04": _DomainProfile(
        "building construction",
        ("structural steel", "tensioned cable", "concrete"),
        ("structural engineering", "rigging"),
        ("statics", "tensile mechanics"),
        0.5,
        ("structural collapse",),
    ),
    "E": _DomainProfile(
        "civil / mining",
        ("structural steel", "concrete"),
        ("structural engineering",),
        ("statics",),
        0.45,
        ("structural collapse",),
    ),
    "F": _DomainProfile(
        "mechanical engineering",
        ("steel", "lubricant", "fasteners"),
        ("machining", "thermodynamic design"),
        ("thermodynamics", "newtonian mechanics"),
        0.4,
        (),
    ),
    "G": _DomainProfile(
        "physics / instruments",
        ("precision metal", "calibrated components"),
        ("precision measurement", "instrument assembly"),
        ("metrology", "physics"),
        0.45,
        (),
    ),
    "H": _DomainProfile(
        "electricity",
        ("copper", "insulator"),
        ("electronics assembly",),
        ("electromagnetism",),
        0.5,
        ("electrical shock",),
    ),
}

# Keyword fallbacks add detail the CPC prefix alone can miss.
_KEYWORD_HINTS: tuple[tuple[str, tuple[str, ...], tuple[str, ...], tuple[str, ...]], ...] = (
    # keyword,            extra_materials,            extra_skills,        extra_principles
    ("laser", ("laser diode", "optical cavity"), ("optical alignment",), ("stimulated emission",)),
    ("semiconductor", ("ultrapure silicon",), ("photolithography",), ("semiconductor physics",)),
    ("led", ("gallium compound semiconductor",), ("epitaxy",), ("electroluminescence",)),
    ("diode", ("doped semiconductor",), ("junction fabrication",), ("pn-junction physics",)),
    ("lithograph", ("photoresist",), ("photolithography",), ()),
    ("battery", ("electrolyte", "electrode metal"), ("electrochemical assembly",), ("electrochemistry",)),
    ("optical", ("optical glass",), ("optical alignment",), ("optics",)),
    ("bearing", ("hardened steel", "ball bearings"), ("precision machining",), ("tribology",)),
    ("centrifug", ("balanced rotor",), ("rotational balancing",), ("centrifugal force",)),
    ("canopy", ("tensioned cable",), ("rigging",), ("tensile mechanics",)),
)


def _profile_for(cpc: str) -> _DomainProfile | None:
    """Longest-prefix match against the CPC profile table."""
    best: _DomainProfile | None = None
    best_len = -1
    for prefix, prof in _CPC_PROFILES.items():
        if cpc.startswith(prefix) and len(prefix) > best_len:
            best, best_len = prof, len(prefix)
    return best


def extract_requirements(patent: Any) -> dict:
    """Infer what building this patent actually demands.

    Returns ``{required_materials, skills, scientific_principles,
    manufacturing_difficulty (0..1), safety_risks}``. Inference is heuristic:
    a CPC-subclass profile provides the base, and title/abstract keywords layer
    on specifics (e.g. an H01L semiconductor patent yields 'ultrapure silicon'
    and 'photolithography').
    """
    cpc = _cpc(patent)
    text = _text(patent)

    materials: list[str] = []
    skills: list[str] = []
    principles: list[str] = []
    risks: list[str] = []
    difficulty = 0.3  # generic baseline for an unknown mechanical-ish gadget

    prof = _profile_for(cpc)
    if prof is not None:
        materials.extend(prof.materials)
        skills.extend(prof.skills)
        principles.extend(prof.principles)
        risks.extend(prof.safety_risks)
        difficulty = prof.difficulty

    for kw, mats, sks, prins in _KEYWORD_HINTS:
        if kw in text:
            materials.extend(mats)
            skills.extend(sks)
            principles.extend(prins)

    # Difficulty nudges from complexity-signalling vocabulary.
    if any(w in text for w in ("nanometer", "nanoscale", "ultrapure", "quantum")):
        difficulty = min(1.0, difficulty + 0.15)
    if any(w in text for w in ("simple", "manual", "hand-operated")):
        difficulty = max(0.0, difficulty - 0.1)

    return {
        "required_materials": _dedupe(materials),
        "skills": _dedupe(skills),
        "scientific_principles": _dedupe(principles),
        "manufacturing_difficulty": round(difficulty, 2),
        "safety_risks": _dedupe(risks),
    }


def _dedupe(seq: list[str]) -> list[str]:
    """Order-preserving de-duplication."""
    out: list[str] = []
    seen: set[str] = set()
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


# ── #4 comprehension prerequisites (feeds knowledge_graph gate) ──────────────
def _slug(text: str) -> str:
    """Turn a human label into a stable node-id-like token."""
    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return s or "unknown"


def comprehension_prerequisites(patent: Any) -> list[str]:
    """Node-id-like strings a Minion must already KNOW to truly build this.

    These are the upstream nodes the `KnowledgeGraph.can_comprehend` gate (#4)
    checks: scanning a patent yields the object, but comprehension needs every
    principle / material / skill present. Ids are namespaced
    (``principle:...`` / ``material:...`` / ``skill:...``) so a hydrator can
    map them onto real graph nodes.
    """
    req = extract_requirements(patent)
    prereqs: list[str] = []
    for p in req["scientific_principles"]:
        prereqs.append("principle:" + _slug(p))
    for m in req["required_materials"]:
        prereqs.append("material:" + _slug(m))
    for s in req["skills"]:
        prereqs.append("skill:" + _slug(s))
    return _dedupe(prereqs)


# ── #4 patent quality scoring ────────────────────────────────────────────────
_PRACTICAL_WORDS = ("apparatus", "method", "device", "system", "process", "machine", "structure")
_VAGUE_WORDS = ("various", "etc", "and/or", "or the like", "one or more", "plurality")
_COMMERCIAL_WORDS = ("display", "vehicle", "storage", "engine", "tool", "circuit", "sensor", "motor")


def quality_score(patent: Any) -> dict:
    """Multi-axis patent quality score, each axis in [0, 1] plus an overall.

    Axes (the spec's scoring): ``practical_value``, ``manufacturability``,
    ``novelty_proxy``, ``clarity``, ``dependency_burden``,
    ``commercial_relevance``. ``overall`` is their weighted mean. All heuristic
    and deterministic so it is unit-testable and reproducible.
    """
    text = _text(patent)
    title = str(_field(patent, "title")).strip()
    abstract = str(_field(patent, "abstract")).strip()
    req = extract_requirements(patent)

    # practical_value: does it describe a concrete buildable artefact?
    practical_value = 0.3 + 0.1 * sum(1 for w in _PRACTICAL_WORDS if w in text)
    practical_value = _clamp(practical_value)

    # manufacturability: inverse of inferred manufacturing difficulty.
    manufacturability = _clamp(1.0 - req["manufacturing_difficulty"])

    # novelty_proxy: richer principle spread reads as a more inventive step;
    # de-rated when the abstract leans on vague boilerplate.
    novelty_proxy = _clamp(
        0.2
        + 0.12 * len(req["scientific_principles"])
        - 0.08 * sum(1 for w in _VAGUE_WORDS if w in text)
    )

    # clarity: penalise vagueness, reward a present, reasonably-sized abstract.
    vague = sum(1 for w in _VAGUE_WORDS if w in text)
    clarity = 0.85 - 0.12 * vague
    if not abstract:
        clarity -= 0.4
    elif len(abstract) < 40:
        clarity -= 0.15
    clarity = _clamp(clarity)

    # dependency_burden: how much scaffolding the build presupposes (more
    # prereqs => higher burden). Expressed 0..1 where high == heavy.
    n_prereq = len(comprehension_prerequisites(patent))
    dependency_burden = _clamp(n_prereq / 12.0)

    # commercial_relevance: domain vocabulary that maps to a usable product.
    commercial_relevance = _clamp(
        0.25 + 0.15 * sum(1 for w in _COMMERCIAL_WORDS if w in text)
    )

    # Overall: practical value and manufacturability dominate; high dependency
    # burden subtracts.
    overall = _clamp(
        0.28 * practical_value
        + 0.22 * manufacturability
        + 0.18 * novelty_proxy
        + 0.14 * clarity
        + 0.18 * commercial_relevance
        - 0.10 * dependency_burden
    )

    return {
        "practical_value": round(practical_value, 3),
        "manufacturability": round(manufacturability, 3),
        "novelty_proxy": round(novelty_proxy, 3),
        "clarity": round(clarity, 3),
        "dependency_burden": round(dependency_burden, 3),
        "commercial_relevance": round(commercial_relevance, 3),
        "overall": round(overall, 3),
    }


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


# ── #4 game translation: patent → playable artifact ──────────────────────────
def to_artifact(patent: Any) -> dict:
    """Translate a patent into a playable, visible game artifact.

    Returns a dict with everything the simulation needs to render and craft the
    object: ``name``, ``patent_id``, ``required_materials``, ``required_tools``,
    ``required_knowledge`` (the comprehension prereq ids), an ``energy`` cost,
    a ``prototype_reliability`` in [0, 1], and concrete ``failure_modes``.
    """
    req = extract_requirements(patent)
    quality = quality_score(patent)
    difficulty = req["manufacturing_difficulty"]

    # Skills become the tools/workstations the bench must provide.
    tools = _dedupe([_skill_to_tool(s) for s in req["skills"]]) or ["basic workbench"]

    # Energy scales with difficulty; harder builds burn more of it.
    energy = round(10.0 + 90.0 * difficulty, 1)

    # A first prototype is unreliable in proportion to difficulty, lifted a
    # little by how manufacturable + clear the patent is.
    prototype_reliability = _clamp(
        (1.0 - difficulty) * 0.7
        + 0.2 * quality["manufacturability"]
        + 0.1 * quality["clarity"]
    )

    failure_modes = _failure_modes(req, difficulty)

    return {
        "name": str(_field(patent, "title")) or "unnamed artifact",
        "patent_id": str(_field(patent, "id", "")),
        "required_materials": list(req["required_materials"]),
        "required_tools": tools,
        "required_knowledge": comprehension_prerequisites(patent),
        "energy": energy,
        "prototype_reliability": round(prototype_reliability, 3),
        "failure_modes": failure_modes,
    }


def _skill_to_tool(skill: str) -> str:
    """Map a required skill onto the bench/tool that exercises it."""
    table = {
        "photolithography": "lithography stepper",
        "thin-film deposition": "deposition chamber",
        "cleanroom processing": "cleanroom",
        "machining": "machine lathe",
        "soldering": "soldering iron",
        "electronics assembly": "electronics bench",
        "circuit assembly": "electronics bench",
        "lens grinding": "optical grinder",
        "optical alignment": "optical bench",
        "metal fabrication": "metal forge",
        "rigging": "rigging gear",
        "epitaxy": "epitaxy reactor",
    }
    return table.get(skill, skill + " station")


def _failure_modes(req: dict, difficulty: float) -> list[str]:
    """Concrete ways a prototype of this artifact tends to fail."""
    modes: list[str] = []
    if difficulty >= 0.8:
        modes.append("contamination ruins the yield")
    if difficulty >= 0.5:
        modes.append("tolerances out of spec")
    if "high voltage" in req["safety_risks"] or "electrical shock" in req["safety_risks"]:
        modes.append("short circuit / burnout")
    if "structural collapse" in req["safety_risks"]:
        modes.append("structural failure under load")
    if not modes:
        modes.append("misassembly")
    modes.append("missing prerequisite knowledge")
    return _dedupe(modes)


__all__ = [
    "Claim",
    "ClaimKind",
    "parse_claims",
    "extract_requirements",
    "comprehension_prerequisites",
    "quality_score",
    "to_artifact",
]
