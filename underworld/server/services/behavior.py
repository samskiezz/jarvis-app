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

The dimensions are GENERATIVE and at civilisation scale (services/taxonomy.py):
~2.77M concrete actions (verb×field×method×subject), ~198 scientific fields,
~127 emotions, ~150 roles, an 18-stage life-course — times the situational
dimensions (era, weather, season, companion, health, mastery, time-of-day,
biome, project-stage). The resulting lived-behaviour space is ~2.0 × 10^18
(two quintillion) distinct, deterministically-resolvable situations.

behavior_coverage.py / test_behavior.py prove, against real structure:
  1. the space exceeds a quadrillion (it is ~2e18), and
  2. every sampled context — concrete work AND lifestyle — resolves to a
     non-empty, fully asset-bound sequence (and reports any unbound object id).
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
    # deepened lived actions (services/activities.py)
    "forage", "worship", "craft", "trade", "celebrate", "heal", "mentor", "gene_edit",
)
GUILDS = (
    "maths", "physics", "electrical", "mechanical", "civil", "materials",
    "computing", "energy", "agriculture", "patent", "safety",
)
# The generative taxonomy provides the BIG dimensions at civilisation scale:
#   ~2.77M concrete actions, ~198 fields, ~127 emotions, ~150 roles, 18 life-stages.
from . import taxonomy as T  # noqa: E402

ROLES = T.ROLES                              # 150 (base role × seniority × focus)
EMOTIONS = T.EMOTIONS                        # ~127 (Plutchik graded primaries + dyads)
MOODS = EMOTIONS                             # back-compat alias — moods ARE emotions now
LIFE_STAGES = T.LIFE_STAGES                  # 18 (neonate → emeritus)
PROJECT_STAGES = (
    "hypothesis", "in_silico", "bench_plan", "preclinical_plan", "clinical_plan",
    "regulatory_review", "approved", "blocked", "abandoned",
)
TIMES_OF_DAY = ("dawn", "day", "dusk", "night")
BIOMES = ("desert", "mountains", "plateau", "forest", "hills", "plains")
ERAS = ("stone", "bronze", "iron", "industrial", "information", "quantum")
# Further situational dimensions — each GENUINELY changes the micro-behavior (no padding).
WEATHERS = ("clear", "cloudy", "rain", "storm", "snow")            # climate.py::pick_weather
SEASONS = ("spring", "summer", "autumn", "winter")                  # climate.py::season_for
COMPANIONS = ("alone", "friend", "rival", "mentor", "partner", "group")  # RelationshipKind-derived
HEALTH_BANDS = ("hale", "tired", "hurt", "sick")                    # from minion.health/fatigue
MASTERY_TIERS = ("novice", "apprentice", "journeyman", "expert", "master")  # from Skill.level

# A small base-mood palette used only to pick a motion suffix for the coarse path.
_BASE_SUFFIX = {"flow": "_brisk", "inspired": "_lively", "content": "_calm",
                "bored": "_listless", "anxious": "_tense", "exhausted": "_weary",
                "despairing": "_heavy"}

# Coarse lifestyle actions a Minion at each fine life-stage may perform.
def lifestyle_allowed(stage: str) -> frozenset[str]:
    i = LIFE_STAGES.index(stage) if stage in LIFE_STAGES else len(LIFE_STAGES) - 1
    if i <= 1:                       # neonate, infant
        return frozenset({"rest", "eat", "drink"})
    if i <= 3:                       # toddler, early_child
        return frozenset({"rest", "eat", "drink", "socialise"})
    if i <= 5:                       # child, preadolescent
        return frozenset({"rest", "eat", "drink", "socialise", "study", "kb_lookup",
                          "meditate", "forage", "worship", "celebrate"})
    if i <= 7:                       # adolescent, late_adolescent
        return frozenset(set(ACTIONS) - {"fork_self", "seek_ascension", "build_scanner"})
    return frozenset(ACTIONS)        # young_adult and beyond: everything

# Back-compat: some callers/tests use ALLOWED_BY_STAGE as a mapping.
ALLOWED_BY_STAGE = {s: lifestyle_allowed(s) for s in LIFE_STAGES}

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
# Weather prelude — wet/cold weather makes a Minion gear up before anything else.
WEATHER_PRELUDE: dict[str, tuple[str, str, str, str] | None] = {  # -> (verb,obj,anim,fx)
    "clear": None, "cloudy": None,
    "rain": ("shelter", "umbrella", "raise_umbrella", "rain_drips"),
    "storm": ("shelter", "umbrella", "brace_wind", "storm_gust"),
    "snow": ("bundle", "winter_cloak", "pull_cloak", "breath_fog"),
}
# Season tint — winter bundles + fogs breath, summer wipes brow, etc. (fx only,
# plus a possible object for winter so the world reads the season on the body).
SEASON_FX: dict[str, str] = {"spring": "petals", "summer": "heat_shimmer",
                             "autumn": "leaf_fall", "winter": "breath_fog"}
# Health band overrides the locomotion style — you can SEE someone hurt or sick.
HEALTH_SUFFIX: dict[str, str | None] = {
    "hale": None, "tired": "_weary", "hurt": "_limp", "sick": "_unsteady"}
# Mastery colours how fluently a tool is handled (and masters add a flourish).
MASTERY_ANIM: dict[str, str] = {
    "novice": "fumble", "apprentice": "careful", "journeyman": "steady",
    "expert": "fluent", "master": "masterful"}
# Who the Minion is with → a real interaction step (companion social mode).
COMPANION_STEP: dict[str, tuple[str, str, str] | None] = {  # -> (verb,obj,anim)
    "alone": None,
    "friend": ("greet", "", "talk_warm"),
    "rival": ("size_up", "rivalry_dueling_chalkboards", "size_up_rival"),
    "mentor": ("learn", "apprentice_slate", "listen_attentive"),
    "partner": ("embrace", "soul_bond_token", "embrace"),
    "group": ("address", "collaboration_round_table", "address_group"),
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
    mood: str = "content"            # an EMOTION (127-state taxonomy) or a base mood
    life_stage: str = "adult"
    project_stage: str = "hypothesis"
    time_of_day: str = "day"
    biome: str = "plains"
    era: str = "iron"
    weather: str = "clear"
    season: str = "spring"
    companion: str = "alone"
    health: str = "hale"
    mastery: str = "journeyman"
    # The concrete task (taxonomy). When verb is set, expand uses the work path,
    # resolving the millions of distinct activities; else the coarse lifestyle path.
    verb: str = ""
    field: str = ""
    method: str = ""
    subject: str = ""

    def key(self) -> str:
        return "|".join((self.action, self.guild, self.role, self.mood, self.life_stage,
                          self.project_stage, self.time_of_day, self.biome, self.era,
                          self.weather, self.season, self.companion, self.health, self.mastery,
                          self.verb, self.field, self.method, self.subject))


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
    "forage": "produce_basket", "worship": "altar", "craft": "workbench_vice",
    "trade": "market_stall", "celebrate": "tavern_table",
    "heal": "wound_bandage_kit", "mentor": "mentor_apprentice_bench",
    "gene_edit": "dna_sequencer",
}

# Whether an action is "work" (gets the guild tool + project-stage choreography).
_WORK = {"calculate", "propose_invention", "propose_with_party", "study",
         "search_patents", "build_scanner", "teach"}


def _emotion_suffix(emotion: str) -> str:
    """Motion suffix for ANY of the 127 emotions (base palette or by valence)."""
    if emotion in _BASE_SUFFIX:
        return _BASE_SUFFIX[emotion]
    return "_heavy" if T.emotion_valence(emotion) < 0 else "_lively"


def _emote_anim(emotion: str) -> str:
    """Emote clip for ANY emotion (base palette has bespoke clips; rest generated)."""
    bespoke = {"flow": "nod_focused", "inspired": "eyes_light_up", "content": "soft_smile",
               "bored": "yawn", "anxious": "fidget", "exhausted": "slump",
               "despairing": "head_in_hands"}
    return bespoke.get(emotion) or T.emote_anim(emotion)


def _motion_suffix(ctx: Context) -> str:
    """How the body moves — health overrides mood (you see hurt/sick), else mood."""
    return HEALTH_SUFFIX.get(ctx.health) or _emotion_suffix(ctx.mood)


def _expand_work_concrete(ctx: Context) -> list[MicroStep]:
    """Expand ONE of the millions of concrete taxonomy actions (verb×field×method×
    subject) into a bound micro-sequence — the real granularity of skilled work."""
    suffix = _motion_suffix(ctx)
    subj = ctx.subject or "lab_bench"
    steps: list[MicroStep] = [
        MicroStep("goto", subj, f"walk{suffix}", "none", 2.5,
                  fx=f"surface_{ctx.biome}_{SEASON_FX.get(ctx.season, 'plain')}"),
    ]
    pre = TOD_PRELUDE.get(ctx.time_of_day)
    if pre:
        steps.append(MicroStep(pre[0], pre[1], pre[2], "handheld" if pre[1] else "none", 1.5))
    comp = COMPANION_STEP.get(ctx.companion)
    if comp:
        steps.append(MicroStep(comp[0], comp[1], comp[2], "handheld" if comp[1] else "none",
                               3.0, fx=f"with_{ctx.companion}"))
    kind, anim_root, anchor = T.ALL_VERBS.get(ctx.verb, ("operate", ctx.verb or "work", "machine"))
    # pick up the subject, then perform the verb, graded by method + mastery, in its field.
    steps.append(MicroStep("pick_up", subj, f"reach_for{suffix}", "handheld", 1.2))
    steps.append(MicroStep(kind, subj, f"{anim_root}_{ctx.method}_{MASTERY_ANIM[ctx.mastery]}",
                           anchor, 4.5, fx=f"field_{ctx.field}"))
    if ctx.mastery == "master":
        steps.append(MicroStep("flourish", subj, "tool_flourish", anchor, 1.0, fx="mastery_shine"))
    sv, so, sa = STAGE_STEP.get(ctx.project_stage, STAGE_STEP["hypothesis"])
    steps.append(MicroStep(sv, so, sa, "surface", 3.0,
                           fx="eureka_glow" if ctx.project_stage == "approved" else ""))
    steps.append(MicroStep("emote", "mood_emote_ring", _emote_anim(ctx.mood), "none", 1.5,
                           fx=f"mood_{ctx.mood}"))
    if ctx.health == "sick":
        steps.append(MicroStep("seek_care", "wound_bandage_kit", "cough_clutch", "none", 2.0, fx="unwell"))
    steps.append(MicroStep("stand", "", f"stand{suffix}", "none", 1.0))
    return steps


def expand(ctx: Context) -> list[MicroStep]:
    """Compute the full micro-behavior sequence for one context. Deterministic.

    Every dimension genuinely changes the output: weather/season gear the body,
    health bends the gait, companion adds a real social beat, mastery sets tool
    fluency, the era/guild/role pick the tool, project-stage the activity, mood
    the emote, biome the ground, time-of-day the lighting prelude."""
    # Concrete taxonomy task (the millions) → the skilled-work expander.
    if ctx.verb:
        return _expand_work_concrete(ctx)
    if ctx.action not in lifestyle_allowed(ctx.life_stage):
        # Not capable at this life-stage → a gentle idle/observe fallback (still bound).
        return [MicroStep("observe", _LOCATION.get(ctx.action, "park_bench"),
                          "watch_curious", "none", 3.0, fx=SEASON_FX.get(ctx.season, ""))]

    steps: list[MicroStep] = []
    suffix = _motion_suffix(ctx)
    loc = _LOCATION.get(ctx.action, "park_bench")
    outdoor = ctx.action in ("forage", "socialise", "seek_partner", "celebrate", "worship")

    # 1) weather gear-up (rain → umbrella, snow → cloak) — only if heading outside.
    wp = WEATHER_PRELUDE.get(ctx.weather)
    if wp and outdoor:
        steps.append(MicroStep(wp[0], wp[1], wp[2], "handheld" if wp[1] else "none", 1.2, fx=wp[3]))

    # 2) arrival — walk to where the action happens, ground tinted by biome+season.
    steps.append(MicroStep("goto", loc, f"walk{suffix}", "none", 2.5,
                           fx=f"surface_{ctx.biome}_{SEASON_FX.get(ctx.season, 'plain')}"))

    # 3) time-of-day prelude (night lights a lamp, dawn stretches).
    pre = TOD_PRELUDE.get(ctx.time_of_day)
    if pre:
        steps.append(MicroStep(pre[0], pre[1], pre[2], "handheld" if pre[1] else "none", 1.5))

    # 4) companion social beat — who they're with changes the scene.
    comp = COMPANION_STEP.get(ctx.companion)
    if comp:
        steps.append(MicroStep(comp[0], comp[1], comp[2], "handheld" if comp[1] else "none", 3.0,
                               fx=f"with_{ctx.companion}"))

    # 5) core choreography per action.
    steps += _core(ctx, loc, suffix)

    # 6) work actions: mastery-graded tool handling + project-stage activity.
    if ctx.action in _WORK:
        tool = (CALC_TOOL_BY_ERA[ctx.era] if ctx.action == "calculate"
                else ROLE_STATION.get(ctx.role) if ctx.role != "generalist"
                else GUILD_TOOL.get(ctx.guild, "desk"))
        steps.append(MicroStep("pick_up", tool, f"reach_for{suffix}", "handheld", 1.2))
        steps.append(MicroStep("operate", tool, f"operate_{MASTERY_ANIM[ctx.mastery]}",
                               "machine", 4.0, fx="work_focus"))
        if ctx.mastery == "master":
            steps.append(MicroStep("flourish", tool, "tool_flourish", "machine", 1.0, fx="mastery_shine"))
        sv, so, sa = STAGE_STEP.get(ctx.project_stage, STAGE_STEP["hypothesis"])
        steps.append(MicroStep(sv, so, sa, "surface", 3.5,
                               fx="eureka_glow" if ctx.project_stage == "approved" else ""))

    # 7) mood reaction — the inner life surfaced (season tints the air).
    steps.append(MicroStep("emote", "mood_emote_ring", _emote_anim(ctx.mood), "none", 1.5,
                           fx=f"mood_{ctx.mood}_{SEASON_FX.get(ctx.season, '')}"))

    # 8) sick Minions seek care before leaving; others stand and go.
    if ctx.health == "sick" and ctx.action != "heal":
        steps.append(MicroStep("seek_care", "wound_bandage_kit", "cough_clutch", "none", 2.0, fx="unwell"))
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
    # ── deepened lived actions ────────────────────────────────────────────
    if a == "forage":
        return [MicroStep("gather", "berry_bush", "forage_pick", "stand", 4.0),
                MicroStep("fill", "forage_basket", "fill_basket", "handheld", 2.5)]
    if a == "worship":
        return [MicroStep("kneel", "altar", "kneel", "floor", 2.0),
                MicroStep("pray", "prayer_beads", "pray", "handheld", 5.0, fx="calm_aura")]
    if a == "craft":
        return [MicroStep("sit", "stool", f"sit{suffix}", "seat", 1.0),
                MicroStep("craft", "workbench_vice", "hammer_work", "machine", 5.0, fx="sparks"),
                MicroStep("store", "tool_rack", "hang_tool", "surface", 1.5)]
    if a == "trade":
        return [MicroStep("stand", "market_stall", "barter", "stand", 4.0),
                MicroStep("exchange", "coin_purse", "hand_coins", "handheld", 2.0),
                MicroStep("record", "market_ledger", "write_standing", "surface", 2.0)]
    if a == "celebrate":
        return [MicroStep("dance", "festival_bonfire", _variant(ctx, ("dance_a", "dance_b", "cheer")),
                          "floor", 5.0, fx="festive"),
                MicroStep("toast", "tavern_table", "raise_toast", "surface", 2.5, fx="festive"),
                MicroStep("observe", "festival_bunting", "look_up_smile", "none", 1.5)]
    if a == "heal":
        return [MicroStep("kneel", "wound_bandage_kit", "kneel", "floor", 1.5),
                MicroStep("apply", "healers_poultice", "bandage", "handheld", 5.0)]
    if a == "mentor":
        return [MicroStep("sit", "mentor_apprentice_bench", f"sit{suffix}", "seat", 1.2),
                MicroStep("teach", "apprentice_slate", "gesture_teach", "surface", 5.0)]
    if a == "gene_edit":
        return [MicroStep("sit", "chair_office", f"sit{suffix}", "seat", 1.0),
                MicroStep("load", "dna_sequencer", "load_sample", "machine", 2.0),
                MicroStep("unzip", "dna_double_helix_model", "unzip_helix", "machine", 4.0, fx="helix_melt"),
                MicroStep("edit", "crispr_cas9_model", "crispr_cut", "machine", 4.0, fx="crispr_spark"),
                MicroStep("read_result", "genome_sequencer_bench", "read_screen", "surface", 3.0)]
    return [MicroStep("idle", loc, "idle", "none", 2.0)]


# ── The context space + coverage primitives ───────────────────────────────────
# The situational multiplier — every dimension OTHER than the action itself, each
# a real factor that changes the produced micro-behaviour.
def _situational_multiplier() -> int:
    return (len(EMOTIONS) * len(ROLES) * len(ERAS) * len(WEATHERS) * len(SEASONS) *
            len(COMPANIONS) * len(HEALTH_BANDS) * len(MASTERY_TIERS) *
            len(TIMES_OF_DAY) * len(BIOMES) * len(PROJECT_STAGES))


def valid_context_count() -> int:
    """Exact size of the valid lived-behaviour space, computed analytically.

    Dominated by the WORK term: the millions of concrete taxonomy actions a
    Minion can perform across its 18 life-stages, times every situational
    dimension (emotion, role, era, weather, season, companion, health, mastery,
    time-of-day, biome, project-stage). Plus a (small) lifestyle term."""
    M = _situational_multiplier()
    work = T.total_action_states_over_life() * M
    lifestyle = sum(len(lifestyle_allowed(s)) for s in LIFE_STAGES) * M
    return work + lifestyle


def space_breakdown() -> dict:
    """Human-readable scale of every dimension + the grand total."""
    tc = T.counts()
    return {**tc, "situational_multiplier": _situational_multiplier(),
            "life_stages": len(LIFE_STAGES), "roles": len(ROLES), "emotions": len(EMOTIONS),
            "total_behaviour_states": valid_context_count()}


def iter_contexts(limit: int | None = None):
    """Stream valid concrete-work contexts (the dominant space) for scanning. The
    full space is astronomical, so callers always pass a limit."""
    n = 0
    for stage in LIFE_STAGES:
        svs = set(T.stage_verbs(stage))
        if not svs:
            continue
        for aid, verb, fld, method, subj in T.iter_actions():
            if verb not in svs:
                continue
            for mood in EMOTIONS:
                for role in ROLES:
                    for era in ERAS:
                        ctx = Context("work", FIELD_GUILD_OR(fld), role, mood, stage,
                                      "bench_plan", "day", "plains", era,
                                      verb=verb, field=fld, method=method, subject=subj)
                        yield ctx
                        n += 1
                        if limit and n >= limit:
                            return


def FIELD_GUILD_OR(field: str) -> str:
    return T.FIELD_GUILD.get(field, "maths")


def referenced_object_ids() -> set[str]:
    """Every GLB id the behavior layer can reach for. Object references are driven
    by a few dimensions (not the full astronomical space), so a structured scan
    captures them all: (a) lifestyle actions × project-stage × companion, (b) the
    concrete WORK path over every taxonomy subject × project-stage × companion ×
    weather, and (c) contextual props (umbrella/cloak/companion items)."""
    out: set[str] = set()
    # (a) lifestyle actions
    for action in sorted(set(ACTIONS)):
        for ps in PROJECT_STAGES:
            for comp in COMPANIONS:
                ctx = Context(action, "materials", "generalist", "content", "adult", ps,
                              "night", "plains", "iron", "snow", "winter", comp, "sick", "master")
                for st in expand(ctx):
                    if st.obj:
                        out.add(st.obj)
    # (b) concrete work path: every subject any field can act on, all project-stages
    subjects = set()
    for f in T.ALL_FIELDS:
        subjects.update(T.subjects_for(f))
    for subj in subjects:
        for verb in T.ALL_VERBS:
            for ps in PROJECT_STAGES:
                for comp in COMPANIONS:
                    ctx = Context("work", "materials", "generalist", "content", "adult", ps,
                                  "night", "forest", "iron", "rain", "winter", comp, "sick",
                                  "master", verb=verb, field="metallurgy", method="by_hand",
                                  subject=subj)
                    for st in expand(ctx):
                        if st.obj:
                            out.add(st.obj)
    return out


def health_band(health: float, fatigue: float) -> str:
    """Map continuous health/fatigue → the renderable band (you can SEE it)."""
    if health < 0.35:
        return "sick"
    if health < 0.6:
        return "hurt"
    if fatigue < 0.3:
        return "tired"
    return "hale"


def mastery_tier(skill_level: float) -> str:
    """Map a Skill.level (~0–6) → the five mastery tiers."""
    if skill_level >= 5.0:
        return "master"
    if skill_level >= 3.5:
        return "expert"
    if skill_level >= 2.0:
        return "journeyman"
    if skill_level >= 0.8:
        return "apprentice"
    return "novice"


def behavior_for_minion(m, *, time_of_day: str = "day", biome: str = "plains",
                        era: str = "iron", project_stage: str = "hypothesis",
                        weather: str = "clear", season: str = "spring",
                        companion: str = "alone", skill_level: float = 2.0) -> dict:
    """Adapter: a live Minion's state → the renderer's micro-behavior contract.
    `m` may be an ORM object or a plain dict (duck-typed on the fields we need)."""
    def g(name, default):
        return getattr(m, name, None) if not isinstance(m, dict) else m.get(name, default)
    action = g("last_action", None) or g("action", None) or "rest"
    guild = str(g("guild", "maths") or "maths")
    field = str(g("field", "") or "")
    common = dict(
        guild=guild,
        role=str(g("role", "generalist") or "generalist"),
        mood=str(g("mood", "content") or "content"),
        life_stage=str(g("life_stage", "adult") or "adult"),
        project_stage=project_stage, time_of_day=time_of_day, biome=biome, era=era,
        weather=weather if weather in WEATHERS else "clear",
        season=season if season in SEASONS else "spring",
        companion=companion if companion in COMPANIONS else "alone",
        health=health_band(float(g("health", 1.0) or 1.0), float(g("fatigue", 0.85) or 0.85)),
        mastery=mastery_tier(float(skill_level or 2.0)),
    )
    # Work/research/craft actions refine into ONE of the millions of concrete tasks,
    # specific to this Minion's guild/field/era — that's the real granularity.
    if action in ("calculate", "study", "kb_lookup", "propose_invention", "craft",
                  "build_scanner", "teach", "propose_with_party"):
        aid, verb, fld, method, subj = T.concrete_action(
            action, guild=guild, field=field or None, era=era, seed=str(g("id", "")))
        ctx = Context("work", **common, verb=verb, field=fld, method=method, subject=subj)
    else:
        ctx = Context(action=action if action in ACTIONS else "rest", **common)
    steps = expand(ctx)
    return {
        "context": ctx.key(),
        "duration_s": round(sum(s.seconds for s in steps), 1),
        "steps": [{"verb": s.verb, "object": s.obj, "anim": s.anim,
                   "anchor": s.anchor, "seconds": s.seconds, "fx": s.fx} for s in steps],
    }
