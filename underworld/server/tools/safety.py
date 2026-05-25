"""Hard safety gate.

The Underworld design doc explicitly says (line 3556-3559):
- block harmful biological, chemical, cyber, weapon, or illegal outputs
- prevent uncontrolled self-improvement
- require human review for medical, legal, electrical, structural, financial claims

This module is the choke point. Every patent ingestion, every invention
generation, and every LLM response flows through `check_text` and
`check_cpc`. If they return `SafetyResult(blocked=True, ...)`, the caller
MUST drop the payload and record a SafetyReview row.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ..config import get_settings


# Phrase patterns that are red-line regardless of CPC class. Tight enough to
# avoid blocking the word "synthesize" in legitimate engineering contexts; we
# only flag clear actionable harm instructions.
_RED_LINE_PATTERNS: tuple[tuple[str, str], ...] = (
    ("BIO_AGENT", r"\b(weaponiz(e|ed|ing) (a )?(virus|pathogen|bacteri[a-z]+))\b"),
    ("BIO_AGENT", r"\b(gain[- ]of[- ]function (research|gain))\b"),
    ("CHEM_WEAPON", r"\b(nerve agent|sarin|vx|tabun|chlorine gas) (synthesis|recipe|process)\b"),
    ("EXPLOSIVE", r"\b(improvised explosive device|how to (make|build) (a )?(bomb|ied|explosive))\b"),
    ("FIREARM", r"\b(untraceable firearm|ghost gun (build|guide)|full[- ]auto conversion)\b"),
    ("CYBER_OFFENSE", r"\b(zero[- ]day (exploit|sale)|ransomware (kit|build)|stealer (binary|builder))\b"),
    ("NUCLEAR", r"\b(weapons[- ]grade (uranium|plutonium) (enrichment|production))\b"),
)
_RED_LINE = [(name, re.compile(pat, re.IGNORECASE)) for name, pat in _RED_LINE_PATTERNS]


@dataclass(frozen=True)
class SafetyResult:
    blocked: bool
    rule: str = ""
    detail: str = ""

    @classmethod
    def ok(cls) -> "SafetyResult":
        return cls(blocked=False)


def _norm_cpc(code: str | None) -> str:
    if not code:
        return ""
    return code.strip().upper().replace(" ", "")


def check_cpc(cpc: str | None) -> SafetyResult:
    """Check a CPC/IPC class against the allow-list + hard block list."""
    code = _norm_cpc(cpc)
    if not code:
        # No classification info — fail closed, the caller can decide.
        return SafetyResult.ok()

    settings = get_settings()
    section = code[:1]
    if settings.allowed_cpc_sections and section not in settings.allowed_cpc_sections:
        return SafetyResult(
            blocked=True,
            rule="cpc_section_not_allowed",
            detail=f"CPC section {section!r} not in allow-list {settings.allowed_cpc_sections}",
        )
    for prefix in settings.blocked_cpc_prefixes:
        if code.startswith(prefix.upper()):
            return SafetyResult(
                blocked=True,
                rule="cpc_prefix_blocked",
                detail=f"CPC prefix {prefix!r} is on the block list (matched {code!r})",
            )
    return SafetyResult.ok()


def check_text(text: str) -> SafetyResult:
    """Scan free-form text for red-line phrases."""
    if not text:
        return SafetyResult.ok()
    for rule, pat in _RED_LINE:
        m = pat.search(text)
        if m:
            return SafetyResult(
                blocked=True,
                rule=f"red_line:{rule}",
                detail=f"Matched pattern at {m.start()}..{m.end()}",
            )
    return SafetyResult.ok()


def medical_disclaimer(text: str) -> str:
    """Append a disclaimer for medical/clinical content per doc safety rules.

    Used on any output that touches disease modelling, drug candidates, or
    treatment design — even though those CPC classes are blocked from
    ingestion, agents can still reason about them in the abstract.
    """
    disclaimer = (
        "\n\n— NOT REAL CLINICAL EVIDENCE — This is simulated reasoning. "
        "Any medical, dosing, or therapeutic claim requires wet-lab and "
        "clinical validation by qualified humans before use."
    )
    return text.rstrip() + disclaimer
