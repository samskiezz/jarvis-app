"""Civilisation Knowledge Graph + Reality Validation Layer.

This is the keystone the design called "the heart of the simulation" and the
"non-negotiable" missing layer. It unifies every kind of knowledge a world
holds — facts, skills, materials, patents, inventions, beliefs, institutions —
into ONE typed node/edge graph, and stamps every node with a *confidence class*
so the system can be imaginative without lying about what is real.

Two pure cores live here (no DB, no LLM — fully unit-testable):

  ConfidenceClass   the A–E reality-validation ladder (#6 in the upgrade spec).
  KnowledgeGraph    typed nodes + typed edges with prerequisite reasoning,
                    novelty scoring, and "what can be invented next" queries.

The graph is intentionally storage-agnostic: callers hydrate it from the DB
(Patent, Invention, Discovery, KnowledgeConcept, CausalBelief rows) and read
back derived intelligence. Nothing here invents facts — it only relates and
classifies the facts the world already earned.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable


# ── #6 Reality Validation: the A–E confidence ladder ─────────────────────────
class ConfidenceClass(str, Enum):
    """How much we trust a knowledge node. Lower letter = more grounded.

    A  physics-backed     — follows from the deterministic engine / conservation laws
    B  literature-backed  — a real patent or paper documents the mechanism
    C  simulation-inferred — emerged from the world model, not yet externally checked
    D  speculative        — a plausible novel combination, untested
    E  narrative          — in-fiction only (souls, reincarnation, the Console)
    """

    A_PHYSICS = "A"
    B_LITERATURE = "B"
    C_SIMULATION = "C"
    D_SPECULATIVE = "D"
    E_NARRATIVE = "E"

    @property
    def is_real(self) -> bool:
        """A/B are externally defensible; C/D are internal; E is fiction."""
        return self in (ConfidenceClass.A_PHYSICS, ConfidenceClass.B_LITERATURE)

    @property
    def rank(self) -> int:
        return {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}[self.value]


# Node kinds the civilisation graph understands. Maps onto real DB entities.
class NodeKind(str, Enum):
    FACT = "fact"
    SKILL = "skill"
    MATERIAL = "material"
    METHOD = "method"
    PATENT = "patent"
    INVENTION = "invention"
    BELIEF = "belief"
    INSTITUTION = "institution"
    INSTRUMENT = "instrument"   # measurement tech — the design's "big missing" #1
    PRINCIPLE = "principle"     # a scientific law / formula


# Typed edges (the design's explicit list).
class EdgeKind(str, Enum):
    REQUIRES = "requires"
    CONTRADICTS = "contradicts"
    IMPROVES = "improves"
    REPLACES = "replaces"
    DERIVED_FROM = "derived_from"
    DISCOVERED_BY = "discovered_by"
    DOCUMENTED_IN = "documented_in"
    TAUGHT_BY = "taught_by"
    PATENTED_BY = "patented_by"
    REPLICATED_BY = "replicated_by"
    BANNED_BY = "banned_by"
    LOST_BECAUSE = "lost_because"
    REDISCOVERED_THROUGH = "rediscovered_through"


@dataclass(frozen=True)
class Node:
    id: str
    kind: NodeKind
    label: str
    confidence: ConfidenceClass
    # Free-form provenance so validation can be audited (#6 / grounding).
    source: str = ""
    meta: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Edge:
    src: str
    dst: str
    kind: EdgeKind
    weight: float = 1.0


class KnowledgeGraph:
    """A typed directed graph of everything a civilisation knows.

    Pure in-memory structure. Hydrate from the DB, reason, read back. The
    reasoning methods are what make it "an engine of civilisation" rather than
    a pile of features: prerequisite closure, comprehension gating, novelty
    scoring, and invention-frontier discovery.
    """

    def __init__(self) -> None:
        self._nodes: dict[str, Node] = {}
        self._out: dict[str, list[Edge]] = {}
        self._in: dict[str, list[Edge]] = {}

    # ── construction ─────────────────────────────────────────────────────────
    def add_node(self, node: Node) -> None:
        self._nodes[node.id] = node
        self._out.setdefault(node.id, [])
        self._in.setdefault(node.id, [])

    def add_edge(self, edge: Edge) -> None:
        # Tolerate edges that reference not-yet-added nodes by creating stubs;
        # the hydrator may add nodes and edges in any order.
        for nid in (edge.src, edge.dst):
            self._out.setdefault(nid, [])
            self._in.setdefault(nid, [])
        self._out[edge.src].append(edge)
        self._in[edge.dst].append(edge)

    # ── basic access ─────────────────────────────────────────────────────────
    def node(self, nid: str) -> Node | None:
        return self._nodes.get(nid)

    def __len__(self) -> int:
        return len(self._nodes)

    def nodes_of(self, kind: NodeKind) -> list[Node]:
        return [n for n in self._nodes.values() if n.kind == kind]

    def edges_from(self, nid: str, kind: EdgeKind | None = None) -> list[Edge]:
        return [e for e in self._out.get(nid, []) if kind is None or e.kind == kind]

    # ── reasoning: prerequisites & comprehension ─────────────────────────────
    def prerequisites(self, nid: str) -> set[str]:
        """Transitive closure of REQUIRES edges — everything `nid` depends on.

        This is the comprehension gate (#4): a Minion cannot truly build an
        invention until every prerequisite node is itself known.
        """
        seen: set[str] = set()
        stack = [e.dst for e in self.edges_from(nid, EdgeKind.REQUIRES)]
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            stack.extend(e.dst for e in self.edges_from(cur, EdgeKind.REQUIRES))
        return seen

    def can_comprehend(self, nid: str, known: Iterable[str]) -> tuple[bool, set[str]]:
        """Can a Minion who `known` these nodes understand `nid`?

        Returns (ok, missing_prereqs). Embodies "understanding not copying":
        scanning a patent gives the object, but comprehension needs every
        upstream principle/material/skill present.
        """
        known_set = set(known)
        missing = self.prerequisites(nid) - known_set
        return (len(missing) == 0, missing)

    def invention_frontier(self, known: Iterable[str]) -> list[str]:
        """Nodes that become comprehensible the moment one more prereq is met.

        This is the "what can we invent next" feed — the playable surface over
        emergent depth (#hardest-problem 4). A node is on the frontier if it is
        not yet known but all-but-at-most-one of its prerequisites are.
        """
        known_set = set(known)
        frontier: list[str] = []
        for nid in self._nodes:
            if nid in known_set:
                continue
            missing = self.prerequisites(nid) - known_set
            if 0 < len(missing) <= 1:
                frontier.append(nid)
        return frontier

    # ── reasoning: novelty (the prior-art conflict engine, #8 big-missing) ───
    def novelty(self, prereq_ids: Iterable[str]) -> dict:
        """Score how novel a *new* combination of existing nodes is.

        Real inventions are mostly new arrangements of old principles (#5). An
        idea built only from grounded (A/B) prior art with no existing node
        already combining them is "novel combination"; reusing an arrangement
        that an existing INVENTION/PATENT node already covers is "anticipated".
        """
        prereqs = [p for p in prereq_ids if p in self._nodes]
        if not prereqs:
            return {"novelty": 0.0, "inventive_step": "none", "anticipated_by": None}

        # Anticipation: does any single invention/patent node already REQUIRE
        # exactly this set (or a superset)?
        target = set(prereqs)
        for n in self._nodes.values():
            if n.kind not in (NodeKind.INVENTION, NodeKind.PATENT):
                continue
            covered = {e.dst for e in self.edges_from(n.id, EdgeKind.REQUIRES)}
            if target.issubset(covered):
                return {"novelty": 0.1, "inventive_step": "weak",
                        "anticipated_by": n.id}

        # Inventive step grows with how many distinct grounded domains combine.
        grounded = sum(1 for p in prereqs
                       if self._nodes[p].confidence.is_real)
        spread = len({self._nodes[p].kind for p in prereqs})
        novelty = min(1.0, 0.25 * spread + 0.1 * grounded)
        step = "strong" if novelty >= 0.6 else "medium" if novelty >= 0.35 else "weak"
        return {"novelty": round(novelty, 2), "inventive_step": step,
                "anticipated_by": None}

    # ── validation summary (#6) ──────────────────────────────────────────────
    def validation_breakdown(self) -> dict[str, int]:
        """Count nodes by confidence class — the world's epistemic health.

        A civilisation heavy in A/B is doing real science; one drifting into
        D/E is speculating or mythologising. This is a first-class metric.
        """
        out = {c.value: 0 for c in ConfidenceClass}
        for n in self._nodes.values():
            out[n.confidence.value] += 1
        return out

    def real_fraction(self) -> float:
        """Share of nodes that are externally defensible (A or B)."""
        if not self._nodes:
            return 0.0
        real = sum(1 for n in self._nodes.values() if n.confidence.is_real)
        return round(real / len(self._nodes), 3)


# ── classification helpers: map real DB rows → confidence classes ────────────
def classify_patent() -> ConfidenceClass:
    # A real (expired) patent documents a mechanism → literature-backed.
    return ConfidenceClass.B_LITERATURE


def classify_principle(from_physics_engine: bool) -> ConfidenceClass:
    return ConfidenceClass.A_PHYSICS if from_physics_engine else ConfidenceClass.B_LITERATURE


def classify_invention(*, replicated: bool, physics_ok: bool) -> ConfidenceClass:
    """A proposed invention earns its class.

    - replicated by independent Minion labs AND physics-consistent → C (the
      world model now trusts it, pending external check);
    - physics-consistent but not yet replicated → D (speculative);
    - replicated but physics-questionable → D (replication of a flawed result).
    """
    if replicated and physics_ok:
        return ConfidenceClass.C_SIMULATION
    return ConfidenceClass.D_SPECULATIVE


def classify_belief() -> ConfidenceClass:
    # Minion beliefs are unverified until tested — speculative by default.
    return ConfidenceClass.D_SPECULATIVE


def classify_narrative() -> ConfidenceClass:
    # Souls, reincarnation, Console theology — fiction, and labelled as such.
    return ConfidenceClass.E_NARRATIVE
