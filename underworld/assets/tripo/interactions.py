"""Interaction taxonomy — the data model for a Minion's full immersive day.

A GLB is just a mesh. Immersion ("she walks to the desk, sits, opens a book,
studies; he operates the microscope; they eat a meal at the table") needs the
mesh PLUS: an interaction *type*, a character *animation*, and an *anchor* (where
the Minion attaches — a seat, a surface, a handheld grip). This file is the
single source of truth that ties the simulation's real actions to the objects,
animations and anchors a renderer (UE5 MetaHuman AnimBP, or the WebGL mixer)
plays — AND tells the asset pipeline exactly which object GLBs to generate.

Derived from the simulation's actual action set (server/agents/minion.py
_ACTIONS), so it covers what Minions genuinely do, not an arbitrary wish-list.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Interaction:
    action: str                     # the sim action this dresses
    kind: str                       # sit | sleep | read | eat | drink | operate | meditate | talk | ride | stand
    anim: str                       # animation clip the character plays
    anchor: str                     # seat | surface | handheld | floor | machine | vehicle | none
    objects: tuple[str, ...] = ()   # object GLB ids involved (design_list ids)
    guild_tool: bool = False        # if True, the work tool is chosen per guild (see GUILD_TOOLS)


# action → how a Minion physically performs it, and with what.
INTERACTIONS: dict[str, Interaction] = {
    "rest":       Interaction("rest", "sleep", "sleep", "bed", ("bed_double", "bed_bunk")),
    "eat":        Interaction("eat", "eat", "eat_seated", "seat", ("table_dining", "chair_dining", "meal_plate", "bread_loaf")),
    "drink":      Interaction("drink", "drink", "drink", "handheld", ("mug",)),
    "study":      Interaction("study", "read", "read_seated", "seat", ("desk", "chair_office", "book_open"), guild_tool=True),
    "kb_lookup":  Interaction("kb_lookup", "read", "read_standing", "handheld", ("bookshelf", "book_open", "scroll")),
    "teach":      Interaction("teach", "teach", "gesture_teach", "stand", ("chalkboard", "lectern")),
    "meditate":   Interaction("meditate", "meditate", "meditate_seated", "floor", ("meditation_cushion",)),
    "socialise":  Interaction("socialise", "talk", "talk", "seat", ("park_bench", "table_dining")),
    "calculate":  Interaction("calculate", "operate", "operate_machine", "machine", (), guild_tool=True),
    "propose_invention": Interaction("propose_invention", "operate", "work_bench", "machine", ("workbench_vice",), guild_tool=True),
    "propose_with_party": Interaction("propose_with_party", "talk", "collaborate", "stand", ("blueprint_table",), guild_tool=True),
    "search_patents": Interaction("search_patents", "read", "search_files", "stand", ("archive_cabinet", "scroll")),
    "build_scanner": Interaction("build_scanner", "operate", "assemble", "machine", ("patent_scanner",)),
    "seek_partner": Interaction("seek_partner", "talk", "talk", "stand", ("park_bench",)),
    "seek_ascension": Interaction("seek_ascension", "meditate", "meditate_seated", "floor", ("meditation_cushion", "fx_rune_stone")),
    "fork_self":  Interaction("fork_self", "stand", "idle", "none", ()),
}

# The handheld/at-station WORK TOOL each guild yields when working (calculate /
# propose_invention). This is the "yield a microscope / hammer / oscilloscope".
GUILD_TOOLS: dict[str, tuple[str, ...]] = {
    "materials":   ("microscope_light", "hammer", "crucible", "anvil"),
    "mechanical":  ("lathe", "wrench", "hammer", "drill_press"),
    "electrical":  ("oscilloscope", "soldering_station", "multimeter"),
    "civil":       ("theodolite", "trowel", "blueprint_table"),
    "physics":     ("optical_bench", "oscilloscope", "pendulum_rig"),
    "maths":       ("chalkboard", "slide_rule", "drafting_table"),
    "computing":   ("workstation", "server_rack", "keyboard"),
    "energy":      ("generator", "wrench", "battery_bank"),
    "agriculture": ("plough", "scythe", "watering_can"),
    "patent":      ("magnifying_glass", "stamp", "archive_cabinet"),
    "safety":      ("clipboard", "hard_hat"),
}

# A canonical daily routine — what a Minion's day looks like when you watch one
# "locked in" (bed → breakfast → transport → guild → work → study → home). The
# renderer can sequence these as a schedule when no urgent need overrides.
DAILY_ROUTINE: list[tuple[str, str]] = [
    ("wake",       "rest"),          # gets out of bed
    ("breakfast",  "eat"),           # meal at the table
    ("commute",    "ride"),          # transport to the guild
    ("arrive",     "stand"),         # enters the guild building
    ("work",       "calculate"),     # operates the guild's machine/tool
    ("study",      "study"),         # reads / uses a device
    ("collaborate","socialise"),     # talks with guildmates
    ("invent",     "propose_invention"),
    ("commute_home","ride"),
    ("rest",       "rest"),          # sleep
]


def objects_for(action: str, guild: str | None = None) -> list[str]:
    """Every object GLB a Minion needs to perform `action` (guild-aware)."""
    it = INTERACTIONS.get(action)
    if it is None:
        return []
    objs = list(it.objects)
    if it.guild_tool and guild:
        objs += list(GUILD_TOOLS.get(guild, ()))
    return objs


def interaction_for(action: str, guild: str | None = None) -> dict:
    """The full render contract for an action: animation, anchor, and the object
    set — what a renderer needs to make a Minion actually *do* the thing."""
    it = INTERACTIONS.get(action)
    if it is None:
        return {"action": action, "kind": "stand", "anim": "idle", "anchor": "none", "objects": []}
    return {"action": action, "kind": it.kind, "anim": it.anim, "anchor": it.anchor,
            "objects": objects_for(action, guild)}


def all_required_object_ids() -> set[str]:
    """Every distinct object GLB the immersive interactions reference — the exact
    set the asset pipeline must provide (no more, no fewer)."""
    out: set[str] = set()
    for it in INTERACTIONS.values():
        out.update(it.objects)
    for tools in GUILD_TOOLS.values():
        out.update(tools)
    return out
