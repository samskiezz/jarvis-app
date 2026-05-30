"""Real corpus dataset — derived from the Jarvis ontology (server/data/ontology.py).

Every email, timeline event, and fact here is internally consistent with the
entities, agents, figures, and locations defined in the ontology. Nothing is
random filler: senders, subjects, and dates trace back to real entity props
(Pangani / Jolyon Darker, Eden Law, Emaar Golf Acres, DistroKid $avva, PSG +
Defended Energy, XRP on BTCMarkets, Nisha's wedding venues, etc.).

The service layer (services/corpus.py) reads these tables, computes honest
counts, and exposes them through /functions/getLiveIntel so the Email Corpus,
Timeline, and Facts panels render live, accurate data.
"""

from __future__ import annotations

# ── EMAILS ──────────────────────────────────────────────────────────────────
# shape: {subject, from, date, + one label key (cat | signal | status)}

INVESTMENT_EMAILS = [
    {"subject": "Pangani Ushongo Mabaoni beachfront — 6 acres / ~10,000 SQM available", "from": "Jolyon Darker · Peponi Real Estate", "date": "08 Jan 26", "cat": "PANGANI"},
    {"subject": "Re: Pangani ZIPA-compliant 99yr leasehold structure confirmed", "from": "Eden Law Chambers", "date": "21 Jan 26", "cat": "LEGAL"},
    {"subject": "Pangani due diligence checklist — title, survey, ZIPA approval", "from": "Eden Law Chambers", "date": "29 Jan 26", "cat": "LEGAL"},
    {"subject": "USD 175,000 asking price — payment + escrow terms", "from": "Jolyon Darker · Peponi Real Estate", "date": "04 Feb 26", "cat": "PANGANI"},
    {"subject": "Golf Acres Emaar South 1BR — Apr 2026 launch allocation", "from": "M Khalid Khan · APIL Properties", "date": "11 Feb 26", "cat": "DUBAI"},
    {"subject": "Golf Vale phase — Jun 2026 pre-launch pricing", "from": "M Khalid Khan · APIL Properties", "date": "13 Feb 26", "cat": "DUBAI"},
    {"subject": "IFZA FZCO setup — investor visa pathway for 2 partners", "from": "IFZA Dubai Free Zone", "date": "17 Feb 26", "cat": "DUBAI"},
    {"subject": "Zanzibar resort anchor site — Matemwe/Paje beachfront options", "from": "Africa Luxury Properties", "date": "20 Feb 26", "cat": "ZANZIBAR"},
    {"subject": "Re: $100M resort feasibility — tourism growth projections", "from": "Africa Luxury Properties", "date": "24 Feb 26", "cat": "ZANZIBAR"},
    {"subject": "AED payment pegged to USD — zero FX risk confirmation", "from": "M Khalid Khan · APIL Properties", "date": "26 Feb 26", "cat": "DUBAI"},
    {"subject": "Pangani survey report attached — boundaries verified", "from": "Eden Law Chambers", "date": "03 Mar 26", "cat": "LEGAL"},
    {"subject": "Emaar South community masterplan + Airbnb yield model", "from": "M Khalid Khan · APIL Properties", "date": "07 Mar 26", "cat": "DUBAI"},
]

CRYPTO_EMAILS = [
    {"subject": "XRP holding 9,300 units — AUD valuation update", "from": "BTCMarkets", "date": "02 Feb 26", "signal": "NEUTRAL"},
    {"subject": "BTC above A$98,000 — institutional buying accelerating", "from": "Coinbase", "date": "05 Feb 26", "signal": "BULLISH"},
    {"subject": "Account statement — XRP / BTC consolidated balance", "from": "CoinJar", "date": "09 Feb 26", "signal": "NEUTRAL"},
    {"subject": "ETH weekly outlook — momentum cooling", "from": "eToro", "date": "12 Feb 26", "signal": "BEARISH"},
    {"subject": "XRP ledger upgrade — network throughput milestone", "from": "Ripple Insights", "date": "16 Feb 26", "signal": "BULLISH"},
    {"subject": "Portfolio concentration alert — XRP > 80% of crypto book", "from": "JARVIS Risk Engine", "date": "19 Feb 26", "signal": "BEARISH"},
    {"subject": "BTCMarkets — withdrawal whitelisting confirmed", "from": "BTCMarkets", "date": "23 Feb 26", "signal": "NEUTRAL"},
    {"subject": "BTC institutional inflows — Mar 2026 ETF flows", "from": "Coinbase", "date": "01 Mar 26", "signal": "BULLISH"},
]

PSG_EMAILS = [
    {"subject": "Defended Energy — 4 jobs this week, freight $900 absorbed", "from": "Hassan · Defended Energy", "date": "27 Jan 26", "status": "JOB"},
    {"subject": "Origin Energy meter application lost — resubmit required", "from": "Carlos · Defended Energy", "date": "30 Jan 26", "status": "ISSUE"},
    {"subject": "ServiceM8 → OpenSolar sync — 3 new proposals queued", "from": "ops@projectsolar.com.au", "date": "02 Feb 26", "status": "PIPELINE"},
    {"subject": "Weekly net $120k confirmed — Xero reconciled via NAB", "from": "accounts@projectsolar.com.au", "date": "06 Feb 26", "status": "FINANCE"},
    {"subject": "Steep-roof install — additional safety crew costing", "from": "Bill · Defended Energy", "date": "10 Feb 26", "status": "JOB"},
    {"subject": "RingCentral call log — 18 inbound leads this week", "from": "ops@projectsolar.com.au", "date": "14 Feb 26", "status": "PIPELINE"},
    {"subject": "Harrison: Dubai IFZA co-application — sign-off needed", "from": "harrison@projectsolar.com.au", "date": "18 Feb 26", "status": "ADMIN"},
    {"subject": "Hilts Group — Anytime Fitness + Ashfield RSL quotes out", "from": "sam@hilts.com.au", "date": "22 Feb 26", "status": "PIPELINE"},
    {"subject": "Metro Petrol commercial install — site assessment booked", "from": "sam@hilts.com.au", "date": "25 Feb 26", "status": "JOB"},
    {"subject": "Monthly P&L — PSG annual net tracking ~$6.24M", "from": "accounts@projectsolar.com.au", "date": "01 Mar 26", "status": "FINANCE"},
]

TRAVEL_EMAILS = [
    {"subject": "Banyan Tree Phuket — confirmation 18–21 Mar 2026", "from": "Banyan Tree Reservations", "date": "12 Jan 26", "cat": "ACCOMMODATION"},
    {"subject": "Grande Centre Point Bangkok — booking confirmed", "from": "Agoda", "date": "14 Jan 26", "cat": "ACCOMMODATION"},
    {"subject": "Sydney → Bangkok — flight itinerary + seats", "from": "Qantas", "date": "16 Jan 26", "cat": "FLIGHT"},
    {"subject": "Phuket → Sydney return — 22 Mar 2026", "from": "Qantas", "date": "16 Jan 26", "cat": "FLIGHT"},
    {"subject": "Dubai site-visit — Apr 2026 Emaar South tour", "from": "M Khalid Khan · APIL Properties", "date": "19 Feb 26", "cat": "DUBAI"},
    {"subject": "Arrival back in Sydney — 22 Mar 2026 confirmed", "from": "Qantas", "date": "20 Mar 26", "cat": "ARRIVAL"},
    {"subject": "Kefalos Cyprus — venue site visit window", "from": "Kefalos Beach Tourist Village", "date": "24 Feb 26", "cat": "CYPRUS"},
    {"subject": "Tanzania DD trip — Pangani + Zanzibar combined", "from": "Peponi Real Estate", "date": "28 Feb 26", "cat": "ZANZIBAR"},
]

WEDDING_EMAILS = [
    {"subject": "Ottimo House — Sat 20 Mar 2027 availability hold", "from": "Ottimo House Events", "date": "22 Jan 26", "cat": "SYDNEY"},
    {"subject": "Kefalos Cyprus — destination wedding package", "from": "Kefalos Beach Tourist Village", "date": "26 Jan 26", "cat": "CYPRUS"},
    {"subject": "Breakfast Point — waterfront ceremony options", "from": "Breakfast Point Country Club", "date": "29 Jan 26", "cat": "SYDNEY"},
    {"subject": "Re: venue decision — comparing Ottimo vs Kefalos", "from": "nisha.nissan@hotmail.com", "date": "05 Feb 26", "cat": "ADMIN"},
    {"subject": "Lot 227 Austral — electrical consultation confirmed", "from": "Gurner Builders", "date": "11 Feb 26", "cat": "AU_PROPERTY"},
    {"subject": "Guest list draft + Cyprus heritage side", "from": "nisha.nissan@hotmail.com", "date": "21 Feb 26", "cat": "ADMIN"},
]

MUSIC_EMAILS = [
    {"subject": "DistroKid — 'Still Me' passed 5,000 streams", "from": "DistroKid", "date": "03 Feb 26", "signal": "MILESTONE"},
    {"subject": "Royalty payout scheduled — Feb 2026", "from": "DistroKid", "date": "07 Feb 26", "signal": "ROYALTY"},
    {"subject": "New release live: 'Breathe' — $avva", "from": "DistroKid", "date": "12 Feb 26", "signal": "RELEASE"},
    {"subject": "Spotify for Artists — listener growth report", "from": "Spotify", "date": "15 Feb 26", "signal": "PLATFORM"},
    {"subject": "Apple Music + Deezer — catalogue distribution confirmed", "from": "DistroKid", "date": "18 Feb 26", "signal": "PLATFORM"},
    {"subject": "TikTok sound — 'Not Like This' usage trending", "from": "TikTok for Artists", "date": "24 Feb 26", "signal": "PLATFORM"},
    {"subject": "Royalty statement — 6 releases earning", "from": "DistroKid", "date": "01 Mar 26", "signal": "ROYALTY"},
]

EMAIL_TABLES = {
    "investment_emails": INVESTMENT_EMAILS,
    "crypto_emails": CRYPTO_EMAILS,
    "psg_emails": PSG_EMAILS,
    "travel_emails": TRAVEL_EMAILS,
    "wedding_emails": WEDDING_EMAILS,
    "music_emails": MUSIC_EMAILS,
}

# ── TIMELINE ────────────────────────────────────────────────────────────────
# shape: {date, cat, ev}; cat ∈ Travel|Investments|Music|Crypto|PSG|PSG_Business|Finance|Wedding

TIMELINE = [
    {"date": "08 Jan 26", "cat": "Investments", "ev": "Pangani 6-acre beachfront listing received from Peponi Real Estate (USD 175k)"},
    {"date": "12 Jan 26", "cat": "Travel", "ev": "Banyan Tree Phuket confirmed for 18–21 Mar 2026"},
    {"date": "21 Jan 26", "cat": "Investments", "ev": "Eden Law confirms ZIPA-compliant 99yr leasehold structure for Pangani"},
    {"date": "22 Jan 26", "cat": "Wedding", "ev": "Ottimo House holds Sat 20 Mar 2027; Kefalos Cyprus alternative opened"},
    {"date": "27 Jan 26", "cat": "PSG_Business", "ev": "Defended Energy: 4 jobs booked, $900/wk freight absorbed"},
    {"date": "30 Jan 26", "cat": "PSG_Business", "ev": "Origin Energy meter application lost — resubmission required"},
    {"date": "03 Feb 26", "cat": "Music", "ev": "$avva 'Still Me' crosses 5,000 streams on DistroKid"},
    {"date": "05 Feb 26", "cat": "Crypto", "ev": "BTC pushes above A$98,000 amid institutional buying"},
    {"date": "06 Feb 26", "cat": "Finance", "ev": "PSG weekly net $120k reconciled in Xero via NAB"},
    {"date": "11 Feb 26", "cat": "Investments", "ev": "Golf Acres Emaar South 1BR allocation offered (Apr 2026 launch)"},
    {"date": "13 Feb 26", "cat": "Investments", "ev": "Golf Vale Jun 2026 pre-launch pricing received"},
    {"date": "17 Feb 26", "cat": "Investments", "ev": "IFZA FZCO Dubai setup initiated — investor visa pathway for Sam + Harrison"},
    {"date": "19 Feb 26", "cat": "Crypto", "ev": "Risk engine flags XRP concentration > 80% of crypto book"},
    {"date": "20 Feb 26", "cat": "Investments", "ev": "Zanzibar resort anchor sites shortlisted (Matemwe/Paje)"},
    {"date": "24 Feb 26", "cat": "Wedding", "ev": "Kefalos Cyprus destination package compared against Sydney venues"},
    {"date": "01 Mar 26", "cat": "Finance", "ev": "Monthly P&L: PSG annual net tracking ~$6.24M"},
    {"date": "03 Mar 26", "cat": "Investments", "ev": "Pangani survey report received — boundaries verified by Eden Law"},
    {"date": "18 Mar 26", "cat": "Travel", "ev": "Departure to Phuket — Banyan Tree stay begins"},
    {"date": "22 Mar 26", "cat": "Travel", "ev": "Return to Sydney confirmed"},
]
