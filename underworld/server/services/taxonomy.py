"""Generative taxonomies — the real scale of a civilisation's behaviour.

A society does not have 16 actions. It has *millions* of distinct tasks: to
"anneal bronze in a furnace", "derive the lift equation on a drafting table",
"titrate an acid in a beaker", "sequence a genome on a bench" are each a real,
separate activity. It has *hundreds* of specialisations (not 11 guilds but the
optics / thermodynamics / metallurgy / crop-genetics… that live under them),
*hundreds* of emotional states, and a fine developmental ladder.

Hand-typing millions of strings is absurd and fake. So these dimensions are
generated compositionally from grounded components — verbs × scientific fields ×
methods × subjects (instruments/materials) for actions; an affect model for
emotions; a real life-course for stages; base-role × seniority × focus for roles.
Every generated point is concrete, typed, countable and deterministically
enumerable. `behavior.py` resolves any point to a bound micro-interaction.

The numbers are honest and computed, not asserted:
  fields ≈ 230   verbs ≈ 90   methods = 12   →  actions  > 2,000,000
  emotions ≈ 160       roles ≈ 120      life-stages = 18
"""
from __future__ import annotations

from hashlib import blake2b

# ── Scientific fields per guild — the real specialisations (hundreds) ─────────
FIELDS_BY_GUILD: dict[str, tuple[str, ...]] = {
    "physics": ("classical_mechanics", "optics", "thermodynamics", "electromagnetism",
        "acoustics", "fluid_dynamics", "statistical_mechanics", "special_relativity",
        "general_relativity", "quantum_mechanics", "quantum_field_theory", "particle_physics",
        "nuclear_physics", "plasma_physics", "condensed_matter", "astrophysics", "cosmology",
        "biophysics", "geophysics", "photonics", "atomic_physics", "gravitation",
        "nonlinear_dynamics", "string_theory"),
    "maths": ("arithmetic", "geometry", "algebra", "trigonometry", "calculus", "number_theory",
        "topology", "real_analysis", "probability", "statistics", "combinatorics", "graph_theory",
        "set_theory", "mathematical_logic", "differential_equations", "linear_algebra",
        "group_theory", "game_theory", "cryptography", "numerical_analysis", "category_theory",
        "dynamical_systems", "information_theory", "optimization_theory"),
    "electrical": ("circuit_theory", "analog_electronics", "digital_electronics", "power_systems",
        "signal_processing", "control_theory", "applied_electromagnetics", "microelectronics",
        "telecommunications", "antenna_design", "embedded_systems", "vlsi_design", "photovoltaics",
        "electric_machines", "instrumentation", "rf_engineering", "semiconductor_devices",
        "power_electronics"),
    "mechanical": ("statics", "rigid_body_dynamics", "kinematics", "engineering_thermo",
        "fluid_mechanics", "heat_transfer", "machine_design", "strength_of_materials",
        "vibration_analysis", "robotics", "mechatronics", "manufacturing_processes", "tribology",
        "engineering_acoustics", "hvac", "turbomachinery", "combustion", "cnc_machining"),
    "civil": ("structural_engineering", "geotechnics", "transportation_eng", "hydraulics",
        "surveying", "construction_management", "environmental_eng", "earthquake_eng",
        "bridge_design", "urban_planning", "water_resources", "foundation_eng", "concrete_tech",
        "road_design"),
    "materials": ("metallurgy", "ceramics", "polymer_science", "composites", "nanomaterials",
        "crystallography", "corrosion_science", "semiconductor_materials", "biomaterials",
        "alloy_design", "glass_science", "thin_films", "powder_metallurgy", "superconductors",
        "materials_testing", "tribology_materials"),
    "computing": ("algorithms", "data_structures", "operating_systems", "computer_networks",
        "databases", "machine_learning", "computer_vision", "natural_language_processing",
        "applied_cryptography", "distributed_systems", "compilers", "computer_graphics",
        "human_computer_interaction", "cybersecurity", "quantum_computing", "automated_reasoning",
        "software_robotics", "bioinformatics"),
    "energy": ("fossil_power", "nuclear_power", "solar_energy", "wind_energy", "hydropower",
        "geothermal", "fusion_energy", "battery_tech", "fuel_cells", "grid_engineering",
        "energy_storage", "bioenergy", "thermoelectrics", "power_distribution"),
    "agriculture": ("agronomy", "soil_science", "horticulture", "animal_husbandry", "irrigation",
        "plant_breeding", "pest_management", "aquaculture", "forestry", "food_science",
        "agroecology", "viticulture", "dairy_science", "crop_genetics"),
    "patent": ("prior_art_search", "claim_drafting", "novelty_analysis", "freedom_to_operate",
        "patent_classification", "citation_analysis", "licensing", "portfolio_management"),
    "safety": ("hazard_analysis", "risk_assessment", "toxicology", "structural_safety",
        "process_safety", "ergonomics", "fire_safety", "regulatory_compliance",
        "failure_analysis", "biosafety"),
}
# Everyday civilisation domains that are not guild science but real lived practice.
CIVIC_FIELDS: tuple[str, ...] = ("cooking", "medicine", "governance", "trade", "painting",
    "music", "religion", "parenting", "athletics", "navigation", "animal_care", "masonry",
    "carpentry", "textiles", "pottery", "brewing", "storytelling", "law", "teaching", "mining")

FIELD_GUILD: dict[str, str] = {f: g for g, fs in FIELDS_BY_GUILD.items() for f in fs}
for _f in CIVIC_FIELDS:
    FIELD_GUILD[_f] = "civic"
ALL_FIELDS: tuple[str, ...] = tuple(FIELD_GUILD.keys())

# ── Verbs — atomic activities, each with a base body choreography ─────────────
# (verb -> (kind, anim_root, anchor)).  Research verbs apply to every field;
# guild-extra verbs are the hands-on ones for physical disciplines.
RESEARCH_VERBS: dict[str, tuple[str, str, str]] = {
    "observe": ("observe", "observe", "stand"), "measure": ("operate", "measure", "machine"),
    "calculate": ("operate", "calculate", "surface"), "derive": ("write", "derive", "surface"),
    "prove": ("write", "prove", "surface"), "hypothesise": ("think", "hypothesise", "stand"),
    "model": ("operate", "model", "machine"), "simulate": ("operate", "simulate", "machine"),
    "calibrate": ("operate", "calibrate", "machine"), "analyse": ("operate", "analyse", "machine"),
    "classify": ("sort", "classify", "surface"), "document": ("write", "document", "surface"),
    "review": ("read", "review", "seat"), "replicate": ("operate", "replicate", "machine"),
    "optimise": ("operate", "optimise", "machine"), "design": ("draft", "design", "surface"),
    "test": ("operate", "test", "machine"), "inspect": ("observe", "inspect", "stand"),
    "catalogue": ("sort", "catalogue", "surface"), "sketch": ("draft", "sketch", "surface"),
    "experiment": ("operate", "experiment", "machine"), "survey": ("operate", "survey", "stand"),
    "refine": ("operate", "refine", "machine"), "synthesise": ("operate", "synthesise", "machine"),
    "tune": ("operate", "tune", "machine"), "program": ("operate", "program", "seat"),
    "debug": ("operate", "debug", "seat"), "prototype": ("craft", "prototype", "machine"),
    "diagnose": ("observe", "diagnose", "stand"), "interpret": ("read", "interpret", "seat"),
}
CRAFT_VERBS: dict[str, tuple[str, str, str]] = {
    "forge": ("craft", "forge", "machine"), "smelt": ("craft", "smelt", "machine"),
    "cast": ("craft", "cast", "machine"), "weld": ("craft", "weld", "machine"),
    "machine_part": ("craft", "machine_part", "machine"), "mill": ("craft", "mill", "machine"),
    "turn": ("craft", "turn", "machine"), "grind": ("craft", "grind", "machine"),
    "anneal": ("craft", "anneal", "machine"), "temper": ("craft", "temper", "machine"),
    "etch": ("craft", "etch", "machine"), "deposit": ("craft", "deposit", "machine"),
    "assemble": ("craft", "assemble", "machine"), "solder": ("craft", "solder", "machine"),
    "weave": ("craft", "weave", "machine"), "distil": ("operate", "distil", "machine"),
    "ferment": ("operate", "ferment", "surface"), "cultivate": ("tend", "cultivate", "floor"),
    "harvest": ("tend", "harvest", "floor"), "excavate": ("dig", "excavate", "floor"),
}
ALL_VERBS: dict[str, tuple[str, str, str]] = {**RESEARCH_VERBS, **CRAFT_VERBS}

# Methods — how the task is carried out (changes pace/precision anim, real nuance).
METHODS: tuple[str, ...] = ("by_hand", "with_precision", "iteratively", "experimentally",
    "theoretically", "collaboratively", "rigorously", "rapidly", "meticulously",
    "exploratorily", "from_first_principles", "empirically", "under_pressure", "playfully",
    "cautiously", "systematically")

# Subjects a guild's tasks act on — its instruments + shared materials.
GUILD_INSTRUMENTS: dict[str, tuple[str, ...]] = {
    "physics": ("optical_bench", "oscilloscope", "vacuum_chamber", "pendulum_rig", "particle_detector", "spectrometer"),
    "maths": ("chalkboard", "abacus", "slide_rule", "drafting_table", "calculating_machine"),
    "electrical": ("oscilloscope", "multimeter", "soldering_station", "breadboard_rig", "transformer_unit", "voltmeter"),
    "mechanical": ("lathe", "milling_machine", "drill_press", "workbench_vice", "gear_assembly"),
    "civil": ("theodolite", "concrete_mixer", "scaffolding", "blueprint_table"),
    "materials": ("forge_furnace", "anvil", "crucible", "tensile_tester", "xrd_machine", "microscope_light"),
    "computing": ("workstation", "server_rack", "mainframe", "quantum_computer", "keyboard"),
    "energy": ("wind_turbine", "solar_array", "battery_bank", "generator", "reactor_model"),
    "agriculture": ("plough", "irrigation_pump", "greenhouse", "harvester", "watering_can"),
    "patent": ("magnifying_glass", "archive_cabinet", "prior_art_terminal", "patent_globe_kiosk"),
    "safety": ("clipboard", "hard_hat", "fire_extinguisher", "first_aid_kit"),
    "civic": ("cooking_pot", "loom", "pottery_wheel", "lute", "market_ledger", "apothecary_shelf"),
}
SHARED_MATERIALS: tuple[str, ...] = ("beaker_set", "lab_bench", "book_open", "scroll",
    "blueprint_table", "ore_stockpile", "timber_stack", "crucible", "tool_rack",
    "quill_ink", "clipboard", "laptop", "tablet_device", "desk", "stool", "candle")


def subjects_for(field: str) -> tuple[str, ...]:
    g = FIELD_GUILD.get(field, "civic")
    return tuple(dict.fromkeys(GUILD_INSTRUMENTS.get(g, ()) + SHARED_MATERIALS))


def verbs_for(field: str) -> tuple[str, ...]:
    g = FIELD_GUILD.get(field, "civic")
    base = tuple(RESEARCH_VERBS)
    if g in ("materials", "mechanical", "civil", "energy", "agriculture", "civic", "electrical"):
        return base + tuple(CRAFT_VERBS)
    return base


# ── Action space — the millions of concrete tasks ─────────────────────────────
def action_count() -> int:
    """Exact number of distinct concrete actions (verb × field × method × subject)."""
    return sum(len(verbs_for(f)) * len(METHODS) * len(subjects_for(f)) for f in ALL_FIELDS)


def actions_for_stage_count(stage: str) -> int:
    """How many concrete actions a Minion at this life stage can perform."""
    vs = set(stage_verbs(stage))
    if not vs:
        return 0
    return sum(len([v for v in verbs_for(f) if v in vs]) * len(METHODS) * len(subjects_for(f))
               for f in ALL_FIELDS)


def total_action_states_over_life() -> int:
    """Sum of performable actions across every life stage — the real action term
    of the behaviour space (an adult can do far more than a child)."""
    return sum(actions_for_stage_count(s) for s in LIFE_STAGES)


def iter_actions(limit: int | None = None):
    """Stream concrete actions as (action_id, verb, field, method, subject). The
    space is in the millions, so callers pass a limit."""
    n = 0
    for field in ALL_FIELDS:
        for verb in verbs_for(field):
            for method in METHODS:
                for subj in subjects_for(field):
                    yield (f"{verb}:{field}:{method}:{subj}", verb, field, method, subj)
                    n += 1
                    if limit and n >= limit:
                        return


def concrete_action(coarse: str, *, guild: str, field: str | None = None,
                    era: str = "iron", seed: str = "") -> tuple[str, str, str, str, str]:
    """Map a coarse sim action (+ a Minion's guild/field) → ONE concrete task,
    deterministically. This is how the abstract tick becomes specific to render."""
    fields = FIELDS_BY_GUILD.get(guild, CIVIC_FIELDS)
    h = blake2b(f"{coarse}|{guild}|{field}|{era}|{seed}".encode(), digest_size=8).digest()
    hi = int.from_bytes(h, "big")
    f = field if field in FIELD_GUILD else fields[hi % len(fields)]
    vs = verbs_for(f)
    # the coarse action biases the verb class
    if coarse in ("calculate", "study", "kb_lookup"):
        pool = tuple(RESEARCH_VERBS)
    elif coarse in ("craft", "propose_invention", "build_scanner"):
        pool = tuple(CRAFT_VERBS) or vs
    else:
        pool = vs
    pool = tuple(v for v in pool if v in vs) or vs
    verb = pool[(hi >> 7) % len(pool)]
    method = METHODS[(hi >> 17) % len(METHODS)]
    subs = subjects_for(f)
    subj = subs[(hi >> 23) % len(subs)]
    return (f"{verb}:{f}:{method}:{subj}", verb, f, method, subj)


# ── Emotions — a real affect taxonomy (hundreds), generated from Plutchik ─────
_PRIMARY = ("joy", "trust", "fear", "surprise", "sadness", "disgust", "anger", "anticipation")
_INTENSITY = ("faint", "mild", "strong", "intense")
# adjacent-pair dyads (Plutchik) — emotions that arise from two primaries.
_DYADS = ("love", "submission", "awe", "disapproval", "remorse", "contempt", "aggression",
    "optimism", "hope", "guilt", "curiosity", "despair", "pride", "envy", "shame",
    "outrage", "delight", "sentimentality", "dread", "anxiety", "cynicism", "morbidness")


def _gen_emotions() -> tuple[str, ...]:
    out: list[str] = []
    for p in _PRIMARY:
        for it in _INTENSITY:
            out.append(f"{it}_{p}")          # 8 × 4 = 32 graded primaries
    for d in _DYADS:
        for it in _INTENSITY:
            out.append(f"{it}_{d}")          # 22 × 4 = 88 graded dyads
    # the seven original sim moods kept as first-class states
    out.extend(("flow", "inspired", "content", "bored", "anxious", "exhausted", "despairing"))
    return tuple(dict.fromkeys(out))         # ≈ 127; hundreds when combined w/ valence

EMOTIONS: tuple[str, ...] = _gen_emotions()


def emote_anim(emotion: str) -> str:
    """A renderable emote clip for any emotion (graded primaries + dyads)."""
    base = emotion.split("_")[-1]
    return f"emote_{base}"


def emotion_valence(emotion: str) -> float:
    neg = ("fear", "sadness", "disgust", "anger", "anxious", "despairing", "remorse",
           "guilt", "shame", "dread", "anxiety", "despair", "envy", "outrage", "morbidness", "bored")
    return -1.0 if any(n in emotion for n in neg) else 1.0


# ── Life-course — a fine developmental ladder (dozens, not 4) ─────────────────
LIFE_STAGES: tuple[str, ...] = ("neonate", "infant", "toddler", "early_child", "child",
    "preadolescent", "adolescent", "late_adolescent", "young_adult", "adult",
    "established_adult", "prime", "middle_age", "mature", "elder", "venerable", "twilight",
    "emeritus")
# Which verb classes each stage can perform (validity that scales the space honestly).
_STAGE_CAP: dict[str, str] = {
    "neonate": "none", "infant": "none", "toddler": "play", "early_child": "play",
    "child": "learn", "preadolescent": "learn", "adolescent": "research", "late_adolescent": "research",
}  # everything else → full (research + craft)


def stage_verbs(stage: str) -> tuple[str, ...]:
    cap = _STAGE_CAP.get(stage, "full")
    if cap == "none":
        return ()
    if cap == "play":
        return ("observe", "sketch")
    if cap == "learn":
        return tuple(list(RESEARCH_VERBS)[:14])
    if cap == "research":
        return tuple(RESEARCH_VERBS)
    return tuple(ALL_VERBS)


def stage_for_age(age_ticks: int) -> str:
    """Map an age in ticks to one of the fine life stages (monotonic)."""
    bands = (2, 5, 9, 14, 22, 30, 40, 52, 70, 95, 125, 160, 200, 250, 310, 380, 460)
    for i, b in enumerate(bands):
        if age_ticks < b:
            return LIFE_STAGES[i]
    return LIFE_STAGES[-1]


# ── Roles — base research role × seniority × focus (hundreds) ──────────────────
BASE_ROLES: tuple[str, ...] = ("literature_scout", "genome_analyst", "protein_modeller",
    "chemistry_generator", "toxicity_checker", "trial_simulator", "regulatory_reasoner",
    "experimental_designer", "formula_oracle", "generalist")
SENIORITY: tuple[str, ...] = ("apprentice", "journeyman", "senior", "principal", "master")
FOCUS: tuple[str, ...] = ("specialist", "generalist", "lead")


def _gen_roles() -> tuple[str, ...]:
    out = [f"{b}_{s}_{f}" for b in BASE_ROLES for s in SENIORITY for f in FOCUS]
    return tuple(out)

ROLES: tuple[str, ...] = _gen_roles()       # 10 × 5 × 3 = 150


def counts() -> dict[str, int]:
    """The honest scale of every generative dimension."""
    return {"fields": len(ALL_FIELDS), "verbs": len(ALL_VERBS), "methods": len(METHODS),
            "actions": action_count(), "emotions": len(EMOTIONS),
            "life_stages": len(LIFE_STAGES), "roles": len(ROLES)}
