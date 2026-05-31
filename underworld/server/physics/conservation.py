"""Conservation Auditor (kernel #2/#5).

Tracks the conserved quantities — mass, energy, momentum, charge — across any
process and flags a violation when the books don't balance (within tolerance,
after accounting for declared sources/sinks). No free heat, no free force, no free
current, no free material.
"""

from __future__ import annotations

from dataclasses import dataclass

CONSERVED = ("mass", "energy", "momentum", "charge")


@dataclass(frozen=True)
class AuditResult:
    quantity: str
    before: float
    after: float
    delta: float
    conserved: bool


def audit(
    before: dict[str, float],
    after: dict[str, float],
    *,
    sources: dict[str, float] | None = None,
    tol: float = 1e-6,
) -> list[AuditResult]:
    """Compare before/after for each conserved quantity. `sources` declares any
    legitimate inflow/outflow (e.g. fuel burned releases energy); the balance must
    close to within `tol`."""
    sources = sources or {}
    out: list[AuditResult] = []
    for q in CONSERVED:
        b = float(before.get(q, 0.0))
        a = float(after.get(q, 0.0))
        src = float(sources.get(q, 0.0))
        delta = a - (b + src)
        out.append(AuditResult(q, b, a, round(delta, 9), abs(delta) <= tol))
    return out


def all_conserved(results: list[AuditResult]) -> bool:
    return all(r.conserved for r in results)
