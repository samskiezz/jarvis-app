"""Forestry & dendrology methods verified against KNOWN published values."""
import math

from underworld.server.services.methods_forestry import (
    tree_volume,
    biomass_allometry,
    tree_growth,
    carbon_sequest,
    self_thinning,
    site_index,
    basal_area,
    canopy_light,
    route,
)


# 1 — Smalian's log rule ------------------------------------------------------
def test_tree_volume_smalian_known():
    # Cylinder: both ends 50 cm (A=0.19635 m²), 10 m -> V = A*L = 1.9635 m³.
    r = tree_volume(d1_cm=50.0, d2_cm=50.0, length_m=10.0)
    assert abs(r["volume_m3"] - 1.9635) < 1e-3
    # equal-diameter log => no taper => Smalian matches the true frustum.
    assert abs(r["smalian_overestimate_pct"]) < 1e-6


def test_tree_volume_full_taper_overestimate():
    # Apex (d2=0) to 100 cm base, L=3 m. True cone = A*L/3; Smalian = A*L/2
    # -> known +50% overestimate.
    r = tree_volume(d1_cm=100.0, d2_cm=0.0, length_m=3.0)
    assert abs(r["smalian_overestimate_pct"] - 50.0) < 1e-3


# 2 — Jenkins (2003) allometry, exponent ~2.4 --------------------------------
def test_biomass_allometry_exponent():
    r = biomass_allometry(dbh_cm=30.0)
    assert abs(r["exponent_b"] - 2.4) < 0.05          # 2.4349 ≈ 2.4
    # KNOWN: exp(-2.5356 + 2.4349*ln 30) = 312.93 kg (Jenkins pine group).
    expected = math.exp(-2.5356 + 2.4349 * math.log(30.0))
    assert abs(r["agb_kg"] - expected) < 1.0
    assert abs(r["agb_kg"] - 312.93) < 0.5


# 3 — von Bertalanffy / Chapman-Richards asymptote ---------------------------
def test_tree_growth_asymptote():
    # As t -> infinity, height -> A. At t=1000 with k=0.05, essentially A=40.
    r = tree_growth(t_years=1000.0, asymptote=40.0, k=0.05)
    assert abs(r["size"] - 40.0) < 1e-3
    assert r["fraction_of_asymptote"] > 0.999


def test_tree_growth_known_point():
    # von Bertalanffy A=40,k=0.05,t=20: 40*(1-e^-1)=25.285 m (known).
    r = tree_growth(t_years=20.0, asymptote=40.0, k=0.05)
    assert abs(r["size"] - 40.0 * (1 - math.exp(-1.0))) < 1e-3
    assert abs(r["size"] - 25.285) < 0.01


# 4 — carbon sequestration ----------------------------------------------------
def test_carbon_sequest_known():
    # 1000 kg biomass: C=470 kg, CO2 = 470*44/12 = 1723.33 kg (known).
    r = carbon_sequest(biomass_kg=1000.0)
    assert abs(r["carbon_kg"] - 470.0) < 1e-6
    assert abs(r["co2_kg"] - 470.0 * 44.0 / 12.0) < 1e-3
    assert abs(r["co2_kg"] - 1723.333) < 0.01
    assert abs(r["co2_per_carbon"] - 3.6667) < 1e-3


# 5 — Reineke SDI & self-thinning slopes -------------------------------------
def test_self_thinning_sdi_known():
    # At qmd = reference (25 cm), SDI == trees per ha.
    r = self_thinning(trees_per_ha=600.0, qmd_cm=25.0)
    assert abs(r["sdi"] - 600.0) < 1e-6
    assert abs(r["reineke_slope"] - (-1.605)) < 1e-9
    assert abs(r["yoda_slope"] - (-1.5)) < 1e-9


def test_self_thinning_scaling():
    # Doubling QMD to 50 cm scales SDI by 2^1.605 = 3.044 (Reineke rule).
    r = self_thinning(trees_per_ha=600.0, qmd_cm=50.0)
    assert abs(r["sdi"] - 600.0 * 2.0 ** 1.605) < 0.05


# 6 — site index --------------------------------------------------------------
def test_site_index_known():
    # Height 20 m at age 30, base age 50, k=0.05, p=1.
    # A = 20/(1-e^-1.5); SI = A*(1-e^-2.5) (known).
    r = site_index(height_m=20.0, age_years=30.0, base_age_years=50.0, k=0.05)
    a = 20.0 / (1 - math.exp(-1.5))
    expected = a * (1 - math.exp(-2.5))
    assert abs(r["site_index_m"] - expected) < 1e-2
    assert r["site_index_m"] > 20.0          # older base age => taller


# 7 — basal area = πD²/4 ------------------------------------------------------
def test_basal_area_known():
    # DBH 50 cm: BA = π*50²/4 = 1963.495 cm² = 0.19635 m² (known).
    r = basal_area(dbh_cm=50.0)
    assert abs(r["basal_area_cm2"] - math.pi * 2500.0 / 4.0) < 1e-3
    assert abs(r["basal_area_cm2"] - 1963.495) < 1e-2
    assert abs(r["basal_area_m2"] - 0.19635) < 1e-4


def test_basal_area_stand():
    r = basal_area(dbh_cm=50.0, trees_per_ha=400.0)
    assert abs(r["stand_basal_area_m2_ha"] - 0.19635 * 400.0) < 1e-2


# 8 — Beer's law canopy light ------------------------------------------------
def test_canopy_light_known():
    # k=0.5, LAI=4 -> transmittance e^-2 = 0.13534 (known).
    r = canopy_light(lai=4.0, k=0.5)
    assert abs(r["transmittance"] - math.exp(-2.0)) < 1e-6
    assert abs(r["transmittance"] - 0.135335) < 1e-5
    assert abs(r["fraction_intercepted"] - (1 - math.exp(-2.0))) < 1e-6


def test_canopy_light_zero_lai():
    # No leaves => full transmission.
    assert abs(canopy_light(lai=0.0)["transmittance"] - 1.0) < 1e-9


# routing ---------------------------------------------------------------------
def test_route_table():
    assert route("tree_volume") is tree_volume
    assert route("biomass_allometry") is biomass_allometry
    assert route("tree_growth") is tree_growth
    assert route("carbon_sequest") is carbon_sequest
    assert route("self_thinning") is self_thinning
    assert route("site_index") is site_index
    assert route("basal_area") is basal_area
    assert route("canopy_light") is canopy_light
    assert route("forestry") is biomass_allometry
    assert route("dendrology") is tree_growth
    assert route("silviculture") is self_thinning
