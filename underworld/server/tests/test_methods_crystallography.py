"""Each crystallography method must reproduce its KNOWN published or
analytically exact value.

Citations are inline. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_crystallography import (
    AVOGADRO,
    atomic_packing_factor,
    bragg_angle,
    cubic_d_spacing,
    cubic_interplanar_angle,
    linear_planar_density,
    max_schmid_factor,
    schmid_resolved_shear,
    structure_factor_allowed,
    theoretical_density,
)


# 1. Cubic d-spacing — KNOWN: a=0.4 nm -> d(111)=a/sqrt(3)=0.23094 nm; d(200)=a/2.
#    Ref: Cullity & Stock, Eq. 3-10.
def test_cubic_d_spacing_known():
    a = 0.4
    d111 = cubic_d_spacing(1, 1, 1, a)
    assert abs(d111["d_spacing"] - a / math.sqrt(3.0)) < 1e-12
    assert abs(d111["d_spacing"] - 0.2309401) < 1e-6
    d200 = cubic_d_spacing(2, 0, 0, a)
    assert abs(d200["d_spacing"] - a / 2.0) < 1e-12
    # higher index planes are more closely spaced
    assert d200["d_spacing"] < cubic_d_spacing(1, 0, 0, a)["d_spacing"]
    # (000) is invalid
    try:
        cubic_d_spacing(0, 0, 0, a)
        assert False, "expected ValueError"
    except ValueError:
        pass


# 2. Atomic packing factor — KNOWN: FCC=0.74, BCC=0.68, SC=0.52 (analytic).
#    Ref: Callister 9th ed., Sec. 3.4.
def test_apf_known_values():
    assert abs(atomic_packing_factor("FCC")["apf"] - 0.7405) < 1e-3
    assert abs(atomic_packing_factor("BCC")["apf"] - 0.6802) < 1e-3
    assert abs(atomic_packing_factor("SC")["apf"] - 0.5236) < 1e-3
    # FCC is the densest of the three cubic packings
    assert (atomic_packing_factor("FCC")["apf"]
            > atomic_packing_factor("BCC")["apf"]
            > atomic_packing_factor("SC")["apf"])
    # exact closed forms
    assert abs(atomic_packing_factor("FCC")["apf"] - math.pi * math.sqrt(2.0) / 6.0) < 1e-12


# 3. Theoretical density — KNOWN: FCC copper a=3.615e-8 cm, A=63.55 g/mol
#    -> rho ~= 8.89 g/cm^3 (measured 8.96).
#    Ref: Callister 9th ed., Eq. 3.8.
def test_theoretical_density_copper():
    r = theoretical_density("FCC", 63.55, 3.615e-8)
    assert abs(r["density"] - 8.89) < 0.05
    assert r["atoms_per_cell"] == 4
    # iron BCC: a=2.866e-8 cm, A=55.85 -> ~7.87 g/cm^3
    fe = theoretical_density("BCC", 55.85, 2.866e-8)
    assert abs(fe["density"] - 7.87) < 0.1
    # uses the SI-exact Avogadro constant
    assert AVOGADRO == 6.02214076e23


# 4. Bragg's law — KNOWN: Cu-Kalpha (1.5406 A) off d=2.0 A -> sin theta=0.38515,
#    theta=22.66 deg, 2-theta=45.32 deg.
#    Ref: Bragg & Bragg (1913); Cullity & Stock, Eq. 3-1.
def test_bragg_angle_known():
    r = bragg_angle(2.0, 1.5406, n=1)
    assert r["reachable"]
    assert abs(r["sin_theta"] - 0.38515) < 1e-4
    assert abs(r["theta_deg"] - 22.66) < 0.05
    assert abs(r["two_theta_deg"] - 45.32) < 0.1
    # round-trip: 2 d sin(theta) = n lambda
    assert abs(2.0 * 2.0 * r["sin_theta"] - 1.5406) < 1e-9
    # unreachable order: n*lambda/(2d) > 1
    assert bragg_angle(0.5, 1.5406, n=2)["reachable"] is False


# 5. Structure-factor systematic absences — KNOWN: FCC allows (111),(200) but
#    forbids (100),(110),(210); BCC allows (110),(200) but forbids (100),(111).
#    Ref: Cullity & Stock Sec. 4-7; Kittel Ch. 2.
def test_structure_factor_rules():
    # FCC: all-even or all-odd
    assert structure_factor_allowed(1, 1, 1, "FCC")["allowed"]
    assert structure_factor_allowed(2, 0, 0, "FCC")["allowed"]
    assert not structure_factor_allowed(1, 0, 0, "FCC")["allowed"]
    assert not structure_factor_allowed(1, 1, 0, "FCC")["allowed"]
    assert not structure_factor_allowed(2, 1, 0, "FCC")["allowed"]
    # BCC: h+k+l even
    assert structure_factor_allowed(1, 1, 0, "BCC")["allowed"]
    assert structure_factor_allowed(2, 0, 0, "BCC")["allowed"]
    assert not structure_factor_allowed(1, 0, 0, "BCC")["allowed"]
    assert not structure_factor_allowed(1, 1, 1, "BCC")["allowed"]
    # SC: everything allowed
    assert structure_factor_allowed(1, 0, 0, "SC")["allowed"]


# 6. Interplanar angle — KNOWN: (100)^(010)=90; (100)^(111)=54.7356;
#    (111)^(-1 1 1)=70.5288 deg.
#    Ref: Cullity & Stock, Appendix 3.
def test_interplanar_angle_known():
    assert abs(cubic_interplanar_angle(1, 0, 0, 0, 1, 0)["angle_deg"] - 90.0) < 1e-9
    assert abs(cubic_interplanar_angle(1, 0, 0, 1, 1, 1)["angle_deg"] - 54.7356) < 1e-3
    assert abs(cubic_interplanar_angle(1, 1, 1, -1, 1, 1)["angle_deg"] - 70.5288) < 1e-3
    # a plane with itself -> 0 deg
    assert abs(cubic_interplanar_angle(1, 2, 3, 1, 2, 3)["angle_deg"]) < 1e-9


# 7. Linear & planar density — KNOWN: along the close-packed direction atoms
#    touch so LD = 1/(2r); FCC PD(111) = 4/(sqrt(3) a^2).
#    Ref: Callister 9th ed., Sec. 3.11.
def test_linear_planar_density_known():
    a = 0.3615e-7  # cm, ~copper
    fcc = linear_planar_density("FCC", a)
    assert abs(fcc["linear_density"] - fcc["linear_density_check_1_over_2r"]) < 1e-3 * fcc["linear_density"]
    assert abs(fcc["planar_density"] - 4.0 / (math.sqrt(3.0) * a * a)) < 1e-6 * fcc["planar_density"]
    assert fcc["close_packed_plane"] == "(111)"
    # BCC close-packed direction is [111], LD = 1/(2r)
    bcc = linear_planar_density("BCC", a)
    assert abs(bcc["linear_density"] - bcc["linear_density_check_1_over_2r"]) < 1e-3 * bcc["linear_density"]
    assert bcc["close_packed_direction"] == "[111]"
    # FCC (111) is more densely packed than BCC (110)
    assert linear_planar_density("FCC", a)["planar_density"] > linear_planar_density("BCC", a)["planar_density"]


# 8. Schmid's law — KNOWN: Schmid factor maxes at phi=lambda=45 deg giving
#    m=0.5; tau_R = sigma/2 there.
#    Ref: Schmid & Boas (1935); Callister 9th ed., Eq. 7.2.
def test_schmid_resolved_shear_known():
    r = schmid_resolved_shear(100.0, 45.0, 45.0)
    assert abs(r["schmid_factor"] - 0.5) < 1e-12
    assert abs(r["resolved_shear_stress"] - 50.0) < 1e-9
    # the 45/45 orientation is the maximum Schmid factor (=0.5)
    assert abs(max_schmid_factor() - 0.5) < 1e-12
    # no resolved shear when load is normal to the slip plane (phi=0, lambda=90)
    assert abs(schmid_resolved_shear(100.0, 0.0, 90.0)["resolved_shear_stress"]) < 1e-12
    # a non-ideal orientation gives less than the maximum
    assert schmid_resolved_shear(100.0, 30.0, 60.0)["schmid_factor"] < 0.5
