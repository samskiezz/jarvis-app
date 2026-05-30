"""Assembles the corpus payload returned by /functions/getLiveIntel.

All counts are computed from the actual data tables — nothing is hardcoded — so
the Email Corpus, Timeline, and Facts panels display honest totals.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from ..data import corpus as data
from ..data.ontology import LINKS, OBJECTS, RISK_SIGNALS


def _predicate_counts() -> dict[str, int]:
    """Honest fact tallies derived from the ontology + corpus tables."""
    emails_total = sum(len(t) for t in data.EMAIL_TABLES.values())
    by_type = Counter(o["type"] for o in OBJECTS)
    return {
        "ENTITIES": len(OBJECTS),
        "RELATIONS": len(LINKS),
        "RISK_SIGNALS": len(RISK_SIGNALS),
        "EMAILS": emails_total,
        "TIMELINE": len(data.TIMELINE),
        "ORGS": by_type.get("org", 0),
        "INVESTMENTS": by_type.get("invest", 0),
        "PEOPLE": by_type.get("person", 0),
    }


def get_corpus() -> dict[str, Any]:
    emails_total = sum(len(t) for t in data.EMAIL_TABLES.values())
    facts_predicates = _predicate_counts()
    facts_total = sum(facts_predicates.values())

    payload: dict[str, Any] = {
        "timeline": data.TIMELINE,
        "facts": {
            "predicates": facts_predicates,
            "total": facts_total,
        },
        "totals": {
            "emails": emails_total,
            "timeline": len(data.TIMELINE),
            "facts": facts_total,
            "entities": len(OBJECTS),
            "relations": len(LINKS),
            "risk_signals": len(RISK_SIGNALS),
        },
    }
    payload.update(data.EMAIL_TABLES)
    return payload
