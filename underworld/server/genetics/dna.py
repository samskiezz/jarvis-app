"""Digital DNA — gene loci, alleles, mutation, crossover.

Section II of the design doc:
- (19) "Every Minion has a genetic code (digital DNA) that governs appearance,
  aptitudes, and health."
- (20) "DNA can mutate across generations, enabling evolution."
- (1184) "DNA encoded as sequence of base pairs (A,T,G,C)"
- (1186) "Dominant/recessive inheritance patterns"
- (1199) "Random mutations occur during reproduction"

Design choice: we use a hybrid representation that is cheap to store and
fast to operate on:
- A base-pair string of length N is the raw DNA.
- A fixed list of named *loci* projects from the base-pair string onto
  named traits (e.g. "longevity", "intelligence", "openness"). Each locus
  spans a small window of base-pairs; the bytes in the window are hashed
  to a deterministic float in [0,1] for that trait.

This gives us:
- real recombination (crossover) and real point mutation,
- deterministic trait expression from any DNA,
- traits that can drift over generations as the underlying bases mutate.
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass

BASE_PAIRS = ("A", "T", "G", "C")
DNA_LENGTH = 1024


# Named loci with (start, length) windows into the DNA string and the
# real-world trait they project to. Each trait outputs a float in [0,1].
@dataclass(frozen=True)
class Locus:
    name: str
    start: int
    length: int


LOCI: tuple[Locus, ...] = (
    # personality (Big Five)
    Locus("openness", 0, 32),
    Locus("conscientiousness", 32, 32),
    Locus("extraversion", 64, 32),
    Locus("agreeableness", 96, 32),
    Locus("neuroticism", 128, 32),
    # cognitive aptitudes
    Locus("intelligence", 160, 48),
    Locus("creativity", 208, 48),
    Locus("memory_capacity", 256, 32),
    Locus("focus", 288, 32),
    # physical
    Locus("longevity", 320, 48),
    Locus("vitality", 368, 32),
    Locus("immune", 400, 32),
    Locus("dexterity", 432, 32),
    # social
    Locus("charisma", 464, 32),
    Locus("empathy", 496, 32),
    # domain aptitudes — what kinds of patents this Minion is drawn to
    Locus("aptitude_maths", 528, 32),
    Locus("aptitude_physics", 560, 32),
    Locus("aptitude_electrical", 592, 32),
    Locus("aptitude_mechanical", 624, 32),
    Locus("aptitude_computing", 656, 32),
    Locus("aptitude_civil", 688, 32),
    Locus("aptitude_materials", 720, 32),
    Locus("aptitude_energy", 752, 32),
    Locus("aptitude_agriculture", 784, 32),
)

LOCUS_BY_NAME = {l.name: l for l in LOCI}


def random_dna(rng: random.Random | None = None) -> str:
    rng = rng or random.Random()
    return "".join(rng.choice(BASE_PAIRS) for _ in range(DNA_LENGTH))


def trait(dna: str, locus_name: str) -> float:
    """Project a window of the DNA string to a float in [0,1].

    Deterministic: same DNA, same locus → same value. Uses SHA-1 over the
    window so neighbouring loci don't correlate.
    """
    locus = LOCUS_BY_NAME[locus_name]
    window = dna[locus.start : locus.start + locus.length]
    h = hashlib.sha1(window.encode("ascii")).digest()
    # Take 8 bytes → 64-bit int → normalise
    n = int.from_bytes(h[:8], "big")
    return (n % 10_000) / 10_000.0


def trait_vector(dna: str) -> dict[str, float]:
    return {l.name: trait(dna, l.name) for l in LOCI}


def crossover(dna_a: str, dna_b: str, rng: random.Random | None = None) -> str:
    """Single-point crossover. Length is preserved."""
    rng = rng or random.Random()
    assert len(dna_a) == len(dna_b) == DNA_LENGTH
    cut = rng.randrange(1, DNA_LENGTH - 1)
    return dna_a[:cut] + dna_b[cut:]


def mutate(dna: str, *, rate: float = 0.002, rng: random.Random | None = None) -> str:
    """Point mutation at the given per-base rate (default 0.2%)."""
    rng = rng or random.Random()
    out = list(dna)
    for i in range(len(out)):
        if rng.random() < rate:
            choices = [b for b in BASE_PAIRS if b != out[i]]
            out[i] = rng.choice(choices)
    return "".join(out)


def breed(
    dna_a: str,
    dna_b: str,
    *,
    mutation_rate: float = 0.002,
    rng: random.Random | None = None,
) -> str:
    """Produce a child DNA by crossing two parents and mutating."""
    rng = rng or random.Random()
    return mutate(crossover(dna_a, dna_b, rng=rng), rate=mutation_rate, rng=rng)


def fork(dna: str, *, divergence: float = 0.01, rng: random.Random | None = None) -> str:
    """Digital clone (doc II.74) — high-rate mutation, no crossover."""
    return mutate(dna, rate=divergence, rng=rng)


def hamming(a: str, b: str) -> int:
    """How many base pairs differ — used for kinship / 'speciation' diagnostics."""
    return sum(1 for x, y in zip(a, b) if x != y)


def kinship(a: str, b: str) -> float:
    """1.0 = identical twins, 0.0 = completely unrelated (within 25% chance baseline)."""
    matches = sum(1 for x, y in zip(a, b) if x == y)
    return matches / len(a)


__all__ = [
    "BASE_PAIRS",
    "DNA_LENGTH",
    "LOCI",
    "Locus",
    "breed",
    "crossover",
    "fork",
    "hamming",
    "kinship",
    "mutate",
    "random_dna",
    "trait",
    "trait_vector",
]
