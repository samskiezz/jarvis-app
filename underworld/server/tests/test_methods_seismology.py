"""Each seismology method must reproduce its KNOWN published or analytically
exact value.

Citations are inline. Tolerances are explicit.
"""
import math

import numpy as np

from underworld.server.services.methods_seismology import (
    body_wave_velocities,
    energy_from_magnitude,
    epicenter_trilateration,
    gutenberg_richter_b_value,
    moment_magnitude,
    omori_aftershock_rate,
    ps_travel_time_distance,
    richter_local_magnitude,
)


# 1. Richter ML — KNOWN: Richter anchors ML=3 to a 1 mm Wood-Anderson trace at
#    100 km; Hutton-Boore -log10(A0)=3.0 at 100 km reproduces ML=3.0.
#    Ref: Richter (1935) BSSA 25:1; Hutton & Boore (1987) BSSA 77:6.
def test_richter_ml_anchor_and_scaling():
    r = richter_local_magnitude(1.0, 100.0)
    assert abs(r["ML"] - 3.0) < 1e-9                    # anchor point
    assert abs(r["minus_log10_A0"] - 3.0) < 1e-9
    # a factor-of-10 larger amplitude adds exactly 1.0 to ML
    r10 = richter_local_magnitude(10.0, 100.0)
    assert abs((r10["ML"] - r["ML"]) - 1.0) < 1e-9
    # attenuation: same amplitude at larger distance gives larger ML
    far = richter_local_magnitude(1.0, 300.0)
    assert far["ML"] > r["ML"]


# 2. Moment magnitude Mw — KNOWN: M0=1.0e22 N*m -> Mw=8.6 exactly;
#    M0=6.3e16 N*m -> Mw ~ 5.13.
#    Ref: Hanks & Kanamori (1979) JGR 84:B5; Mw=(2/3)(log10 M0_SI - 9.1).
def test_moment_magnitude_hanks_kanamori():
    r = moment_magnitude(1.0e22)
    assert abs(r["Mw"] - 8.6) < 1e-9
    assert abs(r["seismic_moment_dyne_cm"] - 1.0e29) < 1e22   # 1 N*m = 1e7 dyn*cm
    r2 = moment_magnitude(6.3e16)
    assert abs(r2["Mw"] - 5.13) < 0.02
    # +1 unit of Mw corresponds to ~31.6x in moment (10^1.5)
    a = moment_magnitude(1.0e18)["Mw"]
    b = moment_magnitude(1.0e18 * 10.0 ** 1.5)["Mw"]
    assert abs((b - a) - 1.0) < 1e-9


# 3. Gutenberg-Richter b-value (Aki-Utsu MLE) — KNOWN: a catalogue drawn from an
#    exponential magnitude distribution with true b=1.0 returns b ~ 1.0.
#    Ref: Aki (1965); Utsu (1965); b = log10(e)/(mean(M) - Mc) (unbinned).
def test_b_value_recovers_unity():
    rng = np.random.default_rng(7)
    mc = 2.0
    beta = 1.0 * math.log(10.0)          # true b = 1.0
    u = rng.random(300_000)
    mags = (mc - np.log(1.0 - u) / beta).tolist()   # exponential above Mc
    r = gutenberg_richter_b_value(mags, mc=mc, delta_m=0.0)
    assert abs(r["b_value"] - 1.0) < 0.02
    assert r["n_events"] == 300_000
    # mean magnitude of an exponential above Mc is Mc + 1/beta = Mc + log10(e)/b
    assert abs(r["mean_magnitude"] - (mc + math.log10(math.e))) < 0.02


# 4. P-S travel time -> distance — KNOWN: d = (ts-tp)*Vp*Vs/(Vp-Vs); with
#    Vp=6, Vs=3.5 the factor is 8.4 km per second of S-P delay; the Vp/Vs of a
#    Poisson solid is sqrt(3).
#    Ref: Stein & Wysession (2003), S-P interval location.
def test_ps_distance_factor_and_value():
    r = ps_travel_time_distance(10.0, 6.0, 3.5)
    assert abs(r["km_per_second_factor"] - 8.4) < 1e-9
    assert abs(r["epicentral_distance_km"] - 84.0) < 1e-9
    # round trip: distance / Vs - distance / Vp == the S-P time
    d = r["epicentral_distance_km"]
    assert abs((d / 3.5 - d / 6.0) - 10.0) < 1e-9
    # Poisson-solid velocities -> Vp/Vs = sqrt(3)
    rp = ps_travel_time_distance(5.0, math.sqrt(3.0), 1.0)
    assert abs(rp["vp_vs_ratio"] - math.sqrt(3.0)) < 1e-12


# 5. Body-wave velocities — KNOWN: a Poisson-solid granite (K=50 GPa, mu=30 GPa,
#    rho=2700) gives Vp=5.77 km/s, Vs=3.33 km/s and Vp/Vs=sqrt(3)=1.732.
#    Ref: Aki & Richards "Quantitative Seismology"; Poisson solid K=5/3 mu.
def test_body_wave_velocities_poisson_granite():
    r = body_wave_velocities(50e9, 30e9, 2700.0)
    assert abs(r["vp_km_s"] - 5.774) < 0.01
    assert abs(r["vs_km_s"] - 3.333) < 0.01
    # K = 5/3 mu makes this a Poisson solid -> Vp/Vs = sqrt(3)
    assert abs(r["vp_vs_ratio"] - math.sqrt(3.0)) < 1e-9
    # analytic check of the closed forms
    assert abs(r["vp_m_s"] - math.sqrt((50e9 + 4.0 / 3.0 * 30e9) / 2700.0)) < 1e-6
    assert abs(r["vs_m_s"] - math.sqrt(30e9 / 2700.0)) < 1e-6


# 6. Modified Omori law — KNOWN: for p=1 the decay is hyperbolic n(t)=K/(t+c);
#    the cumulative count integrates to K*ln((T+c)/c).
#    Ref: Omori (1894); Utsu (1961) modified Omori law.
def test_omori_hyperbolic_decay_and_cumulative():
    K, c = 100.0, 0.1
    r0 = omori_aftershock_rate(0.0, K, c, p=1.0)
    assert abs(r0["rate_per_day"] - K / c) < 1e-9          # initial rate K/c
    # doubling (t+c) halves the rate for p=1
    r1 = omori_aftershock_rate(c, K, c, p=1.0)             # t+c = 2c
    assert abs(r1["rate_per_day"] - 0.5 * r0["rate_per_day"]) < 1e-9
    # cumulative count matches the analytic integral K*ln((T+c)/c)
    T = 10.0
    rc = omori_aftershock_rate(T, K, c, p=1.0)
    assert abs(rc["cumulative_count"] - K * math.log((T + c) / c)) < 1e-6
    # p != 1 branch matches its power-law integral
    p = 1.3
    rp = omori_aftershock_rate(T, K, c, p=p)
    expect = K / (1.0 - p) * ((T + c) ** (1.0 - p) - c ** (1.0 - p))
    assert abs(rp["cumulative_count"] - expect) < 1e-6


# 7. Energy from magnitude — KNOWN: log10(E)=1.5*Ms+4.8; Ms=0 -> E=10^4.8 J;
#    a one-magnitude step changes energy by 10^1.5=31.6228.
#    Ref: Gutenberg & Richter (1956); USGS log10(E_joules)=1.5*M+4.8.
def test_energy_from_magnitude_gutenberg_richter():
    r0 = energy_from_magnitude(0.0)
    assert abs(r0["log10_energy_joules"] - 4.8) < 1e-12
    assert abs(r0["energy_joules"] - 10.0 ** 4.8) < 1e-3
    r8 = energy_from_magnitude(8.0)
    assert abs(r8["log10_energy_joules"] - 16.8) < 1e-12
    # consecutive magnitudes differ by 10^1.5 in energy
    ratio = energy_from_magnitude(6.0)["energy_joules"] / energy_from_magnitude(5.0)["energy_joules"]
    assert abs(ratio - 10.0 ** 1.5) < 1e-6                 # ~31.6228


# 8. Epicenter trilateration (S-P method) — KNOWN: exact S-P times from a known
#    epicenter and station geometry recover the true (x,y) to numerical precision.
#    Ref: classic 3-circle S-P epicentre location; linearised least squares.
def test_epicenter_trilateration_recovers_known_location():
    vp, vs = 6.0, 3.5
    factor = vp * vs / (vp - vs)
    stations = [[0.0, 0.0], [50.0, 0.0], [0.0, 50.0], [40.0, 30.0]]
    true = [20.0, 15.0]
    sp_times = [math.dist(s, true) / factor for s in stations]
    r = epicenter_trilateration(stations, sp_times, vp, vs)
    assert abs(r["epicenter"][0] - 20.0) < 1e-6
    assert abs(r["epicenter"][1] - 15.0) < 1e-6
    assert r["max_range_residual_km"] < 1e-6
    # exactly-determined 3-station case also solves
    r3 = epicenter_trilateration(stations[:3], sp_times[:3], vp, vs)
    assert abs(r3["epicenter"][0] - 20.0) < 1e-6
    assert abs(r3["epicenter"][1] - 15.0) < 1e-6
