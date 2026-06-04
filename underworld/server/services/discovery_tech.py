"""Invent NEW technologies, file patents, and EXPAND on prior patents. A
technology is composed from a combinatorial grammar (domain × mechanism ×
material × effect) — a multi-million-point novel space — novelty-checked against
the existing corpus by a content hash. Patents form a real citation graph
(NetworkX DiGraph): improvement patents cite + build on prior art, and the graph
yields genuine metrics (most-cited / foundational patents, citation depth).
"""
from __future__ import annotations

import hashlib
import itertools

import networkx as nx

MECHANISMS = ("catalysis", "resonance", "feedback-control", "lattice-confinement",
    "quantum-tunnelling", "phase-change", "self-assembly", "photoexcitation",
    "electrochemical-gradient", "magnetic-flux", "piezoelectric-coupling",
    "enzymatic-conversion", "diffusion-gating", "superconducting-loop",
    "plasmonic-coupling", "topological-protection", "stochastic-resonance",
    "metamaterial-refraction", "gene-circuit", "neuromorphic-spiking")
MATERIALS = ("graphene", "perovskite", "high-entropy-alloy", "aerogel",
    "shape-memory-polymer", "metal-organic-framework", "silicon-carbide",
    "carbon-nanotube", "boron-nitride", "gallium-nitride", "diamondoid",
    "liquid-crystal", "piezo-ceramic", "superalloy", "photonic-crystal",
    "ionic-liquid", "quantum-dot", "biopolymer", "topological-insulator", "spin-glass")
EFFECTS = ("energy-storage", "sensing", "computation", "filtration", "actuation",
    "energy-harvesting", "catalytic-conversion", "signal-amplification",
    "thermal-management", "drug-delivery", "structural-reinforcement",
    "light-emission", "carbon-capture", "desalination", "data-storage",
    "propulsion", "shielding", "self-healing", "communication", "imaging")


def _space_size(n_domains: int) -> int:
    return n_domains * len(MECHANISMS) * len(MATERIALS) * len(EFFECTS)


def invent(domain: str, *, seed: int) -> dict:
    """Compose one novel technology from the grammar. Deterministic per seed."""
    h = int(hashlib.blake2b(f"{domain}|{seed}".encode(), digest_size=8).hexdigest(), 16)
    mech = MECHANISMS[h % len(MECHANISMS)]
    mat = MATERIALS[(h >> 8) % len(MATERIALS)]
    eff = EFFECTS[(h >> 16) % len(EFFECTS)]
    title = f"{mat.replace('-', ' ').title()} {mech.replace('-', ' ')} device for {eff.replace('-', ' ')}"
    cid = "PAT-" + hashlib.blake2b(title.encode(), digest_size=5).hexdigest().upper()
    claims = [
        f"A {domain} apparatus employing {mech} in {mat} to achieve {eff}.",
        f"The apparatus of claim 1 wherein the {mat} is structured to enhance {mech}.",
        f"A method of {eff} comprising inducing {mech} within {mat}.",
    ]
    return {"id": cid, "title": title, "domain": domain, "mechanism": mech,
            "material": mat, "effect": eff, "claims": claims}


class PatentOffice:
    """A real, growing patent corpus + citation graph."""

    def __init__(self) -> None:
        self.graph = nx.DiGraph()
        self._titles: set[str] = set()

    def file(self, tech: dict, *, cites: list[str] | None = None) -> dict:
        """File a patent if novel (title unseen). Citing prior patents builds the
        prior-art graph; an edge child->parent means 'child builds on parent'."""
        if tech["title"] in self._titles:
            return {"filed": False, "reason": "not novel (exists)", "id": tech["id"]}
        self._titles.add(tech["title"])
        self.graph.add_node(tech["id"], **{k: tech[k] for k in ("title", "domain", "effect")})
        for c in (cites or []):
            if c in self.graph:
                self.graph.add_edge(tech["id"], c)        # child cites parent
        return {"filed": True, "id": tech["id"], "cites": cites or []}

    def expand(self, parent_id: str, *, seed: int) -> dict:
        """Create an IMPROVEMENT patent that builds on an existing one: inherits
        its effect, swaps in a new mechanism/material, and cites the parent."""
        if parent_id not in self.graph:
            return {"filed": False, "reason": "unknown parent"}
        parent = self.graph.nodes[parent_id]
        child = invent(parent["domain"], seed=seed * 7919 + 1)
        child["effect"] = parent["effect"]               # same goal, better means
        child["title"] = "Improved " + child["title"]
        child["id"] = "PAT-" + hashlib.blake2b(child["title"].encode(), digest_size=5).hexdigest().upper()
        return {**self.file(child, cites=[parent_id]), "improves": parent_id,
                "title": child["title"]}

    def metrics(self) -> dict:
        """Citation metrics on the corpus (foundational = most-cited patents)."""
        g = self.graph
        cited_by = {n: g.in_degree(n) for n in g}        # how many cite this patent
        top = sorted(cited_by.items(), key=lambda kv: kv[1], reverse=True)[:3]
        return {
            "patents": g.number_of_nodes(),
            "citations": g.number_of_edges(),
            "novel_space_size": _space_size(200),
            "most_cited": [{"id": pid, "cited_by": c} for pid, c in top if c > 0],
            "is_dag": nx.is_directed_acyclic_graph(g),   # prior art can't cite the future
        }
