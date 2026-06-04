"""End-to-end in-silico drug-discovery pipeline that USES the tier-2/3 tools
(RDKit + Biopython) on a real target + candidate — the genuine workflow a
discovery team runs before any wet-lab:

  target protein  -> ProtParam physicochemistry (Biopython)
  candidate molecule (SMILES) -> descriptors, Lipinski/QED, 3D MMFF94 geometry (RDKit)
  -> a transparent binding/developability score + go/no-go triage.

It is honest about being in-silico: every result needs wet-lab + clinical
validation. This is the real candidate-generation layer, not a cure.
"""
from __future__ import annotations

from underworld.server.services import bio_advanced as BIO
from underworld.server.services import chem_advanced as CHEM


def _binding_estimate(desc: dict, protein: dict) -> float:
    """A transparent (not hidden) in-silico binding/developability heuristic from
    real descriptors: rewards moderate lipophilicity (logP ~2-4), low polar
    surface area for permeability, and size complementarity to the target. This
    is a triage signal, NOT a docking free energy."""
    logp = desc["logp"]; tpsa = desc["tpsa"]; mw = desc["mol_weight"]
    logp_term = max(0.0, 1.0 - abs(logp - 3.0) / 3.0)          # peak near logP 3
    perm_term = max(0.0, 1.0 - tpsa / 140.0)                   # <140 A^2 = permeable
    size_term = max(0.0, 1.0 - abs(mw - 350.0) / 350.0)        # drug-like mass
    # gentle modulation by target hydrophobicity (GRAVY): lipophilic pockets like
    # lipophilic ligands.
    gravy = protein.get("gravy", 0.0)
    fit = 1.0 - min(1.0, abs(logp / 5.0 - (gravy + 1) / 2) )
    score = 0.30 * logp_term + 0.25 * perm_term + 0.25 * size_term + 0.20 * fit
    return round(max(0.0, min(1.0, score)), 4)


def screen_candidate(target_protein: str, candidate_smiles: str) -> dict:
    """Evaluate one (target, molecule) pair with the real tools."""
    protein = BIO.protein_params(target_protein)
    mol = CHEM.drug_likeness(candidate_smiles)
    geom = CHEM.minimize_3d(candidate_smiles)
    binding = _binding_estimate(mol, protein)
    # overall in-silico promise: drug-likeness AND binding AND a stable target
    promise = round(0.45 * mol["qed"] + 0.45 * binding + 0.10 * (1.0 if protein["stable"] else 0.4), 4)
    return {
        "target": protein,
        "candidate": mol,
        "geometry": geom,
        "binding_estimate": binding,
        "promise": promise,
        "recommend": promise > 0.55 and mol["passes_ro5"],
        "disclaimer": "In-silico candidate only — requires wet-lab + clinical validation.",
    }


def rank_library(target_protein: str, library: dict[str, str]) -> list[dict]:
    """Virtual-screen a small library {name: SMILES} against a target and rank by
    in-silico promise — the real triage step before committing lab resources."""
    out = []
    for name, smi in library.items():
        try:
            r = screen_candidate(target_protein, smi)
            out.append({"name": name, "smiles": smi, "promise": r["promise"],
                        "qed": r["candidate"]["qed"], "binding": r["binding_estimate"],
                        "recommend": r["recommend"]})
        except Exception as e:
            out.append({"name": name, "smiles": smi, "error": str(e)[:80]})
    return sorted(out, key=lambda x: x.get("promise", -1), reverse=True)
