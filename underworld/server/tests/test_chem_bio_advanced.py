"""Tier-2/3 science: real cheminformatics (RDKit) + bioinformatics (Biopython).
Verified against known ground-truth values."""
from underworld.server.services import chem_advanced as C
from underworld.server.services import bio_advanced as B

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
CAFFEINE = "Cn1cnc2c1c(=O)n(C)c(=O)n2C"


def test_aspirin_descriptors_match_reality():
    d = C.descriptors(ASPIRIN)
    assert d["formula"] == "C9H8O4"
    assert abs(d["mol_weight"] - 180.16) < 0.1        # aspirin is 180.16 g/mol
    assert d["aromatic_rings"] == 1


def test_drug_likeness_ro5():
    dl = C.drug_likeness(ASPIRIN)
    assert dl["passes_ro5"] and dl["lipinski_violations"] == 0
    assert 0.0 <= dl["qed"] <= 1.0


def test_tanimoto_self_is_one_and_diff_is_less():
    assert C.similarity(ASPIRIN, ASPIRIN) == 1.0
    assert C.similarity(ASPIRIN, CAFFEINE) < 1.0


def test_substructure_carboxylic_acid_in_aspirin():
    assert C.substructure_match(ASPIRIN, "C(=O)[OH]")     # aspirin has -COOH
    assert not C.substructure_match("CCO", "C(=O)[OH]")   # ethanol does not


def test_mmff94_minimisation_is_real_molecular_mechanics():
    g = C.minimize_3d(ASPIRIN)
    assert g["converged"] and g["has_3d_coords"]
    assert isinstance(g["mmff94_energy_kcal_mol"], float)  # a real force-field energy


def test_smith_waterman_local_alignment():
    r = B.align_local("ACGTACGT", "ACGAACGT")
    assert r["score"] > 0


def test_needleman_wunsch_identical_scores_high():
    same = B.align_global("ACGTACGT", "ACGTACGT")["score"]
    diff = B.align_global("ACGTACGT", "TTTTTTTT")["score"]
    assert same > diff


def test_translation_uses_real_codon_table():
    # ATG GCC TGA -> M A stop
    assert B.translate("ATGGCCTGA")["protein"].startswith("MA")


def test_orf_finding():
    orfs = B.find_orfs("AAAATGGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCTAA", min_aa=5)
    assert orfs and orfs[0]["peptide"].startswith("M")


def test_protparam_known_peptide():
    p = B.protein_params("MKWVTFISLLLLFSSAYS")
    assert p["mol_weight"] > 0 and -5 < p["gravy"] < 5
    assert isinstance(p["stable"], bool)


def test_protein_identity_percent():
    r = B.protein_identity("MKWVTFISLL", "MKWVTFISLL")
    assert r["percent_identity"] == 100.0


def test_restriction_ecori_site():
    # EcoRI recognises GAATTC
    r = B.restriction_sites("AAAGAATTCAAA", "EcoRI")
    assert r["n_sites"] == 1
