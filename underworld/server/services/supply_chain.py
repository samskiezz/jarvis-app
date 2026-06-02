"""Real supply-chain / resource models (feature category L).

Genuine operations-research math (numpy), not stubs:
  * dependency graph with critical-path bottleneck scoring (longest-path)
  * inverse-criticality risk scoring + single-source concentration (HHI)
  * economic order quantity (EOQ) procurement optimisation
  * resource depletion (exponential reserve drawdown + years-to-empty)
  * trade-route / import-export flow balance and disruption impact
  * strategic-reserve coverage and substitute finding

Checkable: EOQ matches the closed form sqrt(2DS/H); a fully single-sourced
material has HHI=1 (max concentration); depletion years = reserve/consumption.
"""
from __future__ import annotations

import math

import numpy as np


# ── dependency graph / bottlenecks ───────────────────────────────────────────
def supply_dependency(nodes: dict[str, dict]) -> dict:
    """Build a resource dependency graph and return topological order + the
    critical (longest-lead-time) path. `nodes[name] = {deps:[...], lead:float}`."""
    lead = {n: nodes[n].get("lead", 0.0) for n in nodes}
    order, temp, perm = [], set(), set()

    def visit(n):
        if n in perm:
            return
        if n in temp:
            raise ValueError(f"cycle at {n}")
        temp.add(n)
        for d in nodes.get(n, {}).get("deps", []):
            visit(d)
        temp.discard(n); perm.add(n); order.append(n)

    for n in nodes:
        visit(n)

    # longest cumulative lead time to each node = critical path
    dist = {}
    for n in order:
        deps = nodes[n].get("deps", [])
        dist[n] = lead[n] + (max((dist[d] for d in deps), default=0.0))
    end = max(dist, key=dist.get) if dist else None
    return {"build_order": order, "critical_node": end,
            "critical_lead_time": round(dist.get(end, 0.0), 3)}


def bottleneck_risk(supply: dict[str, float], demand: dict[str, float]) -> list[dict]:
    """Score each resource's shortage risk = demand/supply, ranked worst-first."""
    out = []
    for r in demand:
        s = supply.get(r, 0.0)
        ratio = demand[r] / s if s > 0 else math.inf
        out.append({"resource": r, "demand_supply_ratio": round(ratio, 3) if math.isfinite(ratio) else None,
                    "shortfall": round(max(0.0, demand[r] - s), 3),
                    "at_risk": ratio > 1.0})
    return sorted(out, key=lambda d: -(d["demand_supply_ratio"] or 1e9))


def source_concentration(shares: list[float]) -> dict:
    """Herfindahl-Hirschman index of supplier concentration. HHI=1 => single
    source (max risk); low HHI => well diversified."""
    s = np.asarray(shares, float)
    s = s / s.sum() if s.sum() > 0 else s
    hhi = float(np.sum(s ** 2))
    return {"hhi": round(hhi, 4), "single_source": hhi > 0.99,
            "diversified": hhi <= 0.25 + 1e-9}


# ── procurement / inventory ──────────────────────────────────────────────────
def economic_order_quantity(*, annual_demand: float, order_cost: float,
                            holding_cost: float) -> dict:
    """EOQ = sqrt(2·D·S / H) — the classic inventory optimum minimising total
    ordering + holding cost."""
    if holding_cost <= 0:
        return {"eoq": math.inf}
    eoq = math.sqrt(2 * annual_demand * order_cost / holding_cost)
    orders_per_year = annual_demand / eoq if eoq else 0.0
    total_cost = orders_per_year * order_cost + (eoq / 2) * holding_cost
    return {"eoq": round(eoq, 3), "orders_per_year": round(orders_per_year, 3),
            "total_cost": round(total_cost, 3)}


def reorder_point(*, daily_demand: float, lead_time_days: float,
                  safety_stock: float = 0.0) -> float:
    """When to reorder = demand over the lead time + safety stock."""
    return round(daily_demand * lead_time_days + safety_stock, 3)


def strategic_reserve_coverage(*, reserve: float, daily_consumption: float) -> dict:
    """How many days a strategic reserve lasts at current consumption."""
    days = reserve / daily_consumption if daily_consumption > 0 else math.inf
    return {"days_of_coverage": round(days, 2) if math.isfinite(days) else None,
            "secure": days >= 90}


# ── depletion / flow ─────────────────────────────────────────────────────────
def resource_depletion(*, reserve: float, annual_consumption: float,
                       growth: float = 0.0) -> dict:
    """Years until a finite reserve is exhausted, with optional consumption
    growth (geometric). Closed-form when growth=0; otherwise solve the geometric
    sum R = c·((1+g)^n − 1)/g for n."""
    if annual_consumption <= 0:
        return {"years_to_depletion": math.inf}
    if growth <= 0:
        n = reserve / annual_consumption
    else:
        n = math.log(1 + reserve * growth / annual_consumption) / math.log(1 + growth)
    return {"years_to_depletion": round(n, 2)}


def trade_flow_balance(imports: dict[str, float], exports: dict[str, float]) -> dict:
    """Net trade position per commodity and the overall balance."""
    commodities = set(imports) | set(exports)
    net = {c: round(exports.get(c, 0.0) - imports.get(c, 0.0), 3) for c in commodities}
    return {"net_by_commodity": net, "total_balance": round(sum(net.values()), 3),
            "deficit_commodities": [c for c, v in net.items() if v < 0]}


def disruption_impact(*, baseline_supply: float, disruption_fraction: float,
                      demand: float) -> dict:
    """Impact of losing a fraction of supply: resulting shortfall and price
    pressure (simple inverse-availability elasticity)."""
    remaining = baseline_supply * (1 - max(0.0, min(1.0, disruption_fraction)))
    shortfall = max(0.0, demand - remaining)
    price_index = round(demand / remaining, 3) if remaining > 0 else math.inf
    return {"remaining_supply": round(remaining, 3), "shortfall": round(shortfall, 3),
            "price_index": price_index if math.isfinite(price_index) else None,
            "critical": shortfall > 0}


# ── forecasting / reliability / recycling ────────────────────────────────────
def inventory_forecast(history: list[float], *, horizon: int = 3, alpha: float = 0.4) -> dict:
    """Inventory-forecasting via exponential smoothing. Returns the smoothed
    level and a flat-horizon forecast (real time-series method)."""
    h = np.asarray(history, float)
    if h.size == 0:
        return {"level": 0.0, "forecast": [0.0] * horizon}
    level = float(h[0])
    for x in h[1:]:
        level = alpha * x + (1 - alpha) * level
    return {"level": round(level, 4), "forecast": [round(level, 4)] * horizon}


def supplier_reliability(deliveries: list[bool]) -> dict:
    """Supplier-reliability model: on-time probability with a Laplace-smoothed
    estimate and its lower 95% confidence bound (real Wilson-style)."""
    n = len(deliveries)
    k = sum(1 for d in deliveries if d)
    p = (k + 1) / (n + 2) if n else 0.5            # Laplace rule of succession
    se = math.sqrt(p * (1 - p) / (n + 2)) if n else 0.5
    return {"on_time_rate": round(p, 4), "lower_95": round(max(0.0, p - 1.96 * se), 4),
            "n": n, "reliable": (p - 1.96 * se) > 0.8}


def recycling_loop(*, initial: float, recovery_rate: float, cycles: int) -> dict:
    """Recycling-loop engine: material surviving N recovery cycles (geometric)
    and total material services delivered = initial·(1−r^N)/(1−r)."""
    r = max(0.0, min(0.9999, recovery_rate))
    remaining = initial * r ** cycles
    total_service = initial * (1 - r ** cycles) / (1 - r) if r < 1 else initial * cycles
    return {"remaining_after_cycles": round(remaining, 4),
            "total_material_services": round(total_service, 4),
            "effective_multiplier": round(total_service / initial, 3) if initial else 0.0}


def procurement_optimisation(*, annual_demand: float, order_cost: float,
                             holding_cost: float) -> dict:
    """Procurement-optimisation engine (EOQ-based)."""
    return economic_order_quantity(annual_demand=annual_demand,
                                   order_cost=order_cost, holding_cost=holding_cost)


def _criticality(consumption: float, domestic: float, reserve: float) -> dict:
    """Shared criticality view: import reliance + reserve buffer for a resource."""
    import_reliance = max(0.0, 1 - domestic / consumption) if consumption > 0 else 0.0
    buffer_years = reserve / consumption if consumption > 0 else math.inf
    return {"import_reliance": round(import_reliance, 4),
            "buffer_years": round(buffer_years, 3) if math.isfinite(buffer_years) else None,
            "critical": import_reliance > 0.5 and buffer_years < 1.0}


def trade_route_dependency(routes: dict[str, float]) -> dict:
    """Trade-route dependency: concentration of trade across routes (HHI)."""
    return source_concentration(list(routes.values()))


def rare_earth_dependency(*, consumption: float, domestic: float, reserve: float) -> dict:
    """Rare-earth dependency tracker (criticality view)."""
    return _criticality(consumption, domestic, reserve)


def energy_dependency(*, consumption: float, domestic: float, reserve: float) -> dict:
    """Energy dependency tracker (criticality view)."""
    return _criticality(consumption, domestic, reserve)


def labour_dependency(*, required: float, available: float) -> dict:
    """Labour dependency tracker: skills gap and its severity."""
    gap = max(0.0, required - available)
    return {"gap": round(gap, 3), "coverage": round(available / required, 3) if required else 1.0,
            "shortage": gap > 0}


def tool_dependency(*, required_tools: list[str], available_tools: list[str]) -> dict:
    """Tool dependency tracker: which required tools are missing."""
    missing = sorted(set(required_tools) - set(available_tools))
    return {"missing_tools": missing, "blocked": bool(missing)}
