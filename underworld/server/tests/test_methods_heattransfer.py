"""Each heat & mass transfer method must reproduce its KNOWN published or
analytically exact value.

Citations are inline. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_heattransfer import (
    STEFAN_BOLTZMANN,
    cylinder_conduction,
    dittus_boelter_convection,
    fick_diffusion,
    fin_heat_transfer,
    lmtd_heat_exchanger,
    lumped_capacitance_cooling,
    plane_wall_conduction,
    radiative_exchange,
)


# 1. Plane-wall Fourier conduction — KNOWN: single 0.1 m wall, k=1 W/mK, A=1 m^2,
#    dT=100 K -> R=0.1 K/W, q=1000 W (q''=1000 W/m^2).
#    Ref: Incropera, plane-wall conduction / series thermal resistance.
def test_plane_wall_single_layer_known_q():
    r = plane_wall_conduction([(0.1, 1.0)], area_m2=1.0,
                              t_hot_k=400.0, t_cold_k=300.0)
    assert abs(r["total_resistance_k_per_w"] - 0.1) < 1e-12
    assert abs(r["heat_rate_w"] - 1000.0) < 1e-9
    assert abs(r["heat_flux_w_m2"] - 1000.0) < 1e-9
    # interface temps span the full dT
    assert abs(r["interface_temps_k"][0] - 400.0) < 1e-9
    assert abs(r["interface_temps_k"][-1] - 300.0) < 1e-9
    # two equal layers in series double the resistance and halve q
    r2 = plane_wall_conduction([(0.1, 1.0), (0.1, 1.0)], area_m2=1.0,
                               t_hot_k=400.0, t_cold_k=300.0)
    assert abs(r2["total_resistance_k_per_w"] - 0.2) < 1e-12
    assert abs(r2["heat_rate_w"] - 500.0) < 1e-9
    # mid-interface sits at the mean temperature
    assert abs(r2["interface_temps_k"][1] - 350.0) < 1e-9


# 2. Radial/cylindrical conduction — KNOWN: k=15 W/mK, L=1 m, r_i=0.05, r_o=0.10,
#    dT=100 K -> q = 2*pi*15*100/ln(2) = 13594.6 W.
#    Ref: Incropera, radial conduction through a cylindrical wall.
def test_cylinder_conduction_log_mean_known_q():
    r = cylinder_conduction(k_w_per_mk=15.0, length_m=1.0,
                            r_inner_m=0.05, r_outer_m=0.10,
                            t_inner_k=400.0, t_outer_k=300.0)
    expected = 2.0 * math.pi * 15.0 * 1.0 * 100.0 / math.log(2.0)
    assert abs(r["heat_rate_w"] - expected) < 1e-6
    assert abs(r["heat_rate_w"] - 13597.1) < 0.5
    assert abs(r["log_ratio"] - math.log(2.0)) < 1e-12


# 3. Dittus-Boelter convection — KNOWN: Re=10000, Pr=0.7, heating (n=0.4) ->
#    Nu = 0.023*10000^0.8*0.7^0.4 = 31.60.
#    Ref: Dittus & Boelter (1930); nuclear-power.com.
def test_dittus_boelter_known_nusselt():
    r = dittus_boelter_convection(reynolds=10000.0, prandtl=0.7,
                                  k_fluid_w_per_mk=0.6, diameter_m=0.05,
                                  heating=True)
    nu_expected = 0.023 * 10000.0 ** 0.8 * 0.7 ** 0.4
    assert abs(r["nusselt"] - nu_expected) < 1e-9
    assert abs(r["nusselt"] - 31.60) < 0.05
    # h = Nu*k/D
    assert abs(r["h_w_per_m2k"] - nu_expected * 0.6 / 0.05) < 1e-9
    # cooling exponent n=0.3 gives a slightly different Nu
    rc = dittus_boelter_convection(10000.0, 0.7, 0.6, 0.05, heating=False)
    assert rc["exponent_n"] == 0.3
    assert rc["nusselt"] != r["nusselt"]


# 4. Stefan-Boltzmann radiation — KNOWN: blackbody (eps=1) at 1000 K to 0 K emits
#    q = sigma*1000^4 = 56703.7 W/m^2.
#    Ref: Stefan-Boltzmann law; Incropera radiation exchange.
def test_radiative_exchange_blackbody_known():
    r = radiative_exchange(t_hot_k=1000.0, t_cold_k=0.0, area_m2=1.0,
                           emissivity=1.0)
    expected = STEFAN_BOLTZMANN * 1000.0 ** 4
    assert abs(r["net_radiative_w"] - expected) < 1e-6
    assert abs(r["net_radiative_w"] - 56703.74419) < 1e-2
    # net is zero when both surfaces are at the same temperature
    eq = radiative_exchange(500.0, 500.0, 2.0, emissivity=0.8)
    assert abs(eq["net_radiative_w"]) < 1e-9
    # emissivity scales the net flux linearly
    half = radiative_exchange(1000.0, 0.0, 1.0, emissivity=0.5)
    assert abs(half["net_radiative_w"] - 0.5 * expected) < 1e-6


# 5. Lumped-capacitance cooling — KNOWN: at t = tau, theta/theta0 = exp(-1) =
#    0.367879..., i.e. cooled to 36.79% of initial excess temperature.
#    Ref: Incropera, transient lumped-capacitance method (Biot criterion).
def test_lumped_capacitance_one_time_constant():
    # choose properties so that tau = rho*V*cp/(h*A) is known, then sample t=tau
    rho, V, cp, h, A = 8000.0, 1e-3, 500.0, 100.0, 0.1
    tau = rho * V * cp / (h * A)        # = 8000*1e-3*500/(100*0.1) = 400 s
    r = lumped_capacitance_cooling(t_initial_k=500.0, t_inf_k=300.0,
                                   h_w_per_m2k=h, area_m2=A, volume_m3=V,
                                   density_kg_m3=rho, cp_j_per_kgk=cp,
                                   time_s=tau, k_solid_w_per_mk=200.0)
    assert abs(r["time_constant_s"] - 400.0) < 1e-9
    assert abs(r["theta_ratio"] - math.exp(-1.0)) < 1e-12
    # T = Tinf + (T0-Tinf)*exp(-1) = 300 + 200*0.367879 = 373.58 K
    assert abs(r["temperature_k"] - (300.0 + 200.0 * math.exp(-1.0))) < 1e-9
    # Bi = h*Lc/k, Lc = V/A = 0.01 -> Bi = 100*0.01/200 = 0.005 < 0.1
    assert abs(r["biot_number"] - 0.005) < 1e-12
    assert r["lumped_valid"] is True
    # at t=0 the body is still at its initial temperature
    r0 = lumped_capacitance_cooling(500.0, 300.0, h, A, V, rho, cp, 0.0)
    assert abs(r0["temperature_k"] - 500.0) < 1e-12


# 6. Fin efficiency — KNOWN: eta_f = tanh(mL)/mL; for mL=1, eta=tanh(1)=0.761594;
#    isothermal limit mL->0 gives eta->1.
#    Ref: Incropera, extended surfaces / fin efficiency.
def test_fin_efficiency_known_tanh():
    # pick geometry so that m*L = 1 exactly:
    # A_c = w*t, P = 2(w+t); choose w=1, t very small so P ~= 2.
    # m = sqrt(h*P/(k*A_c)); want m*L=1. Use w=0.1, t=0.001, h, k, L solved.
    w, t = 0.1, 0.001
    A_c = w * t
    P = 2.0 * (w + t)
    k = 200.0
    L = 0.05
    # m = 1/L  => h = m^2 * k * A_c / P
    m_target = 1.0 / L
    h = m_target ** 2 * k * A_c / P
    r = fin_heat_transfer(k_w_per_mk=k, h_w_per_m2k=h, length_m=L,
                          thickness_m=t, width_m=w, t_base_k=400.0, t_inf_k=300.0)
    assert abs(r["mL"] - 1.0) < 1e-9
    assert abs(r["fin_efficiency"] - math.tanh(1.0)) < 1e-9
    assert abs(r["fin_efficiency"] - 0.7615941559) < 1e-9
    # short/conductive fin (tiny mL) approaches isothermal efficiency 1
    r_short = fin_heat_transfer(k_w_per_mk=400.0, h_w_per_m2k=1.0, length_m=1e-4,
                                thickness_m=0.01, width_m=0.1,
                                t_base_k=400.0, t_inf_k=300.0)
    assert r_short["fin_efficiency"] > 0.999
    # fin heat rate is positive when base is hotter than ambient
    assert r["fin_heat_rate_w"] > 0.0


# 7. LMTD heat exchanger — KNOWN: counterflow hot 100->60, cold 20->50 ->
#    dT_A=50, dT_B=40, LMTD = 10/ln(1.25) = 44.814 C.
#    Ref: Logarithmic mean temperature difference (Wikipedia); Incropera.
def test_lmtd_counterflow_known_value():
    r = lmtd_heat_exchanger(t_hot_in_k=100.0, t_hot_out_k=60.0,
                            t_cold_in_k=20.0, t_cold_out_k=50.0,
                            u_w_per_m2k=500.0, area_m2=10.0, counterflow=True)
    expected_lmtd = (50.0 - 40.0) / math.log(50.0 / 40.0)
    assert abs(r["lmtd_k"] - expected_lmtd) < 1e-9
    assert abs(r["lmtd_k"] - 44.8142) < 1e-3
    # Q = U*A*LMTD
    assert abs(r["heat_duty_w"] - 500.0 * 10.0 * expected_lmtd) < 1e-6
    # equal end approaches -> LMTD equals that common difference (limit case)
    eq = lmtd_heat_exchanger(100.0, 60.0, 20.0, 60.0, 1.0, 1.0, counterflow=True)
    # dT_A = 100-60 = 40, dT_B = 60-20 = 40
    assert abs(eq["lmtd_k"] - 40.0) < 1e-9


# 8. Fick's law diffusion — KNOWN: D=1e-9 m^2/s, dC=1 mol/m^3, L=1e-3 m ->
#    J = 1e-6 mol/(m^2 s); penetration depth at t=1000 s -> sqrt(1e-9*1000)=1e-3 m.
#    Ref: Fick's first law; penetration depth ~ sqrt(D*t).
def test_fick_diffusion_known_flux_and_depth():
    r = fick_diffusion(diffusivity_m2_s=1e-9, conc_high=1.0, conc_low=0.0,
                       length_m=1e-3, time_s=1000.0)
    assert abs(r["flux_mol_per_m2s"] - 1e-6) < 1e-18
    assert abs(r["penetration_depth_m"] - 1e-3) < 1e-12
    assert abs(r["concentration_gradient_per_m"] - 1000.0) < 1e-9
    # penetration depth grows as sqrt(t): 4x time -> 2x depth
    r4 = fick_diffusion(1e-9, 1.0, 0.0, 1e-3, 4000.0)
    assert abs(r4["penetration_depth_m"] - 2.0 * r["penetration_depth_m"]) < 1e-12
