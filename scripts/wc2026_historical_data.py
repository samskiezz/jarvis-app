"""Historical tournament data ingestor for WC2026 predictor training.

Builds a unified match history CSV from three recent major tournaments
(WC 2022 Qatar, Euros 2024 Germany, Copa America 2024 USA) plus the
12 already-completed WC2026 MD1 results on disk.

Output: /opt/jarvis-app-1/server/data/wc2026_training_history.csv

Public-domain results. Encoded inline so the script is offline-safe and
deterministic — no network fetch required.

CLI:
    python3 scripts/wc2026_historical_data.py
"""
from __future__ import annotations

import csv
import json
import logging
import pathlib
import sys
from collections import Counter
from typing import NamedTuple

LOG = logging.getLogger("wc2026_history")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DATA_DIR = pathlib.Path("/opt/jarvis-app-1/server/data")
RESULTS_JSON = DATA_DIR / "wc2026_results.json"
OUT_CSV = DATA_DIR / "wc2026_training_history.csv"


class Match(NamedTuple):
    date: str
    home: str
    away: str
    hg: int
    ag: int
    neutral: bool
    competition: str
    stage: str


# ---------------------------------------------------------------------------
# WC 2022 Qatar — 64 matches, all at neutral venues
# Source: public FIFA / wikipedia records. Scores are 90-min (incl. ET where applicable).
# ---------------------------------------------------------------------------
WC2022: list[tuple[str, str, str, int, int, str]] = [
    # Group stage
    ("2022-11-20", "Qatar",        "Ecuador",      0, 2, "Group"),
    ("2022-11-21", "England",      "Iran",         6, 2, "Group"),
    ("2022-11-21", "Senegal",      "Netherlands",  0, 2, "Group"),
    ("2022-11-21", "USA",          "Wales",        1, 1, "Group"),
    ("2022-11-22", "Argentina",    "Saudi Arabia", 1, 2, "Group"),
    ("2022-11-22", "Denmark",      "Tunisia",      0, 0, "Group"),
    ("2022-11-22", "Mexico",       "Poland",       0, 0, "Group"),
    ("2022-11-22", "France",       "Australia",    4, 1, "Group"),
    ("2022-11-23", "Morocco",      "Croatia",      0, 0, "Group"),
    ("2022-11-23", "Germany",      "Japan",        1, 2, "Group"),
    ("2022-11-23", "Spain",        "Costa Rica",   7, 0, "Group"),
    ("2022-11-23", "Belgium",      "Canada",       1, 0, "Group"),
    ("2022-11-24", "Switzerland",  "Cameroon",     1, 0, "Group"),
    ("2022-11-24", "Uruguay",      "South Korea",  0, 0, "Group"),
    ("2022-11-24", "Portugal",     "Ghana",        3, 2, "Group"),
    ("2022-11-24", "Brazil",       "Serbia",       2, 0, "Group"),
    ("2022-11-25", "Wales",        "Iran",         0, 2, "Group"),
    ("2022-11-25", "Qatar",        "Senegal",      1, 3, "Group"),
    ("2022-11-25", "Netherlands",  "Ecuador",      1, 1, "Group"),
    ("2022-11-25", "England",      "USA",          0, 0, "Group"),
    ("2022-11-26", "Tunisia",      "Australia",    0, 1, "Group"),
    ("2022-11-26", "Poland",       "Saudi Arabia", 2, 0, "Group"),
    ("2022-11-26", "France",       "Denmark",      2, 1, "Group"),
    ("2022-11-26", "Argentina",    "Mexico",       2, 0, "Group"),
    ("2022-11-27", "Japan",        "Costa Rica",   0, 1, "Group"),
    ("2022-11-27", "Belgium",      "Morocco",      0, 2, "Group"),
    ("2022-11-27", "Croatia",      "Canada",       4, 1, "Group"),
    ("2022-11-27", "Spain",        "Germany",      1, 1, "Group"),
    ("2022-11-28", "Cameroon",     "Serbia",       3, 3, "Group"),
    ("2022-11-28", "South Korea",  "Ghana",        2, 3, "Group"),
    ("2022-11-28", "Brazil",       "Switzerland",  1, 0, "Group"),
    ("2022-11-28", "Portugal",     "Uruguay",      2, 0, "Group"),
    ("2022-11-29", "Ecuador",      "Senegal",      1, 2, "Group"),
    ("2022-11-29", "Netherlands",  "Qatar",        2, 0, "Group"),
    ("2022-11-29", "Iran",         "USA",          0, 1, "Group"),
    ("2022-11-29", "Wales",        "England",      0, 3, "Group"),
    ("2022-11-30", "Tunisia",      "France",       1, 0, "Group"),
    ("2022-11-30", "Australia",    "Denmark",      1, 0, "Group"),
    ("2022-11-30", "Poland",       "Argentina",    0, 2, "Group"),
    ("2022-11-30", "Saudi Arabia", "Mexico",       1, 2, "Group"),
    ("2022-12-01", "Croatia",      "Belgium",      0, 0, "Group"),
    ("2022-12-01", "Canada",       "Morocco",      1, 2, "Group"),
    ("2022-12-01", "Japan",        "Spain",        2, 1, "Group"),
    ("2022-12-01", "Costa Rica",   "Germany",      2, 4, "Group"),
    ("2022-12-02", "South Korea",  "Portugal",     2, 1, "Group"),
    ("2022-12-02", "Ghana",        "Uruguay",      0, 2, "Group"),
    ("2022-12-02", "Serbia",       "Switzerland",  2, 3, "Group"),
    ("2022-12-02", "Cameroon",     "Brazil",       1, 0, "Group"),
    # Round of 16
    ("2022-12-03", "Netherlands",  "USA",          3, 1, "R16"),
    ("2022-12-03", "Argentina",    "Australia",    2, 1, "R16"),
    ("2022-12-04", "France",       "Poland",       3, 1, "R16"),
    ("2022-12-04", "England",      "Senegal",      3, 0, "R16"),
    ("2022-12-05", "Japan",        "Croatia",      1, 1, "R16"),
    ("2022-12-05", "Brazil",       "South Korea",  4, 1, "R16"),
    ("2022-12-06", "Morocco",      "Spain",        0, 0, "R16"),
    ("2022-12-06", "Portugal",     "Switzerland",  6, 1, "R16"),
    # Quarter-finals
    ("2022-12-09", "Croatia",      "Brazil",       1, 1, "QF"),
    ("2022-12-09", "Netherlands",  "Argentina",    2, 2, "QF"),
    ("2022-12-10", "Morocco",      "Portugal",     1, 0, "QF"),
    ("2022-12-10", "England",      "France",       1, 2, "QF"),
    # Semi-finals
    ("2022-12-13", "Argentina",    "Croatia",      3, 0, "SF"),
    ("2022-12-14", "France",       "Morocco",      2, 0, "SF"),
    # 3rd place + Final
    ("2022-12-17", "Croatia",      "Morocco",      2, 1, "3P"),
    ("2022-12-18", "Argentina",    "France",       3, 3, "Final"),
]


# ---------------------------------------------------------------------------
# Euros 2024 Germany — 51 matches, neutral venues (Germany neutral for all
# games except its own matches at home, but tournament policy treats venues
# as neutral for ranking). We flag Germany games as non-neutral.
# ---------------------------------------------------------------------------
EURO2024: list[tuple[str, str, str, int, int, str]] = [
    # Group stage
    ("2024-06-14", "Germany",      "Scotland",     5, 1, "Group"),
    ("2024-06-15", "Hungary",      "Switzerland",  1, 3, "Group"),
    ("2024-06-15", "Spain",        "Croatia",      3, 0, "Group"),
    ("2024-06-15", "Italy",        "Albania",      2, 1, "Group"),
    ("2024-06-16", "Poland",       "Netherlands",  1, 2, "Group"),
    ("2024-06-16", "Slovenia",     "Denmark",      1, 1, "Group"),
    ("2024-06-16", "Serbia",       "England",      0, 1, "Group"),
    ("2024-06-17", "Romania",      "Ukraine",      3, 0, "Group"),
    ("2024-06-17", "Belgium",      "Slovakia",     0, 1, "Group"),
    ("2024-06-17", "Austria",      "France",       0, 1, "Group"),
    ("2024-06-18", "Türkiye",      "Georgia",      3, 1, "Group"),
    ("2024-06-18", "Portugal",     "Czechia",      2, 1, "Group"),
    ("2024-06-19", "Croatia",      "Albania",      2, 2, "Group"),
    ("2024-06-19", "Germany",      "Hungary",      2, 0, "Group"),
    ("2024-06-19", "Scotland",     "Switzerland",  1, 1, "Group"),
    ("2024-06-20", "Slovenia",     "Serbia",       1, 1, "Group"),
    ("2024-06-20", "Denmark",      "England",      1, 1, "Group"),
    ("2024-06-20", "Spain",        "Italy",        1, 0, "Group"),
    ("2024-06-21", "Slovakia",     "Ukraine",      1, 2, "Group"),
    ("2024-06-21", "Poland",       "Austria",      1, 3, "Group"),
    ("2024-06-21", "Netherlands",  "France",       0, 0, "Group"),
    ("2024-06-22", "Georgia",      "Czechia",      1, 1, "Group"),
    ("2024-06-22", "Türkiye",      "Portugal",     0, 3, "Group"),
    ("2024-06-22", "Belgium",      "Romania",      2, 0, "Group"),
    ("2024-06-23", "Switzerland",  "Germany",      1, 1, "Group"),
    ("2024-06-23", "Scotland",     "Hungary",      0, 1, "Group"),
    ("2024-06-24", "Albania",      "Spain",        0, 1, "Group"),
    ("2024-06-24", "Croatia",      "Italy",        1, 1, "Group"),
    ("2024-06-25", "Netherlands",  "Austria",      2, 3, "Group"),
    ("2024-06-25", "France",       "Poland",       1, 1, "Group"),
    ("2024-06-25", "England",      "Slovenia",     0, 0, "Group"),
    ("2024-06-25", "Denmark",      "Serbia",       0, 0, "Group"),
    ("2024-06-26", "Slovakia",     "Romania",      1, 1, "Group"),
    ("2024-06-26", "Ukraine",      "Belgium",      0, 0, "Group"),
    ("2024-06-26", "Czechia",      "Türkiye",      1, 2, "Group"),
    ("2024-06-26", "Georgia",      "Portugal",     2, 0, "Group"),
    # Round of 16
    ("2024-06-29", "Switzerland",  "Italy",        2, 0, "R16"),
    ("2024-06-29", "Germany",      "Denmark",      2, 0, "R16"),
    ("2024-06-30", "England",      "Slovakia",     2, 1, "R16"),
    ("2024-06-30", "Spain",        "Georgia",      4, 1, "R16"),
    ("2024-07-01", "France",       "Belgium",      1, 0, "R16"),
    ("2024-07-01", "Portugal",     "Slovenia",     0, 0, "R16"),
    ("2024-07-02", "Romania",      "Netherlands",  0, 3, "R16"),
    ("2024-07-02", "Austria",      "Türkiye",      1, 2, "R16"),
    # Quarter-finals
    ("2024-07-05", "Spain",        "Germany",      2, 1, "QF"),
    ("2024-07-05", "Portugal",     "France",       0, 0, "QF"),
    ("2024-07-06", "England",      "Switzerland",  1, 1, "QF"),
    ("2024-07-06", "Netherlands",  "Türkiye",      2, 1, "QF"),
    # Semi-finals
    ("2024-07-09", "Spain",        "France",       2, 1, "SF"),
    ("2024-07-10", "Netherlands",  "England",      1, 2, "SF"),
    # Final
    ("2024-07-14", "Spain",        "England",      2, 1, "Final"),
]


# ---------------------------------------------------------------------------
# Copa America 2024 USA — 32 matches, neutral venues (USA hosted)
# ---------------------------------------------------------------------------
COPA2024: list[tuple[str, str, str, int, int, str]] = [
    # Group stage
    ("2024-06-20", "Argentina",    "Canada",       2, 0, "Group"),
    ("2024-06-21", "Peru",         "Chile",        0, 0, "Group"),
    ("2024-06-22", "Ecuador",      "Venezuela",    1, 2, "Group"),
    ("2024-06-22", "Mexico",       "Jamaica",      1, 0, "Group"),
    ("2024-06-23", "USA",          "Bolivia",      2, 0, "Group"),
    ("2024-06-23", "Uruguay",      "Panama",       3, 1, "Group"),
    ("2024-06-24", "Colombia",     "Paraguay",     2, 1, "Group"),
    ("2024-06-24", "Brazil",       "Costa Rica",   0, 0, "Group"),
    ("2024-06-25", "Peru",         "Canada",       0, 1, "Group"),
    ("2024-06-25", "Chile",        "Argentina",    0, 1, "Group"),
    ("2024-06-26", "Ecuador",      "Jamaica",      3, 1, "Group"),
    ("2024-06-26", "Venezuela",    "Mexico",       1, 0, "Group"),
    ("2024-06-27", "Panama",       "USA",          2, 1, "Group"),
    ("2024-06-27", "Uruguay",      "Bolivia",      5, 0, "Group"),
    ("2024-06-28", "Colombia",     "Costa Rica",   3, 0, "Group"),
    ("2024-06-28", "Paraguay",     "Brazil",       1, 4, "Group"),
    ("2024-06-29", "Argentina",    "Peru",         2, 0, "Group"),
    ("2024-06-29", "Canada",       "Chile",        0, 0, "Group"),
    ("2024-06-30", "Mexico",       "Ecuador",      0, 0, "Group"),
    ("2024-06-30", "Jamaica",      "Venezuela",    0, 3, "Group"),
    ("2024-07-01", "USA",          "Uruguay",      0, 1, "Group"),
    ("2024-07-01", "Bolivia",      "Panama",       1, 3, "Group"),
    ("2024-07-02", "Brazil",       "Colombia",     1, 1, "Group"),
    ("2024-07-02", "Costa Rica",   "Paraguay",     2, 1, "Group"),
    # Quarter-finals
    ("2024-07-04", "Argentina",    "Ecuador",      1, 1, "QF"),
    ("2024-07-05", "Venezuela",    "Canada",       1, 1, "QF"),
    ("2024-07-06", "Colombia",     "Panama",       5, 0, "QF"),
    ("2024-07-06", "Uruguay",      "Brazil",       0, 0, "QF"),
    # Semi-finals
    ("2024-07-09", "Argentina",    "Canada",       2, 0, "SF"),
    ("2024-07-10", "Uruguay",      "Colombia",     0, 1, "SF"),
    # 3rd place + Final
    ("2024-07-13", "Canada",       "Uruguay",      2, 2, "3P"),
    ("2024-07-14", "Argentina",    "Colombia",     1, 0, "Final"),
]


# ---------------------------------------------------------------------------
# WC 1994 USA — 52 matches (24 teams, group + KO).
# Host: USA. Scores are 90 min (or full-time incl. ET where applicable;
# penalty shootouts treated as draws for goal-tally purposes).
# Source: FIFA / wikipedia public records.
# ---------------------------------------------------------------------------
WC1994: list[tuple[str, str, str, int, int, str]] = [
    # Group stage
    ("1994-06-17", "USA",           "Switzerland",   1, 1, "Group"),
    ("1994-06-17", "Germany",       "Bolivia",       1, 0, "Group"),
    ("1994-06-18", "Spain",         "South Korea",   2, 2, "Group"),
    ("1994-06-18", "Italy",         "Ireland",       0, 1, "Group"),
    ("1994-06-18", "Cameroon",      "Sweden",        2, 2, "Group"),
    ("1994-06-19", "Belgium",       "Morocco",       1, 0, "Group"),
    ("1994-06-19", "Brazil",        "Russia",        2, 0, "Group"),
    ("1994-06-19", "Norway",        "Mexico",        1, 0, "Group"),
    ("1994-06-20", "Colombia",      "Romania",       1, 3, "Group"),
    ("1994-06-21", "Netherlands",   "Saudi Arabia",  2, 1, "Group"),
    ("1994-06-21", "Argentina",     "Greece",        4, 0, "Group"),
    ("1994-06-21", "Nigeria",       "Bulgaria",      3, 0, "Group"),
    ("1994-06-22", "USA",           "Colombia",      2, 1, "Group"),
    ("1994-06-22", "Romania",       "Switzerland",   1, 4, "Group"),
    ("1994-06-23", "Italy",         "Norway",        1, 0, "Group"),
    ("1994-06-23", "Brazil",        "Cameroon",      3, 0, "Group"),
    ("1994-06-23", "Sweden",        "Russia",        3, 1, "Group"),
    ("1994-06-24", "Mexico",        "Ireland",       2, 1, "Group"),
    ("1994-06-24", "Belgium",       "Netherlands",   1, 0, "Group"),
    ("1994-06-25", "South Korea",   "Bolivia",       0, 0, "Group"),
    ("1994-06-25", "Germany",       "Spain",         1, 1, "Group"),
    ("1994-06-25", "Argentina",     "Nigeria",       2, 1, "Group"),
    ("1994-06-26", "Saudi Arabia",  "Morocco",       2, 1, "Group"),
    ("1994-06-26", "Greece",        "Bulgaria",      0, 4, "Group"),
    ("1994-06-27", "USA",           "Romania",       0, 1, "Group"),
    ("1994-06-27", "Switzerland",   "Colombia",      0, 2, "Group"),
    ("1994-06-28", "Italy",         "Mexico",        1, 1, "Group"),
    ("1994-06-28", "Ireland",       "Norway",        0, 0, "Group"),
    ("1994-06-28", "Brazil",        "Sweden",        1, 1, "Group"),
    ("1994-06-28", "Russia",        "Cameroon",      6, 1, "Group"),
    ("1994-06-29", "Belgium",       "Saudi Arabia",  0, 1, "Group"),
    ("1994-06-29", "Morocco",       "Netherlands",   1, 2, "Group"),
    ("1994-06-29", "Germany",       "South Korea",   3, 2, "Group"),
    ("1994-06-29", "Bolivia",       "Spain",         1, 3, "Group"),
    ("1994-06-30", "Argentina",     "Bulgaria",      0, 2, "Group"),
    ("1994-06-30", "Nigeria",       "Greece",        2, 0, "Group"),
    # Round of 16
    ("1994-07-02", "Germany",       "Belgium",       3, 2, "R16"),
    ("1994-07-02", "Spain",         "Switzerland",   3, 0, "R16"),
    ("1994-07-03", "Saudi Arabia",  "Sweden",        1, 3, "R16"),
    ("1994-07-03", "Romania",       "Argentina",     3, 2, "R16"),
    ("1994-07-04", "Netherlands",   "Ireland",       2, 0, "R16"),
    ("1994-07-04", "Brazil",        "USA",           1, 0, "R16"),
    ("1994-07-05", "Nigeria",       "Italy",         1, 2, "R16"),
    ("1994-07-05", "Mexico",        "Bulgaria",      1, 1, "R16"),
    # Quarter-finals
    ("1994-07-09", "Italy",         "Spain",         2, 1, "QF"),
    ("1994-07-09", "Netherlands",   "Brazil",        2, 3, "QF"),
    ("1994-07-10", "Bulgaria",      "Germany",       2, 1, "QF"),
    ("1994-07-10", "Romania",       "Sweden",        2, 2, "QF"),
    # Semi-finals
    ("1994-07-13", "Italy",         "Bulgaria",      2, 1, "SF"),
    ("1994-07-13", "Brazil",        "Sweden",        1, 0, "SF"),
    # 3rd place + Final
    ("1994-07-16", "Sweden",        "Bulgaria",      4, 0, "3P"),
    ("1994-07-17", "Brazil",        "Italy",         0, 0, "Final"),
]


# ---------------------------------------------------------------------------
# WC 1998 France — 64 matches (32 teams).
# ---------------------------------------------------------------------------
WC1998: list[tuple[str, str, str, int, int, str]] = [
    # Group stage
    ("1998-06-10", "Brazil",        "Scotland",      2, 1, "Group"),
    ("1998-06-10", "Morocco",       "Norway",        2, 2, "Group"),
    ("1998-06-11", "Italy",         "Chile",         2, 2, "Group"),
    ("1998-06-11", "Cameroon",      "Austria",       1, 1, "Group"),
    ("1998-06-12", "France",        "South Africa",  3, 0, "Group"),
    ("1998-06-12", "Saudi Arabia",  "Denmark",       0, 1, "Group"),
    ("1998-06-13", "Paraguay",      "Bulgaria",      0, 0, "Group"),
    ("1998-06-13", "Spain",         "Nigeria",       2, 3, "Group"),
    ("1998-06-13", "South Korea",   "Mexico",        1, 3, "Group"),
    ("1998-06-14", "Netherlands",   "Belgium",       0, 0, "Group"),
    ("1998-06-14", "Yugoslavia",    "Iran",          1, 0, "Group"),
    ("1998-06-14", "Germany",       "USA",           2, 0, "Group"),
    ("1998-06-15", "Romania",       "Colombia",      1, 0, "Group"),
    ("1998-06-15", "England",       "Tunisia",       2, 0, "Group"),
    ("1998-06-15", "Argentina",     "Japan",         1, 0, "Group"),
    ("1998-06-16", "Jamaica",       "Croatia",       1, 3, "Group"),
    ("1998-06-16", "Italy",         "Cameroon",      3, 0, "Group"),
    ("1998-06-16", "Austria",       "Chile",         1, 1, "Group"),
    ("1998-06-17", "Scotland",      "Norway",        1, 1, "Group"),
    ("1998-06-17", "Brazil",        "Morocco",       3, 0, "Group"),
    ("1998-06-18", "France",        "Saudi Arabia",  4, 0, "Group"),
    ("1998-06-18", "Denmark",       "South Africa",  1, 1, "Group"),
    ("1998-06-18", "Nigeria",       "Bulgaria",      1, 0, "Group"),
    ("1998-06-19", "Spain",         "Paraguay",      0, 0, "Group"),
    ("1998-06-19", "Belgium",       "Mexico",        2, 2, "Group"),
    ("1998-06-20", "Netherlands",   "South Korea",   5, 0, "Group"),
    ("1998-06-20", "Yugoslavia",    "Germany",       2, 2, "Group"),
    ("1998-06-21", "USA",           "Iran",          1, 2, "Group"),
    ("1998-06-21", "Colombia",      "Tunisia",       1, 0, "Group"),
    ("1998-06-22", "Romania",       "England",       2, 1, "Group"),
    ("1998-06-22", "Argentina",     "Jamaica",       5, 0, "Group"),
    ("1998-06-22", "Japan",         "Croatia",       0, 1, "Group"),
    ("1998-06-23", "Chile",         "Cameroon",      1, 1, "Group"),
    ("1998-06-23", "Italy",         "Austria",       2, 1, "Group"),
    ("1998-06-23", "Norway",        "Brazil",        2, 1, "Group"),
    ("1998-06-23", "Scotland",      "Morocco",       0, 3, "Group"),
    ("1998-06-24", "South Africa",  "Saudi Arabia",  2, 2, "Group"),
    ("1998-06-24", "France",        "Denmark",       2, 1, "Group"),
    ("1998-06-24", "Nigeria",       "Paraguay",      1, 3, "Group"),
    ("1998-06-24", "Spain",         "Bulgaria",      6, 1, "Group"),
    ("1998-06-25", "Belgium",       "South Korea",   1, 1, "Group"),
    ("1998-06-25", "Netherlands",   "Mexico",        2, 2, "Group"),
    ("1998-06-25", "USA",           "Yugoslavia",    0, 1, "Group"),
    ("1998-06-25", "Germany",       "Iran",          2, 0, "Group"),
    ("1998-06-26", "Romania",       "Tunisia",       1, 1, "Group"),
    ("1998-06-26", "Colombia",      "England",       0, 2, "Group"),
    ("1998-06-26", "Argentina",     "Croatia",       1, 0, "Group"),
    ("1998-06-26", "Japan",         "Jamaica",       1, 2, "Group"),
    # Round of 16
    ("1998-06-27", "Italy",         "Norway",        1, 0, "R16"),
    ("1998-06-27", "Brazil",        "Chile",         4, 1, "R16"),
    ("1998-06-28", "France",        "Paraguay",      1, 0, "R16"),
    ("1998-06-28", "Nigeria",       "Denmark",       1, 4, "R16"),
    ("1998-06-29", "Germany",       "Mexico",        2, 1, "R16"),
    ("1998-06-29", "Netherlands",   "Yugoslavia",    2, 1, "R16"),
    ("1998-06-30", "Romania",       "Croatia",       0, 1, "R16"),
    ("1998-06-30", "Argentina",     "England",       2, 2, "R16"),
    # Quarter-finals
    ("1998-07-03", "Italy",         "France",        0, 0, "QF"),
    ("1998-07-03", "Brazil",        "Denmark",       3, 2, "QF"),
    ("1998-07-04", "Netherlands",   "Argentina",     2, 1, "QF"),
    ("1998-07-04", "Germany",       "Croatia",       0, 3, "QF"),
    # Semi-finals
    ("1998-07-07", "Brazil",        "Netherlands",   1, 1, "SF"),
    ("1998-07-08", "France",        "Croatia",       2, 1, "SF"),
    # 3rd place + Final
    ("1998-07-11", "Netherlands",   "Croatia",       1, 2, "3P"),
    ("1998-07-12", "Brazil",        "France",        0, 3, "Final"),
]


# ---------------------------------------------------------------------------
# WC 2002 Korea/Japan — 64 matches. Two co-hosts: South Korea + Japan.
# ---------------------------------------------------------------------------
WC2002: list[tuple[str, str, str, int, int, str]] = [
    # Group stage
    ("2002-05-31", "France",        "Senegal",       0, 1, "Group"),
    ("2002-06-01", "Ireland",       "Cameroon",      1, 1, "Group"),
    ("2002-06-01", "Uruguay",       "Denmark",       1, 2, "Group"),
    ("2002-06-01", "Germany",       "Saudi Arabia",  8, 0, "Group"),
    ("2002-06-02", "Argentina",     "Nigeria",       1, 0, "Group"),
    ("2002-06-02", "England",       "Sweden",        1, 1, "Group"),
    ("2002-06-02", "Paraguay",      "South Africa",  2, 2, "Group"),
    ("2002-06-02", "Spain",         "Slovenia",      3, 1, "Group"),
    ("2002-06-03", "Croatia",       "Mexico",        0, 1, "Group"),
    ("2002-06-03", "Brazil",        "Turkey",        2, 1, "Group"),
    ("2002-06-03", "Italy",         "Ecuador",       2, 0, "Group"),
    ("2002-06-04", "China",         "Costa Rica",    0, 2, "Group"),
    ("2002-06-04", "Japan",         "Belgium",       2, 2, "Group"),
    ("2002-06-04", "South Korea",   "Poland",        2, 0, "Group"),
    ("2002-06-04", "USA",           "Portugal",      3, 2, "Group"),
    ("2002-06-05", "Russia",        "Tunisia",       2, 0, "Group"),
    ("2002-06-05", "France",        "Uruguay",       0, 0, "Group"),
    ("2002-06-05", "Denmark",       "Senegal",       1, 1, "Group"),
    ("2002-06-05", "Germany",       "Ireland",       1, 1, "Group"),
    ("2002-06-06", "Cameroon",      "Saudi Arabia",  1, 0, "Group"),
    ("2002-06-06", "Sweden",        "Nigeria",       2, 1, "Group"),
    ("2002-06-06", "Spain",         "Paraguay",      3, 1, "Group"),
    ("2002-06-07", "Argentina",     "England",       0, 1, "Group"),
    ("2002-06-07", "South Africa",  "Slovenia",      1, 0, "Group"),
    ("2002-06-07", "Italy",         "Croatia",       1, 2, "Group"),
    ("2002-06-08", "Brazil",        "China",         4, 0, "Group"),
    ("2002-06-08", "Mexico",        "Ecuador",       2, 1, "Group"),
    ("2002-06-08", "Costa Rica",    "Turkey",        1, 1, "Group"),
    ("2002-06-08", "Japan",         "Russia",        1, 0, "Group"),
    ("2002-06-09", "South Korea",   "USA",           1, 1, "Group"),
    ("2002-06-09", "Tunisia",       "Belgium",       1, 1, "Group"),
    ("2002-06-10", "Portugal",      "Poland",        4, 0, "Group"),
    ("2002-06-10", "Denmark",       "France",        2, 0, "Group"),
    ("2002-06-10", "Senegal",       "Uruguay",       3, 3, "Group"),
    ("2002-06-11", "Cameroon",      "Germany",       0, 2, "Group"),
    ("2002-06-11", "Saudi Arabia",  "Ireland",       0, 3, "Group"),
    ("2002-06-11", "Sweden",        "Argentina",     1, 1, "Group"),
    ("2002-06-11", "Nigeria",       "England",       0, 0, "Group"),
    ("2002-06-12", "South Africa",  "Spain",         2, 3, "Group"),
    ("2002-06-12", "Slovenia",      "Paraguay",      1, 3, "Group"),
    ("2002-06-12", "Mexico",        "Italy",         1, 1, "Group"),
    ("2002-06-12", "Ecuador",       "Croatia",       1, 0, "Group"),
    ("2002-06-13", "Costa Rica",    "Brazil",        2, 5, "Group"),
    ("2002-06-13", "Turkey",        "China",         3, 0, "Group"),
    ("2002-06-13", "Belgium",       "Russia",        3, 2, "Group"),
    ("2002-06-13", "Tunisia",       "Japan",         0, 2, "Group"),
    ("2002-06-14", "Portugal",      "South Korea",   0, 1, "Group"),
    ("2002-06-14", "Poland",        "USA",           3, 1, "Group"),
    # Round of 16
    ("2002-06-15", "Germany",       "Paraguay",      1, 0, "R16"),
    ("2002-06-15", "Denmark",       "England",       0, 3, "R16"),
    ("2002-06-16", "Sweden",        "Senegal",       1, 2, "R16"),
    ("2002-06-16", "Spain",         "Ireland",       1, 1, "R16"),
    ("2002-06-17", "Mexico",        "USA",           0, 2, "R16"),
    ("2002-06-17", "Brazil",        "Belgium",       2, 0, "R16"),
    ("2002-06-18", "Japan",         "Turkey",        0, 1, "R16"),
    ("2002-06-18", "South Korea",   "Italy",         2, 1, "R16"),
    # Quarter-finals
    ("2002-06-21", "England",       "Brazil",        1, 2, "QF"),
    ("2002-06-21", "Germany",       "USA",           1, 0, "QF"),
    ("2002-06-22", "Spain",         "South Korea",   0, 0, "QF"),
    ("2002-06-22", "Senegal",       "Turkey",        0, 1, "QF"),
    # Semi-finals
    ("2002-06-25", "Germany",       "South Korea",   1, 0, "SF"),
    ("2002-06-26", "Brazil",        "Turkey",        1, 0, "SF"),
    # 3rd place + Final
    ("2002-06-29", "South Korea",   "Turkey",        2, 3, "3P"),
    ("2002-06-30", "Germany",       "Brazil",        0, 2, "Final"),
]


# ---------------------------------------------------------------------------
# WC 2006 Germany — 64 matches.
# ---------------------------------------------------------------------------
WC2006: list[tuple[str, str, str, int, int, str]] = [
    # Group stage
    ("2006-06-09", "Germany",       "Costa Rica",    4, 2, "Group"),
    ("2006-06-09", "Poland",        "Ecuador",       0, 2, "Group"),
    ("2006-06-10", "England",       "Paraguay",      1, 0, "Group"),
    ("2006-06-10", "Trinidad and Tobago", "Sweden",  0, 0, "Group"),
    ("2006-06-10", "Argentina",     "Côte d'Ivoire", 2, 1, "Group"),
    ("2006-06-11", "Serbia and Montenegro", "Netherlands", 0, 1, "Group"),
    ("2006-06-11", "Mexico",        "Iran",          3, 1, "Group"),
    ("2006-06-11", "Angola",        "Portugal",      0, 1, "Group"),
    ("2006-06-12", "Australia",     "Japan",         3, 1, "Group"),
    ("2006-06-12", "USA",           "Czech Republic",0, 3, "Group"),
    ("2006-06-12", "Italy",         "Ghana",         2, 0, "Group"),
    ("2006-06-13", "South Korea",   "Togo",          2, 1, "Group"),
    ("2006-06-13", "France",        "Switzerland",   0, 0, "Group"),
    ("2006-06-13", "Brazil",        "Croatia",       1, 0, "Group"),
    ("2006-06-14", "Spain",         "Ukraine",       4, 0, "Group"),
    ("2006-06-14", "Tunisia",       "Saudi Arabia",  2, 2, "Group"),
    ("2006-06-14", "Germany",       "Poland",        1, 0, "Group"),
    ("2006-06-15", "Ecuador",       "Costa Rica",    3, 0, "Group"),
    ("2006-06-15", "England",       "Trinidad and Tobago", 2, 0, "Group"),
    ("2006-06-15", "Sweden",        "Paraguay",      1, 0, "Group"),
    ("2006-06-16", "Argentina",     "Serbia and Montenegro", 6, 0, "Group"),
    ("2006-06-16", "Netherlands",   "Côte d'Ivoire", 2, 1, "Group"),
    ("2006-06-16", "Mexico",        "Angola",        0, 0, "Group"),
    ("2006-06-17", "Portugal",      "Iran",          2, 0, "Group"),
    ("2006-06-17", "Czech Republic","Ghana",         0, 2, "Group"),
    ("2006-06-17", "Italy",         "USA",           1, 1, "Group"),
    ("2006-06-18", "Japan",         "Croatia",       0, 0, "Group"),
    ("2006-06-18", "Brazil",        "Australia",     2, 0, "Group"),
    ("2006-06-18", "France",        "South Korea",   1, 1, "Group"),
    ("2006-06-19", "Togo",          "Switzerland",   0, 2, "Group"),
    ("2006-06-19", "Saudi Arabia",  "Ukraine",       0, 4, "Group"),
    ("2006-06-19", "Spain",         "Tunisia",       3, 1, "Group"),
    ("2006-06-20", "Ecuador",       "Germany",       0, 3, "Group"),
    ("2006-06-20", "Costa Rica",    "Poland",        1, 2, "Group"),
    ("2006-06-20", "Paraguay",      "Trinidad and Tobago", 2, 0, "Group"),
    ("2006-06-20", "Sweden",        "England",       2, 2, "Group"),
    ("2006-06-21", "Netherlands",   "Argentina",     0, 0, "Group"),
    ("2006-06-21", "Côte d'Ivoire", "Serbia and Montenegro", 3, 2, "Group"),
    ("2006-06-21", "Portugal",      "Mexico",        2, 1, "Group"),
    ("2006-06-21", "Iran",          "Angola",        1, 1, "Group"),
    ("2006-06-22", "Czech Republic","Italy",         0, 2, "Group"),
    ("2006-06-22", "Ghana",         "USA",           2, 1, "Group"),
    ("2006-06-22", "Japan",         "Brazil",        1, 4, "Group"),
    ("2006-06-22", "Croatia",       "Australia",     2, 2, "Group"),
    ("2006-06-23", "Togo",          "France",        0, 2, "Group"),
    ("2006-06-23", "Switzerland",   "South Korea",   2, 0, "Group"),
    ("2006-06-23", "Saudi Arabia",  "Spain",         0, 1, "Group"),
    ("2006-06-23", "Ukraine",       "Tunisia",       1, 0, "Group"),
    # Round of 16
    ("2006-06-24", "Germany",       "Sweden",        2, 0, "R16"),
    ("2006-06-24", "Argentina",     "Mexico",        2, 1, "R16"),
    ("2006-06-25", "England",       "Ecuador",       1, 0, "R16"),
    ("2006-06-25", "Portugal",      "Netherlands",   1, 0, "R16"),
    ("2006-06-26", "Italy",         "Australia",     1, 0, "R16"),
    ("2006-06-26", "Switzerland",   "Ukraine",       0, 0, "R16"),
    ("2006-06-27", "Brazil",        "Ghana",         3, 0, "R16"),
    ("2006-06-27", "Spain",         "France",        1, 3, "R16"),
    # Quarter-finals
    ("2006-06-30", "Germany",       "Argentina",     1, 1, "QF"),
    ("2006-06-30", "Italy",         "Ukraine",       3, 0, "QF"),
    ("2006-07-01", "England",       "Portugal",      0, 0, "QF"),
    ("2006-07-01", "Brazil",        "France",        0, 1, "QF"),
    # Semi-finals
    ("2006-07-04", "Germany",       "Italy",         0, 2, "SF"),
    ("2006-07-05", "Portugal",      "France",        0, 1, "SF"),
    # 3rd place + Final
    ("2006-07-08", "Germany",       "Portugal",      3, 1, "3P"),
    ("2006-07-09", "Italy",         "France",        1, 1, "Final"),
]


# ---------------------------------------------------------------------------
# WC 2010 South Africa — 64 matches.
# ---------------------------------------------------------------------------
WC2010: list[tuple[str, str, str, int, int, str]] = [
    # Group stage
    ("2010-06-11", "South Africa",  "Mexico",        1, 1, "Group"),
    ("2010-06-11", "Uruguay",       "France",        0, 0, "Group"),
    ("2010-06-12", "South Korea",   "Greece",        2, 0, "Group"),
    ("2010-06-12", "Argentina",     "Nigeria",       1, 0, "Group"),
    ("2010-06-12", "England",       "USA",           1, 1, "Group"),
    ("2010-06-13", "Algeria",       "Slovenia",      0, 1, "Group"),
    ("2010-06-13", "Serbia",        "Ghana",         0, 1, "Group"),
    ("2010-06-13", "Germany",       "Australia",     4, 0, "Group"),
    ("2010-06-14", "Netherlands",   "Denmark",       2, 0, "Group"),
    ("2010-06-14", "Japan",         "Cameroon",      1, 0, "Group"),
    ("2010-06-14", "Italy",         "Paraguay",      1, 1, "Group"),
    ("2010-06-15", "New Zealand",   "Slovakia",      1, 1, "Group"),
    ("2010-06-15", "Côte d'Ivoire", "Portugal",      0, 0, "Group"),
    ("2010-06-15", "Brazil",        "North Korea",   2, 1, "Group"),
    ("2010-06-16", "Honduras",      "Chile",         0, 1, "Group"),
    ("2010-06-16", "Spain",         "Switzerland",   0, 1, "Group"),
    ("2010-06-16", "South Africa",  "Uruguay",       0, 3, "Group"),
    ("2010-06-17", "Argentina",     "South Korea",   4, 1, "Group"),
    ("2010-06-17", "Greece",        "Nigeria",       2, 1, "Group"),
    ("2010-06-17", "France",        "Mexico",        0, 2, "Group"),
    ("2010-06-18", "Germany",       "Serbia",        0, 1, "Group"),
    ("2010-06-18", "Slovenia",      "USA",           2, 2, "Group"),
    ("2010-06-18", "England",       "Algeria",       0, 0, "Group"),
    ("2010-06-19", "Netherlands",   "Japan",         1, 0, "Group"),
    ("2010-06-19", "Ghana",         "Australia",     1, 1, "Group"),
    ("2010-06-19", "Cameroon",      "Denmark",       1, 2, "Group"),
    ("2010-06-20", "Slovakia",      "Paraguay",      0, 2, "Group"),
    ("2010-06-20", "Italy",         "New Zealand",   1, 1, "Group"),
    ("2010-06-20", "Brazil",        "Côte d'Ivoire", 3, 1, "Group"),
    ("2010-06-21", "Portugal",      "North Korea",   7, 0, "Group"),
    ("2010-06-21", "Chile",         "Switzerland",   1, 0, "Group"),
    ("2010-06-21", "Spain",         "Honduras",      2, 0, "Group"),
    ("2010-06-22", "Mexico",        "Uruguay",       0, 1, "Group"),
    ("2010-06-22", "France",        "South Africa",  1, 2, "Group"),
    ("2010-06-22", "Nigeria",       "South Korea",   2, 2, "Group"),
    ("2010-06-22", "Greece",        "Argentina",     0, 2, "Group"),
    ("2010-06-23", "Slovenia",      "England",       0, 1, "Group"),
    ("2010-06-23", "USA",           "Algeria",       1, 0, "Group"),
    ("2010-06-23", "Ghana",         "Germany",       0, 1, "Group"),
    ("2010-06-23", "Australia",     "Serbia",        2, 1, "Group"),
    ("2010-06-24", "Slovakia",      "Italy",         3, 2, "Group"),
    ("2010-06-24", "Paraguay",      "New Zealand",   0, 0, "Group"),
    ("2010-06-24", "Denmark",       "Japan",         1, 3, "Group"),
    ("2010-06-24", "Cameroon",      "Netherlands",   1, 2, "Group"),
    ("2010-06-25", "Portugal",      "Brazil",        0, 0, "Group"),
    ("2010-06-25", "North Korea",   "Côte d'Ivoire", 0, 3, "Group"),
    ("2010-06-25", "Chile",         "Spain",         1, 2, "Group"),
    ("2010-06-25", "Switzerland",   "Honduras",      0, 0, "Group"),
    # Round of 16
    ("2010-06-26", "Uruguay",       "South Korea",   2, 1, "R16"),
    ("2010-06-26", "USA",           "Ghana",         1, 2, "R16"),
    ("2010-06-27", "Germany",       "England",       4, 1, "R16"),
    ("2010-06-27", "Argentina",     "Mexico",        3, 1, "R16"),
    ("2010-06-28", "Netherlands",   "Slovakia",      2, 1, "R16"),
    ("2010-06-28", "Brazil",        "Chile",         3, 0, "R16"),
    ("2010-06-29", "Paraguay",      "Japan",         0, 0, "R16"),
    ("2010-06-29", "Spain",         "Portugal",      1, 0, "R16"),
    # Quarter-finals
    ("2010-07-02", "Netherlands",   "Brazil",        2, 1, "QF"),
    ("2010-07-02", "Uruguay",       "Ghana",         1, 1, "QF"),
    ("2010-07-03", "Argentina",     "Germany",       0, 4, "QF"),
    ("2010-07-03", "Paraguay",      "Spain",         0, 1, "QF"),
    # Semi-finals
    ("2010-07-06", "Uruguay",       "Netherlands",   2, 3, "SF"),
    ("2010-07-07", "Germany",       "Spain",         0, 1, "SF"),
    # 3rd place + Final
    ("2010-07-10", "Uruguay",       "Germany",       2, 3, "3P"),
    ("2010-07-11", "Netherlands",   "Spain",         0, 1, "Final"),
]


# ---------------------------------------------------------------------------
# WC 2014 Brazil — 64 matches.
# ---------------------------------------------------------------------------
WC2014: list[tuple[str, str, str, int, int, str]] = [
    # Group stage
    ("2014-06-12", "Brazil",        "Croatia",       3, 1, "Group"),
    ("2014-06-13", "Mexico",        "Cameroon",      1, 0, "Group"),
    ("2014-06-13", "Spain",         "Netherlands",   1, 5, "Group"),
    ("2014-06-13", "Chile",         "Australia",     3, 1, "Group"),
    ("2014-06-14", "Colombia",      "Greece",        3, 0, "Group"),
    ("2014-06-14", "Uruguay",       "Costa Rica",    1, 3, "Group"),
    ("2014-06-14", "England",       "Italy",         1, 2, "Group"),
    ("2014-06-14", "Côte d'Ivoire", "Japan",         2, 1, "Group"),
    ("2014-06-15", "Switzerland",   "Ecuador",       2, 1, "Group"),
    ("2014-06-15", "France",        "Honduras",      3, 0, "Group"),
    ("2014-06-15", "Argentina",     "Bosnia and Herzegovina", 2, 1, "Group"),
    ("2014-06-16", "Germany",       "Portugal",      4, 0, "Group"),
    ("2014-06-16", "Iran",          "Nigeria",       0, 0, "Group"),
    ("2014-06-16", "Ghana",         "USA",           1, 2, "Group"),
    ("2014-06-17", "Belgium",       "Algeria",       2, 1, "Group"),
    ("2014-06-17", "Brazil",        "Mexico",        0, 0, "Group"),
    ("2014-06-17", "Russia",        "South Korea",   1, 1, "Group"),
    ("2014-06-18", "Australia",     "Netherlands",   2, 3, "Group"),
    ("2014-06-18", "Spain",         "Chile",         0, 2, "Group"),
    ("2014-06-18", "Cameroon",      "Croatia",       0, 4, "Group"),
    ("2014-06-19", "Colombia",      "Côte d'Ivoire", 2, 1, "Group"),
    ("2014-06-19", "Uruguay",       "England",       2, 1, "Group"),
    ("2014-06-19", "Japan",         "Greece",        0, 0, "Group"),
    ("2014-06-20", "Italy",         "Costa Rica",    0, 1, "Group"),
    ("2014-06-20", "Switzerland",   "France",        2, 5, "Group"),
    ("2014-06-20", "Honduras",      "Ecuador",       1, 2, "Group"),
    ("2014-06-21", "Argentina",     "Iran",          1, 0, "Group"),
    ("2014-06-21", "Germany",       "Ghana",         2, 2, "Group"),
    ("2014-06-21", "Nigeria",       "Bosnia and Herzegovina", 1, 0, "Group"),
    ("2014-06-22", "Belgium",       "Russia",        1, 0, "Group"),
    ("2014-06-22", "South Korea",   "Algeria",       2, 4, "Group"),
    ("2014-06-22", "USA",           "Portugal",      2, 2, "Group"),
    ("2014-06-23", "Netherlands",   "Chile",         2, 0, "Group"),
    ("2014-06-23", "Australia",     "Spain",         0, 3, "Group"),
    ("2014-06-23", "Croatia",       "Mexico",        1, 3, "Group"),
    ("2014-06-23", "Cameroon",      "Brazil",        1, 4, "Group"),
    ("2014-06-24", "Italy",         "Uruguay",       0, 1, "Group"),
    ("2014-06-24", "Costa Rica",    "England",       0, 0, "Group"),
    ("2014-06-24", "Japan",         "Colombia",      1, 4, "Group"),
    ("2014-06-24", "Greece",        "Côte d'Ivoire", 2, 1, "Group"),
    ("2014-06-25", "Nigeria",       "Argentina",     2, 3, "Group"),
    ("2014-06-25", "Bosnia and Herzegovina", "Iran", 3, 1, "Group"),
    ("2014-06-25", "Honduras",      "Switzerland",   0, 3, "Group"),
    ("2014-06-25", "Ecuador",       "France",        0, 0, "Group"),
    ("2014-06-26", "USA",           "Germany",       0, 1, "Group"),
    ("2014-06-26", "Portugal",      "Ghana",         2, 1, "Group"),
    ("2014-06-26", "South Korea",   "Belgium",       0, 1, "Group"),
    ("2014-06-26", "Algeria",       "Russia",        1, 1, "Group"),
    # Round of 16
    ("2014-06-28", "Brazil",        "Chile",         1, 1, "R16"),
    ("2014-06-28", "Colombia",      "Uruguay",       2, 0, "R16"),
    ("2014-06-29", "Netherlands",   "Mexico",        2, 1, "R16"),
    ("2014-06-29", "Costa Rica",    "Greece",        1, 1, "R16"),
    ("2014-06-30", "France",        "Nigeria",       2, 0, "R16"),
    ("2014-06-30", "Germany",       "Algeria",       2, 1, "R16"),
    ("2014-07-01", "Argentina",     "Switzerland",   1, 0, "R16"),
    ("2014-07-01", "Belgium",       "USA",           2, 1, "R16"),
    # Quarter-finals
    ("2014-07-04", "France",        "Germany",       0, 1, "QF"),
    ("2014-07-04", "Brazil",        "Colombia",      2, 1, "QF"),
    ("2014-07-05", "Argentina",     "Belgium",       1, 0, "QF"),
    ("2014-07-05", "Netherlands",   "Costa Rica",    0, 0, "QF"),
    # Semi-finals
    ("2014-07-08", "Brazil",        "Germany",       1, 7, "SF"),
    ("2014-07-09", "Netherlands",   "Argentina",     0, 0, "SF"),
    # 3rd place + Final
    ("2014-07-12", "Brazil",        "Netherlands",   0, 3, "3P"),
    ("2014-07-13", "Germany",       "Argentina",     1, 0, "Final"),
]


# ---------------------------------------------------------------------------
# WC 2018 Russia — 64 matches.
# ---------------------------------------------------------------------------
WC2018: list[tuple[str, str, str, int, int, str]] = [
    # Group stage
    ("2018-06-14", "Russia",        "Saudi Arabia",  5, 0, "Group"),
    ("2018-06-15", "Egypt",         "Uruguay",       0, 1, "Group"),
    ("2018-06-15", "Morocco",       "Iran",          0, 1, "Group"),
    ("2018-06-15", "Portugal",      "Spain",         3, 3, "Group"),
    ("2018-06-16", "France",        "Australia",     2, 1, "Group"),
    ("2018-06-16", "Argentina",     "Iceland",       1, 1, "Group"),
    ("2018-06-16", "Peru",          "Denmark",       0, 1, "Group"),
    ("2018-06-16", "Croatia",       "Nigeria",       2, 0, "Group"),
    ("2018-06-17", "Costa Rica",    "Serbia",        0, 1, "Group"),
    ("2018-06-17", "Germany",       "Mexico",        0, 1, "Group"),
    ("2018-06-17", "Brazil",        "Switzerland",   1, 1, "Group"),
    ("2018-06-18", "Sweden",        "South Korea",   1, 0, "Group"),
    ("2018-06-18", "Belgium",       "Panama",        3, 0, "Group"),
    ("2018-06-18", "Tunisia",       "England",       1, 2, "Group"),
    ("2018-06-19", "Colombia",      "Japan",         1, 2, "Group"),
    ("2018-06-19", "Poland",        "Senegal",       1, 2, "Group"),
    ("2018-06-19", "Russia",        "Egypt",         3, 1, "Group"),
    ("2018-06-20", "Portugal",      "Morocco",       1, 0, "Group"),
    ("2018-06-20", "Uruguay",       "Saudi Arabia",  1, 0, "Group"),
    ("2018-06-20", "Iran",          "Spain",         0, 1, "Group"),
    ("2018-06-21", "Denmark",       "Australia",     1, 1, "Group"),
    ("2018-06-21", "France",        "Peru",          1, 0, "Group"),
    ("2018-06-21", "Argentina",     "Croatia",       0, 3, "Group"),
    ("2018-06-22", "Brazil",        "Costa Rica",    2, 0, "Group"),
    ("2018-06-22", "Nigeria",       "Iceland",       2, 0, "Group"),
    ("2018-06-22", "Serbia",        "Switzerland",   1, 2, "Group"),
    ("2018-06-23", "Belgium",       "Tunisia",       5, 2, "Group"),
    ("2018-06-23", "South Korea",   "Mexico",        1, 2, "Group"),
    ("2018-06-23", "Germany",       "Sweden",        2, 1, "Group"),
    ("2018-06-24", "England",       "Panama",        6, 1, "Group"),
    ("2018-06-24", "Japan",         "Senegal",       2, 2, "Group"),
    ("2018-06-24", "Poland",        "Colombia",      0, 3, "Group"),
    ("2018-06-25", "Uruguay",       "Russia",        3, 0, "Group"),
    ("2018-06-25", "Saudi Arabia",  "Egypt",         2, 1, "Group"),
    ("2018-06-25", "Iran",          "Portugal",      1, 1, "Group"),
    ("2018-06-25", "Spain",         "Morocco",       2, 2, "Group"),
    ("2018-06-26", "Denmark",       "France",        0, 0, "Group"),
    ("2018-06-26", "Australia",     "Peru",          0, 2, "Group"),
    ("2018-06-26", "Nigeria",       "Argentina",     1, 2, "Group"),
    ("2018-06-26", "Iceland",       "Croatia",       1, 2, "Group"),
    ("2018-06-27", "Mexico",        "Sweden",        0, 3, "Group"),
    ("2018-06-27", "South Korea",   "Germany",       2, 0, "Group"),
    ("2018-06-27", "Serbia",        "Brazil",        0, 2, "Group"),
    ("2018-06-27", "Switzerland",   "Costa Rica",    2, 2, "Group"),
    ("2018-06-28", "Japan",         "Poland",        0, 1, "Group"),
    ("2018-06-28", "Senegal",       "Colombia",      0, 1, "Group"),
    ("2018-06-28", "England",       "Belgium",       0, 1, "Group"),
    ("2018-06-28", "Panama",        "Tunisia",       1, 2, "Group"),
    # Round of 16
    ("2018-06-30", "France",        "Argentina",     4, 3, "R16"),
    ("2018-06-30", "Uruguay",       "Portugal",      2, 1, "R16"),
    ("2018-07-01", "Spain",         "Russia",        1, 1, "R16"),
    ("2018-07-01", "Croatia",       "Denmark",       1, 1, "R16"),
    ("2018-07-02", "Brazil",        "Mexico",        2, 0, "R16"),
    ("2018-07-02", "Belgium",       "Japan",         3, 2, "R16"),
    ("2018-07-03", "Sweden",        "Switzerland",   1, 0, "R16"),
    ("2018-07-03", "Colombia",      "England",       1, 1, "R16"),
    # Quarter-finals
    ("2018-07-06", "Uruguay",       "France",        0, 2, "QF"),
    ("2018-07-06", "Brazil",        "Belgium",       1, 2, "QF"),
    ("2018-07-07", "Sweden",        "England",       0, 2, "QF"),
    ("2018-07-07", "Russia",        "Croatia",       2, 2, "QF"),
    # Semi-finals
    ("2018-07-10", "France",        "Belgium",       1, 0, "SF"),
    ("2018-07-11", "Croatia",       "England",       2, 1, "SF"),
    # 3rd place + Final
    ("2018-07-14", "Belgium",       "England",       2, 0, "3P"),
    ("2018-07-15", "France",        "Croatia",       4, 2, "Final"),
]


# WC2026 MD1 pairings — kept in sync with wc2026_fetch_results.py::NEXT_12
# but applied here as the "first 12" already on disk in wc2026_results.json.
_WC2026_MD1_PAIRINGS: dict[str, tuple[str, str]] = {
    "1":  ("Mexico",      "Canada"),
    "2":  ("USA",         "Honduras"),
    "3":  ("Argentina",   "Uruguay"),
    "4":  ("France",      "Belgium"),
    "5":  ("England",     "Wales"),
    "6":  ("Portugal",    "Spain"),
    "7":  ("Brazil",      "Colombia"),
    "8":  ("Germany",     "Italy"),
    "9":  ("Netherlands", "Croatia"),
    "10": ("Japan",       "South Korea"),
    "11": ("Morocco",     "Senegal"),
    "12": ("Ecuador",     "Peru"),
}


def _to_matches(
    rows: list[tuple[str, str, str, int, int, str]],
    competition: str,
    *,
    home_country_for_non_neutral: str | None = None,
) -> list[Match]:
    """Convert raw tuples into Match records.

    All matches are neutral by default. If `home_country_for_non_neutral` is
    set, any match where that nation is the listed home side is flagged
    non-neutral (host advantage).
    """
    out: list[Match] = []
    for date, home, away, hg, ag, stage in rows:
        neutral = True
        if home_country_for_non_neutral and home == home_country_for_non_neutral:
            neutral = False
        out.append(Match(
            date=date,
            home=home,
            away=away,
            hg=int(hg),
            ag=int(ag),
            neutral=neutral,
            competition=competition,
            stage=stage,
        ))
    return out


def load_all() -> list[Match]:
    """Load all hardcoded historical matches across the three tournaments."""
    matches: list[Match] = []
    # WC 2022 Qatar — Qatar hosted (host = non-neutral for Qatar)
    matches.extend(_to_matches(
        WC2022, "WC2022", home_country_for_non_neutral="Qatar",
    ))
    # Euros 2024 Germany — Germany hosted
    matches.extend(_to_matches(
        EURO2024, "EURO2024", home_country_for_non_neutral="Germany",
    ))
    # Copa America 2024 USA — USA hosted
    matches.extend(_to_matches(
        COPA2024, "COPA2024", home_country_for_non_neutral="USA",
    ))
    return matches


def load_all_extended() -> list[Match]:
    """Load all hardcoded historical matches PLUS the 7 prior World Cups.

    Extends `load_all()` with WC1994 (USA), WC1998 (France), WC2002
    (Korea/Japan), WC2006 (Germany), WC2010 (South Africa), WC2014
    (Brazil), WC2018 (Russia). Host country is flagged non-neutral for
    its own matches. Returns chronological ordering not guaranteed —
    callers that need chronology should sort by `date`.
    """
    matches: list[Match] = []
    matches.extend(_to_matches(
        WC1994, "WC1994", home_country_for_non_neutral="USA",
    ))
    matches.extend(_to_matches(
        WC1998, "WC1998", home_country_for_non_neutral="France",
    ))
    # WC2002 had two co-hosts — flag both as non-neutral when home.
    for m in _to_matches(WC2002, "WC2002"):
        is_host_home = m.home in {"South Korea", "Japan"}
        matches.append(m._replace(neutral=not is_host_home))
    matches.extend(_to_matches(
        WC2006, "WC2006", home_country_for_non_neutral="Germany",
    ))
    matches.extend(_to_matches(
        WC2010, "WC2010", home_country_for_non_neutral="South Africa",
    ))
    matches.extend(_to_matches(
        WC2014, "WC2014", home_country_for_non_neutral="Brazil",
    ))
    matches.extend(_to_matches(
        WC2018, "WC2018", home_country_for_non_neutral="Russia",
    ))
    # Then layer the original three modern tournaments on top.
    matches.extend(load_all())
    return matches


def _parse_score(score: str) -> tuple[int, int] | None:
    """Parse 'h-a' or 'h–a' into (h, a). Return None on bad input."""
    if not isinstance(score, str):
        return None
    cleaned = score.replace("–", "-").strip()
    parts = cleaned.split("-")
    if len(parts) != 2:
        return None
    try:
        return int(parts[0].strip()), int(parts[1].strip())
    except ValueError:
        return None


def _load_wc2026_first12(json_path: pathlib.Path) -> list[Match]:
    """Load the 12 already-completed WC2026 MD1 results from disk."""
    if not json_path.exists():
        LOG.warning("WC2026 results JSON not found at %s", json_path)
        return []
    try:
        doc = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        LOG.warning("Failed to read %s: %s", json_path, exc)
        return []

    first12 = doc.get("first12_results") or {}
    last_updated = doc.get("last_updated") or "2026-06-11T00:00:00Z"
    # Use date portion only.
    date_str = last_updated[:10] if isinstance(last_updated, str) else "2026-06-11"

    out: list[Match] = []
    for key, score in first12.items():
        pairing = _WC2026_MD1_PAIRINGS.get(str(key))
        if not pairing:
            LOG.warning("WC2026 MD1 match #%s has no known pairing — skipping", key)
            continue
        parsed = _parse_score(score)
        if parsed is None:
            LOG.warning("WC2026 MD1 match #%s has unparseable score %r", key, score)
            continue
        home, away = pairing
        hg, ag = parsed
        out.append(Match(
            date=date_str,
            home=home,
            away=away,
            hg=hg,
            ag=ag,
            neutral=True,
            competition="WC2026",
            stage="Group",
        ))
    return out


def merge_with_existing(
    historical: list[Match],
    json_path: pathlib.Path = RESULTS_JSON,
) -> list[Match]:
    """Merge the 12 on-disk WC2026 MD1 results into the historical corpus."""
    wc26 = _load_wc2026_first12(json_path)
    LOG.info("Merging %d WC2026 MD1 results with %d historical matches",
             len(wc26), len(historical))
    return historical + wc26


def save_csv(matches: list[Match], path: pathlib.Path = OUT_CSV) -> None:
    """Write the unified match list to CSV."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow([
            "date", "home", "away", "hg", "ag",
            "neutral", "competition", "stage",
        ])
        for m in matches:
            writer.writerow([
                m.date, m.home, m.away, m.hg, m.ag,
                "1" if m.neutral else "0",
                m.competition, m.stage,
            ])
    LOG.info("Wrote %d rows -> %s", len(matches), path)


def _summary(matches: list[Match]) -> str:
    """Build a human-readable summary string."""
    by_comp = Counter(m.competition for m in matches)
    dates = sorted({m.date for m in matches})
    appearances: Counter[str] = Counter()
    for m in matches:
        appearances[m.home] += 1
        appearances[m.away] += 1
    top = appearances.most_common(15)

    lines = ["=== WC2026 Training History Summary ==="]
    lines.append(f"Total matches: {len(matches)}")
    lines.append("Matches per competition:")
    for comp, n in sorted(by_comp.items(), key=lambda kv: -kv[1]):
        lines.append(f"  {comp:10s} {n:4d}")
    if dates:
        lines.append(f"Date range: {dates[0]}  →  {dates[-1]}")
    lines.append("Top 15 teams by appearances:")
    for team, n in top:
        lines.append(f"  {team:18s} {n:3d}")
    return "\n".join(lines)


def main() -> int:
    historical = load_all_extended()
    # Sort chronologically so the CSV walks forward through history.
    historical.sort(key=lambda m: m.date)
    merged = merge_with_existing(historical)
    save_csv(merged)
    summary = _summary(merged)
    # CLI summary goes to stdout for operators; this is the script entrypoint,
    # not library code, so direct stdout write is appropriate.
    sys.stdout.write(summary + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
