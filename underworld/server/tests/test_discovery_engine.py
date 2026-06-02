"""Tests for the Discovery Engine — WorldTruth vs MinionBelief keystone."""
from underworld.server.services.discovery_engine import (
    Belief,
    MaterialTruth,
    Property,
    belief_error,
    discover_property,
    is_discovered,
    measure_property,
    update_belief,
)


def _copper() -> MaterialTruth:
    # hidden truth: high electrical conductivity (~5.96e7 S/m)
    return MaterialTruth(
        material_id="shiny_stone",   # what the Minion sees
        true_name="copper",          # what the world knows
        properties={
            Property.CONDUCTIVITY.value: 5.96e7,
            Property.DENSITY.value: 8960.0,
        },
    )


def test_wrong_instrument_yields_no_observation():
    # measuring conductivity with a balance (wrong tool) → no data
    obs = measure_property(_copper(), Property.CONDUCTIVITY, instrument="balance",
                           instrument_precision=0.05, observer_skill=0.8, tick=0)
    assert obs is None


def test_observation_never_exposes_truth_exactly():
    truth = _copper()
    obs = measure_property(truth, Property.CONDUCTIVITY, instrument="voltmeter",
                           instrument_precision=0.05, observer_skill=0.8, tick=1)
    assert obs is not None
    # a noisy instrument almost never reads the exact truth
    assert obs.value != truth.properties[Property.CONDUCTIVITY.value]
    assert obs.uncertainty > 0


def test_measurement_is_deterministic():
    truth = _copper()
    a = measure_property(truth, Property.CONDUCTIVITY, instrument="voltmeter",
                         instrument_precision=0.05, observer_skill=0.8, tick=7)
    b = measure_property(truth, Property.CONDUCTIVITY, instrument="voltmeter",
                         instrument_precision=0.05, observer_skill=0.8, tick=7)
    assert a.value == b.value  # same seed+inputs → same reading (auditable)


def test_single_observation_is_not_a_discovery():
    truth = _copper()
    b = Belief(material_id=truth.material_id, property=Property.CONDUCTIVITY)
    obs = measure_property(truth, Property.CONDUCTIVITY, instrument="voltmeter",
                           instrument_precision=0.05, observer_skill=0.9, tick=0)
    update_belief(b, obs)
    assert b.n == 1
    assert not is_discovered(b)  # one reading never establishes a fact


def test_replication_drives_confidence_and_discovery():
    truth = _copper()
    belief = discover_property(truth, Property.CONDUCTIVITY, instrument="voltmeter",
                               instrument_precision=0.04, observer_skill=0.9)
    assert belief.n >= 3
    assert is_discovered(belief)
    # the earned estimate is close to the hidden truth (but not magically exact)
    err = belief_error(belief, truth)
    assert err is not None and err < 0.15


def test_better_skill_and_instrument_reduce_error():
    truth = _copper()
    crude = discover_property(truth, Property.CONDUCTIVITY, instrument="voltmeter",
                              instrument_precision=0.20, observer_skill=0.3, max_trials=12)
    fine = discover_property(truth, Property.CONDUCTIVITY, instrument="voltmeter",
                             instrument_precision=0.02, observer_skill=0.95, max_trials=12)
    assert belief_error(fine, truth) <= belief_error(crude, truth)


def test_contamination_widens_uncertainty():
    clean = _copper()
    dirty = MaterialTruth(material_id="ore", true_name="copper",
                          properties={Property.CONDUCTIVITY.value: 5.96e7},
                          contamination=0.8)
    oc = measure_property(clean, Property.CONDUCTIVITY, instrument="voltmeter",
                          instrument_precision=0.05, observer_skill=0.8, tick=0)
    od = measure_property(dirty, Property.CONDUCTIVITY, instrument="voltmeter",
                          instrument_precision=0.05, observer_skill=0.8, tick=0)
    assert od.uncertainty > oc.uncertainty


def test_inverse_variance_weighting_favours_precise_reads():
    truth = _copper()
    b = Belief(material_id="x", property=Property.CONDUCTIVITY)
    # a precise reading near truth, then a wild imprecise one
    update_belief(b, type(measure_property(truth, Property.CONDUCTIVITY, instrument="voltmeter",
                  instrument_precision=0.01, observer_skill=1.0, tick=0))(
                  material_id="x", property=Property.CONDUCTIVITY, value=6.0e7,
                  uncertainty=1e5, instrument="voltmeter", observer_skill=1.0, tick=0))
    from underworld.server.services.discovery_engine import Observation
    update_belief(b, Observation("x", Property.CONDUCTIVITY, value=1.0e7,
                  uncertainty=5e7, instrument="voltmeter", observer_skill=0.1, tick=1))
    # estimate stays near the precise reading, not the noisy one
    assert b.estimate > 4.0e7


def test_belief_error_is_admin_only_diagnostic():
    truth = _copper()
    b = discover_property(truth, Property.CONDUCTIVITY, instrument="voltmeter",
                          instrument_precision=0.03, observer_skill=0.9)
    # belief_error reads WorldTruth — it's the player/admin lens, returns a number
    assert isinstance(belief_error(b, truth), float)
    # a property the truth doesn't define → None
    assert belief_error(Belief("x", Property.HARDNESS), truth) is None
