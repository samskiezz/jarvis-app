"""Virtual Cell — autonomous disease-mechanism & cure-candidate discovery.

This is the project's flagship vertical: the *AI-for-science* wedge, not solar.
Given a disease/biological dysfunction, the engine walks the canonical discovery
chain and emits an attorney-/scientist-reviewable package:

    genome → gene regulation → protein structure → disease pathway →
    perturbation hypothesis → target shortlist → intervention candidates →
    toxicity flags → validation experiment plan → prior-art / patent map →
    invention-disclosure skeleton

Every node it produces is stamped with a reality-validation ConfidenceClass
(A physics-backed · B literature-backed · C simulation-inferred · D speculative ·
E narrative), composed onto the Civilisation Knowledge Graph so the
"understanding not copying" and novelty machinery applies to biology too.

Pure functions over plain dicts — no DB, no LLM, no wet-lab claims. Outputs are
*candidates and plans* requiring human + lab verification (see services.ethics);
nothing here asserts a validated cure.

Modelled on the Biohub / Isomorphic "virtual cell" direction, but grounded:
the engine never invents a gene or mechanism it wasn't given evidence for — it
relates, ranks, and plans over the evidence supplied.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from .knowledge_graph import (
    ConfidenceClass,
    Edge,
    EdgeKind,
    KnowledgeGraph,
    Node,
    NodeKind,
)


# ── biological entity kinds (sit on top of the generic NodeKind taxonomy) ────
class BioKind(str, Enum):
    DISEASE = "disease"
    GENE = "gene"
    PROTEIN = "protein"
    PATHWAY = "pathway"
    PERTURBATION = "perturbation"
    TARGET = "target"
    INTERVENTION = "intervention"   # small molecule / biologic / gene therapy


class Modality(str, Enum):
    SMALL_MOLECULE = "small_molecule"
    BIOLOGIC = "biologic"           # antibody / protein therapeutic
    GENE_THERAPY = "gene_therapy"   # CRISPR / ASO / vector
    RNA = "rna"                     # siRNA / mRNA


@dataclass(frozen=True)
class Evidence:
    """A single piece of supporting evidence with its epistemic class."""
    source: str                     # 'gwas' | 'omics' | 'literature' | 'assay' | 'sim'
    statement: str
    confidence: ConfidenceClass
    strength: float = 0.5           # 0..1 effect/association strength


@dataclass(frozen=True)
class Target:
    gene: str
    protein: str
    pathway: str
    score: float                    # 0..1 target-quality (genetic + tractability)
    confidence: ConfidenceClass
    rationale: str = ""


@dataclass(frozen=True)
class Candidate:
    id: str
    target: str
    modality: Modality
    affinity: float                 # 0..1 predicted binding/effect
    selectivity: float              # 0..1 (1 - off-target)
    confidence: ConfidenceClass
    toxicity_flags: list[str] = field(default_factory=list)


# Source → confidence class. GWAS/omics on real cohorts are literature-backed;
# a structural/sim prediction is simulation-inferred; a guess is speculative.
_SOURCE_CONF = {
    "gwas": ConfidenceClass.B_LITERATURE,
    "omics": ConfidenceClass.B_LITERATURE,
    "literature": ConfidenceClass.B_LITERATURE,
    "assay": ConfidenceClass.B_LITERATURE,
    "structure": ConfidenceClass.C_SIMULATION,
    "sim": ConfidenceClass.C_SIMULATION,
    "hypothesis": ConfidenceClass.D_SPECULATIVE,
}


def evidence_confidence(source: str) -> ConfidenceClass:
    return _SOURCE_CONF.get(source, ConfidenceClass.D_SPECULATIVE)


# ── 1–4: build the disease-mechanism graph ───────────────────────────────────
def mechanism_graph(disease: str, evidence: list[dict]) -> KnowledgeGraph:
    """Assemble the gene→protein→pathway→disease mechanism graph from evidence.

    `evidence` items: {kind:'gene'|'protein'|'pathway', id, name, source,
    statement, strength, links:[(rel, dst_id)]}. Each becomes a confidence-
    classed Node; links become typed Edges (e.g. gene DERIVED_FROM disease, a
    protein REQUIRES its gene). Nothing is added that lacks an evidence item.
    """
    g = KnowledgeGraph()
    g.add_node(Node(id=f"disease:{disease}", kind=NodeKind.FACT,
                    label=disease, confidence=ConfidenceClass.B_LITERATURE,
                    source="disease-definition", meta={"bio": BioKind.DISEASE.value}))
    for e in evidence:
        bio = e.get("kind", "gene")
        nid = f"{bio}:{e['id']}"
        conf = evidence_confidence(e.get("source", "hypothesis"))
        g.add_node(Node(id=nid, kind=NodeKind.FACT, label=e.get("name", e["id"]),
                        confidence=conf, source=e.get("source", ""),
                        meta={"bio": bio, "strength": e.get("strength", 0.5),
                              "statement": e.get("statement", "")}))
        # default link: implicated in the disease
        g.add_edge(Edge(nid, f"disease:{disease}", EdgeKind.DERIVED_FROM,
                        weight=e.get("strength", 0.5)))
        for rel, dst in e.get("links", []):
            try:
                g.add_edge(Edge(nid, dst, EdgeKind(rel)))
            except ValueError:
                g.add_edge(Edge(nid, dst, EdgeKind.REQUIRES))
    return g


# ── 5: perturbation hypotheses ───────────────────────────────────────────────
def perturbation_hypotheses(graph: KnowledgeGraph, disease: str) -> list[dict]:
    """Propose in-silico perturbations (knock-down / over-express / inhibit) for
    each gene/protein implicated, ranked by evidence strength.

    A perturbation is a *hypothesis* (class D until simulated/replicated): "if we
    inhibit X, the disease pathway activity drops".
    """
    out = []
    for n in graph.nodes_of(NodeKind.FACT):
        bio = n.meta.get("bio")
        if bio not in (BioKind.GENE.value, BioKind.PROTEIN.value):
            continue
        strength = float(n.meta.get("strength", 0.5))
        direction = "inhibit" if strength >= 0.5 else "modulate"
        out.append({
            "target_node": n.id,
            "name": n.label,
            "perturbation": direction,
            "expected_effect": f"{direction} {n.label} → reduce {disease} pathway activity",
            "prior": round(min(0.9, 0.3 + 0.6 * strength), 2),
            "confidence": ConfidenceClass.D_SPECULATIVE.value,
        })
    out.sort(key=lambda h: h["prior"], reverse=True)
    return out


# ── 6: target shortlist ───────────────────────────────────────────────────────
def target_shortlist(graph: KnowledgeGraph, disease: str, *, top_k: int = 5) -> list[Target]:
    """Rank gene/protein nodes into a target shortlist.

    Target score blends genetic evidence strength with a tractability proxy
    (proteins are more directly druggable than bare genes). Confidence is the
    node's own class — we never upgrade a speculative association to a fact.
    """
    targets: list[Target] = []
    for n in graph.nodes_of(NodeKind.FACT):
        bio = n.meta.get("bio")
        if bio not in (BioKind.GENE.value, BioKind.PROTEIN.value):
            continue
        strength = float(n.meta.get("strength", 0.5))
        tractability = 0.7 if bio == BioKind.PROTEIN.value else 0.45
        score = round(0.6 * strength + 0.4 * tractability, 3)
        targets.append(Target(
            gene=n.label if bio == BioKind.GENE.value else n.meta.get("gene", n.label),
            protein=n.label if bio == BioKind.PROTEIN.value else "",
            pathway=disease,
            score=score,
            confidence=n.confidence,
            rationale=n.meta.get("statement", "") or f"{bio} implicated (strength {strength}).",
        ))
    targets.sort(key=lambda t: (t.confidence.rank, -t.score))  # grounded first, then score
    return targets[:top_k]


# ── 7: intervention candidates + toxicity ─────────────────────────────────────
_TOX_RULES = [
    ("kinase", "kinase inhibitors carry cardiotoxicity risk — screen hERG"),
    ("immune", "immunomodulators risk cytokine release — monitor"),
    ("ubiquit", "broad proteostasis targets risk on-target toxicity"),
]


def intervention_candidates(targets: list[Target], *, per_target: int = 2) -> list[Candidate]:
    """Generate confidence-classed intervention candidates per target.

    Modality is chosen by tractability: well-defined protein pockets → small
    molecule; surface/secreted → biologic; undruggable-but-genetic → gene
    therapy. Affinity/selectivity are *predicted* (class C at best) and every
    candidate carries toxicity flags so nothing reads as validated.
    """
    out: list[Candidate] = []
    for t in targets:
        modalities = (
            [Modality.SMALL_MOLECULE, Modality.BIOLOGIC] if t.protein
            else [Modality.GENE_THERAPY, Modality.RNA]
        )
        for i, mod in enumerate(modalities[:per_target]):
            tox = [msg for key, msg in _TOX_RULES if key in (t.gene + t.protein).lower()]
            out.append(Candidate(
                id=f"cand:{t.gene or t.protein}:{mod.value}",
                target=t.protein or t.gene,
                modality=mod,
                affinity=round(min(0.9, 0.4 + 0.5 * t.score), 2),
                selectivity=round(0.5 + 0.4 * t.score, 2),
                # predicted, never better than simulation-inferred
                confidence=ConfidenceClass.C_SIMULATION if t.confidence.is_real
                else ConfidenceClass.D_SPECULATIVE,
                toxicity_flags=tox or ["no structural toxicity flag — still requires tox screen"],
            ))
    return out


# ── 9: validation experiment plan (the 6-stage pipeline from the spec) ───────
_VALIDATION_STAGES = [
    ("in_silico", "Dock candidate vs target structure; MD stability; ADMET prediction.", ConfidenceClass.C_SIMULATION),
    ("bench", "Biochemical binding assay (SPR/ITC) + cell viability.", ConfidenceClass.B_LITERATURE),
    ("cell_model", "Perturbation in disease cell model; reverse the pathway signature.", ConfidenceClass.B_LITERATURE),
    ("preclinical", "Efficacy + tox in animal model; PK/PD.", ConfidenceClass.B_LITERATURE),
    ("ind_enabling", "GLP tox, formulation, manufacturing.", ConfidenceClass.B_LITERATURE),
    ("clinical", "Phase I safety → II efficacy (out of simulation scope).", ConfidenceClass.B_LITERATURE),
]


def validation_plan(candidate: Candidate) -> list[dict]:
    """A staged validation plan; each stage raises achievable confidence only if
    it passes. Mirrors the spec's in-silico→bench→preclinical→clinical guardrails."""
    plan = []
    for i, (stage, desc, conf) in enumerate(_VALIDATION_STAGES, 1):
        plan.append({
            "stage": stage, "order": i, "description": desc,
            "gates_to": conf.value,
            "blocking": stage in ("bench", "cell_model", "preclinical"),
        })
    return plan


# ── 10: full pipeline → discovery package ─────────────────────────────────────
def discover(disease: str, evidence: list[dict], patent_pool: list[dict] | None = None,
             *, top_k: int = 5) -> dict:
    """Run the full virtual-cell discovery and emit the reviewable package.

    Composes the mechanism graph, perturbations, target shortlist, intervention
    candidates, validation plan, a prior-art/patent map (overlap with the pool),
    and an invention-disclosure SKELETON — every section confidence-classed and
    explicitly marked candidate-only.
    """
    from . import invention_pipeline as inv  # local import: avoid cycle at import time

    g = mechanism_graph(disease, evidence)
    perturbations = perturbation_hypotheses(g, disease)
    targets = target_shortlist(g, disease, top_k=top_k)
    candidates = intervention_candidates(targets)
    lead = candidates[0] if candidates else None

    # Prior-art map: which supplied patents touch this disease/target space.
    patent_pool = patent_pool or []
    terms = {disease.lower()} | {t.gene.lower() for t in targets} | {t.protein.lower() for t in targets if t.protein}
    prior_art = []
    for p in patent_pool:
        hay = ((p.get("title", "") + " " + p.get("abstract", "")).lower())
        hits = sorted(term for term in terms if term and term in hay)
        if hits:
            prior_art.append({"patent": p.get("id"), "title": p.get("title"), "matched": hits})

    package = {
        "disease": disease,
        "mechanism_graph": {
            "nodes": len(g),
            "validation_breakdown": g.validation_breakdown(),
            "real_fraction": g.real_fraction(),
        },
        "perturbation_hypotheses": perturbations,
        "target_shortlist": [t.__dict__ | {"confidence": t.confidence.value} for t in targets],
        "intervention_candidates": [
            c.__dict__ | {"modality": c.modality.value, "confidence": c.confidence.value}
            for c in candidates
        ],
        "validation_plan": validation_plan(lead) if lead else [],
        "prior_art_map": prior_art,
        "invention_disclosure_skeleton": {
            "title": f"Targeting {targets[0].protein or targets[0].gene} for {disease}" if targets else f"{disease} intervention",
            "background": f"{disease}: mechanism assembled from {len(evidence)} evidence items.",
            "targets": [t.gene or t.protein for t in targets],
            "lead_candidate": lead.id if lead else None,
            "novelty_note": "Novelty vs the prior-art map above must be assessed by a patent professional.",
            "confidence_summary": g.validation_breakdown(),
            "disclaimer": inv.DISCLAIMER if hasattr(inv, "DISCLAIMER") else
            ("CANDIDATE ONLY. Requires human scientific review, wet-lab validation, "
             "and patent-attorney assessment. Not a validated therapy. No autonomous filing."),
        },
    }
    return package
