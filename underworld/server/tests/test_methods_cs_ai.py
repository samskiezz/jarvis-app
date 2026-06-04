"""Verify the 8 real CS/AI methods against KNOWN ground-truth values.

Each test cites the known value it checks against.
"""
import math

from underworld.server.services.methods_cs_ai import (
    dijkstra_shortest_path,
    edit_distance,
    gradient_descent_regression,
    huffman_coding,
    kmeans_clustering,
    knapsack_01,
    pagerank,
    random_forest_accuracy,
    shannon_entropy,
)


# 1. Dijkstra ---------------------------------------------------------------
def test_dijkstra_known_distance():
    # Classic graph: shortest A->E = A-B-C-D-E = 1+2+1+3 = 7 (known).
    r = dijkstra_shortest_path()
    assert r["distance"] == 7.0
    assert r["path"] == ["A", "B", "C", "D", "E"]
    assert r["matches_oracle"]  # agrees with networkx oracle


# 2. Shannon entropy --------------------------------------------------------
def test_fair_coin_entropy_is_one_bit():
    # Shannon (1948): entropy of a fair coin = exactly 1 bit.
    r = shannon_entropy([0.5, 0.5])
    assert abs(r["entropy_bits"] - 1.0) < 1e-12
    assert abs(r["scipy_entropy_bits"] - 1.0) < 1e-9


def test_fair_die_entropy_is_log2_6():
    # Fair 6-sided die: H = log2(6) ~ 2.585 bits (known).
    r = shannon_entropy([1 / 6] * 6)
    assert abs(r["entropy_bits"] - math.log2(6)) < 1e-9


# 3. k-means ----------------------------------------------------------------
def test_kmeans_recovers_separated_clusters():
    # Well-separated blobs -> k-means recovers near-pure clusters (purity ~1).
    r = kmeans_clustering(n_clusters=3)
    assert r["purity"] > 0.98


# 4. Random forest ----------------------------------------------------------
def test_random_forest_high_accuracy_on_separable():
    # Linearly separable classes -> near-perfect held-out accuracy.
    r = random_forest_accuracy()
    assert r["accuracy"] > 0.95


# 5. Huffman ----------------------------------------------------------------
def test_huffman_within_shannon_bound():
    # Source-coding theorem: H <= avg code length < H + 1.
    r = huffman_coding("abracadabra")
    assert r["within_shannon_bound"]
    assert r["entropy_bits"] <= r["avg_code_length"] < r["entropy_bits"] + 1
    assert r["prefix_free"]


def test_huffman_beats_fixed_length():
    # Skewed distribution -> Huffman compresses below fixed-length encoding.
    r = huffman_coding("aaaaaaaaaabbbbbccd")
    assert r["avg_code_length"] < r["fixed_length_bits"]


# 6. PageRank ---------------------------------------------------------------
def test_pagerank_is_a_distribution():
    # Stationary distribution is a probability vector: sums to 1 (Brin & Page).
    r = pagerank()
    assert r["sums_to_one"]
    assert abs(r["total"] - 1.0) < 1e-6
    assert r["top_node"] == "C"  # node with the most in-links


# 7. Dynamic programming ----------------------------------------------------
def test_edit_distance_kitten_sitting():
    # Known Levenshtein distance kitten->sitting = 3.
    assert edit_distance("kitten", "sitting")["distance"] == 3


def test_edit_distance_identical_is_zero():
    assert edit_distance("abc", "abc")["distance"] == 0


def test_knapsack_known_optimum():
    # Textbook 0/1 knapsack: w=[10,20,30] v=[60,100,120] cap=50 -> 220.
    r = knapsack_01()
    assert r["max_value"] == 220
    assert r["chosen_items"] == [1, 2]


# 8. Gradient descent -------------------------------------------------------
def test_gradient_descent_recovers_slope():
    # Should recover the known slope=2.0 and intercept=1.0.
    r = gradient_descent_regression(true_slope=2.0, true_intercept=1.0)
    assert abs(r["learned_slope"] - 2.0) < 0.05
    assert abs(r["learned_intercept"] - 1.0) < 0.05
    assert r["final_mse"] < 0.01
