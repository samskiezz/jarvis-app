"""Local analyst engine.

When no Kimi API key is configured the analyst still answers — for real — by
retrieving over the ontology, risk signals, corpus, and live market data rather
than returning a static diagnostic. Keyword routing maps the question to the
relevant entities/figures and composes a terse, factual reply in the JARVIS
house style (plain text, "·" separators).
"""

from __future__ import annotations

from typing import Any

from ..data import corpus as corpus_data
from ..data.ontology import LINKS, OBJECTS, RISK_SIGNALS

_BY_ID = {o["id"]: o for o in OBJECTS}

# question keyword → entity id(s)
_TOPICS: dict[str, list[str]] = {
    "psg": ["psg"],
    "project solar": ["psg"],
    "pangani": ["pangani"],
    "tanzania": ["pangani"],
    "zanzibar": ["zanzibar"],
    "dubai": ["dubai", "ifza"],
    "emaar": ["dubai"],
    "ifza": ["ifza"],
    "crypto": ["crypto"],
    "xrp": ["crypto"],
    "btc": ["crypto"],
    "bitcoin": ["crypto"],
    "harrison": ["harrison"],
    "nisha": ["nisha"],
    "wedding": ["nisha"],
    "music": ["music"],
    "$avva": ["music"],
    "avva": ["music"],
    "hilts": ["hilts"],
    "austral": ["austral"],
    "defended": ["defended"],
    "target": ["target"],
    "100m": ["target"],
    "wealth": ["target"],
    "sam": ["sam"],
}


def _links_for(obj_id: str) -> list[str]:
    out = []
    for l in LINKS:
        if l["a"] == obj_id and l["b"] in _BY_ID:
            out.append(f"{l['label']} → {_BY_ID[l['b']]['label']}")
        elif l["b"] == obj_id and l["a"] in _BY_ID:
            out.append(f"{_BY_ID[l['a']]['label']} · {l['label']}")
    return out


def _entity_block(obj_id: str) -> str:
    o = _BY_ID.get(obj_id)
    if not o:
        return ""
    lines = [f"{o['label']} · {o['type'].upper()} · {o['mark']}"]
    for k, v in (o.get("props") or {}).items():
        lines.append(f"· {k}: {v}")
    links = _links_for(obj_id)
    if links:
        lines.append("· LINKS: " + " | ".join(links[:6]))
    risks = [r for r in RISK_SIGNALS if r["linked"] == obj_id]
    for r in sorted(risks, key=lambda x: -x["severity"]):
        lines.append(f"· RISK [{r['severity']}] {r['title']} ({r['trend']})")
    return "\n".join(lines)


def _risk_summary() -> str:
    rows = sorted(RISK_SIGNALS, key=lambda x: -x["severity"])
    out = ["RISK SIGNALS (by severity):"]
    for r in rows:
        tgt = _BY_ID.get(r["linked"], {}).get("label", r["linked"])
        out.append(f"· [{r['severity']}] {r['title']} — {r['type']}/{r['trend']} → {tgt}")
    return "\n".join(out)


def _markets_summary(live: dict[str, Any] | None) -> str:
    markets = (live or {}).get("markets") or []
    if not markets:
        return "No live market feed available right now."
    out = ["LIVE MARKETS:"]
    for m in markets:
        out.append(f"· {m.get('display')}: {m.get('price')} ({m.get('change_pct'):+}%)")
    # XRP holding valuation if XRP/AUD present
    xrp = next((m for m in markets if "XRP" in (m.get("display") or "")), None)
    if xrp:
        try:
            px = float(str(xrp["price"]).replace(",", ""))
            out.append(f"· XRP holding 9,300 units ≈ ${px * 9300:,.0f} AUD")
        except (ValueError, KeyError):
            pass
    return "\n".join(out)


def _corpus_summary() -> str:
    totals = {k: len(v) for k, v in corpus_data.EMAIL_TABLES.items()}
    total = sum(totals.values())
    parts = " · ".join(f"{k.replace('_emails','')}:{v}" for k, v in totals.items())
    return f"CORPUS: {total} emails · {len(corpus_data.TIMELINE)} timeline events\n· {parts}"


def answer(message: str, live: dict[str, Any] | None = None) -> str:
    q = (message or "").lower().strip()
    if not q:
        return "Ask about PSG, Pangani, Zanzibar, Dubai, crypto, the $100M target, risks, or markets."

    # intent: risks
    if any(w in q for w in ("risk", "threat", "danger", "exposure")):
        return _risk_summary()

    # intent: markets / price
    if any(w in q for w in ("market", "price", "quote", "btc", "xrp", "eth", "portfolio value")):
        # if a specific entity also matched, still lead with markets
        return _markets_summary(live)

    # intent: corpus / emails / timeline
    if any(w in q for w in ("email", "corpus", "timeline", "inbox", "message")):
        return _corpus_summary()

    # intent: entity lookup
    matched: list[str] = []
    for kw, ids in _TOPICS.items():
        if kw in q:
            for i in ids:
                if i not in matched:
                    matched.append(i)
    if matched:
        return "\n\n".join(_entity_block(i) for i in matched[:3])

    # fallback: overview
    return (
        "JARVIS overview:\n"
        f"· {len(OBJECTS)} entities · {len(LINKS)} relations · {len(RISK_SIGNALS)} risk signals\n"
        f"· Engine: PSG $120k/wk net (~$6.24M/yr) → property → Zanzibar $100M anchor (2033–2035)\n\n"
        + _corpus_summary()
        + "\n\nAsk about a specific entity (PSG, Pangani, Dubai, crypto, wedding) or 'risks' / 'markets'."
    )
