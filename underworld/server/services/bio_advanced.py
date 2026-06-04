"""Real bioinformatics (Biopython) — the tier-up from sequence heuristics. These
are the genuine, named algorithms: Needleman-Wunsch / Smith-Waterman alignment,
codon-table translation + ORF finding, ProtParam physicochemistry, and
restriction-enzyme digestion. The same library real labs use.
"""
from __future__ import annotations

from Bio.Align import PairwiseAligner, substitution_matrices
from Bio.Seq import Seq
from Bio.SeqUtils import gc_fraction
from Bio.SeqUtils.ProtParam import ProteinAnalysis


def align_global(a: str, b: str) -> dict:
    """Needleman-Wunsch GLOBAL alignment (real dynamic-programming algorithm)."""
    al = PairwiseAligner()
    al.mode = "global"
    al.match_score = 2; al.mismatch_score = -1
    al.open_gap_score = -2; al.extend_gap_score = -0.5
    aln = al.align(a.upper(), b.upper())[0]
    return {"score": round(aln.score, 2), "alignment": str(aln).strip().split("\n")}


def align_local(a: str, b: str) -> dict:
    """Smith-Waterman LOCAL alignment (best matching subsequence)."""
    al = PairwiseAligner()
    al.mode = "local"
    al.match_score = 2; al.mismatch_score = -1
    al.open_gap_score = -2; al.extend_gap_score = -0.5
    aln = al.align(a.upper(), b.upper())[0]
    return {"score": round(aln.score, 2), "alignment": str(aln).strip().split("\n")}


def protein_identity(seq_a: str, seq_b: str) -> dict:
    """BLOSUM62-scored protein alignment + % identity — real homology metric."""
    al = PairwiseAligner()
    al.substitution_matrix = substitution_matrices.load("BLOSUM62")
    al.open_gap_score = -10; al.extend_gap_score = -0.5
    aln = al.align(seq_a.upper(), seq_b.upper())[0]
    ta, tb = aln[0], aln[1]
    same = sum(1 for x, y in zip(ta, tb) if x == y and x != "-")
    cols = sum(1 for x, y in zip(ta, tb) if x != "-" and y != "-")
    return {"score": round(aln.score, 2),
            "percent_identity": round(100 * same / max(1, cols), 1)}


def translate(dna: str) -> dict:
    """Transcribe + translate DNA → protein via the standard codon table."""
    s = Seq(dna.upper())
    protein = str(s.translate(to_stop=False))
    return {"mrna": str(s.transcribe()), "protein": protein,
            "gc_percent": round(gc_fraction(s) * 100, 2)}


def find_orfs(dna: str, *, min_aa: int = 10) -> list[dict]:
    """Find open reading frames (ATG…stop) across all 3 forward frames."""
    s = dna.upper()
    out: list[dict] = []
    for frame in range(3):
        prot = str(Seq(s[frame:len(s) - (len(s) - frame) % 3]).translate())
        start = 0
        while True:
            m = prot.find("M", start)
            if m < 0:
                break
            stop = prot.find("*", m)
            end = stop if stop >= 0 else len(prot)
            if end - m >= min_aa:
                out.append({"frame": frame, "aa_start": m, "length_aa": end - m,
                            "peptide": prot[m:end]})
            start = m + 1
    return out


def protein_params(seq: str) -> dict:
    """ProtParam physicochemistry: MW, isoelectric point, GRAVY hydropathy,
    aromaticity, and the instability index (real Guruprasad method)."""
    pa = ProteinAnalysis(seq.upper().replace("*", ""))
    inst = pa.instability_index()
    return {
        "length": len(seq.replace("*", "")),
        "mol_weight": round(pa.molecular_weight(), 2),
        "isoelectric_point": round(pa.isoelectric_point(), 2),
        "gravy": round(pa.gravy(), 3),
        "aromaticity": round(pa.aromaticity(), 3),
        "instability_index": round(inst, 2),
        "stable": inst < 40,                       # Guruprasad cut-off
    }


def restriction_sites(dna: str, enzyme: str = "EcoRI") -> dict:
    """Find restriction-enzyme recognition sites + cut positions (real digest)."""
    from Bio.Restriction import RestrictionBatch
    rb = RestrictionBatch([enzyme])
    enz = list(rb)[0]
    cuts = enz.search(Seq(dna.upper()))
    return {"enzyme": str(enz), "site": str(enz.site), "cut_positions": cuts,
            "n_sites": len(cuts)}
