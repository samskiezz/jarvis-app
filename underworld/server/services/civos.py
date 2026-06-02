"""Civilisation Operating System — CivOS (#7 in the cutting-edge master spec).

This is the *unifying* layer the design calls "the system that makes the
simulation governable". The world already grows resources, economies,
institutions, knowledge and research through the existing services
(economy.py, governance.py, civics.py, grid.py, knowledge_decay.py,
projects.py, knowledge_graph.py). CivOS does not re-implement any of them — it
reads a plain-dict *world snapshot* those services produce and reasons over it,
turning a pile of running subsystems into ONE civilisation-health view a player
or an AI overseer can act on.

Six OS modules + one dashboard live here, all pure (no DB, no async, no LLM —
fully unit-testable), each a thin set of aggregation/reasoning functions over a
snapshot dict:

  ResourceOS     resource balance sheet → scarcity pressure & shortage risks.
  InstitutionOS  the institutions a civilisation runs → capacity & gaps.
  KnowledgeOS    epistemic health → the dark-age (knowledge-loss) risk.
  EconomyOS      money/goods/prices → inflation, supply-demand, monopoly.
  RiskOS         the master risk register (famine…unrest) with drivers.
  ResearchOS     hypotheses→experiments→replication → research throughput.

  civ_dashboard  composes all six into an overall_health score (0..1) and the
                 top-3 actionable concerns — the governable-civilisation view.

Snapshots are intentionally storage-agnostic: callers hydrate them however they
like (live DB rows, a saved tick, a hand-built test fixture). Missing keys
default sanely so a partial snapshot never raises. Nothing here invents state;
it only relates and scores the state the world already produced.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable


# ── shared helpers ───────────────────────────────────────────────────────────
def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    """Pin a value into [lo, hi] — every CivOS score is a 0..1 signal."""
    return max(lo, min(hi, float(x)))


def _get(snapshot: dict, *path, default=None):
    """Read snapshot[a][b][c] tolerantly; a missing branch yields `default`."""
    cur = snapshot
    for key in path:
        if not isinstance(cur, dict) or key not in cur:
            return default
        cur = cur[key]
    return cur


def _round(x: float, n: int = 3) -> float:
    return round(float(x), n)


# ── ResourceOS: the civilisation balance sheet (doc big-missing: supply chain) ─
# The tradable/strategic stocks a civilisation lives on. Each is tracked as a
# {have, need} pair in the snapshot's "resources" block.
RESOURCES: tuple[str, ...] = (
    "food", "water", "timber", "stone", "ores", "fuels", "rare_earths",
    "medicines", "textiles", "energy", "labour", "knowledge",
)

# Resources whose shortage is immediately life-threatening (vs. merely limiting).
_VITAL_RESOURCES: frozenset[str] = frozenset({"food", "water", "medicines", "energy"})


def resource_pressure(snapshot: dict) -> dict:
    """Per-resource scarcity in 0..1 (0 = abundant, 1 = exhausted).

    Pressure is the shortfall of supply against demand: a resource with twice
    the demand it can meet reads ~1.0, one sitting on surplus reads ~0.0. This
    is the balance sheet the rest of CivOS (RiskOS especially) reasons over.
    """
    resources = _get(snapshot, "resources", default={}) or {}
    out: dict[str, float] = {}
    for name in RESOURCES:
        entry = resources.get(name, {}) or {}
        have = float(entry.get("have", 0.0))
        need = float(entry.get("need", 0.0))
        if need <= 0.0:
            # No demand → no pressure, regardless of stock.
            out[name] = 0.0
            continue
        # Shortfall as a fraction of demand; surplus reads zero.
        out[name] = _round(_clamp((need - have) / need))
    return out


def shortage_risks(snapshot: dict) -> list[dict]:
    """Resources under meaningful scarcity, worst first.

    A resource lands on the list once pressure clears a modest threshold;
    vital resources (food/water/medicines/energy) are flagged `critical` so the
    overseer sees a looming famine before it becomes one.
    """
    pressure = resource_pressure(snapshot)
    risks: list[dict] = []
    for name, p in pressure.items():
        if p < 0.2:
            continue
        critical = name in _VITAL_RESOURCES and p >= 0.5
        risks.append({
            "resource": name,
            "pressure": p,
            "severity": "critical" if critical else "elevated",
        })
    risks.sort(key=lambda r: r["pressure"], reverse=True)
    return risks


# ── InstitutionOS: the organisations a civilisation runs ─────────────────────
class Institution(str, Enum):
    """The institutional fabric. Ordered roughly by the tech level that needs them."""

    FAMILIES = "families"
    GUILDS = "guilds"
    TEMPLES = "temples"
    COURTS = "courts"
    GOVERNMENTS = "governments"
    MILITARIES = "militaries"
    LIBRARIES = "libraries"
    UNIVERSITIES = "universities"
    LABS = "labs"
    CORPORATIONS = "corporations"
    PATENT_OFFICES = "patent_offices"


# The minimum institutional set a civilisation *should* run at a given tech
# level (0..1 fraction of the full tech tree). Higher tech demands more.
_INSTITUTION_FLOORS: tuple[tuple[float, Institution], ...] = (
    (0.00, Institution.FAMILIES),
    (0.05, Institution.GUILDS),
    (0.05, Institution.TEMPLES),
    (0.20, Institution.COURTS),
    (0.20, Institution.GOVERNMENTS),
    (0.30, Institution.MILITARIES),
    (0.35, Institution.LIBRARIES),
    (0.55, Institution.UNIVERSITIES),
    (0.65, Institution.LABS),
    (0.70, Institution.CORPORATIONS),
    (0.80, Institution.PATENT_OFFICES),
)


def institutional_capacity(snapshot: dict) -> float:
    """How much organising power the civilisation has, 0..1.

    Each present institution contributes its `strength` (0..1); capacity is the
    average strength across the institutions that *exist*, scaled by how broad
    the institutional base is. A society with a few weak institutions reads low;
    one running many strong ones reads high — its ability to coordinate
    resources, knowledge and risk response.
    """
    institutions = _get(snapshot, "institutions", default={}) or {}
    strengths: list[float] = []
    for inst in Institution:
        entry = institutions.get(inst.value)
        if entry is None:
            continue
        if isinstance(entry, dict):
            strengths.append(_clamp(entry.get("strength", 0.0)))
        else:  # tolerate a bare bool/number meaning "present at full strength".
            strengths.append(_clamp(float(entry)))
    if not strengths:
        return 0.0
    avg_strength = sum(strengths) / len(strengths)
    breadth = len(strengths) / len(Institution)
    return _round(_clamp(avg_strength * (0.5 + 0.5 * breadth)))


def missing_institutions(snapshot: dict, tech_level: float) -> list[str]:
    """Institutions the civilisation's tech level demands but it lacks.

    A society that has reached labs and corporations but never built a patent
    office, or industrialised without courts, is institutionally unbalanced —
    a quiet driver of corruption, fraud and knowledge loss downstream.
    """
    tech = _clamp(tech_level)
    institutions = _get(snapshot, "institutions", default={}) or {}
    missing: list[str] = []
    for floor, inst in _INSTITUTION_FLOORS:
        if tech < floor:
            continue
        entry = institutions.get(inst.value)
        present = entry is not None and (
            (isinstance(entry, dict) and _clamp(entry.get("strength", 0.0)) > 0.0)
            or (not isinstance(entry, dict) and float(entry) > 0.0)
        )
        if not present:
            missing.append(inst.value)
    return missing


# ── KnowledgeOS: epistemic health & the dark-age risk ────────────────────────
class KnowledgeState(str, Enum):
    """The lifecycle states a fact can occupy in the civilisation's memory."""

    KNOWN = "known"
    DISPUTED = "disputed"
    LOST = "lost"
    BANNED = "banned"
    SECRET = "secret"
    REPLICATED = "replicated"
    PATENTED = "patented"
    OPEN = "open"


# How few holders make a fact fragile. A fact known by one minion and written in
# no book dies with that minion — the dark-age mechanism.
_FRAGILE_HOLDERS = 2
_FRAGILE_DOCS = 1


def knowledge_health(snapshot: dict) -> dict:
    """Epistemic vital signs from the snapshot's "knowledge" facts list.

    Returns share-of-facts in each meaningful state plus a single `health`
    score: a civilisation rich in known/replicated/open facts and light on
    lost/disputed/banned ones is doing real, durable science.
    """
    facts = _get(snapshot, "knowledge", "facts", default=[]) or []
    total = len(facts)
    counts = {s.value: 0 for s in KnowledgeState}
    for fact in facts:
        state = fact.get("state", KnowledgeState.KNOWN.value)
        if state in counts:
            counts[state] += 1
    if total == 0:
        return {"total": 0, "counts": counts, "health": 0.0,
                "durable_fraction": 0.0, "fragile_fraction": 0.0}

    durable = counts["known"] + counts["replicated"] + counts["open"]
    fragile = counts["lost"] + counts["disputed"] + counts["banned"]
    durable_fraction = _round(durable / total)
    fragile_fraction = _round(fragile / total)
    at_risk = len(at_risk_knowledge(snapshot))
    # Health rewards durable knowledge, penalises fragile state and thinly-held
    # facts that could be lost in a single death or fire.
    health = _clamp(durable_fraction - 0.5 * fragile_fraction - 0.5 * (at_risk / total))
    return {
        "total": total,
        "counts": counts,
        "durable_fraction": durable_fraction,
        "fragile_fraction": fragile_fraction,
        "health": _round(health),
    }


def at_risk_knowledge(snapshot: dict) -> list[dict]:
    """Facts held by too few minions / written in too few docs — dark-age risk.

    The civilisation's single greatest avoidable tragedy is forgetting what it
    learned. A fact that lives in one head and no book is one accident from
    becoming a `lost` node; this is the watch-list that drives RiskOS's
    knowledge_loss register and tells the overseer what to write down.
    """
    facts = _get(snapshot, "knowledge", "facts", default=[]) or []
    out: list[dict] = []
    for fact in facts:
        state = fact.get("state", KnowledgeState.KNOWN.value)
        if state == KnowledgeState.LOST.value:
            continue  # already gone — not "at risk", it's a casualty.
        holders = int(fact.get("holders", 0))
        docs = int(fact.get("docs", 0))
        if holders <= _FRAGILE_HOLDERS and docs <= _FRAGILE_DOCS:
            # Fewer holders / fewer docs ⇒ more fragile.
            fragility = _clamp(1.0 - 0.25 * holders - 0.25 * docs)
            out.append({
                "id": fact.get("id", ""),
                "label": fact.get("label", fact.get("id", "")),
                "holders": holders,
                "docs": docs,
                "fragility": _round(fragility),
            })
    out.sort(key=lambda f: f["fragility"], reverse=True)
    return out


# ── EconomyOS: money, goods & prices ─────────────────────────────────────────
def economic_state(snapshot: dict) -> dict:
    """Macro signals from the snapshot's "economy" block.

    Reads money_supply, goods (total real output) and a per-good market of
    {supply, demand, price, [seller_share]} — the same shape economy.market()
    emits — and derives:

      inflation         money growing faster than goods (doc I.40).
      supply_demand     mean demand/supply imbalance across goods (>1 = scarce).
      monopoly          worst single-seller market share seen (0..1).
      price_index       mean clearing price.
      stability         a 0..1 roll-up — high inflation, scarcity or monopoly
                        all erode it.
    """
    econ = _get(snapshot, "economy", default={}) or {}
    money = float(econ.get("money_supply", 0.0))
    goods = float(econ.get("goods", 0.0))
    prev_money = float(econ.get("prev_money_supply", money))
    prev_goods = float(econ.get("prev_goods", goods))
    market = econ.get("market", {}) or {}

    # Inflation: relative money growth minus relative goods growth (doc I.40).
    if prev_money > 0 and prev_goods > 0:
        money_growth = (money - prev_money) / prev_money
        goods_growth = (goods - prev_goods) / prev_goods
        inflation = _round(money_growth - goods_growth)
    else:
        inflation = 0.0

    imbalances: list[float] = []
    prices: list[float] = []
    monopoly = 0.0
    for good in market.values():
        supply = float(good.get("supply", 0.0))
        demand = float(good.get("demand", 0.0))
        imbalances.append(demand / (supply + 1.0))
        prices.append(float(good.get("price", 0.0)))
        monopoly = max(monopoly, _clamp(good.get("seller_share", 0.0)))

    supply_demand = _round(sum(imbalances) / len(imbalances)) if imbalances else 0.0
    price_index = _round(sum(prices) / len(prices)) if prices else 0.0

    # Stability falls with inflation, scarcity beyond parity, and concentration.
    scarcity_pen = _clamp(supply_demand - 1.0)
    stability = _clamp(1.0 - abs(inflation) - 0.5 * scarcity_pen - 0.5 * monopoly)
    return {
        "inflation": inflation,
        "supply_demand": supply_demand,
        "monopoly": _round(monopoly),
        "price_index": price_index,
        "stability": _round(stability),
    }


# ── RiskOS: the master risk register ─────────────────────────────────────────
class Risk(str, Enum):
    """The catastrophes a civilisation must be governed against."""

    FAMINE = "famine"
    PLAGUE = "plague"
    WAR = "war"
    POLLUTION = "pollution"
    COLLAPSE = "collapse"
    QUAKE = "quake"
    FIRE = "fire"
    CORRUPTION = "corruption"
    FRAUD = "fraud"
    KNOWLEDGE_LOSS = "knowledge_loss"
    UNREST = "unrest"


@dataclass(frozen=True)
class RiskEntry:
    """One line of the risk register: how bad, and what is driving it."""

    risk: Risk
    severity: float                       # 0..1
    drivers: tuple[str, ...] = field(default_factory=tuple)


def risk_register(snapshot: dict) -> list[RiskEntry]:
    """Score every master risk 0..1 and name its drivers, worst first.

    This is RiskOS's headline: it fuses the resource balance sheet, knowledge
    fragility, economy signals and raw environmental hazards from the snapshot's
    "hazards" block into one prioritised register. Only risks that are actually
    live (severity above a small floor) are returned.
    """
    pressure = resource_pressure(snapshot)
    knowledge = knowledge_health(snapshot)
    econ = economic_state(snapshot)
    hazards = _get(snapshot, "hazards", default={}) or {}
    cap = institutional_capacity(snapshot)

    def hz(name: str) -> float:
        return _clamp(hazards.get(name, 0.0))

    entries: list[tuple[Risk, float, list[str]]] = []

    # Famine — food (and the water/labour that grow it) running short.
    fam = _clamp(0.7 * pressure["food"] + 0.3 * pressure["water"])
    entries.append((Risk.FAMINE, fam, _drivers_for_resources(pressure, ("food", "water"))))

    # Plague — disease load worsened by medicine shortage.
    plague = _clamp(0.6 * hz("disease") + 0.4 * pressure["medicines"])
    entries.append((Risk.PLAGUE, plague, _named_drivers(
        [("disease load", hz("disease")), ("medicine shortage", pressure["medicines"])])))

    # War — scarcity + weak rule of law (low institutional capacity).
    war = _clamp(0.5 * hz("tension") + 0.3 * pressure["food"] + 0.2 * (1.0 - cap))
    entries.append((Risk.WAR, war, _named_drivers(
        [("social tension", hz("tension")), ("food scarcity", pressure["food"]),
         ("weak institutions", 1.0 - cap)])))

    # Pollution — direct environmental hazard.
    entries.append((Risk.POLLUTION, hz("pollution"),
                    _named_drivers([("pollution level", hz("pollution"))])))

    # Quake & fire — geophysical / infrastructure hazards, mostly exogenous.
    entries.append((Risk.QUAKE, hz("seismic"),
                    _named_drivers([("seismic stress", hz("seismic"))])))
    fire = _clamp(0.7 * hz("grid_overload") + 0.3 * hz("drought"))
    entries.append((Risk.FIRE, fire, _named_drivers(
        [("grid overload", hz("grid_overload")), ("drought", hz("drought"))])))

    # Corruption & fraud — weak institutions let both fester; fraud also tracks
    # an explicit research-integrity hazard.
    corruption = _clamp(0.7 * (1.0 - cap) + 0.3 * hz("inequality"))
    entries.append((Risk.CORRUPTION, corruption, _named_drivers(
        [("weak institutions", 1.0 - cap), ("inequality", hz("inequality"))])))
    fraud = _clamp(0.5 * hz("fraud") + 0.5 * (1.0 - cap))
    entries.append((Risk.FRAUD, fraud, _named_drivers(
        [("research fraud", hz("fraud")), ("weak oversight", 1.0 - cap)])))

    # Knowledge loss — the dark-age risk from KnowledgeOS.
    facts_total = max(1, knowledge["total"])
    at_risk = len(at_risk_knowledge(snapshot))
    kloss = _clamp(0.7 * (at_risk / facts_total) + 0.3 * knowledge["fragile_fraction"])
    entries.append((Risk.KNOWLEDGE_LOSS, kloss, _named_drivers(
        [("thinly-held facts", at_risk / facts_total),
         ("disputed/banned knowledge", knowledge["fragile_fraction"])])))

    # Unrest — scarcity + inflation + weak institutions.
    unrest = _clamp(0.4 * pressure["food"] + 0.3 * _clamp(abs(econ["inflation"]))
                    + 0.3 * (1.0 - cap))
    entries.append((Risk.UNREST, unrest, _named_drivers(
        [("food scarcity", pressure["food"]), ("inflation", abs(econ["inflation"])),
         ("weak institutions", 1.0 - cap)])))

    # Collapse — the meta-risk: how many of the above are simultaneously high.
    serious = [s for (_r, s, _d) in entries if s >= 0.5]
    collapse = _clamp(sum(serious) / len(entries) if entries else 0.0)
    collapse_drivers = tuple(r.value for (r, s, _d) in entries if s >= 0.5)
    entries.append((Risk.COLLAPSE, collapse, list(collapse_drivers)))

    register = [
        RiskEntry(risk=r, severity=_round(s), drivers=tuple(d))
        for (r, s, d) in entries if s >= 0.05
    ]
    register.sort(key=lambda e: e.severity, reverse=True)
    return register


def _named_drivers(pairs: Iterable[tuple[str, float]]) -> list[str]:
    """Keep only the drivers actually pushing a risk up (signal >= 0.2)."""
    return [name for name, signal in pairs if _clamp(signal) >= 0.2]


def _drivers_for_resources(pressure: dict, names: Iterable[str]) -> list[str]:
    return [f"{n} scarcity" for n in names if pressure.get(n, 0.0) >= 0.2]


# ── ResearchOS: the science pipeline ─────────────────────────────────────────
def research_throughput(snapshot: dict) -> dict:
    """How fast — and how soundly — the civilisation produces new knowledge.

    Reads the snapshot's "research" block: counts of hypotheses, running and
    completed experiments, replication outcomes, an integrity (fraud) signal and
    the current invention candidates. Returns throughput and a `soundness` score
    so a fast-but-fraudulent research machine is not mistaken for a healthy one.
    """
    research = _get(snapshot, "research", default={}) or {}
    hypotheses = int(research.get("hypotheses", 0))
    experiments = int(research.get("experiments", 0))
    completed = int(research.get("completed", 0))
    replicated = int(research.get("replicated", 0))
    fraud_signal = _clamp(research.get("fraud_risk", 0.0))
    candidates = int(research.get("invention_candidates", 0))

    # Completion / replication rates measure whether science *finishes*.
    completion_rate = _round(completed / experiments) if experiments else 0.0
    replication_rate = _round(replicated / completed) if completed else 0.0
    # Throughput: completed, replicated experiments per active hypothesis.
    throughput = _round(replicated / hypotheses) if hypotheses else 0.0
    # Soundness rewards replication, punishes fraud risk.
    soundness = _round(_clamp(replication_rate - fraud_signal))
    return {
        "hypotheses": hypotheses,
        "experiments": experiments,
        "completed": completed,
        "replicated": replicated,
        "invention_candidates": candidates,
        "completion_rate": completion_rate,
        "replication_rate": replication_rate,
        "throughput": throughput,
        "fraud_risk": _round(fraud_signal),
        "soundness": soundness,
    }


# ── civ_dashboard: the governable-civilisation view ──────────────────────────
@dataclass(frozen=True)
class Concern:
    """One actionable concern surfaced to the overseer."""

    area: str
    detail: str
    severity: float                       # 0..1


def civ_dashboard(snapshot: dict) -> dict:
    """Compose all six OS modules into one civilisation-health view.

    This is CivOS's headline deliverable — the thing that "makes the simulation
    governable". It folds resource pressure, institutional capacity, knowledge
    health, economic stability, the risk register and research soundness into a
    single `overall_health` (0..1) and surfaces the top-3 concerns an overseer
    should act on. Deterministic: same snapshot in, same dashboard out.
    """
    pressure = resource_pressure(snapshot)
    shortages = shortage_risks(snapshot)
    capacity = institutional_capacity(snapshot)
    tech_level = _clamp(_get(snapshot, "tech_level", default=0.0) or 0.0)
    gaps = missing_institutions(snapshot, tech_level)
    knowledge = knowledge_health(snapshot)
    econ = economic_state(snapshot)
    register = risk_register(snapshot)
    research = research_throughput(snapshot)

    # Component health scores (each 0..1, higher = healthier).
    resource_health = _round(1.0 - (sum(pressure.values()) / len(pressure)
                                    if pressure else 0.0))
    institution_health = capacity
    knowledge_score = knowledge["health"]
    economy_health = econ["stability"]
    # Risk pulls health down by its worst few live entries.
    top_risk = register[0].severity if register else 0.0
    mean_risk = (sum(e.severity for e in register) / len(register)) if register else 0.0
    risk_health = _round(1.0 - _clamp(0.6 * top_risk + 0.4 * mean_risk))
    research_health = research["soundness"]

    components = {
        "resources": resource_health,
        "institutions": institution_health,
        "knowledge": knowledge_score,
        "economy": economy_health,
        "risk": risk_health,
        "research": research_health,
    }
    overall_health = _round(sum(components.values()) / len(components))

    concerns = _top_concerns(shortages, gaps, knowledge, register, research)

    return {
        "overall_health": overall_health,
        "components": components,
        "resource_pressure": pressure,
        "shortages": shortages,
        "institutional_capacity": capacity,
        "missing_institutions": gaps,
        "knowledge_health": knowledge,
        "economic_state": econ,
        "risk_register": [
            {"risk": e.risk.value, "severity": e.severity, "drivers": list(e.drivers)}
            for e in register
        ],
        "research": research,
        "top_concerns": [
            {"area": c.area, "detail": c.detail, "severity": c.severity}
            for c in concerns
        ],
    }


def _top_concerns(shortages, gaps, knowledge, register, research) -> list[Concern]:
    """Rank the worst issues across every module; return the top 3."""
    candidates: list[Concern] = []

    # Live risks are the headline concerns.
    for entry in register:
        drivers = ", ".join(entry.drivers) if entry.drivers else "compounding pressure"
        candidates.append(Concern(
            area=f"risk:{entry.risk.value}",
            detail=f"{entry.risk.value} rising — {drivers}",
            severity=entry.severity,
        ))

    # Critical resource shortages.
    for s in shortages:
        if s["severity"] == "critical":
            candidates.append(Concern(
                area=f"resource:{s['resource']}",
                detail=f"{s['resource']} critically scarce",
                severity=s["pressure"],
            ))

    # Knowledge at risk of being lost.
    fragile = knowledge.get("fragile_fraction", 0.0)
    if fragile >= 0.2 or knowledge.get("health", 1.0) < 0.4:
        candidates.append(Concern(
            area="knowledge:durability",
            detail="knowledge thinly held — dark-age risk; write it down",
            severity=_round(_clamp(1.0 - knowledge.get("health", 0.0))),
        ))

    # Missing institutions for the current tech level.
    if gaps:
        candidates.append(Concern(
            area="institutions:gaps",
            detail="missing institutions: " + ", ".join(gaps),
            severity=_round(_clamp(0.2 + 0.1 * len(gaps))),
        ))

    # Unsound research (fast but unreplicated / fraudulent).
    if research["soundness"] < 0.4 and research["experiments"] > 0:
        candidates.append(Concern(
            area="research:integrity",
            detail="research not replicating — soundness low",
            severity=_round(_clamp(1.0 - research["soundness"])),
        ))

    # Deterministic ordering: severity, then area name to break ties.
    candidates.sort(key=lambda c: (-c.severity, c.area))
    return candidates[:3]
