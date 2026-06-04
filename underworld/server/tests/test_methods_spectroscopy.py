"""Each spectroscopy method must reproduce its KNOWN published or analytically
exact value.

Citations are inline. Tolerances are explicit.
"""
import math

from underworld.server.services.methods_spectroscopy import (
    C_LIGHT,
    E_CHARGE,
    H_PLANCK,
    N_AVOGADRO,
    beer_lambert,
    bragg_diffraction,
    doppler_shift,
    harmonic_vibration,
    photon_energy,
    planck_blackbody,
    rigid_rotor_rotation,
    rydberg_hydrogen,
)


# 1. Rydberg/Balmer — KNOWN: H-alpha (n=3->2) = 656.3 nm; Lyman limit 91.2 nm;
#    Balmer series limit ~364.6 nm.
#    Ref: Rydberg formula (Wikipedia); NIST ASD.
def test_rydberg_balmer_h_alpha_656nm():
    r = rydberg_hydrogen(2, 3)
    assert abs(r["wavelength_nm"] - 656.3) < 0.5      # H-alpha = 656.3 nm
    assert r["series"] == "Balmer"
    # Balmer series limit (n=inf->2) ~= 364.6 nm
    limit = rydberg_hydrogen(2, 10_000_000)
    assert abs(limit["wavelength_nm"] - 364.6) < 1.0
    # Lyman limit (n=inf->1) ~= 91.18 nm
    lyman = rydberg_hydrogen(1, 10_000_000)
    assert abs(lyman["wavelength_nm"] - 91.18) < 0.5
    # H-alpha is a visible/red photon ~1.89 eV
    assert abs(r["energy_ev"] - 1.89) < 0.05


# 2. Beer-Lambert — KNOWN: epsilon=1000, l=1, c=1e-3 -> A=1.0, T=10%; and
#    A = -log10(T) exactly.
#    Ref: Beer-Lambert law (IUPAC Gold Book).
def test_beer_lambert_absorbance_and_transmittance():
    r = beer_lambert(1000.0, 1.0, 1e-3)
    assert abs(r["absorbance"] - 1.0) < 1e-12         # A = eps*l*c = 1
    assert abs(r["transmittance"] - 0.1) < 1e-12      # T = 10^-A = 0.1
    assert abs(r["transmittance_percent"] - 10.0) < 1e-9
    # A = -log10(T) round-trip
    assert abs(r["absorbance"] + math.log10(r["transmittance"])) < 1e-12
    # A=0 -> full transmission
    assert abs(beer_lambert(0.0, 1.0, 1.0)["transmittance"] - 1.0) < 1e-12
    # A=2 -> 1% transmission
    assert abs(beer_lambert(2.0, 1.0, 1.0)["transmittance"] - 0.01) < 1e-12


# 3. Planck/Wien — KNOWN: the Sun (5778 K) peaks near 500 nm; Planck radiance
#    is positive and falls off far from the peak.
#    Ref: Planck's law & Wien displacement (Wikipedia).
def test_planck_wien_sun_peak_500nm():
    sun = planck_blackbody(5778.0, wavelength_m=500e-9)
    assert abs(sun["peak_wavelength_nm"] - 500.0) < 5.0   # Wien peak ~501 nm
    assert sun["spectral_radiance_W_per_m2_per_m_per_sr"] > 0.0
    # hotter body peaks at shorter wavelength (Wien: lambda_peak ~ 1/T)
    hot = planck_blackbody(11556.0)   # double T -> half peak wavelength
    assert abs(hot["peak_wavelength_nm"] - sun["peak_wavelength_nm"] / 2.0) < 1e-6
    # radiance peaks at lambda_peak: value there exceeds value far in the tail
    peak_m = sun["peak_wavelength_m"]
    at_peak = planck_blackbody(5778.0, wavelength_m=peak_m)[
        "spectral_radiance_W_per_m2_per_m_per_sr"]
    in_tail = planck_blackbody(5778.0, wavelength_m=peak_m * 5.0)[
        "spectral_radiance_W_per_m2_per_m_per_sr"]
    assert at_peak > in_tail


# 4. Bragg — KNOWN: Cu K-alpha (0.15406 nm) off d=0.2 nm planes at n=1 ->
#    theta ~= 22.65 deg; n*lambda > 2d gives no diffraction.
#    Ref: Bragg's law (Wikipedia).
def test_bragg_copper_kalpha():
    r = bragg_diffraction(0.15406e-9, 0.2e-9, order=1)
    assert r["diffraction_possible"]
    assert abs(r["theta_deg"] - 22.65) < 0.1          # asin(0.38515)
    assert abs(r["two_theta_deg"] - 2.0 * r["theta_deg"]) < 1e-9
    # exact analytic check: sin(theta) = lambda / 2d
    assert abs(r["sin_theta"] - 0.15406 / (2.0 * 0.2)) < 1e-12
    # n*lambda > 2d -> impossible
    none = bragg_diffraction(0.5e-9, 0.2e-9, order=1)
    assert not none["diffraction_possible"]


# 5. Photon energy — KNOWN: hc = 1239.84 eV*nm, so a 1240 nm photon ~1.0 eV and
#    a 500 nm photon ~2.48 eV.
#    Ref: Planck-Einstein relation; hc = 1239.84 eV*nm.
def test_photon_energy_1240ev_nm_rule():
    p = photon_energy(1240.0)
    assert abs(p["energy_ev"] - 1.0) < 0.005          # 1240 nm -> ~1 eV
    # the hc invariant is ~1239.84 eV*nm at any wavelength
    assert abs(photon_energy(500.0)["hc_ev_nm"] - 1239.84) < 1.0
    assert abs(photon_energy(656.3)["hc_ev_nm"] - 1239.84) < 1.0
    # green 500 nm photon ~2.48 eV
    assert abs(photon_energy(500.0)["energy_ev"] - 2.48) < 0.02
    # E = h f consistency
    g = photon_energy(500.0)
    assert abs(g["energy_j"] - H_PLANCK * g["frequency_hz"]) < 1e-30


# 6. Rigid rotor — KNOWN: carbon monoxide (r=112.8 pm) has B ~= 1.93 cm^-1 and
#    line spacing 2B ~= 3.86 cm^-1.
#    Ref: rotational spectroscopy (Atkins' Physical Chemistry).
def test_rigid_rotor_co_B_constant():
    m_C = 12.0 / N_AVOGADRO / 1000.0       # kg, C-12
    m_O = 15.995 / N_AVOGADRO / 1000.0     # kg, O-16
    mu = m_C * m_O / (m_C + m_O)
    r = rigid_rotor_rotation(mu, 112.8e-12)
    assert abs(r["B_per_cm"] - 1.93) < 0.05            # CO B ~= 1.93 cm^-1
    assert abs(r["line_spacing_per_cm"] - 2.0 * r["B_per_cm"]) < 1e-12
    assert abs(r["line_spacing_per_cm"] - 3.86) < 0.1  # 2B ~= 3.86 cm^-1
    # moment of inertia is positive
    assert r["moment_of_inertia_kg_m2"] > 0.0


# 7. Harmonic vibration — KNOWN: HCl (k~480 N/m, mu from H-1/Cl-35) vibrates
#    near 2884 cm^-1 (published fundamental ~2886 cm^-1).
#    Ref: harmonic oscillator / IR spectroscopy (Atkins' Phys. Chem.).
def test_harmonic_vibration_hcl_2886cm():
    m_H = 1.008 / N_AVOGADRO / 1000.0      # kg, H-1
    m_Cl = 34.969 / N_AVOGADRO / 1000.0    # kg, Cl-35
    mu = m_H * m_Cl / (m_H + m_Cl)
    r = harmonic_vibration(480.0, mu)
    assert abs(r["wavenumber_per_cm"] - 2886.0) < 10.0   # HCl ~2884-2886 cm^-1
    # zero-point energy = 1/2 h nu
    assert abs(r["zero_point_energy_j"] - 0.5 * H_PLANCK * r["frequency_hz"]) < 1e-30
    # falls in the mid-IR (~3.5 um)
    assert 3.0 < r["wavelength_um"] < 4.0


# 8. Doppler — KNOWN: a 500 nm line from a source receding at 300 km/s shifts by
#    ~0.5 nm; Na-D (589 nm) in 500 K vapor has thermal FWHM ~2 pm.
#    Ref: Doppler broadening (Wikipedia; Demtroder).
def test_doppler_shift_and_thermal_broadening():
    # 300 km/s recession of a 500 nm line: dlambda = lambda*v/c ~ 0.5 nm
    s = doppler_shift(500e-9, 300e3)
    assert abs(s["delta_lambda_nm"] - 0.5) < 0.01
    assert s["shifted_wavelength_nm"] > 500.0          # redshift (longer)
    assert abs(s["redshift_z"] - 300e3 / C_LIGHT) < 1e-12
    # blueshift for approaching source
    b = doppler_shift(500e-9, -300e3)
    assert b["shifted_wavelength_nm"] < 500.0
    # thermal Doppler FWHM of Na-D (589 nm) at 500 K, M=22.99 g/mol ~ 2 pm
    t = doppler_shift(589e-9, 0.0, temperature_K=500.0,
                      molar_mass_kg_per_mol=22.99e-3)
    assert abs(t["thermal_fwhm_pm"] - 2.0) < 0.3
