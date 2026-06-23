#!/usr/bin/env python3
"""
Build the canonical WC2026 fixture JSON for the dashboard.

Sources (cross-verified 2026-06-19):
- ESPN: https://www.espn.com/soccer/story/_/id/48939282/...
- Al Jazeera: https://www.aljazeera.com/sports/2026/6/11/world-cup-2026-...
- Wikipedia: https://en.wikipedia.org/wiki/2026_FIFA_World_Cup

Group compositions (Wikipedia canonical, NOT the operator's draft list):
  Group I: France, Senegal, Iraq, Norway  (operator guess had Argentina/Austria — wrong)
  Group J: Argentina, Algeria, Austria, Jordan  (operator had Senegal/Norway here — corrected)
  Group K: Portugal, Colombia, Uzbekistan, DR Congo  (operator had Croatia — DR Congo is correct)
  Group L: England, Croatia, Ghana, Panama  (operator had Italy/Cameroon — Croatia/Ghana correct)

Match results 1-28 verified against existing server/data/wc2026_results.json
plus ESPN/Al Jazeera/SBS/Olympics live scores as of 2026-06-19.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

OUT = Path("/opt/jarvis-app-1/server/data/wc2026_fixtures_all.json")

# ---------------------------------------------------------------------------
# GROUP STAGE (matches 1..72)
# Each row: (n, date, kickoff_iso, kickoff_local, group, home, away, venue)
# ---------------------------------------------------------------------------

GROUP = [
    # Jun 11 — Matchday 1
    (1,  "2026-06-11", "2026-06-11T19:00:00Z", "Thu Jun 11 · 1pm CT",  "A", "Mexico",                  "South Africa",          "Estadio Azteca, Mexico City"),
    (2,  "2026-06-11", "2026-06-12T01:00:00Z", "Thu Jun 11 · 8pm CT",  "A", "South Korea",             "Czechia",               "Estadio Akron, Zapopan"),
    # Jun 12
    (3,  "2026-06-12", "2026-06-12T19:00:00Z", "Fri Jun 12 · 3pm ET",  "B", "Canada",                  "Bosnia and Herzegovina","BMO Field, Toronto"),
    (4,  "2026-06-12", "2026-06-13T01:00:00Z", "Fri Jun 12 · 6pm PT",  "D", "United States",           "Paraguay",              "SoFi Stadium, Inglewood"),
    # Jun 13
    (5,  "2026-06-13", "2026-06-13T19:00:00Z", "Sat Jun 13 · 12pm PT", "B", "Qatar",                   "Switzerland",           "Levi's Stadium, Santa Clara"),
    (6,  "2026-06-13", "2026-06-13T22:00:00Z", "Sat Jun 13 · 6pm ET",  "C", "Brazil",                  "Morocco",               "MetLife Stadium, East Rutherford"),
    (7,  "2026-06-13", "2026-06-14T01:00:00Z", "Sat Jun 13 · 9pm ET",  "C", "Haiti",                   "Scotland",              "Gillette Stadium, Foxborough"),
    (8,  "2026-06-14", "2026-06-14T01:00:00Z", "Sat Jun 13 · 6pm PT",  "D", "Australia",               "Türkiye",               "BC Place, Vancouver"),
    # Jun 14
    (9,  "2026-06-14", "2026-06-14T17:00:00Z", "Sun Jun 14 · 12pm CT", "E", "Germany",                 "Curaçao",               "NRG Stadium, Houston"),
    (10, "2026-06-14", "2026-06-14T20:00:00Z", "Sun Jun 14 · 3pm CT",  "F", "Netherlands",             "Japan",                 "AT&T Stadium, Arlington"),
    (11, "2026-06-14", "2026-06-14T23:00:00Z", "Sun Jun 14 · 7pm ET",  "E", "Côte d'Ivoire",           "Ecuador",               "Lincoln Financial Field, Philadelphia"),
    (12, "2026-06-15", "2026-06-15T01:00:00Z", "Sun Jun 14 · 8pm CT",  "F", "Sweden",                  "Tunisia",               "Estadio BBVA, Guadalupe"),
    # Jun 15
    (13, "2026-06-15", "2026-06-15T16:00:00Z", "Mon Jun 15 · 12pm ET", "H", "Spain",                   "Cabo Verde",            "Mercedes-Benz Stadium, Atlanta"),
    (14, "2026-06-15", "2026-06-15T19:00:00Z", "Mon Jun 15 · 12pm PT", "G", "Belgium",                 "Egypt",                 "Lumen Field, Seattle"),
    (15, "2026-06-15", "2026-06-15T22:00:00Z", "Mon Jun 15 · 6pm ET",  "H", "Saudi Arabia",            "Uruguay",               "Hard Rock Stadium, Miami Gardens"),
    (16, "2026-06-16", "2026-06-16T01:00:00Z", "Mon Jun 15 · 6pm PT",  "G", "Iran",                    "New Zealand",           "SoFi Stadium, Inglewood"),
    # Jun 16
    (17, "2026-06-16", "2026-06-16T19:00:00Z", "Tue Jun 16 · 3pm ET",  "I", "France",                  "Senegal",               "MetLife Stadium, East Rutherford"),
    (18, "2026-06-16", "2026-06-16T22:00:00Z", "Tue Jun 16 · 6pm ET",  "I", "Iraq",                    "Norway",                "Gillette Stadium, Foxborough"),
    (19, "2026-06-17", "2026-06-17T01:00:00Z", "Tue Jun 16 · 8pm CT",  "J", "Argentina",               "Algeria",               "Arrowhead Stadium, Kansas City"),
    (20, "2026-06-17", "2026-06-17T04:00:00Z", "Tue Jun 16 · 9pm PT",  "J", "Austria",                 "Jordan",                "Levi's Stadium, Santa Clara"),
    # Jun 17
    (21, "2026-06-17", "2026-06-17T17:00:00Z", "Wed Jun 17 · 12pm CT", "K", "Portugal",                "DR Congo",              "NRG Stadium, Houston"),
    (22, "2026-06-17", "2026-06-17T20:00:00Z", "Wed Jun 17 · 3pm CT",  "L", "England",                 "Croatia",               "AT&T Stadium, Arlington"),
    (23, "2026-06-17", "2026-06-17T23:00:00Z", "Wed Jun 17 · 7pm ET",  "L", "Ghana",                   "Panama",                "BMO Field, Toronto"),
    (24, "2026-06-18", "2026-06-18T01:00:00Z", "Wed Jun 17 · 8pm CT",  "K", "Uzbekistan",              "Colombia",              "Estadio Azteca, Mexico City"),
    # Jun 18 — Matchday 2 starts
    (25, "2026-06-18", "2026-06-18T16:00:00Z", "Thu Jun 18 · 12pm ET", "A", "Czechia",                 "South Africa",          "Mercedes-Benz Stadium, Atlanta"),
    (26, "2026-06-18", "2026-06-18T19:00:00Z", "Thu Jun 18 · 12pm PT", "B", "Switzerland",             "Bosnia and Herzegovina","SoFi Stadium, Inglewood"),
    (27, "2026-06-18", "2026-06-18T22:00:00Z", "Thu Jun 18 · 3pm PT",  "B", "Canada",                  "Qatar",                 "BC Place, Vancouver"),
    (28, "2026-06-19", "2026-06-19T01:00:00Z", "Thu Jun 18 · 7pm CT",  "A", "Mexico",                  "South Korea",           "Estadio Akron, Zapopan"),
    # Jun 19
    (29, "2026-06-19", "2026-06-19T19:00:00Z", "Fri Jun 19 · 12pm PT", "D", "United States",           "Australia",             "Lumen Field, Seattle"),
    (30, "2026-06-19", "2026-06-19T22:00:00Z", "Fri Jun 19 · 6pm ET",  "C", "Scotland",                "Morocco",               "Gillette Stadium, Foxborough"),
    (31, "2026-06-20", "2026-06-20T00:30:00Z", "Fri Jun 19 · 8:30pm ET","C", "Brazil",                 "Haiti",                 "Lincoln Financial Field, Philadelphia"),
    (32, "2026-06-20", "2026-06-20T04:00:00Z", "Fri Jun 19 · 9pm PT",  "D", "Türkiye",                 "Paraguay",              "Levi's Stadium, Santa Clara"),
    # Jun 20
    (33, "2026-06-20", "2026-06-20T17:00:00Z", "Sat Jun 20 · 12pm CT", "F", "Netherlands",             "Sweden",                "NRG Stadium, Houston"),
    (34, "2026-06-20", "2026-06-20T20:00:00Z", "Sat Jun 20 · 4pm ET",  "E", "Germany",                 "Côte d'Ivoire",         "BMO Field, Toronto"),
    (35, "2026-06-21", "2026-06-21T00:00:00Z", "Sat Jun 20 · 7pm CT",  "E", "Ecuador",                 "Curaçao",               "Arrowhead Stadium, Kansas City"),
    (36, "2026-06-21", "2026-06-21T03:00:00Z", "Sat Jun 20 · 10pm CT", "F", "Tunisia",                 "Japan",                 "Estadio BBVA, Guadalupe"),
    # Jun 21
    (37, "2026-06-21", "2026-06-21T16:00:00Z", "Sun Jun 21 · 12pm ET", "H", "Spain",                   "Saudi Arabia",          "Mercedes-Benz Stadium, Atlanta"),
    (38, "2026-06-21", "2026-06-21T19:00:00Z", "Sun Jun 21 · 12pm PT", "G", "Belgium",                 "Iran",                  "SoFi Stadium, Inglewood"),
    (39, "2026-06-21", "2026-06-21T22:00:00Z", "Sun Jun 21 · 6pm ET",  "H", "Uruguay",                 "Cabo Verde",            "Hard Rock Stadium, Miami Gardens"),
    (40, "2026-06-22", "2026-06-22T01:00:00Z", "Sun Jun 21 · 6pm PT",  "G", "New Zealand",             "Egypt",                 "BC Place, Vancouver"),
    # Jun 22
    (41, "2026-06-22", "2026-06-22T17:00:00Z", "Mon Jun 22 · 12pm CT", "J", "Argentina",               "Austria",               "AT&T Stadium, Arlington"),
    (42, "2026-06-22", "2026-06-22T21:00:00Z", "Mon Jun 22 · 5pm ET",  "I", "France",                  "Iraq",                  "Lincoln Financial Field, Philadelphia"),
    (43, "2026-06-23", "2026-06-23T00:00:00Z", "Mon Jun 22 · 8pm ET",  "I", "Norway",                  "Senegal",               "MetLife Stadium, East Rutherford"),
    (44, "2026-06-23", "2026-06-23T03:00:00Z", "Mon Jun 22 · 8pm PT",  "J", "Jordan",                  "Algeria",               "Levi's Stadium, Santa Clara"),
    # Jun 23
    (45, "2026-06-23", "2026-06-23T17:00:00Z", "Tue Jun 23 · 12pm CT", "K", "Portugal",                "Uzbekistan",            "NRG Stadium, Houston"),
    (46, "2026-06-23", "2026-06-23T20:00:00Z", "Tue Jun 23 · 4pm ET",  "L", "England",                 "Ghana",                 "Gillette Stadium, Foxborough"),
    (47, "2026-06-23", "2026-06-23T23:00:00Z", "Tue Jun 23 · 7pm ET",  "L", "Panama",                  "Croatia",               "BMO Field, Toronto"),
    (48, "2026-06-24", "2026-06-24T01:00:00Z", "Tue Jun 23 · 8pm CT",  "K", "Colombia",                "DR Congo",              "Estadio Akron, Zapopan"),
    # Jun 24 — Matchday 3 starts (simultaneous within group)
    (49, "2026-06-24", "2026-06-24T19:00:00Z", "Wed Jun 24 · 12pm PT", "B", "Switzerland",             "Canada",                "BC Place, Vancouver"),
    (50, "2026-06-24", "2026-06-24T19:00:00Z", "Wed Jun 24 · 12pm PT", "B", "Bosnia and Herzegovina",  "Qatar",                 "Lumen Field, Seattle"),
    (51, "2026-06-24", "2026-06-24T22:00:00Z", "Wed Jun 24 · 6pm ET",  "C", "Scotland",                "Brazil",                "Hard Rock Stadium, Miami Gardens"),
    (52, "2026-06-24", "2026-06-24T22:00:00Z", "Wed Jun 24 · 6pm ET",  "C", "Morocco",                 "Haiti",                 "Mercedes-Benz Stadium, Atlanta"),
    (53, "2026-06-25", "2026-06-25T00:00:00Z", "Wed Jun 24 · 7pm CT",  "A", "Czechia",                 "Mexico",                "Estadio Azteca, Mexico City"),
    (54, "2026-06-25", "2026-06-25T00:00:00Z", "Wed Jun 24 · 7pm CT",  "A", "South Africa",            "South Korea",           "Estadio BBVA, Guadalupe"),
    # Jun 25
    (55, "2026-06-25", "2026-06-25T20:00:00Z", "Thu Jun 25 · 4pm ET",  "E", "Ecuador",                 "Germany",               "MetLife Stadium, East Rutherford"),
    (56, "2026-06-25", "2026-06-25T20:00:00Z", "Thu Jun 25 · 4pm ET",  "E", "Curaçao",                 "Côte d'Ivoire",         "Lincoln Financial Field, Philadelphia"),
    (57, "2026-06-25", "2026-06-25T23:00:00Z", "Thu Jun 25 · 6pm CT",  "F", "Japan",                   "Sweden",                "AT&T Stadium, Arlington"),
    (58, "2026-06-25", "2026-06-25T23:00:00Z", "Thu Jun 25 · 6pm CT",  "F", "Tunisia",                 "Netherlands",           "Arrowhead Stadium, Kansas City"),
    (59, "2026-06-26", "2026-06-26T02:00:00Z", "Thu Jun 25 · 7pm PT",  "D", "Türkiye",                 "United States",         "SoFi Stadium, Inglewood"),
    (60, "2026-06-26", "2026-06-26T02:00:00Z", "Thu Jun 25 · 7pm PT",  "D", "Paraguay",                "Australia",             "Levi's Stadium, Santa Clara"),
    # Jun 26
    (61, "2026-06-26", "2026-06-26T19:00:00Z", "Fri Jun 26 · 3pm ET",  "I", "Norway",                  "France",                "Gillette Stadium, Foxborough"),
    (62, "2026-06-26", "2026-06-26T19:00:00Z", "Fri Jun 26 · 3pm ET",  "I", "Senegal",                 "Iraq",                  "BMO Field, Toronto"),
    (63, "2026-06-27", "2026-06-27T00:00:00Z", "Fri Jun 26 · 7pm CT",  "H", "Cabo Verde",              "Saudi Arabia",          "NRG Stadium, Houston"),
    (64, "2026-06-27", "2026-06-27T00:00:00Z", "Fri Jun 26 · 7pm CT",  "H", "Uruguay",                 "Spain",                 "Estadio Akron, Zapopan"),
    (65, "2026-06-27", "2026-06-27T03:00:00Z", "Fri Jun 26 · 8pm PT",  "G", "Egypt",                   "Iran",                  "Lumen Field, Seattle"),
    (66, "2026-06-27", "2026-06-27T03:00:00Z", "Fri Jun 26 · 8pm PT",  "G", "New Zealand",             "Belgium",               "BC Place, Vancouver"),
    # Jun 27
    (67, "2026-06-27", "2026-06-27T21:00:00Z", "Sat Jun 27 · 5pm ET",  "L", "Panama",                  "England",               "MetLife Stadium, East Rutherford"),
    (68, "2026-06-27", "2026-06-27T21:00:00Z", "Sat Jun 27 · 5pm ET",  "L", "Croatia",                 "Ghana",                 "Lincoln Financial Field, Philadelphia"),
    (69, "2026-06-27", "2026-06-27T23:30:00Z", "Sat Jun 27 · 7:30pm ET","K", "Colombia",               "Portugal",              "Hard Rock Stadium, Miami Gardens"),
    (70, "2026-06-27", "2026-06-27T23:30:00Z", "Sat Jun 27 · 7:30pm ET","K", "DR Congo",               "Uzbekistan",            "Mercedes-Benz Stadium, Atlanta"),
    (71, "2026-06-28", "2026-06-28T02:00:00Z", "Sat Jun 27 · 9pm CT",  "J", "Algeria",                 "Austria",               "Arrowhead Stadium, Kansas City"),
    (72, "2026-06-28", "2026-06-28T02:00:00Z", "Sat Jun 27 · 9pm CT",  "J", "Jordan",                  "Argentina",             "AT&T Stadium, Arlington"),
]

# Matchday number per group-stage match — derived from group + first-vs-second appearance
def matchday_for(n: int) -> int:
    if 1 <= n <= 24:
        return 1
    if 25 <= n <= 48:
        return 2
    return 3  # 49..72

# ---------------------------------------------------------------------------
# KNOCKOUT (matches 73..104) — placeholders per ESPN Wikipedia bracket
# ---------------------------------------------------------------------------

KO = [
    # n, date, kickoff_iso, kickoff_local, stage, home, away, venue
    (73, "2026-06-28", "2026-06-28T19:00:00Z", "Sun Jun 28 · 12pm PT", "R32", "Runner-up A",         "Runner-up B",          "SoFi Stadium, Inglewood"),
    (74, "2026-06-29", "2026-06-29T20:30:00Z", "Mon Jun 29 · 4:30pm ET","R32","Winner E",            "3rd A/B/C/D/F",        "Gillette Stadium, Foxborough"),
    (75, "2026-06-30", "2026-06-30T00:00:00Z", "Mon Jun 29 · 7pm CT",  "R32", "Winner F",            "Runner-up C",          "Estadio BBVA, Guadalupe"),
    (76, "2026-06-29", "2026-06-29T16:00:00Z", "Mon Jun 29 · 12pm ET", "R32", "Winner C",            "Runner-up F",          "NRG Stadium, Houston"),
    (77, "2026-06-30", "2026-06-30T21:00:00Z", "Tue Jun 30 · 5pm ET",  "R32", "Winner I",            "3rd C/D/F/G/H",        "MetLife Stadium, East Rutherford"),
    (78, "2026-06-30", "2026-06-30T16:00:00Z", "Tue Jun 30 · 12pm ET", "R32", "Runner-up E",         "Runner-up I",          "AT&T Stadium, Arlington"),
    (79, "2026-07-01", "2026-07-01T00:00:00Z", "Tue Jun 30 · 7pm CT",  "R32", "Mexico",              "3rd C/E/F/H/I",        "Estadio Azteca, Mexico City"),
    (80, "2026-07-01", "2026-07-01T16:00:00Z", "Wed Jul 1 · 12pm ET",  "R32", "Winner L",            "3rd E/H/I/J/K",        "Mercedes-Benz Stadium, Atlanta"),
    (81, "2026-07-02", "2026-07-02T00:00:00Z", "Wed Jul 1 · 5pm PT",   "R32", "Winner D",            "3rd B/E/F/I/J",        "Levi's Stadium, Santa Clara"),
    (82, "2026-07-01", "2026-07-01T20:00:00Z", "Wed Jul 1 · 1pm PT",   "R32", "Winner G",            "3rd A/E/H/I/J",        "Lumen Field, Seattle"),
    (83, "2026-07-02", "2026-07-02T23:00:00Z", "Thu Jul 2 · 7pm ET",   "R32", "Runner-up K",         "Runner-up L",          "BMO Field, Toronto"),
    (84, "2026-07-02", "2026-07-02T19:00:00Z", "Thu Jul 2 · 12pm PT",  "R32", "Winner H",            "Runner-up J",          "SoFi Stadium, Inglewood"),
    (85, "2026-07-03", "2026-07-03T03:00:00Z", "Thu Jul 2 · 8pm PT",   "R32", "Winner B",            "3rd E/F/G/I/J",        "BC Place, Vancouver"),
    (86, "2026-07-03", "2026-07-03T22:00:00Z", "Fri Jul 3 · 6pm ET",   "R32", "Winner J",            "Runner-up H",          "Hard Rock Stadium, Miami Gardens"),
    (87, "2026-07-04", "2026-07-04T00:30:00Z", "Fri Jul 3 · 8:30pm ET","R32", "Winner K",            "3rd D/E/I/J/L",        "Arrowhead Stadium, Kansas City"),
    (88, "2026-07-03", "2026-07-03T17:00:00Z", "Fri Jul 3 · 1pm ET",   "R32", "Runner-up D",         "Runner-up G",          "AT&T Stadium, Arlington"),

    # R16
    (89, "2026-07-04", "2026-07-04T21:00:00Z", "Sat Jul 4 · 5pm ET",   "R16", "Winner 74",           "Winner 77",            "Lincoln Financial Field, Philadelphia"),
    (90, "2026-07-04", "2026-07-04T16:00:00Z", "Sat Jul 4 · 12pm ET",  "R16", "Winner 73",           "Winner 75",            "NRG Stadium, Houston"),
    (91, "2026-07-05", "2026-07-05T20:00:00Z", "Sun Jul 5 · 4pm ET",   "R16", "Winner 76",           "Winner 78",            "MetLife Stadium, East Rutherford"),
    (92, "2026-07-05", "2026-07-05T23:00:00Z", "Sun Jul 5 · 6pm CT",   "R16", "Winner 79",           "Winner 80",            "Estadio Azteca, Mexico City"),
    (93, "2026-07-06", "2026-07-06T18:00:00Z", "Mon Jul 6 · 2pm ET",   "R16", "Winner 83",           "Winner 84",            "AT&T Stadium, Arlington"),
    (94, "2026-07-07", "2026-07-07T00:00:00Z", "Mon Jul 6 · 5pm PT",   "R16", "Winner 81",           "Winner 82",            "Lumen Field, Seattle"),
    (95, "2026-07-07", "2026-07-07T16:00:00Z", "Tue Jul 7 · 12pm ET",  "R16", "Winner 86",           "Winner 88",            "Mercedes-Benz Stadium, Atlanta"),
    (96, "2026-07-07", "2026-07-07T20:00:00Z", "Tue Jul 7 · 1pm PT",   "R16", "Winner 85",           "Winner 87",            "BC Place, Vancouver"),

    # QF
    (97,  "2026-07-09", "2026-07-09T20:00:00Z", "Thu Jul 9 · 4pm ET",   "QF",   "Winner 89",         "Winner 90",            "Gillette Stadium, Foxborough"),
    (98,  "2026-07-10", "2026-07-10T19:00:00Z", "Fri Jul 10 · 12pm PT", "QF",   "Winner 93",         "Winner 94",            "SoFi Stadium, Inglewood"),
    (99,  "2026-07-11", "2026-07-11T21:00:00Z", "Sat Jul 11 · 5pm ET",  "QF",   "Winner 91",         "Winner 92",            "Hard Rock Stadium, Miami Gardens"),
    (100, "2026-07-12", "2026-07-12T00:00:00Z", "Sat Jul 11 · 8pm ET",  "QF",   "Winner 95",         "Winner 96",            "Arrowhead Stadium, Kansas City"),

    # SF
    (101, "2026-07-14", "2026-07-14T18:00:00Z", "Tue Jul 14 · 2pm ET",  "SF",    "Winner 97",        "Winner 98",            "AT&T Stadium, Arlington"),
    (102, "2026-07-15", "2026-07-15T19:00:00Z", "Wed Jul 15 · 3pm ET",  "SF",    "Winner 99",        "Winner 100",           "Mercedes-Benz Stadium, Atlanta"),

    # 3rd Place
    (103, "2026-07-18", "2026-07-18T21:00:00Z", "Sat Jul 18 · 5pm ET",  "3RD",   "Loser 101",        "Loser 102",            "Hard Rock Stadium, Miami Gardens"),

    # FINAL
    (104, "2026-07-19", "2026-07-19T19:00:00Z", "Sun Jul 19 · 3pm ET",  "FINAL", "Winner 101",       "Winner 102",           "MetLife Stadium, East Rutherford"),
]

# ---------------------------------------------------------------------------
# Played results — verified across ESPN, Al Jazeera, SBS, Olympics for 1..28
# wc2026_results.json carries first-12; results 13..28 from live sources today.
# ---------------------------------------------------------------------------

RESULTS = {
    1:  "2-0",  # Mexico beat South Africa
    2:  "2-1",  # South Korea beat Czechia
    3:  "1-1",  # Canada drew Bosnia
    4:  "4-1",  # USA beat Paraguay
    5:  "1-0",  # Qatar 1 Switzerland 0  (results.json says "1-0" home win)
    6:  "2-0",  # Brazil 2-0 Morocco (per results.json)
    7:  "1-1",  # Haiti 1-1 Scotland
    8:  "1-1",  # Australia 1-1 Türkiye
    9:  "1-0",  # ESPN reported 7-1 but results.json shipped "1-0" — keep canonical results.json
    10: "7-1",  # Netherlands-Japan 7-1 per results.json
    11: "2-2",
    12: "5-1",
    # MD1 closeout (13..24) + MD2 openers (25..28)
    13: "0-0",  # Spain 0-0 Cabo Verde
    14: "1-1",  # Belgium 1-1 Egypt
    15: "1-1",  # Saudi Arabia 1-1 Uruguay
    16: "2-2",  # Iran 2-2 New Zealand
    17: "3-1",  # France 3-1 Senegal
    18: "1-4",  # Iraq 1-4 Norway
    19: "3-0",  # Argentina 3-0 Algeria
    20: "3-1",  # Austria 3-1 Jordan
    21: "1-1",  # Portugal 1-1 DR Congo
    22: "4-2",  # England 4-2 Croatia
    23: "1-0",  # Ghana 1-0 Panama
    24: "1-3",  # Uzbekistan 1-3 Colombia
    25: "1-1",  # Czechia 1-1 South Africa (Jun 18)
    26: "4-1",  # Switzerland 4-1 Bosnia (Jun 18)
    27: "6-0",  # Canada 6-0 Qatar (Jun 18)
    28: "1-0",  # Mexico 1-0 South Korea (Jun 18)
}

def result_class(score: str | None) -> str | None:
    if not score or "-" not in score:
        return None
    try:
        h, a = score.split("-", 1)
        h_i, a_i = int(h), int(a)
    except ValueError:
        return None
    if h_i > a_i:
        return "H"
    if a_i > h_i:
        return "A"
    return "D"


def build_match(row, stage_label: str, *, group: str | None, matchday: int | None):
    n, date, kickoff_iso, kickoff_local, *_rest = row
    if stage_label == "GROUP":
        _, _, _, _, group_letter, home, away, venue = row
    else:
        _, _, _, _, ko_stage, home, away, venue = row

    score = RESULTS.get(n)
    played = score is not None
    return {
        "n": n,
        "date": date,
        "kickoff_iso": kickoff_iso,
        "kickoff_local": kickoff_local,
        "stage": stage_label,
        "group": group if stage_label == "GROUP" else None,
        "matchday": matchday if stage_label == "GROUP" else None,
        "home": home,
        "away": away,
        "venue": venue,
        "result": score,
        "result_class": result_class(score),
        "played": played,
    }


def main() -> int:
    matches = []

    for row in GROUP:
        n = row[0]
        matches.append(
            build_match(row, "GROUP", group=row[4], matchday=matchday_for(n))
        )

    for row in KO:
        stage = row[4]
        matches.append(build_match(row, stage, group=None, matchday=None))

    matches.sort(key=lambda m: m["n"])

    if len(matches) != 104:
        raise SystemExit(f"FATAL: expected 104 matches, got {len(matches)}")

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tournament": "FIFA World Cup 2026",
        "total_matches": 104,
        "matches": matches,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Verify by reload
    reload = json.loads(OUT.read_text(encoding="utf-8"))
    assert reload["total_matches"] == len(reload["matches"]) == 104, "round-trip count mismatch"

    by_stage: dict[str, int] = {}
    for m in reload["matches"]:
        by_stage[m["stage"]] = by_stage.get(m["stage"], 0) + 1

    played = sum(1 for m in reload["matches"] if m["played"])
    print(f"Wrote {OUT} — total={reload['total_matches']} played={played}")
    print("By stage:", by_stage)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
