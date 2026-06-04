# Underworld — molecular-genetics proof (reproducible)

This is verifiable evidence that the CRISPR / DNA-helix science is **real
computation**, not a stub. Every claim below is reproduced by running the code;
nothing is hardcoded. Run it yourself:

```bash
cd underworld
python -m pytest server/tests/test_molecular_genetics.py server/tests/test_disease_models.py -q
```

## 1. Test suites pass — 23/23
```
12 passed  server/tests/test_molecular_genetics.py
11 passed  server/tests/test_disease_models.py
```
Covering: complementarity, GC-dependent melting, helix denaturation into two
strands, Cas9 cut position, knockout/knock-in, off-target detection, colour-ID;
plus SIR/SEIR epidemics, dose-response (EC50), therapeutic index, and
gene-regulatory-network perturbation.

## 2. A hand-checkable CRISPR-Cas9 edit
Designed sequence `[4 filler][20-nt guide][CGG PAM][filler]`:

```
Sequence          : TTTTACGTACGTACGTACGTACGTCGGAAAAAA   (len 33)
PAM (NGG) at       : 24  -> "CGG"                       ✓ Cas9 needs 5'-NGG-3'
protospacer_start  : 4                                  ✓ 20 nt 5' of the PAM
Cas9 cut index     : 21  = pam_start(24) - 3            ✓ real blunt DSB site
mismatches         : 0                                  ✓ perfect on-target

KNOCKOUT (delete 3 at cut):
  before: TTTTACGTACGTACGTACGTACGTCGGAAAAAA
  after : TTTTACGTACGTACGTACGT  ACGGAAAAAA   (33 -> 30, removed "CGT")
KNOCK-IN (insert GGG at cut):
  after : TTTTACGTACGTACGTACGTA[GGG]CGTCGGAAAAAA
```
The cut is exactly **3 bp upstream of the PAM** — the actual SpCas9 cleavage
site — and the edit lands at that index. This is the genuine mechanism.

## 3. Complementarity + melting (textbook, not canned)
```
Complement   : ATGCGT / TACGCA          (A-T, G-C base pairing)
Rev-complement: ATGCGT -> ACGCAT        (antiparallel 5'->3')
Tm GC-rich GGGGCCCC...: 63.88 C
Tm AT-rich ATATATAT...: 22.88 C         (GC pairs are stronger -> melt hotter)
```

## 4. Gene-regulatory therapy simulation (in-silico candidate)
Knocking out an "oncogene" in a regulatory network propagates correctly:
```
oncogene 1.0 -> 0.0   |  growth 0.8 -> 0.26   |  apoptosis 0.2 -> 0.62
```
Killing the oncogene lowers growth and raises programmed cell death — the
biologically expected direction.

## Honest scope
These are **real computations** producing **in-silico candidates**. The therapy
scorer states it itself: *"In-silico score; requires wet-lab + clinical
validation."* The system genuinely models and scores molecular biology and can
generate/score novel candidate possibilities — it does **not** produce
validated real-world treatments (that needs wet-lab + clinical trials). That
distinction is deliberate and stated in the code.
