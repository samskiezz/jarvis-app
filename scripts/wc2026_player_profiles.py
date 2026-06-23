"""Build player & team profiles for the 48 WC2026 squads with GPU embeddings.

Run manually or via cron (daily is plenty — squads/news change slowly):
    /opt/jarvis-app-1/.venv/bin/python /opt/jarvis-app-1/scripts/wc2026_player_profiles.py

Output: /opt/jarvis-app-1/server/data/wc2026_player_profiles.json

Embedding source: Ollama nomic-embed-text on $OLLAMA_HOST (default 127.0.0.1:11434).
Falls back to deterministic 64-dim hash embeddings if Ollama is unreachable.

Squad data is best-effort starting XIs (no bench depth in v1) — accuracy <100%
is acceptable and explicitly marked in the output meta block.
"""
from __future__ import annotations

import dataclasses
import datetime as _dt
import hashlib
import json
import logging
import math
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

LOG = logging.getLogger("wc2026_player_profiles")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

OUT_PATH = pathlib.Path("/opt/jarvis-app-1/server/data/wc2026_player_profiles.json")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text")
EMBED_TIMEOUT_S = 6
NEWS_TIMEOUT_S = 5
FALLBACK_DIM = 64
TOP_5_LEAGUES = {
    "Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1",
}

# ---------------------------------------------------------------------------
# Squad data — best-effort starting XIs for all 48 WC2026 teams
# Format per player: (name, position, club, age, caps)
# ---------------------------------------------------------------------------

Player = tuple[str, str, str, int, int]

SQUADS: dict[str, list[Player]] = {
    # ------------------------------- HOSTS / CONCACAF -------------------------------
    "USA": [
        ("Matt Turner", "GK", "Crystal Palace", 31, 51),
        ("Sergiño Dest", "DEF", "PSV Eindhoven", 25, 36),
        ("Chris Richards", "DEF", "Crystal Palace", 25, 27),
        ("Tim Ream", "DEF", "Charlotte FC", 38, 67),
        ("Antonee Robinson", "DEF", "Fulham", 28, 47),
        ("Tyler Adams", "MID", "Bournemouth", 27, 41),
        ("Yunus Musah", "MID", "AC Milan", 23, 41),
        ("Weston McKennie", "MID", "Juventus", 27, 60),
        ("Christian Pulisic", "FWD", "AC Milan", 27, 78),
        ("Folarin Balogun", "FWD", "Monaco", 24, 17),
        ("Tim Weah", "FWD", "Juventus", 25, 41),
    ],
    "Canada": [
        ("Maxime Crépeau", "GK", "Portland Timbers", 31, 24),
        ("Alistair Johnston", "DEF", "Celtic", 27, 42),
        ("Moïse Bombito", "DEF", "OGC Nice", 25, 18),
        ("Derek Cornelius", "DEF", "Marseille", 28, 38),
        ("Sam Adekugbe", "DEF", "Hatayspor", 30, 41),
        ("Stephen Eustáquio", "MID", "Porto", 28, 44),
        ("Ismaël Koné", "MID", "Sassuolo", 23, 36),
        ("Tajon Buchanan", "MID", "Villarreal", 26, 41),
        ("Alphonso Davies", "DEF", "Bayern Munich", 25, 56),
        ("Jonathan David", "FWD", "Juventus", 25, 64),
        ("Cyle Larin", "FWD", "Mallorca", 30, 84),
    ],
    "Mexico": [
        ("Guillermo Ochoa", "GK", "AVS", 40, 152),
        ("Jorge Sánchez", "DEF", "Cruz Azul", 27, 33),
        ("César Montes", "DEF", "Lokomotiv Moscow", 28, 34),
        ("Johan Vásquez", "DEF", "Genoa", 27, 32),
        ("Jesús Gallardo", "DEF", "Toluca", 31, 79),
        ("Edson Álvarez", "MID", "Fenerbahçe", 27, 78),
        ("Luis Romo", "MID", "Cruz Azul", 30, 49),
        ("Orbelín Pineda", "MID", "AEK Athens", 30, 56),
        ("Hirving Lozano", "FWD", "San Diego FC", 30, 76),
        ("Santiago Giménez", "FWD", "AC Milan", 25, 36),
        ("Raúl Jiménez", "FWD", "Fulham", 34, 113),
    ],
    # ------------------------------- UEFA -------------------------------
    "Spain": [
        ("Unai Simón", "GK", "Athletic Bilbao", 28, 42),
        ("Dani Carvajal", "DEF", "Real Madrid", 33, 36),
        ("Robin Le Normand", "DEF", "Atlético Madrid", 28, 21),
        ("Aymeric Laporte", "DEF", "Athletic Bilbao", 31, 35),
        ("Marc Cucurella", "DEF", "Chelsea", 27, 32),
        ("Rodri", "MID", "Manchester City", 29, 64),
        ("Pedri", "MID", "Barcelona", 23, 35),
        ("Fabián Ruiz", "MID", "PSG", 29, 32),
        ("Lamine Yamal", "FWD", "Barcelona", 18, 25),
        ("Álvaro Morata", "FWD", "Como", 33, 80),
        ("Nico Williams", "FWD", "Athletic Bilbao", 23, 28),
    ],
    "France": [
        ("Mike Maignan", "GK", "AC Milan", 30, 25),
        ("Jules Koundé", "DEF", "Barcelona", 27, 41),
        ("William Saliba", "DEF", "Arsenal", 24, 25),
        ("Dayot Upamecano", "DEF", "Bayern Munich", 27, 30),
        ("Théo Hernández", "DEF", "Al-Hilal", 28, 38),
        ("Aurélien Tchouaméni", "MID", "Real Madrid", 25, 36),
        ("Adrien Rabiot", "MID", "AC Milan", 30, 53),
        ("Antoine Griezmann", "MID", "LA Galaxy", 34, 137),
        ("Kylian Mbappé", "FWD", "Real Madrid", 27, 89),
        ("Ousmane Dembélé", "FWD", "PSG", 28, 53),
        ("Bradley Barcola", "FWD", "PSG", 23, 11),
    ],
    "Germany": [
        ("Marc-André ter Stegen", "GK", "Barcelona", 33, 41),
        ("Joshua Kimmich", "DEF", "Bayern Munich", 30, 96),
        ("Antonio Rüdiger", "DEF", "Real Madrid", 32, 80),
        ("Jonathan Tah", "DEF", "Bayern Munich", 29, 33),
        ("David Raum", "DEF", "RB Leipzig", 27, 28),
        ("Pascal Groß", "MID", "Borussia Dortmund", 34, 14),
        ("Aleksandar Pavlović", "MID", "Bayern Munich", 21, 8),
        ("Florian Wirtz", "MID", "Liverpool", 22, 26),
        ("Jamal Musiala", "FWD", "Bayern Munich", 22, 36),
        ("Kai Havertz", "FWD", "Arsenal", 26, 49),
        ("Niclas Füllkrug", "FWD", "West Ham", 32, 22),
    ],
    "England": [
        ("Jordan Pickford", "GK", "Everton", 31, 73),
        ("Kyle Walker", "DEF", "Burnley", 35, 95),
        ("John Stones", "DEF", "Manchester City", 31, 84),
        ("Marc Guéhi", "DEF", "Crystal Palace", 25, 25),
        ("Luke Shaw", "DEF", "Manchester United", 30, 32),
        ("Declan Rice", "MID", "Arsenal", 27, 65),
        ("Jude Bellingham", "MID", "Real Madrid", 22, 44),
        ("Phil Foden", "MID", "Manchester City", 25, 47),
        ("Bukayo Saka", "FWD", "Arsenal", 24, 47),
        ("Harry Kane", "FWD", "Bayern Munich", 32, 109),
        ("Cole Palmer", "FWD", "Chelsea", 23, 17),
    ],
    "Netherlands": [
        ("Bart Verbruggen", "GK", "Brighton", 23, 22),
        ("Denzel Dumfries", "DEF", "Inter", 29, 67),
        ("Virgil van Dijk", "DEF", "Liverpool", 34, 84),
        ("Stefan de Vrij", "DEF", "Inter", 33, 76),
        ("Nathan Aké", "DEF", "Manchester City", 30, 47),
        ("Frenkie de Jong", "MID", "Barcelona", 28, 65),
        ("Tijjani Reijnders", "MID", "Manchester City", 27, 26),
        ("Xavi Simons", "MID", "RB Leipzig", 22, 32),
        ("Cody Gakpo", "FWD", "Liverpool", 26, 35),
        ("Memphis Depay", "FWD", "Corinthians", 31, 102),
        ("Donyell Malen", "FWD", "Aston Villa", 26, 31),
    ],
    "Portugal": [
        ("Diogo Costa", "GK", "Porto", 26, 32),
        ("João Cancelo", "DEF", "Al-Hilal", 31, 60),
        ("Rúben Dias", "DEF", "Manchester City", 28, 65),
        ("Gonçalo Inácio", "DEF", "Sporting CP", 24, 19),
        ("Nuno Mendes", "DEF", "PSG", 23, 30),
        ("Bernardo Silva", "MID", "Manchester City", 31, 96),
        ("Vitinha", "MID", "PSG", 25, 31),
        ("Bruno Fernandes", "MID", "Manchester United", 31, 78),
        ("Cristiano Ronaldo", "FWD", "Al-Nassr", 40, 220),
        ("Rafael Leão", "FWD", "AC Milan", 26, 35),
        ("Bernardo Silva", "FWD", "Manchester City", 31, 96),
    ],
    "Belgium": [
        ("Koen Casteels", "GK", "Al-Qadsiah", 33, 17),
        ("Timothy Castagne", "DEF", "Fulham", 30, 49),
        ("Wout Faes", "DEF", "Leicester", 27, 22),
        ("Maxim De Cuyper", "DEF", "Brighton", 25, 6),
        ("Arthur Theate", "DEF", "Eintracht Frankfurt", 25, 19),
        ("Amadou Onana", "MID", "Aston Villa", 24, 26),
        ("Youri Tielemans", "MID", "Aston Villa", 28, 81),
        ("Kevin De Bruyne", "MID", "Napoli", 34, 110),
        ("Jérémy Doku", "FWD", "Manchester City", 23, 30),
        ("Romelu Lukaku", "FWD", "Napoli", 32, 124),
        ("Leandro Trossard", "FWD", "Arsenal", 30, 38),
    ],
    "Italy": [
        ("Gianluigi Donnarumma", "GK", "Manchester City", 26, 74),
        ("Giovanni Di Lorenzo", "DEF", "Napoli", 32, 41),
        ("Alessandro Bastoni", "DEF", "Inter", 26, 36),
        ("Riccardo Calafiori", "DEF", "Arsenal", 23, 14),
        ("Federico Dimarco", "DEF", "Inter", 27, 25),
        ("Nicolò Barella", "MID", "Inter", 28, 62),
        ("Sandro Tonali", "MID", "Newcastle", 25, 28),
        ("Davide Frattesi", "MID", "Inter", 25, 26),
        ("Federico Chiesa", "FWD", "Liverpool", 28, 53),
        ("Mateo Retegui", "FWD", "Al-Qadsiah", 26, 22),
        ("Moise Kean", "FWD", "Fiorentina", 25, 24),
    ],
    "Croatia": [
        ("Dominik Livaković", "GK", "Girona", 30, 47),
        ("Josip Stanišić", "DEF", "Bayern Munich", 25, 17),
        ("Joško Gvardiol", "DEF", "Manchester City", 23, 39),
        ("Joško Šutalo", "DEF", "Ajax", 25, 23),
        ("Borna Sosa", "DEF", "Ajax", 27, 22),
        ("Luka Modrić", "MID", "AC Milan", 40, 184),
        ("Mateo Kovačić", "MID", "Manchester City", 31, 100),
        ("Lovro Majer", "MID", "Wolfsburg", 27, 30),
        ("Andrej Kramarić", "FWD", "Hoffenheim", 34, 110),
        ("Bruno Petković", "FWD", "Dinamo Zagreb", 31, 39),
        ("Ante Budimir", "FWD", "Osasuna", 34, 25),
    ],
    "Switzerland": [
        ("Yann Sommer", "GK", "Inter", 36, 96),
        ("Manuel Akanji", "DEF", "Inter", 30, 66),
        ("Nico Elvedi", "DEF", "Borussia M'gladbach", 29, 60),
        ("Ricardo Rodríguez", "DEF", "Real Betis", 33, 124),
        ("Silvan Widmer", "DEF", "Mainz", 32, 36),
        ("Granit Xhaka", "MID", "Bayer Leverkusen", 33, 138),
        ("Remo Freuler", "MID", "Bologna", 33, 60),
        ("Michel Aebischer", "MID", "Bologna", 28, 30),
        ("Xherdan Shaqiri", "FWD", "Basel", 34, 132),
        ("Breel Embolo", "FWD", "Monaco", 28, 73),
        ("Dan Ndoye", "FWD", "Bologna", 25, 18),
    ],
    "Austria": [
        ("Patrick Pentz", "GK", "Brøndby", 28, 12),
        ("Stefan Posch", "DEF", "Como", 28, 26),
        ("Kevin Danso", "DEF", "Tottenham", 27, 31),
        ("Maximilian Wöber", "DEF", "Leeds", 27, 31),
        ("Phillipp Mwene", "DEF", "Mainz", 31, 23),
        ("Florian Grillitsch", "MID", "Hoffenheim", 30, 42),
        ("Konrad Laimer", "MID", "Bayern Munich", 28, 47),
        ("Marcel Sabitzer", "MID", "Borussia Dortmund", 31, 86),
        ("Marko Arnautović", "FWD", "Inter Miami", 36, 117),
        ("Michael Gregoritsch", "FWD", "SC Freiburg", 31, 47),
        ("Christoph Baumgartner", "FWD", "RB Leipzig", 26, 41),
    ],
    "Türkiye": [
        ("Uğurcan Çakır", "GK", "Galatasaray", 29, 32),
        ("Zeki Çelik", "DEF", "Roma", 28, 41),
        ("Merih Demiral", "DEF", "Al-Ahli", 27, 53),
        ("Samet Akaydin", "DEF", "Panathinaikos", 31, 22),
        ("Ferdi Kadıoğlu", "DEF", "Brighton", 26, 30),
        ("Hakan Çalhanoğlu", "MID", "Inter", 31, 100),
        ("Orkun Kökçü", "MID", "Benfica", 25, 28),
        ("İsmail Yüksek", "MID", "Fenerbahçe", 26, 14),
        ("Arda Güler", "FWD", "Real Madrid", 20, 26),
        ("Kenan Yıldız", "FWD", "Juventus", 20, 14),
        ("Yusuf Yazıcı", "FWD", "Lille", 28, 41),
    ],
    "Denmark": [
        ("Kasper Schmeichel", "GK", "Celtic", 39, 110),
        ("Joachim Andersen", "DEF", "Fulham", 29, 39),
        ("Andreas Christensen", "DEF", "Barcelona", 29, 75),
        ("Victor Nelsson", "DEF", "Galatasaray", 27, 27),
        ("Joakim Mæhle", "DEF", "Wolfsburg", 28, 50),
        ("Pierre-Emile Højbjerg", "MID", "Marseille", 30, 92),
        ("Christian Eriksen", "MID", "Wolfsburg", 33, 137),
        ("Morten Hjulmand", "MID", "Sporting CP", 26, 17),
        ("Mikkel Damsgaard", "FWD", "Brentford", 25, 30),
        ("Rasmus Højlund", "FWD", "Napoli", 22, 26),
        ("Jonas Wind", "FWD", "Wolfsburg", 26, 26),
    ],
    "Scotland": [
        ("Angus Gunn", "GK", "Norwich", 29, 22),
        ("Aaron Hickey", "DEF", "Brentford", 23, 11),
        ("Grant Hanley", "DEF", "Birmingham", 33, 56),
        ("Jack Hendry", "DEF", "Al-Ettifaq", 30, 30),
        ("Andy Robertson", "DEF", "Liverpool", 31, 81),
        ("Scott McTominay", "MID", "Napoli", 28, 65),
        ("John McGinn", "MID", "Aston Villa", 31, 71),
        ("Billy Gilmour", "MID", "Napoli", 24, 31),
        ("Ben Doak", "FWD", "Bournemouth", 20, 7),
        ("Che Adams", "FWD", "Torino", 29, 34),
        ("Lyndon Dykes", "FWD", "Birmingham", 30, 41),
    ],
    "Norway": [
        ("Ørjan Nyland", "GK", "Sevilla", 35, 22),
        ("Julian Ryerson", "DEF", "Borussia Dortmund", 28, 23),
        ("Kristoffer Ajer", "DEF", "Brentford", 27, 36),
        ("Leo Østigård", "DEF", "Rennes", 26, 24),
        ("Birger Meling", "DEF", "Rennes", 31, 36),
        ("Sander Berge", "MID", "Fulham", 27, 47),
        ("Patrick Berg", "MID", "Bodø/Glimt", 27, 21),
        ("Martin Ødegaard", "MID", "Arsenal", 27, 56),
        ("Antonio Nusa", "FWD", "RB Leipzig", 20, 15),
        ("Erling Haaland", "FWD", "Manchester City", 25, 41),
        ("Alexander Sørloth", "FWD", "Atlético Madrid", 30, 51),
    ],
    "Poland": [
        ("Łukasz Skorupski", "GK", "Bologna", 34, 19),
        ("Jan Bednarek", "DEF", "Porto", 29, 65),
        ("Paweł Dawidowicz", "DEF", "Hellas Verona", 30, 25),
        ("Jakub Kiwior", "DEF", "Arsenal", 25, 31),
        ("Bartosz Bereszyński", "DEF", "Sampdoria", 33, 50),
        ("Piotr Zieliński", "MID", "Inter", 31, 99),
        ("Sebastian Szymański", "MID", "Fenerbahçe", 26, 36),
        ("Nicola Zalewski", "MID", "Inter", 23, 27),
        ("Karol Świderski", "FWD", "Verona", 28, 38),
        ("Robert Lewandowski", "FWD", "Barcelona", 37, 158),
        ("Krzysztof Piątek", "FWD", "Al-Duhail", 30, 36),
    ],
    "Czechia": [
        ("Jindřich Staněk", "GK", "Slavia Prague", 29, 9),
        ("Vladimír Coufal", "DEF", "Hoffenheim", 33, 47),
        ("Tomáš Holeš", "DEF", "Slavia Prague", 32, 24),
        ("Robin Hranáč", "DEF", "Wolfsburg", 25, 14),
        ("David Jurásek", "DEF", "Benfica", 25, 9),
        ("Tomáš Souček", "MID", "West Ham", 30, 80),
        ("Lukáš Provod", "MID", "Slavia Prague", 29, 17),
        ("Antonín Barák", "MID", "Kasımpaşa", 30, 38),
        ("Adam Hložek", "FWD", "Hoffenheim", 23, 28),
        ("Patrik Schick", "FWD", "Bayer Leverkusen", 29, 51),
        ("Mojmír Chytil", "FWD", "Slavia Prague", 26, 12),
    ],
    "Wales": [
        ("Karl Darlow", "GK", "Leeds", 35, 8),
        ("Connor Roberts", "DEF", "Burnley", 30, 53),
        ("Ben Davies", "DEF", "Tottenham", 32, 90),
        ("Joe Rodon", "DEF", "Leeds", 28, 41),
        ("Neco Williams", "DEF", "Nottingham Forest", 24, 33),
        ("Joe Allen", "MID", "Swansea", 35, 76),
        ("Ethan Ampadu", "MID", "Leeds", 25, 56),
        ("Aaron Ramsey", "MID", "Cardiff", 34, 86),
        ("Daniel James", "FWD", "Leeds", 28, 50),
        ("Brennan Johnson", "FWD", "Tottenham", 24, 30),
        ("Kieffer Moore", "FWD", "Sheffield United", 33, 39),
    ],
    "Ukraine": [
        ("Anatoliy Trubin", "GK", "Benfica", 24, 22),
        ("Yukhym Konoplya", "DEF", "Shakhtar Donetsk", 26, 18),
        ("Ilya Zabarnyi", "DEF", "Bournemouth", 23, 36),
        ("Mykola Matviyenko", "DEF", "Shakhtar Donetsk", 29, 56),
        ("Vitaliy Mykolenko", "DEF", "Everton", 26, 35),
        ("Oleksandr Zinchenko", "MID", "Arsenal", 28, 65),
        ("Taras Stepanenko", "MID", "Shakhtar Donetsk", 36, 73),
        ("Mykhailo Mudryk", "FWD", "Chelsea", 24, 30),
        ("Heorhiy Sudakov", "MID", "Benfica", 23, 22),
        ("Artem Dovbyk", "FWD", "Roma", 28, 32),
        ("Roman Yaremchuk", "FWD", "Olympiacos", 30, 50),
    ],
    "Slovakia": [
        ("Martin Dúbravka", "GK", "Newcastle", 36, 53),
        ("Peter Pekarík", "DEF", "Hertha Berlin", 39, 121),
        ("Milan Škriniar", "DEF", "Fenerbahçe", 30, 78),
        ("Norbert Gyömbér", "DEF", "Salernitana", 33, 33),
        ("Dávid Hancko", "DEF", "Feyenoord", 27, 47),
        ("Stanislav Lobotka", "MID", "Napoli", 31, 60),
        ("Juraj Kucka", "MID", "Slovan Bratislava", 38, 102),
        ("Lukáš Haraslín", "MID", "Sparta Prague", 29, 32),
        ("Tomáš Suslov", "FWD", "Verona", 23, 19),
        ("Dávid Ďuriš", "FWD", "Anderlecht", 27, 16),
        ("Ivan Schranz", "FWD", "Slavia Prague", 32, 28),
    ],
    # ------------------------------- CONMEBOL -------------------------------
    "Argentina": [
        ("Emiliano Martínez", "GK", "Aston Villa", 33, 50),
        ("Nahuel Molina", "DEF", "Atlético Madrid", 27, 47),
        ("Cristian Romero", "DEF", "Tottenham", 27, 45),
        ("Lisandro Martínez", "DEF", "Manchester United", 27, 32),
        ("Nicolás Tagliafico", "DEF", "Lyon", 33, 60),
        ("Rodrigo De Paul", "MID", "Inter Miami", 31, 79),
        ("Enzo Fernández", "MID", "Chelsea", 24, 36),
        ("Alexis Mac Allister", "MID", "Liverpool", 26, 36),
        ("Lionel Messi", "FWD", "Inter Miami", 38, 191),
        ("Julián Álvarez", "FWD", "Atlético Madrid", 25, 41),
        ("Lautaro Martínez", "FWD", "Inter", 28, 65),
    ],
    "Brazil": [
        ("Alisson", "GK", "Liverpool", 33, 73),
        ("Danilo", "DEF", "Flamengo", 34, 60),
        ("Marquinhos", "DEF", "PSG", 31, 95),
        ("Gabriel Magalhães", "DEF", "Arsenal", 28, 22),
        ("Wendell", "DEF", "Porto", 32, 24),
        ("Bruno Guimarães", "MID", "Newcastle", 28, 36),
        ("Casemiro", "MID", "Manchester United", 33, 80),
        ("Lucas Paquetá", "MID", "West Ham", 28, 49),
        ("Vinícius Júnior", "FWD", "Real Madrid", 25, 41),
        ("Rodrygo", "FWD", "Real Madrid", 24, 34),
        ("Raphinha", "FWD", "Barcelona", 28, 35),
    ],
    "Uruguay": [
        ("Sergio Rochet", "GK", "Internacional", 32, 22),
        ("Nahitan Nández", "DEF", "Al-Qadsiah", 30, 70),
        ("José María Giménez", "DEF", "Atlético Madrid", 30, 96),
        ("Ronald Araújo", "DEF", "Barcelona", 26, 50),
        ("Mathías Olivera", "DEF", "Napoli", 28, 27),
        ("Federico Valverde", "MID", "Real Madrid", 27, 79),
        ("Manuel Ugarte", "MID", "Manchester United", 24, 35),
        ("Rodrigo Bentancur", "MID", "Tottenham", 28, 65),
        ("Facundo Pellistri", "FWD", "Panathinaikos", 24, 30),
        ("Darwin Núñez", "FWD", "Al-Hilal", 26, 35),
        ("Maximiliano Araújo", "FWD", "Sporting CP", 25, 23),
    ],
    "Colombia": [
        ("Camilo Vargas", "GK", "Atlas", 36, 28),
        ("Daniel Muñoz", "DEF", "Crystal Palace", 29, 41),
        ("Davinson Sánchez", "DEF", "Galatasaray", 29, 60),
        ("Yerry Mina", "DEF", "Cagliari", 31, 45),
        ("Johan Mojica", "DEF", "Magdeburg", 33, 35),
        ("Jefferson Lerma", "MID", "Crystal Palace", 31, 70),
        ("Richard Ríos", "MID", "Palmeiras", 25, 21),
        ("James Rodríguez", "MID", "Club León", 34, 113),
        ("Luis Díaz", "FWD", "Liverpool", 28, 60),
        ("Jhon Durán", "FWD", "Al-Nassr", 22, 18),
        ("Jhon Arias", "FWD", "Wolves", 28, 30),
    ],
    "Ecuador": [
        ("Hernán Galíndez", "GK", "Huracán", 38, 25),
        ("Pervis Estupiñán", "DEF", "Brighton", 27, 34),
        ("Piero Hincapié", "DEF", "Bayer Leverkusen", 23, 35),
        ("Félix Torres", "DEF", "Corinthians", 28, 30),
        ("Ángelo Preciado", "DEF", "Antwerp", 27, 41),
        ("Moisés Caicedo", "MID", "Chelsea", 24, 41),
        ("Alan Franco", "MID", "Atlético Mineiro", 28, 24),
        ("Jhegson Méndez", "MID", "Internacional", 28, 41),
        ("Gonzalo Plata", "FWD", "Flamengo", 25, 35),
        ("Enner Valencia", "FWD", "Internacional", 36, 87),
        ("Kendry Páez", "FWD", "Strasbourg", 18, 14),
    ],
    "Paraguay": [
        ("Roberto Fernández", "GK", "Bahia", 26, 7),
        ("Robert Rojas", "DEF", "Vasco da Gama", 29, 28),
        ("Junior Alonso", "DEF", "Krasnodar", 32, 46),
        ("Omar Alderete", "DEF", "Getafe", 28, 41),
        ("Juan Cáceres", "DEF", "América de Cali", 28, 22),
        ("Andrés Cubas", "MID", "Vancouver Whitecaps", 29, 27),
        ("Mathías Villasanti", "MID", "Grêmio", 27, 22),
        ("Damián Bobadilla", "MID", "São Paulo", 23, 15),
        ("Diego Gómez", "MID", "Brighton", 22, 18),
        ("Julio Enciso", "FWD", "Ipswich", 21, 24),
        ("Antonio Sanabria", "FWD", "Torino", 29, 39),
    ],
    "Cabo Verde": [
        ("Vozinha", "GK", "AVS", 39, 65),
        ("Diney", "DEF", "Vitória Guimarães", 34, 30),
        ("Roberto Lopes", "DEF", "Shamrock Rovers", 33, 40),
        ("Stopira", "DEF", "Khaitan SC", 37, 80),
        ("Steven Moreira", "DEF", "Columbus Crew", 31, 25),
        ("Jamiro Monteiro", "MID", "Volos", 31, 32),
        ("Laros Duarte", "MID", "Lugano", 28, 18),
        ("Kevin Lenini", "MID", "Sporting Charleroi", 22, 6),
        ("Ryan Mendes", "FWD", "Al-Tai", 35, 50),
        ("Bebé", "FWD", "Cova da Piedade", 35, 25),
        ("Garry Rodrigues", "FWD", "Eyüpspor", 35, 41),
    ],
    # ------------------------------- AFC -------------------------------
    "Japan": [
        ("Zion Suzuki", "GK", "Parma", 23, 16),
        ("Hiroki Sakai", "DEF", "Cerezo Osaka", 35, 40),
        ("Ko Itakura", "DEF", "Ajax", 28, 35),
        ("Shogo Taniguchi", "DEF", "Sint-Truiden", 34, 27),
        ("Yuto Nagatomo", "DEF", "FC Tokyo", 39, 142),
        ("Wataru Endo", "MID", "Liverpool", 32, 73),
        ("Hidemasa Morita", "MID", "Sporting CP", 30, 39),
        ("Takefusa Kubo", "FWD", "Real Sociedad", 24, 41),
        ("Kaoru Mitoma", "FWD", "Brighton", 28, 32),
        ("Takumi Minamino", "FWD", "Monaco", 30, 53),
        ("Ayase Ueda", "FWD", "Feyenoord", 27, 22),
    ],
    "South Korea": [
        ("Kim Seung-gyu", "GK", "Al-Shabab", 35, 90),
        ("Kim Moon-hwan", "DEF", "Daejeon Hana Citizen", 30, 35),
        ("Kim Min-jae", "DEF", "Bayern Munich", 29, 73),
        ("Kim Young-gwon", "DEF", "Ulsan HD", 36, 110),
        ("Lee Ki-je", "DEF", "Suwon FC", 34, 25),
        ("Hwang In-beom", "MID", "Feyenoord", 29, 56),
        ("Lee Jae-sung", "MID", "Mainz", 33, 91),
        ("Lee Kang-in", "FWD", "PSG", 24, 36),
        ("Son Heung-min", "FWD", "LAFC", 33, 134),
        ("Hwang Hee-chan", "FWD", "Wolves", 29, 65),
        ("Oh Hyeon-gyu", "FWD", "Genk", 24, 22),
    ],
    "Iran": [
        ("Alireza Beiranvand", "GK", "Tractor", 33, 79),
        ("Sadegh Moharrami", "DEF", "Dinamo Zagreb", 29, 51),
        ("Shojae Khalilzadeh", "DEF", "Tractor", 36, 60),
        ("Majid Hosseini", "DEF", "Kayserispor", 29, 30),
        ("Milad Mohammadi", "DEF", "AEK Athens", 32, 65),
        ("Ehsan Hajsafi", "MID", "AEK Athens", 35, 134),
        ("Saeid Ezatolahi", "MID", "Al-Wakrah", 29, 60),
        ("Saman Ghoddos", "MID", "Brentford", 32, 41),
        ("Sardar Azmoun", "FWD", "Shabab Al-Ahli", 31, 88),
        ("Mehdi Taremi", "FWD", "Inter", 33, 100),
        ("Alireza Jahanbakhsh", "FWD", "Heerenveen", 32, 84),
    ],
    "Saudi Arabia": [
        ("Mohammed Al-Owais", "GK", "Al-Hilal", 34, 47),
        ("Sultan Al-Ghannam", "DEF", "Al-Nassr", 31, 35),
        ("Ali Al-Bulayhi", "DEF", "Al-Hilal", 35, 56),
        ("Abdulelah Al-Amri", "DEF", "Al-Nassr", 28, 47),
        ("Yasser Al-Shahrani", "DEF", "Al-Hilal", 33, 86),
        ("Salem Al-Dawsari", "MID", "Al-Hilal", 34, 100),
        ("Mohamed Kanno", "MID", "Al-Hilal", 31, 60),
        ("Abdulrahman Ghareeb", "MID", "Al-Ahli", 28, 33),
        ("Saleh Al-Shehri", "FWD", "Al-Ittihad", 31, 39),
        ("Firas Al-Buraikan", "FWD", "Al-Ahli", 25, 41),
        ("Sami Al-Najei", "FWD", "Al-Nassr", 28, 31),
    ],
    "Australia": [
        ("Mat Ryan", "GK", "Roma", 33, 100),
        ("Milos Degenek", "DEF", "Al-Ittihad Kalba", 31, 51),
        ("Harry Souttar", "DEF", "Sheffield United", 27, 27),
        ("Kye Rowles", "DEF", "Hibernian", 27, 32),
        ("Aziz Behich", "DEF", "Melbourne City", 35, 75),
        ("Aaron Mooy", "MID", "Macarthur FC", 35, 57),
        ("Jackson Irvine", "MID", "St. Pauli", 32, 70),
        ("Riley McGree", "MID", "Middlesbrough", 26, 22),
        ("Mathew Leckie", "FWD", "Melbourne City", 34, 80),
        ("Mitchell Duke", "FWD", "Machida Zelvia", 34, 35),
        ("Adam Taggart", "FWD", "Brisbane Roar", 32, 22),
    ],
    "Uzbekistan": [
        ("Utkir Yusupov", "GK", "Pakhtakor", 28, 25),
        ("Khojimat Erkinov", "DEF", "Pakhtakor", 25, 22),
        ("Abdukodir Khusanov", "DEF", "Manchester City", 21, 18),
        ("Rustamjon Ashurmatov", "DEF", "Riffa SC", 25, 35),
        ("Sherzod Nasrullaev", "DEF", "Pakhtakor", 24, 22),
        ("Jaloliddin Masharipov", "MID", "Pakhtakor", 32, 55),
        ("Otabek Shukurov", "MID", "Al-Wakrah", 29, 53),
        ("Abbosbek Fayzullaev", "MID", "CSKA Moscow", 22, 28),
        ("Eldor Shomurodov", "FWD", "Roma", 30, 71),
        ("Igor Sergeev", "FWD", "Khimki", 32, 60),
        ("Bobir Abdixolikov", "FWD", "Olimpik Tashkent", 27, 22),
    ],
    "Jordan": [
        ("Yazeed Abulaila", "GK", "Al-Faisaly Amman", 30, 22),
        ("Salem Al-Ajalin", "DEF", "Al-Wehdat", 27, 25),
        ("Bara' Marei", "DEF", "Mes Rafsanjan", 30, 31),
        ("Yazan Al-Arab", "DEF", "Al-Hussein", 28, 47),
        ("Ihsan Haddad", "DEF", "Al-Wehdat", 24, 18),
        ("Noor Al-Rawabdeh", "MID", "Al-Wehdat", 26, 33),
        ("Mahmoud Al-Mardi", "MID", "Al-Ramtha", 28, 30),
        ("Nizar Al-Rashdan", "MID", "Mes Rafsanjan", 26, 35),
        ("Musa Al-Taamari", "FWD", "Montpellier", 28, 60),
        ("Yazan Al-Naimat", "FWD", "Al-Khaldiya", 27, 41),
        ("Ali Olwan", "FWD", "Al-Wehdat", 27, 32),
    ],
    "Qatar": [
        ("Meshaal Barsham", "GK", "Al-Sadd", 27, 31),
        ("Pedro Miguel", "DEF", "Al-Sadd", 35, 60),
        ("Boualem Khoukhi", "DEF", "Al-Ahli", 35, 100),
        ("Tarek Salman", "DEF", "Al-Sadd", 27, 50),
        ("Homam Ahmed", "DEF", "Al-Gharafa", 26, 41),
        ("Hassan Al-Haydos", "MID", "Al-Sadd", 35, 175),
        ("Karim Boudiaf", "MID", "Al-Duhail", 35, 96),
        ("Akram Afif", "MID", "Al-Sadd", 28, 96),
        ("Almoez Ali", "FWD", "Al-Duhail", 29, 96),
        ("Mohammed Muntari", "FWD", "Al-Gharafa", 32, 51),
        ("Ahmed Alaaeldin", "FWD", "Al-Sadd", 32, 50),
    ],
    # ------------------------------- CAF -------------------------------
    "Morocco": [
        ("Yassine Bounou", "GK", "Al-Hilal", 34, 65),
        ("Achraf Hakimi", "DEF", "PSG", 27, 80),
        ("Romain Saïss", "DEF", "Damac", 35, 76),
        ("Nayef Aguerd", "DEF", "Real Sociedad", 29, 41),
        ("Noussair Mazraoui", "DEF", "Manchester United", 28, 39),
        ("Sofyan Amrabat", "MID", "Real Betis", 29, 60),
        ("Azzedine Ounahi", "MID", "Marseille", 25, 36),
        ("Hakim Ziyech", "MID", "Al-Ain", 32, 65),
        ("Brahim Díaz", "FWD", "Real Madrid", 26, 17),
        ("Youssef En-Nesyri", "FWD", "Fenerbahçe", 28, 80),
        ("Bilal El Khannouss", "FWD", "Stuttgart", 21, 20),
    ],
    "Senegal": [
        ("Édouard Mendy", "GK", "Al-Ahli", 33, 38),
        ("Krépin Diatta", "DEF", "Monaco", 26, 40),
        ("Kalidou Koulibaly", "DEF", "Al-Hilal", 34, 80),
        ("Abdou Diallo", "DEF", "Al-Arabi", 30, 36),
        ("Ismail Jakobs", "DEF", "Galatasaray", 26, 30),
        ("Pape Gueye", "MID", "Villarreal", 27, 36),
        ("Idrissa Gueye", "MID", "Everton", 36, 110),
        ("Pape Matar Sarr", "MID", "Tottenham", 23, 30),
        ("Sadio Mané", "FWD", "Al-Nassr", 33, 110),
        ("Ismaïla Sarr", "FWD", "Crystal Palace", 28, 60),
        ("Nicolas Jackson", "FWD", "Bayern Munich", 24, 22),
    ],
    "Tunisia": [
        ("Aymen Dahmen", "GK", "Sfaxien", 28, 18),
        ("Mohamed Dräger", "DEF", "Olympiacos", 29, 28),
        ("Yassine Meriah", "DEF", "Étoile du Sahel", 32, 50),
        ("Montassar Talbi", "DEF", "Lorient", 27, 28),
        ("Ali Abdi", "DEF", "Caen", 32, 25),
        ("Aïssa Laïdouni", "MID", "Union Berlin", 28, 36),
        ("Ellyes Skhiri", "MID", "Eintracht Frankfurt", 30, 55),
        ("Hannibal Mejbri", "MID", "Burnley", 22, 22),
        ("Anis Ben Slimane", "MID", "Sheffield United", 24, 30),
        ("Wahbi Khazri", "FWD", "Montpellier", 34, 76),
        ("Issam Jebali", "FWD", "AGF Aarhus", 33, 24),
    ],
    "Egypt": [
        ("Mohamed El-Shenawy", "GK", "Al-Ahly", 36, 52),
        ("Omar Kamal", "DEF", "Al-Ahly", 32, 22),
        ("Mohamed Abdelmonem", "DEF", "Nice", 26, 30),
        ("Ahmed Hegazi", "DEF", "Ittihad", 34, 80),
        ("Ahmed Fatouh", "DEF", "Zamalek", 28, 27),
        ("Mohamed Elneny", "MID", "Al-Jazira", 33, 100),
        ("Tarek Hamed", "MID", "Pyramids", 36, 60),
        ("Mostafa Mohamed", "FWD", "Nantes", 28, 34),
        ("Mahmoud Hassan Trezeguet", "FWD", "Trabzonspor", 31, 65),
        ("Mohamed Salah", "FWD", "Liverpool", 33, 102),
        ("Omar Marmoush", "FWD", "Manchester City", 26, 30),
    ],
    "Algeria": [
        ("Raïs M'Bolhi", "GK", "MC Alger", 39, 86),
        ("Aïssa Mandi", "DEF", "Lille", 33, 95),
        ("Ramy Bensebaini", "DEF", "Borussia Dortmund", 30, 49),
        ("Youcef Atal", "DEF", "Al-Sadd", 29, 33),
        ("Mohamed Tougai", "DEF", "Al-Hilal", 25, 13),
        ("Ismaël Bennacer", "MID", "Marseille", 27, 50),
        ("Houssem Aouar", "MID", "Al-Ittihad", 27, 11),
        ("Yacine Brahimi", "MID", "Olympique Lyon", 35, 70),
        ("Riyad Mahrez", "FWD", "Al-Ahli", 34, 90),
        ("Islam Slimani", "FWD", "Mafra", 37, 100),
        ("Baghdad Bounedjah", "FWD", "Al-Sadd", 33, 60),
    ],
    "Nigeria": [
        ("Stanley Nwabali", "GK", "Chippa United", 28, 20),
        ("Ola Aina", "DEF", "Nottingham Forest", 29, 38),
        ("William Troost-Ekong", "DEF", "Al-Kholood", 32, 80),
        ("Calvin Bassey", "DEF", "Fulham", 26, 31),
        ("Bruno Onyemaechi", "DEF", "Olympiacos", 26, 16),
        ("Wilfred Ndidi", "MID", "Besiktas", 28, 60),
        ("Frank Onyeka", "MID", "Augsburg", 27, 22),
        ("Alex Iwobi", "MID", "Fulham", 29, 78),
        ("Ademola Lookman", "FWD", "Atlanta United", 28, 34),
        ("Victor Osimhen", "FWD", "Galatasaray", 26, 38),
        ("Samuel Chukwueze", "FWD", "Fulham", 26, 38),
    ],
    "Côte d'Ivoire": [
        ("Yahia Fofana", "GK", "Angers", 25, 14),
        ("Serge Aurier", "DEF", "Galatasaray", 33, 95),
        ("Evan Ndicka", "DEF", "Roma", 26, 22),
        ("Willy Boly", "DEF", "Nottingham Forest", 34, 21),
        ("Ghislain Konan", "DEF", "Trabzonspor", 30, 30),
        ("Franck Kessié", "MID", "Al-Ahli", 28, 80),
        ("Ibrahim Sangaré", "MID", "Nottingham Forest", 28, 35),
        ("Seko Fofana", "MID", "Al-Ettifaq", 30, 30),
        ("Nicolas Pépé", "FWD", "Villarreal", 30, 50),
        ("Sébastien Haller", "FWD", "Utrecht", 31, 30),
        ("Simon Adingra", "FWD", "Sunderland", 23, 25),
    ],
    "Cameroon": [
        ("André Onana", "GK", "Trabzonspor", 29, 30),
        ("Collins Fai", "DEF", "Al-Tai", 32, 65),
        ("Michael Ngadeu-Ngadjui", "DEF", "Standard Liège", 34, 60),
        ("Christopher Wooh", "DEF", "Rennes", 24, 17),
        ("Nouhou Tolo", "DEF", "Charlotte FC", 28, 30),
        ("André-Frank Zambo Anguissa", "MID", "Napoli", 29, 60),
        ("Pierre Kunde", "MID", "Mainz", 30, 33),
        ("Karl Toko Ekambi", "MID", "Abha", 33, 56),
        ("Eric Maxim Choupo-Moting", "FWD", "Sunderland", 36, 75),
        ("Vincent Aboubakar", "FWD", "Hatayspor", 33, 100),
        ("Bryan Mbeumo", "FWD", "Manchester United", 26, 16),
    ],
    "Ghana": [
        ("Lawrence Ati-Zigi", "GK", "St. Gallen", 28, 23),
        ("Alexander Djiku", "DEF", "Fenerbahçe", 31, 41),
        ("Jonathan Mensah", "DEF", "New England Revolution", 35, 60),
        ("Mohammed Salisu", "DEF", "Monaco", 26, 22),
        ("Gideon Mensah", "DEF", "Auxerre", 27, 28),
        ("Thomas Partey", "MID", "Villarreal", 32, 55),
        ("Mohammed Kudus", "MID", "Tottenham", 25, 36),
        ("Salis Abdul Samed", "MID", "Lens", 25, 22),
        ("Jordan Ayew", "FWD", "Leicester", 34, 90),
        ("Antoine Semenyo", "FWD", "Bournemouth", 25, 18),
        ("Inaki Williams", "FWD", "Athletic Bilbao", 31, 17),
    ],
    "South Africa": [
        ("Ronwen Williams", "GK", "Mamelodi Sundowns", 33, 41),
        ("Khuliso Mudau", "DEF", "Mamelodi Sundowns", 30, 24),
        ("Mothobi Mvala", "DEF", "Al-Tai", 31, 33),
        ("Siyanda Xulu", "DEF", "AmaZulu", 33, 47),
        ("Aubrey Modiba", "DEF", "Mamelodi Sundowns", 30, 22),
        ("Teboho Mokoena", "MID", "Mamelodi Sundowns", 28, 30),
        ("Mothobi Bopape", "MID", "Polokwane City", 25, 12),
        ("Themba Zwane", "MID", "Mamelodi Sundowns", 36, 35),
        ("Lyle Foster", "FWD", "Burnley", 25, 16),
        ("Percy Tau", "FWD", "Al-Ahly", 31, 60),
        ("Mihlali Mayambela", "FWD", "Aris Limassol", 29, 22),
    ],
    # ------------------------------- CONCACAF (additional) -------------------------------
    "Costa Rica": [
        ("Keylor Navas", "GK", "Pumas", 39, 116),
        ("Francisco Calvo", "DEF", "Konyaspor", 33, 80),
        ("Juan Pablo Vargas", "DEF", "Millonarios", 30, 41),
        ("Carlos Martínez", "DEF", "Herediano", 29, 22),
        ("Bryan Oviedo", "DEF", "Real Salt Lake", 35, 80),
        ("Yeltsin Tejeda", "MID", "Herediano", 33, 90),
        ("Celso Borges", "MID", "Alajuelense", 37, 165),
        ("Brandon Aguilera", "MID", "Rio Ave", 22, 14),
        ("Joel Campbell", "FWD", "Alajuelense", 33, 130),
        ("Anthony Contreras", "FWD", "Herediano", 25, 28),
        ("Manfred Ugalde", "FWD", "Spartak Moscow", 23, 22),
    ],
    "Haiti": [
        ("Johny Placide", "GK", "Reims", 37, 41),
        ("Carlens Arcus", "DEF", "Avranches", 29, 37),
        ("Ricardo Adé", "DEF", "Cosenza", 24, 22),
        ("Jems Geffrard", "DEF", "Bandirmaspor", 31, 31),
        ("Soni Mustivar", "DEF", "Riga FC", 35, 36),
        ("Jean-Ricner Bellegarde", "MID", "Wolves", 27, 22),
        ("Carl Sainté", "MID", "Sochaux", 28, 16),
        ("Derrick Etienne Jr.", "MID", "Columbus Crew", 29, 31),
        ("Frantzdy Pierrot", "FWD", "Caen", 30, 28),
        ("Duckens Nazon", "FWD", "Sligo Rovers", 31, 50),
        ("Steeven Saba", "FWD", "Bordeaux", 27, 10),
    ],
    "Curaçao": [
        ("Eloy Room", "GK", "Columbus Crew", 36, 32),
        ("Cuco Martina", "DEF", "Riga FC", 36, 40),
        ("Juninho Bacuna", "DEF", "Birmingham", 28, 27),
        ("Bart Schenkeveld", "DEF", "Maccabi Haifa", 34, 24),
        ("Jeremy Antonisse", "DEF", "Almere City", 23, 7),
        ("Leandro Bacuna", "MID", "Birmingham", 34, 46),
        ("Tahith Chong", "MID", "Sheffield United", 26, 22),
        ("Roshon van Eijma", "MID", "Roda JC", 24, 11),
        ("Sontje Hansen", "FWD", "Middlesbrough", 23, 16),
        ("Tjaronn Chery", "FWD", "Maccabi Haifa", 37, 30),
        ("Kenji Gorré", "FWD", "AEL Limassol", 31, 23),
    ],
    "New Zealand": [
        ("Max Crocombe", "GK", "Burton Albion", 32, 26),
        ("Tyler Bindon", "DEF", "Reading", 21, 14),
        ("Michael Boxall", "DEF", "Minnesota United", 37, 56),
        ("Nando Pijnaker", "DEF", "Rapid Vienna", 26, 16),
        ("Liberato Cacace", "DEF", "Wrexham", 25, 31),
        ("Joe Bell", "MID", "Viking", 27, 36),
        ("Marko Stamenić", "MID", "Olympiacos", 24, 18),
        ("Matt Garbett", "MID", "Vancouver Whitecaps", 23, 25),
        ("Chris Wood", "FWD", "Nottingham Forest", 33, 81),
        ("Elijah Just", "FWD", "FC Helsingør", 26, 22),
        ("Kosta Barbarouses", "FWD", "Sydney FC", 35, 65),
    ],
}

# ---------------------------------------------------------------------------
# Injury / availability list (documented per user spec)
# Status: out | doubtful | suspended
# ---------------------------------------------------------------------------

INJURY_LIST: dict[str, dict[str, str]] = {
    "Kaoru Mitoma": {"team": "Japan", "status": "out", "reason": "hamstring"},
    "Takefusa Kubo": {"team": "Japan", "status": "out", "reason": "knee"},
    "Christian Pulisic": {"team": "USA", "status": "doubtful", "reason": "calf"},
    "Neymar": {"team": "Brazil", "status": "out", "reason": "calf"},
    "Éder Militão": {"team": "Brazil", "status": "out", "reason": "ACL"},
    "Wesley": {"team": "Brazil", "status": "out", "reason": "undisclosed"},
    "Billy Gilmour": {"team": "Scotland", "status": "out", "reason": "knee"},
}


# ---------------------------------------------------------------------------
# Player news fetcher — best-effort, tolerant
# ---------------------------------------------------------------------------

def fetch_player_news(player_name: str) -> dict[str, Any]:
    """Query ESPN soccer search for last-30-day form. Tolerant: timeouts → {}."""
    if not player_name:
        return {}
    query = urllib.parse.quote(player_name)
    url = f"https://site.api.espn.com/apis/search/v2?query={query}&limit=3&type=player"
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 jarvis-wc2026-profile"},
        )
        with urllib.request.urlopen(req, timeout=NEWS_TIMEOUT_S) as resp:  # noqa: S310 - public api
            raw = resp.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        results = data.get("results") or data.get("items") or []
        if not results:
            return {}
        first = results[0]
        return {
            "espn_id": first.get("id"),
            "display_name": first.get("displayName") or first.get("name"),
            "headline": (first.get("description") or first.get("summary") or "")[:280],
            "fetched_at": _dt.datetime.utcnow().isoformat() + "Z",
        }
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, OSError) as exc:
        LOG.debug("news fetch failed for %s: %s", player_name, exc)
        return {}


# ---------------------------------------------------------------------------
# Embedding — Ollama nomic-embed-text with deterministic hash fallback
# ---------------------------------------------------------------------------

def _hash_embedding(text: str, dim: int = FALLBACK_DIM) -> list[float]:
    """Deterministic, normalized pseudo-embedding for offline fallback."""
    if not text:
        return [0.0] * dim
    digest = hashlib.sha512(text.encode("utf-8")).digest()
    floats: list[float] = []
    for i in range(dim):
        b = digest[i % len(digest)]
        floats.append((b / 255.0) * 2.0 - 1.0)
    norm = math.sqrt(sum(f * f for f in floats)) or 1.0
    return [f / norm for f in floats]


def embed_profile(profile: dict[str, Any]) -> list[float]:
    """Embed a profile via Ollama; fall back to hash embedding on error."""
    text_parts: list[str] = []
    for key in ("name", "position", "club", "country"):
        val = profile.get(key)
        if val:
            text_parts.append(f"{key}: {val}")
    if "age" in profile:
        text_parts.append(f"age: {profile['age']}")
    if "caps" in profile:
        text_parts.append(f"caps: {profile['caps']}")
    if profile.get("injury"):
        text_parts.append(f"injury: {profile['injury']}")
    if profile.get("news_headline"):
        text_parts.append(f"news: {profile['news_headline']}")
    text = " | ".join(text_parts)

    payload = json.dumps({"model": EMBED_MODEL, "input": text}).encode("utf-8")
    url = f"{OLLAMA_HOST}/api/embed"
    try:
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=EMBED_TIMEOUT_S) as resp:  # noqa: S310 - local ollama
            raw = resp.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        embeddings = data.get("embeddings") or []
        if embeddings and isinstance(embeddings[0], list):
            return [float(x) for x in embeddings[0]]
        # ollama also supports {"embedding": [...]}
        embedding = data.get("embedding")
        if isinstance(embedding, list):
            return [float(x) for x in embedding]
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, OSError) as exc:
        LOG.debug("embed fallback for %s: %s", profile.get("name"), exc)
    return _hash_embedding(text)


# ---------------------------------------------------------------------------
# Team aggregation
# ---------------------------------------------------------------------------

def _injury_lookup(name: str, country: str) -> dict[str, str] | None:
    if name in INJURY_LIST:
        return INJURY_LIST[name]
    # fuzzy: surname match within same country
    for inj_name, inj in INJURY_LIST.items():
        if inj.get("team") != country:
            continue
        if name.split()[-1].lower() == inj_name.split()[-1].lower():
            return inj
    return None


def build_team_profile(country: str) -> dict[str, Any]:
    squad = SQUADS.get(country) or []
    if not squad:
        return {"country": country, "squad_size": 0, "best_effort": True}

    ages = [p[3] for p in squad if p[3] > 0]
    caps_per_player = [p[4] for p in squad if p[4] >= 0]
    top5_count = 0
    top_scorer_name = ""
    top_scorer_caps = -1
    for name, position, club, _age, caps in squad:
        if any(league_hint in club for league_hint in (
            "Manchester", "Chelsea", "Arsenal", "Liverpool", "Tottenham", "Newcastle",
            "Aston Villa", "Crystal Palace", "Brighton", "Fulham", "West Ham",
            "Real Madrid", "Barcelona", "Atlético Madrid", "Athletic Bilbao", "Sevilla",
            "Real Sociedad", "Villarreal", "Real Betis", "Getafe",
            "Bayern", "Dortmund", "Leverkusen", "Leipzig", "Eintracht", "Wolfsburg",
            "Hoffenheim", "Stuttgart", "Mainz", "Freiburg", "Borussia M",
            "Inter", "AC Milan", "Juventus", "Napoli", "Roma", "Lazio", "Fiorentina",
            "Bologna", "Torino", "Atalanta", "Como", "Genoa", "Verona",
            "PSG", "Marseille", "Monaco", "Lille", "Lyon", "Rennes", "Lens",
            "Nice", "Strasbourg", "Montpellier", "Nantes",
        )):
            top5_count += 1
        if position == "FWD" and caps > top_scorer_caps:
            top_scorer_caps = caps
            top_scorer_name = name

    absentees: list[dict[str, Any]] = []
    for name, position, club, _age, _caps in squad:
        inj = _injury_lookup(name, country)
        if inj:
            absentees.append({"name": name, "position": position, "club": club, **inj})

    avg_age = round(sum(ages) / len(ages), 1) if ages else 0.0
    total_caps = sum(caps_per_player)

    return {
        "country": country,
        "squad_size": len(squad),
        "avg_age": avg_age,
        "total_caps": total_caps,
        "top_5_league_players": top5_count,
        "top_scorer": top_scorer_name or None,
        "key_absentees": absentees,
        "best_effort": True,
    }


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def _build_player_record(country: str, player: Player, *, with_news: bool) -> dict[str, Any]:
    name, position, club, age, caps = player
    injury = _injury_lookup(name, country)
    record: dict[str, Any] = {
        "name": name,
        "country": country,
        "position": position,
        "club": club,
        "age": age,
        "caps": caps,
    }
    if injury:
        record["injury"] = injury
    if with_news:
        news = fetch_player_news(name)
        if news.get("headline"):
            record["news_headline"] = news["headline"]
        if news.get("espn_id"):
            record["espn_id"] = news["espn_id"]
    record["embedding"] = embed_profile(record)
    record["embedding_dim"] = len(record["embedding"])
    return record


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    with_news = "--with-news" in argv

    LOG.info("building profiles for %d teams (news=%s)", len(SQUADS), with_news)

    teams: list[dict[str, Any]] = []
    players: list[dict[str, Any]] = []
    for country, squad in SQUADS.items():
        team_profile = build_team_profile(country)
        teams.append(team_profile)
        for player in squad:
            try:
                players.append(_build_player_record(country, player, with_news=with_news))
            except Exception as exc:  # noqa: BLE001 - never crash on a single player
                LOG.warning("skipped %s/%s: %s", country, player[0], exc)

    bundle = {
        "meta": {
            "generated_at": _dt.datetime.utcnow().isoformat() + "Z",
            "best_effort": True,
            "notes": (
                "Squad lists are best-effort starting XIs for all 48 WC2026 teams. "
                "Accuracy is approximate; bench depth is not included in v1."
            ),
            "ollama_host": OLLAMA_HOST,
            "embed_model": EMBED_MODEL,
            "fallback_dim": FALLBACK_DIM,
            "team_count": len(teams),
            "player_count": len(players),
        },
        "teams": teams,
        "players": players,
        "injury_list": INJURY_LIST,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = OUT_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(OUT_PATH)

    LOG.info(
        "wrote %s (teams=%d players=%d size=%d bytes)",
        OUT_PATH, len(teams), len(players), OUT_PATH.stat().st_size,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
