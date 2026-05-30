import random

from underworld.server.genetics import dna as dna_mod


def test_random_dna_length_and_alphabet():
    rng = random.Random(42)
    d = dna_mod.random_dna(rng)
    assert len(d) == dna_mod.DNA_LENGTH
    assert set(d).issubset(set(dna_mod.BASE_PAIRS))


def test_trait_deterministic_per_dna_locus():
    rng = random.Random(123)
    d = dna_mod.random_dna(rng)
    a = dna_mod.trait(d, "intelligence")
    b = dna_mod.trait(d, "intelligence")
    assert a == b
    # Different loci yield different values for the same DNA.
    assert a != dna_mod.trait(d, "longevity")


def test_trait_vector_has_all_named_loci():
    d = dna_mod.random_dna(random.Random(1))
    v = dna_mod.trait_vector(d)
    for locus in dna_mod.LOCI:
        assert locus.name in v
        assert 0.0 <= v[locus.name] <= 1.0


def test_crossover_preserves_length_and_alphabet():
    rng = random.Random(7)
    a = dna_mod.random_dna(rng)
    b = dna_mod.random_dna(rng)
    c = dna_mod.crossover(a, b, rng=rng)
    assert len(c) == dna_mod.DNA_LENGTH
    assert set(c).issubset(set(dna_mod.BASE_PAIRS))
    # Child should resemble both parents across the splice
    assert dna_mod.hamming(c, a) > 0
    assert dna_mod.hamming(c, b) > 0


def test_mutate_changes_bases_at_expected_rate():
    rng = random.Random(99)
    d = dna_mod.random_dna(rng)
    out = dna_mod.mutate(d, rate=1.0, rng=rng)
    # rate=1.0 forces every base to flip — so hamming should equal length.
    assert dna_mod.hamming(d, out) == dna_mod.DNA_LENGTH


def test_breed_combines_two_parents():
    rng = random.Random(11)
    a = dna_mod.random_dna(rng)
    b = dna_mod.random_dna(rng)
    c = dna_mod.breed(a, b, rng=rng)
    assert len(c) == dna_mod.DNA_LENGTH
    assert c != a and c != b


def test_fork_diverges_from_source():
    rng = random.Random(22)
    src = dna_mod.random_dna(rng)
    clone = dna_mod.fork(src, divergence=0.05, rng=rng)
    assert clone != src
    assert dna_mod.kinship(src, clone) > 0.85  # still mostly the same


def test_kinship_identical_is_one():
    rng = random.Random(8)
    d = dna_mod.random_dna(rng)
    assert dna_mod.kinship(d, d) == 1.0
