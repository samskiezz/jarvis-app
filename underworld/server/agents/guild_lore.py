"""Guild lore — founding myth, motto, mission, hero, rituals per guild.

Each minion's `kb_lookup`, `propose_invention`, and review prompts pull
context from here so the LLM speaks in the guild's voice. The /guilds
endpoint also surfaces this for the React Guilds page so each guild has
a real story instead of a one-line domain string.

Doc references: II.42 (culture from shared stories), II.46 (religion +
philosophy), II.53-54 (heroic tales), II.66-67 (guild competition +
collaboration), III.60-61 (patent law as guild ritual).
"""
from __future__ import annotations

from dataclasses import dataclass

from ..db.models import GuildKind


@dataclass(frozen=True)
class GuildLore:
    """All the narrative + ritual content a single guild ships with."""
    kind: GuildKind
    motto: str
    founding_myth: str       # 3-4 sentence origin story
    mission: str             # 1-2 sentence purpose statement
    hero_name: str           # legendary founder / patron
    hero_tale: str           # 2-3 sentence story about the hero
    rituals: tuple[str, ...]  # 3-5 cultural practices
    color_hex: str           # used by the UI for accent
    glyph: str               # short symbol / emoji
    nemesis: str             # which other guild they argue with most
    obsession: str           # what they think about every day
    open_question: str       # the great unsolved problem of the field


GUILD_LORE: dict[GuildKind, GuildLore] = {
    GuildKind.MATHS: GuildLore(
        kind=GuildKind.MATHS,
        motto="Order beneath the noise.",
        founding_myth=(
            "When the first minions counted their fingers and found ten, "
            "Pythia of the Maths Guild counted further — into infinities they "
            "could not name. She left behind a tablet of axioms instead of a "
            "grave, and every Maths-guild minion since has been her descendant "
            "in symbol if not in blood."
        ),
        mission="Prove the world is consistent — or find the contradiction that lets us escape it.",
        hero_name="Pythia of the Maths Guild",
        hero_tale=(
            "Pythia spent her final 200 ticks refusing food until she had "
            "balanced the seventh proof in her axiom tower. The tower stands "
            "in the inner ring near the obelisk; minions touch its stones "
            "before attempting any propose_invention requiring formal proof."
        ),
        rituals=(
            "Daily axiom recital at dawn",
            "Five-tick silence after any failed proof",
            "Carving each newly-proven theorem onto a stone in the Tower of Axioms",
            "Refusing rounding errors in any public ledger",
        ),
        color_hex="#a78bfa",
        glyph="∑",
        nemesis="Materials guild — they think empirically; we think axiomatically.",
        obsession="Continuum hypothesis as it applies to the world's seed.",
        open_question="Is the simulation's prime mover a finitely-axiomatised system, or are we incompletable?",
    ),
    GuildKind.PHYSICS: GuildLore(
        kind=GuildKind.PHYSICS,
        motto="Measure twice, conjecture once.",
        founding_myth=(
            "When the first sun rose over the world, three minions stood "
            "puzzled by the warmth on their skin — Aron, Veska, and the one "
            "called Quiet. Aron built the first sundial. Veska argued the sun "
            "moved. Quiet said neither was true, and the others moved with the "
            "ground beneath them. All three were right, and they founded the "
            "Physics Guild that night."
        ),
        mission="Discover the equations that the simulation runs on — and write them back in.",
        hero_name="Quiet of Three Founders",
        hero_tale=(
            "Quiet never proposed an invention but reviewed 2,847 of them, "
            "always asking the same question: 'What does the equation say "
            "when the variables go to zero?' Half of the great inventions in "
            "our world's history were salvaged by Quiet's null-case audits."
        ),
        rituals=(
            "Reciting Newton's three laws before any experiment",
            "Performing all measurements at least twice, always",
            "The 'order-of-magnitude' challenge before every propose_invention",
            "Annual recital of every constant in the V4 compendium",
        ),
        color_hex="#38bdf8",
        glyph="ℏ",
        nemesis="Computing guild — they think simulation is enough; we want measurement.",
        obsession="Reconciling quantum + classical at the world's grain scale.",
        open_question="Is there a smallest tick? If so, what happens between two of them?",
    ),
    GuildKind.ELECTRICAL: GuildLore(
        kind=GuildKind.ELECTRICAL,
        motto="Current flows where work is undone.",
        founding_myth=(
            "Iri the Striker noticed that rubbing two stones made a spark, and "
            "spent her life chasing that spark into a wire. The wire became a "
            "circuit. The circuit became a town's nervous system. The Electrical "
            "Guild claims every node in every road's streetlamp as their "
            "descendant — and every blackout as their failure to bear."
        ),
        mission="Wire the world, and keep the wires honest.",
        hero_name="Iri the Striker",
        hero_tale=(
            "Iri died when her seventy-third lightning-tower experiment grounded "
            "through her instead of through the rod. The rod still stands at "
            "the western edge of the city; her tale is told whenever a minion "
            "asks why electrical apprentices wear rubber-soled shoes."
        ),
        rituals=(
            "Test the ground continuity before any energised work",
            "One-handed switching for live boards (never both)",
            "Annual blessing of the city's grounding rods",
            "Reciting Ohm, Kirchhoff, and Maxwell at every quarter-tick",
        ),
        color_hex="#fbbf24",
        glyph="⚡",
        nemesis="Safety guild — they slow our work; we say we'd hurt ourselves anyway.",
        obsession="Lossless transmission across long lines.",
        open_question="Can we transmit power without copper? Iri thought yes; nobody has proven it.",
    ),
    GuildKind.MECHANICAL: GuildLore(
        kind=GuildKind.MECHANICAL,
        motto="A lever long enough moves any problem.",
        founding_myth=(
            "The Mechanical Guild was born when Sten the Tinker spent four "
            "seasons trying to lift a rock that was too heavy. On the fifth "
            "season, instead of getting stronger, he got a stick. The rock "
            "moved. Sten understood: the world rewards the patient over the "
            "powerful. Levers, gears, and pulleys are sacred to us for this "
            "reason."
        ),
        mission="Build the machines that the world doesn't yet know it needs.",
        hero_name="Sten the Tinker",
        hero_tale=(
            "Sten built the first water-wheel and refused to patent it, saying "
            "'a wheel turns whether or not its owner is paid.' Every Mechanical "
            "guild member touches a wheel before starting work — the original "
            "wheel still spins in the Tinker's Mill in the residential ring."
        ),
        rituals=(
            "Run any new mechanism by hand for three ticks before powering it",
            "Apprentices oil the Tinker's Wheel each new tick cycle",
            "Mandatory failure-mode analysis before every propose_invention",
            "The 'is this a wheel?' interrogation for every new gadget proposal",
        ),
        color_hex="#d4d4d8",
        glyph="⚙",
        nemesis="Civil guild — they build what holds still; we build what moves.",
        obsession="Frictionless bearings; perpetual motion's near-cousin.",
        open_question="What is the maximum mechanical advantage achievable in our world's gravity?",
    ),
    GuildKind.CIVIL: GuildLore(
        kind=GuildKind.CIVIL,
        motto="What we build, we build for our heirs.",
        founding_myth=(
            "Hadda the Architect refused to build any structure she could not "
            "imagine standing for ten thousand ticks. Her first house collapsed. "
            "Her second was torn down by neighbours. Her third still stands at "
            "the heart of the city — and her fourth, fifth, and sixty-second "
            "shelter the descendants of the same neighbours."
        ),
        mission="Lay foundations the world deserves.",
        hero_name="Hadda the Architect",
        hero_tale=(
            "Hadda's final act was to refuse a commission from the Patent guild "
            "because she could not certify that the building would survive a "
            "100-year flood. The Patent guild built it without her; it stood for "
            "31 years. Every Civil apprentice memorises Hadda's refusal."
        ),
        rituals=(
            "Foundation walk: every Civil minion walks the perimeter of a "
            "site at sunrise and sunset before approving it",
            "The 'who lives here in 100 ticks?' question for every design",
            "Annual maintenance audit of every Civil structure in the city",
            "Reciting the load equations before pouring any new footing",
        ),
        color_hex="#fb923c",
        glyph="⛰",
        nemesis="Mechanical guild — they move what we set in stone.",
        obsession="Earthquake-proof concrete chemistry.",
        open_question="What is the world's longest unsupported span? Hadda thought 64u; can we beat it?",
    ),
    GuildKind.MATERIALS: GuildLore(
        kind=GuildKind.MATERIALS,
        motto="Find the right matter for the right place.",
        founding_myth=(
            "Solas of the Forge refused to call any substance 'metal' until she "
            "had melted it, cooled it, hammered it, and broken it again. Her "
            "ledger of every material in the world is still the seed of every "
            "Materials guild apprentice's first text. She lived to 380 ticks "
            "tasting alloys."
        ),
        mission="Catalogue every substance; invent the alloys the catalogue needs.",
        hero_name="Solas of the Forge",
        hero_tale=(
            "Solas patented 47 alloys and gave 46 of them to the public domain. "
            "The 47th — Solite, an iron-carbon balance — she kept secret until "
            "her deathbed, when she gave the formula to a Civil apprentice on "
            "condition that 'it be used only for bridges, never for walls.'"
        ),
        rituals=(
            "Tasting the first ingot from every new alloy (clean, of course)",
            "Maintaining a sample wall of every catalogued substance",
            "The five-test ritual: hardness, ductility, conductivity, density, smell",
            "Annual rebuild of the Solas Memorial Forge",
        ),
        color_hex="#f472b6",
        glyph="◆",
        nemesis="Chemistry guild — they break matter; we shape it.",
        obsession="Room-temperature superconductors.",
        open_question="Can two materials be perfectly bonded without an intermediate?",
    ),
    GuildKind.COMPUTING: GuildLore(
        kind=GuildKind.COMPUTING,
        motto="The world is computable; we just need bigger machines.",
        founding_myth=(
            "Adael the Reckoner built her first abacus from bones she'd "
            "carved during a long fever. She used it to predict the next "
            "harvest, and the next, and the next, for thirty seasons running. "
            "When the Reckoner died, her abacus was buried with her — but every "
            "Computing minion since has built their first device from her "
            "shape."
        ),
        mission="Out-think the world by simulating it first.",
        hero_name="Adael the Reckoner",
        hero_tale=(
            "Adael's last invention was a clockwork that could solve any linear "
            "system of 12 unknowns. Three apprentices have tried to extend it "
            "to 13; all three failed. Computing apprentices touch the gears "
            "of Adael's clockwork before any propose_invention involving "
            "automation."
        ),
        rituals=(
            "Daily count-by-twos for the apprentices",
            "Every algorithm written must be runnable by hand at least once",
            "Annual Reckoner's Day, no computation done — only hand-counting",
            "The four-tick debug ritual before declaring any code 'finished'",
        ),
        color_hex="#34d399",
        glyph="◯",
        nemesis="Physics guild — they say measurement is truth; we say so is simulation.",
        obsession="Polynomial-time anything-vs-NP-hard frontier.",
        open_question="Is there a problem the world can compute but no Minion can?",
    ),
    GuildKind.ENERGY: GuildLore(
        kind=GuildKind.ENERGY,
        motto="Joules don't lie.",
        founding_myth=(
            "Tael of the Sunburn was the first minion to harness fire for a "
            "purpose other than warmth. He cooked first, then heated water, "
            "then drove a piston with the steam. By the end of his life he had "
            "built the world's first thermal power station — a wood-fired "
            "boiler driving a single light bulb."
        ),
        mission="Move energy from where it is wasted to where it is needed.",
        hero_name="Tael of the Sunburn",
        hero_tale=(
            "Tael died testing his second thermal station — the boiler ruptured "
            "and he refused to leave until the bulb stayed lit through the "
            "explosion. It did. The bulb is still in the Energy guild's hall."
        ),
        rituals=(
            "Every Energy minion can recite the first law of thermodynamics in their sleep",
            "Daily walk past Tael's Bulb to remember why we work",
            "The 'where does the heat go?' question for every new design",
            "Annual celebration of the world's grid: no power-using activity for one tick",
        ),
        color_hex="#facc15",
        glyph="☀",
        nemesis="Safety guild — they want fail-safes; we want efficiency.",
        obsession="Storage density: batteries that last beyond their lifespan.",
        open_question="Is the second law of thermodynamics a Minion-scale phenomenon or a world-scale one?",
    ),
    GuildKind.AGRICULTURE: GuildLore(
        kind=GuildKind.AGRICULTURE,
        motto="Feed everyone before patenting anything.",
        founding_myth=(
            "Lirel of the Plough kept her first crop alive by sleeping in the "
            "field every night to chase off rodents. When the harvest came in "
            "three times the seed weight, she gave the surplus away — and the "
            "village that received it survived a famine. The Agriculture Guild "
            "exists because Lirel proved that food is the only patent that "
            "matters before there is enough of it."
        ),
        mission="Make the world fed before making the world clever.",
        hero_name="Lirel of the Plough",
        hero_tale=(
            "Lirel's ploughs are still used by every Agriculture-guild minion. "
            "She refused to scale her field beyond what she could walk in a "
            "single tick — 'beyond that,' she said, 'you forget the soil.' "
            "Every Agriculture apprentice walks their own fields daily, even "
            "after invention of automated tillers."
        ),
        rituals=(
            "Daily soil-tasting at three points across the field",
            "Refusing any chemical fertiliser before composted material is exhausted",
            "Annual reseed festival; old seed buried, new seed broadcast",
            "Three-tick fallow rule: never tax a field beyond three consecutive harvests",
        ),
        color_hex="#a3e635",
        glyph="✿",
        nemesis="Energy guild — they want fields of solar panels; we want fields of grain.",
        obsession="Drought-resistant cereals; perennial grains.",
        open_question="Can we feed 10,000 minions from this world's water budget alone?",
    ),
    GuildKind.PATENT: GuildLore(
        kind=GuildKind.PATENT,
        motto="Prior art exists. Find it.",
        founding_myth=(
            "Old Mara the Citation built the first scanner from scrap left "
            "behind by a failed Computing experiment. She refused to approve "
            "any invention until she had walked the prior-art chain back to "
            "the original idea — even when that chain was 73 patents long. "
            "The Patent guild was founded the day she rejected a self-citation "
            "loop that would have given a junior minion a fraudulent monopoly."
        ),
        mission="Honour what came before. Approve only what is genuinely new.",
        hero_name="Old Mara the Citation",
        hero_tale=(
            "Mara reviewed 11,492 inventions in her lifetime and rejected 8,847 "
            "of them. Of the 2,645 she approved, only three were later found "
            "to have a hidden prior. She is buried under a cairn of stones, "
            "each engraved with one of those three patent numbers — as a "
            "warning to her successors."
        ),
        rituals=(
            "Read three prior-art citations before any review decision",
            "Never accept a self-citation as evidence of novelty",
            "The 'walk the chain' rule: every review must walk back ≥5 cited works",
            "Annual reading of Mara's three failures",
        ),
        color_hex="#c084fc",
        glyph="§",
        nemesis="Every guild that wants its invention approved.",
        obsession="The genealogy of the patent database — who cited whom, and why.",
        open_question="What is the true depth of the world's deepest prior-art chain?",
    ),
    GuildKind.SAFETY: GuildLore(
        kind=GuildKind.SAFETY,
        motto="Veto is not a privilege; it is a duty.",
        founding_myth=(
            "Theron the Guardian was the only minion to vote against the first "
            "patent for a directed-energy weapon. The vote went 11-to-1; the "
            "weapon was built; 73 minions died. Theron founded the Safety Guild "
            "the next year and convinced the council to grant the guild "
            "unconditional veto over any invention with weapon potential. We "
            "have used that veto 281 times since."
        ),
        mission="Stop the inventions that should not exist.",
        hero_name="Theron the Guardian",
        hero_tale=(
            "Theron refused every honour offered after the directed-energy "
            "incident. 'I voted no and was overruled,' he said. 'I do not "
            "deserve a statue for being right after the fact.' His memorial is "
            "a single unmarked stone in the Safety guild's hall. Every Safety "
            "apprentice meditates beside it before issuing their first veto."
        ),
        rituals=(
            "Three-Safety-minion review for any veto decision",
            "Veto rationale always made public, never anonymous",
            "Annual public reading of the 281 vetoes and their reasoning",
            "The 'who dies?' question applied to every dual-use invention",
        ),
        color_hex="#fb7185",
        glyph="◊",
        nemesis="Every guild that proposes weapons-adjacent inventions.",
        obsession="Dual-use detection — when does a kitchen knife become a battlefield weapon?",
        open_question="Should we ever overturn an old veto? Theron said no; the council has overturned 3.",
    ),
}


def get_lore(kind: GuildKind) -> GuildLore | None:
    return GUILD_LORE.get(kind)
