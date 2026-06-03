"""The design catalogue — what the Underworld needs generated for HD rendering.

Organised by category + epoch so the world can be dressed consistently as it
advances along the real tech ladder (epochs.py). Each entry becomes a Tripo3D
text→3D job. Prompts are written for a cohesive, stylised "life-sim" look
(Sims-4-grade): clean readable forms, warm materials, game-ready scale.

Extend freely — this is just the seed catalogue; the generator dedupes by id so
re-runs only make what's missing.
"""

# (id, category, epoch_tag, prompt)
DESIGNS: list[tuple[str, str, str, str]] = [
    # ── dwellings, per era (the heart of a life-sim) ──────────────────────────
    ("hut_stone", "building", "stone", "a cosy stone-age thatched hut, stylised game asset, warm earthy materials, clean low-poly forms"),
    ("house_bronze", "building", "bronze", "a bronze-age mud-brick house with a flat roof and a small courtyard, stylised life-sim building"),
    ("house_iron", "building", "iron", "an iron-age timber-and-stone cottage with a tiled roof, cosy stylised game house"),
    ("townhouse_industrial", "building", "industrial", "a Victorian industrial-era brick townhouse with chimneys and sash windows, stylised life-sim home"),
    ("home_modern", "building", "information", "a clean modern suburban family home with large windows and a garden, Sims-style stylised house"),
    ("habitat_quantum", "building", "quantum", "a sleek near-future smart home with solar roof and soft glowing accents, stylised game asset"),
    # ── civic + work ──────────────────────────────────────────────────────────
    ("workshop", "building", "iron", "a craftsman's workshop with an open front and tools on the wall, stylised life-sim building"),
    ("library", "building", "industrial", "a grand stylised library with columns and warm interior light, game-ready"),
    ("laboratory", "building", "information", "a bright modern research laboratory building, clean stylised life-sim asset"),
    ("market_stall", "prop", "bronze", "a wooden market stall with a striped awning and produce baskets, stylised game prop"),
    # ── furniture / props (dressing lots, Sims-style) ─────────────────────────
    ("bed_cosy", "prop", "any", "a cosy wooden bed with soft blankets, stylised life-sim furniture, warm colours"),
    ("dining_table", "prop", "any", "a round wooden dining table with four chairs, stylised game furniture"),
    ("armchair", "prop", "any", "a comfy upholstered armchair, stylised Sims-style furniture, soft fabric"),
    ("bookshelf", "prop", "any", "a tall wooden bookshelf filled with colourful books, stylised game prop"),
    ("kitchen_counter", "prop", "any", "a tidy kitchen counter with a sink and cabinets, stylised life-sim furniture"),
    ("street_lamp", "prop", "industrial", "an ornate cast-iron street lamp with a warm glowing light, stylised game prop"),
    ("garden_bench", "prop", "any", "a wooden park bench, stylised cosy game prop"),
    ("fountain", "prop", "iron", "a stone town-square fountain with flowing water, stylised life-sim centrepiece"),
    # ── nature ────────────────────────────────────────────────────────────────
    ("tree_oak", "nature", "any", "a lush stylised oak tree with rounded foliage, game-ready, soft warm greens"),
    ("tree_pine", "nature", "any", "a tall stylised pine tree, clean low-poly game asset"),
    ("flower_bed", "nature", "any", "a colourful flower bed planter, cheerful stylised game prop"),
    ("rock_cluster", "nature", "any", "a cluster of mossy rocks, stylised natural game asset"),
    # ── vehicles / tech by era ────────────────────────────────────────────────
    ("cart_wooden", "vehicle", "bronze", "a simple wooden hand cart with two wheels, stylised game asset"),
    ("steam_engine", "vehicle", "industrial", "a small Victorian steam locomotive, charming stylised game model"),
    ("car_modern", "vehicle", "information", "a friendly rounded modern compact car, stylised Sims-style vehicle"),
    # ── monuments (epoch milestones get a landmark) ───────────────────────────
    ("monument_obelisk", "monument", "bronze", "a carved stone obelisk monument, stylised game landmark"),
    ("clock_tower", "monument", "industrial", "a tall ornate town clock tower, warm stylised life-sim landmark"),
]


def designs_for(epoch_tag: str | None = None) -> list[tuple[str, str, str, str]]:
    """All designs, or those for an epoch (plus the 'any' evergreens)."""
    if epoch_tag is None:
        return list(DESIGNS)
    return [d for d in DESIGNS if d[2] in (epoch_tag, "any")]
