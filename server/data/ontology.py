"""Seed ontology — mirrors src/domain/ontology.js so the backend has the same view of the world.

Eventually this moves into the database and src/domain/* becomes pure cache.
"""

OBJECTS = [
    {"id": "sam", "label": "Sam Kazangas", "type": "person", "mark": "PII"},
    {"id": "harrison", "label": "Harrison Vaubell", "type": "person", "mark": "INTERNAL"},
    {"id": "nisha", "label": "Nisha Nissan", "type": "person", "mark": "PII"},
    {"id": "psg", "label": "Project Solar Group", "type": "org", "mark": "FINANCIAL"},
    {"id": "hilts", "label": "Hilts Group Australia", "type": "org", "mark": "FINANCIAL"},
    {"id": "ifza", "label": "IFZA FZCO Dubai", "type": "org", "mark": "FINANCIAL"},
    {"id": "defended", "label": "Defended Energy", "type": "client", "mark": "INTERNAL"},
    {"id": "pangani", "label": "Pangani TZ", "type": "invest", "mark": "FINANCIAL"},
    {"id": "zanzibar", "label": "Zanzibar Resort", "type": "invest", "mark": "FINANCIAL"},
    {"id": "dubai", "label": "Dubai / Emaar", "type": "invest", "mark": "FINANCIAL"},
    {"id": "crypto", "label": "XRP / BTC Portfolio", "type": "asset", "mark": "FINANCIAL"},
    {"id": "austral", "label": "Lot 227 Austral NSW", "type": "property", "mark": "PII"},
    {"id": "music", "label": "$avva Music", "type": "creative", "mark": "INTERNAL"},
    {"id": "target", "label": "$100M Target", "type": "target", "mark": "RESTRICTED"},
]

RISK_SIGNALS = [
    {"id": "r1", "title": "Defended Energy freight dispute", "severity": 72, "type": "OPERATIONAL", "country": "AU", "trend": "STABLE", "linked": "defended"},
    {"id": "r2", "title": "East Africa conflict — Congo spillover", "severity": 58, "type": "GEOPOLITICAL", "country": "TZ", "trend": "RISING", "linked": "pangani"},
    {"id": "r3", "title": "Tanzania land law complexity", "severity": 55, "type": "LEGAL", "country": "TZ", "trend": "STABLE", "linked": "pangani"},
    {"id": "r4", "title": "AU solar policy change risk", "severity": 68, "type": "REGULATORY", "country": "AU", "trend": "WATCH", "linked": "psg"},
    {"id": "r5", "title": "Origin Energy meter application loss", "severity": 45, "type": "OPERATIONAL", "country": "AU", "trend": "STABLE", "linked": "psg"},
    {"id": "r6", "title": "Red Sea disruption", "severity": 40, "type": "GEOPOLITICAL", "country": "AE", "trend": "RISING", "linked": "zanzibar"},
    {"id": "r7", "title": "XRP concentration risk", "severity": 32, "type": "FINANCIAL", "country": "AU", "trend": "STABLE", "linked": "crypto"},
    {"id": "r8", "title": "Wedding decision pending", "severity": 28, "type": "PERSONAL", "country": "AU", "trend": "WATCH", "linked": "nisha"},
]


def ontology_summary() -> str:
    lines = [
        "ENTITIES:",
        *[f"- {o['id']} ({o['type']}/{o['mark']}): {o['label']}" for o in OBJECTS],
        "",
        "RISK SIGNALS (sorted by severity):",
        *[
            f"- [{r['severity']}] {r['title']} ({r['type']}, {r['trend']}) → linked={r['linked']}"
            for r in sorted(RISK_SIGNALS, key=lambda x: -x["severity"])
        ],
    ]
    return "\n".join(lines)
