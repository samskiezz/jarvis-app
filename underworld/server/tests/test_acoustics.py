"""Deep physics: acoustics — sound propagation + communication range (#10)."""

from __future__ import annotations

from underworld.server.services import acoustics


def test_sound_attenuates_with_distance():
    near = acoustics.sound_level_at(60, 2)
    far = acoustics.sound_level_at(60, 200)
    assert near > far
    assert acoustics.sound_level_at(60, 1) == 60   # at the source


def test_bad_weather_shrinks_communication_range():
    # use a shout (80 dB) so it still carries some distance over a 65 dB storm
    calm = acoustics.comm_range(80, "clear")
    storm = acoustics.comm_range(80, "storm")
    assert calm > storm > 0
    # a normal 60 dB voice is fully drowned out by a storm (range collapses to 0)
    assert acoustics.comm_range(60, "storm") == 0.0


def test_audibility_threshold():
    assert acoustics.audible(60, 3, "clear") is True
    assert acoustics.audible(60, 5000, "storm") is False


def test_sound_travels_faster_in_denser_media():
    assert acoustics.travel_time(1000, "water") < acoustics.travel_time(1000, "air")
    assert acoustics.travel_time(1000, "steel") < acoustics.travel_time(1000, "water")


def test_speech_clarity_drops_in_noise():
    assert acoustics.speech_clarity("clear") == 1.0
    assert acoustics.speech_clarity("storm") < acoustics.speech_clarity("clear")


def test_acoustics_route(client, headers):
    body = client.get("/substrate/acoustics?source_db=60&distance_m=10&weather=storm", headers=headers).json()
    assert {"level_db", "audible", "comm_range_m", "travel_time_s", "speech_clarity"} <= set(body)
    assert body["comm_range_m"] < client.get(
        "/substrate/acoustics?source_db=60&distance_m=10&weather=clear", headers=headers
    ).json()["comm_range_m"]
