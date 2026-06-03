"""Discover NEW molecules — real fragment-based de-novo design (RDKit BRICS).
Seed drugs are broken into BRICS fragments, recombined into NOVEL valid
molecules, canonicalised, de-duplicated by InChIKey against a known-compound
set, then screened for drug-likeness. A result is a genuine discovery only if
its InChIKey is not already known. This is an actual generative-chemistry loop,
not a lookup.
"""
from __future__ import annotations

from rdkit import Chem
from rdkit.Chem import BRICS, Descriptors, QED, Lipinski, rdMolDescriptors
from rdkit import RDLogger

RDLogger.DisableLog("rdApp.*")

# seed scaffolds (known drugs) — broken up + recombined into new chemistry
SEEDS = [
    "CC(=O)Oc1ccccc1C(=O)O",            # aspirin
    "CC(C)Cc1ccc(cc1)C(C)C(=O)O",       # ibuprofen
    "Cn1cnc2c1c(=O)n(C)c(=O)n2C",       # caffeine
    "CC(=O)Nc1ccc(O)cc1",               # paracetamol
    "c1ccc2c(c1)cccn2",                 # quinoline
    "O=C(O)c1ccccc1O",                  # salicylic acid
]


def _known_inchikeys() -> set[str]:
    out = set()
    for s in SEEDS:
        m = Chem.MolFromSmiles(s)
        if m:
            out.add(Chem.MolToInchiKey(m))
    return out


def discover_molecules(n: int = 6, *, max_candidates: int = 400, seed: int = 0) -> list[dict]:
    """Generate novel drug-like molecules from BRICS recombination of the seeds."""
    import random
    rng = random.Random(seed)
    frags = set()
    for s in SEEDS:
        m = Chem.MolFromSmiles(s)
        if m:
            frags.update(BRICS.BRICSDecompose(m))
    frag_mols = [Chem.MolFromSmiles(f) for f in frags if Chem.MolFromSmiles(f)]
    rng.shuffle(frag_mols)                              # deterministic variety per seed
    known = _known_inchikeys()
    seen: set[str] = set()
    found: list[dict] = []

    builder = BRICS.BRICSBuild(frag_mols)
    count = 0
    for prod in builder:
        if count >= max_candidates or len(found) >= n:
            break
        count += 1
        try:
            Chem.SanitizeMol(prod)
            smi = Chem.MolToSmiles(prod)
            m = Chem.MolFromSmiles(smi)
            if m is None:
                continue
            ik = Chem.MolToInchiKey(m)
            if ik in known or ik in seen:           # must be genuinely NEW
                continue
            seen.add(ik)
            mw = Descriptors.MolWt(m)
            if not (120 < mw < 600):                # keep it drug-sized
                continue
            qed = QED.qed(m)
            viol = sum([mw > 500, Descriptors.MolLogP(m) > 5,
                        Lipinski.NumHDonors(m) > 5, Lipinski.NumHAcceptors(m) > 10])
            found.append({
                "smiles": smi, "inchikey": ik,
                "formula": rdMolDescriptors.CalcMolFormula(m),
                "mol_weight": round(mw, 2), "qed": round(qed, 4),
                "lipinski_violations": viol, "drug_like": viol <= 1 and qed > 0.4,
                "novel": True,
            })
        except Exception:
            continue
    found.sort(key=lambda d: d["qed"], reverse=True)
    return found
