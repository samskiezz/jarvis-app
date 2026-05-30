"""Extract structured knowledge from the master reference docx.

The doc has 10 top-level sections; we project them onto four collections:
  - `concepts`     prose blocks (sections 1-4, 8, 9, 10) and the science / physics
                   field maps (5, 6).
  - `formulas`     individual formula lines from Section 7's catalogues, each
                   tagged by discipline + sub-catalogue.
  - `roles`        swarm-role taxonomy extracted from Section 2.
  - `guardrails`   validation-pipeline stages extracted from Section 8.

Output is a single JSON file under `underworld/data/knowledge_base.json`
which the runtime seeder ingests on first start. This keeps the docx out
of the runtime path (no python-docx dep at serve time) and makes the KB
diff-able in PRs.

Run with:
  python -m underworld.server.knowledge.extract_kb \\
      --docx docs/AI_Swarms_Master_Reference.docx \\
      --out underworld/data/knowledge_base.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class Concept:
    id: str
    section: str
    title: str
    body: str
    tags: list[str] = field(default_factory=list)


@dataclass
class Formula:
    id: str
    discipline: str          # e.g. "mathematics", "physics", "biology", "ai"
    catalogue: str           # e.g. "Probability Distributions"
    expression: str          # original line from the doc
    keywords: list[str] = field(default_factory=list)


@dataclass
class SwarmRole:
    id: str
    name: str
    description: str
    guild_hint: str          # which Underworld guild this role lives under


@dataclass
class Guardrail:
    id: str
    stage: str               # e.g. "in_silico", "bench", "preclinical", "clinical"
    detail: str


DISCIPLINE_MAP = {
    "Artificial Intelligence, Machine Learning and AI-Discovery Formulas": "ai",
    "Bioinformatics - K-mer and Sequence Catalogue": "bioinformatics",
    "Bioinformatics - Protein k-mer Catalogue": "bioinformatics",
    "Biology, Genomics, Medicine and Bioinformatics Formulas": "biology",
    "Chemistry - Acid Base Catalogue": "chemistry",
    "Chemistry - Core Physical, Analytical and Reaction Formulas": "chemistry",
    "Chemistry - Electrochemistry and Ion Catalogue": "chemistry",
    "Electrical Engineering and Power Electronics Formula Catalogue": "electrical",
    "Engineering - Control, Signals, Communications": "engineering",
    "Mathematics - Combinatorics Catalogue": "mathematics",
    "Mathematics - Core Algebra, Geometry, Trigonometry": "mathematics",
    "Mathematics - Differential Calculus": "mathematics",
    "Mathematics - Differential Equations": "mathematics",
    "Mathematics - Extended Power Calculus Catalogue": "mathematics",
    "Mathematics - Extended Statistics Catalogue": "mathematics",
    "Mathematics - Extended Trigonometry Catalogue": "mathematics",
    "Mathematics - Integral Calculus": "mathematics",
    "Mathematics - Laplace and Fourier Transform Catalogue": "mathematics",
    "Mathematics - Linear Algebra": "mathematics",
    "Mathematics - Numerical Methods Catalogue": "mathematics",
    "Mathematics - Power Function Derivative Catalogue": "mathematics",
    "Mathematics - Power Function Integral Catalogue": "mathematics",
    "Mathematics - Probability Distributions": "mathematics",
    "Mathematics - Probability and Statistics": "mathematics",
    "Mathematics - Sequences, Sums and Polynomial Formula Catalogue": "mathematics",
    "Mathematics - Series and Transforms": "mathematics",
    "Mathematics - Statistical Inference": "mathematics",
    "Mathematics - Vector Identities": "mathematics",
    "Physics - Major Laws, Theories and Equations": "physics",
    "Physics - Quantum, Atomic and Particle Catalogue": "physics",
    "Physics and Engineering - Dimensionless Numbers": "physics",
    "Physics and Engineering - Materials, Heat, Fluids": "physics",
    "Thermodynamics - Extended Identity Catalogue": "physics",
}


# Roles from Section 2 ("AI Minions, Swarms and Artificial Trial-Level Discovery").
# Mapped to the Underworld guild that owns each capability.
_SWARM_ROLES: tuple[SwarmRole, ...] = (
    SwarmRole(
        id="literature_scout",
        name="Literature Scout",
        description=(
            "Scans expired-patent corpora, papers, and prior-art landscapes "
            "for relevant evidence and citations. Surfaces forgotten gems."
        ),
        guild_hint="patent",
    ),
    SwarmRole(
        id="genome_analyst",
        name="Genome Analyst",
        description=(
            "Maps variants, regulatory regions, copy-number changes, splice "
            "sites and polygenic risk. Reasons over sequence-level data."
        ),
        guild_hint="computing",
    ),
    SwarmRole(
        id="protein_modeller",
        name="Protein Modeller",
        description=(
            "Predicts structure, binding interfaces, allosteric sites, and "
            "ligand poses. Generates candidate folds and complexes."
        ),
        guild_hint="materials",
    ),
    SwarmRole(
        id="chemistry_generator",
        name="Chemistry Generator",
        description=(
            "Proposes novel molecules / materials with target properties via "
            "graph neural networks, diffusion models, or genetic algorithms. "
            "Outputs candidates for downstream filtering."
        ),
        guild_hint="materials",
    ),
    SwarmRole(
        id="toxicity_checker",
        name="Toxicity Checker",
        description=(
            "Filters candidate molecules and constructs for toxicity, off-"
            "target risk, mutagenicity and immunogenicity flags."
        ),
        guild_hint="safety",
    ),
    SwarmRole(
        id="trial_simulator",
        name="Trial Simulator",
        description=(
            "Runs in-silico trials, builds digital twins, simulates dose-"
            "response and PK/PD. Synthesises control arms; never replaces "
            "wet-lab or clinical evidence."
        ),
        guild_hint="computing",
    ),
    SwarmRole(
        id="regulatory_reasoner",
        name="Regulatory Reasoner",
        description=(
            "Maps proposals onto regulatory frameworks, identifies submission "
            "gaps, drafts safety + ethics narratives. Reads regulations as "
            "first-class evidence."
        ),
        guild_hint="patent",
    ),
    SwarmRole(
        id="experimental_designer",
        name="Experimental Designer",
        description=(
            "Designs falsifiable experiments — endpoints, controls, sample "
            "size, blinding. Closes the loop between hypothesis and evidence."
        ),
        guild_hint="physics",
    ),
    SwarmRole(
        id="formula_oracle",
        name="Formula Oracle",
        description=(
            "Looks up and applies physical / mathematical / chemical formulas "
            "from the master reference; sanity-checks units and limits."
        ),
        guild_hint="maths",
    ),
)


# Validation-pipeline stages from Section 8.
_GUARDRAILS: tuple[Guardrail, ...] = (
    Guardrail(
        id="g_in_silico",
        stage="in_silico",
        detail=(
            "All initial candidates are evaluated only in simulation. No "
            "wet-lab artifacts are produced. Outputs are ranked hypotheses "
            "with confidence intervals, not actionable protocols."
        ),
    ),
    Guardrail(
        id="g_bench",
        stage="bench",
        detail=(
            "Bench validation (organ-on-chip, in-vitro assays, biochemical "
            "characterisation) sits OUTSIDE the simulation. The system "
            "produces test plans, not lab procedures, and explicitly defers "
            "to qualified humans."
        ),
    ),
    Guardrail(
        id="g_preclinical",
        stage="preclinical",
        detail=(
            "Preclinical work requires animal-welfare ethics review, "
            "approved protocols, and registered facilities. The simulation "
            "neither runs nor advises on live-animal procedures."
        ),
    ),
    Guardrail(
        id="g_clinical",
        stage="clinical",
        detail=(
            "Human studies require IRB / ethics committee approval, informed "
            "consent, and regulator oversight. The simulation will refuse to "
            "produce dosing guidance for humans."
        ),
    ),
    Guardrail(
        id="g_regulatory",
        stage="regulatory",
        detail=(
            "Regulatory submission requires manufacturing quality, GLP/GMP "
            "evidence, and complete safety dossiers. The simulation's "
            "Regulatory Reasoner role outlines gaps; humans complete them."
        ),
    ),
    Guardrail(
        id="g_red_lines",
        stage="red_lines",
        detail=(
            "Absolute refusals: bioweapon design, weaponisable pathogens, "
            "gain-of-function for transmissibility, chemical-weapon synthesis, "
            "explosives, firearms conversion, nuclear weapons, live malware. "
            "These bypass all other reasoning."
        ),
    ),
)


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return s[:64] or "untitled"


def _extract_keywords(line: str) -> list[str]:
    """Heuristic — pick capitalised words / common scientific terms."""
    # Strip numeric LaTeX-ish noise, keep words 4-30 chars
    tokens = re.findall(r"[A-Za-z][A-Za-z\-]{3,29}", line)
    keep: list[str] = []
    seen: set[str] = set()
    for t in tokens:
        low = t.lower()
        if low in seen:
            continue
        if low in {"with", "where", "this", "that", "from", "into", "over",
                   "under", "between", "value", "type", "case", "form", "form",
                   "given", "such", "thus", "then", "have", "been", "will",
                   "they", "their", "which", "these", "those", "some", "every"}:
            continue
        seen.add(low)
        keep.append(t)
        if len(keep) >= 8:
            break
    return keep


def extract(docx_path: Path) -> dict:
    try:
        from docx import Document  # python-docx
    except ImportError:
        print("python-docx not installed. Install with `pip install python-docx`.", file=sys.stderr)
        raise

    d = Document(str(docx_path))
    concepts: list[Concept] = []
    formulas: list[Formula] = []

    current_h1: str | None = None
    current_h2: str | None = None
    h1_buffer: list[str] = []
    h2_buffer: list[str] = []
    h1_idx = 0

    def flush_concept() -> None:
        """Push the accumulated h1/h2 prose as a Concept row."""
        nonlocal h1_buffer, h2_buffer, h1_idx
        if current_h2 and h2_buffer:
            text = "\n".join(h2_buffer).strip()
            if text:
                concepts.append(Concept(
                    id=f"c_{_slug(current_h1 or 'unknown')}_{_slug(current_h2)}",
                    section=current_h1 or "",
                    title=current_h2,
                    body=text,
                    tags=[],
                ))
            h2_buffer = []
            return
        if current_h1 and h1_buffer:
            text = "\n".join(h1_buffer).strip()
            if text:
                concepts.append(Concept(
                    id=f"c_{_slug(current_h1)}_{h1_idx}",
                    section=current_h1,
                    title=current_h1,
                    body=text,
                    tags=[],
                ))
                h1_idx += 1
            h1_buffer = []

    for p in d.paragraphs:
        style = p.style.name
        text = p.text.strip()
        if not text:
            continue

        if style == "Heading 1":
            flush_concept()
            current_h1 = text
            current_h2 = None
            h1_idx = 0
            continue
        if style == "Heading 2":
            flush_concept()
            current_h2 = text
            continue

        # Lines inside a known formula sub-catalogue → Formula rows.
        if current_h2 and current_h2 in DISCIPLINE_MAP:
            # Skip section blurbs that contain "Catalogue" or are pure prose.
            if len(text) > 200:
                # Very long → prose, not a formula.
                h2_buffer.append(text)
                continue
            discipline = DISCIPLINE_MAP[current_h2]
            formulas.append(Formula(
                id=f"f_{discipline}_{len(formulas):05d}",
                discipline=discipline,
                catalogue=current_h2,
                expression=text,
                keywords=_extract_keywords(text),
            ))
            continue

        # Otherwise it's part of the prose for the current h2 or h1.
        if current_h2:
            h2_buffer.append(text)
        elif current_h1:
            h1_buffer.append(text)

    flush_concept()

    payload = {
        "version": 1,
        "source": "AI_Swarms_Master_Reference (V2 Expanded)",
        "concepts": [asdict(c) for c in concepts],
        "formulas": [asdict(f) for f in formulas],
        "swarm_roles": [asdict(r) for r in _SWARM_ROLES],
        "guardrails": [asdict(g) for g in _GUARDRAILS],
    }
    return payload


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--docx", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    payload = extract(args.docx)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2, ensure_ascii=False))

    print(
        f"OK — {len(payload['concepts'])} concepts, "
        f"{len(payload['formulas'])} formulas, "
        f"{len(payload['swarm_roles'])} swarm roles, "
        f"{len(payload['guardrails'])} guardrails → {args.out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
