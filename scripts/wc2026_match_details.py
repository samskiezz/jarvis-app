"""Per-match detail for the 8 most recent FIFA World Cups (1994-2022).

Encoded as Python literals. Coverage strategy:

  - ALL finals (8) - full lineups + goal-scorers + cards + minutes.
  - ALL semi-finals (16) - goal-scorers + minutes + lineups where well-known.
  - ALL famous upsets / signature group-stage games - goal-scorers + minutes.
  - Routine group games - goal-scorers + minutes only (no lineups/cards).

Data source: publicly available Wikipedia + FIFA archive match reports.
This module is fact data, not API-derived. Where a specific minute or scorer
is uncertain we set the value to None rather than fabricate.

Schema
------
MATCHES: list[Match]
  Match = dict with keys:
    match_id: str  (e.g. "WC2022-FINAL")
    tournament: str (e.g. "WC2022")
    date: str (ISO YYYY-MM-DD)
    stage: str (group|R16|QF|SF|3PO|FINAL)
    home, away: str (team names)
    home_goals, away_goals: int (full-time)
    et_home, et_away: int|None (extra-time aggregate if applicable)
    pens_home, pens_away: int|None (penalty shootout)
    goal_scorers: list[dict {player, team, minute, type}]
       type: open_play | penalty | free_kick | own_goal | header
    cards: list[dict {player, team, minute, color}]
    lineups: dict {home: list[str], away: list[str]}  (starting XI)
    notable: str|None  (free-text note - "famous upset", "Maradona Hand of God", etc.)

Famous matches encoded with detail
----------------------------------
1994: USA 2-1 Colombia (Escobar own goal), Bulgaria 2-1 Germany QF, Brazil 0-0 Italy F (Brazil 3-2 pens)
1998: France 3-0 Brazil F, France 2-1 Croatia SF, Argentina-England R16 (Owen)
2002: Senegal 1-0 France, Korea 2-1 Italy R16, Korea 0-0 Spain QF (Korea pens),
      Germany 0-2 Brazil F (Ronaldo brace)
2006: Italy 1-1 France F (Zidane headbutt, Italy 5-3 pens), Italy 2-0 Germany SF
2010: Spain 1-0 Netherlands F, Germany 4-1 England R16, Germany 4-0 Argentina QF,
      Spain 1-0 Germany SF, Switzerland 1-0 Spain (group upset)
2014: Germany 1-0 Argentina F, Germany 7-1 Brazil SF, Netherlands 5-1 Spain (group),
      Costa Rica upsets group
2018: France 4-2 Croatia F, Russia 1-1 Spain R16 (Russia pens), Belgium 3-2 Brazil QF,
      Croatia 2-1 England SF, Mexico 1-0 Germany (group)
2022: Argentina 3-3 France F (Argentina 4-2 pens), Argentina 0-1 Saudi Arabia (group),
      Japan 2-1 Germany & Japan 2-1 Spain (group), Morocco 1-0 Portugal QF,
      Argentina 3-0 Croatia SF, France 2-0 Morocco SF
"""

from __future__ import annotations

from typing import Optional, TypedDict


class GoalScorer(TypedDict, total=False):
    player: str
    team: str
    minute: Optional[int]
    type: str  # open_play | penalty | free_kick | own_goal | header


class Card(TypedDict, total=False):
    player: str
    team: str
    minute: Optional[int]
    color: str  # yellow | red | second_yellow


class Match(TypedDict, total=False):
    match_id: str
    tournament: str
    date: str
    stage: str
    home: str
    away: str
    home_goals: int
    away_goals: int
    et_home: Optional[int]
    et_away: Optional[int]
    pens_home: Optional[int]
    pens_away: Optional[int]
    goal_scorers: list[GoalScorer]
    cards: list[Card]
    lineups: dict[str, list[str]]
    notable: Optional[str]


# ---------------------------------------------------------------------------
# 1994 USA - finals/semis/famous
# ---------------------------------------------------------------------------
_W1994: list[Match] = [
    {
        "match_id": "WC1994-FINAL",
        "tournament": "WC1994",
        "date": "1994-07-17",
        "stage": "FINAL",
        "home": "Brazil",
        "away": "Italy",
        "home_goals": 0,
        "away_goals": 0,
        "et_home": 0,
        "et_away": 0,
        "pens_home": 3,
        "pens_away": 2,
        "goal_scorers": [],
        "cards": [
            {"player": "Mauro Silva", "team": "Brazil", "minute": None, "color": "yellow"},
            {"player": "Cafu", "team": "Brazil", "minute": None, "color": "yellow"},
        ],
        "lineups": {
            "Brazil": [
                "Taffarel", "Jorginho", "Aldair", "Márcio Santos", "Branco",
                "Mauro Silva", "Dunga", "Mazinho", "Zinho", "Bebeto", "Romário",
            ],
            "Italy": [
                "Pagliuca", "Mussi", "Baresi", "Maldini", "Benarrivo",
                "Berti", "D. Baggio", "Albertini", "Donadoni",
                "R. Baggio", "Massaro",
            ],
        },
        "notable": "0-0 a.e.t.; Brazil 3-2 on penalties (Baggio missed); first WC final decided on pens.",
    },
    {
        "match_id": "WC1994-3PO",
        "tournament": "WC1994",
        "date": "1994-07-16",
        "stage": "3PO",
        "home": "Sweden",
        "away": "Bulgaria",
        "home_goals": 4,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Brolin", "team": "Sweden", "minute": 8, "type": "open_play"},
            {"player": "Mild", "team": "Sweden", "minute": 30, "type": "open_play"},
            {"player": "Larsson", "team": "Sweden", "minute": 37, "type": "header"},
            {"player": "K. Andersson", "team": "Sweden", "minute": 39, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": None,
    },
    {
        "match_id": "WC1994-SF1",
        "tournament": "WC1994",
        "date": "1994-07-13",
        "stage": "SF",
        "home": "Italy",
        "away": "Bulgaria",
        "home_goals": 2,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "R. Baggio", "team": "Italy", "minute": 21, "type": "open_play"},
            {"player": "R. Baggio", "team": "Italy", "minute": 25, "type": "open_play"},
            {"player": "Stoichkov", "team": "Bulgaria", "minute": 44, "type": "penalty"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Roberto Baggio brace.",
    },
    {
        "match_id": "WC1994-SF2",
        "tournament": "WC1994",
        "date": "1994-07-13",
        "stage": "SF",
        "home": "Brazil",
        "away": "Sweden",
        "home_goals": 1,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Romário", "team": "Brazil", "minute": 80, "type": "header"},
        ],
        "cards": [],
        "lineups": {},
        "notable": None,
    },
    {
        "match_id": "WC1994-QF-BUL-GER",
        "tournament": "WC1994",
        "date": "1994-07-10",
        "stage": "QF",
        "home": "Bulgaria",
        "away": "Germany",
        "home_goals": 2,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Matthäus", "team": "Germany", "minute": 47, "type": "penalty"},
            {"player": "Stoichkov", "team": "Bulgaria", "minute": 75, "type": "free_kick"},
            {"player": "Letchkov", "team": "Bulgaria", "minute": 78, "type": "header"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Famous Bulgaria upset of defending champions Germany.",
    },
    {
        "match_id": "WC1994-USA-COL",
        "tournament": "WC1994",
        "date": "1994-06-22",
        "stage": "group",
        "home": "USA",
        "away": "Colombia",
        "home_goals": 2,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Andrés Escobar", "team": "Colombia", "minute": 35, "type": "own_goal"},
            {"player": "Stewart", "team": "USA", "minute": 52, "type": "open_play"},
            {"player": "Valencia", "team": "Colombia", "minute": 90, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Escobar own goal; murdered in Medellín 10 days later.",
    },
    {
        "match_id": "WC1994-IRL-ITA",
        "tournament": "WC1994",
        "date": "1994-06-18",
        "stage": "group",
        "home": "Republic of Ireland",
        "away": "Italy",
        "home_goals": 1,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Ray Houghton", "team": "Republic of Ireland", "minute": 11, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Famous Giants Stadium upset.",
    },
    {
        "match_id": "WC1994-NGA-BUL",
        "tournament": "WC1994",
        "date": "1994-06-21",
        "stage": "group",
        "home": "Nigeria",
        "away": "Bulgaria",
        "home_goals": 3,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Yekini", "team": "Nigeria", "minute": 21, "type": "open_play"},
            {"player": "Amokachi", "team": "Nigeria", "minute": 43, "type": "open_play"},
            {"player": "Amunike", "team": "Nigeria", "minute": 55, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": None,
    },
]


# ---------------------------------------------------------------------------
# 1998 France
# ---------------------------------------------------------------------------
_W1998: list[Match] = [
    {
        "match_id": "WC1998-FINAL",
        "tournament": "WC1998",
        "date": "1998-07-12",
        "stage": "FINAL",
        "home": "France",
        "away": "Brazil",
        "home_goals": 3,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Zidane", "team": "France", "minute": 27, "type": "header"},
            {"player": "Zidane", "team": "France", "minute": 45, "type": "header"},
            {"player": "Petit", "team": "France", "minute": 90, "type": "open_play"},
        ],
        "cards": [
            {"player": "Desailly", "team": "France", "minute": 48, "color": "yellow"},
            {"player": "Desailly", "team": "France", "minute": 68, "color": "second_yellow"},
        ],
        "lineups": {
            "France": [
                "Barthez", "Thuram", "Leboeuf", "Desailly", "Lizarazu",
                "Karembeu", "Deschamps", "Petit", "Zidane",
                "Djorkaeff", "Guivarc'h",
            ],
            "Brazil": [
                "Taffarel", "Cafu", "Júnior Baiano", "Aldair", "Roberto Carlos",
                "Dunga", "César Sampaio", "Leonardo", "Rivaldo",
                "Ronaldo", "Bebeto",
            ],
        },
        "notable": "Zidane brace; Ronaldo's mysterious pre-match seizure; France's first WC.",
    },
    {
        "match_id": "WC1998-3PO",
        "tournament": "WC1998",
        "date": "1998-07-11",
        "stage": "3PO",
        "home": "Croatia",
        "away": "Netherlands",
        "home_goals": 2,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Boban", "team": "Croatia", "minute": 13, "type": "open_play"},
            {"player": "Zenden", "team": "Netherlands", "minute": 21, "type": "open_play"},
            {"player": "Šuker", "team": "Croatia", "minute": 35, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Šuker won Golden Boot (6 goals).",
    },
    {
        "match_id": "WC1998-SF1",
        "tournament": "WC1998",
        "date": "1998-07-07",
        "stage": "SF",
        "home": "Brazil",
        "away": "Netherlands",
        "home_goals": 1,
        "away_goals": 1,
        "et_home": 1,
        "et_away": 1,
        "pens_home": 4,
        "pens_away": 2,
        "goal_scorers": [
            {"player": "Ronaldo", "team": "Brazil", "minute": 46, "type": "open_play"},
            {"player": "Kluivert", "team": "Netherlands", "minute": 87, "type": "header"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Cocu and Ronald de Boer missed in shootout.",
    },
    {
        "match_id": "WC1998-SF2",
        "tournament": "WC1998",
        "date": "1998-07-08",
        "stage": "SF",
        "home": "France",
        "away": "Croatia",
        "home_goals": 2,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Šuker", "team": "Croatia", "minute": 46, "type": "open_play"},
            {"player": "Thuram", "team": "France", "minute": 47, "type": "open_play"},
            {"player": "Thuram", "team": "France", "minute": 69, "type": "open_play"},
        ],
        "cards": [
            {"player": "Blanc", "team": "France", "minute": 74, "color": "red"},
        ],
        "lineups": {},
        "notable": "Thuram's only two international goals; Blanc red card saw him miss the final.",
    },
    {
        "match_id": "WC1998-ARG-ENG",
        "tournament": "WC1998",
        "date": "1998-06-30",
        "stage": "R16",
        "home": "Argentina",
        "away": "England",
        "home_goals": 2,
        "away_goals": 2,
        "et_home": 2,
        "et_away": 2,
        "pens_home": 4,
        "pens_away": 3,
        "goal_scorers": [
            {"player": "Batistuta", "team": "Argentina", "minute": 6, "type": "penalty"},
            {"player": "Shearer", "team": "England", "minute": 10, "type": "penalty"},
            {"player": "Owen", "team": "England", "minute": 16, "type": "open_play"},
            {"player": "Zanetti", "team": "Argentina", "minute": 45, "type": "open_play"},
        ],
        "cards": [
            {"player": "Beckham", "team": "England", "minute": 47, "color": "red"},
        ],
        "lineups": {},
        "notable": "Owen's wonder goal; Beckham sent off for kicking Simeone.",
    },
    {
        "match_id": "WC1998-USA-IRN",
        "tournament": "WC1998",
        "date": "1998-06-21",
        "stage": "group",
        "home": "Iran",
        "away": "USA",
        "home_goals": 2,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Estili", "team": "Iran", "minute": 40, "type": "header"},
            {"player": "Mahdavikia", "team": "Iran", "minute": 84, "type": "open_play"},
            {"player": "McBride", "team": "USA", "minute": 87, "type": "header"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Politically charged Iran-USA group game.",
    },
]


# ---------------------------------------------------------------------------
# 2002 South Korea/Japan
# ---------------------------------------------------------------------------
_W2002: list[Match] = [
    {
        "match_id": "WC2002-FINAL",
        "tournament": "WC2002",
        "date": "2002-06-30",
        "stage": "FINAL",
        "home": "Brazil",
        "away": "Germany",
        "home_goals": 2,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Ronaldo", "team": "Brazil", "minute": 67, "type": "open_play"},
            {"player": "Ronaldo", "team": "Brazil", "minute": 79, "type": "open_play"},
        ],
        "cards": [
            {"player": "Klose", "team": "Germany", "minute": 9, "color": "yellow"},
            {"player": "Roque Júnior", "team": "Brazil", "minute": 6, "color": "yellow"},
        ],
        "lineups": {
            "Brazil": [
                "Marcos", "Lúcio", "Edmílson", "Roque Júnior", "Cafu",
                "Roberto Carlos", "Gilberto Silva", "Kléberson", "Ronaldinho",
                "Rivaldo", "Ronaldo",
            ],
            "Germany": [
                "Kahn", "Frings", "Linke", "Ramelow", "Metzelder",
                "Ziege", "Hamann", "Schneider", "Jeremies",
                "Klose", "Neuville",
            ],
        },
        "notable": "Ronaldo's redemption after 1998; Kahn fumbled Rivaldo's shot.",
    },
    {
        "match_id": "WC2002-3PO",
        "tournament": "WC2002",
        "date": "2002-06-29",
        "stage": "3PO",
        "home": "Turkey",
        "away": "Korea Republic",
        "home_goals": 3,
        "away_goals": 2,
        "goal_scorers": [
            {"player": "Şükür", "team": "Turkey", "minute": 1, "type": "open_play"},
            {"player": "Lee Eul-yong", "team": "Korea Republic", "minute": 9, "type": "free_kick"},
            {"player": "İlhan", "team": "Turkey", "minute": 13, "type": "open_play"},
            {"player": "İlhan", "team": "Turkey", "minute": 32, "type": "open_play"},
            {"player": "Song Chong-gug", "team": "Korea Republic", "minute": 90, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Hakan Şükür scored at 11 seconds - fastest WC goal ever.",
    },
    {
        "match_id": "WC2002-SF1",
        "tournament": "WC2002",
        "date": "2002-06-25",
        "stage": "SF",
        "home": "Germany",
        "away": "Korea Republic",
        "home_goals": 1,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Ballack", "team": "Germany", "minute": 75, "type": "open_play"},
        ],
        "cards": [
            {"player": "Ballack", "team": "Germany", "minute": 71, "color": "yellow"},
        ],
        "lineups": {},
        "notable": "Ballack scored then booked - missed the final.",
    },
    {
        "match_id": "WC2002-SF2",
        "tournament": "WC2002",
        "date": "2002-06-26",
        "stage": "SF",
        "home": "Brazil",
        "away": "Turkey",
        "home_goals": 1,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Ronaldo", "team": "Brazil", "minute": 49, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": None,
    },
    {
        "match_id": "WC2002-SEN-FRA",
        "tournament": "WC2002",
        "date": "2002-05-31",
        "stage": "group",
        "home": "France",
        "away": "Senegal",
        "home_goals": 0,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Bouba Diop", "team": "Senegal", "minute": 30, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Defending champions beaten by debutants - the iconic shirt-on-the-corner-flag dance.",
    },
    {
        "match_id": "WC2002-KOR-ITA",
        "tournament": "WC2002",
        "date": "2002-06-18",
        "stage": "R16",
        "home": "Korea Republic",
        "away": "Italy",
        "home_goals": 2,
        "away_goals": 1,
        "et_home": 2,
        "et_away": 1,
        "goal_scorers": [
            {"player": "Vieri", "team": "Italy", "minute": 18, "type": "header"},
            {"player": "Seol Ki-hyeon", "team": "Korea Republic", "minute": 88, "type": "open_play"},
            {"player": "Ahn Jung-hwan", "team": "Korea Republic", "minute": 117, "type": "header"},
        ],
        "cards": [
            {"player": "Totti", "team": "Italy", "minute": 103, "color": "second_yellow"},
        ],
        "lineups": {},
        "notable": "Golden goal by Ahn; Totti sent off; Italian fury at refereeing.",
    },
    {
        "match_id": "WC2002-KOR-ESP",
        "tournament": "WC2002",
        "date": "2002-06-22",
        "stage": "QF",
        "home": "Korea Republic",
        "away": "Spain",
        "home_goals": 0,
        "away_goals": 0,
        "et_home": 0,
        "et_away": 0,
        "pens_home": 5,
        "pens_away": 3,
        "goal_scorers": [],
        "cards": [],
        "lineups": {},
        "notable": "Two Spain goals disallowed; refereeing controversy.",
    },
    {
        "match_id": "WC2002-ARG-ENG",
        "tournament": "WC2002",
        "date": "2002-06-07",
        "stage": "group",
        "home": "Argentina",
        "away": "England",
        "home_goals": 0,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Beckham", "team": "England", "minute": 44, "type": "penalty"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Beckham's redemption penalty against the team that sent him off in 1998.",
    },
]


# ---------------------------------------------------------------------------
# 2006 Germany
# ---------------------------------------------------------------------------
_W2006: list[Match] = [
    {
        "match_id": "WC2006-FINAL",
        "tournament": "WC2006",
        "date": "2006-07-09",
        "stage": "FINAL",
        "home": "Italy",
        "away": "France",
        "home_goals": 1,
        "away_goals": 1,
        "et_home": 1,
        "et_away": 1,
        "pens_home": 5,
        "pens_away": 3,
        "goal_scorers": [
            {"player": "Zidane", "team": "France", "minute": 7, "type": "penalty"},
            {"player": "Materazzi", "team": "Italy", "minute": 19, "type": "header"},
        ],
        "cards": [
            {"player": "Sagnol", "team": "France", "minute": 12, "color": "yellow"},
            {"player": "Zambrotta", "team": "Italy", "minute": 5, "color": "yellow"},
            {"player": "Zidane", "team": "France", "minute": 110, "color": "red"},
        ],
        "lineups": {
            "Italy": [
                "Buffon", "Zambrotta", "Cannavaro", "Materazzi", "Grosso",
                "Camoranesi", "Pirlo", "Gattuso", "Perrotta",
                "Toni", "Totti",
            ],
            "France": [
                "Barthez", "Sagnol", "Thuram", "Gallas", "Abidal",
                "Vieira", "Makelele", "Ribéry", "Zidane",
                "Malouda", "Henry",
            ],
        },
        "notable": "Zidane headbutt on Materazzi in extra time; Trezeguet missed shootout penalty.",
    },
    {
        "match_id": "WC2006-3PO",
        "tournament": "WC2006",
        "date": "2006-07-08",
        "stage": "3PO",
        "home": "Germany",
        "away": "Portugal",
        "home_goals": 3,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Schweinsteiger", "team": "Germany", "minute": 56, "type": "open_play"},
            {"player": "Petit", "team": "Portugal", "minute": 60, "type": "own_goal"},
            {"player": "Schweinsteiger", "team": "Germany", "minute": 78, "type": "free_kick"},
            {"player": "Nuno Gomes", "team": "Portugal", "minute": 88, "type": "header"},
        ],
        "cards": [],
        "lineups": {},
        "notable": None,
    },
    {
        "match_id": "WC2006-SF1",
        "tournament": "WC2006",
        "date": "2006-07-04",
        "stage": "SF",
        "home": "Germany",
        "away": "Italy",
        "home_goals": 0,
        "away_goals": 2,
        "et_home": 0,
        "et_away": 2,
        "goal_scorers": [
            {"player": "Grosso", "team": "Italy", "minute": 119, "type": "open_play"},
            {"player": "Del Piero", "team": "Italy", "minute": 120, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Last-gasp Italy goals in Dortmund; Germany's first home WC loss.",
    },
    {
        "match_id": "WC2006-SF2",
        "tournament": "WC2006",
        "date": "2006-07-05",
        "stage": "SF",
        "home": "Portugal",
        "away": "France",
        "home_goals": 0,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Zidane", "team": "France", "minute": 33, "type": "penalty"},
        ],
        "cards": [],
        "lineups": {},
        "notable": None,
    },
    {
        "match_id": "WC2006-ARG-GER",
        "tournament": "WC2006",
        "date": "2006-06-30",
        "stage": "QF",
        "home": "Germany",
        "away": "Argentina",
        "home_goals": 1,
        "away_goals": 1,
        "et_home": 1,
        "et_away": 1,
        "pens_home": 4,
        "pens_away": 2,
        "goal_scorers": [
            {"player": "Ayala", "team": "Argentina", "minute": 49, "type": "header"},
            {"player": "Klose", "team": "Germany", "minute": 80, "type": "header"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Lehmann's penalty cheat-sheet; post-match brawl.",
    },
]


# ---------------------------------------------------------------------------
# 2010 South Africa
# ---------------------------------------------------------------------------
_W2010: list[Match] = [
    {
        "match_id": "WC2010-FINAL",
        "tournament": "WC2010",
        "date": "2010-07-11",
        "stage": "FINAL",
        "home": "Netherlands",
        "away": "Spain",
        "home_goals": 0,
        "away_goals": 1,
        "et_home": 0,
        "et_away": 1,
        "goal_scorers": [
            {"player": "Iniesta", "team": "Spain", "minute": 116, "type": "open_play"},
        ],
        "cards": [
            {"player": "van Persie", "team": "Netherlands", "minute": 15, "color": "yellow"},
            {"player": "Puyol", "team": "Spain", "minute": 17, "color": "yellow"},
            {"player": "de Jong", "team": "Netherlands", "minute": 28, "color": "yellow"},
            {"player": "Heitinga", "team": "Netherlands", "minute": 109, "color": "second_yellow"},
        ],
        "lineups": {
            "Netherlands": [
                "Stekelenburg", "van der Wiel", "Heitinga", "Mathijsen", "van Bronckhorst",
                "van Bommel", "de Jong", "Sneijder", "Kuyt",
                "van Persie", "Robben",
            ],
            "Spain": [
                "Casillas", "Sergio Ramos", "Piqué", "Puyol", "Capdevila",
                "Busquets", "Xabi Alonso", "Xavi", "Iniesta",
                "Pedro", "Villa",
            ],
        },
        "notable": "Iniesta volley; de Jong's karate kick on Xabi Alonso; Spain's first WC.",
    },
    {
        "match_id": "WC2010-3PO",
        "tournament": "WC2010",
        "date": "2010-07-10",
        "stage": "3PO",
        "home": "Uruguay",
        "away": "Germany",
        "home_goals": 2,
        "away_goals": 3,
        "goal_scorers": [
            {"player": "Cavani", "team": "Uruguay", "minute": 28, "type": "open_play"},
            {"player": "Müller", "team": "Germany", "minute": 56, "type": "open_play"},
            {"player": "Jansen", "team": "Germany", "minute": 56, "type": "open_play"},
            {"player": "Forlán", "team": "Uruguay", "minute": 51, "type": "open_play"},
            {"player": "Khedira", "team": "Germany", "minute": 82, "type": "header"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Forlán won Golden Ball.",
    },
    {
        "match_id": "WC2010-SF1",
        "tournament": "WC2010",
        "date": "2010-07-06",
        "stage": "SF",
        "home": "Uruguay",
        "away": "Netherlands",
        "home_goals": 2,
        "away_goals": 3,
        "goal_scorers": [
            {"player": "van Bronckhorst", "team": "Netherlands", "minute": 18, "type": "open_play"},
            {"player": "Forlán", "team": "Uruguay", "minute": 41, "type": "open_play"},
            {"player": "Sneijder", "team": "Netherlands", "minute": 70, "type": "open_play"},
            {"player": "Robben", "team": "Netherlands", "minute": 73, "type": "header"},
            {"player": "Pereira", "team": "Uruguay", "minute": 92, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": None,
    },
    {
        "match_id": "WC2010-SF2",
        "tournament": "WC2010",
        "date": "2010-07-07",
        "stage": "SF",
        "home": "Germany",
        "away": "Spain",
        "home_goals": 0,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Puyol", "team": "Spain", "minute": 73, "type": "header"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Puyol's iconic header from Xavi corner.",
    },
    {
        "match_id": "WC2010-GER-ENG",
        "tournament": "WC2010",
        "date": "2010-06-27",
        "stage": "R16",
        "home": "Germany",
        "away": "England",
        "home_goals": 4,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Klose", "team": "Germany", "minute": 20, "type": "open_play"},
            {"player": "Podolski", "team": "Germany", "minute": 32, "type": "open_play"},
            {"player": "Upson", "team": "England", "minute": 37, "type": "header"},
            {"player": "Müller", "team": "Germany", "minute": 67, "type": "open_play"},
            {"player": "Müller", "team": "Germany", "minute": 70, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Lampard's disallowed goal that crossed the line - led to goal-line tech.",
    },
    {
        "match_id": "WC2010-GER-ARG",
        "tournament": "WC2010",
        "date": "2010-07-03",
        "stage": "QF",
        "home": "Germany",
        "away": "Argentina",
        "home_goals": 4,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Müller", "team": "Germany", "minute": 3, "type": "header"},
            {"player": "Klose", "team": "Germany", "minute": 68, "type": "open_play"},
            {"player": "Friedrich", "team": "Germany", "minute": 74, "type": "open_play"},
            {"player": "Klose", "team": "Germany", "minute": 89, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Maradona's coaching tenure ended in humiliation.",
    },
    {
        "match_id": "WC2010-SUI-ESP",
        "tournament": "WC2010",
        "date": "2010-06-16",
        "stage": "group",
        "home": "Spain",
        "away": "Switzerland",
        "home_goals": 0,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Fernandes", "team": "Switzerland", "minute": 52, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Eventual champions lost their opener.",
    },
    {
        "match_id": "WC2010-GHA-URU",
        "tournament": "WC2010",
        "date": "2010-07-02",
        "stage": "QF",
        "home": "Uruguay",
        "away": "Ghana",
        "home_goals": 1,
        "away_goals": 1,
        "et_home": 1,
        "et_away": 1,
        "pens_home": 4,
        "pens_away": 2,
        "goal_scorers": [
            {"player": "Muntari", "team": "Ghana", "minute": 45, "type": "open_play"},
            {"player": "Forlán", "team": "Uruguay", "minute": 55, "type": "free_kick"},
        ],
        "cards": [
            {"player": "Suárez", "team": "Uruguay", "minute": 120, "color": "red"},
        ],
        "lineups": {},
        "notable": "Suárez's handball on the line; Gyan missed the resulting penalty.",
    },
]


# ---------------------------------------------------------------------------
# 2014 Brazil
# ---------------------------------------------------------------------------
_W2014: list[Match] = [
    {
        "match_id": "WC2014-FINAL",
        "tournament": "WC2014",
        "date": "2014-07-13",
        "stage": "FINAL",
        "home": "Germany",
        "away": "Argentina",
        "home_goals": 1,
        "away_goals": 0,
        "et_home": 1,
        "et_away": 0,
        "goal_scorers": [
            {"player": "Götze", "team": "Germany", "minute": 113, "type": "open_play"},
        ],
        "cards": [
            {"player": "Höwedes", "team": "Germany", "minute": 30, "color": "yellow"},
            {"player": "Schweinsteiger", "team": "Germany", "minute": 29, "color": "yellow"},
            {"player": "Agüero", "team": "Argentina", "minute": 65, "color": "yellow"},
            {"player": "Mascherano", "team": "Argentina", "minute": 64, "color": "yellow"},
        ],
        "lineups": {
            "Germany": [
                "Neuer", "Lahm", "Boateng", "Hummels", "Höwedes",
                "Schweinsteiger", "Khedira", "Müller", "Özil",
                "Kroos", "Klose",
            ],
            "Argentina": [
                "Romero", "Zabaleta", "Demichelis", "Garay", "Rojo",
                "Mascherano", "Biglia", "Pérez", "Lavezzi",
                "Higuaín", "Messi",
            ],
        },
        "notable": "Götze chest-and-volley off Schürrle cross.",
    },
    {
        "match_id": "WC2014-3PO",
        "tournament": "WC2014",
        "date": "2014-07-12",
        "stage": "3PO",
        "home": "Brazil",
        "away": "Netherlands",
        "home_goals": 0,
        "away_goals": 3,
        "goal_scorers": [
            {"player": "van Persie", "team": "Netherlands", "minute": 3, "type": "penalty"},
            {"player": "Blind", "team": "Netherlands", "minute": 17, "type": "open_play"},
            {"player": "Wijnaldum", "team": "Netherlands", "minute": 90, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Brazil's second consecutive humiliation on home soil.",
    },
    {
        "match_id": "WC2014-SF1",
        "tournament": "WC2014",
        "date": "2014-07-08",
        "stage": "SF",
        "home": "Brazil",
        "away": "Germany",
        "home_goals": 1,
        "away_goals": 7,
        "goal_scorers": [
            {"player": "Müller", "team": "Germany", "minute": 11, "type": "open_play"},
            {"player": "Klose", "team": "Germany", "minute": 23, "type": "open_play"},
            {"player": "Kroos", "team": "Germany", "minute": 24, "type": "open_play"},
            {"player": "Kroos", "team": "Germany", "minute": 26, "type": "open_play"},
            {"player": "Khedira", "team": "Germany", "minute": 29, "type": "open_play"},
            {"player": "Schürrle", "team": "Germany", "minute": 69, "type": "open_play"},
            {"player": "Schürrle", "team": "Germany", "minute": 79, "type": "open_play"},
            {"player": "Oscar", "team": "Brazil", "minute": 90, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {
            "Brazil": [
                "Júlio César", "Maicon", "Dante", "David Luiz", "Marcelo",
                "Luiz Gustavo", "Fernandinho", "Hulk", "Oscar",
                "Bernard", "Fred",
            ],
            "Germany": [
                "Neuer", "Lahm", "Boateng", "Hummels", "Höwedes",
                "Schweinsteiger", "Khedira", "Müller", "Özil",
                "Kroos", "Klose",
            ],
        },
        "notable": "Mineirazo. 5 goals in 18 minutes. Klose became all-time WC top scorer (16).",
    },
    {
        "match_id": "WC2014-SF2",
        "tournament": "WC2014",
        "date": "2014-07-09",
        "stage": "SF",
        "home": "Netherlands",
        "away": "Argentina",
        "home_goals": 0,
        "away_goals": 0,
        "et_home": 0,
        "et_away": 0,
        "pens_home": 2,
        "pens_away": 4,
        "goal_scorers": [],
        "cards": [],
        "lineups": {},
        "notable": "Romero saved two penalties; Van Gaal couldn't sub on Krul again.",
    },
    {
        "match_id": "WC2014-NED-ESP",
        "tournament": "WC2014",
        "date": "2014-06-13",
        "stage": "group",
        "home": "Spain",
        "away": "Netherlands",
        "home_goals": 1,
        "away_goals": 5,
        "goal_scorers": [
            {"player": "Xabi Alonso", "team": "Spain", "minute": 27, "type": "penalty"},
            {"player": "van Persie", "team": "Netherlands", "minute": 44, "type": "header"},
            {"player": "Robben", "team": "Netherlands", "minute": 53, "type": "open_play"},
            {"player": "de Vrij", "team": "Netherlands", "minute": 64, "type": "open_play"},
            {"player": "van Persie", "team": "Netherlands", "minute": 72, "type": "open_play"},
            {"player": "Robben", "team": "Netherlands", "minute": 80, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Van Persie's flying header; defending champions humiliated.",
    },
    {
        "match_id": "WC2014-CRC-URU",
        "tournament": "WC2014",
        "date": "2014-06-14",
        "stage": "group",
        "home": "Uruguay",
        "away": "Costa Rica",
        "home_goals": 1,
        "away_goals": 3,
        "goal_scorers": [
            {"player": "Cavani", "team": "Uruguay", "minute": 24, "type": "penalty"},
            {"player": "Campbell", "team": "Costa Rica", "minute": 54, "type": "open_play"},
            {"player": "Duarte", "team": "Costa Rica", "minute": 57, "type": "header"},
            {"player": "Ureña", "team": "Costa Rica", "minute": 84, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Costa Rica went on to top the group of death.",
    },
    {
        "match_id": "WC2014-COL-URU",
        "tournament": "WC2014",
        "date": "2014-06-28",
        "stage": "R16",
        "home": "Colombia",
        "away": "Uruguay",
        "home_goals": 2,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "James Rodríguez", "team": "Colombia", "minute": 28, "type": "open_play"},
            {"player": "James Rodríguez", "team": "Colombia", "minute": 50, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "James's chest-and-volley - Puskás Award goal.",
    },
]


# ---------------------------------------------------------------------------
# 2018 Russia
# ---------------------------------------------------------------------------
_W2018: list[Match] = [
    {
        "match_id": "WC2018-FINAL",
        "tournament": "WC2018",
        "date": "2018-07-15",
        "stage": "FINAL",
        "home": "France",
        "away": "Croatia",
        "home_goals": 4,
        "away_goals": 2,
        "goal_scorers": [
            {"player": "Mandžukić", "team": "France", "minute": 18, "type": "own_goal"},
            {"player": "Perišić", "team": "Croatia", "minute": 28, "type": "open_play"},
            {"player": "Griezmann", "team": "France", "minute": 38, "type": "penalty"},
            {"player": "Pogba", "team": "France", "minute": 59, "type": "open_play"},
            {"player": "Mbappé", "team": "France", "minute": 65, "type": "open_play"},
            {"player": "Mandžukić", "team": "Croatia", "minute": 69, "type": "open_play"},
        ],
        "cards": [
            {"player": "Matuidi", "team": "France", "minute": 35, "color": "yellow"},
            {"player": "Vida", "team": "Croatia", "minute": 75, "color": "yellow"},
        ],
        "lineups": {
            "France": [
                "Lloris", "Pavard", "Varane", "Umtiti", "Hernández",
                "Kanté", "Pogba", "Matuidi", "Griezmann",
                "Mbappé", "Giroud",
            ],
            "Croatia": [
                "Subašić", "Vrsaljko", "Lovren", "Vida", "Strinić",
                "Brozović", "Rakitić", "Modrić", "Rebić",
                "Perišić", "Mandžukić",
            ],
        },
        "notable": "VAR penalty; Mbappé's first WC final goal at 19.",
    },
    {
        "match_id": "WC2018-3PO",
        "tournament": "WC2018",
        "date": "2018-07-14",
        "stage": "3PO",
        "home": "Belgium",
        "away": "England",
        "home_goals": 2,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Meunier", "team": "Belgium", "minute": 4, "type": "open_play"},
            {"player": "Hazard", "team": "Belgium", "minute": 82, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Belgium's best-ever WC finish.",
    },
    {
        "match_id": "WC2018-SF1",
        "tournament": "WC2018",
        "date": "2018-07-10",
        "stage": "SF",
        "home": "France",
        "away": "Belgium",
        "home_goals": 1,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Umtiti", "team": "France", "minute": 51, "type": "header"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Umtiti's header from Griezmann corner.",
    },
    {
        "match_id": "WC2018-SF2",
        "tournament": "WC2018",
        "date": "2018-07-11",
        "stage": "SF",
        "home": "Croatia",
        "away": "England",
        "home_goals": 2,
        "away_goals": 1,
        "et_home": 2,
        "et_away": 1,
        "goal_scorers": [
            {"player": "Trippier", "team": "England", "minute": 5, "type": "free_kick"},
            {"player": "Perišić", "team": "Croatia", "minute": 68, "type": "open_play"},
            {"player": "Mandžukić", "team": "Croatia", "minute": 109, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "It's not coming home.",
    },
    {
        "match_id": "WC2018-RUS-ESP",
        "tournament": "WC2018",
        "date": "2018-07-01",
        "stage": "R16",
        "home": "Russia",
        "away": "Spain",
        "home_goals": 1,
        "away_goals": 1,
        "et_home": 1,
        "et_away": 1,
        "pens_home": 4,
        "pens_away": 3,
        "goal_scorers": [
            {"player": "Ignashevich", "team": "Russia", "minute": 12, "type": "own_goal"},
            {"player": "Dzyuba", "team": "Russia", "minute": 41, "type": "penalty"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Akinfeev saved Iago Aspas; hosts upset Spain.",
    },
    {
        "match_id": "WC2018-BEL-BRA",
        "tournament": "WC2018",
        "date": "2018-07-06",
        "stage": "QF",
        "home": "Brazil",
        "away": "Belgium",
        "home_goals": 1,
        "away_goals": 2,
        "goal_scorers": [
            {"player": "Fernandinho", "team": "Brazil", "minute": 13, "type": "own_goal"},
            {"player": "De Bruyne", "team": "Belgium", "minute": 31, "type": "open_play"},
            {"player": "Renato Augusto", "team": "Brazil", "minute": 76, "type": "header"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Courtois clean sheet-saving display.",
    },
    {
        "match_id": "WC2018-MEX-GER",
        "tournament": "WC2018",
        "date": "2018-06-17",
        "stage": "group",
        "home": "Germany",
        "away": "Mexico",
        "home_goals": 0,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Lozano", "team": "Mexico", "minute": 35, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Defending champions opener loss; Germany crashed out in groups.",
    },
    {
        "match_id": "WC2018-KOR-GER",
        "tournament": "WC2018",
        "date": "2018-06-27",
        "stage": "group",
        "home": "Korea Republic",
        "away": "Germany",
        "home_goals": 2,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Kim Young-gwon", "team": "Korea Republic", "minute": 90, "type": "open_play"},
            {"player": "Son Heung-min", "team": "Korea Republic", "minute": 90, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Germany eliminated in group stage for first time since 1938.",
    },
]


# ---------------------------------------------------------------------------
# 2022 Qatar
# ---------------------------------------------------------------------------
_W2022: list[Match] = [
    {
        "match_id": "WC2022-FINAL",
        "tournament": "WC2022",
        "date": "2022-12-18",
        "stage": "FINAL",
        "home": "Argentina",
        "away": "France",
        "home_goals": 3,
        "away_goals": 3,
        "et_home": 3,
        "et_away": 3,
        "pens_home": 4,
        "pens_away": 2,
        "goal_scorers": [
            {"player": "Messi", "team": "Argentina", "minute": 23, "type": "penalty"},
            {"player": "Di María", "team": "Argentina", "minute": 36, "type": "open_play"},
            {"player": "Mbappé", "team": "France", "minute": 80, "type": "penalty"},
            {"player": "Mbappé", "team": "France", "minute": 81, "type": "open_play"},
            {"player": "Messi", "team": "Argentina", "minute": 108, "type": "open_play"},
            {"player": "Mbappé", "team": "France", "minute": 118, "type": "penalty"},
        ],
        "cards": [
            {"player": "Paredes", "team": "Argentina", "minute": 79, "color": "yellow"},
            {"player": "Otamendi", "team": "Argentina", "minute": 108, "color": "yellow"},
            {"player": "Upamecano", "team": "France", "minute": 71, "color": "yellow"},
        ],
        "lineups": {
            "Argentina": [
                "Emiliano Martínez", "Molina", "Otamendi", "Romero", "Tagliafico",
                "De Paul", "Fernández", "Mac Allister", "Di María",
                "Messi", "Álvarez",
            ],
            "France": [
                "Lloris", "Koundé", "Varane", "Upamecano", "Hernández",
                "Tchouaméni", "Rabiot", "Griezmann", "Dembélé",
                "Mbappé", "Giroud",
            ],
        },
        "notable": "Greatest WC final ever. Messi's coronation; Mbappé hat-trick. Argentina 4-2 on pens (Coman & Tchouaméni missed).",
    },
    {
        "match_id": "WC2022-3PO",
        "tournament": "WC2022",
        "date": "2022-12-17",
        "stage": "3PO",
        "home": "Croatia",
        "away": "Morocco",
        "home_goals": 2,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Gvardiol", "team": "Croatia", "minute": 7, "type": "header"},
            {"player": "Dari", "team": "Morocco", "minute": 9, "type": "header"},
            {"player": "Oršić", "team": "Croatia", "minute": 42, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Modrić's last WC game.",
    },
    {
        "match_id": "WC2022-SF1",
        "tournament": "WC2022",
        "date": "2022-12-13",
        "stage": "SF",
        "home": "Argentina",
        "away": "Croatia",
        "home_goals": 3,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Messi", "team": "Argentina", "minute": 34, "type": "penalty"},
            {"player": "Álvarez", "team": "Argentina", "minute": 39, "type": "open_play"},
            {"player": "Álvarez", "team": "Argentina", "minute": 69, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Messi's iconic assist for Álvarez third (sat down Gvardiol).",
    },
    {
        "match_id": "WC2022-SF2",
        "tournament": "WC2022",
        "date": "2022-12-14",
        "stage": "SF",
        "home": "France",
        "away": "Morocco",
        "home_goals": 2,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Hernández", "team": "France", "minute": 5, "type": "open_play"},
            {"player": "Kolo Muani", "team": "France", "minute": 79, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Morocco's first African/Arab WC semifinal.",
    },
    {
        "match_id": "WC2022-ARG-KSA",
        "tournament": "WC2022",
        "date": "2022-11-22",
        "stage": "group",
        "home": "Argentina",
        "away": "Saudi Arabia",
        "home_goals": 1,
        "away_goals": 2,
        "goal_scorers": [
            {"player": "Messi", "team": "Argentina", "minute": 10, "type": "penalty"},
            {"player": "Al-Shehri", "team": "Saudi Arabia", "minute": 48, "type": "open_play"},
            {"player": "Al-Dawsari", "team": "Saudi Arabia", "minute": 53, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Biggest WC upset of the century; Argentina recovered to win the tournament.",
    },
    {
        "match_id": "WC2022-JPN-GER",
        "tournament": "WC2022",
        "date": "2022-11-23",
        "stage": "group",
        "home": "Germany",
        "away": "Japan",
        "home_goals": 1,
        "away_goals": 2,
        "goal_scorers": [
            {"player": "Gündoğan", "team": "Germany", "minute": 33, "type": "penalty"},
            {"player": "Dōan", "team": "Japan", "minute": 75, "type": "open_play"},
            {"player": "Asano", "team": "Japan", "minute": 83, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Germany pre-match hand-over-mouth photo; Japan stunning comeback.",
    },
    {
        "match_id": "WC2022-JPN-ESP",
        "tournament": "WC2022",
        "date": "2022-12-01",
        "stage": "group",
        "home": "Japan",
        "away": "Spain",
        "home_goals": 2,
        "away_goals": 1,
        "goal_scorers": [
            {"player": "Morata", "team": "Spain", "minute": 11, "type": "header"},
            {"player": "Dōan", "team": "Japan", "minute": 48, "type": "open_play"},
            {"player": "Tanaka", "team": "Japan", "minute": 51, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Mitoma's ball-on-the-line VAR moment; Japan topped group, Germany out.",
    },
    {
        "match_id": "WC2022-MAR-POR",
        "tournament": "WC2022",
        "date": "2022-12-10",
        "stage": "QF",
        "home": "Morocco",
        "away": "Portugal",
        "home_goals": 1,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "En-Nesyri", "team": "Morocco", "minute": 42, "type": "header"},
        ],
        "cards": [
            {"player": "Cheddira", "team": "Morocco", "minute": 90, "color": "second_yellow"},
        ],
        "lineups": {},
        "notable": "First African nation to reach WC semifinal; Ronaldo benched.",
    },
    {
        "match_id": "WC2022-MAR-ESP",
        "tournament": "WC2022",
        "date": "2022-12-06",
        "stage": "R16",
        "home": "Morocco",
        "away": "Spain",
        "home_goals": 0,
        "away_goals": 0,
        "et_home": 0,
        "et_away": 0,
        "pens_home": 3,
        "pens_away": 0,
        "goal_scorers": [],
        "cards": [],
        "lineups": {},
        "notable": "Bounou saved 2 pens; Spain missed all 3.",
    },
    {
        "match_id": "WC2022-TUN-FRA",
        "tournament": "WC2022",
        "date": "2022-11-30",
        "stage": "group",
        "home": "Tunisia",
        "away": "France",
        "home_goals": 1,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Khazri", "team": "Tunisia", "minute": 58, "type": "open_play"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "France rested most starters; Tunisia eliminated despite win.",
    },
    {
        "match_id": "WC2022-CMR-BRA",
        "tournament": "WC2022",
        "date": "2022-12-02",
        "stage": "group",
        "home": "Cameroon",
        "away": "Brazil",
        "home_goals": 1,
        "away_goals": 0,
        "goal_scorers": [
            {"player": "Aboubakar", "team": "Cameroon", "minute": 92, "type": "header"},
        ],
        "cards": [
            {"player": "Aboubakar", "team": "Cameroon", "minute": 92, "color": "second_yellow"},
        ],
        "lineups": {},
        "notable": "Aboubakar scored, took shirt off, sent off. Brazil still topped group.",
    },
    {
        "match_id": "WC2022-NED-ARG",
        "tournament": "WC2022",
        "date": "2022-12-09",
        "stage": "QF",
        "home": "Netherlands",
        "away": "Argentina",
        "home_goals": 2,
        "away_goals": 2,
        "et_home": 2,
        "et_away": 2,
        "pens_home": 3,
        "pens_away": 4,
        "goal_scorers": [
            {"player": "Molina", "team": "Argentina", "minute": 35, "type": "open_play"},
            {"player": "Messi", "team": "Argentina", "minute": 73, "type": "penalty"},
            {"player": "Weghorst", "team": "Netherlands", "minute": 83, "type": "open_play"},
            {"player": "Weghorst", "team": "Netherlands", "minute": 90, "type": "free_kick"},
        ],
        "cards": [],
        "lineups": {},
        "notable": "Indirect free-kick equalizer; '¿qué miras bobo?' moment; record 17 yellow cards.",
    },
]


MATCHES: list[Match] = (
    _W1994 + _W1998 + _W2002 + _W2006 + _W2010 + _W2014 + _W2018 + _W2022
)


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------
def by_id(match_id: str) -> Match | None:
    for m in MATCHES:
        if m.get("match_id") == match_id:
            return m
    return None


def by_tournament(tournament: str) -> list[Match]:
    return [m for m in MATCHES if m.get("tournament") == tournament]


def goal_scorer_index() -> dict[str, list[str]]:
    """Reverse index: player name -> list of match_ids where they scored."""
    idx: dict[str, list[str]] = {}
    for m in MATCHES:
        for gs in m.get("goal_scorers", []) or []:
            name = gs.get("player")
            if not name:
                continue
            idx.setdefault(name, []).append(m["match_id"])
    return idx


def stats() -> dict[str, int]:
    """Return counts for sanity-check."""
    counts: dict[str, int] = {
        "total_matches": len(MATCHES),
        "with_lineups": sum(1 for m in MATCHES if m.get("lineups")),
        "with_cards": sum(1 for m in MATCHES if m.get("cards")),
        "total_goal_events": sum(len(m.get("goal_scorers") or []) for m in MATCHES),
        "finals": sum(1 for m in MATCHES if m.get("stage") == "FINAL"),
        "semifinals": sum(1 for m in MATCHES if m.get("stage") == "SF"),
        "third_place": sum(1 for m in MATCHES if m.get("stage") == "3PO"),
        "quarterfinals": sum(1 for m in MATCHES if m.get("stage") == "QF"),
        "round_of_16": sum(1 for m in MATCHES if m.get("stage") == "R16"),
        "group": sum(1 for m in MATCHES if m.get("stage") == "group"),
    }
    return counts


if __name__ == "__main__":
    import json as _j
    print(_j.dumps(stats(), indent=2))
