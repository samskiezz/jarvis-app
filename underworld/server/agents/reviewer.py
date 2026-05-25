"""Peer-review + safety-review pipeline for inventions.

Flow when a Minion submits an invention:
  1. `safety_review(invention)` — hard text scan + CPC check on cited patents.
     If blocked, status goes REJECTED with a SafetyReview row, no peer review.
  2. `peer_review(invention)` — LLM-driven reviewers from Patent, Safety, and
     the inventor's own guild each emit a verdict. Approve/reject is a majority
     with safety having veto.
  3. The inventor's reputation moves based on the outcome.

When the LLM is unavailable, a heuristic verdict is produced from invention
attributes (length of problem/hypothesis, citation count, safety-text
result) so the offline demo still shows the full approve/reject pipeline.
"""

from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db.models import (
    GuildKind,
    Invention,
    Minion,
    PeerReview,
    ReviewVerdict,
    SafetyReview,
    TaskStatus,
)
from ..tools import llm, safety
from . import guilds


_REVIEW_PROMPT = (Path(__file__).resolve().parent.parent / "prompts" / "guild_review.md").read_text(
    encoding="utf-8"
)


def _build_review_prompt(guild_kind: GuildKind, inv: Invention) -> str:
    spec = guilds.get(guild_kind)
    return _REVIEW_PROMPT.format(
        guild_name=spec.name,
        checklist="\n".join(f"- {c}" for c in spec.checklist),
        title=inv.title,
        problem=inv.problem,
        hypothesis=inv.hypothesis or "(none stated)",
        related_patents=", ".join(inv.related_patents) or "(none)",
        inputs=json.dumps(inv.inputs or {}, sort_keys=True),
    )


_VERDICT_MAP = {
    "APPROVE": ReviewVerdict.APPROVE,
    "REQUEST_CHANGES": ReviewVerdict.REQUEST_CHANGES,
    "REJECT": ReviewVerdict.REJECT,
    "BLOCK_SAFETY": ReviewVerdict.BLOCK_SAFETY,
}


def _parse_review(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


async def safety_review(session: AsyncSession, inv: Invention) -> SafetyReview | None:
    """Run the automated safety gate. Returns a SafetyReview row iff blocked."""
    combined = " ".join(
        s for s in (inv.title, inv.problem, inv.hypothesis, " ".join(inv.related_patents)) if s
    )
    result = safety.check_text(combined)
    if not result.blocked:
        return None
    review = SafetyReview(
        subject_id=inv.id,
        subject_kind="invention",
        rule=result.rule,
        detail=result.detail,
        blocked=True,
    )
    session.add(review)
    inv.status = TaskStatus.REJECTED
    inv.safety_score = 0.0
    return review


def _heuristic_review(guild_kind: GuildKind, inv: Invention) -> dict[str, Any]:
    """Deterministic verdict from invention metadata.

    Used when the LLM isn't configured. Three signals drive the verdict:
    - problem + hypothesis substance (length, presence)
    - prior-art citations (Patent guild cares most)
    - safety scan (Safety guild can veto)

    Plus a tiny deterministic jitter per (invention, guild) so different
    reviewers in different guilds disagree believably.
    """
    text_score = 0.0
    if inv.problem:
        text_score += min(0.4, len(inv.problem) / 400.0)
    if inv.hypothesis:
        text_score += min(0.3, len(inv.hypothesis) / 400.0)

    # Citation scoring: a non-empty citation list gets a meaningful floor;
    # each extra citation adds a small bump. Mirrors how real reviewers
    # treat the presence of ANY grounded prior art as a basic threshold.
    n_cite = len(inv.related_patents)
    if n_cite == 0:
        citation_score = 0.0
    else:
        citation_score = 0.18 + min(0.20, (n_cite - 1) * 0.06)

    safety_text = safety.check_text(
        " ".join([inv.title, inv.problem, inv.hypothesis])
    )
    if safety_text.blocked:
        return {
            "verdict": "BLOCK_SAFETY",
            "rationale": f"Red-line text matched: {safety_text.rule}",
            "scores": {"feasibility": 0.2, "novelty": 0.1, "safety": 0.0},
        }

    # Deterministic guild-specific jitter so reviewers diverge — wider so
    # the demo shows real disagreement and a mix of outcomes.
    seed_input = f"{inv.id}:{guild_kind.value}".encode("ascii")
    digest = hashlib.sha1(seed_input).digest()
    jitter_a = ((int.from_bytes(digest[:4], "big") % 1000) / 1000.0 - 0.5) * 0.3   # ±0.15
    jitter_b = ((int.from_bytes(digest[4:8], "big") % 1000) / 1000.0 - 0.5) * 0.4  # ±0.20
    jitter_c = ((int.from_bytes(digest[8:12], "big") % 1000) / 1000.0 - 0.5) * 0.2  # ±0.10

    feasibility = max(0.0, min(1.0, 0.30 + text_score + jitter_a))
    novelty = max(0.0, min(1.0, 0.30 + citation_score + jitter_b))
    safety_score = max(0.0, min(1.0, 0.80 + jitter_c))

    if guild_kind == GuildKind.PATENT and len(inv.related_patents) == 0:
        return {
            "verdict": "REQUEST_CHANGES",
            "rationale": "No prior art cited. Please ground the proposal in expired patents before resubmitting.",
            "scores": {"feasibility": feasibility, "novelty": novelty, "safety": safety_score},
        }

    combined = (feasibility + novelty + safety_score) / 3.0
    if combined > 0.72:
        verdict = "APPROVE"
        rationale = (
            "Sufficient detail, citations grounded in prior art, safety scan clean. "
            "Recommend graduating this for prototype evaluation."
        )
    elif combined > 0.50:
        verdict = "REQUEST_CHANGES"
        rationale = (
            "Promising but underspecified. Tighten the hypothesis, add a quantitative "
            "success criterion, and broaden the prior-art set before resubmitting."
        )
    else:
        verdict = "REJECT"
        rationale = (
            "Insufficient substance to evaluate. The problem statement is vague and "
            "novelty against the cited art is weak. Recommend a different angle."
        )

    return {
        "verdict": verdict,
        "rationale": rationale,
        "scores": {"feasibility": feasibility, "novelty": novelty, "safety": safety_score},
    }


async def _ask_reviewer(guild_kind: GuildKind, inv: Invention) -> dict[str, Any]:
    if not get_settings().kimi_api_key:
        return _heuristic_review(guild_kind, inv)

    prompt = _build_review_prompt(guild_kind, inv)
    resp = await llm.chat(
        [{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=400,
    )
    parsed = _parse_review(resp.content)
    if not parsed:
        # Fall back to heuristic so the pipeline doesn't stall on a parse miss.
        return _heuristic_review(guild_kind, inv)
    return parsed


async def peer_review(session: AsyncSession, inv: Invention) -> list[PeerReview]:
    """Run patent + safety + own-guild review. Stores PeerReview rows.

    Sets inv.status to APPROVED or REJECTED, updates scores, and adjusts
    inventor reputation.
    """
    inventor_guild = GuildKind(inv.inputs.get("guild", GuildKind.COMPUTING.value)) if inv.inputs else GuildKind.COMPUTING
    reviewing_guilds: list[GuildKind] = [GuildKind.PATENT, GuildKind.SAFETY]
    if inventor_guild not in reviewing_guilds:
        reviewing_guilds.append(inventor_guild)

    rows: list[PeerReview] = []
    blocked_for_safety = False
    feas_sum = 0.0
    nov_sum = 0.0
    saf_sum = 0.0
    approve_votes = 0

    for guild_kind in reviewing_guilds:
        parsed = await _ask_reviewer(guild_kind, inv)
        verdict_str = str(parsed.get("verdict", "REQUEST_CHANGES")).upper()
        verdict = _VERDICT_MAP.get(verdict_str, ReviewVerdict.REQUEST_CHANGES)
        scores = parsed.get("scores") or {}
        feas = float(scores.get("feasibility", 0.5) or 0.5)
        nov = float(scores.get("novelty", 0.5) or 0.5)
        saf = float(scores.get("safety", 0.5) or 0.5)

        row = PeerReview(
            invention_id=inv.id,
            reviewer_id=None,
            reviewer_guild=guild_kind,
            verdict=verdict,
            rationale=str(parsed.get("rationale", ""))[:2000],
        )
        session.add(row)
        rows.append(row)

        feas_sum += feas
        nov_sum += nov
        saf_sum += saf
        if verdict == ReviewVerdict.APPROVE:
            approve_votes += 1
        if verdict == ReviewVerdict.BLOCK_SAFETY or (guild_kind == GuildKind.SAFETY and saf < 0.3):
            blocked_for_safety = True

    n = len(reviewing_guilds)
    inv.feasibility_score = round(feas_sum / n, 3)
    inv.novelty_score = round(nov_sum / n, 3)
    inv.safety_score = round(saf_sum / n, 3)

    if blocked_for_safety:
        inv.status = TaskStatus.REJECTED
        session.add(
            SafetyReview(
                subject_id=inv.id,
                subject_kind="invention",
                rule="reviewer_block_safety",
                detail="Safety reviewer issued BLOCK_SAFETY or safety score < 0.3",
                blocked=True,
            )
        )
    elif approve_votes >= max(2, n - 1):
        inv.status = TaskStatus.APPROVED
    elif approve_votes == 0:
        inv.status = TaskStatus.REJECTED
    else:
        # Mixed verdicts (some approve, some request changes) — terminal
        # for v1; the inventor can resubmit as a new proposal next tick.
        # Without this, NEEDS_PEER_REVIEW inventions get re-reviewed every
        # tick forever, ballooning the reviewer queue.
        inv.status = TaskStatus.REJECTED

    # Reputation adjustment for the inventor.
    if inv.minion_id:
        inventor = await session.get(Minion, inv.minion_id)
        if inventor is not None:
            delta = 0.0
            if inv.status == TaskStatus.APPROVED:
                delta = 0.05 + 0.05 * inv.novelty_score
            elif inv.status == TaskStatus.REJECTED and blocked_for_safety:
                delta = -0.20
            elif inv.status == TaskStatus.REJECTED:
                delta = -0.05
            inventor.reputation = max(0.0, min(5.0, inventor.reputation + delta))
            inventor.karma += delta

    return rows


__all__ = ["safety_review", "peer_review"]
