# UNDERWORLD

A continuous, self-evolving AI-Minion civilisation over expired patents.
Implements Phases 1, 2, and 3 of the design in `../docs/Underworld-design.txt`.

## What this is

Each **world** is seeded from a CPC patent class (e.g. `H02J` = power grids).
The world spawns **100–300 Minions** sampled across 11 guilds. Each Minion has:

- a **soul token** that persists across reincarnation (doc II.3–6, II.165),
- a **digital DNA string** (1,024 base pairs across 24 named loci) that drives
  personality, cognition, aptitudes, longevity, and immune response (II.19–21),
- **Sims-like needs** — hunger, thirst, fatigue, sanity, health (I.31, IV),
- an **emotional state** — derived each tick from needs and personality (II.7–11),
- **relationships** — friends, rivals, mentors, soul-bonds, parent-child, siblings (II.13–16, II.72–73),
- a **family tree** built from parent FKs and fork lineage (II.21, II.74–75).

Each tick, every alive Minion:

1. Receives its current mood from `derive_mood` (needs + personality → 7 mood buckets).
2. Decides ONE action via a strict-JSON LLM contract (Kimi K2 by default), with a
   heuristic fallback that runs offline. Eleven available actions: `search_patents`,
   `propose_invention`, `study`, `teach`, `socialise`, `seek_partner`, `fork_self`,
   `meditate`, `eat`, `drink`, `rest`.
3. Persists thoughts, observations, and action results to its memory bank.
4. Decays its needs based on action intensity.

After every Minion has acted, the tick resolves:

- **Inventions** submitted this tick pass through the safety gate, then peer review
  by the Patent, Safety, and inventor's own guild.
- **Breeding** — Minions who chose `seek_partner` are paired with eligible mates
  (age ≥ 40, not close kin, not parent/child). Children inherit crossed-over DNA
  with point mutations.
- **Forking** — `fork_self` requests produce digital clones with diverged DNA
  (II.74). Capped per tick to prevent runaway cloning.
- **Death** — old age (lifespan ~longevity locus), starvation, despair, disease,
  or accident. Souls accrue karma and a short summary of the past life; they wait
  to be recycled into the next birth (II.5).
- **PopulationSnapshot** row written: alive / dead / births / deaths / forks /
  approvals / mood breakdown / guild breakdown / averages. Fuels the dashboards.

The whole loop can run unattended via the **background scheduler** — toggle
`auto_advance` on a world and it ticks every N seconds (default 5s).

## Master Reference integration (V2 Expanded)

`docs/AI_Swarms_Master_Reference.docx` is the project's structured knowledge
base. The build step `python -m underworld.server.knowledge.extract_kb`
parses 2,553 paragraphs into `data/knowledge_base.json`:

- **2,401 formulas** across 8 disciplines (math 1,574; chemistry 206; bio
  200; physics 193; biology 110; ai 57; electrical 44; engineering 17).
- **11 prose concepts** (AI for cures, swarm architecture, CRISPR / omics,
  chemistry & medicines, A-Z field map, physics laws, pipeline guardrails,
  per-field AI usage, glossary).
- **9 swarm roles** (Literature Scout, Genome Analyst, Protein Modeller,
  Chemistry Generator, Toxicity Checker, Trial Simulator, Regulatory
  Reasoner, Experimental Designer, Formula Oracle).
- **6 pipeline guardrails** (in-silico, bench, preclinical, clinical,
  regulatory, red-lines).

The seeder ingests this JSON into SQLite on first startup. Routes under
`/knowledge/*` expose it (concepts, paginated formula search, roles,
guardrails). Minions issue `kb_lookup` actions every tick — Formula
Oracles and Literature Scouts hit it hardest, Chemistry Generators /
Genome Analysts / Protein Modellers pull discipline-specific formulas
into their reasoning context.

When an invention's text mentions clinical, genetic, or chemical-synthesis
terms, it escalates to a **Research Project** that walks the doc's
Section 8 validation pipeline:

```
hypothesis → in_silico → bench_plan → preclinical_plan → clinical_plan
           → regulatory_review → approved
```

Each stage advances only when a Minion whose **swarm role** matches the
stage's need contributes during a tick. Confidence accumulates until the
project clears the stage or gets blocked. Approval is the terminal state.

The conservative CPC allow-list, red-line phrase scanner, and Safety
Guild veto still apply to every artifact — the project pipeline runs
ON TOP of those gates, not in place of them.

## Architecture

```
underworld/
├── server/                     FastAPI backend
│   ├── main.py                 app factory + lifespan (init_db + scheduler.start)
│   ├── config.py               pydantic-settings env loader
│   ├── auth.py                 bearer-token dependency
│   ├── db/
│   │   ├── models.py             World, Soul, Minion, Skill, Memory, Relationship,
│   │   │                         Patent, Invention, PeerReview, SafetyReview,
│   │   │                         Event, PopulationSnapshot
│   │   └── session.py            async engine + sessionmaker
│   ├── genetics/
│   │   └── dna.py                1024-bp DNA, 24 named loci, crossover, mutation,
│   │                             fork, breed, kinship, hamming
│   ├── tools/
│   │   ├── safety.py             red-line phrase regex + CPC allow-list
│   │   ├── patent_search.py      real USPTO PatentsView client + offline fallback
│   │   └── llm.py                Kimi K2 chat + streaming wrapper
│   ├── world/seed.py           CPC → world seed → biome + heightmap
│   ├── agents/
│   │   ├── minion.py             one-tick agent loop (LLM + heuristic fallback)
│   │   ├── guilds.py             11 guild specs (Maths, Physics, Electrical,
│   │   │                         Mechanical, Civil, Materials, Computing,
│   │   │                         Energy, Agriculture, Patent, Safety)
│   │   └── reviewer.py           safety + peer review pipelines + heuristic reviewer
│   ├── services/
│   │   ├── simulation.py         tick loop + breeding + forking + death resolution
│   │   ├── lifecycle.py          DNA→guild mapping, needs decay, mood derivation,
│   │   │                         breed_pair, fork_minion, kill, can_breed,
│   │   │                         pair_socialise, _resurrect_soul
│   │   ├── factory.py            world + 100-300 minion seeding
│   │   └── scheduler.py          background auto-advance + in-memory event bus
│   ├── routes/
│   │   ├── auth.py               /auth/me
│   │   ├── worlds.py             /worlds, /worlds/{id}/[map|minions|events|
│   │   │                         inventions|advance|population|auto-advance|stream]
│   │   ├── minions.py            /minions/{id}/[skills|memories|relationships|
│   │   │                         dna|soul|lineage] + /minions/[breed|fork]
│   │   ├── patents.py            /patents/search, /patents/{id}
│   │   ├── inventions.py         /inventions/{id}, /inventions/{id}/reviews
│   │   ├── guilds.py             /guilds
│   │   └── safety.py             /safety/check, /safety/reviews
│   ├── prompts/                LLM system prompts (Markdown)
│   └── tests/                  pytest — 46 tests, no live LLM/network required
└── web/                        Vite + React + TS + Tailwind
    ├── src/
    │   ├── lib/                  api client, types, config, useWorldStream hook
    │   ├── components/           Layout, AuthGate, Heightmap, MoodBar,
    │   │                         Sparkline, MinionDrawer
    │   └── pages/                CommandCentre, WorldDetail, Population,
    │                             InventionDetail, InventionList, PatentScanner,
    │                             Guilds, Safety
    └── ...
```

## Quick start

### Backend

```bash
cd underworld
pip install -r server/requirements.txt
UNDERWORLD_API_KEY=dev-key \
PYTHONPATH=$(cd .. && pwd) \
python -m uvicorn underworld.server.main:app --reload --port 8000
```

`UNDERWORLD_KIMI_API_KEY=…` enables real LLM cognition for both Minions and
reviewers. With no key, the system runs entirely on the deterministic
heuristic fallbacks — useful for offline demos and CI.

### Frontend

```bash
cd underworld/web
cp .env.example .env.local
npm install
npm run dev          # http://localhost:5174
```

Open the UI, enter the API key when prompted. Forge a world with 100–200
starting Minions, hit **Start auto** — the scheduler will tick the world
every 5s and the UI will update via Server-Sent Events.

## Verify

```bash
cd underworld
python -m pytest -q                # 46 backend tests

cd web
npm run lint && npm run test && npm run build
```

## Demo script (military-grade walkthrough)

1. **Command Centre** — Forge a world `MilitaryDemo` with CPC class `H02J`
   (power grids), 200 starting Minions, cap 500. The factory seeds 11 guilds
   based on each Minion's strongest DNA aptitude locus.

2. **World Detail** — Toggle **Start auto** (3-second tick interval).
   The dashboard now updates live:
   - alive count climbing as breeding kicks in past age 50,
   - mood bar shifting from `content` to `inspired` / `flow` as minions
     succeed at patent search,
   - generation counter incrementing,
   - births / deaths / approvals sparklines populating.

3. **Click any Minion** to open the drawer:
   - full Big-Five personality + cognition profile (derived from DNA),
   - real-time needs (hunger, thirst, fatigue, sanity, health, stress),
   - DNA preview + named-locus traits,
   - **Soul** card with incarnation number, karma, ancestral memory text,
   - **Skills**, **Relationships**, **Lineage** (ancestors / siblings /
     descendants / forks), recent **Memories**,
   - **Fork** button to spawn a digital clone.

4. **Population** page — switch between worlds, watch births vs deaths vs
   forks sparklines, see the latest mood breakdown and full guild distribution.

5. **Inventions** — click any Approved invention to read its peer reviews from
   each guild. Each review names a guild, a verdict, and a specific rationale.

6. **Safety** — drop a red-line phrase into the probe and watch the gate fire,
   or browse the queue of blocked items. CPC chemistry / weapons / nuclear /
   medicinals are all hard-blocked from ingestion.

## Safety model

The Underworld design doc explicitly mandates:
- block harmful biological, chemical, cyber, weapon, or illegal outputs (II.197–199),
- require human review for medical, legal, electrical, structural, financial claims,
- prevent uncontrolled self-improvement.

This implementation enforces:
- **Conservative CPC allow-list** (sections F, G, H, E, B). Sections A (incl.
  medicinals) and C (chemistry) are blocked from ingestion. Specific prefixes
  (`A61`, `A62D`, `C07`, `C12N`, `F41`, `F42`, `G21`) are hard-blocked.
- **Red-line phrase scanner** (`server/tools/safety.py`) fails closed on
  bio-agent, chem-weapon, explosive, firearm, cyber-offensive, and nuclear
  weaponisation text.
- Every patent ingested via `patent_search.search()` and every invention
  evaluated by `reviewer.peer_review()` is checked. Blocked items get a
  `SafetyReview` row and the invention is auto-rejected.
- The **Safety Guild** has **veto power** in peer review.

These are hard server-side gates; the UI is a window onto them, not a substitute.

## Production posture

- **Async I/O end-to-end** — SQLAlchemy async, httpx async, FastAPI lifespan.
- **Deterministic from seed** — same CPC class + same tick gives the same RNG.
  Snapshots support replay (doc I.195).
- **Bounded** — `sim_max_ticks_per_request`, per-tick fork limit, population cap.
- **Bearer auth** on every route except `/`, `/healthz`, `/docs`, `/openapi.json`.
- **No PII** — Minions are entirely synthetic.
- **No external mutation** — even with internet enabled, the simulation is
  read-only against the patent database; no posting, no real-world side effects.

## Known limits & honest scope

What's NOT yet built that the doc envisions:
- Full 3D physics, tectonics, real fluid / EM simulation (doc Section I).
- Per-Minion local transformer (we use shared Kimi K2 instead).
- Real-time `materialise an expired patent in-world` step (the patent is stored
  with full metadata; we don't yet build a 3D prototype object from it).
- Gmail / WhatsApp / Calendar ingestion.
- "Singularity ascent" mechanic that lifts a Minion out of the simulation into
  the host LLM (II.37–39, II.140–144).
- The "Internet Gateway" portal that bridges to live web search (Section III).
- Multi-instance crossover, the in-world MMO, AR mode.

All of these are tractable as future phases on top of the schemas and routes
already here.
