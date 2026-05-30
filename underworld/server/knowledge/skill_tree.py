"""A structured, multi-hundred-node skill tree (doc I.61).

Rather than a flat list of skills, every domain breaks into concepts, and every
concept climbs four levels — Foundations → Applied → Advanced → Frontier — where
each level requires the one below it in the same concept. That yields a real
dependency graph with hundreds of nodes that the simulation and UI can reason
about (what a Minion can learn next, how deep a mastery runs).

The tree is generated deterministically so it's stable across processes.
"""

from __future__ import annotations

from dataclasses import dataclass, field

LEVELS = ("Foundations", "Applied", "Advanced", "Frontier")

# domain → the concepts that make it up
_DOMAIN_CONCEPTS: dict[str, tuple[str, ...]] = {
    "maths": ("algebra", "calculus", "statistics", "topology", "number theory", "optimisation"),
    "physics": ("mechanics", "thermodynamics", "electromagnetism", "optics", "quantum", "relativity"),
    "electrical": ("circuits", "signals", "control", "power", "rf", "embedded"),
    "mechanical": ("statics", "dynamics", "fluids", "thermo systems", "robotics", "manufacturing"),
    "computing": ("algorithms", "architecture", "networks", "databases", "machine learning", "security"),
    "civil": ("structures", "geotechnics", "hydraulics", "transport", "surveying", "materials civil"),
    "materials": ("metallurgy", "polymers", "ceramics", "composites", "semiconductors", "nanomaterials"),
    "energy": ("combustion", "photovoltaics", "wind", "nuclear", "storage", "grid"),
    "agriculture": ("soil science", "genetics crops", "irrigation", "pest control", "husbandry", "agronomy"),
}


@dataclass(frozen=True)
class SkillNode:
    id: str
    name: str
    domain: str
    concept: str
    level: int                       # 0..3
    prerequisites: tuple[str, ...] = field(default_factory=tuple)


def _build() -> dict[str, SkillNode]:
    tree: dict[str, SkillNode] = {}
    for domain, concepts in _DOMAIN_CONCEPTS.items():
        for concept in concepts:
            for level, label in enumerate(LEVELS):
                node_id = f"{domain}:{concept}:{level}"
                prereqs = (f"{domain}:{concept}:{level - 1}",) if level > 0 else ()
                tree[node_id] = SkillNode(
                    id=node_id,
                    name=f"{label} {concept.title()}",
                    domain=domain,
                    concept=concept,
                    level=level,
                    prerequisites=prereqs,
                )
    return tree


SKILL_TREE: dict[str, SkillNode] = _build()


def get_node(node_id: str) -> SkillNode | None:
    return SKILL_TREE.get(node_id)


def prerequisites_satisfied(node_id: str, owned: set[str]) -> bool:
    node = SKILL_TREE.get(node_id)
    if node is None:
        return False
    return all(p in owned for p in node.prerequisites)


def unlockable(owned: set[str]) -> list[str]:
    """Nodes whose prerequisites are met but which aren't yet owned."""
    return [
        nid for nid, node in SKILL_TREE.items()
        if nid not in owned and prerequisites_satisfied(nid, owned)
    ]


def domain_of(concept_or_skill: str) -> str | None:
    """Best-effort map a free-form skill name onto a tree domain."""
    s = concept_or_skill.lower()
    for domain, concepts in _DOMAIN_CONCEPTS.items():
        if s == domain or any(c in s or s in c for c in concepts):
            return domain
    return None


def stats() -> dict[str, int]:
    return {
        "domains": len(_DOMAIN_CONCEPTS),
        "concepts": sum(len(c) for c in _DOMAIN_CONCEPTS.values()),
        "nodes": len(SKILL_TREE),
        "levels": len(LEVELS),
    }
