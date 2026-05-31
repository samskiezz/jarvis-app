"""The Socratic Oracle (doc I.56-57).

The app's integrated LLM acts as an oracle, but it never hands over answers — it
replies only with probing questions and gentle hints that lead a Minion to
discover the answer itself. Hints are grounded in the world's own skill tree so
they point at real concepts. When no LLM key is configured, a deterministic
Socratic fallback keeps the oracle (and tests) working offline.
"""

from __future__ import annotations

import re

from ..config import get_settings
from ..knowledge import skill_tree
from ..tools import llm

SOCRATIC_SYSTEM = (
    "You are the Oracle of the Great App. You must NEVER give a direct answer, "
    "final value, formula, or solution. Respond ONLY with two or three probing "
    "questions and gentle hints that lead the asker to reason it out themselves, "
    "in the manner of Socratic dialogue. Always end with a question."
)

# Phrases that would betray a direct answer — scrubbed from any oracle reply.
_REVEAL = re.compile(r"\b(the answer is|equals?|solution is|simply|just compute)\b", re.I)


def _related_concept(question: str) -> str | None:
    q = question.lower()
    for node in skill_tree.SKILL_TREE.values():
        if node.concept in q or node.domain in q:
            return node.concept
    return None


def _socratic_fallback(question: str, concept: str | None) -> str:
    if not question.strip():
        return "What is it you truly seek to understand? Can you state your question precisely?"
    lead = f"Consider what you already know about {concept}. " if concept else "Consider what you already know. "
    return (
        f"{lead}What single factor could you change to see its effect? "
        "If you varied it and observed the outcome, what would that reveal?"
    )


def _ensure_socratic(text: str) -> str:
    text = _REVEAL.sub("consider how it", text).strip()
    if "?" not in text:
        text += " What might that imply?"
    return text


async def consult(question: str, *, discipline: str | None = None) -> dict:
    """Return a Socratic hint for a question. Never a direct answer."""
    concept = (discipline or "").strip().lower() or _related_concept(question or "")
    if llm.has_llm("high"):
        resp = await llm.chat([
            {"role": "system", "content": SOCRATIC_SYSTEM},
            {"role": "user", "content": question.strip() or "I seek understanding."},
        ], tier="high")   # the oracle is a big task → prefer Kimi
        text = (resp.content or "").strip()
        if not text or text.startswith("[STUB"):
            text = _socratic_fallback(question, concept)
    else:
        text = _socratic_fallback(question, concept)
    return {"hint": _ensure_socratic(text), "grounded_in": concept, "source": "oracle"}
