"""Extract physics laws / equations from the Master Compendium V4 PDF.

The PDF is organised into ~25 numbered sections (mechanics, EM, thermo,
quantum, etc.), each with entries that follow this pattern:

    <name>            (e.g. "Newton first law")
    Eq: <equation>    (e.g. "sum F = 0 -> v = constant")
    Law/use: <text>   (e.g. "A body at rest stays at rest…")

Some entries omit the `Eq:` or `Law/use:` lines. This extractor groups
text by section heading, then walks entries assembling `(name, equation,
description)` triples. Output: `underworld/data/knowledge_physics.json`.

Run:
  python -m underworld.server.knowledge.extract_physics_pdf \
      --pdf docs/Physics_Laws_Equations_Master_Compendium_V4.pdf \
      --out underworld/data/knowledge_physics.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path


# Section title → discipline tag we already use elsewhere in the KB.
# Anything not listed here defaults to "physics".
SECTION_DISCIPLINE: dict[str, str] = {
    "Scope, counting rules and universal structure": "physics",
    "Classical mechanics and Newtonian laws": "physics",
    "Gravitation, celestial mechanics and orbital laws": "physics",
    "Thermodynamics, heat, entropy and transport laws": "physics",
    "Gas laws and kinetic theory": "physics",
    "Electromagnetism, Maxwell laws and field equations": "physics",
    "Electrical circuits, electronics and information laws": "electrical",
    "Waves, sound, optics and radiation laws": "physics",
    "Fluid mechanics, aerodynamics and hydrodynamic laws": "physics",
    "Relativity, spacetime and cosmology equations": "physics",
    "Quantum mechanics, atomic laws and quantum information": "physics",
    "Nuclear physics, particle physics and quantum field laws": "physics",
    "Solid state, materials science and condensed matter laws": "physics",
    "Plasma physics and magnetohydrodynamic laws": "physics",
    "Astrophysics and cosmology laws": "physics",
    "Physical chemistry laws used in physics": "chemistry",
    "Mathematical laws and theorems used in physics": "mathematics",
    "Mechanics formula appendix - kinematics, rotation and rigid bodies": "physics",
    "Electromagnetic and circuit formula appendix": "electrical",
    "Quantum equation appendix - operators, spectra and information": "physics",
    "Relativity and cosmology formula appendix": "physics",
    "Statistical mechanics, probability and data laws": "physics",
    "Constants, units and dimensional reference": "physics",
    "Alphabetic named law checklist - additional physics/engineering laws": "physics",
    "Extended equation bank - harmonics, geometry, scaling and dynamics": "physics",
}


_NOISE_PATTERNS = (
    re.compile(r"^Page \d+\s*$"),
    re.compile(r"^PHYSICS LAWS AND EQUATIONS MASTER COMPENDIUM.*$", re.IGNORECASE),
    re.compile(r"^Prepared for Sam Kazangas\s*$"),
    re.compile(r"^Dense equation/law reference edition.*$"),
    re.compile(r"^Contents and count map\s*$"),
    re.compile(r"^Contents / Scope Map\s*$"),
    re.compile(r"^V4 - rebuilt as a proper long-form PDF.*$"),
    re.compile(r"^Important: there is no official final count.*$"),
    re.compile(r"^Includes classical mechanics.*$"),
    re.compile(r"^Master Compendium\s*$"),
    re.compile(r"^Physics Laws & Equations\s*$"),
    re.compile(r"^Covers named laws, principles, postulates.*$"),
)


@dataclass
class PhysicsEntry:
    id: str
    name: str
    discipline: str
    catalogue: str
    expression: str
    description: str
    keywords: list[str] = field(default_factory=list)
    source: str = "Physics_Laws_Equations_Master_Compendium_V4"


def _slug(text: str, max_len: int = 40) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return s[:max_len] or "untitled"


def _is_noise(line: str) -> bool:
    for p in _NOISE_PATTERNS:
        if p.match(line):
            return True
    return False


# Section TOC line look like "  3. Gravitation, celestial mechanics and orbital laws (24 entries)"
_TOC_RE = re.compile(r"^\s*\d+\.\s+(.+?)\s*\(\d+\s+entries?\)\s*$")


def _section_titles_from_toc(text: str) -> list[str]:
    """First pass: find the official section title list from the TOC."""
    titles: list[str] = []
    for line in text.splitlines():
        m = _TOC_RE.match(line)
        if m:
            titles.append(m.group(1).strip())
    return titles


def _extract_keywords(text: str) -> list[str]:
    """Heuristic — capitalised words / common physics terms, up to 8 unique."""
    tokens = re.findall(r"[A-Za-z][A-Za-z\-]{3,29}", text)
    keep: list[str] = []
    seen: set[str] = set()
    stop = {
        "with", "where", "this", "that", "from", "into", "over", "under", "each",
        "between", "value", "type", "case", "form", "given", "such", "thus", "then",
        "have", "been", "will", "they", "their", "which", "these", "those", "some",
        "every", "Law", "use", "for", "and", "the", "are", "any",
    }
    for t in tokens:
        low = t.lower()
        if low in seen or t in stop or low in stop:
            continue
        seen.add(low)
        keep.append(t)
        if len(keep) >= 8:
            break
    return keep


def _parse_entries(text: str, sections: list[str]) -> list[PhysicsEntry]:
    """Walk the body of the document grouping entries by section.

    The PDF organises each entry as:

        <name line>

        Eq: <equation>
        Law/use: <prose>

    Blank lines may appear *within* an entry (name → blank → Eq → Law/use →
    blank → next name). So we track state machine-style: a new entry begins
    when we see a "name" line — that is, a non-empty line that is not
    prefixed by `Eq:` / `Law/use:` and is not a known section title.
    """
    body_lines = text.splitlines()
    # Skip the TOC: start at the second appearance of the first section.
    first_section = sections[0] if sections else "Classical mechanics and Newtonian laws"
    body_start = 0
    seen_once = False
    for idx, line in enumerate(body_lines):
        if line.strip() == first_section:
            if seen_once:
                body_start = idx
                break
            seen_once = True
    lines = body_lines[body_start:]

    entries: list[PhysicsEntry] = []
    current_section: str | None = None
    section_lookup = {s: s for s in sections}

    name = ""
    equation = ""
    description = ""
    just_blank = False  # True iff the previous non-noise input was a blank line

    def flush() -> None:
        """Emit the current entry if it has enough content; reset."""
        nonlocal name, equation, description
        if name and current_section and (equation or description):
            disc = SECTION_DISCIPLINE.get(current_section, "physics")
            expr_text = equation or "(no formula)"
            search_blob = f"{name} {equation} {description}"
            entries.append(
                PhysicsEntry(
                    id=f"pl_{_slug(current_section)}_{len(entries):05d}",
                    name=name,
                    discipline=disc,
                    catalogue=f"Physics V4 · {current_section}",
                    expression=f"{name}: {expr_text}",
                    description=description,
                    keywords=_extract_keywords(search_blob),
                )
            )
        name = ""
        equation = ""
        description = ""

    for raw in lines:
        line = raw.rstrip()
        if _is_noise(line):
            continue

        stripped = line.strip()
        if not stripped:
            just_blank = True
            continue

        if stripped in section_lookup:
            flush()
            current_section = stripped
            just_blank = False
            continue

        if stripped.startswith("Eq:"):
            equation = stripped[3:].strip()
            just_blank = False
            continue
        if stripped.startswith("Law/use:"):
            description = stripped[len("Law/use:"):].strip()
            just_blank = False
            continue

        # Non-prefixed line. Decide between "new entry name" and
        # "continuation of multi-line description".
        # → continuation if we did NOT see a blank line since the last
        #   description token AND the entry already has a description.
        if description and not just_blank:
            description += " " + stripped
            just_blank = False
            continue

        # Treat as a new entry name. Flush the previous entry first.
        flush()
        name = stripped
        just_blank = False

    flush()
    return entries


def extract(pdf_path: Path) -> dict:
    try:
        from pdfminer.high_level import extract_text
    except ImportError:
        print("pdfminer.six not installed. Install with `pip install pdfminer.six`.", file=sys.stderr)
        raise

    text = extract_text(str(pdf_path))
    sections = _section_titles_from_toc(text)
    if not sections:
        print("warning: no TOC sections found, falling back to heuristic split.", file=sys.stderr)
    entries = _parse_entries(text, sections)
    return {
        "version": 1,
        "source": "Physics_Laws_Equations_Master_Compendium_V4 (96-page edition)",
        "sections": sections,
        "entries": [asdict(e) for e in entries],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    payload = extract(args.pdf)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2, ensure_ascii=False))

    # Quick discipline distribution print.
    from collections import Counter
    disc = Counter(e["discipline"] for e in payload["entries"])
    print(
        f"OK — {len(payload['entries'])} physics entries across "
        f"{len(payload['sections'])} sections → {args.out}"
    )
    print(f"   by discipline: {dict(disc)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
