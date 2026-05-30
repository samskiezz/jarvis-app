"""In-world appearance & body modification (doc II.144-146).

A Minion's look — hair, garment, body art, modifications — is not free cosmetics:
each option is unlocked by the civilization's technology. Dyed cloth needs
agriculture/chemistry, fine jewellery needs metallurgy, and cybernetic body
modification only appears once a world reaches the information age. So a stone-age
Minion wears hides and ash-marks; an information-age Minion may have implants.
"""

from __future__ import annotations

import random

_HAIR = ("cropped", "braided", "long", "shaved", "topknot", "wild", "coiled")
_BASE_GARMENTS = ("hides", "woven tunic", "robe")
_DYED_GARMENTS = ("dyed cloak", "patterned robe", "bright tunic")
_FINE_GARMENTS = ("embroidered coat", "tailored suit", "ceremonial dress")

_ERA_INDEX = {
    "stone": 0, "bronze": 1, "iron": 2, "industrial": 3,
    "electric": 4, "information": 5, "quantum": 6,
}


def unlocked_features(era: str, discovered: set[str]) -> dict[str, bool]:
    """Which customization categories the world's tech has unlocked."""
    idx = _ERA_INDEX.get(era, 0)
    return {
        "hair": True,
        "body_art": True,                                   # ash/ochre from the start
        "dyed_cloth": "agriculture" in discovered or idx >= 1,
        "jewellery": "metallurgy" in discovered or idx >= 2,
        "piercings": idx >= 1,
        "tattoos": "pottery" in discovered or idx >= 1,     # needles/ink
        "cybernetics": idx >= 5,                            # information age+
    }


def for_minion(minion, era: str, discovered: set[str]) -> dict:
    """Deterministic appearance for a Minion within its world's unlocked options."""
    feats = unlocked_features(era, discovered)
    rng = random.Random(hash(minion.id) & 0xFFFFFFFF)

    if feats["jewellery"] and rng.random() < 0.5:
        garment = rng.choice(_FINE_GARMENTS)
    elif feats["dyed_cloth"] and rng.random() < 0.6:
        garment = rng.choice(_DYED_GARMENTS)
    else:
        garment = rng.choice(_BASE_GARMENTS)

    body_art: list[str] = []
    charisma = getattr(minion, "extraversion", 0.5)
    if feats["tattoos"] and rng.random() < 0.3 + 0.4 * charisma:
        body_art.append("tattoos")
    if feats["piercings"] and rng.random() < 0.25:
        body_art.append("piercings")

    modifications: list[str] = []
    if feats["cybernetics"] and rng.random() < 0.35:
        modifications.append(rng.choice(("neural implant", "ocular augment", "prosthetic arm")))

    return {
        "hair": rng.choice(_HAIR),
        "garment": garment,
        "body_art": body_art,
        "modifications": modifications,
        "unlocked": feats,
    }
