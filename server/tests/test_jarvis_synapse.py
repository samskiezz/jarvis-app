"""Synaptic-capacity expansion: the combinatorial graph maths must be exact."""

from __future__ import annotations

from server.services import jarvis_synapse as syn

# The reference graph (132,119 objects / 10,000 neurons / 92,000 sources /
# 30,000 documents / 177,000 links) and its verified expansion.
COUNTS = {"ont_objects": 132119, "neurons": 10000, "sources": 92000,
          "documents": 30000, "ont_links": 177000}


def test_capacity_matches_reference_expansion():
    r = syn.capacity(COUNTS)
    p, cap, cl = r["primitives"], r["capacity"], r["clusters"]
    assert p["total"] == 441119
    assert p["data_primitives"] == 431119
    assert cap["full_mesh_undirected"] == 97_292_765_521
    assert cap["full_mesh_directed"] == 194_585_531_042
    assert cap["neuron_input_synapses"] == 4_311_190_000
    assert cap["neuron_to_neuron_synapses"] == 49_995_000
    assert cap["neural_synapses_total"] == 4_361_185_000
    assert cl["per_10"] == 1000 and cl["per_25"] == 400 and cl["per_1"] == 10000


def test_capacity_scales_with_graph():
    small = syn.capacity({"ont_objects": 10, "neurons": 4, "sources": 0,
                          "documents": 0, "ont_links": 0})
    # primitives = 14; undirected = 14*13/2 = 91; neuron mesh = 4*3/2 = 6
    assert small["primitives"]["total"] == 14
    assert small["capacity"]["full_mesh_undirected"] == 91
    assert small["capacity"]["neuron_to_neuron_synapses"] == 6


def test_capacity_empty_is_safe():
    r = syn.capacity({})
    assert r["primitives"]["total"] == 0
    assert r["capacity"]["full_mesh_undirected"] == 0
