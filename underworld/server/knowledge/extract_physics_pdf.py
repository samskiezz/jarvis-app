"""Extract every Physics V4 named-law entry into a JSON catalogue.

The V4 PDF (~96 pages, 894+ entries) is structured as:

    Section heading (its own line)
        <name>             ← left-aligned, terse, no punctuation tail
            Eq: <equation> ← indented two spaces, prefix `Eq:`
            Law/use: <use> ← indented two spaces, prefix `Law/use:`

The old extractor matched names but failed to capture equations or
sections — so the knowledge base ended up with 2241 entries all stamped
section="?" and equation="". This re-write uses `pdftotext -layout` to
preserve indentation, then a small state machine to walk entries.

Run via:
    python -m underworld.server.knowledge.extract_physics_pdf \
        --pdf docs/Physics_Laws_Equations_Master_Compendium_V4.pdf \
        --out underworld/data/knowledge_physics.json
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterator


# Section heading → discipline tag (read by /knowledge routes + minion
# kb_lookup so guild domains map onto V4 sections).
SECTION_DISCIPLINE: dict[str, str] = {
    "Scope, counting rules and universal structure":             "physics",
    "Classical mechanics and Newtonian laws":                    "mechanics",
    "Gravitation, celestial mechanics and orbital laws":         "mechanics",
    "Thermodynamics, heat, entropy and transport laws":          "thermodynamics",
    "Gas laws and kinetic theory":                               "thermodynamics",
    "Electromagnetism, Maxwell laws and field equations":        "electrical",
    "Electrical circuits, electronics and information laws":     "electrical",
    "Waves, sound, optics and radiation laws":                   "physics",
    "Fluid mechanics, aerodynamics and hydrodynamic laws":       "fluid",
    "Relativity, spacetime and cosmology equations":             "physics",
    "Quantum mechanics, atomic laws and quantum information":    "quantum",
    "Nuclear physics, particle physics and quantum field laws":  "quantum",
    "Solid state, materials science and condensed matter laws":  "materials",
    "Plasma physics and magnetohydrodynamic laws":               "physics",
    "Astrophysics and cosmology laws":                           "physics",
    "Physical chemistry laws used in physics":                   "chemistry",
    "Mathematical laws and theorems used in physics":            "mathematics",
    "Mechanics formula appendix - kinematics, rotation and rigid bodies":     "mechanics",
    "Electromagnetic and circuit formula appendix":              "electrical",
    "Quantum equation appendix - operators, spectra and information":         "quantum",
    "Relativity and cosmology formula appendix":                 "physics",
    "Statistical mechanics, probability and data laws":          "mathematics",
    "Constants, units and dimensional reference":                "physics",
    "Alphabetic named law checklist - additional physics/engineering laws":  "physics",
    "Extended equation bank - harmonics, geometry, scaling and dynamics":    "physics",
}


@dataclass
class Entry:
    name: str
    equation: str = ""
    description: str = ""
    section: str = ""
    discipline: str = "physics"
    page: int = 0


SECTION_HEADINGS = list(SECTION_DISCIPLINE.keys())


_PAGE_CHROME = re.compile(
    r"^(PHYSICS LAWS AND EQUATIONS MASTER COMPENDIUM|"
    r"Page \d+|"
    r"Covers named laws|"
    r"Physics Laws & Equations|"
    r"Master Compendium|"
    r"V\d+ -|"
    r"Prepared for|"
    r"Dense equation|"
    r"Important: there is|"
    r"Contents / Scope Map|"
    r"Includes classical mechanics)"
)


def _is_page_chrome(line: str) -> bool:
    s = line.strip()
    return bool(_PAGE_CHROME.search(s)) if s else False


def _is_section_heading(line: str) -> str | None:
    s = line.strip()
    for h in SECTION_HEADINGS:
        if s.lower() == h.lower() or s.lower().endswith(h.lower()):
            return h
    return None


def _pdftotext_layout(pdf: Path) -> Iterator[str]:
    res = subprocess.run(
        ["pdftotext", "-layout", str(pdf), "-"],
        capture_output=True, text=True, check=True,
    )
    yield from res.stdout.splitlines()


def parse_entries(pdf: Path) -> list[Entry]:
    entries: list[Entry] = []
    current_section: str = "Scope, counting rules and universal structure"
    cur: Entry | None = None
    page_no = 1
    last_field: str | None = None   # "equation" or "description" — for wrap-line append

    def flush():
        nonlocal cur, last_field
        if cur is None:
            return
        if cur.name and len(cur.name) >= 3 and not cur.name.startswith("."):
            entries.append(cur)
        cur = None
        last_field = None

    for line in _pdftotext_layout(pdf):
        m = re.search(r"\bPage (\d+)\b", line)
        if m:
            page_no = int(m.group(1))

        if _is_page_chrome(line):
            continue

        section_hit = _is_section_heading(line)
        if section_hit:
            flush()
            current_section = section_hit
            continue

        if not line.strip():
            continue

        if "Eq:" in line and line.lstrip().startswith("Eq:"):
            if cur is not None:
                cur.equation = (cur.equation + " " + line.split("Eq:", 1)[1].strip()).strip()
                last_field = "equation"
            continue
        if "Law/use:" in line and line.lstrip().startswith("Law/use:"):
            if cur is not None:
                cur.description = (cur.description + " " + line.split("Law/use:", 1)[1].strip()).strip()
                last_field = "description"
            continue
        if line.startswith(" ") and cur is not None:
            text = line.strip()
            if last_field == "equation":
                cur.equation = (cur.equation + " " + text).strip()
            elif last_field == "description":
                cur.description = (cur.description + " " + text).strip()
            elif cur.description:
                cur.description = (cur.description + " " + text).strip()
            elif cur.equation:
                cur.equation = (cur.equation + " " + text).strip()
            continue

        # Unindented line that isn't section/chrome → new entry name.
        flush()
        cur = Entry(
            name=line.strip(),
            section=current_section,
            discipline=SECTION_DISCIPLINE.get(current_section, "physics"),
            page=page_no,
        )

    flush()
    return entries


def write_json(entries: list[Entry], out: Path) -> None:
    payload = {
        "version": 2,
        "source": "Physics_Laws_Equations_Master_Compendium_V4 (96-page edition)",
        "sections": SECTION_HEADINGS,
        "entries": [asdict(e) for e in entries],
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args(argv)

    if not args.pdf.exists():
        print(f"PDF not found: {args.pdf}", file=sys.stderr)
        return 2

    entries = parse_entries(args.pdf)
    write_json(entries, args.out)

    by_section: dict[str, int] = {}
    eq_count = 0
    desc_count = 0
    for e in entries:
        by_section[e.section] = by_section.get(e.section, 0) + 1
        if e.equation: eq_count += 1
        if e.description: desc_count += 1

    print(f"Wrote {len(entries)} entries to {args.out}")
    print(f"  with equation: {eq_count} ({eq_count/len(entries)*100:.0f}%)")
    print(f"  with description: {desc_count} ({desc_count/len(entries)*100:.0f}%)")
    print(f"  sections (top 30):")
    for s, c in sorted(by_section.items(), key=lambda x: -x[1])[:30]:
        print(f"    {c:>4}  {s}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
