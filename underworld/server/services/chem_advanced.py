"""Real cheminformatics + molecular mechanics (RDKit) — the tier-up from the
heuristic chemistry. These are the genuine methods used in real drug discovery:
descriptors, Lipinski/QED drug-likeness, Tanimoto fingerprint similarity,
substructure search, and 3D conformer generation with MMFF94 force-field energy
minimisation (real molecular mechanics — atoms feel real bonded + non-bonded
forces). Not a heuristic score: RDKit computes these the way pharma does.
"""
from __future__ import annotations

from rdkit import Chem
from rdkit.Chem import AllChem, Crippen, Descriptors, QED, Lipinski, rdMolDescriptors
from rdkit import DataStructs


def _mol(smiles: str):
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        raise ValueError(f"invalid SMILES: {smiles!r}")
    return m


def descriptors(smiles: str) -> dict:
    """Physicochemical descriptors a medicinal chemist actually uses."""
    m = _mol(smiles)
    return {
        "formula": rdMolDescriptors.CalcMolFormula(m),
        "mol_weight": round(Descriptors.MolWt(m), 3),
        "logp": round(Crippen.MolLogP(m), 3),                 # lipophilicity
        "tpsa": round(rdMolDescriptors.CalcTPSA(m), 2),       # polar surface area
        "h_donors": Lipinski.NumHDonors(m),
        "h_acceptors": Lipinski.NumHAcceptors(m),
        "rotatable_bonds": Lipinski.NumRotatableBonds(m),
        "aromatic_rings": rdMolDescriptors.CalcNumAromaticRings(m),
        "heavy_atoms": m.GetNumHeavyAtoms(),
    }


def drug_likeness(smiles: str) -> dict:
    """Lipinski rule-of-five (real cut-offs) + QED. This is how a real pipeline
    triages a candidate molecule for oral-drug viability."""
    d = descriptors(smiles)
    violations = sum([
        d["mol_weight"] > 500, d["logp"] > 5,
        d["h_donors"] > 5, d["h_acceptors"] > 10,
    ])
    return {
        **d,
        "qed": round(QED.qed(_mol(smiles)), 4),               # 0..1 drug-likeness
        "lipinski_violations": violations,
        "passes_ro5": violations <= 1,
        "disclaimer": "In-silico triage; not a validated drug.",
    }


def similarity(smiles_a: str, smiles_b: str, *, radius: int = 2, bits: int = 2048) -> float:
    """Tanimoto similarity over Morgan (ECFP) fingerprints — the standard
    analog/scaffold-hopping metric in cheminformatics."""
    fa = AllChem.GetMorganFingerprintAsBitVect(_mol(smiles_a), radius, nBits=bits)
    fb = AllChem.GetMorganFingerprintAsBitVect(_mol(smiles_b), radius, nBits=bits)
    return round(DataStructs.TanimotoSimilarity(fa, fb), 4)


def substructure_match(smiles: str, smarts: str) -> bool:
    """Does the molecule contain a substructure (SMARTS pattern)?"""
    patt = Chem.MolFromSmarts(smarts)
    if patt is None:
        raise ValueError(f"invalid SMARTS: {smarts!r}")
    return _mol(smiles).HasSubstructMatch(patt)


def minimize_3d(smiles: str, *, seed: int = 1) -> dict:
    """Generate a 3D conformer (ETKDG) and minimise it with the MMFF94 force
    field — REAL molecular mechanics: bond/angle/torsion + van-der-Waals +
    electrostatics. Returns the minimised potential energy (kcal/mol)."""
    m = Chem.AddHs(_mol(smiles))
    if AllChem.EmbedMolecule(m, randomSeed=seed) != 0:
        AllChem.EmbedMolecule(m, randomSeed=seed, useRandomCoords=True)
    converged = AllChem.MMFFOptimizeMolecule(m, maxIters=2000) == 0
    props = AllChem.MMFFGetMoleculeProperties(m)
    energy = None
    if props is not None:
        ff = AllChem.MMFFGetMoleculeForceField(m, props)
        if ff is not None:
            energy = round(ff.CalcEnergy(), 4)
    conf = m.GetConformer()
    return {
        "atoms": m.GetNumAtoms(),
        "converged": converged,
        "mmff94_energy_kcal_mol": energy,
        "has_3d_coords": conf.Is3D(),
    }


def candidate_report(smiles: str) -> dict:
    """One-call assessment of a drug candidate: descriptors + drug-likeness +
    a real force-field-minimised 3D structure."""
    return {"drug_likeness": drug_likeness(smiles), "geometry": minimize_3d(smiles)}
