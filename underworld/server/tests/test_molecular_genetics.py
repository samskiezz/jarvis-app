"""The molecular genetics must be biologically correct, not hand-waved."""
from underworld.server.services import molecular_genetics as MG


def test_complementarity_is_correct():
    assert MG.complement_strand("ATGC") == "TACG"
    assert MG.reverse_complement("ATGC") == "GCAT"          # antiparallel 5'->3'


def test_double_helix_pairs_every_base():
    h = MG.double_helix("ATGCGC")
    for a, b in h.base_pairs():
        assert MG._COMPLEMENT[a] == b                       # A-T, G-C throughout


def test_gc_rich_melts_hotter_than_at_rich():
    at = MG.melting_temperature("ATATATATATATATAT")
    gc = MG.melting_temperature("GCGCGCGCGCGCGCGC")
    assert gc > at                                          # GC bonds are stronger


def test_denature_unzips_the_helix_when_hot():
    seq = "ATATATATATAT"                                    # low Tm
    cold = MG.denature(seq, temperature=10)
    hot = MG.denature(seq, temperature=95)
    assert not cold.denatured and cold.strands is None       # duplex stays paired
    assert hot.denatured and hot.strands is not None         # helix comes APART
    top, bottom = hot.strands
    assert bottom == MG.complement_strand(top)               # two real single strands
    assert 0.0 <= cold.fraction_single_stranded < 0.5 < hot.fraction_single_stranded <= 1.0


def test_at_rich_regions_melt_first():
    # an AT-rich window should unzip before a GC-rich one
    seq = "GGGGGGAAAAAA" + "GGGGGG"
    order = MG.melt_order(seq, window=6)
    assert order[0] >= 5                                     # the AT window, not the GC start


def test_crispr_finds_target_next_to_pam_and_cuts():
    guide = "AAAAAAAAAAAAAAAAAAAA"                            # 20-nt spacer
    seq = "CCCC" + guide + "TGG" + "CCCC"                     # protospacer + NGG PAM
    sites = MG.find_targets(seq, guide)
    assert sites and sites[0].mismatches == 0
    pam = seq.index("TGG", 4)
    assert sites[0].cut_index == pam - 3                      # blunt DSB 3 bp 5' of PAM


def test_crispr_knockout_deletes_and_changes_sequence():
    guide = "ACGTACGTACGTACGTACGT"
    seq = "TT" + guide + "AGG" + "TTTT"
    r = MG.crispr_edit(seq, guide, delete=3)
    assert r.changed and r.kind == "knockout"
    assert len(r.edited) == len(seq) - 3                     # 3 bases really removed


def test_crispr_knock_in_inserts_payload():
    guide = "ACGTACGTACGTACGTACGT"
    seq = "TT" + guide + "AGG" + "TTTT"
    r = MG.crispr_edit(seq, guide, insert="GGGG")
    assert r.kind == "knock_in" and "GGGG" in r.edited
    assert len(r.edited) == len(seq) + 4


def test_crispr_no_pam_no_cut():
    guide = "ACGTACGTACGTACGTACGT"
    seq = "TT" + guide + "AAA" + "TTTT"                       # AAA is not an NGG PAM
    r = MG.crispr_edit(seq, guide)
    assert not r.changed and r.kind == "no_cut"


def test_off_target_detected_with_mismatches():
    guide = "AAAAAAAAAAAAAAAAAAAA"
    ontarget = guide + "TGG"
    offtarget = "AAAAAAAAAAAAAAAAAAAT" + "CGG"                # 1 mismatch + PAM
    seq = "CC" + ontarget + "CCCC" + offtarget + "CC"
    r = MG.crispr_edit(seq, guide)
    assert r.on_target is not None and r.on_target.mismatches == 0
    assert any(o.mismatches >= 1 for o in r.off_targets)


def test_colour_id_covers_all_bases():
    cols = MG.colorize("ATGC")
    assert [c["base"] for c in cols] == ["A", "T", "G", "C"]
    assert len({c["color"] for c in cols}) == 4              # four distinct colours


def test_helix_view_is_renderer_ready():
    v = MG.helix_view("ATGCGCATGC")
    assert v["bottom"] == MG.complement_strand(v["top"])
    assert "tm_celsius" in v and len(v["top_colors"]) == len(v["top"])
