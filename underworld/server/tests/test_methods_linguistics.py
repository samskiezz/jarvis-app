"""Verify the 8 real computational-linguistics methods against KNOWN values.

Each test cites the known ground-truth value it checks against.
"""
import math

from underworld.server.services.methods_linguistics import (
    ROUTE_TABLE,
    bleu_score,
    char_entropy,
    cosine_similarity_bow,
    heaps_law_fit,
    levenshtein_distance,
    ngram_perplexity,
    route,
    tfidf_weights,
    zipf_law_fit,
)


# 1. Zipf's law: ideal Zipfian data has a log-log slope of -1 (exponent s = 1).
def test_zipf_slope_minus_one():
    out = zipf_law_fit()
    assert math.isclose(out["slope"], -1.0, abs_tol=1e-6)
    assert math.isclose(out["exponent_s"], 1.0, abs_tol=1e-6)
    assert out["r_squared"] > 0.999


# 2. n-gram perplexity: in-distribution text is less perplexing than OOD text.
def test_perplexity_in_lower_than_out():
    out = ngram_perplexity()
    assert out["in_lower_than_out"] is True
    assert out["perplexity_in_distribution"] < out["perplexity_out_of_distribution"]


# 3. TF-IDF: a rare term is weighted higher than a corpus-wide common term.
def test_tfidf_rare_higher_than_common():
    out = tfidf_weights()
    assert out["rare_weighted_higher"] is True
    # "the" appears in every doc -> idf = ln(N/N) = 0.
    assert math.isclose(out["idf"]["the"], 0.0, abs_tol=1e-12)
    assert out["rare_weight"] > out["common_weight"]


# 4. Levenshtein: distance("kitten", "sitting") = 3 (classic textbook value).
def test_levenshtein_kitten_sitting():
    out = levenshtein_distance("kitten", "sitting")
    assert out["distance"] == 3


# 5. Cosine similarity: identical bag-of-words documents -> 1.0.
def test_cosine_identical_is_one():
    out = cosine_similarity_bow("the quick brown fox", "the quick brown fox")
    assert math.isclose(out["similarity"], 1.0, abs_tol=1e-9)


def test_cosine_disjoint_is_zero():
    out = cosine_similarity_bow("alpha beta gamma", "delta epsilon zeta")
    assert math.isclose(out["similarity"], 0.0, abs_tol=1e-9)


# 6. Shannon entropy: raw English first-order entropy ~ 4 bits/char.
def test_char_entropy_english_about_four_bits():
    out = char_entropy()
    assert 3.5 <= out["bits_per_char"] <= 4.7
    # Uniform-26 maximum is log2(26) ~= 4.7.
    assert out["max_bits_per_char"] <= math.log2(26) + 1e-9


# 7. Heaps' law: natural-language exponent beta in 0.4-0.6.
def test_heaps_beta_in_band():
    out = heaps_law_fit()
    assert 0.4 <= out["beta"] <= 0.6
    assert out["beta_in_natural_band"] is True


# 8. BLEU: a candidate identical to the reference scores 1.0.
def test_bleu_perfect_match_is_one():
    out = bleu_score("the cat sat on the mat", "the cat sat on the mat")
    assert math.isclose(out["bleu"], 1.0, abs_tol=1e-9)


# Route table sanity: every required keyword resolves to a callable.
def test_route_table_keywords():
    for kw, expected in [
        ("zipf", zipf_law_fit),
        ("perplexity", ngram_perplexity),
        ("tfidf", tfidf_weights),
        ("edit_distance", levenshtein_distance),
        ("cosine_sim", cosine_similarity_bow),
        ("char_entropy", char_entropy),
        ("heaps", heaps_law_fit),
        ("bleu", bleu_score),
        ("linguist", zipf_law_fit),
        ("nlp", zipf_law_fit),
    ]:
        assert route(kw) is expected, kw
    assert route("nonexistent_method") is None
    assert len(ROUTE_TABLE) == 8
