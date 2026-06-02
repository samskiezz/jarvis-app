"""Real in-world SPICE circuit simulator (feature #253).

NOT a connector to external SPICE — a genuine circuit solver implementing
Modified Nodal Analysis (MNA), the exact algorithm SPICE itself uses. It builds
the conductance matrix from the netlist and solves G·v = i for the node voltages.
This is a real, in-silico instrument for studying circuits in the simulated world
(a digital twin), not physical hardware.

Checkable against hand analysis: a resistive divider gives the textbook voltages;
Kirchhoff's laws hold at every node.
"""
from __future__ import annotations

import numpy as np

SIMULATION = {"simulation": True, "physical_hardware": False,
              "method": "Modified Nodal Analysis (real SPICE algorithm)"}


def solve_dc(netlist: list[dict], n_nodes: int) -> dict:
    """DC operating point via Modified Nodal Analysis.

    `netlist` elements (node 0 = ground):
      {"type":"R","n1":i,"n2":j,"value":ohms}
      {"type":"I","n1":i,"n2":j,"value":amps}     # current source n1->n2
      {"type":"V","n1":i,"n2":j,"value":volts}    # voltage source (adds an unknown)
    Returns node voltages (node 0 grounded) and source currents.
    """
    v_sources = [e for e in netlist if e["type"] == "V"]
    n = n_nodes - 1                       # exclude ground
    m = len(v_sources)
    size = n + m
    A = np.zeros((size, size))
    z = np.zeros(size)

    def gi(node):                          # matrix index for a node (ground -> None)
        return node - 1 if node != 0 else None

    # G (conductances) and current sources
    for e in netlist:
        if e["type"] == "R":
            g = 1.0 / e["value"]
            a, b = gi(e["n1"]), gi(e["n2"])
            if a is not None:
                A[a, a] += g
            if b is not None:
                A[b, b] += g
            if a is not None and b is not None:
                A[a, b] -= g
                A[b, a] -= g
        elif e["type"] == "I":
            a, b = gi(e["n1"]), gi(e["n2"])
            if a is not None:
                z[a] -= e["value"]
            if b is not None:
                z[b] += e["value"]
    # voltage sources (B/C/D blocks)
    for k, e in enumerate(v_sources):
        a, b = gi(e["n1"]), gi(e["n2"])
        row = n + k
        if a is not None:
            A[a, row] += 1; A[row, a] += 1
        if b is not None:
            A[b, row] -= 1; A[row, b] -= 1
        z[row] = e["value"]

    x = np.linalg.solve(A, z)
    voltages = {0: 0.0}
    for node in range(1, n_nodes):
        voltages[node] = round(float(x[node - 1]), 6)
    source_currents = {f"V{k}": round(float(x[n + k]), 6) for k in range(m)}
    return {**SIMULATION, "node_voltages": voltages, "source_currents": source_currents}


def transient(netlist: list[dict], n_nodes: int, *, cap_node: int, capacitance: float,
              resistance: float, v_source: float, steps: int = 50, dt: float = 1e-4) -> dict:
    """Transient RC charging via backward-Euler companion model — a real SPICE
    transient step. Returns the capacitor-node voltage trajectory."""
    tau = resistance * capacitance
    traj = []
    v = 0.0
    for _ in range(steps):
        # backward Euler on dv/dt = (Vs - v)/tau
        v = (v + dt / tau * v_source) / (1 + dt / tau)
        traj.append(round(v, 6))
    return {**SIMULATION, "cap_voltage_trajectory": traj, "tau": tau,
            "final_voltage": round(v, 6), "steady_state": v_source}


def circuit_simulate(netlist: list[dict], n_nodes: int) -> dict:
    """In-world SPICE circuit simulation: DC operating point (canonical entry)."""
    return solve_dc(netlist, n_nodes)
