"""Manufacturing Tolerance + Supply-Chain Depth Layer.

The design's "big-missing" insight: knowledge alone never makes a thing. *A
transistor patent is useless to Minions without ultrapure silicon and
fabrication infrastructure.* Between an idea and an artifact sits a whole stack
of physical capability — the achievable precision of your tools, the upstream
tree of materials and components every part silently depends on, and the brutal
arithmetic of manufacturing yield.

This module models that gap as a pure, unit-testable core (no DB, no LLM):

  Process            the catalogue of fabrication capabilities a civ can hold,
                     from HAND_TOOLS to LITHOGRAPHY.
  process_precision  how fine a feature each process can reliably hit.
  can_manufacture    capability gate — can this civ actually build the artifact,
                     and if not, which processes are missing?
  supply_chain       the radio example: expand an artifact's full upstream
                     dependency tree (copper-mining → wire-drawing → …) to leaves.
  yield_rate         the fraction of units that come out non-defective.

Nothing here invents facts. It only relates a civilisation's tooling to what
that tooling can physically produce.
"""
from __future__ import annotations

from enum import Enum


# ── the catalogue of fabrication capabilities ────────────────────────────────
class Process(str, Enum):
    """Manufacturing capabilities a civilisation can acquire.

    Ordered roughly by historical / precision progression: a hand tool shapes
    coarse wood; lithography prints features finer than a wavelength of light.
    """

    HAND_TOOLS = "hand_tools"
    JIG = "jig"
    LATHE = "lathe"
    MILLING = "milling"
    CASTING = "casting"
    FORGING = "forging"
    HEAT_TREATMENT = "heat_treatment"
    METROLOGY = "metrology"
    INTERCHANGEABLE_PARTS = "interchangeable_parts"
    CLEAN_ROOM = "clean_room"
    LITHOGRAPHY = "lithography"
    CNC = "cnc"
    ROBOTICS = "robotics"
    ADDITIVE = "additive"


# Achievable precision per process, on a 0..1 scale where higher = finer
# tolerance attainable. Hand work is coarse; lithography is ultra-fine. These
# are relative capability ratings, not metric tolerances.
_PROCESS_PRECISION: dict[Process, float] = {
    Process.HAND_TOOLS: 0.10,
    Process.JIG: 0.30,
    Process.CASTING: 0.25,
    Process.FORGING: 0.30,
    Process.LATHE: 0.45,
    Process.MILLING: 0.55,
    Process.HEAT_TREATMENT: 0.50,
    Process.ADDITIVE: 0.55,
    Process.METROLOGY: 0.70,
    Process.INTERCHANGEABLE_PARTS: 0.65,
    Process.CNC: 0.85,
    Process.ROBOTICS: 0.80,
    Process.CLEAN_ROOM: 0.92,
    Process.LITHOGRAPHY: 0.99,
}


def process_precision(process: Process) -> float:
    """Achievable precision (0..1) for a single fabrication process.

    Coarse manual work sits near the floor; semiconductor lithography sits at
    the ceiling. Used both to gate manufacture and to drive yield.
    """
    return _PROCESS_PRECISION[process]


# ── capability gate: can this civ build the thing at all? ─────────────────────
def can_manufacture(
    artifact_requirements: dict,
    available: set[Process],
) -> tuple[bool, list[str]]:
    """Can a civ with `available` processes build the artifact?

    `artifact_requirements` carries:
        required_processes : list[Process]  — processes the artifact needs
        required_precision : float (0..1)   — finest tolerance any part demands

    The artifact is buildable only when every required process is present AND
    the best achievable precision among the available processes meets the
    demanded precision. A transistor (needs LITHOGRAPHY + CLEAN_ROOM) therefore
    fails for a bronze-age civ holding only hand tools and casting.

    Returns (ok, missing) where `missing` lists the process names that block
    manufacture — either absent processes, or a precision shortfall reported as
    a synthetic ``"precision:<needed>"`` entry.
    """
    required = artifact_requirements.get("required_processes", [])
    required_precision = float(artifact_requirements.get("required_precision", 0.0))

    missing: list[str] = []
    for proc in required:
        proc_enum = proc if isinstance(proc, Process) else Process(proc)
        if proc_enum not in available:
            missing.append(proc_enum.value)

    # Even with every required process, the civ must be able to hit the
    # tolerance the artifact demands somewhere in its toolset.
    best = max((process_precision(p) for p in available), default=0.0)
    if best + 1e-9 < required_precision:
        missing.append(f"precision:{required_precision}")

    return (len(missing) == 0, missing)


# ── supply-chain depth: expand the upstream dependency tree ───────────────────
def supply_chain(artifact: str, recipe: dict) -> list[dict]:
    """Expand the full upstream dependency tree for an artifact, to its leaves.

    The design's radio example: a radio is not "a radio" — it is wire, which is
    drawn copper, which is mined ore, which is a mine, a furnace, fuel… Each
    artifact's inputs are themselves artifacts with inputs, recursively, until
    raw materials (leaves with no recipe entry) terminate the chain.

    `recipe` maps an artifact name → list of its direct input names. Returns an
    ordered dependency list, each entry::

        {"artifact": name, "depth": int, "leaf": bool}

    Order is a depth-first traversal from the root's inputs outward. A cycle in
    the recipe is broken safely (each artifact is expanded at most once).
    """
    out: list[dict] = []
    seen: set[str] = set()

    def expand(name: str, depth: int) -> None:
        inputs = recipe.get(name, [])
        is_leaf = len(inputs) == 0
        out.append({"artifact": name, "depth": depth, "leaf": is_leaf})
        if name in seen:
            return
        seen.add(name)
        for child in inputs:
            expand(child, depth + 1)

    for child in recipe.get(artifact, []):
        expand(child, 1)
    return out


# ── manufacturing yield ──────────────────────────────────────────────────────
def yield_rate(process_precision_val: float, complexity: float) -> float:
    """Fraction of produced units that are non-defective (0..1).

    Yield falls as an artifact grows more complex (more parts, more steps, more
    chances to fail) and rises with the precision of the process making it.
    Modelled as a per-part success probability ``precision`` compounded over an
    effective part count that scales with complexity::

        yield = precision ** (1 + k * complexity)

    so a high-complexity build on coarse tooling collapses toward zero, while a
    precise process holds high yield even as complexity climbs.
    """
    p = min(max(process_precision_val, 0.0), 1.0)
    c = max(complexity, 0.0)
    exponent = 1.0 + 4.0 * c
    return round(p ** exponent, 6)
