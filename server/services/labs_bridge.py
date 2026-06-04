"""LABS BRIDGE — wake the DORMANT underworld lab modules.

The underworld platform ships a pile of real, benchmark-grade scientific
modules that have functions but no APEX route wired to them — they are
*dormant*. This bridge finally makes a curated set reachable:

  * drug_discovery   — in-silico screen of a (target, candidate) pair (RDKit/Biopython)
  * disease_models   — SIR/SEIR epidemic dynamics, R0, herd immunity
  * exotic_quantum   — time-crystal / topological / BEC condensed-matter demos
  * manufacturing    — capability gate + supply-chain + yield
  * patent_intel     — CPC/IPC classification of patent text
  * materials/standards — real materials models + metrology/standards

Design rules (identical contract to science_bridge / underworld_bridge):
  * Every underworld import is best-effort and isolated in a try/except. If a
    module is missing the matching wrapper degrades to
    ``{"status": "unavailable", ...}`` instead of raising — APEX boot/tests must
    never break on this bridge.
  * The wrappers NEVER raise. Any runtime failure becomes
    ``{"status": "error", ...}``.
"""
from __future__ import annotations

from typing import Any

# ── Best-effort import of each DORMANT module, isolated so one missing dep does
# not take the rest down. Each name is None when its module fails to import. ──
_IMPORT_ERRORS: dict[str, str] = {}


def _try_import(name: str):
    try:
        mod = __import__(f"underworld.server.services.{name}", fromlist=[name])
        return mod
    except Exception as exc:  # noqa: BLE001 - any failure must degrade, not raise
        _IMPORT_ERRORS[name] = f"{type(exc).__name__}: {exc}"
        return None


_drug = _try_import("drug_discovery")
_disease = _try_import("disease_models")
_quantum = _try_import("exotic_quantum")
_mfg = _try_import("manufacturing")
_patent = _try_import("patent_intel")
_materials = _try_import("materials_advanced")
_standards = _try_import("standards")


# ── small helpers ────────────────────────────────────────────────────────────
def _unavailable(module: str) -> dict:
    out: dict[str, Any] = {
        "status": "unavailable",
        "reason": f"underworld module {module!r} not importable in this process",
    }
    if module in _IMPORT_ERRORS:
        out["detail"] = _IMPORT_ERRORS[module]
    return out


def _error(exc: Exception) -> dict:
    return {"status": "error", "reason": f"{type(exc).__name__}: {exc}"}


def _ok(module: str, capability: str, data: Any) -> dict:
    if not isinstance(data, dict):
        data = {"result": data}
    return {"status": "ok", "module": module, "capability": capability, "data": data}


# ── 1. drug discovery ────────────────────────────────────────────────────────
# A safe default target (a short fragment of human insulin B-chain) + a real
# drug-like candidate (ibuprofen SMILES) so the capability is demoable with no
# input.
_DEFAULT_TARGET = "FVNQHLCGSHLVEALYLVCGERGFFYTPKT"
_DEFAULT_CANDIDATE = "CC(C)Cc1ccc(cc1)C(C)C(=O)O"  # ibuprofen


def drug_discovery(target: str | None = None, candidate: str | None = None) -> dict:
    """Screen one (target protein, candidate molecule) pair in-silico.

    ``target`` is an amino-acid sequence; ``candidate`` is a SMILES string. Both
    default to a demoable pair (insulin B-chain fragment + ibuprofen) so the
    capability works with no input. Delegates to
    :func:`drug_discovery.screen_candidate`.
    """
    if _drug is None:
        return _unavailable("drug_discovery")
    try:
        tgt = target or _DEFAULT_TARGET
        cand = candidate or _DEFAULT_CANDIDATE
        return _ok("drug_discovery", "drug_discovery",
                   _drug.screen_candidate(tgt, cand))
    except Exception as exc:  # noqa: BLE001
        return _error(exc)


# ── 2. disease models ────────────────────────────────────────────────────────
def disease_model(kind: str = "sir", params: dict | None = None) -> dict:
    """Run an epidemic-dynamics model.

    ``kind`` selects the model:
      * ``"sir"``  — full SIR Euler integration (peak/final size).
      * ``"seir"`` — one SEIR step from a supplied/default state.
      * ``"r0"``   — R0 = β/γ plus the herd-immunity threshold.

    ``params`` are forwarded as keyword arguments with sane defaults so the
    capability runs with no input. Delegates to :mod:`disease_models`.
    """
    if _disease is None:
        return _unavailable("disease_models")
    try:
        p = dict(params or {})
        k = (kind or "sir").lower()
        if k == "r0":
            beta = float(p.get("beta", 0.4))
            gamma = float(p.get("gamma", 0.1))
            r0_val = _disease.r0(beta=beta, gamma=gamma)
            data = {
                "r0": r0_val,
                "herd_immunity_threshold": _disease.herd_immunity_threshold(r0_val),
            }
        elif k == "seir":
            state = p.get("state") or {"S": 990.0, "E": 0.0, "I": 10.0, "R": 0.0}
            data = _disease.seir_step(
                state,
                beta=float(p.get("beta", 0.4)),
                sigma=float(p.get("sigma", 0.2)),
                gamma=float(p.get("gamma", 0.1)),
                dt=float(p.get("dt", 1.0)),
            )
        else:  # sir (default)
            data = _disease.sir_simulate(
                s0=float(p.get("s0", 990.0)),
                i0=float(p.get("i0", 10.0)),
                beta=float(p.get("beta", 0.4)),
                gamma=float(p.get("gamma", 0.1)),
                steps=int(p.get("steps", 160)),
                dt=float(p.get("dt", 1.0)),
            )
            k = "sir"
        return _ok("disease_models", f"disease_model:{k}", data)
    except Exception as exc:  # noqa: BLE001
        return _error(exc)


# ── 3. exotic quantum demos ──────────────────────────────────────────────────
def quantum_demo(kind: str = "time_crystal", params: dict | None = None) -> dict:
    """Run a condensed-matter / exotic-quantum demo.

    ``kind`` selects the phenomenon:
      * ``"time_crystal"`` — Floquet subharmonic (period-2T) detector.
      * ``"topological"``  — winding-number topological invariant.
      * ``"bec"``          — Bose-Einstein condensate fraction.
      * ``"mbl"``          — many-body-localisation regime.
      * ``"metrology"``    — Heisenberg-limit precision gain.

    Delegates to :mod:`exotic_quantum`, all with demoable defaults.
    """
    if _quantum is None:
        return _unavailable("exotic_quantum")
    try:
        import math

        p = dict(params or {})
        k = (kind or "time_crystal").lower()
        if k in ("topological", "topology"):
            phases = p.get("phases") or [i * (2 * math.pi / 8) for i in range(9)]
            data = _quantum.topological_invariant([float(x) for x in phases])
            k = "topological"
        elif k == "bec":
            data = _quantum.bec_condensate_fraction(
                temperature=float(p.get("temperature", 0.5)),
                t_critical=float(p.get("t_critical", 1.0)),
            )
        elif k == "mbl":
            data = _quantum.many_body_localisation(
                disorder=float(p.get("disorder", 5.0)),
                interaction=float(p.get("interaction", 1.0)),
            )
        elif k == "metrology":
            data = _quantum.quantum_metrology(
                n_probes=int(p.get("n_probes", 100)),
                entangled=bool(p.get("entangled", True)),
            )
        else:  # time_crystal (default)
            data = _quantum.floquet_subharmonic(
                drive_period=int(p.get("drive_period", 2)),
                steps=int(p.get("steps", 256)),
                imperfection=float(p.get("imperfection", 0.05)),
            )
            k = "time_crystal"
        return _ok("exotic_quantum", f"quantum_demo:{k}", data)
    except Exception as exc:  # noqa: BLE001
        return _error(exc)


# ── 4. manufacturing simulation ──────────────────────────────────────────────
def manufacturing_sim(params: dict | None = None) -> dict:
    """Estimate manufacturing yield for a process precision + complexity.

    ``params`` accepts ``precision`` (0..1, default 0.85 ~ CNC) and
    ``complexity`` (>=0, default 0.3). Reports the predicted defect-free yield.
    Delegates to :func:`manufacturing.yield_rate`.
    """
    if _mfg is None:
        return _unavailable("manufacturing")
    try:
        p = dict(params or {})
        precision = float(p.get("precision", 0.85))
        complexity = float(p.get("complexity", 0.3))
        data = {
            "precision": precision,
            "complexity": complexity,
            "yield_rate": _mfg.yield_rate(precision, complexity),
        }
        # optional supply-chain expansion if a recipe is supplied
        recipe = p.get("recipe")
        artifact = p.get("artifact")
        if isinstance(recipe, dict) and artifact:
            data["supply_chain"] = _mfg.supply_chain(str(artifact), recipe)
        return _ok("manufacturing", "manufacturing_sim", data)
    except Exception as exc:  # noqa: BLE001
        return _error(exc)


# ── 5. patent classification ─────────────────────────────────────────────────
def patent_classify(text: str | None = None) -> dict:
    """Classify patent/disclosure ``text`` into a CPC/IPC section (A–H).

    Delegates to :func:`patent_intel.cpc_classify`.
    """
    if _patent is None:
        return _unavailable("patent_intel")
    try:
        t = text if text is not None else ""
        return _ok("patent_intel", "patent_classify", _patent.cpc_classify(str(t)))
    except Exception as exc:  # noqa: BLE001
        return _error(exc)


# ── 6. materials / standards ─────────────────────────────────────────────────
def materials_or_standards(kind: str = "tolerance", params: dict | None = None) -> dict:
    """Run a materials model or a standards/metrology check.

    ``kind`` selects:
      * ``"tolerance"``    — does a measured dimension meet a tolerance grade?
                             (``standards.tolerance_class``)
      * ``"calibrate"``    — fit an offset/scale from readings vs a reference.
      * ``"semiconductor"``— semiconductor-candidate screen from a band gap.
                             (``materials_advanced.semiconductor_candidate``)
      * ``"superconductor"``— superconductor-candidate screen.

    Defaults are demoable. Falls back to whichever of the two underlying modules
    imported.
    """
    p = dict(params or {})
    k = (kind or "tolerance").lower()
    try:
        if k in ("semiconductor", "superconductor"):
            if _materials is None:
                return _unavailable("materials_advanced")
            if k == "semiconductor":
                data = _materials.semiconductor_candidate(
                    bandgap_ev=float(p.get("bandgap_ev", p.get("band_gap", 1.1))))
            else:
                data = _materials.superconductor_candidate(
                    debye_temp=float(p.get("debye_temp", 400.0)),
                    coupling=float(p.get("coupling", 0.3)),
                    dos=float(p.get("dos", 1.0)))
            return _ok("materials_advanced", f"materials:{k}", data)

        # standards-backed checks
        if _standards is None:
            return _unavailable("standards")
        if k == "calibrate":
            readings = [float(x) for x in (p.get("readings") or [10.1, 9.9, 10.2, 9.8])]
            reference = float(p.get("reference", 10.0))
            data = _standards.calibrate(readings, reference)
        else:  # tolerance (default)
            data = _standards.tolerance_class(
                float(p.get("actual", 10.02)),
                float(p.get("nominal", 10.0)),
                grade=str(p.get("grade", "fine")),
            )
            k = "tolerance"
        return _ok("standards", f"standards:{k}", data)
    except Exception as exc:  # noqa: BLE001
        return _error(exc)


# ── catalog ──────────────────────────────────────────────────────────────────
# Each entry: capability name, the underworld module it wakes, and whether that
# module imported successfully in this process.
_CATALOG: list[dict] = [
    {"capability": "drug_discovery", "module": "drug_discovery",
     "description": "In-silico screen of a (target protein, candidate SMILES) pair.",
     "loaded": _drug is not None},
    {"capability": "disease_model", "module": "disease_models",
     "description": "Epidemic dynamics: SIR / SEIR / R0 + herd immunity.",
     "loaded": _disease is not None},
    {"capability": "quantum_demo", "module": "exotic_quantum",
     "description": "Exotic-quantum demos: time crystal / topological / BEC / MBL / metrology.",
     "loaded": _quantum is not None},
    {"capability": "manufacturing_sim", "module": "manufacturing",
     "description": "Manufacturing yield + supply-chain depth.",
     "loaded": _mfg is not None},
    {"capability": "patent_classify", "module": "patent_intel",
     "description": "CPC/IPC section classifier for patent text.",
     "loaded": _patent is not None},
    {"capability": "materials_or_standards", "module": "materials_advanced/standards",
     "description": "Materials candidates + standards/metrology (tolerance/calibration).",
     "loaded": (_materials is not None) or (_standards is not None)},
]


def catalog() -> list[dict]:
    """List every lab capability this bridge exposes + whether it imported.

    Each entry is ``{capability, module, description, loaded, status}`` where
    ``status`` is ``"available"`` when the backing module imported and
    ``"unavailable"`` otherwise. Never raises.
    """
    out: list[dict] = []
    for entry in _CATALOG:
        item = dict(entry)
        item["status"] = "available" if entry["loaded"] else "unavailable"
        if not entry["loaded"]:
            # surface the first import error that applies, if any
            for mod in str(entry["module"]).split("/"):
                if mod in _IMPORT_ERRORS:
                    item["detail"] = _IMPORT_ERRORS[mod]
                    break
        out.append(item)
    return out


# ── dispatch (used by the route) ─────────────────────────────────────────────
_DISPATCH = {
    "drug_discovery": lambda params: drug_discovery(
        (params or {}).get("target"), (params or {}).get("candidate")),
    "disease_model": lambda params: disease_model(
        (params or {}).get("kind", "sir"), params),
    "quantum_demo": lambda params: quantum_demo(
        (params or {}).get("kind", "time_crystal"), params),
    "manufacturing_sim": lambda params: manufacturing_sim(params),
    "patent_classify": lambda params: patent_classify((params or {}).get("text")),
    "materials_or_standards": lambda params: materials_or_standards(
        (params or {}).get("kind", "tolerance"), params),
}


def run(capability: str, params: dict | None = None) -> dict:
    """Run a lab ``capability`` by name with ``params``. Never raises — an unknown
    capability returns an ``error`` dict naming the available capabilities."""
    fn = _DISPATCH.get(str(capability or ""))
    if fn is None:
        return {
            "status": "error",
            "reason": f"unknown capability {capability!r}",
            "available": sorted(_DISPATCH),
        }
    try:
        return fn(params or {})
    except Exception as exc:  # noqa: BLE001 - bridge must never raise
        return _error(exc)
