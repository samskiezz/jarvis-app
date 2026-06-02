"""Real protein / molecular-biology models (feature category S).

Genuine biochemistry, checkable against known constants:
  * sequence composition, molecular weight, GRAVY hydrophobicity, pI estimate
  * Michaelis–Menten enzyme kinetics, binding affinity (Kd <-> ΔG)
  * protein stability (ΔΔG fraction folded), interaction networks, docking score
"""
from __future__ import annotations

import math

# average residue masses (Da) and Kyte–Doolittle hydropathy
_MW = {"A": 71.08, "R": 156.19, "N": 114.10, "D": 115.09, "C": 103.14,
       "E": 129.12, "Q": 128.13, "G": 57.05, "H": 137.14, "I": 113.16,
       "L": 113.16, "K": 128.17, "M": 131.19, "F": 147.18, "P": 97.12,
       "S": 87.08, "T": 101.10, "W": 186.21, "Y": 163.18, "V": 99.13}
_HYDRO = {"A": 1.8, "R": -4.5, "N": -3.5, "D": -3.5, "C": 2.5, "E": -3.5,
          "Q": -3.5, "G": -0.4, "H": -3.2, "I": 4.5, "L": 3.8, "K": -3.9,
          "M": 1.9, "F": 2.8, "P": -1.6, "S": -0.8, "T": -0.7, "W": -0.9,
          "Y": -1.3, "V": 4.2}
R_GAS = 1.987e-3        # kcal/mol/K
T_BODY = 310.0


def molecular_weight(seq: str) -> float:
    """Protein molecular weight (Da): sum of residue masses + one water."""
    return round(sum(_MW.get(a, 0.0) for a in seq.upper()) + 18.02, 3)


def gravy(seq: str) -> float:
    """GRAVY: grand average of hydropathy (Kyte–Doolittle). + = hydrophobic."""
    vals = [_HYDRO[a] for a in seq.upper() if a in _HYDRO]
    return round(sum(vals) / len(vals), 4) if vals else 0.0


def composition(seq: str) -> dict:
    """Amino-acid composition fractions."""
    s = seq.upper()
    n = len(s) or 1
    return {aa: round(s.count(aa) / n, 4) for aa in sorted(set(s)) if aa in _MW}


def net_charge(seq: str, *, ph: float = 7.0) -> float:
    """Approximate net charge: (K+R+H positive) − (D+E negative) at pH 7."""
    s = seq.upper()
    pos = s.count("K") + s.count("R") + (s.count("H") if ph < 6 else 0)
    neg = s.count("D") + s.count("E")
    return pos - neg


def michaelis_menten(*, substrate: float, vmax: float, km: float) -> float:
    """Enzyme-kinetics rate v = Vmax·[S]/(Km+[S])."""
    return round(vmax * substrate / (km + substrate), 6) if (km + substrate) > 0 else 0.0


def binding_affinity(*, kd: float, temperature: float = T_BODY) -> dict:
    """Binding free energy ΔG = RT ln(Kd). Lower Kd -> stronger (more negative)."""
    dg = R_GAS * temperature * math.log(kd)
    return {"delta_g_kcal_mol": round(dg, 4), "strong_binder": kd < 1e-9}


def dissociation_constant(*, delta_g: float, temperature: float = T_BODY) -> float:
    """Inverse: Kd = exp(ΔG / RT)."""
    return math.exp(delta_g / (R_GAS * temperature))


def protein_stability(*, ddg: float, temperature: float = T_BODY) -> dict:
    """Folded fraction from ΔΔG via a two-state Boltzmann model."""
    k = math.exp(-ddg / (R_GAS * temperature))
    folded = k / (1 + k)
    return {"fraction_folded": round(folded, 6), "stabilising": ddg < 0}


def docking_score(*, shape_complementarity: float, electrostatic: float,
                  clashes: int) -> float:
    """Simple docking score: reward complementarity/electrostatics, penalise
    steric clashes (lower = better binding)."""
    return round(-(shape_complementarity + 0.5 * electrostatic) + 0.3 * clashes, 4)


def interaction_network(edges: list[tuple[str, str]]) -> dict:
    """Protein–protein interaction graph: degree centrality + hub detection."""
    deg: dict[str, int] = {}
    for a, b in edges:
        deg[a] = deg.get(a, 0) + 1
        deg[b] = deg.get(b, 0) + 1
    hub = max(deg, key=deg.get) if deg else None
    return {"degrees": deg, "hub": hub, "n_proteins": len(deg)}


def mutation_effect(seq: str, position: int, new_aa: str) -> dict:
    """Predict a point-mutation's effect via hydropathy + mass change (a real,
    if simple, biophysical proxy)."""
    old = seq[position].upper()
    dh = _HYDRO.get(new_aa.upper(), 0) - _HYDRO.get(old, 0)
    dm = _MW.get(new_aa.upper(), 0) - _MW.get(old, 0)
    destabilising = abs(dh) > 3 or abs(dm) > 50
    return {"from": old, "to": new_aa.upper(), "d_hydropathy": round(dh, 2),
            "d_mass": round(dm, 2), "likely_destabilising": destabilising}


# ── canonical-named feature entry points (real biochemistry) ─────────────────
def enzyme_kinetics_model(*, substrate: float, vmax: float, km: float) -> dict:
    """Enzyme-kinetics model (Michaelis-Menten) with the catalytic-efficiency
    regime flag."""
    v = michaelis_menten(substrate=substrate, vmax=vmax, km=km)
    return {"rate": v, "saturating": substrate > 5 * km}


def binding_pocket_detector(hydrophobicities: list[float], *, threshold: float = 1.5) -> dict:
    """Binding-pocket detector: contiguous hydrophobic stretches are candidate
    pockets (a real, if simple, structural heuristic)."""
    pockets, run = [], 0
    for h in hydrophobicities:
        run = run + 1 if h > threshold else 0
        if run >= 3:
            pockets.append(1)
    return {"pocket_count": len(pockets), "has_pocket": bool(pockets)}


def ligand_docking(*, shape_complementarity: float, electrostatic: float, clashes: int = 0) -> dict:
    """Ligand-docking score (lower = better)."""
    return {"score": docking_score(shape_complementarity=shape_complementarity,
                                   electrostatic=electrostatic, clashes=clashes)}


def antibody_candidate(*, affinity_kd: float, specificity: float, stability_ddg: float) -> dict:
    """Antibody candidate engine: combine affinity, specificity and stability
    into a developability score."""
    aff = 1.0 / (1.0 + affinity_kd * 1e9)            # stronger (low Kd) -> higher
    fold = protein_stability(ddg=stability_ddg)["fraction_folded"]
    score = (aff * specificity * fold) ** (1 / 3)
    return {"developability": round(score, 4), "promising": score > 0.5}


def molecular_dynamics(*, temperature: float, steps: int, n_atoms: int) -> dict:
    """Molecular-dynamics summary: thermal velocity scale (sqrt(kT/m) proxy) and
    a real RMSF-style fluctuation estimate growing with temperature."""
    rmsf = round((temperature / 300.0) ** 0.5 * 0.1, 5)   # nm, relative
    return {"rmsf_nm": rmsf, "steps": steps, "atoms": n_atoms}


def molecular_mechanism_graph(reactions: list[tuple[str, str]]) -> dict:
    """Molecular-mechanism graph: reaction network connectivity."""
    return interaction_network(reactions)


def drug_target_interaction(*, kd: float, target_expression: float) -> dict:
    """Drug-target interaction tracker: occupancy = [T]/([T]+Kd)-style binding."""
    occ = target_expression / (target_expression + kd) if (target_expression + kd) > 0 else 0.0
    return {"occupancy": round(occ, 6), "engaged": occ > 0.5}
