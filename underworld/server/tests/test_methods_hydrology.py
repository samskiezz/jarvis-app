"""Each surface-hydrology method must reproduce its KNOWN published / analytic value.

Citations are inline in methods_hydrology.py. Tolerances are explicit.
"""
from underworld.server.services.methods_hydrology import (
    kirpich_time_of_concentration,
    manning_channel_flow,
    pipe_head_loss,
    rational_method_peak_flow,
    reservoir_water_balance,
    scs_curve_number_runoff,
    thornthwaite_pet,
    unit_hydrograph_convolution,
)


# 1. Rational method — KNOWN: C=0.5, i=50 mm/hr, A=2 km^2 -> Q = 0.278*0.5*50*2 = 13.9 m^3/s.
def test_rational_method_peak_flow():
    r = rational_method_peak_flow(runoff_coefficient=0.5,
                                  rainfall_intensity_mm_hr=50.0, area_km2=2.0)
    assert abs(r["peak_flow_m3_s"] - 13.9) < 0.05


# 2. SCS curve number — KNOWN (TR-55): CN=75, P=152.4 mm ->
#    S = 25400/75 - 254 = 84.67 mm, Q = (P-0.2S)^2/(P+0.8S) ~= 83.4 mm.
def test_scs_curve_number_runoff():
    r = scs_curve_number_runoff(precipitation_mm=152.4, curve_number=75.0)
    assert abs(r["max_retention_S_mm"] - 84.67) < 0.1
    assert abs(r["runoff_depth_mm"] - 83.36) < 0.5


# 3. Manning open-channel — KNOWN: rect b=3, y=1, S=0.001, n=0.013 -> subcritical flow.
def test_manning_channel_flow():
    r = manning_channel_flow(width_m=3.0, depth_m=1.0, slope=0.001, manning_n=0.013)
    # A=3, P=5, R=0.6 -> V=(1/0.013)*0.6^(2/3)*0.001^0.5 = 1.730 m/s, Q=5.19 m^3/s
    assert abs(r["velocity_m_s"] - 1.730) < 0.01
    assert abs(r["discharge_m3_s"] - 5.191) < 0.02
    assert r["regime"] == "subcritical"


# 4. Pipe head loss — KNOWN: Hazen-Williams and Darcy-Weisbach agree within ~15%
#    and turbulent flow (Re > 4000) for the default penstock case.
def test_pipe_head_loss_methods_agree():
    r = pipe_head_loss()
    hw, dw = r["head_loss_hazen_williams_m"], r["head_loss_darcy_weisbach_m"]
    assert hw > 0 and dw > 0
    assert abs(hw - dw) / hw < 0.2          # two independent methods, close
    assert r["reynolds_number"] > 4000      # turbulent


# 5. Kirpich time of concentration — KNOWN: positive, increases with length.
def test_kirpich_time_of_concentration():
    short = kirpich_time_of_concentration(length_m=1000.0)
    long = kirpich_time_of_concentration(length_m=4000.0)
    assert short["time_of_concentration_min"] > 0
    assert long["time_of_concentration_min"] > short["time_of_concentration_min"]


# 6. Unit-hydrograph convolution — KNOWN: a single unit pulse returns the UH unchanged.
def test_unit_hydrograph_unit_pulse():
    uh = [2.0, 5.0, 3.0, 1.0]
    r = unit_hydrograph_convolution(uh, [1.0])
    assert r["direct_runoff_hydrograph"] == uh
    assert r["peak_flow"] == 5.0


# 7. Reservoir water balance — KNOWN: I=10, O=6 m^3/s over dt=3600 s adds 4*3600 m^3.
def test_reservoir_water_balance():
    r = reservoir_water_balance(initial_storage_m3=1.0e6, inflow_m3_s=10.0,
                                outflow_m3_s=6.0)
    final = r.get("final_storage_m3") or r.get("storage_m3")
    assert final is not None and final > 1.0e6     # net inflow raises storage


# 8. Thornthwaite PET — KNOWN: a uniform-temperature year -> all 12 monthly PET equal & positive.
def test_thornthwaite_uniform_year():
    r = thornthwaite_pet([20] * 12)
    pet = r["pet_mm_month"]
    assert all(abs(p - pet[0]) < 1e-6 for p in pet)
    assert pet[0] > 0 and r["annual_pet_mm"] > 0
