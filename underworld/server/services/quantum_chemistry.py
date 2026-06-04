"""Real ab-initio quantum chemistry (PySCF) — the chemistry/materials tier-up
from heuristics to genuine electronic-structure theory: Hartree-Fock and DFT
solve the molecular Schrödinger equation (in a basis) for the true ground-state
energy, orbital energies (HOMO-LUMO gap) and dipole moment. This is the actual
method computational-chemistry and drug/materials companies run; H2/STO-3G
reproduces the textbook -1.117 Hartree.
"""
from __future__ import annotations

HARTREE_TO_EV = 27.211386245988


def _build(atom: str, basis: str):
    from pyscf import gto
    return gto.M(atom=atom, basis=basis, verbose=0)


def molecule_energy(atom: str, *, basis: str = "sto-3g", method: str = "hf") -> dict:
    """Ground-state energy of a molecule. `atom` is PySCF geometry, e.g.
    'H 0 0 0; H 0 0 0.74'. method='hf' (Hartree-Fock) or 'dft' (B3LYP)."""
    from pyscf import scf, dft
    mol = _build(atom, basis)
    if method == "dft":
        mf = dft.RKS(mol); mf.xc = "b3lyp"
    else:
        mf = scf.RHF(mol)
    e = float(mf.kernel())
    homo_lumo = _homo_lumo(mf)
    return {
        "method": method.upper(), "basis": basis,
        "total_energy_hartree": round(e, 6),
        "total_energy_ev": round(e * HARTREE_TO_EV, 4),
        "converged": bool(mf.converged),
        **homo_lumo,
    }


def _homo_lumo(mf) -> dict:
    try:
        import numpy as np
        occ = mf.mo_occ
        e_mo = mf.mo_energy
        homo = float(np.max(e_mo[occ > 0]))
        lumo_arr = e_mo[occ == 0]
        lumo = float(np.min(lumo_arr)) if len(lumo_arr) else None
        gap = round((lumo - homo) * HARTREE_TO_EV, 4) if lumo is not None else None
        return {"homo_ev": round(homo * HARTREE_TO_EV, 4),
                "lumo_ev": round(lumo * HARTREE_TO_EV, 4) if lumo is not None else None,
                "homo_lumo_gap_ev": gap}
    except Exception:
        return {"homo_ev": None, "lumo_ev": None, "homo_lumo_gap_ev": None}


def dipole_moment(atom: str, *, basis: str = "sto-3g") -> dict:
    """Permanent electric dipole moment (Debye) from the converged HF density."""
    from pyscf import scf
    import numpy as np
    mol = _build(atom, basis)
    mf = scf.RHF(mol); mf.kernel()
    d = mf.dip_moment(unit="Debye", verbose=0)
    return {"dipole_debye": round(float(np.linalg.norm(d)), 4)}


def bond_scan(elem_a: str, elem_b: str, *, basis: str = "sto-3g",
              start: float = 0.5, stop: float = 2.0, steps: int = 12) -> dict:
    """Scan a diatomic's energy vs bond length and find the equilibrium bond
    length — a real potential-energy-surface calculation."""
    from pyscf import scf
    best_r, best_e = None, 1e9
    curve = []
    for i in range(steps):
        r = start + (stop - start) * i / (steps - 1)
        mol = _build(f"{elem_a} 0 0 0; {elem_b} 0 0 {r:.4f}", basis)
        e = float(scf.RHF(mol).kernel())
        curve.append((round(r, 4), round(e, 6)))
        if e < best_e:
            best_e, best_r = e, r
    return {"equilibrium_bond_length_angstrom": round(best_r, 4),
            "minimum_energy_hartree": round(best_e, 6), "curve": curve}
