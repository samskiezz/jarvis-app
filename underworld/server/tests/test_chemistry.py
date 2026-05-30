"""Deep physics: chemistry engine (#11)."""

from __future__ import annotations

from underworld.server.services import chemistry


def test_smelting_requires_enough_heat():
    cold = chemistry.react(["iron_ore"], temperature_c=1000)
    assert cold.succeeded is False and cold.products == ["iron_ore"]
    hot = chemistry.react(["iron_ore"], temperature_c=1600)   # iron melts at 1538°C
    assert hot.succeeded and hot.products == ["iron"]


def test_combustion_releases_energy_above_ignition():
    cold = chemistry.react(["coal", "oxygen"], temperature_c=50)
    assert cold.succeeded is False
    burn = chemistry.react(["coal", "oxygen"], temperature_c=600)
    assert burn.succeeded and burn.energy_mj > 0 and "carbon_dioxide" in burn.products
    # oil packs more energy than wood
    oil = chemistry.react(["oil", "oxygen"], temperature_c=600).energy_mj
    wood = chemistry.react(["wood", "oxygen"], temperature_c=600).energy_mj
    assert oil > wood


def test_neutralisation_makes_salt_at_ph7():
    r = chemistry.react(["acid", "base"])
    assert r.succeeded and set(r.products) == {"salt", "water"} and r.ph == 7.0


def test_alloying_two_metals():
    r = chemistry.react(["copper", "tin"])
    assert r.succeeded and r.products == ["bronze"]


def test_unknown_reaction_fails_gracefully():
    r = chemistry.react(["wood", "stone"])
    assert r.succeeded is False and "No known reaction" in r.notes[0]


def test_chemistry_route(client, headers):
    body = client.post("/substrate/chemistry/react", headers=headers,
                       json={"reactants": ["iron_ore"], "temperature_c": 1600}).json()
    assert body["succeeded"] and body["products"] == ["iron"]
    burn = client.post("/substrate/chemistry/react", headers=headers,
                       json={"reactants": ["coal", "oxygen"], "temperature_c": 600}).json()
    assert burn["energy_mj"] > 0
