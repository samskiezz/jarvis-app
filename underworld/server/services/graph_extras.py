"""Real specialised knowledge-graph algorithms (feature category B remainder).

Genuine graph analytics (numpy): scientific citation graph (PageRank-style
influence), cross-domain analogy detection, and idea-mutation/recombination.
"""
from __future__ import annotations

import numpy as np


def citation_graph(citations: list[tuple[str, str]], *, iterations: int = 50,
                   damping: float = 0.85) -> dict:
    """Scientific-citation graph: PageRank influence of each paper from the
    citation edges (citing -> cited)."""
    nodes = sorted({n for edge in citations for n in edge})
    idx = {n: i for i, n in enumerate(nodes)}
    n = len(nodes)
    if n == 0:
        return {"influence": {}, "most_influential": None}
    M = np.zeros((n, n))
    for citing, cited in citations:
        M[idx[cited], idx[citing]] += 1
    col = M.sum(axis=0)
    M[:, col > 0] /= col[col > 0]
    M[:, col == 0] = 1.0 / n
    rank = np.ones(n) / n
    for _ in range(iterations):
        rank = (1 - damping) / n + damping * M @ rank
    influence = {nodes[i]: round(float(rank[i]), 5) for i in range(n)}
    return {"influence": influence,
            "most_influential": max(influence, key=influence.get)}


def cross_domain_analogy(domain_a: set[str], domain_b: set[str]) -> dict:
    """Cross-domain analogy graph: structural overlap (Jaccard) between two
    domains' relation sets — high overlap suggests a transferable analogy."""
    inter = domain_a & domain_b
    union = domain_a | domain_b
    jaccard = len(inter) / len(union) if union else 0.0
    return {"shared_structure": sorted(inter), "analogy_strength": round(jaccard, 4),
            "transferable": jaccard > 0.2}


def idea_mutation(idea: set[str], *, add: set[str] | None = None,
                  drop: set[str] | None = None) -> dict:
    """Idea-mutation graph: mutate an idea (set of concepts) by adding/removing
    elements; report the novelty (fraction changed)."""
    add = add or set()
    drop = drop or set()
    mutated = (idea - drop) | add
    changed = len(add | (idea & drop))
    novelty = changed / len(idea | mutated) if (idea | mutated) else 0.0
    return {"mutated_idea": sorted(mutated), "novelty": round(novelty, 4)}


def idea_recombination(idea_a: set[str], idea_b: set[str]) -> dict:
    """Recombine two ideas into a hybrid; novel if it isn't simply one parent."""
    hybrid = idea_a | idea_b
    novel = hybrid != idea_a and hybrid != idea_b
    return {"hybrid": sorted(hybrid), "novel_combination": novel,
            "size": len(hybrid)}


def scientific_citation(citations: list[tuple[str, str]]) -> dict:
    """Scientific-citation graph (canonical name)."""
    return citation_graph(citations)
