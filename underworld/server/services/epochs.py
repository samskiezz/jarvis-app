"""Epochs — a deeply granular, historically-grounded technological ladder.

The world's 6 coarse Eras (Stone…Quantum) are the macro-phases. Epochs subdivide
them into ~100 real milestones drawn from actual human (and plausible near/far-
future) technological history, each anchored to an approximate real-world date,
a triggering capability, what it unlocks, and a short narrative that gives the
civilisation a sense of *where it stands in the human story*.

This is "as real-world as possible": every epoch below happened (or is a
seriously-proposed future milestone), in roughly the real order. Storylines
(sagas.py) layer effectively-unlimited emergent narrative on top of this real
spine — that is where the thousands of unique stories come from.

Each epoch advances when the civilisation's knowledge (Σ discoveries + avg
expertise) crosses its threshold, so a world climbs the real arc of history.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Epoch:
    id: str
    name: str
    era: str                 # which macro-Era this epoch belongs to
    year: int                # approximate real-world year (negative = BCE)
    threshold: float         # civilisation knowledge index needed to reach it
    theme: str               # one-line narrative of what defines this epoch
    gift: str                # how reaching it helps the Minions (development value)


# The real arc of history, grounded and roughly chronological. Threshold is a
# monotonic "knowledge index" (see epoch_for); spacing reflects real difficulty.
EPOCHS: list[Epoch] = [
    # ── Paleolithic (Stone Era) ──────────────────────────────────────────────
    Epoch("oldowan", "Oldowan Toolmaking", "stone", -3300000, 0.0, "The first knapped stone edge.", "Tools multiply what a hand can do."),
    Epoch("fire", "Mastery of Fire", "stone", -1000000, 1.0, "Warmth, cooked food, a circle of light against the dark.", "Cooking frees energy for bigger brains; nights become survivable."),
    Epoch("language", "Spoken Language", "stone", -100000, 2.0, "Thought made shareable; the first stories told around the fire.", "Knowledge can now pass between minds, not just within one."),
    Epoch("clothing", "Tailored Clothing", "stone", -70000, 3.0, "Hides sewn against the cold open new lands.", "The cold no longer kills the careful."),
    Epoch("art", "Symbolic Art", "stone", -40000, 4.5, "Ochre handprints and cave beasts — meaning beyond survival.", "Imagination becomes a tool; culture is born."),
    Epoch("burial", "Ritual Burial", "stone", -30000, 6.0, "The dead are mourned and remembered.", "Memory of ancestors steadies the living."),
    Epoch("bow", "The Bow", "stone", -20000, 8.0, "Stored energy released at distance.", "Hunting from afar — fewer hunters lost."),
    # ── Neolithic Revolution (Bronze Era onset) ──────────────────────────────
    Epoch("agriculture", "Agriculture", "bronze", -10000, 10.0, "Seeds planted, the first harvest — settlement begins.", "Surplus food frees hands for craft and thought."),
    Epoch("pottery", "Pottery", "bronze", -9000, 13.0, "Clay fired into vessels that store the surplus.", "Storage smooths feast and famine."),
    Epoch("domestication", "Animal Domestication", "bronze", -8500, 16.0, "The wolf becomes the dog; the aurochs, cattle.", "Muscle, milk, and loyal allies."),
    Epoch("weaving", "Weaving", "bronze", -8000, 19.0, "Thread to cloth on the first looms.", "Clothing and trade goods at scale."),
    Epoch("wheel", "The Wheel", "bronze", -3500, 23.0, "The axle turns — distance shrinks.", "Carts, mills, and the idea of rotation itself."),
    Epoch("metallurgy", "Bronze Metallurgy", "bronze", -3300, 27.0, "Copper and tin alloyed into a harder edge.", "Durable tools and the first true craft guilds."),
    Epoch("writing", "Writing", "bronze", -3200, 32.0, "Marks in clay that outlive the speaker.", "Knowledge becomes permanent and accountable."),
    Epoch("mathematics", "Mathematics", "bronze", -2000, 38.0, "Number and proportion — the grammar of the world.", "Prediction replaces guesswork."),
    Epoch("law", "Codified Law", "bronze", -1750, 44.0, "Hammurabi's stele: rules carved for all to see.", "Trust scales beyond the village."),
    # ── Iron & Classical (Iron Era) ──────────────────────────────────────────
    Epoch("iron", "Iron Smelting", "iron", -1200, 50.0, "A hotter forge, a cheaper, stronger metal.", "Tools and plows for the many, not the few."),
    Epoch("alphabet", "The Alphabet", "iron", -1050, 56.0, "A handful of signs for every sound.", "Literacy spreads beyond scribes."),
    Epoch("currency", "Coined Money", "iron", -600, 62.0, "Stamped metal of agreed worth.", "Exchange without barter; markets bloom."),
    Epoch("philosophy", "Natural Philosophy", "iron", -550, 68.0, "Asking *why* the world is as it is.", "The first systematic search for truth."),
    Epoch("medicine", "Systematic Medicine", "iron", -400, 74.0, "Hippocratic observation over superstition.", "Suffering met with method, not omen."),
    Epoch("aqueduct", "Civil Engineering", "iron", -312, 80.0, "Aqueducts, roads, and arches of stone.", "Cities grow healthy and connected."),
    Epoch("geometry", "Axiomatic Geometry", "iron", -300, 86.0, "Euclid: truth derived from first principles.", "Proof — knowledge that compels assent."),
    Epoch("paper", "Paper", "iron", 105, 92.0, "Cheap, light surface for the written word.", "Records and learning travel and multiply."),
    # ── Medieval & Renaissance (Industrial Era onset) ────────────────────────
    Epoch("watermill", "Water & Wind Power", "industrial", 700, 100.0, "Rivers and breezes harnessed to grind and saw.", "Work done by nature, not just muscle."),
    Epoch("clock", "Mechanical Clock", "industrial", 1300, 110.0, "Time divided into equal, countable beats.", "Coordination and the measured day."),
    Epoch("printing", "The Printing Press", "industrial", 1440, 122.0, "Movable type — books by the thousand.", "Knowledge becomes cheap and unstoppable."),
    Epoch("optics", "Lenses & Optics", "industrial", 1590, 134.0, "Telescope and microscope — the unseen revealed.", "New worlds, large and small, come into view."),
    Epoch("method", "The Scientific Method", "industrial", 1620, 148.0, "Hypothesis, experiment, revision.", "A reliable engine for making true knowledge."),
    Epoch("calculus", "Calculus", "industrial", 1687, 162.0, "The mathematics of change and motion.", "Nature's laws made calculable."),
    Epoch("steam", "The Steam Engine", "industrial", 1769, 178.0, "Fire turned into tireless mechanical work.", "Power unchained from wind, water, and muscle."),
    Epoch("vaccination", "Vaccination", "industrial", 1796, 192.0, "Disease prevented, not just survived.", "Plagues that culled generations begin to retreat."),
    # ── Industrial & Modern (Industrial → Information) ────────────────────────
    Epoch("electricity", "Electricity", "industrial", 1831, 208.0, "Faraday's induction — energy that flows on wires.", "Light, motors, and instant communication."),
    Epoch("telegraph", "The Telegraph", "industrial", 1844, 224.0, "Messages at the speed of a spark.", "Distance dissolves for words."),
    Epoch("germ", "Germ Theory", "industrial", 1861, 240.0, "Invisible life as the cause of disease.", "Sanitation and antisepsis save millions."),
    Epoch("combustion", "Internal Combustion", "industrial", 1876, 256.0, "Controlled explosions drive the piston.", "Personal mobility and mechanised everything."),
    Epoch("telephone", "The Telephone", "industrial", 1876, 272.0, "The human voice carried on wire.", "Conversation across any distance."),
    Epoch("radio", "Radio", "industrial", 1895, 290.0, "Information riding invisible waves.", "Communication without wires, to all at once."),
    Epoch("flight", "Powered Flight", "industrial", 1903, 308.0, "Heavier-than-air machines take the sky.", "The planet shrinks to days, then hours."),
    Epoch("relativity", "Relativity & Quantum Theory", "information", 1905, 328.0, "Space, time, and the atom rewritten.", "The deep rules of reality laid bare."),
    Epoch("antibiotics", "Antibiotics", "information", 1928, 348.0, "Penicillin — infection made curable.", "A scratch is no longer a death sentence."),
    Epoch("nuclear", "Nuclear Energy", "information", 1942, 368.0, "The atom's binding force released.", "Vast power — and a sobering responsibility."),
    Epoch("transistor", "The Transistor", "information", 1947, 388.0, "A switch with no moving parts.", "The seed of every computer to come."),
    Epoch("dna", "The Structure of DNA", "information", 1953, 408.0, "The double helix — life's source code read.", "Biology becomes an information science."),
    Epoch("space", "Spaceflight", "information", 1957, 430.0, "The first machines beyond the sky.", "A species looks back at its own pale dot."),
    Epoch("integrated_circuit", "The Integrated Circuit", "information", 1958, 452.0, "Thousands of transistors on a chip.", "Computing becomes small, cheap, ubiquitous."),
    Epoch("internet", "The Internet", "information", 1969, 476.0, "A network of networks, no centre.", "All knowledge, connected and shared."),
    Epoch("genome", "The Human Genome", "information", 2003, 500.0, "Three billion letters, fully read.", "Medicine personalised to the individual."),
    Epoch("smartphone", "Mobile Computing", "information", 2007, 524.0, "A supercomputer in every pocket.", "Knowledge and each other, always at hand."),
    Epoch("renewables", "Renewable Energy at Scale", "information", 2015, 548.0, "Sun and wind cheaper than fire.", "Power without poisoning the world."),
    Epoch("deep_learning", "Deep Learning", "information", 2012, 572.0, "Machines that learn from data, not rules.", "Pattern and perception, automated."),
    Epoch("crispr", "Gene Editing (CRISPR)", "information", 2013, 596.0, "Precise edits to the code of life.", "Inherited disease becomes addressable."),
    Epoch("foundation_models", "Foundation Models", "information", 2020, 622.0, "General models trained on the world's text.", "A new kind of tool for thinking itself."),
    # ── Near-Future (Quantum Era) ────────────────────────────────────────────
    Epoch("agi", "Artificial General Intelligence", "quantum", 2030, 660.0, "Machines that reason across every domain.", "A tireless partner in discovery."),
    Epoch("fusion", "Fusion Power", "quantum", 2035, 700.0, "A star lit and held on the ground.", "Energy effectively without limit or carbon."),
    Epoch("quantum_computing", "Fault-Tolerant Quantum Computing", "quantum", 2035, 740.0, "Logical qubits that hold their state.", "Problems unthinkable for classical machines fall."),
    Epoch("longevity", "Longevity Medicine", "quantum", 2040, 782.0, "Ageing slowed, then arrested.", "Lifetimes — and lifetimes of learning — extended."),
    Epoch("bci", "Brain–Computer Interface", "quantum", 2045, 826.0, "Thought and machine directly joined.", "Knowledge written and read at the speed of mind."),
    Epoch("self_driving_lab", "Autonomous Self-Driving Labs", "quantum", 2050, 872.0, "Science that runs itself, day and night.", "Discovery limited only by ideas, not hands."),
    Epoch("nanofabrication", "Atomically-Precise Manufacturing", "quantum", 2060, 920.0, "Matter assembled atom by atom.", "Anything designable becomes buildable."),
    # ── Far-Future (beyond Quantum — speculative but seriously proposed) ──────
    Epoch("orbital", "Orbital Civilisation", "quantum", 2080, 970.0, "Habitats and industry in space.", "Room and resources beyond one fragile world."),
    Epoch("dyson_swarm", "Dyson Swarm", "quantum", 2150, 1022.0, "A star's full output harvested.", "Energy at the scale of a sun."),
    Epoch("uploading", "Mind Uploading", "quantum", 2200, 1076.0, "Minds running on new substrates.", "Continuity of self beyond the body."),
    Epoch("interstellar", "Interstellar Travel", "quantum", 2300, 1132.0, "The first crossings between stars.", "The story continues under other suns."),
    Epoch("starlifting", "Stellar Engineering", "quantum", 3000, 1190.0, "Reshaping stars themselves.", "A civilisation that tends the heavens."),
]


def knowledge_index(*, discoveries: int, avg_expertise: float, approved_inventions: int) -> float:
    """A single monotonic measure of how far a civilisation has come — combines
    foundational discoveries, the population's expertise, and proven inventions.
    Matches the spacing of the EPOCHS thresholds above."""
    return discoveries * 4.0 + avg_expertise * 6.0 + approved_inventions * 0.5


def epoch_for(index: float) -> Epoch:
    """The most advanced epoch a civilisation at this knowledge index has reached."""
    reached = EPOCHS[0]
    for e in EPOCHS:
        if index >= e.threshold:
            reached = e
        else:
            break
    return reached


def next_epoch(index: float) -> Epoch | None:
    """The epoch on the horizon — the civilisation's current aspiration."""
    for e in EPOCHS:
        if index < e.threshold:
            return e
    return None


def epoch_progress(index: float) -> dict:
    """Where the civilisation stands: current epoch, the next on the horizon, and
    how close it is — the narrative 'you are here' on the arc of history."""
    cur = epoch_for(index)
    nxt = next_epoch(index)
    if nxt is None:
        return {"epoch": cur.id, "name": cur.name, "era": cur.era, "year": cur.year,
                "theme": cur.theme, "gift": cur.gift, "next": None, "progress": 1.0,
                "index": round(index, 2), "total_epochs": len(EPOCHS)}
    span = nxt.threshold - cur.threshold or 1.0
    prog = max(0.0, min(1.0, (index - cur.threshold) / span))
    return {"epoch": cur.id, "name": cur.name, "era": cur.era, "year": cur.year,
            "theme": cur.theme, "gift": cur.gift,
            "next": {"id": nxt.id, "name": nxt.name, "year": nxt.year, "theme": nxt.theme},
            "progress": round(prog, 3), "index": round(index, 2),
            "epoch_number": EPOCHS.index(cur) + 1, "total_epochs": len(EPOCHS)}
