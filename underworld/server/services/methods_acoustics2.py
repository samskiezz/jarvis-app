"""Acoustics simulation methods.

Eight named, real acoustics methods, each computed from its canonical published
formula and each verified in the test suite against a KNOWN published value:

  1. sound_intensity_level   — SIL dB = 10*log10(I/I0), I0 = 1e-12 W/m^2
                               (doubling the power/intensity -> +3.01 dB)
  2. doppler_shift           — moving-source/observer Doppler frequency shift
                               (source approaching the observer raises the pitch)
  3. string_harmonics        — vibrating-string modes f_n = n*v/(2L)
                               (fundamental f_1 = v/2L; harmonics are integer
                                multiples)
  4. organ_pipe_resonance    — open vs closed (stopped) pipe resonances
                               (open pipe f_n = n*v/2L all integers; closed pipe
                                f_n = (2n-1)*v/4L -> ODD harmonics only, and a
                                closed pipe sounds one octave lower than an open
                                pipe of the same length)
  5. sabine_reverberation    — Sabine RT60 = 0.161 * V / A
                               (V=1000 m^3, A=161 m^2 sabins -> RT60 = 1.0 s)
  6. beat_frequency          — beats f_beat = |f1 - f2|
                               (440 Hz & 444 Hz -> 4 Hz beat)
  7. transmission_loss       — partition mass law TL = 20*log10(m*f) - 47.2 dB
                               (doubling frequency -> +6.02 dB per octave)
  8. speed_of_sound_air      — c(T) = 331.3 * sqrt(1 + T/273.15)
                               (T = 20 C -> c ~= 343.2 m/s)

Sources (researched & verified):
  - Mass law / 6 dB per octave & per mass doubling:
    techniconacoustics.com mass-law-sound-transmission-loss,
    csgacoustics.co.uk/mass-law-what-is-it, asastandards.org mass-law TL.
  - Sabine RT60 = 0.161 V/A; the 0.161 constant encodes 24*ln(10)/c with
    c = 343 m/s at 20 C: acousticlab.com reverberation-time-and-sabines-formula,
    acousplan.com reverberation-time-formula-derivation.
  - Doppler effect, string/pipe harmonics, beats, speed of sound c=331.3*
    sqrt(1+T/273.15): standard acoustics (Halliday/Resnick, Hyperphysics).
"""
from __future__ import annotations

import numpy as np

# Reference intensity for the standard threshold of hearing (W/m^2).
I0_REFERENCE = 1.0e-12


# 1. SOUND INTENSITY LEVEL ----------------------------------------------------
def sound_intensity_level(*, intensity_w_m2: float,
                          reference_w_m2: float = I0_REFERENCE) -> dict:
    """Sound intensity level (SIL) in decibels: L = 10*log10(I/I0).

    I0 = 1e-12 W/m^2 is the standard reference (threshold of hearing).

    Known check: doubling the intensity (power) adds 10*log10(2) = 3.0103 dB,
    the familiar "+3 dB = double the power" rule.
    """
    if intensity_w_m2 <= 0.0:
        raise ValueError("intensity must be positive")
    level_db = 10.0 * np.log10(intensity_w_m2 / reference_w_m2)
    # The level increase obtained by doubling this intensity.
    doubling_increment_db = 10.0 * np.log10(2.0)
    return {
        "level_db": float(level_db),
        "intensity_w_m2": float(intensity_w_m2),
        "reference_w_m2": float(reference_w_m2),
        "doubling_power_increment_db": float(doubling_increment_db),
    }


# 2. DOPPLER EFFECT -----------------------------------------------------------
def doppler_shift(*, source_freq_hz: float, source_speed_m_s: float = 0.0,
                  observer_speed_m_s: float = 0.0,
                  sound_speed_m_s: float = 343.0,
                  source_approaching: bool = True,
                  observer_approaching: bool = True) -> dict:
    """Doppler-shifted frequency for a moving source and/or observer.

    f' = f * (c +/- v_obs) / (c -/+ v_src)

    Sign convention (speeds given as non-negative magnitudes):
      - observer moving TOWARD the source -> numerator (c + v_obs)
      - observer moving AWAY               -> numerator (c - v_obs)
      - source moving TOWARD the observer  -> denominator (c - v_src)
      - source moving AWAY                 -> denominator (c + v_src)

    Known check: a source APPROACHING a stationary observer raises the observed
    pitch (f' > f); a receding source lowers it (f' < f).
    """
    c = sound_speed_m_s
    v_obs = observer_speed_m_s if observer_approaching else -observer_speed_m_s
    v_src = source_speed_m_s if source_approaching else -source_speed_m_s
    denom = c - v_src
    if denom <= 0.0:
        raise ValueError("source at or above sound speed (shock); undefined shift")
    observed = source_freq_hz * (c + v_obs) / denom
    return {
        "observed_freq_hz": float(observed),
        "source_freq_hz": float(source_freq_hz),
        "shift_hz": float(observed - source_freq_hz),
        "pitch_raised": bool(observed > source_freq_hz),
    }


# 3. STANDING WAVES / STRING HARMONICS ---------------------------------------
def string_harmonics(*, length_m: float, wave_speed_m_s: float,
                     n_modes: int = 5) -> dict:
    """Vibrating-string standing-wave modes f_n = n * v / (2L).

    A string fixed at both ends supports all integer harmonics. The
    fundamental is f_1 = v/(2L); the nth mode is n times the fundamental and
    has n antinodes (wavelength lambda_n = 2L/n).

    Known check: fundamental f_1 = v/(2L), and harmonics 2,3,... are exact
    integer multiples of f_1.
    """
    if length_m <= 0.0 or wave_speed_m_s <= 0.0:
        raise ValueError("length and wave speed must be positive")
    if n_modes < 1:
        raise ValueError("n_modes must be >= 1")
    n = np.arange(1, n_modes + 1)
    fundamental = wave_speed_m_s / (2.0 * length_m)
    freqs = n * fundamental
    wavelengths = 2.0 * length_m / n
    return {
        "fundamental_hz": float(fundamental),
        "harmonics_hz": [float(f) for f in freqs],
        "wavelengths_m": [float(w) for w in wavelengths],
        "mode_numbers": [int(i) for i in n],
    }


# 4. ORGAN PIPE RESONANCE -----------------------------------------------------
def organ_pipe_resonance(*, length_m: float, closed_end: bool,
                         sound_speed_m_s: float = 343.0,
                         n_modes: int = 5) -> dict:
    """Resonant frequencies of an organ pipe (open-open vs closed-open).

    Open pipe (both ends open):  f_n = n * v / (2L), n = 1,2,3,...  (all
        harmonics present).
    Closed pipe (one end stopped):  f_n = (2n-1) * v / (4L), n = 1,2,3,...  ->
        ODD harmonics only (1,3,5,...) of the open-pipe spacing, and the
        fundamental is HALF that of an open pipe of equal length (one octave
        lower).

    Known check: a closed pipe produces only odd harmonics, and its
    fundamental equals one quarter wavelength: f_1 = v/(4L).
    """
    if length_m <= 0.0 or sound_speed_m_s <= 0.0:
        raise ValueError("length and sound speed must be positive")
    if n_modes < 1:
        raise ValueError("n_modes must be >= 1")
    c = sound_speed_m_s
    L = length_m
    idx = np.arange(1, n_modes + 1)
    if closed_end:
        fundamental = c / (4.0 * L)
        harmonic_multipliers = 2 * idx - 1          # 1, 3, 5, 7, ...
        freqs = harmonic_multipliers * fundamental
    else:
        fundamental = c / (2.0 * L)
        harmonic_multipliers = idx                  # 1, 2, 3, 4, ...
        freqs = harmonic_multipliers * fundamental
    return {
        "closed_end": bool(closed_end),
        "fundamental_hz": float(fundamental),
        "harmonics_hz": [float(f) for f in freqs],
        "harmonic_multipliers": [int(m) for m in harmonic_multipliers],
        "odd_harmonics_only": bool(closed_end),
    }


# 5. SABINE REVERBERATION TIME ------------------------------------------------
def sabine_reverberation(*, volume_m3: float, absorption_sabins_m2: float,
                         constant: float = 0.161) -> dict:
    """Sabine reverberation time RT60 = k * V / A.

    V is the room volume (m^3), A is the total equivalent absorption area
    (sabins, m^2), and k ~= 0.161 s/m (= 24*ln(10)/c with c=343 m/s at 20 C).
    RT60 is the time for the sound-energy level to decay by 60 dB.

    Known check: V = 1000 m^3, A = 161 m^2 sabins -> RT60 = 1.0 s.
    """
    if volume_m3 <= 0.0 or absorption_sabins_m2 <= 0.0:
        raise ValueError("volume and absorption must be positive")
    rt60 = constant * volume_m3 / absorption_sabins_m2
    return {
        "rt60_s": float(rt60),
        "volume_m3": float(volume_m3),
        "absorption_sabins_m2": float(absorption_sabins_m2),
        "constant": float(constant),
    }


# 6. BEAT FREQUENCY -----------------------------------------------------------
def beat_frequency(*, freq1_hz: float, freq2_hz: float) -> dict:
    """Beat frequency between two near tones: f_beat = |f1 - f2|.

    Two superposed tones produce an amplitude modulation (beating) at the
    difference frequency. The perceived "average" tone is (f1 + f2)/2.

    Known check: 440 Hz and 444 Hz -> 4 Hz beat.
    """
    beat = abs(freq1_hz - freq2_hz)
    return {
        "beat_freq_hz": float(beat),
        "mean_freq_hz": float(0.5 * (freq1_hz + freq2_hz)),
        "freq1_hz": float(freq1_hz),
        "freq2_hz": float(freq2_hz),
    }


# 7. SOUND TRANSMISSION LOSS (MASS LAW) --------------------------------------
def transmission_loss(*, surface_mass_kg_m2: float, frequency_hz: float) -> dict:
    """Normal-incidence mass-law sound transmission loss of a partition.

    TL = 20*log10(m * f) - 47.2   (dB), with m the surface (areal) mass in
    kg/m^2 and f the frequency in Hz. The -47.2 dB constant follows from
    20*log10(pi/(rho0*c)) with rho0*c ~= 415 rayls (air).

    Known check: the mass law rises 6 dB per OCTAVE (every doubling of f) and
    6 dB per doubling of mass, since 20*log10(2) = 6.02 dB.
    """
    if surface_mass_kg_m2 <= 0.0 or frequency_hz <= 0.0:
        raise ValueError("surface mass and frequency must be positive")
    tl = 20.0 * np.log10(surface_mass_kg_m2 * frequency_hz) - 47.2
    octave_increment_db = 20.0 * np.log10(2.0)
    return {
        "transmission_loss_db": float(tl),
        "surface_mass_kg_m2": float(surface_mass_kg_m2),
        "frequency_hz": float(frequency_hz),
        "octave_increment_db": float(octave_increment_db),
        "mass_doubling_increment_db": float(octave_increment_db),
    }


# 8. SPEED OF SOUND IN AIR vs TEMPERATURE ------------------------------------
def speed_of_sound_air(*, temperature_c: float) -> dict:
    """Speed of sound in dry air as a function of temperature.

    Exact (ideal-gas) form:  c(T) = 331.3 * sqrt(1 + T_C/273.15)  [m/s]
    Linear approximation:     c ~= 331.3 + 0.606 * T_C            [m/s]

    Known check: T = 20 C -> c ~= 343.2 m/s.
    """
    t = temperature_c
    c_exact = 331.3 * np.sqrt(1.0 + t / 273.15)
    c_linear = 331.3 + 0.606 * t
    return {
        "speed_m_s": float(c_exact),
        "speed_linear_approx_m_s": float(c_linear),
        "temperature_c": float(t),
    }
