"""The behavior bridge — abstract sim-state → continuous, renderable life.

The simulation thinks in 16 coarse actions (minion.py::_ACTIONS) plus rich
numeric state (guild, role, mood, needs, life-stage, project-stage, epoch,
biome, time-of-day). A renderer needs the opposite: a *continuous stream of
micro-interactions* — go to the bench, sit, pick up the microscope, focus it,
react, emote — each bound to an animation clip, an anchor, and an object GLB.

Hand-listing those is hopeless: the context space is in the millions. So this
module is a **deterministic procedural expander**. Given a `Context` (one point
in that space) it computes the micro-behavior sequence on the fly. The same
context always yields the same sequence (renderer-safe, testable), but the space
it covers is > 1,000,000 distinct lived moments — generated, not enumerated.

`coverage.py` / test_behavior.py prove two things against the sim's own enums:
  1. the valid context space exceeds one million, and
  2. every context resolves to a non-empty, fully asset-bound sequence
     (and reports any object id not yet in the GLB catalogue → the new list).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import blake2b

# ── Real simulation dimensions (kept in sync with the backend enums) ──────────
# Sourced from server/agents/minion.py::_ACTIONS and server/db/models.py.
ACTIONS = (
    "search_patents", "propose_invention", "propose_with_party", "build_scanner",
    "seek_ascension", "study", "rest", "eat", "drink", "socialise",
    "seek_partner", "meditate", "fork_self", "teach", "kb_lookup", "calculate",
)
GUILDS = (
    "maths", "physics", "electrical", "mechanical", "civil", "materials",
    "computing", "energy", "agriculture", "patent", "safety",
)
ROLES = (
    "literature_scout", "genome_analyst", "protein_modeller", "chemistry_generator",
    "toxicity_checker", "trial_simulator", "regulatory_reasoner",
    "experimental_designer", "formula_oracle", "generalist",
)
MOODS = ("flow", "inspired", "content", "bored", "anxious", "exhausted", "despairing")
LIFE_STAGES = ("infant", "child", "adolescent", "adult")
PROJECT_STAGES = (
    "hypothesis", "in_silico", "bench_plan", "preclinical_plan", "clinical_plan",
    "regulatory_review", "approved", "blocked", "abandoned",
)
TIMES_OF_DAY = ("dawn", "day", "dusk", "night")
BIOMES = ("desert", "mountains", "plateau", "forest", "hills", "plains")
ERAS = ("stone", "bronze", "iron", "industrial", "information", "quantum")

# Which actions each life-stage is physically capable of (validity gate). An
# infant cannot propose an invention; this keeps the generated space realistic.
ALLOWED_BY_STAGE: dict[str, frozenset[str]] = {
    "infant": frozenset({"rest", "eat", "drink", "socialise"}),
    "child": frozenset({"rest", "eat", "drink", "socialise", "study", "kb_lookup", "meditate"}),
    "adolescent": frozenset(set(ACTIONS) - {"fork_self", "seek_ascension", "build_scanner"}),
    "adult": frozenset(ACTIONS),
}

# ── Object bindings (which GLB each context reaches for) ──────────────────────
# Guild work tool — yielded when a guild minion works (mirrors interactions.GUILD_TOOLS).
GUILD_TOOL: dict[str, str] = {
    "materials": "microscope_light", "mechanical": "lathe", "electrical": "oscilloscope",
    "civil": "theodolite", "physics": "optical_bench", "maths": "chalkboard",
    "computing": "workstation", "energy": "generator", "agriculture": "plough",
    "patent": "magnifying_glass", "safety": "clipboard",
}
# The signature workstation for each research role (design_list 'role' category).
ROLE_STATION: dict[str, str] = {
    "literature_scout": "role_literature_scout_carrel",
    "genome_analyst": "role_genome_analyst_station",
    "protein_modeller": "role_protein_modeller_display",
    "chemistry_generator": "role_chemistry_generator_hood",
    "toxicity_checker": "role_toxicity_checker_cabinet",
    "trial_simulator": "role_trial_simulator_console",
    "regulatory_reasoner": "role_regulatory_reasoner_desk",
    "experimental_designer": "role_experimental_designer_board",
    "formula_oracle": "role_formula_oracle_orb",
    "generalist": "desk",
}
# Calculation aid by era (history changes the tool, not just the trophy).
CALC_TOOL_BY_ERA: dict[str, str] = {
    "stone": "chalkboard", "bronze": "abacus", "iron": "slide_rule",
    "industrial": "calculating_machine", "information": "workstation",
    "quantum": "quantum_computer",
}
# Each project-stage is a different visible activity (ProjectStage enum).
STAGE_STEP: dict[str, tuple[str, str, str]] = {  # stage -> (verb, object, anim)
    "hypothesis": ("sketch", "chalkboard", "write_standing"),
    "in_silico": ("operate", "workstation", "type_seated"),
    "bench_plan": ("operate", "lab_bench", "operate_bench"),
    "preclinical_plan": ("operate", "petri_dish", "pipette_work"),
    "clinical_plan": ("operate", "role_trial_simulator_console", "monitor_watch"),
    "regulatory_review": ("stamp", "role_regulatory_reasoner_desk", "stamp_doc"),
    "approved": ("celebrate", "discovery_eureka_lamp", "cheer"),
    "blocked": ("react", "peer_review_verdict_board", "head_shake"),
    "abandoned": ("leave", "archive_cabinet", "sigh_walk"),
}
# Mood colours the emote + the motion style (anim suffix).
MOOD_EMOTE: dict[str, tuple[str, str]] = {  # mood -> (emote_anim, motion_suffix)
    "flow": ("nod_focused", "_brisk"),
    "inspired": ("eyes_light_up", "_lively"),
    "content": ("soft_smile", "_calm"),
    "bored": ("yawn", "_listless"),
    "anxious": ("fidget", "_tense"),
    "exhausted": ("slump", "_weary"),
    "despairing": ("head_in_hands", "_heavy"),
}
# Time-of-day prelude (night work lights a lamp; dawn stretches).
TOD_PRELUDE: dict[str, tuple[str, str, str] | None] = {
    "dawn": ("stretch", "", "stretch"),
    "day": None,
    "dusk": None,
    "night": ("light", "candle", "light_candle"),
}


@dataclass(frozen=True)
class MicroStep:
    verb: str           # goto | sit | stand | pick_up | put_down | operate | read | write |
                        # eat_bite | drink_sip | talk | observe | react | emote | sleep | …
    obj: str            # the GLB id this step acts on ("" = none / locomotion)
    anim: str           # animation clip the character plays
    anchor: str         # seat | surface | handheld | floor | machine | none
    seconds: float = 2.0
    fx: str = ""        # optional vfx tag (eg "eureka_glow", "zzz")


@dataclass(frozen=True)
class Context:
    action: str
    guild: str = "maths"
    role: str = "generalist"
    mood: str = "content"
    life_stage: str = "adult"
    project_stage: str = "hypothesis"
    time_of_day: str = "day"
    biome: str = "plains"
    era: str = "iron"

    def key(self) -> str:
        return "|".join((self.action, self.guild, self.role, self.mood, self.life_stage,
                          self.project_stage, self.time_of_day, self.biome, self.era))


def _variant(ctx: Context, options: tuple[str, ...]) -> str:
    """Deterministic pick among interchangeable anims — variety without randomness."""
    h = blake2b(ctx.key().encode(), digest_size=4).digest()
    return options[int.from_bytes(h, "big") % len(options)]


# Locations each action happens at (drives the opening "go to" step + ambient).
_LOCATION: dict[str, str] = {
    "rest": "bed_double", "eat": "table_dining", "drink": "kitchen_counter",
    "study": "desk", "kb_lookup": "bookshelf", "teach": "lectern",
    "meditate": "meditation_cushion", "socialise": "park_bench",
    "seek_partner": "partner_courtship_bench", "calculate": "lab_bench",
    "propose_invention": "invention_prototype_bench", "propose_with_party": "collaboration_round_table",
    "search_patents": "prior_art_terminal", "build_scanner": "patent_scanner",
    "seek_ascension": "ascension_altar", "fork_self": "fork_pod",
}

# Whether an action is "work" (gets the guild tool + project-stage choreography).
_WORK = {"calculate", "propose_invention", "propose_with_party", "study",
         "search_patents", "build_scanner", "teach"}


def expand(ctx: Context) -> list[MicroStep]:
    """Compute the full micro-behavior sequence for one context. Deterministic."""
    if ctx.action not in ALLOWED_BY_STAGE.get(ctx.life_stage, frozenset()):
        # Not capable at this life-stage → a gentle idle/observe fallback (still bound).
        return [MicroStep("observe", _LOCATION.get(ctx.action, "park_bench"),
                          "watch_curious", "none", 3.0)]

    steps: list[MicroStep] = []
    _, suffix = MOOD_EMOTE[ctx.mood]
    loc = _LOCATION.get(ctx.action, "park_bench")

    # 1) arrival — walk to where the action happens, surface tinted by biome.
    steps.append(MicroStep("goto", loc, f"walk{suffix}", "none", 2.5, fx=f"surface_{ctx.biome}"))

    # 2) time-of-day prelude (night lights a lamp, dawn stretches).
    pre = TOD_PRELUDE.get(ctx.time_of_day)
    if pre:
        steps.append(MicroStep(pre[0], pre[1], pre[2], "handheld" if pre[1] else "none", 1.5))

    # 3) core choreography per action.
    steps += _core(ctx, loc, suffix)

    # 4) work actions get the project-stage activity + the guild/role tool.
    if ctx.action in _WORK:
        tool = (CALC_TOOL_BY_ERA[ctx.era] if ctx.action == "calculate"
                else ROLE_STATION.get(ctx.role) if ctx.role != "generalist"
                else GUILD_TOOL.get(ctx.guild, "desk"))
        steps.append(MicroStep("pick_up", tool, f"reach_for{suffix}", "handheld", 1.2))
        steps.append(MicroStep("operate", tool, _variant(ctx, ("operate_a", "operate_b", "operate_c")),
                               "machine", 4.0, fx="work_focus"))
        sv, so, sa = STAGE_STEP.get(ctx.project_stage, STAGE_STEP["hypothesis"])
        steps.append(MicroStep(sv, so, sa, "surface", 3.5,
                               fx="eureka_glow" if ctx.project_stage == "approved" else ""))

    # 5) mood reaction — the inner life surfaced.
    emote, _ = MOOD_EMOTE[ctx.mood]
    steps.append(MicroStep("emote", "mood_emote_ring", emote, "none", 1.5, fx=f"mood_{ctx.mood}"))

    # 6) close out — stand and leave (unless resting/meditating, which settle).
    if ctx.action not in ("rest", "meditate", "seek_ascension"):
        steps.append(MicroStep("stand", "", f"stand{suffix}", "none", 1.0))
    return steps


def _core(ctx: Context, loc: str, suffix: str) -> list[MicroStep]:
    """The signature steps that make each of the 16 actions visibly itself."""
    a = ctx.action
    if a == "rest":
        return [MicroStep("lie_down", "bed_double", f"lie_down{suffix}", "bed", 2.0),
                MicroStep("sleep", "pillow_blanket", "sleep", "bed", 8.0, fx="zzz")]
    if a == "eat":
        return [MicroStep("sit", "chair_dining", f"sit{suffix}", "seat", 1.2),
                MicroStep("eat_bite", "meal_plate", "eat_seated", "surface", 4.0),
                MicroStep("drink_sip", "water_glass", "drink", "handheld", 1.5)]
    if a == "drink":
        return [MicroStep("pick_up", "mug", "reach_for", "handheld", 1.0),
                MicroStep("drink_sip", "mug", "drink", "handheld", 2.5)]
    if a == "study":
        return [MicroStep("sit", "chair_office", f"sit{suffix}", "seat", 1.2),
                MicroStep("read", "book_open", _variant(ctx, ("read_seated", "read_lean")), "surface", 5.0),
                MicroStep("write", "quill_ink", "write_seated", "surface", 3.0)]
    if a == "kb_lookup":
        return [MicroStep("browse", "bookshelf", "scan_shelf", "stand", 2.5),
                MicroStep("read", "book_open", "read_standing", "handheld", 4.0)]
    if a == "teach":
        return [MicroStep("stand", "lectern", "gesture_teach", "stand", 4.0),
                MicroStep("write", "chalkboard", "write_standing", "surface", 3.0)]
    if a == "meditate":
        return [MicroStep("sit", "meditation_cushion", "sit_cross_legged", "floor", 1.5),
                MicroStep("meditate", "meditation_cushion", "meditate_seated", "floor", 8.0, fx="calm_aura")]
    if a == "socialise":
        return [MicroStep("sit", "park_bench", f"sit{suffix}", "seat", 1.2),
                MicroStep("talk", "", _variant(ctx, ("talk_a", "talk_b", "laugh")), "none", 5.0)]
    if a == "seek_partner":
        return [MicroStep("sit", "partner_courtship_bench", "sit_close", "seat", 1.5),
                MicroStep("talk", "soul_bond_token", "talk_shy", "handheld", 5.0, fx="hearts")]
    if a == "seek_ascension":
        return [MicroStep("kneel", "ascension_altar", "kneel", "floor", 2.0),
                MicroStep("ascend", "ascension_altar", "arms_raise", "floor", 6.0, fx="ascension_beam")]
    if a == "fork_self":
        return [MicroStep("enter", "fork_pod", "step_in", "machine", 2.0),
                MicroStep("fork", "fork_pod", "duplicate", "machine", 5.0, fx="fork_flash")]
    if a == "build_scanner":
        return [MicroStep("assemble", "patent_scanner", "assemble", "machine", 6.0, fx="sparks")]
    if a == "search_patents":
        return [MicroStep("operate", "prior_art_terminal", "type_seated", "machine", 5.0),
                MicroStep("observe", "patent_globe_kiosk", "study_screen", "stand", 3.0)]
    if a == "propose_with_party":
        return [MicroStep("gather", "collaboration_round_table", "gesture_collaborate", "stand", 5.0),
                MicroStep("point", "blueprint_table", "point_at_plan", "surface", 3.0)]
    if a == "propose_invention":
        return [MicroStep("sit", "stool", f"sit{suffix}", "seat", 1.0),
                MicroStep("tinker", "invention_prototype_bench", "tinker", "machine", 5.0, fx="sparks")]
    if a == "calculate":
        return [MicroStep("sit", "stool", f"sit{suffix}", "seat", 1.0)]
    return [MicroStep("idle", loc, "idle", "none", 2.0)]


# ── The context space + coverage primitives ───────────────────────────────────
def valid_context_count() -> int:
    """Exact size of the valid (capable) context space, computed analytically."""
    total = 0
    for stage in LIFE_STAGES:
        n_actions = len(ALLOWED_BY_STAGE[stage])
        total += (n_actions * len(GUILDS) * len(ROLES) * len(MOODS) *
                  len(PROJECT_STAGES) * len(TIMES_OF_DAY) * len(BIOMES) * len(ERAS))
    return total


def iter_contexts(limit: int | None = None):
    """Enumerate valid contexts (optionally capped) for coverage scanning."""
    n = 0
    for stage in LIFE_STAGES:
        for action in sorted(ALLOWED_BY_STAGE[stage]):
            for guild in GUILDS:
                for role in ROLES:
                    for mood in MOODS:
                        for ps in PROJECT_STAGES:
                            for tod in TIMES_OF_DAY:
                                for biome in BIOMES:
                                    for era in ERAS:
                                        yield Context(action, guild, role, mood, stage,
                                                      ps, tod, biome, era)
                                        n += 1
                                        if limit and n >= limit:
                                            return


def referenced_object_ids() -> set[str]:
    """Every GLB id the behavior layer can reach for, across a covering scan
    (all actions × guilds × roles × stages × eras with representative mood/tod)."""
    out: set[str] = set()
    for stage in LIFE_STAGES:
        for action in sorted(ALLOWED_BY_STAGE[stage]):
            for guild in GUILDS:
                for role in ROLES:
                    for era in ERAS:
                        for ps in PROJECT_STAGES:
                            ctx = Context(action, guild, role, "content", stage, ps, "night", "plains", era)
                            for st in expand(ctx):
                                if st.obj:
                                    out.add(st.obj)
    return out


def behavior_for_minion(m, *, time_of_day: str = "day", biome: str = "plains",
                        era: str = "iron", project_stage: str = "hypothesis") -> dict:
    """Adapter: a live Minion's state → the renderer's micro-behavior contract.
    `m` may be an ORM object or a plain dict (duck-typed on the fields we need)."""
    def g(name, default):
        return getattr(m, name, None) if not isinstance(m, dict) else m.get(name, default)
    action = g("last_action", None) or g("action", None) or "rest"
    ctx = Context(
        action=action if action in ACTIONS else "rest",
        guild=str(g("guild", "maths") or "maths"),
        role=str(g("role", "generalist") or "generalist"),
        mood=str(g("mood", "content") or "content"),
        life_stage=str(g("life_stage", "adult") or "adult"),
        project_stage=project_stage, time_of_day=time_of_day, biome=biome, era=era,
    )
    steps = expand(ctx)
    return {
        "context": ctx.key(),
        "duration_s": round(sum(s.seconds for s in steps), 1),
        "steps": [{"verb": s.verb, "object": s.obj, "anim": s.anim,
                   "anchor": s.anchor, "seconds": s.seconds, "fx": s.fx} for s in steps],
    }
