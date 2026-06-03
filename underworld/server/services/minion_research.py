"""Minion research dispatcher — wires the real engines into Minion lives.

This is what makes the 500-module toolbox *do* something: when a Minion does
cognitive work (calculate) or proposes an invention, it routes through the REAL
engine for its guild's craft and gets a grounded, computed result with a quality
score. A materials Minion really predicts a concrete mix's strength; a physics
Minion really integrates a heat-diffusion PDE; a computing Minion really runs a
quantum circuit. The quality of that real computation then:

  * grounds the invention's feasibility (so good real work is approved on merit,
    not on text length), and
  * teaches more (grounded practice raises skill faster).

Fast by design (tiny problems) so the per-tick cost stays low. Deterministic
given the seed for auditable replay.
"""
from __future__ import annotations

import math

# Each guild → a real engine + a representative real computation. The handler
# returns (summary, quality 0..1, quantity) from genuine numerics.


def _materials(seed: int) -> tuple[str, float, float]:
    from . import materials_advanced as ma
    from . import molecular_dynamics as md
    # design a candidate superconductor (real BCS) …
    tc = ma.superconductor_candidate(debye_temp=300 + (seed % 200),
                                     coupling=0.2 + (seed % 5) * 0.06, dos=1.0)["estimated_tc_k"]
    # … and run a REAL molecular-dynamics simulation of the candidate lattice
    # (velocity-Verlet Lennard-Jones); a stable lattice conserves energy.
    sim = md.run_md(n=32, steps=120, dt=0.001, temp=0.6 + (seed % 4) * 0.1, seed=seed)
    quality = max(0.0, min(1.0, 0.6 * (tc / 80.0) + 0.4 * (1.0 if sim["conserves_energy"] else 0.3)))
    return (f"Predicted critical temperature {tc:.1f} K and ran an MD lattice sim "
            f"(T={sim['temperature']}, energy stable={sim['conserves_energy']}).",
            quality, tc)


def _physics(seed: int) -> tuple[str, float, float]:
    from . import multiphysics as mp
    # transient heat diffusion — real explicit FTCS solve
    u0 = [0.0] * 5 + [100.0] + [0.0] * 5
    res = mp.heat_diffusion_1d(u0, alpha=0.5 + (seed % 4) * 0.1, dx=1.0, dt=0.2, steps=20)
    quality = 1.0 if res["stable"] else 0.3
    return f"Solved heat diffusion (stable={res['stable']}, peak {max(res['field']):.1f}).", quality, max(res["field"])


def _electrical(seed: int) -> tuple[str, float, float]:
    from . import electronics as el
    out = el.dc_circuit_solve(voltage=5.0 + (seed % 10), resistances=[100, 220], parallel=False)
    # a sensible (finite, positive) current is a good design
    quality = 1.0 if 0 < out["current"] < 1 else 0.5
    return f"Designed a circuit: {out['current']*1000:.1f} mA at {out['power']:.3f} W.", quality, out["current"]


def _mechanical(seed: int) -> tuple[str, float, float]:
    from . import multiphysics as mp
    r = mp.finite_element_1d(length=1.0 + (seed % 3), E=200e9, area=1e-4, force=1000 + seed % 500)
    err = abs(r["tip_displacement"] - r["analytic"])
    quality = 1.0 if err < 1e-6 else 0.6
    return f"FEM bar analysis: tip deflection {r['tip_displacement']*1e6:.2f} µm.", quality, r["tip_displacement"]


def _civil(seed: int) -> tuple[str, float, float]:
    from . import multiphysics as mp
    d = mp.beam_tip_deflection(load=1000 + seed % 800, length=2.0 + (seed % 4),
                               E=30e9, I=8e-4)  # concrete beam
    quality = 1.0 if d < 0.05 else 0.55       # a stiff (safe) beam scores well
    return f"Structural beam: tip deflection {d*1000:.2f} mm under load.", quality, d


def _computing(seed: int) -> tuple[str, float, float]:
    from . import quantum_sim as q
    val = abs(q.chsh_value())                  # real quantum circuit -> 2√2
    quality = max(0.0, min(1.0, val / (2 * math.sqrt(2))))
    return f"Ran a Bell circuit: CHSH S={val:.3f} (quantum advantage demonstrated).", quality, val


def _energy(seed: int) -> tuple[str, float, float]:
    from . import electronics as el
    b = el.battery_electrochemistry(e0=1.1 + (seed % 5) * 0.2, n=2, q_reaction=1.0)
    v = b["cell_voltage"]
    quality = max(0.0, min(1.0, v / 3.0))
    return f"Designed a cell: {v:.2f} V via Nernst electrochemistry.", quality, v


def _maths(seed: int) -> tuple[str, float, float]:
    from . import experiment_design as ed
    import numpy as np
    # fit a real response surface to a noisy quadratic and find its optimum
    rng = np.random.default_rng(seed)
    X = rng.uniform(-5, 5, size=(40, 2))
    y = -((X[:, 0] - 1) ** 2 + (X[:, 1] + 2) ** 2) + 10
    rs = ed.response_surface_fit(X, y)
    quality = max(0.0, min(1.0, rs.r2))
    return f"Fit a response surface (R²={rs.r2:.3f}) and located its optimum.", quality, rs.r2


def _agriculture(seed: int) -> tuple[str, float, float]:
    """Grounded by REAL bioinformatics (Biopython) + cheminformatics (RDKit):
    engineer a crop gene → translate → assess the protein, and screen an
    agrochemical candidate for drug-likeness. Tier-2/3, not a heuristic."""
    import random
    from . import synbio as sb, bio_advanced as bio, chem_advanced as chem
    f = sb.fermentation(s0=100, x0=1.0, mu_max=0.4 + (seed % 4) * 0.1, ks=5.0, yield_xs=0.5)

    rng = random.Random(seed)
    gene = "ATG" + "".join(rng.choice("ATGC") for _ in range(90))
    peptide = (bio.translate(gene)["protein"].split("*")[0] or "M")
    prot = bio.protein_params(peptide if len(peptide) >= 2 else "MA")

    panel = ["CCO", "CC(=O)Oc1ccccc1C(=O)O", "Cn1cnc2c1c(=O)n(C)c(=O)n2C",
             "CC(C)Cc1ccc(cc1)C(C)C(=O)O", "O=C(O)c1ccccc1O"]
    dl = chem.drug_likeness(panel[seed % len(panel)])

    quality = max(0.0, min(1.0, 0.4 * (f["final_biomass"] / 50.0)
                           + 0.3 * (1.0 if prot["stable"] else 0.4)
                           + 0.3 * dl["qed"]))
    return (f"Engineered a crop protein ({prot['length']} aa, stable={prot['stable']}, "
            f"pI {prot['isoelectric_point']}) and screened an agrochemical "
            f"(QED {dl['qed']}, Ro5={'pass' if dl['passes_ro5'] else 'fail'}); "
            f"bioprocess yield {f['final_biomass']:.1f}.",
            quality, f["final_biomass"])


_DISPATCH = {
    "materials": _materials, "physics": _physics, "electrical": _electrical,
    "mechanical": _mechanical, "civil": _civil, "computing": _computing,
    "energy": _energy, "maths": _maths, "agriculture": _agriculture,
}


def run_research(guild: str, *, seed: int) -> dict:
    """Run the real, guild-appropriate computation. Returns a grounded result
    with a quality score in [0,1]. Guilds without a dedicated engine (patent,
    safety) get a neutral, honest result."""
    handler = _DISPATCH.get(guild)
    if handler is None:
        return {"guild": guild, "grounded": False, "engine": None,
                "summary": "Reviewed and synthesised existing work.",
                "quality": 0.5, "quantity": 0.0}
    try:
        summary, quality, quantity = handler(seed)
    except Exception as exc:  # never let a solver hiccup break a tick
        return {"guild": guild, "grounded": False, "engine": handler.__name__,
                "summary": f"Investigation inconclusive ({type(exc).__name__}).",
                "quality": 0.4, "quantity": 0.0}
    return {"guild": guild, "grounded": True, "engine": handler.__name__.lstrip("_"),
            "summary": summary, "quality": round(float(quality), 4),
            "quantity": round(float(quantity), 6)}
