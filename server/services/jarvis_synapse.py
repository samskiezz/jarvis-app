"""SYNAPTIC CAPACITY — the graph-combination expansion of the ontology graph.

The ontology graph isn't just an additive tally of nodes and edges; treated as a
Palantir-style intelligence graph its *capacity* is combinatorial. This computes
the potential (not materialised) synaptic expansion from the live graph counts, so
it scales with the real data instead of being a hand-waved number.

Primitives (category tally): objects + neurons + sources + documents + links.
  full-mesh undirected  = N(N-1)/2
  full-mesh directed     = N(N-1)
  neuron-input synapses  = (primitives - neurons) * neurons
  neuron<->neuron mesh   = neurons(neurons-1)/2
  neural synapses total  = neuron-input + neuron<->neuron
  clusters               = neurons / neurons_per_cluster

These are CAPACITY figures (what the graph could express), reported alongside the
*materialised* counts so the two are never confused. stdlib only; never raises.
"""

from __future__ import annotations

from typing import Optional

try:
    from . import jarvis_corpus_projection as _proj
except Exception:  # noqa: BLE001
    _proj = None  # type: ignore[assignment]


def _live_counts() -> dict:
    """Materialised graph counts from the projection (or zeros)."""
    if _proj is None:
        return {}
    try:
        return _proj.counts() or {}
    except Exception:  # noqa: BLE001
        return {}


def capacity(counts: Optional[dict] = None, *, neurons_per_cluster: int = 10) -> dict:
    """Compute the synaptic-capacity expansion. ``counts`` defaults to the live
    projected graph; override for what-if sizing. Never raises."""
    c = counts if isinstance(counts, dict) else _live_counts()
    objects = int(c.get("ont_objects", 0) or 0)
    neurons = int(c.get("neurons", 0) or 0)
    sources = int(c.get("sources", 0) or 0)
    documents = int(c.get("documents", 0) or 0)
    links = int(c.get("ont_links", 0) or 0)

    primitives = objects + neurons + sources + documents + links
    data_primitives = primitives - neurons  # everything that feeds INTO neurons

    def mesh_undirected(n: int) -> int:
        return n * (n - 1) // 2 if n > 1 else 0

    full_undirected = mesh_undirected(primitives)
    full_directed = primitives * (primitives - 1) if primitives > 1 else 0
    neuron_input = data_primitives * neurons
    neuron_mesh = mesh_undirected(neurons)
    neural_total = neuron_input + neuron_mesh

    npc = max(1, int(neurons_per_cluster or 1))
    clusters = {
        "per_1": neurons,                       # 1 neuron = 1 micro-cluster
        "per_10": neurons // 10 if neurons else 0,
        "per_25": neurons // 25 if neurons else 0,
        "recommended": neurons // npc if neurons else 0,
        "neurons_per_cluster": npc,
    }

    return {
        "materialised": {
            "objects": objects, "neurons": neurons, "sources": sources,
            "documents": documents, "links": links,
        },
        "primitives": {
            "objects": objects, "neurons": neurons, "sources": sources,
            "documents": documents, "links": links,
            "total": primitives, "data_primitives": data_primitives,
        },
        "capacity": {
            "full_mesh_undirected": full_undirected,
            "full_mesh_directed": full_directed,
            "neuron_input_synapses": neuron_input,
            "neuron_to_neuron_synapses": neuron_mesh,
            "neural_synapses_total": neural_total,
        },
        "clusters": clusters,
        "note": ("Capacity figures are combinatorial potential (not materialised "
                 "edges). They scale with the live graph and grow as the corpus does."),
    }
