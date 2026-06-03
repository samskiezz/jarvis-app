"""Real computer-science / AI methods (in-world simulations).

Eight genuine, named algorithms — not stubs or external connectors. Each is
implemented (or driven) with numpy / scipy / sklearn / networkx and is verified
against a KNOWN ground-truth value in the test suite:

  1. Dijkstra shortest path        -> known graph distance
  2. Shannon entropy               -> fair coin = 1 bit
  3. k-means clustering            -> recovers well-separated clusters
  4. Random-forest classifier      -> ~100% accuracy on a separable set
  5. Huffman coding compression    -> mean code length <= entropy + 1 (Shannon)
  6. PageRank                       -> stationary distribution sums to 1
  7. Dynamic programming            -> Levenshtein edit distance & 0/1 knapsack optima
  8. Gradient-descent regression    -> recovers a known slope

All functions return plain dicts of JSON-serialisable values.
"""
from __future__ import annotations

import heapq
from collections import Counter

import networkx as nx
import numpy as np
from scipy.stats import entropy as scipy_entropy
from sklearn.cluster import KMeans
from sklearn.datasets import make_blobs
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

SIMULATION = {"simulation": True, "physical_hardware": False}


# ---------------------------------------------------------------------------
# 1. Dijkstra shortest path
# ---------------------------------------------------------------------------
def dijkstra_shortest_path(edges: list[tuple] | None = None,
                           source: str = "A", target: str = "E") -> dict:
    """Dijkstra's single-source shortest path on a weighted directed graph.

    Hand-rolled binary-heap Dijkstra (the real algorithm), cross-checked
    against networkx. Default graph (classic textbook example):
        A-B:1, A-C:4, B-C:2, B-D:5, C-D:1, D-E:3
    Known shortest A->E = A-B-C-D-E = 1+2+1+3 = 7.
    """
    if edges is None:
        edges = [("A", "B", 1), ("A", "C", 4), ("B", "C", 2),
                 ("B", "D", 5), ("C", "D", 1), ("D", "E", 3)]

    adj: dict[str, list[tuple]] = {}
    nodes = set()
    for u, v, w in edges:
        adj.setdefault(u, []).append((v, float(w)))
        nodes.add(u)
        nodes.add(v)

    dist = {n: float("inf") for n in nodes}
    prev: dict[str, str | None] = {n: None for n in nodes}
    dist[source] = 0.0
    pq: list[tuple] = [(0.0, source)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v, w in adj.get(u, []):
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))

    path = []
    if dist[target] < float("inf"):
        cur: str | None = target
        while cur is not None:
            path.append(cur)
            cur = prev[cur]
        path.reverse()

    # Cross-check with networkx as an independent oracle.
    g = nx.DiGraph()
    for u, v, w in edges:
        g.add_edge(u, v, weight=w)
    nx_dist = nx.shortest_path_length(g, source, target, weight="weight")

    return {**SIMULATION, "method": "Dijkstra",
            "distance": float(dist[target]),
            "path": path,
            "networkx_distance": float(nx_dist),
            "matches_oracle": abs(dist[target] - nx_dist) < 1e-9}


# ---------------------------------------------------------------------------
# 2. Shannon entropy / information content
# ---------------------------------------------------------------------------
def shannon_entropy(probabilities: list[float] | None = None) -> dict:
    """Shannon entropy H = -sum p_i log2(p_i)  (Shannon 1948), in bits.

    Default = fair coin [0.5, 0.5] whose KNOWN entropy is exactly 1 bit.
    Cross-checked against scipy.stats.entropy (base 2).
    """
    if probabilities is None:
        probabilities = [0.5, 0.5]
    p = np.asarray(probabilities, dtype=float)
    p = p / p.sum()
    nz = p[p > 0]
    h = float(-np.sum(nz * np.log2(nz)))
    h_scipy = float(scipy_entropy(p, base=2))
    return {**SIMULATION, "method": "Shannon entropy",
            "entropy_bits": h,
            "scipy_entropy_bits": h_scipy,
            "self_information_bits": [float(-np.log2(x)) if x > 0 else None
                                      for x in p]}


# ---------------------------------------------------------------------------
# 3. k-means clustering
# ---------------------------------------------------------------------------
def kmeans_clustering(n_clusters: int = 3, n_samples: int = 300,
                      random_state: int = 42) -> dict:
    """Lloyd's k-means (sklearn) on well-separated Gaussian blobs.

    With centers far apart, k-means recovers the true grouping: every cluster
    should be (near) pure -> homogeneity ~ 1.0.
    """
    X, y_true = make_blobs(n_samples=n_samples, centers=n_clusters,
                           cluster_std=0.40, center_box=(-10.0, 10.0),
                           random_state=random_state)
    km = KMeans(n_clusters=n_clusters, n_init=10, random_state=random_state)
    labels = km.fit_predict(X)

    # Purity: for each predicted cluster, fraction in its dominant true class.
    purity = 0
    for c in range(n_clusters):
        members = y_true[labels == c]
        if len(members):
            purity += np.bincount(members).max()
    purity = float(purity / len(y_true))

    return {**SIMULATION, "method": "k-means (Lloyd)",
            "n_clusters": n_clusters,
            "purity": purity,
            "inertia": float(km.inertia_),
            "n_iter": int(km.n_iter_)}


# ---------------------------------------------------------------------------
# 4. Random-forest / decision-tree classifier
# ---------------------------------------------------------------------------
def random_forest_accuracy(n_samples: int = 300, random_state: int = 42) -> dict:
    """Random-forest classifier accuracy on a linearly separable blob set.

    On well-separated classes the forest should reach near-perfect (~1.0)
    held-out accuracy.
    """
    X, y = make_blobs(n_samples=n_samples, centers=2, cluster_std=0.50,
                      center_box=(-8.0, 8.0), random_state=random_state)
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.3, random_state=random_state)
    clf = RandomForestClassifier(n_estimators=50, random_state=random_state)
    clf.fit(X_tr, y_tr)
    acc = float(accuracy_score(y_te, clf.predict(X_te)))
    return {**SIMULATION, "method": "RandomForest",
            "accuracy": acc,
            "n_estimators": 50,
            "n_test": int(len(y_te))}


# ---------------------------------------------------------------------------
# 5. Huffman coding compression
# ---------------------------------------------------------------------------
def huffman_coding(text: str = "abracadabra") -> dict:
    """Huffman (1952) optimal prefix code.

    Builds the code by repeatedly merging the two lowest-frequency nodes.
    Shannon's source-coding theorem guarantees:
        H <= average code length < H + 1   (bits/symbol)
    """
    freq = Counter(text)
    n = len(text)
    # Build Huffman tree with a min-heap.
    heap: list = [[w, i, sym] for i, (sym, w) in enumerate(freq.items())]
    heapq.heapify(heap)
    counter = len(heap)
    if len(heap) == 1:  # single-symbol edge case
        codes = {heap[0][2]: "0"}
    else:
        nodes = {sym: {"sym": sym} for sym in freq}
        while len(heap) > 1:
            lo = heapq.heappop(heap)
            hi = heapq.heappop(heap)
            merged = {"left": lo[2], "right": hi[2]}
            key = f"_int{counter}"
            nodes[key] = merged
            heapq.heappush(heap, [lo[0] + hi[0], counter, key])
            counter += 1
        root = heap[0][2]

        codes: dict[str, str] = {}

        def walk(node_key: str, prefix: str) -> None:
            node = nodes[node_key]
            if "sym" in node:
                codes[node["sym"]] = prefix or "0"
                return
            walk(node["left"], prefix + "0")
            walk(node["right"], prefix + "1")

        walk(root, "")

    encoded = "".join(codes[c] for c in text)
    avg_len = len(encoded) / n
    probs = np.array([c / n for c in freq.values()])
    H = float(-np.sum(probs * np.log2(probs)))

    # Verify the prefix property (no code is a prefix of another).
    code_list = sorted(codes.values())
    prefix_free = all(
        not b.startswith(a)
        for i, a in enumerate(code_list) for b in code_list[i + 1:])

    return {**SIMULATION, "method": "Huffman coding",
            "entropy_bits": H,
            "avg_code_length": float(avg_len),
            "fixed_length_bits": int(np.ceil(np.log2(len(freq)))) if len(freq) > 1 else 1,
            "compression_ratio": float((np.ceil(np.log2(max(len(freq), 2)))) / avg_len),
            "codes": codes,
            "prefix_free": prefix_free,
            "within_shannon_bound": H <= avg_len < H + 1}


# ---------------------------------------------------------------------------
# 6. PageRank
# ---------------------------------------------------------------------------
def pagerank(edges: list[tuple] | None = None, damping: float = 0.85) -> dict:
    """Brin & Page (1998) PageRank via networkx (power iteration).

    The stationary distribution is a probability vector: it sums to 1. On the
    default graph node C (most in-links) should rank highest.
    """
    if edges is None:
        edges = [("A", "C"), ("B", "C"), ("C", "A"), ("D", "C"), ("E", "C")]
    g = nx.DiGraph()
    g.add_edges_from(edges)
    pr = nx.pagerank(g, alpha=damping)
    total = float(sum(pr.values()))
    top = max(pr, key=pr.get)
    return {**SIMULATION, "method": "PageRank",
            "ranks": {k: float(v) for k, v in pr.items()},
            "sums_to_one": abs(total - 1.0) < 1e-6,
            "total": total,
            "top_node": top}


# ---------------------------------------------------------------------------
# 7. Dynamic programming: edit distance & 0/1 knapsack
# ---------------------------------------------------------------------------
def edit_distance(a: str = "kitten", b: str = "sitting") -> dict:
    """Levenshtein (Wagner-Fischer) DP edit distance.

    KNOWN: distance("kitten","sitting") = 3 (k->s, e->i, +g).
    """
    m, n = len(a), len(b)
    dp = np.zeros((m + 1, n + 1), dtype=int)
    dp[:, 0] = np.arange(m + 1)
    dp[0, :] = np.arange(n + 1)
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dp[i, j] = min(dp[i - 1, j] + 1,        # deletion
                           dp[i, j - 1] + 1,        # insertion
                           dp[i - 1, j - 1] + cost)  # substitution
    return {**SIMULATION, "method": "Levenshtein DP",
            "distance": int(dp[m, n]), "a": a, "b": b}


def knapsack_01(weights: list[int] | None = None,
                values: list[int] | None = None,
                capacity: int = 50) -> dict:
    """0/1 knapsack via dynamic programming.

    KNOWN textbook instance: weights=[10,20,30], values=[60,100,120],
    capacity=50 -> optimum value 220 (take items of weight 20 + 30).
    """
    if weights is None:
        weights = [10, 20, 30]
    if values is None:
        values = [60, 100, 120]
    n = len(weights)
    dp = np.zeros((n + 1, capacity + 1), dtype=int)
    for i in range(1, n + 1):
        w, v = weights[i - 1], values[i - 1]
        for c in range(capacity + 1):
            dp[i, c] = dp[i - 1, c]
            if w <= c:
                dp[i, c] = max(dp[i, c], dp[i - 1, c - w] + v)
    # Backtrack chosen items.
    chosen, c = [], capacity
    for i in range(n, 0, -1):
        if dp[i, c] != dp[i - 1, c]:
            chosen.append(i - 1)
            c -= weights[i - 1]
    chosen.reverse()
    return {**SIMULATION, "method": "0/1 knapsack DP",
            "max_value": int(dp[n, capacity]),
            "chosen_items": chosen, "capacity": capacity}


# ---------------------------------------------------------------------------
# 8. Gradient-descent linear regression
# ---------------------------------------------------------------------------
def gradient_descent_regression(true_slope: float = 2.0, true_intercept: float = 1.0,
                                n: int = 200, lr: float = 0.05, epochs: int = 5000,
                                noise: float = 0.05, random_state: int = 0) -> dict:
    """Batch gradient descent for y = w*x + b on synthetic data.

    Recovers a KNOWN slope/intercept. With low noise the learned slope should
    match the true slope within tolerance.
    """
    rng = np.random.default_rng(random_state)
    x = np.linspace(-1.0, 1.0, n)
    y = true_slope * x + true_intercept + rng.normal(0, noise, n)

    w, b = 0.0, 0.0
    for _ in range(epochs):
        y_hat = w * x + b
        err = y_hat - y
        grad_w = float(2.0 * np.mean(err * x))
        grad_b = float(2.0 * np.mean(err))
        w -= lr * grad_w
        b -= lr * grad_b

    final_loss = float(np.mean((w * x + b - y) ** 2))
    return {**SIMULATION, "method": "Gradient-descent linear regression",
            "learned_slope": float(w),
            "learned_intercept": float(b),
            "true_slope": true_slope,
            "true_intercept": true_intercept,
            "final_mse": final_loss}


METHODS = {
    "dijkstra_shortest_path": dijkstra_shortest_path,
    "shannon_entropy": shannon_entropy,
    "kmeans_clustering": kmeans_clustering,
    "random_forest_accuracy": random_forest_accuracy,
    "huffman_coding": huffman_coding,
    "pagerank": pagerank,
    "edit_distance": edit_distance,
    "knapsack_01": knapsack_01,
    "gradient_descent_regression": gradient_descent_regression,
}
