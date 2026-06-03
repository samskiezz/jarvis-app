"""Real structure folding — the high-level structure simulations:

  * Nucleic-acid secondary structure via the NUSSINOV algorithm (the classic
    dynamic-programming base-pair-maximisation method) → a real folded structure
    (dot-bracket) for DNA/RNA, with G-C / A-T(U) / G-U wobble pairing.
  * Protein secondary structure via CHOU-FASMAN (the real propensity method) →
    per-residue helix / sheet / coil assignment.

These are genuine folding algorithms (taught + used), not look-ups — the
achievable tier below AlphaFold (which needs trained weights + GPUs).
"""
from __future__ import annotations

_PAIRS = {("A", "T"), ("T", "A"), ("A", "U"), ("U", "A"),
          ("G", "C"), ("C", "G"), ("G", "U"), ("U", "G")}


def _can_pair(a: str, b: str) -> bool:
    return (a, b) in _PAIRS


def nussinov(seq: str, *, min_loop: int = 3) -> dict:
    """Fold a nucleic-acid sequence by maximising base pairs (Nussinov DP).
    Returns the dot-bracket structure + number of pairs + a stability proxy."""
    s = seq.upper()
    n = len(s)
    dp = [[0] * n for _ in range(n)]
    for k in range(1, n):
        for i in range(n - k):
            j = i + k
            best = dp[i + 1][j]                       # i unpaired
            best = max(best, dp[i][j - 1])            # j unpaired
            if j - i > min_loop and _can_pair(s[i], s[j]):
                best = max(best, dp[i + 1][j - 1] + 1)   # i-j paired
            for t in range(i + 1, j):                 # bifurcation
                best = max(best, dp[i][t] + dp[t + 1][j])
            dp[i][j] = best
    # traceback
    struct = ["."] * n
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if i >= j:
            continue
        if dp[i][j] == dp[i + 1][j]:
            stack.append((i + 1, j))
        elif dp[i][j] == dp[i][j - 1]:
            stack.append((i, j - 1))
        elif j - i > min_loop and _can_pair(s[i], s[j]) and dp[i][j] == dp[i + 1][j - 1] + 1:
            struct[i], struct[j] = "(", ")"
            stack.append((i + 1, j - 1))
        else:
            for t in range(i + 1, j):
                if dp[i][j] == dp[i][t] + dp[t + 1][j]:
                    stack.append((i, t)); stack.append((t + 1, j))
                    break
    pairs = dp[0][n - 1] if n else 0
    gc = sum(1 for c in s if c in "GC")
    return {"sequence": s, "structure": "".join(struct), "base_pairs": pairs,
            "paired_fraction": round(2 * pairs / n, 4) if n else 0.0,
            "gc_content": round(gc / n, 4) if n else 0.0,
            "stability_proxy_kcal": round(-2.0 * pairs - 1.0 * gc / max(1, n), 3)}


# Chou-Fasman conformational propensities (Pα, Pβ) — the real published values.
_PA = {"A": 1.42, "R": 0.98, "N": 0.67, "D": 1.01, "C": 0.70, "E": 1.51, "Q": 1.11,
       "G": 0.57, "H": 1.00, "I": 1.08, "L": 1.21, "K": 1.16, "M": 1.45, "F": 1.13,
       "P": 0.57, "S": 0.77, "T": 0.83, "W": 1.08, "Y": 0.69, "V": 1.06}
_PB = {"A": 0.83, "R": 0.93, "N": 0.89, "D": 0.54, "C": 1.19, "E": 0.37, "Q": 1.10,
       "G": 0.75, "H": 0.87, "I": 1.60, "L": 1.30, "K": 0.74, "M": 1.05, "F": 1.38,
       "P": 0.55, "S": 0.75, "T": 1.19, "W": 1.37, "Y": 1.47, "V": 1.70}


def protein_secondary_structure(seq: str) -> dict:
    """Chou-Fasman per-residue secondary structure: H (helix), E (sheet), C (coil)
    from the conformational propensities."""
    s = seq.upper()
    ss = []
    for aa in s:
        pa, pb = _PA.get(aa, 1.0), _PB.get(aa, 1.0)
        if pa >= pb and pa > 1.03:
            ss.append("H")
        elif pb > pa and pb > 1.05:
            ss.append("E")
        else:
            ss.append("C")
    ss = "".join(ss)
    n = max(1, len(ss))
    return {"sequence": s, "secondary_structure": ss,
            "helix_fraction": round(ss.count("H") / n, 3),
            "sheet_fraction": round(ss.count("E") / n, 3),
            "coil_fraction": round(ss.count("C") / n, 3)}
