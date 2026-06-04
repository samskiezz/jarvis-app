"""Each epidemiology method must reproduce its KNOWN published or analytically
exact value.

Citations are inline. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_epidemiology import (
    doubling_time,
    epidemiologic_measures,
    final_epidemic_size,
    herd_immunity_threshold,
    logistic_growth,
    reproduction_numbers,
    seir_model,
    sir_model,
)


# 1. SIR model — KNOWN: R0 = beta/gamma = 2.5 produces an outbreak whose final
#    size matches the implicit final-size equation Z ~= 0.8926; R0 < 1 dies out.
#    Ref: Kermack & McKendrick (1927); Keeling & Rohani (2008), ch. 2.
def test_sir_outbreak_and_dieout():
    out = sir_model(beta=0.5, gamma=0.2, N=1000.0, I0=1.0)
    assert out["success"]
    assert out["R0"] == 2.5
    assert out["outbreak"]
    # final size matches the transcendental final-size equation (Z ~= 0.8926)
    assert abs(out["final_size_fraction"] - 0.8926447536) < 5e-3
    # epidemic peak rises well above the initial prevalence
    assert out["peak_infectious_fraction"] > 0.2
    assert out["peak_time"] > 0.0

    # R0 = 0.5 < 1: infection dies out, almost nobody else infected
    die = sir_model(beta=0.1, gamma=0.2, N=1000.0, I0=1.0)
    assert die["R0"] == 0.5
    assert not die["outbreak"]
    assert die["final_size_fraction"] < 0.01


# 2. Reproduction numbers — KNOWN: beta=0.5, gamma=0.2 -> R0 = 2.5; at the
#    threshold susceptible fraction s = 1/R0 = 0.4, Rt = 1 exactly.
#    Ref: Diekmann, Heesterbeek & Britton (2013); Anderson & May (1991).
def test_reproduction_numbers_threshold():
    r = reproduction_numbers(beta=0.5, gamma=0.2)
    assert abs(r["R0"] - 2.5) < 1e-12
    assert abs(r["Rt"] - 2.5) < 1e-12              # s = 1 by default
    assert abs(r["mean_infectious_period"] - 5.0) < 1e-12
    # at s = 1/R0 the effective reproduction number is exactly 1
    rt = reproduction_numbers(beta=0.5, gamma=0.2,
                              susceptible_fraction=1.0 / 2.5)
    assert abs(rt["Rt"] - 1.0) < 1e-12
    assert not rt["growing"]
    # below threshold s -> Rt < 1
    rsub = reproduction_numbers(beta=0.5, gamma=0.2, susceptible_fraction=0.3)
    assert rsub["Rt"] < 1.0


# 3. Herd immunity threshold — KNOWN: R0 = 2.5 -> H_c = 1 - 1/2.5 = 0.60;
#    R0 = 4 -> 0.75; R0 = 2 -> 0.50.
#    Ref: Anderson & May (1991), ch. 5; Fine et al. (2011).
def test_herd_immunity_threshold_known():
    assert abs(herd_immunity_threshold(2.5)["herd_immunity_threshold"] - 0.60) < 1e-12
    assert abs(herd_immunity_threshold(4.0)["herd_immunity_threshold"] - 0.75) < 1e-12
    assert abs(herd_immunity_threshold(2.0)["herd_immunity_threshold"] - 0.50) < 1e-12
    # R0 <= 1 needs no immunity
    assert herd_immunity_threshold(0.8)["herd_immunity_threshold"] == 0.0


# 4. Final epidemic size — KNOWN: the transcendental relation
#    Z = 1 - exp(-R0 Z) gives Z ~= 0.7968 (R0=2), 0.8926 (R0=2.5), 0.9405 (R0=3);
#    R0 <= 1 -> Z = 0. The returned root must satisfy the equation to tolerance.
#    Ref: Kermack & McKendrick (1927); Ma & Earn (2006); Miller (2012).
def test_final_size_transcendental():
    z2 = final_epidemic_size(2.0)
    assert abs(z2["final_size"] - 0.796812) < 1e-5
    assert abs(z2["residual"]) < 1e-9             # satisfies the implicit eqn
    assert abs(final_epidemic_size(2.5)["final_size"] - 0.892645) < 1e-5
    assert abs(final_epidemic_size(3.0)["final_size"] - 0.940480) < 1e-5
    # below threshold there is no epidemic
    assert final_epidemic_size(0.9)["final_size"] == 0.0
    # consistency: SIR integration final size matches the implicit solution
    sir = sir_model(beta=0.5, gamma=0.2, N=1e6, I0=1.0)
    assert abs(sir["final_size_fraction"] - final_epidemic_size(2.5)["final_size"]) < 2e-3


# 5. SEIR model — KNOWN: R0 = beta/gamma is unchanged by adding a latent stage,
#    but a finite latent period delays (and for fixed seeding alters) the
#    infectious peak relative to the SIR model; an R0 > 1 still gives an outbreak.
#    Ref: Anderson & May (1991), ch. 6; Keeling & Rohani (2008), sec. 2.5.
def test_seir_outbreak_and_delay():
    seir = seir_model(beta=0.5, sigma=0.1, gamma=0.2, N=1000.0,
                      E0=1.0, I0=0.0)
    assert seir["success"]
    assert seir["R0"] == 2.5
    assert seir["outbreak"]
    assert abs(seir["latent_period"] - 10.0) < 1e-12
    # latent period delays the infectious peak vs the matched SIR model
    sir = sir_model(beta=0.5, gamma=0.2, N=1000.0, I0=1.0)
    assert seir["peak_time"] > sir["peak_time"]
    # substantial outbreak: large final size
    assert seir["final_size_fraction"] > 0.5


# 6. Logistic growth — KNOWN: C(0) = C0; C -> K as t -> inf; the inflection
#    (maximum-growth) point is at C = K/2, reached at t = ln(A)/r with
#    A = (K-C0)/C0, where the growth rate equals r*K/4.
#    Ref: Verhulst (1838); Chowell et al. (2016).
def test_logistic_growth_inflection_and_limits():
    r, K, C0 = 0.3, 1000.0, 1.0
    g = logistic_growth(r, K, C0, [0.0])
    assert abs(g["C"][0] - C0) < 1e-9             # initial condition
    A = (K - C0) / C0
    assert abs(g["t_inflection"] - math.log(A) / r) < 1e-9
    assert abs(g["C_inflection"] - K / 2.0) < 1e-9
    assert abs(g["max_growth_rate"] - r * K / 4.0) < 1e-9
    # approaches carrying capacity
    far = logistic_growth(r, K, C0, [200.0])
    assert abs(far["C"][0] - K) < 1e-3
    # at the inflection time, C = K/2 and growth rate = r*K/4 (maximum)
    at_infl = logistic_growth(r, K, C0, [g["t_inflection"]])
    assert abs(at_infl["C"][0] - K / 2.0) < 1e-6
    assert abs(at_infl["growth_rate"][0] - r * K / 4.0) < 1e-6


# 7. Epidemiologic measures — KNOWN: deaths=10, cases=100 -> CFR = 0.10 with a
#    Wald 95% CI half-width z*sqrt(0.1*0.9/100) = 0.05880, i.e. [0.0412, 0.1588].
#    Ref: Rothman, Greenland & Lash (2008); Wald binomial interval.
def test_measures_cfr_wald_ci():
    m = epidemiologic_measures(deaths=10, cases=100)
    assert abs(m["case_fatality_rate"] - 0.10) < 1e-12
    half = 1.959963984540054 * math.sqrt(0.1 * 0.9 / 100)
    assert abs(m["cfr_ci_lower"] - (0.10 - half)) < 1e-9
    assert abs(m["cfr_ci_upper"] - (0.10 + half)) < 1e-9
    assert abs(half - 0.0588) < 1e-3
    # incidence & prevalence proportions
    m2 = epidemiologic_measures(deaths=0, cases=1, new_cases=50,
                                population_at_risk=1000, prevalent_cases=200)
    assert abs(m2["incidence_proportion"] - 0.05) < 1e-12
    assert abs(m2["prevalence"] - 0.20) < 1e-12


# 8. Doubling time — KNOWN: counts doubling every 3 days (1,2,4,8,16 at
#    t=0,3,6,9,12) give r = ln2/3 and doubling time T_d = ln2/r = 3.0 exactly.
#    Ref: Wallinga & Lipsitch (2007); Chowell et al. (2016).
def test_doubling_time_exact():
    d = doubling_time([0, 3, 6, 9, 12], [1, 2, 4, 8, 16])
    assert abs(d["doubling_time"] - 3.0) < 1e-9
    assert abs(d["growth_rate"] - math.log(2.0) / 3.0) < 1e-9
    assert d["r_squared"] > 0.999999          # perfect exponential
    assert d["is_growing"]
    # general identity T_d = ln2 / r for an arbitrary rate
    r = 0.1
    counts = [math.exp(r * t) for t in range(10)]
    d2 = doubling_time(list(range(10)), counts)
    assert abs(d2["growth_rate"] - r) < 1e-9
    assert abs(d2["doubling_time"] - math.log(2.0) / r) < 1e-9
