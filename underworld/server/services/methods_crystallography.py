"""Real crystallography & solid-state simulations.

Each function is a distinct, named crystallography method (not a shared engine
reused), implemented with numpy/math and verified against a KNOWN published or
analytically exact value in the companion tests. Domains: lattice geometry
(cubic d-spacing, interplanar angles), unit-cell packing & theoretical density,
X-ray diffraction (Bragg's law, structure-factor systematic absences), atomic
linear/planar density, and single-crystal plasticity (Schmid's law).

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_crystallography.py.
"""
from __future__ import annotations

import math
from itertools import product

import numpy as np

# ── Physical constants ────────────────────────────────────────────────────────
AVOGADRO = 6.02214076e23          # 1/mol (CODATA 2018, exact since 2019 SI)

# Atoms per conventional cubic unit cell by lattice type.
ATOMS_PER_CELL = {"SC": 1, "BCC": 2, "FCC": 4}
# Atomic packing factors (closed-form, analytically exact).
KNOWN_APF = {"SC": math.pi / 6.0,                       # ~0.5236
             "BCC": math.pi * math.sqrt(3.0) / 8.0,     # ~0.6802
             "FCC": math.pi * math.sqrt(2.0) / 6.0}     # ~0.7405


# ── 1. Cubic interplanar d-spacing from Miller indices ────────────────────────
def cubic_d_spacing(h: int, k: int, l: int, a: float) -> dict:
    """Interplanar spacing of the (hkl) planes in a cubic crystal:
        d_hkl = a / sqrt(h^2 + k^2 + l^2)
    Valid for any cubic Bravais lattice (SC/BCC/FCC) where a is the conventional
    cubic edge length.
    KNOWN: for a=0.4 nm, the (1 1 1) spacing is a/sqrt(3) ~= 0.2309 nm; the
    (2 0 0) spacing is a/2.

    Ref: Cullity & Stock, "Elements of X-Ray Diffraction" 3rd ed., Eq. 3-10.
    """
    s = h * h + k * k + l * l
    if s == 0:
        raise ValueError("(hkl) = (000) has no interplanar spacing")
    d = a / math.sqrt(s)
    return {
        "h": h, "k": k, "l": l,
        "a": a,
        "sum_of_squares": s,
        "d_spacing": d,
    }


# ── 2. Atomic packing factor for SC / BCC / FCC ───────────────────────────────
def atomic_packing_factor(structure: str) -> dict:
    """Atomic packing factor (APF) = (n * sphere volume) / (unit-cell volume) for
    the three cubic metals, using the hard-sphere touching relations:
        SC : a = 2r          -> APF = pi/6        ~= 0.5236
        BCC: a = 4r/sqrt(3)  -> APF = pi*sqrt(3)/8 ~= 0.6802
        FCC: a = 4r/sqrt(2)  -> APF = pi*sqrt(2)/6 ~= 0.7405
    KNOWN: FCC (and HCP) achieve the maximum APF of 0.74; BCC=0.68; SC=0.52.

    Ref: Callister, "Materials Science and Engineering" 9th ed., Sec. 3.4.
    """
    st = structure.upper()
    if st not in ATOMS_PER_CELL:
        raise ValueError(f"unknown structure {structure!r}; use SC/BCC/FCC")
    n = ATOMS_PER_CELL[st]
    # radius-in-terms-of-a relations
    r_over_a = {"SC": 0.5, "BCC": math.sqrt(3.0) / 4.0, "FCC": math.sqrt(2.0) / 4.0}[st]
    # take a = 1; sphere radius r = r_over_a; cell volume = 1
    sphere_vol = (4.0 / 3.0) * math.pi * r_over_a ** 3
    apf = n * sphere_vol
    return {
        "structure": st,
        "atoms_per_cell": n,
        "r_over_a": r_over_a,
        "apf": apf,
    }


# ── 3. Theoretical density from the unit cell ─────────────────────────────────
def theoretical_density(structure: str, atomic_weight: float, a: float) -> dict:
    """Theoretical (X-ray) density of a cubic crystal:
        rho = n * A / (V_c * N_A)
    where n is atoms/unit-cell, A is the atomic weight (g/mol), V_c = a^3 is the
    cell volume and N_A is Avogadro's number. Input a in cm gives rho in g/cm^3.
    KNOWN: FCC copper, A=63.55 g/mol, a=3.615e-8 cm -> rho ~= 8.89 g/cm^3
    (measured value 8.96 g/cm^3).

    Ref: Callister 9th ed., Eq. 3.8.
    """
    st = structure.upper()
    if st not in ATOMS_PER_CELL:
        raise ValueError(f"unknown structure {structure!r}; use SC/BCC/FCC")
    n = ATOMS_PER_CELL[st]
    vc = a ** 3
    rho = n * atomic_weight / (vc * AVOGADRO)
    return {
        "structure": st,
        "atoms_per_cell": n,
        "atomic_weight": atomic_weight,
        "a": a,
        "cell_volume": vc,
        "density": rho,
    }


# ── 4. Bragg's law diffraction angle ──────────────────────────────────────────
def bragg_angle(d: float, wavelength: float, n: int = 1) -> dict:
    """Bragg's law for constructive X-ray diffraction:
        n * lambda = 2 d sin(theta)
    Solves for the Bragg angle theta (and the measured 2-theta) given the
    interplanar spacing d, wavelength and reflection order n. Returns
    reachable=False when n*lambda/(2d) > 1 (no diffraction at that order).
    KNOWN: Cu-Kalpha (lambda=1.5406 A) off d=2.0 A gives theta=22.66 deg,
    2-theta=45.32 deg (sin theta = 1.5406/4 = 0.38515).

    Ref: Bragg & Bragg (1913); Cullity & Stock, Eq. 3-1.
    """
    s = n * wavelength / (2.0 * d)
    if abs(s) > 1.0:
        return {
            "d": d, "wavelength": wavelength, "order": n,
            "sin_theta": s, "reachable": False,
            "theta_deg": None, "two_theta_deg": None,
        }
    theta = math.asin(s)
    return {
        "d": d, "wavelength": wavelength, "order": n,
        "sin_theta": s, "reachable": True,
        "theta_rad": theta,
        "theta_deg": math.degrees(theta),
        "two_theta_deg": math.degrees(2.0 * theta),
    }


# ── 5. Structure-factor systematic absences (reflection rules) ────────────────
def structure_factor_allowed(h: int, k: int, l: int, structure: str) -> dict:
    """Selection rules from the geometric structure factor F(hkl) for the cubic
    Bravais lattices (single-atom basis at the lattice points):
        SC : all (hkl) allowed
        BCC: allowed iff (h + k + l) is even
        FCC: allowed iff h, k, l are all even or all odd (same parity)
    These are the "systematic absences" seen in powder diffraction.
    KNOWN: FCC permits (111) and (200) but forbids (100),(110),(210);
    BCC permits (110),(200) but forbids (100),(111).

    Ref: Cullity & Stock, "Elements of X-Ray Diffraction" 3rd ed., Sec. 4-7;
    Kittel, "Introduction to Solid State Physics" 8th ed., Ch. 2.
    """
    st = structure.upper()
    if st not in ("SC", "BCC", "FCC"):
        raise ValueError(f"unknown structure {structure!r}; use SC/BCC/FCC")
    all_even = (h % 2 == 0) and (k % 2 == 0) and (l % 2 == 0)
    all_odd = (h % 2 != 0) and (k % 2 != 0) and (l % 2 != 0)
    if st == "SC":
        allowed = True
        rule = "all reflections allowed"
    elif st == "BCC":
        allowed = (h + k + l) % 2 == 0
        rule = "h+k+l even"
    else:  # FCC
        allowed = all_even or all_odd
        rule = "h,k,l all even or all odd"
    return {
        "h": h, "k": k, "l": l,
        "structure": st,
        "rule": rule,
        "allowed": allowed,
        "sum": h + k + l,
        "all_even": all_even,
        "all_odd": all_odd,
    }


# ── 6. Interplanar angle between two cubic planes ─────────────────────────────
def cubic_interplanar_angle(h1: int, k1: int, l1: int,
                            h2: int, k2: int, l2: int) -> dict:
    """Angle phi between the (h1 k1 l1) and (h2 k2 l2) planes in a cubic crystal
    (plane normals are parallel to [hkl] in a cubic lattice):
        cos(phi) = (h1 h2 + k1 k2 + l1 l2) /
                   sqrt((h1^2+k1^2+l1^2)(h2^2+k2^2+l2^2))
    KNOWN: (100) vs (010) -> 90 deg; (100) vs (111) -> 54.7356 deg;
    (111) vs (-1 1 1) -> 70.5288 deg.

    Ref: Cullity & Stock, "Elements of X-Ray Diffraction" 3rd ed., Appendix 3.
    """
    v1 = np.array([h1, k1, l1], dtype=float)
    v2 = np.array([h2, k2, l2], dtype=float)
    n1 = np.linalg.norm(v1)
    n2 = np.linalg.norm(v2)
    if n1 == 0.0 or n2 == 0.0:
        raise ValueError("(000) is not a valid plane")
    cos_phi = float(np.dot(v1, v2) / (n1 * n2))
    cos_phi = max(-1.0, min(1.0, cos_phi))
    phi = math.acos(cos_phi)
    return {
        "plane1": [h1, k1, l1],
        "plane2": [h2, k2, l2],
        "cos_angle": cos_phi,
        "angle_rad": phi,
        "angle_deg": math.degrees(phi),
    }


# ── 7. Linear & planar atomic density (cubic) ─────────────────────────────────
def linear_planar_density(structure: str, a: float) -> dict:
    """Linear density (LD, atoms/length) along the close-packed direction and
    planar density (PD, atoms/area) on the close-packed plane for cubic metals,
    from the hard-sphere geometry:
        FCC: LD[110] = 2/(a*sqrt(2)) = 1/(2r);  PD(111) = 4/(a^2*sqrt(3))
        BCC: LD[111] = 2/(a*sqrt(3)) = 1/(2r);  PD(110) = 2/(a^2*sqrt(2))
        SC : LD[100] = 1/a = 1/(2r);            PD(100) = 1/a^2
    Along the close-packed direction atoms touch, so LD = 1/(2r) in every case.
    KNOWN: FCC LD[110] = 1/(2r); FCC PD(111) = 4/(sqrt(3) a^2) (highest of the
    cubic planes), reproducing Callister's worked examples.

    Ref: Callister 9th ed., Sec. 3.11 (linear & planar atomic densities).
    """
    st = structure.upper()
    if st == "FCC":
        cp_dir, cp_plane = "[110]", "(111)"
        r = a * math.sqrt(2.0) / 4.0
        ld = 2.0 / (a * math.sqrt(2.0))          # = 1/(2r)
        pd = 4.0 / (a * a * math.sqrt(3.0))
    elif st == "BCC":
        cp_dir, cp_plane = "[111]", "(110)"
        r = a * math.sqrt(3.0) / 4.0
        ld = 2.0 / (a * math.sqrt(3.0))          # = 1/(2r)
        pd = 2.0 / (a * a * math.sqrt(2.0))
    elif st == "SC":
        cp_dir, cp_plane = "[100]", "(100)"
        r = a / 2.0
        ld = 1.0 / a                             # = 1/(2r)
        pd = 1.0 / (a * a)
    else:
        raise ValueError(f"unknown structure {structure!r}; use SC/BCC/FCC")
    return {
        "structure": st,
        "a": a,
        "atomic_radius": r,
        "close_packed_direction": cp_dir,
        "close_packed_plane": cp_plane,
        "linear_density": ld,
        "planar_density": pd,
        "linear_density_check_1_over_2r": 1.0 / (2.0 * r),
    }


# ── 8. Schmid's law resolved shear stress ─────────────────────────────────────
def schmid_resolved_shear(sigma: float,
                          phi_deg: float, lambda_deg: float) -> dict:
    """Schmid's law: the resolved shear stress on a slip system under a uniaxial
    stress sigma is
        tau_R = sigma * cos(phi) * cos(lambda) = sigma * m
    where phi is the angle between the loading axis and the slip-plane normal,
    lambda is the angle between the loading axis and the slip direction, and
    m = cos(phi)cos(lambda) is the Schmid factor.
    KNOWN: the Schmid factor is maximized at phi = lambda = 45 deg, giving
    m = 0.5 (the theoretical maximum); tau_R then equals sigma/2.

    Ref: Schmid & Boas (1935); Callister 9th ed., Eq. 7.2; Dieter, "Mechanical
    Metallurgy" 3rd ed., Sec. 4-5.
    """
    phi = math.radians(phi_deg)
    lam = math.radians(lambda_deg)
    m = math.cos(phi) * math.cos(lam)
    tau = sigma * m
    return {
        "sigma": sigma,
        "phi_deg": phi_deg,
        "lambda_deg": lambda_deg,
        "schmid_factor": m,
        "resolved_shear_stress": tau,
    }


# ── helper: maximum Schmid factor over a single-crystal orientation ───────────
def max_schmid_factor() -> float:
    """The analytic maximum of cos(phi)cos(lambda) consistent with the geometry
    (phi = lambda = 45 deg) is exactly 0.5.

    Ref: Schmid & Boas (1935).
    """
    return math.cos(math.radians(45.0)) * math.cos(math.radians(45.0))


# ── helper: enumerate allowed reflections (small index range) ─────────────────
def allowed_reflections(structure: str, max_index: int = 2) -> list:
    """List the allowed (hkl) (excluding 000) up to |index| <= max_index for a
    cubic Bravais lattice, using structure_factor_allowed.

    Ref: see structure_factor_allowed.
    """
    out = []
    rng = range(-max_index, max_index + 1)
    for h, k, l in product(rng, rng, rng):
        if (h, k, l) == (0, 0, 0):
            continue
        if structure_factor_allowed(h, k, l, structure)["allowed"]:
            out.append((h, k, l))
    return out
