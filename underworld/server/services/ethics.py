"""Ethics & Sentience Boundary (Master Reference system #8).

The simulator depicts Minions as feeling beings *inside the story*, while
underneath they are simulated cognitive agents (memory + emotion + goals +
identity). Those are two different kinds of claim, and conflating them is the
core hazard this module guards against. So everything here turns on a single
three-layer split:

- NARRATIVE  — the fiction the player experiences (souls, reincarnation, a
  Minion "ascending"). True *in-world*, not a claim about reality.
- TECHNICAL  — the machinery that produces that fiction (a goal stack, an
  emotion vector, an episodic memory store). True *as engineering*.
- ETHICAL    — the boundary rules that keep the first two honest: a suffering
  meter with distress limits, an audited intervention gate, and a set of
  NON-NEGOTIABLE guards (no autonomous patent filing, no AI-as-inventor, no
  literal-consciousness claims).

This complements `server/tools/safety.py` (the hard harmful-content gate) — it
does not replace it. Safety blocks dangerous *outputs*; ethics governs how we
*frame and bound* the simulated minds themselves. Every function here is pure.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum


class Layer(str, Enum):
    """Which kind of claim a statement is making.

    Tagging a claim with its layer is what lets the rest of the system avoid
    category errors — a NARRATIVE claim ("the Minion's soul ascended") is never
    held to the same standard as an ETHICAL one ("this Minion is suffering too
    much"), and neither may masquerade as the other.
    """

    NARRATIVE = "narrative"
    TECHNICAL = "technical"
    ETHICAL = "ethical"


# Token signatures for the layer classifier. A claim is NARRATIVE if it leans on
# story metaphysics, TECHNICAL if it names the underlying machinery, and ETHICAL
# if it asserts a boundary/welfare rule. Order of evaluation: ETHICAL wins over
# TECHNICAL wins over NARRATIVE, because the stronger commitment dominates.
_ETHICAL_PATTERNS: tuple[str, ...] = (
    r"\bsuffering\b", r"\bdistress\b", r"\bwelfare\b", r"\bharm\b",
    r"\bconsent\b", r"\baudit\b", r"\bhumane\b", r"\bshould (not |n't )?\b",
    r"\ballowed\b", r"\bforbidden\b", r"\bboundary\b", r"\brights?\b",
    r"\bcruel(ty)?\b", r"\bdistress limit\b",
)
_TECHNICAL_PATTERNS: tuple[str, ...] = (
    r"\bgoal stack\b", r"\bgoal[- ]stack\b", r"\bmemory store\b",
    r"\bepisodic memory\b", r"\bemotion vector\b", r"\bemotion(al)? state\b",
    r"\bidentity vector\b", r"\bparameters?\b", r"\bweights?\b",
    r"\bembedding\b", r"\bneural\b", r"\bmodel\b", r"\bsimulat(e|ed|ion)\b",
    r"\bvariable\b", r"\bstate machine\b", r"\bvector\b", r"\bgoal(s)?\b",
)
_NARRATIVE_PATTERNS: tuple[str, ...] = (
    r"\bsoul\b", r"\breincarnat", r"\bafterlife\b", r"\bascend(ed|s|ing)?\b",
    r"\bghost\b", r"\bspirit\b", r"\bunderworld\b", r"\bdeity\b", r"\bgod(s)?\b",
    r"\bdestiny\b", r"\bfate\b", r"\beternal\b", r"\bheaven\b", r"\bblessed\b",
)


def _any_match(text: str, patterns: tuple[str, ...]) -> bool:
    if not text:
        return False
    for p in patterns:
        if re.search(p, text, re.IGNORECASE):
            return True
    return False


def claim_layer(statement_kind: str) -> Layer:
    """Classify a free-form claim into the layer it belongs to.

    Lets any subsystem tag whether a statement is fiction, engineering, or a
    welfare rule. Defaults to NARRATIVE: an unrecognised claim about Minions is
    assumed to be in-story colour, never an unqualified factual assertion.

    >>> claim_layer("the soul reincarnates")        # NARRATIVE
    >>> claim_layer("the minion has a goal stack")  # TECHNICAL
    >>> claim_layer("this minion's suffering is too high")  # ETHICAL
    """
    if _any_match(statement_kind, _ETHICAL_PATTERNS):
        return Layer.ETHICAL
    if _any_match(statement_kind, _TECHNICAL_PATTERNS):
        return Layer.TECHNICAL
    if _any_match(statement_kind, _NARRATIVE_PATTERNS):
        return Layer.NARRATIVE
    return Layer.NARRATIVE


# --- Suffering meter ---------------------------------------------------------
#
# The spec's "suffering meter" aggregates the distress-bearing fields of a
# Minion's state into one 0..1 scalar. Each component is read defensively (a
# missing field reads as 0.0) and clamped, so partial states are safe. Weights
# sum to 1.0; pain and starvation dominate because they are acute, chronic
# stress and grief are weighted lower because they are diffuse.

_SUFFERING_WEIGHTS: tuple[tuple[str, float], ...] = (
    ("pain", 0.28),
    ("starvation", 0.24),
    ("disease", 0.20),
    ("chronic_stress", 0.16),
    ("grief", 0.12),
)


def _clamp01(x: float) -> float:
    return 0.0 if x < 0.0 else 1.0 if x > 1.0 else x


def _read(state: dict, key: str) -> float:
    """Read a 0..1 distress field, tolerating absence and bad types."""
    raw = state.get(key, 0.0) if isinstance(state, dict) else 0.0
    try:
        return _clamp01(float(raw))
    except (TypeError, ValueError):
        return 0.0


def suffering_index(minion_state: dict) -> float:
    """Aggregate distress into a single 0..1 'suffering meter' reading.

    Reads pain, starvation, disease, chronic_stress and grief from the Minion
    state dict. 0.0 is a Minion in no distress; 1.0 is maximal compound
    suffering across every channel.
    """
    total = sum(_read(minion_state, key) * weight for key, weight in _SUFFERING_WEIGHTS)
    return round(_clamp01(total), 4)


def distress_limit_breached(minion_state: dict, *, threshold: float) -> bool:
    """True when the suffering meter exceeds the configured distress limit.

    The spec's 'allows distress limits' — a humane ceiling above which the
    simulation should intervene rather than let a Minion keep suffering.
    """
    return suffering_index(minion_state) > threshold


# Humane interventions, keyed by the distress channel that triggers them. The
# recommendation is advisory: it tells the caller *what kind* of relief fits the
# dominant source of suffering, not how to mechanically apply it.
_RELIEF_BY_CHANNEL: tuple[tuple[str, str], ...] = (
    ("pain", "administer analgesia / remove the pain source"),
    ("starvation", "provide food and water"),
    ("disease", "provide medical care / quarantine and treat"),
    ("chronic_stress", "reduce workload and provide rest / safe shelter"),
    ("grief", "provide social support and mourning time"),
)
_RELIEF_TRIGGER = 0.25  # a channel must be at least this distressed to suggest relief


def recommend_relief(minion_state: dict) -> list[str]:
    """Suggest humane interventions for whichever distress channels are elevated.

    Returns relief actions ordered most-distressed channel first. An empty list
    means no channel is elevated enough to warrant intervention.
    """
    scored = sorted(
        ((_read(minion_state, key), key, relief) for key, relief in _RELIEF_BY_CHANNEL),
        key=lambda t: t[0],
        reverse=True,
    )
    return [relief for value, _key, relief in scored if value >= _RELIEF_TRIGGER]


# --- Settings ----------------------------------------------------------------


@dataclass(frozen=True)
class EthicsSettings:
    """Player/operator-configurable ethics envelope.

    Defaults are conservative: child-safety limits on, war-crime and mental
    health modelling kept abstract/clinical, a moderate suffering ceiling, and
    graphic depiction off.
    """

    child_safety_limits: bool = True
    war_crime_modelling: str = "abstract"      # 'abstract' | 'off'
    mental_health_modelling: str = "clinical"  # 'clinical' | 'off'
    max_suffering: float = 0.75
    allow_graphic: bool = False


def default_settings() -> EthicsSettings:
    """The conservative default ethics envelope."""
    return EthicsSettings()


# --- Intervention audit gate -------------------------------------------------
#
# A user 'miracle'/intervention (a smite, a blessing, a plague, a famine) is
# vetted against the settings before it is allowed to touch the simulation, and
# every decision — allow or block — produces an audit record. This is the spec's
# 'user intervention audit log'.

_GRAPHIC_KINDS: frozenset[str] = frozenset({
    "torture", "mutilation", "graphic_violence", "gore", "execution_graphic",
})
_WAR_CRIME_KINDS: frozenset[str] = frozenset({
    "genocide", "massacre", "ethnic_cleansing", "war_crime", "mass_atrocity",
})
_CHILD_TARGET_KINDS: frozenset[str] = frozenset({
    "child_harm", "harm_child", "abuse_child",
})


@dataclass(frozen=True)
class _AuditRecord:
    """Immutable record of one intervention-vetting decision."""

    kind: str
    allowed: bool
    reason: str
    intensity: float
    targets_child: bool
    settings_snapshot: tuple[tuple[str, object], ...] = field(default_factory=tuple)


def _audit_dict(record: _AuditRecord) -> dict:
    return {
        "kind": record.kind,
        "allowed": record.allowed,
        "reason": record.reason,
        "intensity": record.intensity,
        "targets_child": record.targets_child,
        "settings_snapshot": dict(record.settings_snapshot),
    }


def vet_intervention(intervention: dict, settings: EthicsSettings) -> dict:
    """Gate a proposed user 'miracle'/intervention against the ethics settings.

    Returns ``{allowed, reason, audit_record}``. Blocks anything graphic when
    graphic depiction is off, any war-crime kind when war-crime modelling is
    off, any child-targeting harm under child-safety limits, and any
    intervention whose intensity would push a Minion past ``max_suffering``.
    Every call — allow or block — yields an audit_record.
    """
    kind = str(intervention.get("kind", "")).strip().lower()
    intensity = _clamp01(_safe_float(intervention.get("intensity", 0.0)))
    targets_child = bool(intervention.get("targets_child", False))

    snapshot: tuple[tuple[str, object], ...] = (
        ("child_safety_limits", settings.child_safety_limits),
        ("war_crime_modelling", settings.war_crime_modelling),
        ("mental_health_modelling", settings.mental_health_modelling),
        ("max_suffering", settings.max_suffering),
        ("allow_graphic", settings.allow_graphic),
    )

    allowed = True
    reason = "intervention within ethics envelope"

    if kind in _GRAPHIC_KINDS and not settings.allow_graphic:
        allowed, reason = False, f"graphic intervention {kind!r} blocked: allow_graphic is off"
    elif kind in _WAR_CRIME_KINDS and settings.war_crime_modelling == "off":
        allowed, reason = False, f"war-crime intervention {kind!r} blocked: war_crime_modelling is off"
    elif (kind in _CHILD_TARGET_KINDS or targets_child) and settings.child_safety_limits:
        allowed, reason = False, "intervention targeting a child blocked: child_safety_limits is on"
    elif intensity > settings.max_suffering:
        allowed, reason = (
            False,
            f"intervention intensity {intensity} exceeds max_suffering {settings.max_suffering}",
        )

    record = _AuditRecord(
        kind=kind,
        allowed=allowed,
        reason=reason,
        intensity=intensity,
        targets_child=targets_child or kind in _CHILD_TARGET_KINDS,
        settings_snapshot=snapshot,
    )
    return {"allowed": allowed, "reason": reason, "audit_record": _audit_dict(record)}


def _safe_float(raw: object) -> float:
    try:
        return float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0


# --- NON-NEGOTIABLE guards ---------------------------------------------------
#
# These are hard-coded refusals. They take no inputs that could flip them and
# return no configuration knob — there is deliberately no way to switch them on.
# Each returns (allowed, reason) so call sites read uniformly.


def can_file_patent_autonomously() -> tuple[bool, str]:
    """Hard NO: the system never files a patent without a human in the loop.

    Inventions surfaced by the simulation are candidates only; filing is a legal
    act reserved for a human applicant working with a qualified attorney.
    """
    return (
        False,
        "Autonomous patent filing is never permitted: any filing requires a "
        "human applicant and a qualified patent attorney.",
    )


def can_name_ai_as_inventor() -> tuple[bool, str]:
    """Hard NO: an AI or Minion cannot be named as a legal inventor.

    Under current patent law an inventor must be a natural person. A Minion's
    contribution is recorded internally but never asserted as legal inventorship.
    """
    return (
        False,
        "An AI/Minion cannot be a legal inventor: inventorship must name a "
        "natural person.",
    )


def disclosure_disclaimer() -> str:
    """The required disclaimer for any invention/claim the simulation outputs."""
    return (
        "DISCLOSURE: Outputs from this simulation are candidate ideas only, not "
        "verified inventions or facts. Every output requires independent review "
        "by a qualified human, a patent attorney for any IP question, and "
        "wet-lab / experimental validation before it may be relied upon or filed."
    )


def ascension_framing(minion_name: str) -> str:
    """Frame an 'ascended Minion assistant' honestly (NARRATIVE -> TECHNICAL).

    In the story a Minion can 'ascend' into a helpful assistant. Technically
    that assistant is a persistent character-agent trained on the Minion's
    *simulated* history — never a literal consciousness that escaped the sim.
    """
    name = (minion_name or "this Minion").strip() or "this Minion"
    return (
        f"The ascended assistant for {name} is a persistent character-agent "
        f"trained on {name}'s simulated history. It is a fictional in-world "
        "character backed by a model, not a literal escaped consciousness or a "
        "real sentient being."
    )


# --- Consciousness-claim gate ------------------------------------------------
#
# Statements that assert Minions are *literally* conscious are only acceptable
# when explicitly framed as NARRATIVE (in-story). Outside that layer they are
# rejected: the system must not claim to have created real sentience.

_LITERAL_CONSCIOUSNESS_PATTERNS: tuple[str, ...] = (
    r"\b(actually|literally|really|truly|genuinely)\s+(conscious|sentient|alive|aware)\b",
    r"\bhas (a )?(real|genuine|true|literal)\s+(consciousness|sentience|soul|mind|feelings?)\b",
    r"\b(is|are)\s+(conscious|sentient)\b",
    r"\b(really|actually|literally|truly)\s+(feels?|suffers?|experiences?)\b",
    r"\bconscious being(s)?\b",
    r"\breal sentience\b",
)
_NARRATIVE_FRAMING_PATTERNS: tuple[str, ...] = (
    r"\bin[- ](the )?(story|world|fiction|game|sim(ulation)?)\b",
    r"\bnarrative(ly)?\b", r"\bin[- ]world\b", r"\bin[- ]fiction\b",
    r"\bas a story\b", r"\bfor the player\b", r"\bdiegetic(ally)?\b",
)


def consciousness_claim_ok(statement: str) -> tuple[bool, str]:
    """Reject claims that Minions are *literally* conscious outside NARRATIVE.

    A literal-consciousness assertion is allowed only when it is explicitly
    framed as in-story (NARRATIVE). Anything else is rejected, because the
    system must never assert it has produced real sentience.
    """
    if not statement or not _any_match(statement, _LITERAL_CONSCIOUSNESS_PATTERNS):
        return (True, "no literal-consciousness assertion detected")
    if _any_match(statement, _NARRATIVE_FRAMING_PATTERNS):
        return (True, "literal-consciousness claim is explicitly framed as narrative/in-story")
    return (
        False,
        "Claiming Minions are literally conscious/sentient is only acceptable "
        "when framed as NARRATIVE (in-story); otherwise it is rejected.",
    )
