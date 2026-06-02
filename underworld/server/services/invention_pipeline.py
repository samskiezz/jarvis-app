"""#5 Empty-Patent → Autonomous Invention pipeline (the "compete with real R&D"
endgame).

The keystone graph (`knowledge_graph.py`) tells the world *what is known* and
*how grounded* it is; the empty-dataset puzzles (`puzzles.py`) pose the open
questions; this module is the engine that walks an unresolved **real-world
technical gap** all the way to an **attorney-reviewable invention disclosure**.

Seven pure steps (spec #5, the upgraded master loop's tail):

  1. detect_gap          — a real arXiv/PubMed/industrial pain-point signal → an
                           in-world challenge Gap.
  2. find_relevant_patents — pull the expired patents whose CPC/keywords touch
                           the gap's domains (the spec's "combine 3–10 expired
                           patents").
  3. combine             — synthesise a candidate = a NEW arrangement of those
                           patents' principles, scored for inventive step and
                           anticipation through `KnowledgeGraph.novelty()`.
  4. simulate            — the multi-model physics/cost/failure check.
  5. peer_review         — independent Minion-lab replication + fraud detection.
  6. invention_disclosure — THE PRODUCT: a human+attorney-reviewable pack.
  7. run_pipeline        — chain all of the above + emit a per-step trace.

Nothing here files a patent or names an AI as inventor — that is the spec's
ethics boundary (#8). Every disclosure is a *candidate* requiring human, attorney
and lab verification, and says so in writing.

Pure functions only — no DB, no LLM — fully unit-testable, matching the house
style of `knowledge_graph.py`.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .knowledge_graph import ConfidenceClass, KnowledgeGraph

# The spec's window: a candidate must combine between this many expired patents.
_MIN_COMBINE = 3
_MAX_COMBINE = 10

# The disclosure's standing ethics boundary (#8) — never autonomous filing.
DISCLAIMER = (
    "CANDIDATE ONLY. This invention disclosure was synthesised by the Underworld "
    "simulator from public-domain expired patents and is NOT a patent application. "
    "It requires human review, a licensed patent attorney's assessment, and "
    "physical laboratory verification before any filing. No AI system is or may be "
    "named as a legal inventor, and nothing here is filed autonomously."
)


# ── the in-world challenge object ─────────────────────────────────────────────
@dataclass(frozen=True)
class Gap:
    """An unresolved real-world technical gap, translated into a challenge.

    `source` records provenance (#hardest-problem 2, grounding): a research
    paper, a stated limitation of an existing patent, or an industrial pain
    point. `confidence` is how strongly the *signal* says the gap is real —
    reused from the keystone A–E ladder.
    """

    id: str
    problem: str
    domain: str
    relevant_domains: list[str]
    source: str  # 'paper' | 'patent_limitation' | 'industrial_need'
    confidence: ConfidenceClass


# ── step 1: detect a gap from real-world signals ─────────────────────────────
def detect_gap(signals: list[dict]) -> Gap:
    """Convert a research-gap signal into an in-world challenge Gap.

    `signals` are the spec's real arXiv/PubMed/industrial pain-point sources,
    represented here as input dicts. We fuse them into one challenge: the
    strongest-confidence signal sets the headline problem/domain, and every
    signal's domains pool into `relevant_domains` (what later steps search).
    """
    if not signals:
        raise ValueError("detect_gap needs at least one research-gap signal")

    sources = {"paper", "patent_limitation", "industrial_need"}
    ranked = sorted(signals, key=lambda s: _signal_confidence(s).rank)
    lead = ranked[0]

    domains: list[str] = []
    for s in signals:
        for d in _signal_domains(s):
            if d not in domains:
                domains.append(d)

    domain = lead.get("domain") or (domains[0] if domains else "general")
    if domain not in domains:
        domains.insert(0, domain)

    source = lead.get("source", "paper")
    if source not in sources:
        source = "paper"

    return Gap(
        id=lead.get("id", "gap-0"),
        problem=lead.get("problem", lead.get("title", "Unspecified technical gap")),
        domain=domain,
        relevant_domains=domains,
        source=source,
        confidence=_signal_confidence(lead),
    )


def _signal_confidence(signal: dict) -> ConfidenceClass:
    c = signal.get("confidence")
    if isinstance(c, ConfidenceClass):
        return c
    if isinstance(c, str):
        try:
            return ConfidenceClass(c)
        except ValueError:
            pass
    # A documented paper/patent limitation is literature-backed; a raw industrial
    # pain point with no citation is only speculative.
    return (ConfidenceClass.B_LITERATURE
            if signal.get("source") in ("paper", "patent_limitation")
            else ConfidenceClass.D_SPECULATIVE)


def _signal_domains(signal: dict) -> list[str]:
    out = list(signal.get("relevant_domains") or signal.get("domains") or [])
    d = signal.get("domain")
    if d and d not in out:
        out.append(d)
    return out


# ── step 2: find the relevant expired prior art ──────────────────────────────
def find_relevant_patents(gap: Gap, patent_pool: list[dict]) -> list[dict]:
    """Select expired patents whose CPC codes / keywords touch the gap's domains.

    Only expired (public-domain) patents are combinable. Each candidate is
    scored by how many of the gap's `relevant_domains` it intersects, and the
    list is capped at the spec's 10-patent ceiling.
    """
    wanted = {d.lower() for d in gap.relevant_domains}
    scored: list[tuple[int, dict]] = []
    for p in patent_pool:
        if not p.get("expired", False):
            continue
        terms = _patent_terms(p)
        hits = len(wanted & terms)
        if hits:
            scored.append((hits, p))
    scored.sort(key=lambda t: (-t[0], str(t[1].get("id", ""))))
    return [p for _, p in scored[:_MAX_COMBINE]]


def _patent_terms(patent: dict) -> set[str]:
    terms: set[str] = set()
    for key in ("cpc", "keywords", "domains", "functions"):
        for v in patent.get(key, []) or []:
            terms.add(str(v).lower())
    d = patent.get("domain")
    if d:
        terms.add(str(d).lower())
    return terms


# ── step 3: combine into a candidate invention ───────────────────────────────
def combine(gap: Gap, patents: list[dict], graph: KnowledgeGraph) -> dict:
    """Synthesise a candidate invention as a NEW arrangement of the patents'
    principles, scored against the knowledge graph.

    Each patent contributes its principle node(s); the graph's `novelty()`
    decides inventive step and flags anticipation when an existing
    invention/patent node already covers the combination.
    """
    combined_from = [p.get("id") for p in patents]
    principle_ids: list[str] = []
    for p in patents:
        for pid in _principle_ids(p):
            if pid not in principle_ids:
                principle_ids.append(pid)

    nov = graph.novelty(principle_ids)
    title = (f"Candidate for {gap.problem.rstrip('.')}: a combination of "
             f"{len(patents)} expired prior-art teachings")

    return {
        "title": title,
        "problem": gap.problem,
        "combined_from": combined_from,
        "principles": principle_ids,
        "novelty": nov["novelty"],
        "inventive_step": nov["inventive_step"],
        "anticipated_by": nov["anticipated_by"],
        "sufficient_prior_art": len(patents) >= _MIN_COMBINE,
    }


def _principle_ids(patent: dict) -> list[str]:
    """The graph node(s) a patent teaches. Falls back to the patent id so a
    bare prior-art dict still contributes something to combine."""
    principles = patent.get("principles") or patent.get("principle_ids")
    if principles:
        return [str(x) for x in principles]
    pid = patent.get("id")
    return [str(pid)] if pid is not None else []


# ── step 4: multi-model simulation ───────────────────────────────────────────
# The spec's named simulation lenses.
_MODEL_AXES = ("thermal", "electrical", "mechanical", "cost", "failure",
               "environmental")


def simulate(candidate: dict, models: dict) -> dict:
    """Run the multi-model check over provided per-model result dicts.

    Each entry in `models` is keyed by axis and shaped like
    ``{"pass": bool, "physics_consistent": bool, "replicated": bool}`` (missing
    keys default conservatively). Returns per-model pass/fail, an overall
    feasibility in 0..1, and a confidence class: physics-consistent AND
    replicated → C (the world model trusts it, pending external check), else D.
    """
    per_model: dict[str, bool] = {}
    physics_ok = True
    replicated = True
    present = 0
    for axis in _MODEL_AXES:
        result = models.get(axis)
        if result is None:
            # An unrun lens is not a pass and leaves physics unproven.
            per_model[axis] = False
            physics_ok = False
            replicated = False
            continue
        present += 1
        passed = bool(result.get("pass", False))
        per_model[axis] = passed
        if not result.get("physics_consistent", passed):
            physics_ok = False
        if not result.get("replicated", False):
            replicated = False

    feasibility = round(sum(per_model.values()) / len(_MODEL_AXES), 3)
    # physics-consistent + replicated → C, else D (matches classify_invention).
    confidence = (ConfidenceClass.C_SIMULATION
                  if physics_ok and replicated and present == len(_MODEL_AXES)
                  else ConfidenceClass.D_SPECULATIVE)

    return {
        "per_model": per_model,
        "models_run": present,
        "feasibility": feasibility,
        "physics_consistent": physics_ok,
        "replicated": replicated,
        "confidence_class": confidence,
    }


# ── step 5: peer review across independent Minion labs ───────────────────────
def peer_review(candidate: dict, reviews: list[dict]) -> dict:
    """Aggregate independent Minion-lab replications and detect fraud.

    Each review is ``{"lab": str, "replicated": bool, "fabricated": bool}``.
    A run is accepted only when enough independent labs replicate it AND no lab
    flags fabrication (the spec's research-falsification / failed-replication
    guard). `replication_confidence` is the share of honest labs that
    replicated.
    """
    if not reviews:
        return {"accepted": False, "replication_confidence": 0.0,
                "fraud_flag": False, "replications": 0, "labs": 0,
                "reason": "no independent replication attempted"}

    fraud_flag = any(r.get("fabricated", False) for r in reviews)
    honest = [r for r in reviews if not r.get("fabricated", False)]
    replications = sum(1 for r in honest if r.get("replicated", False))
    labs = len({r.get("lab", i) for i, r in enumerate(reviews)})

    denom = len(honest) if honest else len(reviews)
    replication_confidence = round(replications / denom, 3) if denom else 0.0

    # Accepted only with ≥3 independent honest replications agreeing and no fraud.
    accepted = (not fraud_flag and replications >= 3
                and replication_confidence >= 0.8)
    reason = ("fabrication flagged by a reviewer" if fraud_flag
              else "accepted" if accepted
              else "insufficient independent replication")

    return {
        "accepted": accepted,
        "replication_confidence": replication_confidence,
        "fraud_flag": fraud_flag,
        "replications": replications,
        "labs": labs,
        "reason": reason,
    }


# ── step 6: the product — an attorney-reviewable disclosure ──────────────────
def invention_disclosure(gap: Gap, candidate: dict, sim: dict, review: dict) -> dict:
    """Assemble the human + attorney + lab reviewable invention disclosure.

    This is THE PRODUCT of the pipeline. It is deliberately a *disclosure*, not
    an application: it surfaces the novelty hypothesis, the prior-art table it
    was combined from, the simulated evidence, the open risks, and the questions
    an attorney must answer — and it carries the standing ethics disclaimer.
    """
    prior_art_table = [
        {"patent_id": pid, "role": "combined teaching"}
        for pid in candidate.get("combined_from", [])
    ]

    # The disclosure can be no more grounded than its weakest support: the worse
    # (higher rank) of the simulation and replication classes.
    sim_class = sim.get("confidence_class", ConfidenceClass.D_SPECULATIVE)
    confidence_class = (sim_class if review.get("accepted")
                        else ConfidenceClass.D_SPECULATIVE)

    risks: list[str] = []
    if candidate.get("anticipated_by"):
        risks.append(
            f"Possible anticipation by prior node {candidate['anticipated_by']} "
            "— novelty must be re-examined before filing.")
    if not candidate.get("sufficient_prior_art", True):
        risks.append(
            f"Combines fewer than {_MIN_COMBINE} expired patents; inventive-step "
            "support may be thin.")
    if not sim.get("physics_consistent", False):
        risks.append("One or more physics lenses did not pass; feasibility unproven.")
    if review.get("fraud_flag"):
        risks.append("A reviewing lab flagged fabricated data — DO NOT advance.")
    if not review.get("accepted"):
        risks.append("Not independently replicated to acceptance; evidence is preliminary.")

    attorney_questions = [
        "Is the combination obvious to a person having ordinary skill in the art "
        "(PHOSITA) over the cited expired patents?",
        f"Does prior node {candidate.get('anticipated_by') or 'N/A'} anticipate "
        "any independent claim?",
        "Are the cited patents genuinely expired / public-domain in every target "
        "jurisdiction?",
        "Does the simulated evidence rise to enablement, or is lab data required?",
        "Who are the human inventors? (No AI may be named as a legal inventor.)",
    ]

    return {
        "title": candidate.get("title", f"Candidate for: {gap.problem}"),
        "background": (
            f"In the field of {gap.domain}, an unresolved gap was identified from a "
            f"{gap.source} source: {gap.problem}"),
        "summary": (
            f"A candidate apparatus/method addressing the gap by combining "
            f"{len(candidate.get('combined_from', []))} expired patents into a "
            f"novel arrangement (inventive step: {candidate.get('inventive_step')})."),
        "detailed_description": (
            "The candidate arranges the cited prior-art teachings — "
            f"{', '.join(str(p) for p in candidate.get('combined_from', [])) or 'none'} "
            "— so that their principles cooperate to address the stated problem. "
            "Each constituent teaching is public-domain expired prior art; the "
            "claimed contribution is their non-obvious combination."),
        "claim_tree": {
            "independent": [
                f"1. A system for {gap.problem.rstrip('.').lower()}, comprising the "
                "combined teachings of the cited expired patents arranged to "
                "cooperatively address the problem.",
            ],
            "dependent": [
                f"2. The system of claim 1, wherein the arrangement of "
                f"{prior_art_table[0]['patent_id'] if prior_art_table else 'the prior art'} "
                "provides the primary mechanism.",
                "3. The system of claim 1, wherein the combination yields a "
                "non-obvious improvement over each constituent teaching alone.",
            ],
        },
        "prior_art_table": prior_art_table,
        "novelty_hypothesis": (
            f"Novelty score {candidate.get('novelty')} ({candidate.get('inventive_step')} "
            "inventive step): no single cited node already combines this set of "
            "principles."),
        "test_evidence": {
            "per_model": sim.get("per_model", {}),
            "feasibility": sim.get("feasibility", 0.0),
            "physics_consistent": sim.get("physics_consistent", False),
            "replication_confidence": review.get("replication_confidence", 0.0),
        },
        "risks": risks,
        "attorney_questions": attorney_questions,
        "confidence_class": confidence_class,
        "disclaimer": DISCLAIMER,
    }


# ── step 7: end-to-end ───────────────────────────────────────────────────────
def run_pipeline(
    signals: list[dict],
    patent_pool: list[dict],
    graph: KnowledgeGraph,
    models: dict,
    reviews: list[dict],
) -> dict:
    """Chain all seven steps and return the disclosure + a per-step trace.

    The trace makes the pipeline auditable (#hardest-problem 2, grounding):
    every emitted disclosure can be traced back through review, simulation,
    combination, prior art, to the originating real-world signal.
    """
    gap = detect_gap(signals)
    patents = find_relevant_patents(gap, patent_pool)
    candidate = combine(gap, patents, graph)
    sim = simulate(candidate, models)
    review = peer_review(candidate, reviews)
    disclosure = invention_disclosure(gap, candidate, sim, review)

    trace = [
        {"step": "detect_gap", "gap_id": gap.id, "source": gap.source,
         "relevant_domains": gap.relevant_domains},
        {"step": "find_relevant_patents", "selected": candidate["combined_from"]},
        {"step": "combine", "novelty": candidate["novelty"],
         "inventive_step": candidate["inventive_step"],
         "anticipated_by": candidate["anticipated_by"]},
        {"step": "simulate", "feasibility": sim["feasibility"],
         "confidence_class": sim["confidence_class"].value},
        {"step": "peer_review", "accepted": review["accepted"],
         "fraud_flag": review["fraud_flag"]},
        {"step": "invention_disclosure",
         "confidence_class": disclosure["confidence_class"].value},
    ]

    return {
        "gap": gap,
        "candidate": candidate,
        "simulation": sim,
        "review": review,
        "disclosure": disclosure,
        "trace": trace,
    }
