"""Real molecular genetics — a double-stranded DNA helix you can unzip, a working
CRISPR-Cas9 editor that actually cuts and edits a sequence, and a nucleotide
colour scheme for the renderer. No hand-waving: the operations are the genuine
(if simplified) biology, and they're unit-tested.

  * complementarity        A-T, G-C base pairing → the second strand
  * melting / denaturation  GC-dependent Tm + a sigmoidal melt curve; hot enough
                            and the helix UNZIPS into two single strands
  * CRISPR-Cas9            find a 20-nt protospacer next to an NGG PAM, cut 3 bp
                            upstream (blunt DSB), then apply a real edit
                            (knockout / knock-in / replace) → an EDITED sequence
  * colour ID             A/T/G/C → colours, for visualising the helix + edits
"""
from __future__ import annotations

import math
from dataclasses import dataclass

BASES = ("A", "T", "G", "C")
_COMPLEMENT = {"A": "T", "T": "A", "G": "C", "C": "G"}

# Nucleotide colour identity — the scheme the renderer uses to paint bases,
# the unzip, and edits. (A green, T red, G amber, C blue — a common convention.)
BASE_COLOR: dict[str, str] = {"A": "#2ecc71", "T": "#e74c3c", "G": "#f1c40f", "C": "#3498db"}


def is_dna(seq: str) -> bool:
    return bool(seq) and set(seq.upper()) <= set(BASES)


def complement_base(b: str) -> str:
    return _COMPLEMENT[b.upper()]


def complement_strand(seq: str) -> str:
    """The complementary strand (NOT reversed) — base-pairs each position."""
    return "".join(_COMPLEMENT[b] for b in seq.upper())


def reverse_complement(seq: str) -> str:
    """The antiparallel partner strand, read 5'→3' (reverse complement)."""
    return "".join(_COMPLEMENT[b] for b in reversed(seq.upper()))


def gc_content(seq: str) -> float:
    s = seq.upper()
    return round(sum(1 for b in s if b in "GC") / len(s), 4) if s else 0.0


@dataclass(frozen=True)
class Helix:
    """A double-stranded DNA helix: two antiparallel, base-paired strands."""
    top: str            # 5'→3'
    bottom: str         # 3'→5' (the complement, paired base-for-base with top)

    @property
    def length(self) -> int:
        return len(self.top)

    def base_pairs(self) -> list[tuple[str, str]]:
        return list(zip(self.top.upper(), self.bottom))


def double_helix(seq: str) -> Helix:
    """Assemble a double helix from a single strand by base-pairing the complement."""
    if not is_dna(seq):
        raise ValueError("sequence must be over A/T/G/C")
    top = seq.upper()
    return Helix(top=top, bottom=complement_strand(top))


def melting_temperature(seq: str) -> float:
    """Tm (°C). Wallace rule for short oligos (<14 nt); GC% formula for longer.
    These are the standard textbook approximations."""
    s = seq.upper()
    n = len(s)
    if n == 0:
        return 0.0
    a = s.count("A"); t = s.count("T"); g = s.count("G"); c = s.count("C")
    if n < 14:
        return float(2 * (a + t) + 4 * (g + c))               # Wallace rule
    return round(64.9 + 41.0 * (g + c - 16.4) / n, 2)          # GC% (Marmur-ish)


@dataclass(frozen=True)
class MeltState:
    temperature: float
    tm: float
    fraction_single_stranded: float       # 0 = fully duplex, 1 = fully denatured
    denatured: bool                       # the helix has come apart
    strands: tuple[str, str] | None       # the two separated single strands, if denatured


def denature(seq: str, temperature: float, *, k: float = 5.0) -> MeltState:
    """Heat the helix. Melting follows a sigmoidal curve around Tm; at/above Tm the
    hydrogen bonds break and the helix UNZIPS into two single strands — genuine
    disassembly of the double helix, not a metaphor."""
    h = double_helix(seq)
    tm = melting_temperature(seq)
    frac = 1.0 / (1.0 + math.exp(-(temperature - tm) / k))
    denatured = frac >= 0.5
    return MeltState(temperature=float(temperature), tm=tm,
                     fraction_single_stranded=round(frac, 4), denatured=denatured,
                     strands=(h.top, h.bottom) if denatured else None)


def melt_order(seq: str, *, window: int = 6) -> list[int]:
    """Which regions unzip FIRST — AT-rich (low-GC) windows have the weakest bonds.
    Returns window start indices ordered from first-to-melt to last."""
    s = seq.upper()
    scored = [(gc_content(s[i:i + window]), i) for i in range(0, max(1, len(s) - window + 1))]
    return [i for _, i in sorted(scored)]


# ── CRISPR-Cas9 — a real cut-and-edit on a sequence ───────────────────────────
PAM = "NGG"             # SpCas9 canonical PAM (N = any base)
SPACER_LEN = 20


def _pam_matches(triplet: str) -> bool:
    return len(triplet) == 3 and triplet[1:].upper() == "GG"


def find_pam_sites(seq: str) -> list[int]:
    """Indices where an NGG PAM begins (on the given strand)."""
    s = seq.upper()
    return [i for i in range(len(s) - 2) if _pam_matches(s[i:i + 3])]


@dataclass(frozen=True)
class CutSite:
    protospacer_start: int      # where the 20-nt target begins
    pam_start: int              # where the NGG PAM begins
    cut_index: int              # blunt DSB position (3 bp 5' of the PAM)
    mismatches: int             # guide vs protospacer (0 = perfect on-target)


def find_targets(seq: str, guide: str, *, max_mismatch: int = 3) -> list[CutSite]:
    """Find every site where `guide` (20 nt) matches a protospacer immediately
    5' of an NGG PAM, within `max_mismatch` (Cas9 tolerates a few mismatches —
    this is the basis of off-target activity)."""
    s = seq.upper(); g = guide.upper()
    if len(g) != SPACER_LEN:
        return []
    sites: list[CutSite] = []
    for pam in find_pam_sites(s):
        proto_start = pam - SPACER_LEN
        if proto_start < 0:
            continue
        protospacer = s[proto_start:pam]
        mm = sum(1 for a, b in zip(g, protospacer) if a != b)
        if mm <= max_mismatch:
            sites.append(CutSite(proto_start, pam, pam - 3, mm))
    return sites


@dataclass(frozen=True)
class EditResult:
    original: str
    edited: str
    on_target: CutSite | None
    off_targets: list[CutSite]
    kind: str                   # knockout | knock_in | replace | no_cut
    changed: bool


def crispr_edit(seq: str, guide: str, *, insert: str = "", delete: int = 0,
                replace: str = "", repair: str = "auto") -> EditResult:
    """Run a CRISPR-Cas9 edit. Finds the best on-target site (fewest mismatches),
    cuts, then applies the repair outcome at the cut:
      • delete>0      → knockout (NHEJ-style indel removes bases)
      • insert        → knock-in (HDR-style insertion)
      • replace       → swap bases at the cut
    Returns the genuinely EDITED sequence plus on/off-target sites."""
    s = seq.upper()
    sites = find_targets(s, guide)
    if not sites:
        return EditResult(s, s, None, [], "no_cut", False)
    on = min(sites, key=lambda c: c.mismatches)
    off = [c for c in sites if c is not on and c.mismatches > 0]
    cut = on.cut_index
    if replace:
        edited = s[:cut] + replace.upper() + s[cut + len(replace):]
        kind = "replace"
    elif insert:
        edited = s[:cut] + insert.upper() + s[cut:]
        kind = "knock_in"
    elif delete > 0:
        edited = s[:cut] + s[cut + delete:]
        kind = "knockout"
    else:
        # default repair: a 1-bp NHEJ deletion (frameshift knockout)
        edited = s[:cut] + s[cut + 1:]
        kind = "knockout"
    return EditResult(s, edited, on, off, kind, edited != s)


# ── Colour ID for the renderer ────────────────────────────────────────────────
def colorize(seq: str) -> list[dict]:
    """Each base → its colour, for painting the helix / unzip / edit in the UI."""
    return [{"base": b.upper(), "color": BASE_COLOR.get(b.upper(), "#888888")}
            for b in seq]


def helix_view(seq: str, *, edit: EditResult | None = None) -> dict:
    """A renderer-ready snapshot: both strands, colours, Tm, and any edit marks."""
    h = double_helix(seq)
    view = {
        "top": h.top, "bottom": h.bottom,
        "top_colors": colorize(h.top), "bottom_colors": colorize(h.bottom),
        "gc_content": gc_content(h.top), "tm_celsius": melting_temperature(h.top),
        "length": h.length,
    }
    if edit is not None and edit.on_target is not None:
        view["edit"] = {"kind": edit.kind, "cut_index": edit.on_target.cut_index,
                        "mismatches": edit.on_target.mismatches,
                        "off_target_count": len(edit.off_targets),
                        "edited_top": edit.edited, "changed": edit.changed}
    return view
