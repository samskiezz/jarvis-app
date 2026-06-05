"""JARVIS AI — model gateway + permission-aware retrieval (AIP-grade AI plumbing).

AIP-grade AI is grounded INSIDE the ontology + security model, not a loose LLM:

  * MODEL GATEWAY     — a registry of models with capability / cost / risk; ``route``
                        picks the cheapest model meeting the task's constraints.
  * RETRIEVAL GATEWAY — ``retrieve`` searches ontology objects then filters every
                        hit through the Policy Decision Point, so the context the
                        model would see is REDACTED to the subject's clearance — a
                        permission-aware RAG gateway, with citations.
  * GOVERNED CONTEXT  — ``ask`` assembles {chosen_model, permissioned cited context}
                        ready for a model call. (No LLM is invoked here — this is the
                        plumbing that grounds + permissions the context; the model
                        call itself is a pluggable downstream step.)

stdlib only, never raises.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from . import jarvis_os as jos

try:
    from . import jarvis_ontology as ont
except Exception:  # noqa: BLE001
    ont = None  # type: ignore
try:
    from . import jarvis_policy as pol
except Exception:  # noqa: BLE001
    pol = None  # type: ignore


# ───────────────────────────────────────────────────────────── model gateway
@dataclass(frozen=True)
class Model:
    name: str
    capabilities: frozenset
    cost_per_1k: float     # relative cost units
    risk: str              # low | medium | high (e.g. data egress / external)
    max_tokens: int


_RISK = {"low": 0, "medium": 1, "high": 2}

MODELS = [
    Model("local-small",  frozenset({"chat", "extract", "classify"}),        0.0, "low",    8000),
    Model("local-large",  frozenset({"chat", "extract", "classify", "reason"}), 0.2, "low", 32000),
    Model("frontier",     frozenset({"chat", "extract", "classify", "reason", "vision"}), 1.0, "high", 200000),
]


def route(task: str, *, need: list[str] | None = None, max_risk: str = "high",
          max_cost: float = 1.0) -> dict:
    """Pick the cheapest model meeting capability + risk + cost constraints."""
    need_caps = set(need or [task])
    cap = _RISK.get(max_risk, 2)
    candidates = [m for m in MODELS
                  if need_caps.issubset(m.capabilities)
                  and _RISK[m.risk] <= cap and m.cost_per_1k <= max_cost]
    if not candidates:
        return {"status": "no_model", "need": sorted(need_caps), "max_risk": max_risk}
    chosen = min(candidates, key=lambda m: (m.cost_per_1k, _RISK[m.risk]))
    jos.audit("ai.route", target=chosen.name, meta={"task": task, "need": sorted(need_caps)})
    return {"status": "ok", "model": chosen.name, "cost_per_1k": chosen.cost_per_1k,
            "risk": chosen.risk, "considered": [m.name for m in candidates]}


def gateway() -> list[dict]:
    return [{"name": m.name, "capabilities": sorted(m.capabilities),
             "cost_per_1k": m.cost_per_1k, "risk": m.risk, "max_tokens": m.max_tokens} for m in MODELS]


# ───────────────────────────────────────────────────────────── retrieval gateway
def _tokens(s: str) -> set:
    return set(re.findall(r"[a-z0-9]+", (s or "").lower()))


def retrieve(subject_id: str, query: str, *, purpose: str = "", k: int = 5,
             object_type: str | None = None) -> dict:
    """Permission-aware retrieval: rank ontology objects by query overlap, then
    return each through the PDP so classified properties are redacted per subject."""
    if ont is None:
        return {"status": "ontology_unavailable", "hits": []}
    q = _tokens(query)
    scored = []
    for meta in ont.list_objects(object_type, limit=2000):
        obj = ont.get_object(meta["id"])
        if not obj:
            continue
        text = " ".join(str(v) for v in (obj.get("props") or {}).values())
        ov = q & _tokens(text)
        if ov:
            scored.append((len(ov), obj["id"]))
    scored.sort(reverse=True)
    hits = []
    for _, oid in scored[: max(1, int(k))]:
        if pol is not None:
            view = pol.view_object(subject_id, oid, purpose=purpose)
        else:
            o = ont.get_object(oid); view = {"id": oid, "props": o["props"], "redacted": False}
        hits.append({"id": view["id"], "type": view.get("type"),
                     "props": view.get("props", {}), "redacted": view.get("redacted", False),
                     "citation": f"ontology://{view['id']}"})
    jos.audit("ai.retrieve", actor=subject_id, target=query[:60],
              meta={"hits": len(hits), "purpose": purpose})
    return {"status": "ok", "query": query, "subject": subject_id, "hits": hits}


def ask(subject_id: str, query: str, *, purpose: str = "", need: list[str] | None = None,
        max_risk: str = "high") -> dict:
    """Assemble a governed, permissioned, cited context + the chosen model — the
    grounded prompt a downstream model call would consume."""
    r = route("reason", need=need or ["reason"], max_risk=max_risk)
    ctx = retrieve(subject_id, query, purpose=purpose)
    citations = [h["citation"] for h in ctx["hits"]]
    jos.audit("ai.ask", actor=subject_id, target=query[:60],
              meta={"model": r.get("model"), "citations": len(citations)})
    return {"status": "ok", "query": query, "subject": subject_id, "purpose": purpose,
            "model": r.get("model"), "model_routing": r,
            "grounded_context": ctx["hits"], "citations": citations,
            "note": "Governed context assembled (clearance-redacted, cited). "
                    "Downstream model invocation is a pluggable step."}
