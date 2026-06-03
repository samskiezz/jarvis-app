"""Verification tests for methods_acoustics2 — each asserts a computed result
matches a KNOWN published value.
"""
import numpy as np

from underworld.server.services.methods_acoustics2 import (
    sound_intensity_level,
    doppler_shift,
    string_harmonics,
    organ_pipe_resonance,
    sabine_reverberation,
    beat_frequency,
    transmission_loss,
    speed_of_sound_air,
)


def test_sound_intensity_level_doubling_power_is_plus_3db():
    # KNOWN: L = 10 log10(I/I0). Doubling the intensity adds 10 log10(2) = 3.01 dB.
    one = sound_intensity_level(intensity_w_m2=1e-6)     # 60 dB above 1e-12
    assert abs(one["level_db"] - 60.0) < 1e-9
    two = sound_intensity_level(intensity_w_m2=2e-6)     # doubled power
    assert abs((two["level_db"] - one["level_db"]) - 3.0103) < 1e-3   # +3 dB
    assert abs(one["doubling_power_increment_db"] - 3.0103) < 1e-3


def test_doppler_approaching_source_raises_pitch():
    # KNOWN: a source approaching a stationary observer raises the pitch.
    # f=1000 Hz, v_src=34.3 m/s (0.1 c), c=343 -> f' = 1000*343/(343-34.3) ~= 1111 Hz.
    out = doppler_shift(source_freq_hz=1000.0, source_speed_m_s=34.3,
                        sound_speed_m_s=343.0, source_approaching=True)
    assert out["pitch_raised"] is True
    assert out["observed_freq_hz"] > 1000.0
    assert abs(out["observed_freq_hz"] - 343.0 / (343.0 - 34.3) * 1000.0) < 1e-6
    # Receding source lowers the pitch.
    recede = doppler_shift(source_freq_hz=1000.0, source_speed_m_s=34.3,
                           sound_speed_m_s=343.0, source_approaching=False)
    assert recede["pitch_raised"] is False
    assert recede["observed_freq_hz"] < 1000.0


def test_string_harmonics_fundamental_and_integer_multiples():
    # KNOWN: f_n = n*v/(2L). L=0.5 m, v=200 m/s -> f_1 = 200/(2*0.5) = 200 Hz.
    out = string_harmonics(length_m=0.5, wave_speed_m_s=200.0, n_modes=5)
    assert abs(out["fundamental_hz"] - 200.0) < 1e-9
    assert abs(out["harmonics_hz"][0] - 200.0) < 1e-9   # f_1
    assert abs(out["harmonics_hz"][1] - 400.0) < 1e-9   # f_2 = 2*f_1
    assert abs(out["harmonics_hz"][2] - 600.0) < 1e-9   # f_3 = 3*f_1
    # integer-multiple relationship
    for i, f in enumerate(out["harmonics_hz"], start=1):
        assert abs(f - i * out["fundamental_hz"]) < 1e-9


def test_organ_pipe_closed_has_odd_harmonics_only():
    # KNOWN: closed pipe f_n = (2n-1) v/4L -> odd harmonics 1,3,5,...
    # L=0.5 m, c=343 -> closed fundamental f_1 = 343/(4*0.5) = 171.5 Hz.
    closed = organ_pipe_resonance(length_m=0.5, closed_end=True,
                                  sound_speed_m_s=343.0, n_modes=4)
    assert abs(closed["fundamental_hz"] - 171.5) < 1e-6
    assert closed["harmonic_multipliers"] == [1, 3, 5, 7]   # odd only
    assert closed["odd_harmonics_only"] is True
    # 3rd resonance = 3 * fundamental
    assert abs(closed["harmonics_hz"][1] - 3 * 171.5) < 1e-6
    # KNOWN: an open pipe of equal length has f_1 = v/2L = 343 Hz, one octave
    # higher than the closed pipe, and ALL integer harmonics.
    openp = organ_pipe_resonance(length_m=0.5, closed_end=False,
                                 sound_speed_m_s=343.0, n_modes=4)
    assert abs(openp["fundamental_hz"] - 343.0) < 1e-6
    assert openp["harmonic_multipliers"] == [1, 2, 3, 4]    # all harmonics
    assert openp["odd_harmonics_only"] is False
    assert abs(openp["fundamental_hz"] / closed["fundamental_hz"] - 2.0) < 1e-9


def test_sabine_reverberation_known_one_second():
    # KNOWN: RT60 = 0.161 V / A. V=1000 m^3, A=161 sabins -> RT60 = 1.0 s.
    out = sabine_reverberation(volume_m3=1000.0, absorption_sabins_m2=161.0)
    assert abs(out["rt60_s"] - 1.0) < 1e-9
    # exact relation
    assert abs(out["rt60_s"] - 0.161 * 1000.0 / 161.0) < 1e-12


def test_beat_frequency_440_and_444_is_4hz():
    # KNOWN: f_beat = |f1 - f2|. 440 Hz and 444 Hz -> 4 Hz.
    out = beat_frequency(freq1_hz=440.0, freq2_hz=444.0)
    assert abs(out["beat_freq_hz"] - 4.0) < 1e-12
    assert abs(out["mean_freq_hz"] - 442.0) < 1e-12
    # symmetric (absolute value)
    assert beat_frequency(freq1_hz=444.0, freq2_hz=440.0)["beat_freq_hz"] == 4.0


def test_transmission_loss_mass_law_6db_per_octave():
    # KNOWN: mass law TL rises 6 dB per octave (doubling of frequency).
    low = transmission_loss(surface_mass_kg_m2=10.0, frequency_hz=500.0)
    high = transmission_loss(surface_mass_kg_m2=10.0, frequency_hz=1000.0)  # +1 octave
    assert abs((high["transmission_loss_db"] - low["transmission_loss_db"])
               - 6.0206) < 1e-3      # +6 dB per octave
    assert abs(low["octave_increment_db"] - 6.0206) < 1e-3
    # KNOWN: also +6 dB for every doubling of surface mass.
    heavy = transmission_loss(surface_mass_kg_m2=20.0, frequency_hz=500.0)
    assert abs((heavy["transmission_loss_db"] - low["transmission_loss_db"])
               - 6.0206) < 1e-3


def test_speed_of_sound_air_343_at_20c():
    # KNOWN: c ~= 343 m/s at 20 C (exact c = 331.3*sqrt(1+T/273.15)).
    out = speed_of_sound_air(temperature_c=20.0)
    assert abs(out["speed_m_s"] - 343.2) < 0.3       # ~343 m/s
    # 0 C reference value
    zero = speed_of_sound_air(temperature_c=0.0)
    assert abs(zero["speed_m_s"] - 331.3) < 1e-6
    # linear approximation agrees closely near room temperature
    assert abs(out["speed_m_s"] - out["speed_linear_approx_m_s"]) < 0.5
