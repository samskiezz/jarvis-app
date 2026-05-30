"""Seed ontology — mirrors src/domain/ontology.js so the backend has the same view of the world.

Eventually this moves into the database and src/domain/* becomes pure cache.
"""

OBJECTS = [
    {"id": "sam", "label": "Sam Kazangas", "type": "person", "mark": "PII",
     "props": {"DOB": "27 Nov 1992", "Heritage": "Greek Cypriot Australian", "Home": "35 Springfield Rd Padstow NSW", "Email": "samkazangas@gmail.com", "Artist": "$avva", "GitHub": "samskiezz"}},
    {"id": "harrison", "label": "Harrison Vaubell", "type": "person", "mark": "INTERNAL",
     "props": {"Phone": "0415557997", "Email": "harrison@projectsolar.com.au", "Role": "PSG Co-founder 50/50", "WA_Messages": "6,161"}},
    {"id": "nisha", "label": "Nisha Nissan", "type": "person", "mark": "PII",
     "props": {"Email": "nisha.nissan@hotmail.com", "Employer": "Commonwealth Bank", "Wedding": "Sat 20 Mar 2027 (deciding)", "Venues": "Ottimo House · Kefalos CY · Breakfast Point"}},
    {"id": "psg", "label": "Project Solar Group", "type": "org", "mark": "FINANCIAL",
     "props": {"ABN": "29 685 341 744", "Ownership": "50/50 Sam + Harrison", "Net": "$120k/wk", "AnnualNet": "~$6.24M", "Tools": "ServiceM8 · OpenSolar · Xero · NAB · RingCentral"}},
    {"id": "hilts", "label": "Hilts Group Australia", "type": "org", "mark": "FINANCIAL",
     "props": {"ABN": "27 651 379 298", "Ownership": "100% Sam", "Clients": "Anytime Fitness · Ashfield RSL · Metro Petrol"}},
    {"id": "ifza", "label": "IFZA FZCO Dubai", "type": "org", "mark": "FINANCIAL",
     "props": {"Type": "UAE Free Zone Company", "Partners": "Sam + Harrison", "Timeline": "Mar 2026 registration", "Visa": "Investor visa pathway"}},
    {"id": "defended", "label": "Defended Energy", "type": "client", "mark": "INTERNAL",
     "props": {"Owner": "Abdul", "Volume": "2–5 jobs/week", "Issues": "$900/wk freight absorbed · steep roofs · Origin meter issue"}},
    {"id": "pangani", "label": "Pangani TZ", "type": "invest", "mark": "FINANCIAL",
     "props": {"Size": "6 acres / ~10,000 SQM", "Location": "Ushongo Mabaoni Beachfront, Pangani, Tanzania", "Ask": "$175k USD", "Agent": "Jolyon Darker · Peponi Real Estate", "Legal": "Eden Law Chambers", "Structure": "ZIPA 99yr leasehold"}},
    {"id": "zanzibar", "label": "Zanzibar Resort", "type": "invest", "mark": "FINANCIAL",
     "props": {"Strategy": "$100M resort anchor", "Location": "Matemwe / Paje beachfront", "Agent": "Africa Luxury Properties", "Timeline": "2033–2035"}},
    {"id": "dubai", "label": "Dubai / Emaar", "type": "invest", "mark": "FINANCIAL",
     "props": {"Plans": "Golf Acres Emaar South 1BR (Apr 2026) + Golf Vale (Jun 2026)", "Agent": "M Khalid Khan · APIL Properties", "Strategy": "Airbnb yield + investor visa", "Currency": "AED pegged USD — zero FX risk"}},
    {"id": "crypto", "label": "XRP / BTC Portfolio", "type": "asset", "mark": "FINANCIAL",
     "props": {"XRP": "9,300 units", "Exchanges": "BTCMarkets · Coinbase · eToro · CoinJar", "BTC": "Above A$98,000 — institutional buying Mar 2026"}},
    {"id": "austral", "label": "Lot 227 Austral NSW", "type": "property", "mark": "PII",
     "props": {"Address": "Lot 227 Swamphen St, Austral NSW", "Builder": "Gurner", "Owner": "Nisha Nissan", "Electrical": "Consultation confirmed Feb 2026"}},
    {"id": "music", "label": "$avva Music", "type": "creative", "mark": "INTERNAL",
     "props": {"Artist": "$avva", "Distributor": "DistroKid", "Releases": "Still Me (5k+ streams) · Breathe · Not Like This · The Same · Later · Working", "Royalties": "Active — payout Feb 2026"}},
    {"id": "target", "label": "$100M Target", "type": "target", "mark": "RESTRICTED",
     "props": {"Goal": "$100M net worth", "Timeline": "2033–2035", "Engine": "PSG $120k/wk → property → Zanzibar resort", "Status": "ON TRACK — PSG $6.24M/yr base"}},
]

LINKS = [
    {"a": "sam", "b": "psg", "label": "CONTROLS 50%", "strength": 3},
    {"a": "sam", "b": "hilts", "label": "OWNS 100%", "strength": 2},
    {"a": "sam", "b": "harrison", "label": "CO-FOUNDER", "strength": 3},
    {"a": "sam", "b": "nisha", "label": "FIANCÉE", "strength": 3},
    {"a": "sam", "b": "pangani", "label": "DD ACTIVE", "strength": 2},
    {"a": "sam", "b": "zanzibar", "label": "STRATEGY", "strength": 2},
    {"a": "sam", "b": "dubai", "label": "ENQUIRY LIVE", "strength": 2},
    {"a": "sam", "b": "crypto", "label": "HOLDS", "strength": 2},
    {"a": "sam", "b": "music", "label": "ARTIST", "strength": 1},
    {"a": "sam", "b": "target", "label": "TARGETS", "strength": 3},
    {"a": "harrison", "b": "psg", "label": "OWNS 50%", "strength": 3},
    {"a": "harrison", "b": "dubai", "label": "CO-INVESTOR", "strength": 2},
    {"a": "harrison", "b": "ifza", "label": "CO-APPLICANT", "strength": 2},
    {"a": "psg", "b": "defended", "label": "KEY RETAILER", "strength": 2},
    {"a": "psg", "b": "target", "label": "CASH ENGINE", "strength": 3},
    {"a": "dubai", "b": "ifza", "label": "VIA IFZA FZCO", "strength": 2},
    {"a": "pangani", "b": "zanzibar", "label": "ADJACENT", "strength": 2},
    {"a": "zanzibar", "b": "target", "label": "ANCHOR", "strength": 3},
    {"a": "nisha", "b": "austral", "label": "OWNER/BUILD", "strength": 2},
    {"a": "crypto", "b": "target", "label": "FEEDS", "strength": 1},
    {"a": "hilts", "b": "target", "label": "FEEDS", "strength": 1},
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
