# Methods Modules — Per-File Full-Read Coverage

Auditable full-read of every `underworld/server/services/methods_*.py`, plus `sim_methods.py`, `field_science.py`, `methods_registry.py`. Each block lists purpose, public functions, and one verbatim PROOF line quoted from past the 60% mark of the file.

### /home/user/jarvis-app/underworld/server/services/methods_veterinary.py (167 lines)
- purpose: Veterinary / animal-science simulations from canonical allometric & physiology equations, each verified against a known reference value.
- public functions (8):
  - `kleiber_metabolic_rate` — Kleiber's law basal metabolic rate BMR = 70·M^0.75 kcal/day.
  - `allometric_dose` — body-surface-area allometric dose scaling Dose_target = Dose_ref·(M_t/M_r)^exp.
  - `von_bertalanffy_growth` — von Bertalanffy growth L(t)=L∞·(1−e^(−k(t−t0))) with asymptote fraction.
  - `heart_rate_mass` — heart-rate allometry HR = 241·M^(−0.25) bpm.
  - `gestation_period` — gestation-period allometry t_gest = a·M^0.25 days.
  - `feed_conversion` — feed conversion ratio FCR = feed_intake / weight_gain.
  - `thermoneutral_zone` — lower-critical-temperature heat balance LCT = Tb − basal_flux·insulation.
  - `herd_logistic_growth` — logistic herd growth N(t)=K/(1+((K−N0)/N0)·e^(−rt)).
- PROOF L155: `    Closed form N(t)=K/(1+((K−N0)/N0)·e^(−rt)); as t→∞, N→K (carrying capacity).`

### /home/user/jarvis-app/underworld/server/services/methods_math.py (184 lines)
- purpose: Library of distinct, real named numerical/mathematical methods (textbook algorithms) verified against closed-form or reference values, built on sympy/scipy/numpy.
- public functions (8):
  - `rk4_integrate` — classical 4th-order Runge-Kutta ODE integrator (y'=y → e).
  - `newton_raphson_root` — Newton-Raphson root finding on x²−target, i.e. √target.
  - `simpson_integrate` — composite Simpson's rule numerical integration (∫₀^π sin = 2).
  - `svd_reconstruct` — Singular Value Decomposition A = UΣVᵀ with reconstruction/eigen cross-check.
  - `rsa_roundtrip` — textbook RSA modular exponentiation roundtrip ((m^e)^d ≡ m mod n).
  - `monte_carlo_pi` — Monte Carlo π estimation from points inside the quarter circle.
  - `fft_frequencies` — FFT spectral analysis recovering pure-tone frequencies.
  - `gradient_descent` — gradient descent on a convex bowl, cross-checked vs scipy BFGS.
- PROOF L177: `    res = sopt.minimize(lambda v: (v[0] - 3) ** 2 + (v[1] + 1) ** 2,`

### /home/user/jarvis-app/underworld/server/services/methods_physics.py (203 lines)
- purpose: NASA-grade physics methods, each from a canonical published formula and verified against a known published value; constants are CODATA/IAU.
- public functions (8):
  - `lorentz_factor` — special-relativity γ = 1/√(1−(v/c)²) and time-dilation/length-contraction factors.
  - `schwarzschild_radius` — general-relativity event-horizon radius r_s = 2GM/c².
  - `double_slit_fringe` — Young's double-slit bright-fringe spacing Δy = λL/d.
  - `planck_spectral_radiance` — Planck blackbody radiance and numerically located Wien peak.
  - `maxwell_boltzmann_speed` — most-probable/mean/RMS speeds of the Maxwell-Boltzmann distribution.
  - `cyclotron_frequency` — cyclotron angular & ordinary frequency ω_c = qB/m of a charged particle.
  - `carnot_efficiency` — Carnot heat-engine maximum efficiency η = 1 − Tc/Th.
  - `relativistic_energy` — total relativistic energy E = γmc² with rest and kinetic parts.
- PROOF L193: `    gamma = 1.0 / np.sqrt(1.0 - beta * beta)`

### /home/user/jarvis-app/underworld/server/services/methods_forestry.py (209 lines)
- purpose: Forestry & dendrology mensuration/growth/carbon models from canonical equations, verified against known published values; includes a keyword routing table.
- public functions (8 method + route):
  - `tree_volume` — Smalian's log-volume rule from two end diameters and length.
  - `biomass_allometry` — above-ground biomass via power-law AGB = exp(b0 + b1·ln D).
  - `tree_growth` — Chapman-Richards / von Bertalanffy growth Y = A·(1−e^{−k(t−t0)})^p.
  - `carbon_sequest` — carbon stock and CO2-equivalent from dry biomass (CF, 44/12).
  - `self_thinning` — Reineke Stand Density Index plus self-thinning slopes.
  - `site_index` — site index = predicted dominant height at a reference base age.
  - `basal_area` — stem cross-sectional (basal) area BA = π·D²/4 and stand BA.
  - `canopy_light` — Beer's-law canopy light interception I = I0·exp(−k·LAI).
  - `route` — resolves a keyword to a forestry method (substring/prefix match).
- PROOF L205: `    for keys, fn in ROUTES.items():`

### /home/user/jarvis-app/underworld/server/services/methods_earth.py (212 lines)
- purpose: Real earth/climate/geoscience simulations (atmospheric physics, seismology, hydrology, oceanography, radiative balance, geochronology) verified against known values.
- public functions (8):
  - `barometric_pressure` — isothermal barometric formula p(z)=p0·exp(−z/H), scale height H=RT/g.
  - `dry_adiabatic_lapse_rate` — dry adiabatic lapse rate Γ_d = g/cp (~9.8 K/km).
  - `seismic_pwave_swave_ratio` — P/S wave speeds & ratio from Poisson ratio with travel times.
  - `earthquake_energy` — Gutenberg-Richter radiated energy log10(E)=1.5M+4.8.
  - `manning_open_channel` — Manning's open-channel flow V=(1/n)R^(2/3)S^(1/2), Q=AV.
  - `coriolis_parameter` — Coriolis parameter f=2Ω sinφ and optional geostrophic velocity.
  - `radiative_equilibrium` — planetary energy balance equilibrium & greenhouse surface temp.
  - `radiometric_age` — radiometric/radiocarbon age from exponential decay.
- PROOF L204: `    decay_constant = LN2 / half_life_years          # per year`

### /home/user/jarvis-app/underworld/server/services/methods_electronics.py (225 lines)
- purpose: Real electronics & semiconductor-device methods from canonical formulae verified against known published values; constants CODATA + silicon textbook params.
- public functions (8 + helper thermal_voltage):
  - `thermal_voltage` — thermal voltage Vt = kT/q (~25.85 mV at 300 K).
  - `shockley_diode_current` — Shockley diode current I = I0(exp(V/nVt)−1).
  - `transistor_operating_point` — common-emitter BJT DC operating point + small-signal gain.
  - `op_amp_gain` — ideal op-amp closed-loop gain (inverting/non-inverting).
  - `rlc_resonant_frequency` — LC/RLC resonant frequency f0 = 1/(2π√(LC)) and Q.
  - `pn_junction_built_in_potential` — abrupt PN junction Vbi = Vt·ln(Na·Nd/ni²).
  - `fermi_dirac_occupancy` — Fermi-Dirac occupation f(E)=1/(exp((E−Ef)/kT)+1).
  - `intrinsic_carrier_concentration` — ni = √(Nc·Nv)·exp(−Eg/2kT).
  - `rc_lowpass_cutoff` — first-order RC low-pass −3 dB cutoff fc = 1/(2πRC).
- PROOF L219: `    tau = resistance_ohm * capacitance_f`

### /home/user/jarvis-app/underworld/server/services/methods_ecology.py (234 lines)
- purpose: Real ecology & environmental-science methods (biodiversity, biogeography, biogeochemical cycling, food-web stability, harvesting, uptake, footprint) verified against known references.
- public functions (8):
  - `biodiversity_indices` — Shannon H', Simpson D, evenness, inverse/Gini-Simpson from counts.
  - `species_area_relationship` — fit Arrhenius power law S = c·A^z via log-log regression.
  - `island_biogeography_equilibrium` — MacArthur-Wilson equilibrium species number S*.
  - `carbon_box_decay` — single-box first-order CO2 perturbation decay C(t)=C0·exp(−t/τ).
  - `may_food_web_stability` — May's criterion σ√(SC) < 1 for random-community stability.
  - `maximum_sustainable_yield` — Schaefer surplus-production MSY = rK/4.
  - `michaelis_menten_uptake` — saturating Monod/Michaelis-Menten nutrient uptake.
  - `ecological_footprint` — ecological-footprint/biocapacity accounting & earths required.
- PROOF L225: `    total_footprint = footprint_per_capita_gha * population`

### /home/user/jarvis-app/underworld/server/services/methods_medicine.py (236 lines)
- purpose: Clinical-grade medicine & physiology methods from canonical clinical formulae, verified against known published values.
- public functions (8):
  - `cardiac_output` — cardiac output CO = HR·SV (resting ~5 L/min).
  - `poiseuille_blood_flow` — Hagen-Poiseuille blood flow & vascular resistance (~1/r⁴).
  - `oxygen_hemoglobin_saturation` — Hill-equation O2-Hb dissociation curve.
  - `creatinine_clearance` — Cockcroft-Gault estimated creatinine clearance (eGFR).
  - `basal_metabolic_rate` — Mifflin-St Jeor & Harris-Benedict BMR.
  - `body_metrics` — BMI + Du Bois body-surface-area.
  - `dose_response` — sigmoidal Emax/EC50 pharmacodynamic dose-response.
  - `mean_arterial_pressure` — MAP = DBP + 1/3(SBP−DBP) plus pulse pressure & CO.
- PROOF L227: `    pulse_pressure = systolic_mmhg - diastolic_mmhg`

### /home/user/jarvis-app/underworld/server/services/methods_astronomy.py (237 lines)
- purpose: NASA/IAU-grade astronomy & cosmology methods from canonical formulae verified against known published values; CODATA 2018 / IAU 2015 constants.
- public functions (8 + roche_limit):
  - `hubble_recession_velocity` — Hubble's law v = H0·d plus Hubble time.
  - `stellar_luminosity` — Stefan-Boltzmann luminosity L = 4πR²σT⁴.
  - `cosmological_redshift` — redshift z & FLRW scale factor a = 1/(1+z).
  - `chandrasekhar_mass` — white-dwarf Chandrasekhar limiting mass.
  - `orbital_period` — Newton's form of Kepler's third law P = 2π√(a³/GM).
  - `escape_velocity` — escape velocity v_esc=√(2GM/R) & surface gravity.
  - `wien_peak_colour` — Wien's law peak wavelength mapped to a colour band.
  - `schwarzschild_radius` — Schwarzschild radius r_s = 2GM/c².
  - `roche_limit` — rigid-body Roche limit d = 2.44·R·(ρ_p/ρ_s)^(1/3).
- PROOF L231: `    ratio = (primary_density / satellite_density) ** (1.0 / 3.0)`

### /home/user/jarvis-app/underworld/server/services/methods_aerodynamics.py (245 lines)
- purpose: Real atmospheric-flight aerodynamics methods (lift/drag/airfoil/compressible flow) verified against known/analytically exact values; deliberately avoids orbital astrodynamics.
- public functions (8):
  - `lift_force` — lift from the lift equation L = ½ρV²S·C_L.
  - `drag_polar` — parabolic drag polar C_D = C_D0 + C_L²/(πeAR) and total drag.
  - `pitot_airspeed` — incompressible pitot-static airspeed V = √(2q/ρ).
  - `mach_number` — speed of sound a=√(γRT), Mach number & flow regime.
  - `prandtl_glauert` — Prandtl-Glauert subsonic compressibility correction C_p = C_p0/β.
  - `isentropic_stagnation` — isentropic stagnation-to-static T/p/ρ ratios.
  - `thin_airfoil_lift` — thin-airfoil-theory 2D/3D lift-curve slope and c_l.
  - `glide_performance` — best L/D, glide ratio, glide angle, best-glide speed & sink rate.
- PROOF L231: `    cl_opt = math.sqrt(math.pi * oswald_e * aspect_ratio * cd0)`

### /home/user/jarvis-app/underworld/server/services/methods_acoustics2.py (250 lines)
- purpose: Acoustics methods from canonical published formulae verified against known values (SIL, Doppler, harmonics, reverberation, beats, transmission loss, speed of sound).
- public functions (8):
  - `sound_intensity_level` — SIL in dB L = 10·log10(I/I0).
  - `doppler_shift` — moving source/observer Doppler frequency shift.
  - `string_harmonics` — vibrating-string standing-wave modes f_n = n·v/(2L).
  - `organ_pipe_resonance` — open vs closed organ-pipe resonances and harmonics.
  - `sabine_reverberation` — Sabine reverberation time RT60 = k·V/A.
  - `beat_frequency` — beat frequency f_beat = |f1−f2| and mean tone.
  - `transmission_loss` — mass-law partition transmission loss TL = 20·log10(mf) − 47.2.
  - `speed_of_sound_air` — speed of sound in air c(T) = 331.3·√(1+T/273.15).
- PROOF L223: `    tl = 20.0 * np.log10(surface_mass_kg_m2 * frequency_hz) - 47.2`

### /home/user/jarvis-app/underworld/server/services/methods_optics.py (255 lines)
- purpose: Optics & photonics methods from canonical published formulae verified against known values (thin lens, gratings, Fresnel, diffraction limit, fiber, Gaussian beam, Bragg, Snell).
- public functions (8):
  - `thin_lens_image` — thin-lens equation 1/f=1/u+1/v, image distance & magnification.
  - `diffraction_grating` — grating equation m·λ = d·sinθ, diffraction angle.
  - `fresnel_reflection` — Fresnel s/p reflectance at a dielectric interface.
  - `diffraction_limit` — Rayleigh (0.61λ/NA) & Abbe (λ/2NA) resolution limits.
  - `fiber_numerical_aperture` — step-index fiber NA, V-number & single-mode cutoff.
  - `gaussian_beam` — Gaussian-beam Rayleigh range, divergence & spot at distance.
  - `bragg_wavelength` — Bragg/thin-film reflection wavelength λ_B = 2·n_eff·Λ.
  - `snell_refraction` — Snell's law refraction angle and TIR critical angle.
- PROOF L242: `    if n1 > n2:`

### /home/user/jarvis-app/underworld/server/services/methods_spectroscopy.py (256 lines)
- purpose: Real spectroscopy methods (atomic emission, absorption photometry, thermal radiation, Bragg, photon energetics, rotation, vibration, Doppler) verified against known/exact values.
- public functions (8):
  - `rydberg_hydrogen` — Rydberg formula hydrogen spectral-line wavelength with reduced-mass correction.
  - `beer_lambert` — Beer-Lambert absorbance A=εlc and transmittance T=10^−A.
  - `planck_blackbody` — Planck spectral radiance and Wien peak wavelength.
  - `bragg_diffraction` — Bragg's law nλ = 2d·sinθ diffraction angle.
  - `photon_energy` — Planck-Einstein photon energetics E = hc/λ in J & eV.
  - `rigid_rotor_rotation` — rigid-rotor rotational constant B and 2B line spacing.
  - `harmonic_vibration` — harmonic-oscillator vibrational frequency ν=(1/2π)√(k/μ).
  - `doppler_shift` — Doppler line shift dλ/λ=v/c plus thermal broadening FWHM.
- PROOF L239: `    delta_lambda = wavelength_m * velocity_m_per_s / C_LIGHT`

### /home/user/jarvis-app/underworld/server/services/methods_plasma.py (257 lines)
- purpose: Plasma physics & fusion textbook relations implemented vs CODATA constants and published reference values; includes a keyword routing table.
- public functions (8 + route):
  - `plasma_frequency` — electron/species plasma frequency ω_p = √(ne²/ε0m).
  - `debye_length` — Debye shielding length λ_D and Debye-sphere particle count.
  - `lawson_triple_product` — fusion triple product nTτ vs D-T ignition threshold.
  - `gyromotion` — cyclotron frequency and Larmor (gyro) radius in a B field.
  - `coulomb_log_collision` — Coulomb logarithm ln Λ and electron collision rate (NRL).
  - `saha_ionization` — Saha-equation ionization fraction of a hydrogen-like gas.
  - `bremsstrahlung_power` — thermal bremsstrahlung radiated power density (Wesson).
  - `plasma_beta` — magnetic pressure and plasma beta β = 2μ0p/B².
  - `route` — returns the handler whose keyword-tuple matches a query.
- PROOF L251: `    for keywords, fn in ROUTE_TABLE.items():`

### /home/user/jarvis-app/underworld/server/services/methods_crypto.py (259 lines)
- purpose: Distinct real cryptography & coding-theory simulations (textbook algorithms) on stdlib hashlib/zlib + numpy, each verified against a known reference value.
- public functions (8):
  - `diffie_hellman_exchange` — Diffie-Hellman key exchange yielding a shared secret.
  - `rsa_sign_verify` — textbook RSA sign/verify roundtrip on canonical n=3233 keys.
  - `hamming_7_4` — Hamming(7,4) ECC encode + single-bit-error syndrome correction.
  - `sha256_avalanche` — SHA-256 avalanche effect (~50% output bits flip).
  - `shannon_keyspace_entropy` — information entropy bits = log2(keyspace).
  - `ec_point_addition` — elliptic-curve chord-and-tangent point addition/doubling.
  - `one_time_pad` — XOR one-time-pad cipher with perfect-secrecy demonstration.
  - `crc32_checksum` — CRC-32 (IEEE 802.3) checksum detecting a corrupted bit.
- PROOF L233: `    alt_key = bytes(c ^ a for c, a in zip(cipher, alt))`

### /home/user/jarvis-app/underworld/server/services/methods_tribology.py (260 lines)
- purpose: Real tribology (friction, wear, lubrication, contact, bearings, drag) methods verified against known/exact values.
- public functions (8):
  - `amontons_coulomb_friction` — Amontons-Coulomb dry friction & angle of repose.
  - `archard_wear` — Archard wear volume V = K·W·L/H and wear rates.
  - `hertz_sphere_flat` — Hertzian sphere-on-flat contact radius, pressures & approach.
  - `stribeck_lambda_ratio` — specific film thickness λ ratio classifying lubrication regime.
  - `petroff_bearing_friction` — Petroff journal-bearing friction torque & power.
  - `stokes_drag` — Stokes' law viscous drag, terminal velocity & Reynolds number.
  - `rolling_resistance` — rolling resistance force F_rr = C_rr·N and dimensional arm.
  - `hersey_number` — Hersey number H = μN/P and minimum hydrodynamic film thickness.
- PROOF L247: `    H = viscosity_Pa_s * speed_rev_s / pressure_Pa`

### /home/user/jarvis-app/underworld/server/services/methods_geology.py (261 lines)
- purpose: Real geology & planetary-science simulations (isostasy, geothermal heat flow, plate tectonics, cratering, radiogenic heat, seismology, hydrostatics, planetary mass) verified against known values.
- public functions (8):
  - `airy_root_depth` — Airy isostatic crustal root depth r = h·ρ_c/(ρ_m−ρ_c).
  - `geothermal_heat_flow` — geothermal gradient and conductive surface heat flow q=k·dT/dz.
  - `plate_velocity` — plate/seafloor-spreading velocity v = distance/age.
  - `impact_crater_diameter` — Holsapple pi-group gravity-regime transient-crater diameter.
  - `radiogenic_heat` — volumetric radiogenic heat production A=ρH plus decay fraction.
  - `seismic_moment` — seismic moment M0=μAD and Hanks-Kanamori moment magnitude.
  - `hydrostatic_pressure` — hydrostatic pressure at depth p = p0 + ρgh.
  - `planetary_mass` — planetary mass M = gR²/G and bulk density.
- PROOF L251: `    mass = surface_gravity_m_s2 * radius_m ** 2 / G`

### /home/user/jarvis-app/underworld/server/services/methods_fluids.py (265 lines)
- purpose: NASA-grade fluid-dynamics & aerodynamics methods from canonical published formulae verified against known values (Bernoulli, lift, drag, Reynolds, Blasius, Mach, shock, Hagen-Poiseuille).
- public functions (8):
  - `bernoulli_pressure` — Bernoulli energy conservation solving downstream static pressure.
  - `lift_coefficient_force` — lift force L = ½ρv²S·C_L.
  - `drag_terminal_velocity` — quadratic drag force and terminal velocity of a sphere.
  - `reynolds_number` — Reynolds number Re=ρvL/μ and laminar/turbulent regime.
  - `blasius_boundary_layer` — Blasius laminar flat-plate boundary-layer thickness.
  - `speed_of_sound_mach` — speed of sound a=√(γRT) and Mach number.
  - `normal_shock_relations` — Rankine-Hugoniot normal-shock jumps + Prandtl-Meyer angle.
  - `hagen_poiseuille_flow` — laminar pipe flow rate Q = π·dP·r⁴/(8μL).
- PROOF L257: `    q = (np.pi * pressure_drop_pa * radius_m ** 4`

### /home/user/jarvis-app/underworld/server/services/methods_biology.py (267 lines)
- purpose: Real named biology simulation methods (population genetics, ecology ODEs, enzyme kinetics, epidemiology, PK, phylogenetics) checkable against known analytic/textbook values, using numpy/scipy.
- public functions (8):
  - `wright_fisher_drift` — Wright-Fisher neutral drift; Monte Carlo fixation probability = p0.
  - `lotka_volterra` — Lotka-Volterra predator-prey ODE equilibrium & conserved-quantity orbits.
  - `michaelis_menten` — Michaelis-Menten enzyme kinetics v = Vmax[S]/(Km+[S]).
  - `logistic_growth` — logistic population growth N(t) → carrying capacity K.
  - `seir_epidemic` — SEIR epidemic ODE with R0 = β/γ threshold.
  - `one_compartment_pk` — one-compartment IV-bolus PK C(t)=C0·e^{−kt}, t_half=ln2/k.
  - `hardy_weinberg` — Hardy-Weinberg genotype frequencies p²+2pq+q²=1.
  - `jukes_cantor_distance` — Jukes-Cantor phylogenetic distance d = −¾ln(1−4/3·p).
- PROOF L262: `    d = -0.75 * math.log(1.0 - (4.0 / 3.0) * p_diff)`

### /home/user/jarvis-app/underworld/server/services/methods_structural.py (267 lines)
- purpose: Real structural-mechanics methods (beam bending, cantilevers, buckling, stress, section properties, trusses, torsion) verified against known/exact values; all SI.
- public functions (9):
  - `simply_supported_point_load` — simply-supported beam central point load deflection/moment/reactions.
  - `simply_supported_udl` — simply-supported beam UDL deflection 5wL⁴/384EI and moment.
  - `cantilever_point_load` — cantilever end-load tip deflection PL³/3EI, slope & moment.
  - `euler_buckling_load` — Euler critical buckling load P_cr = π²EI/(KL)².
  - `bending_stress` — flexure bending stress σ = Mc/I and section modulus.
  - `second_moment_of_area` — second moment of area for rectangle/circle/hollow sections.
  - `axial_member` — uniaxial bar stress/strain/elongation (Hooke's law).
  - `truss_triangle_method_of_joints` — determinate triangular truss by method of joints.
  - `circular_shaft_torsion` — torsion of a solid/hollow circular shaft τ=Tr/J, φ=TL/GJ.
- PROOF L256: `        J = math.pi * (d ** 4 - d_inner ** 4) / 32.0`

### /home/user/jarvis-app/underworld/server/services/methods_seismology.py (268 lines)
- purpose: Real seismology methods (magnitude scales, frequency-magnitude statistics, wave physics, aftershock decay, epicenter trilateration) verified against known/exact values.
- public functions (8):
  - `richter_local_magnitude` — Richter ML from Wood-Anderson amplitude with Hutton-Boore attenuation.
  - `moment_magnitude` — Hanks-Kanamori Mw = (2/3)(log10 M0 − 9.1).
  - `gutenberg_richter_b_value` — Aki-Utsu maximum-likelihood b-value with binning correction.
  - `ps_travel_time_distance` — epicentral distance from S-minus-P arrival-time difference.
  - `body_wave_velocities` — P/S body-wave velocities from bulk/shear moduli and density.
  - `omori_aftershock_rate` — modified Omori-Utsu aftershock rate & cumulative count.
  - `energy_from_magnitude` — Gutenberg-Richter radiated seismic energy log10(E)=1.5M+4.8.
  - `epicenter_trilateration` — epicenter location by 3-station S-P linearized least-squares.
- PROOF L256: `    b = (d[0] ** 2 - d[1:] ** 2`

### /home/user/jarvis-app/underworld/server/services/methods_electrochem.py (269 lines)
- purpose: Real electrochemistry methods (galvanic thermodynamics, electrolysis, electrode kinetics, ionic transport, Debye-Huckel, battery engineering) verified against known/exact values.
- public functions (8, one with a companion):
  - `nernst_potential` — Nernst-equation cell potential E = E0 − (RT/nF)ln Q.
  - `standard_cell_emf` — standard galvanic-cell EMF from two reduction potentials, plus ΔG0.
  - `faraday_electrolysis` — Faraday's law mass deposited m = QM/(nF).
  - `butler_volmer_current` — Butler-Volmer net electrode current density from overpotential.
  - `tafel_overpotential` — high-field Tafel approximation η = b·log10(j/j0).
  - `molar_conductivity_kohlrausch` — Kohlrausch limiting molar conductivity from ionic conductivities.
  - `nernst_einstein_conductivity` — Nernst-Einstein ionic conductivity λ = z²F²D/(RT).
  - `debye_huckel_activity` — Debye-Huckel limiting-law mean ionic activity coefficient.
  - `battery_capacity_soc` — Peukert effective capacity & Coulomb-counting state of charge.
- PROOF L256: `    C_eff = rated_capacity_Ah * (rated_current_A / discharge_current_A) ** (peukert_k - 1.0)`

### /home/user/jarvis-app/underworld/server/services/methods_combustion.py (274 lines)
- purpose: Real combustion & flame methods (stoichiometry, mixture strength, thermochemistry, flue-gas composition, flame propagation, Wobbe index, flammability) verified against known/exact values.
- public functions (8):
  - `stoichiometric_afr` — stoichiometric air-fuel ratio for a hydrocarbon CxHy.
  - `equivalence_ratio` — equivalence ratio φ, air ratio λ and excess air.
  - `adiabatic_flame_temperature` — constant-cp adiabatic flame temperature energy balance.
  - `lower_heating_value` — lower heating value from enthalpies of formation (Hess's law).
  - `flue_gas_composition` — wet/dry flue-gas product composition with excess air.
  - `laminar_flame_speed` — Metghalchi-Keck power-law laminar burning velocity.
  - `wobbe_index` — Wobbe gas-interchangeability index I_W = HV/√SG.
  - `flammability_le_chatelier` — mixture LFL/UFL via Le Chatelier's mixing rule.
- PROOF L266: `    y = 100.0 * y / y.sum()                 # normalize to percent on fuel basis`

### /home/user/jarvis-app/underworld/server/services/methods_biomechanics.py (276 lines)
- purpose: Biomechanics locomotion & tissue-mechanics methods from canonical equations verified against known values; includes a keyword route table.
- public functions (10 method + route):
  - `hill_muscle` — A.V. Hill force-velocity hyperbola for concentric shortening.
  - `hill_max_power` — optimal shortening velocity & peak mechanical power of the Hill curve.
  - `bone_stress` — axial compressive stress σ = F/A.
  - `bone_buckling` — Euler buckling load of a long bone as a hollow cylindrical column.
  - `joint_torque` — joint static-equilibrium muscle force from moment arms.
  - `gait_pendulum` — leg as a physical pendulum gait period T = 2π√(2L/3g).
  - `cost_transport` — dimensionless metabolic cost of transport COT = E/(mgd).
  - `tendon_energy` — linear-elastic tendon strain-energy storage.
  - `ground_reaction` — impulse-momentum jump take-off velocity & height from GRF trace.
  - `allometric_stride` — allometric power-law scaling Y = ref·(M/M_ref)^b.
  - `allometric_fit` — recover the allometric exponent via log-log least squares.
  - `route` — maps a keyword to its biomechanics function.
- PROOF L237: `    value = ref_value * (mass_kg / ref_mass_kg) ** exponent`

### /home/user/jarvis-app/underworld/server/services/methods_rf.py (279 lines)
- purpose: Real RF/antenna/microwave-link methods (free-space propagation, radar, antennas, link budgets, Doppler, skin depth) verified against known/exact values.
- public functions (8 + helpers):
  - `friis_transmission` — Friis free-space received power Pr = Pt·Gt·Gr·(λ/4πd)².
  - `free_space_path_loss` — free-space path loss FSPL in dB.
  - `radar_range_equation` — monostatic radar range equation (received power / max range).
  - `antenna_aperture_gain` — aperture-antenna gain G = 4πAe/λ² and effective aperture.
  - `aperture_beamwidth_directivity` — circular-aperture HPBW and directivity.
  - `link_budget` — end-to-end microwave link budget (EIRP, FSPL, G/T, C/N).
  - `doppler_shift` — RF Doppler shift (classical/relativistic + radar two-way).
  - `skin_depth` — conductor skin depth δ = √(2/(ωμσ)) and surface resistance.
- PROOF L271: `    delta = math.sqrt(2.0 / (omega * mu * conductivity_s_per_m))`

### /home/user/jarvis-app/underworld/server/services/methods_ocean.py (285 lines)
- purpose: Real physical-oceanography methods from canonical formulae verified against known values (wave dispersion, seawater density, tides, Ekman, buoyancy, wave energy, geostrophy); exposes a METHODS dict.
- public functions (8):
  - `deep_water_wave` — deep-water gravity-wave dispersion / phase & group speed.
  - `shallow_water_wave` — shallow-water/tsunami non-dispersive speed c = √(gh).
  - `seawater_density` — linear UNESCO-anchored seawater equation of state.
  - `tidal_m2` — principal lunar semidiurnal (M2) tidal constituent.
  - `ekman_transport` — wind-driven Ekman transport & 45° surface deflection.
  - `buoyancy_frequency` — Brunt-Vaisala buoyancy frequency of a stratified column.
  - `wave_energy_stokes` — surface-wave energy density E = ⅛ρgH² and Stokes drift.
  - `geostrophic_current` — geostrophic current v = (g/f)·dη/dx.
- PROOF L266: `    phi = math.radians(latitude_deg)`

### /home/user/jarvis-app/underworld/server/services/methods_quantum.py (286 lines)
- purpose: Real quantum & particle-physics methods from canonical formulae verified against known published values; CODATA constants via scipy.constants.
- public functions (8):
  - `tunnelling_transmission` — rectangular-barrier tunnelling transmission coefficient (exact + approx).
  - `particle_in_a_box` — infinite-well energy levels E_n = n²h²/8mL².
  - `larmor_precession` — spin Larmor precession frequency ω = γB.
  - `bohr_energy_levels` — hydrogen Bohr energy levels E_n = −13.6/n² eV.
  - `harmonic_oscillator` — quantum HO levels E_n = (n+½)ħω and zero-point energy.
  - `rabi_oscillation` — two-level generalized Rabi frequency & excited-state population.
  - `de_broglie_wavelength` — non-relativistic de Broglie wavelength λ = h/p.
  - `compton_shift` — Compton scattering wavelength shift Δλ = λ_C(1−cosθ).
- PROOF L279: `    lambda_c = H / (mass_kg * C_LIGHT)`

### /home/user/jarvis-app/underworld/server/services/methods_heattransfer.py (292 lines)
- purpose: Real heat & mass transfer (transport phenomena) methods verified against known/exact values (conduction, convection, radiation, transient, fins, LMTD, Fick diffusion).
- public functions (8):
  - `plane_wall_conduction` — multi-layer plane-wall Fourier conduction (series resistance).
  - `cylinder_conduction` — radial cylindrical conduction q = 2πkL·ΔT/ln(ro/ri).
  - `dittus_boelter_convection` — Dittus-Boelter turbulent internal convection coefficient.
  - `radiative_exchange` — Stefan-Boltzmann gray-surface net radiative exchange.
  - `lumped_capacitance_cooling` — transient lumped-capacitance cooling with Biot check.
  - `fin_heat_transfer` — straight rectangular fin heat rate & efficiency (adiabatic tip).
  - `lmtd_heat_exchanger` — log-mean-temperature-difference heat-exchanger duty.
  - `fick_diffusion` — Fick's-law steady diffusion flux & penetration depth.
- PROOF L285: `    flux = diffusivity_m2_s * (conc_high - conc_low) / length_m`

### /home/user/jarvis-app/underworld/server/services/methods_chemistry.py (295 lines)
- purpose: Real named chemistry methods returning real computed values verified against known published values; includes a (field, keyword) route table.
- public functions (8 + ROUTE_TABLE):
  - `reaction_kinetics_first_order` — integrate first-order rate ODE, verify t_half = ln2/k.
  - `chemical_equilibrium` — solve A⇌B equilibrium concentrations from Keq.
  - `nernst_cell_potential` — Nernst-equation cell EMF (Daniell cell).
  - `weak_acid_ph` — exact-quadratic pH of a weak monoprotic acid.
  - `arrhenius_rate_ratio` — Arrhenius temperature dependence k(T2)/k(T1).
  - `beer_lambert_absorbance` — Beer-Lambert absorbance A = εlc and transmittance.
  - `van_der_waals_pressure` — real-gas van der Waals vs ideal-gas pressure.
  - `gibbs_free_energy` — Gibbs free energy ΔG = ΔH − TΔS and spontaneity.
- PROOF L271: `    delta_g = delta_h - T * delta_s`

### /home/user/jarvis-app/underworld/server/services/methods_foodscience.py (298 lines)
- purpose: Food-science thermal-processing/preservation/physical-chemistry methods from canonical equations verified against known published values; includes a keyword route table (multiple helper functions per topic).
- public functions (8 topics; functions):
  - `thermal_death` — Bigelow D-value, z-value & log reduction.
  - `z_value_from_two_d` — z-value from two (D,T) points.
  - `f0_sterilization` — accumulated F0 lethality at 121.1°C reference.
  - `f0_from_d12` — target F0 for an n-log (12D botulinum) process.
  - `water_activity_raoult` / `gab_sorption` / `bet_monolayer` — water activity & moisture sorption isotherms.
  - `freezing_point_depression` / `boiling_point_elevation` — colligative molal depression/elevation.
  - `arrhenius_rate` / `maillard_rate_ratio` / `maillard_extent` — Maillard/Arrhenius browning kinetics.
  - `come_up_time_correction` / `heat_penetration_temp` / `ball_process_time` — Ball heat-penetration methods.
  - `q10_shelf_life` / `q10_from_rates` — Q10 shelf-life model.
  - `brix_to_sg` / `sg_to_brix` / `brix_mass_sugar` — Brix sugar concentration & density (NBS polynomial).
- PROOF L271: `    bx = (182.46007 * sg ** 3 - 775.68212 * sg ** 2`

### /home/user/jarvis-app/underworld/server/services/methods_hydrogeology.py (301 lines)
- purpose: Real hydrogeology/groundwater methods (Darcy, Theis, conductivity/permeability, Dupuit, contaminant transport, storage, Hazen, seepage) verified against known published values.
- public functions (8 + theis_well_function):
  - `darcy_flux` — Darcy's law specific discharge q = −K·dh/dl and volumetric flow.
  - `theis_drawdown` — Theis transient confined-aquifer well drawdown with well function.
  - `theis_well_function` — standalone Theis well function W(u) = E1(u).
  - `conductivity_permeability` — convert hydraulic conductivity K ↔ intrinsic permeability k.
  - `dupuit_well_discharge` — Dupuit-Forchheimer steady unconfined-aquifer well discharge.
  - `contaminant_transport` — advection-dispersion transport & sorption retardation factor.
  - `aquifer_storage_volume` — water volume released from aquifer storage (S or Sy).
  - `hazen_conductivity` — Hazen empirical K from effective grain size d10.
  - `seepage_velocity` — seepage (linear pore) velocity v = q/n.
- PROOF L294: `    velocity = darcy_flux_m_s / porosity`

### /home/user/jarvis-app/underworld/server/services/methods_materials.py (302 lines)
- purpose: Real named materials-science methods each verifiable against a known value; includes a keyword route table.
- public functions (8 + route):
  - `bragg_diffraction` — Bragg's law nλ = 2d·sinθ (angle or wavelength).
  - `lever_rule` — phase-diagram lever-rule phase fractions on a tie line.
  - `griffith_fracture` — Griffith brittle-fracture critical stress & K_Ic.
  - `fick_diffusion` — Fick's 2nd-law error-function diffusion profile & length.
  - `hooke_elasticity` — Hooke's law stress/strain/Young's modulus.
  - `arrhenius_vacancy` — Arrhenius thermally-activated vacancy concentration / rate.
  - `hall_petch` — Hall-Petch grain-size strengthening σ_y = σ0 + k_y·d^−½.
  - `wiedemann_franz` — Wiedemann-Franz Lorenz number κ/(σT).
  - `route` — returns the function matching a keyword (substring).
- PROOF L295: `def route(keyword: str):`

### /home/user/jarvis-app/underworld/server/services/methods_semiconductor.py (302 lines)
- purpose: Real semiconductor-device physics methods (carrier statistics, Fermi level, Shockley diode, pn-junction electrostatics, drift conductivity, Hall effect, Varshni bandgap) verified against known/exact values; device-physics cm units.
- public functions (8):
  - `intrinsic_carrier_concentration` — ni(T) = √(Nc·Nv)·exp(−Eg/2kT).
  - `carrier_density_fermi` — electron/hole density from Fermi-level position (Boltzmann/Fermi-Dirac).
  - `shockley_diode` — Shockley diode I(V) = Is(exp(V/nVT)−1) and dynamic conductance.
  - `built_in_potential` — abrupt pn-junction built-in potential V_bi = (kT/q)ln(NaNd/ni²).
  - `depletion_width` — pn-junction depletion width & junction capacitance under bias.
  - `drift_conductivity` — drift conductivity σ = q(nμ_n + pμ_p) and resistivity.
  - `hall_effect` — Hall effect V_H/n relation (predict V_H or recover n).
  - `varshni_bandgap` — Varshni temperature dependence Eg(T) = Eg0 − αT²/(T+β).
- PROOF L295: `    Eg = Eg0_eV - alpha_eV_per_K * T * T / (T + beta_K)`

### /home/user/jarvis-app/underworld/server/services/methods_crystallography.py (303 lines)
- purpose: Real crystallography & solid-state methods (lattice geometry, packing/density, XRD, structure-factor absences, atomic density, Schmid plasticity) verified against known/exact values.
- public functions (8 + helpers):
  - `cubic_d_spacing` — cubic interplanar spacing d_hkl = a/√(h²+k²+l²).
  - `atomic_packing_factor` — APF for SC/BCC/FCC from hard-sphere geometry.
  - `theoretical_density` — theoretical X-ray density ρ = nA/(Vc·NA).
  - `bragg_angle` — Bragg's law diffraction angle (reachability check).
  - `structure_factor_allowed` — systematic-absence selection rules for SC/BCC/FCC.
  - `cubic_interplanar_angle` — angle between two cubic planes from index dot product.
  - `linear_planar_density` — linear & planar atomic density on close-packed direction/plane.
  - `schmid_resolved_shear` — Schmid's law resolved shear stress τ = σ·cosφ·cosλ.
  - `max_schmid_factor` — analytic maximum Schmid factor (0.5).
  - `allowed_reflections` — enumerate allowed (hkl) up to a small index range.
- PROOF L298: `    for h, k, l in product(rng, rng, rng):`

### /home/user/jarvis-app/underworld/server/services/methods_engineering.py (304 lines)
- purpose: Real engineering methods (control, transfer functions, signal processing, heat transfer, fluids, structural, thermodynamics, vibration) from canonical formulae verified against known values; uses scipy.signal.
- public functions (8):
  - `pid_step_response` — closed-loop PID step response, settling & steady-state error.
  - `second_order_response` — 2nd-order underdamped percent overshoot & peak time.
  - `butterworth_lowpass` — nth-order Butterworth low-pass magnitude (−3 dB at cutoff).
  - `fin_heat_transfer` — straight rectangular fin temperature/efficiency (insulated tip).
  - `pipe_flow_head_loss` — Darcy-Weisbach head loss & Reynolds-number regime.
  - `euler_buckling_load` — Euler critical buckling load Pcr = π²EI/(KL)².
  - `rankine_cycle_efficiency` — Carnot & 1st-law cycle efficiency with Carnot bound check.
  - `spring_mass_frequency` — undamped/damped spring-mass natural frequency.
- PROOF L291: `    wn = np.sqrt(k / m)`

### /home/user/jarvis-app/underworld/server/services/methods_agronomy.py (305 lines)
- purpose: Real agronomy & plant-science methods (ET0, photosynthesis, radiation-use efficiency, GDD, soil water, N mineralization, crop growth, canopy light) verified against known/textbook values.
- public functions (8):
  - `penman_monteith_et0` — FAO-56 Penman-Monteith reference evapotranspiration.
  - `leaf_light_response` — non-rectangular hyperbola leaf CO2 assimilation light response.
  - `light_use_efficiency_biomass` — Monteith radiation-use-efficiency biomass & yield.
  - `growing_degree_days` — daily/accumulated growing-degree-day accumulation.
  - `soil_water_balance` — root-zone total/readily available water (FAO-56).
  - `nitrogen_mineralization` — Stanford-Smith first-order soil N mineralization.
  - `logistic_crop_growth` — Verhulst logistic crop biomass to grain yield via harvest index.
  - `canopy_light_extinction` — Monsi-Saeki Beer's-law canopy light extinction.
- PROOF L292: `    transmitted = I0 * np.exp(-k * lai)`

### /home/user/jarvis-app/underworld/server/services/methods_signal.py (305 lines)
- purpose: Real signal-processing & information-theory methods (sampling, channel capacity, entropy, convolution, autocorrelation, RC filter, Hamming coding, ADC SNR) verified against known/exact values; avoids the FFT helpers.
- public functions (8 + hamming74_encode):
  - `nyquist_alias_frequency` — Nyquist-Shannon aliased (apparent) frequency.
  - `shannon_channel_capacity` — Shannon-Hartley channel capacity C = B·log2(1+SNR).
  - `shannon_entropy` — Shannon entropy of a discrete distribution.
  - `discrete_convolution` — full discrete linear convolution of two sequences.
  - `autocorrelation_period` — dominant period from autocorrelation first peak.
  - `rc_lowpass_response` — RC low-pass cutoff & magnitude/phase response.
  - `hamming74_correct` — Hamming(7,4) single-bit error detect & correct.
  - `hamming74_encode` — Hamming(7,4) encode 4 data bits into a 7-bit codeword.
  - `adc_quantization_snr` — ideal N-bit ADC quantization SNR = 6.02N + 1.76 dB.
- PROOF L293: `    q = full_scale_v / (2 ** n_bits)`

### /home/user/jarvis-app/underworld/server/services/methods_economics.py (310 lines)
- purpose: Real economics & finance methods from canonical formulae verified against known values (TVM, CAPM, equilibrium, Gini, Nash, Black-Scholes, bonds, elasticity).
- public functions (8):
  - `compound_interest_fv` — compound-interest future value & inverse present value.
  - `capm_expected_return` — CAPM expected return E[R] = Rf + β(Rm−Rf).
  - `market_equilibrium` — linear supply/demand equilibrium price & quantity.
  - `gini_coefficient` — Gini income-inequality coefficient.
  - `nash_equilibrium_2x2` — pure-strategy Nash equilibria of a 2×2 game.
  - `black_scholes_delta` — Black-Scholes European option price and delta.
  - `bond_price_ytm` — coupon-bond pricing from yield or YTM from market price.
  - `price_elasticity_demand` — point/arc price elasticity of demand.
- PROOF L296: `    elasticity = pct_q / pct_p`

### /home/user/jarvis-app/underworld/server/services/methods_geodesy.py (315 lines)
- purpose: Real geodesy & GIS methods (spherical/ellipsoidal distance, trilateration, projections, navigation, ECEF) verified against known/exact values; WGS84 constants.
- public functions (8):
  - `haversine_distance` — great-circle distance via the haversine formula.
  - `vincenty_distance` — Vincenty inverse ellipsoidal geodesic distance (WGS84).
  - `trilateration` — position from ≥3 anchors & ranges by linearized least squares.
  - `mercator_projection` — spherical Mercator forward projection with inverse round-trip.
  - `utm_zone` — UTM longitudinal zone number & hemisphere (Norway/Svalbard exceptions).
  - `initial_bearing` — initial great-circle bearing/azimuth between two points.
  - `cross_track_distance` — signed cross-track distance to a great-circle path.
  - `geodetic_to_ecef` — geodetic↔ECEF (X,Y,Z) conversion with closed-form inverse.
- PROOF L301: `        lat_rad = math.atan2(Z + ep2 * b * math.sin(theta) ** 3,`

### /home/user/jarvis-app/underworld/server/services/methods_immunology.py (316 lines)
- purpose: Real immunology & virology methods (within-host viral dynamics, binding thermodynamics, immune kinetics, vaccination thresholds, dose-response, serology, final-size, clonal expansion) verified against known/analytic values; keyword route table.
- public functions (8 + route):
  - `within_host_viral_dynamics` — target-cell-limited within-host viral ODE model & R0.
  - `antibody_binding_fraction` — 1:1 mass-action antibody-antigen fraction bound.
  - `immune_response_logistic` — logistic effector-cell clonal expansion.
  - `herd_immunity_threshold` — herd-immunity coverage pc = 1 − 1/R0.
  - `dose_response_hill` — Hill sigmoidal dose-response / EC50 (LD50).
  - `neutralization_titer` — serial-dilution neutralizing endpoint titer (NT50).
  - `epidemic_final_size` — Kermack-McKendrick SIR final-size attack rate.
  - `clonal_expansion` — exponential lymphocyte clonal expansion N(t)=N0·2^(t/td).
  - `route` — maps a keyword to the appropriate method.
- PROOF L311: `    kw = keyword.lower().strip()`

### /home/user/jarvis-app/underworld/server/services/methods_linguistics.py (435 lines)
- purpose: Real computational-linguistics / NLP & information-theory methods (real named algorithms) verified against known ground-truth values; uses numpy/collections; keyword route table.
- public functions (8 + route + tokenizer):
  - `zipf_law_fit` — Zipf's-law rank-frequency log-log slope fit.
  - `ngram_perplexity` — add-k smoothed n-gram language-model perplexity.
  - `tfidf_weights` — TF-IDF term weighting over a small corpus.
  - `levenshtein_distance` — dynamic-programming Levenshtein edit distance.
  - `cosine_similarity_bow` — bag-of-words cosine similarity.
  - `char_entropy` — first-order Shannon character entropy (bits/char).
  - `heaps_law_fit` — Heaps'-law vocabulary-growth exponent fit V = K·N^β.
  - `bleu_score` — sentence-level BLEU n-gram overlap with brevity penalty.
  - `route` — resolves a keyword to its method function.
- PROOF L378: `        cand_grams = Counter(tuple(cand[i:i + k]) for i in range(len(cand) - k + 1))`

### /home/user/jarvis-app/underworld/server/services/methods_hydrology.py (317 lines)
- purpose: Real surface-hydrology methods (rational method, SCS curve number, Manning, pipe head loss, Kirpich, unit hydrograph, reservoir routing, Thornthwaite) verified against known/exact values; surface water only.
- public functions (8):
  - `rational_method_peak_flow` — Rational-method peak runoff Q = CiA.
  - `scs_curve_number_runoff` — SCS curve-number direct-runoff depth.
  - `manning_channel_flow` — Manning uniform open-channel velocity & discharge + Froude.
  - `pipe_head_loss` — Darcy-Weisbach (Swamee-Jain) & Hazen-Williams pipe head loss.
  - `kirpich_time_of_concentration` — Kirpich catchment time of concentration (SI).
  - `unit_hydrograph_convolution` — direct-runoff hydrograph by unit-hydrograph convolution.
  - `reservoir_water_balance` — level-pool reservoir routing storage step.
  - `thornthwaite_pet` — Thornthwaite monthly potential evapotranspiration.
- PROOF L304: `    pos = np.where(T > 0.0, T, 0.0)`

### /home/user/jarvis-app/underworld/server/services/methods_atmoschem.py (325 lines)
- purpose: Real atmospheric-chemistry & climate-forcing methods (Chapman ozone, radiative forcing, GWP, NOx-O3 smog, aerosol optics, Henry's law, LCL, residence time) verified against known values.
- public functions (8 topics; functions):
  - `chapman_ozone_steady_state` — Chapman ozone-oxygen cycle steady-state densities.
  - `chapman_ozone_profile` — Chapman ozone number-density profile and peak altitude.
  - `co2_radiative_forcing` — Myhre CO2 radiative forcing dF = α·ln(C/C0).
  - `global_warming_potential` — pulse-decay absolute & relative GWP.
  - `lifetime_decay` — first-order atmospheric removal C(t)=C0·exp(−t/τ).
  - `nox_o3_photostationary` — Leighton NO-NO2-O3 photostationary O3.
  - `aerosol_optical_depth` — Beer-Bouguer-Lambert aerosol attenuation & Koschmieder visibility.
  - `henry_law_solubility` — Henry's-law dissolved-gas equilibrium C = k_H·P.
  - `lifting_condensation_level` — Espy lifting-condensation-level (cloud base).
  - `atmospheric_residence_time` — steady-state residence time τ = burden/flux.
- PROOF L318: `    tau_units = burden / flux`

### /home/user/jarvis-app/underworld/server/services/methods_nuclear.py (325 lines)
- purpose: NASA-grade nuclear-engineering methods from canonical formulae verified against known published values; CODATA constants & published nuclear masses.
- public functions (8):
  - `k_effective_criticality` — four/six-factor effective multiplication factor & reactivity.
  - `bare_sphere_critical_radius` — bare-sphere critical radius from one-group diffusion buckling.
  - `fission_energy_release` — ~200 MeV/fission total energy from a mass of U-235.
  - `reactor_period` — point-kinetics stable reactor period from reactivity.
  - `radioactive_decay` — decay law + secular-equilibrium daughter activity (Bateman).
  - `gamma_shielding` — gamma attenuation I = I0·B·exp(−μx), HVL/TVL.
  - `radiation_dose_inverse_square` — point-source dose inverse-square scaling.
  - `binding_energy_per_nucleon` — mass-defect binding energy per nucleon.
- PROOF L316: `    mass_defect_u = (protons * M_HYDROGEN_U + neutrons * M_NEUTRON_U`

### /home/user/jarvis-app/underworld/server/services/methods_epidemiology.py (331 lines)
- purpose: Real epidemiology & math-biology methods (SIR/SEIR, reproduction numbers, herd immunity, final size, logistic growth, frequency measures with Wald CIs, doubling time) verified against known/exact values.
- public functions (8):
  - `sir_model` — integrate Kermack-McKendrick SIR model with peak & final size.
  - `reproduction_numbers` — basic R0 = β/γ and effective Rt = R0·s.
  - `herd_immunity_threshold` — herd-immunity threshold H_c = 1 − 1/R0 & vaccination coverage.
  - `final_epidemic_size` — transcendental SIR final-size attack fraction (Brent root).
  - `seir_model` — integrate SEIR model with a latent Exposed compartment.
  - `logistic_growth` — logistic growth of cumulative cases toward carrying capacity.
  - `epidemiologic_measures` — CFR/incidence/prevalence with Wald confidence intervals.
  - `doubling_time` — exponential growth rate & doubling time from log-linear fit.
- PROOF L319: `    T_d = math.log(2.0) / r if r != 0.0 else float("inf")`

### /home/user/jarvis-app/underworld/server/services/methods_statmech.py (332 lines)
- purpose: Real statistical-thermodynamics methods from canonical formulae verified against known published values; CODATA constants via scipy.constants.
- public functions (8):
  - `boltzmann_distribution` — two-level Boltzmann population ratio n_u/n_l.
  - `partition_function` — two-level partition function Z and average energy.
  - `heat_capacity_solid` — Einstein/Debye molar heat capacity (Dulong-Petit limit).
  - `entropy_microstates` — Boltzmann entropy S = k·ln(W).
  - `equipartition_energy` — equipartition energy ½kT per quadratic DOF.
  - `stefan_boltzmann_power` — Planck-integrated blackbody power & σ from first principles.
  - `fermi_bose_occupancy` — Fermi-Dirac vs Bose-Einstein vs Maxwell-Boltzmann occupancy.
  - `maxwell_boltzmann_speed` — Maxwell-Boltzmann mean/most-probable/RMS speeds.
- PROOF L289: `    fd = 1.0 / (np.exp(x) + 1.0)`

### /home/user/jarvis-app/underworld/server/services/methods_pharmacology.py (334 lines)
- purpose: Real pharmacology & toxicology methods (two-compartment PK, PK parameters, dosing, PK-PD, therapeutic index, saturable elimination, probit LD50) verified against known published values; route aliases.
- public functions (8 + aliases):
  - `two_compartment_pk` — IV-bolus two-compartment biexponential plasma decline.
  - `pk_parameters` — clearance, volume of distribution, elimination half-life.
  - `loading_dose` — loading dose = Css·Vd/(F·S).
  - `steady_state` — repeated-dosing steady state & accumulation ratio.
  - `therapeutic_index` — therapeutic index TI = TD50/ED50 & margin of safety.
  - `emax_pkpd` — sigmoid Hill/Emax PK-PD concentration-effect.
  - `michaelis_menten_elimination` — saturable Michaelis-Menten elimination kinetics.
  - `probit_ld50` — probit dose-response LD50 (probit=5 at 50%).
  - aliases: `clearance`/`half_life`/`volume_of_distribution`=pk_parameters, `pkpd`=emax_pkpd, `michaelis_elimination`, `probit`/`ld50`=probit_ld50.
- PROOF L312: `    probit = 5.0 + stats.norm.ppf(frac[mask])`

### /home/user/jarvis-app/underworld/server/services/methods_polymer.py (347 lines)
- purpose: Real polymer & soft-matter physics methods from canonical formulae/scaling laws verified against known published values; CODATA constants & WLF/Flory constants.
- public functions (8):
  - `radius_gyration` — ideal-chain radius of gyration Rg = √(N/6)·b.
  - `flory_radius` — self-avoiding good-solvent chain size R = b·N^ν.
  - `mark_houwink` — Mark-Houwink-Sakurada intrinsic viscosity [η] = K·M^a.
  - `flory_huggins` — Flory-Huggins free energy of mixing & critical χ_c.
  - `rubber_elastic` — affine-network rubber elasticity nominal stress.
  - `wlf_shift` — Williams-Landel-Ferry time-temperature superposition shift factor.
  - `reptation_diffusion` — de Gennes reptation diffusion D = D0·N^−2.
  - `glass_transition` — Fox-equation blend glass transition temperature.
- PROOF L301: `    d = d0 * float(segments) ** (-2.0)`

### /home/user/jarvis-app/underworld/server/services/methods_geotechnical.py (351 lines)
- purpose: Real geotechnical & soil-mechanics methods (bearing capacity, earth pressure, effective stress, seepage, consolidation, shear strength, slope stability, phase relations) verified against known/exact values.
- public functions (8 + consolidation_time_factor):
  - `terzaghi_bearing_capacity` — Terzaghi general bearing-capacity equation with N-factors.
  - `rankine_earth_pressure` — Rankine active/passive earth-pressure coefficients & thrusts.
  - `effective_stress` — Terzaghi effective stress in a layered column.
  - `darcy_seepage` — 1-D Darcy seepage velocity & flow through soil.
  - `consolidation_settlement` — Terzaghi 1-D primary consolidation settlement.
  - `consolidation_time_factor` — Terzaghi time factor Tv from U or elapsed time.
  - `mohr_coulomb_strength` — Mohr-Coulomb shear strength τ_f = c + σ'·tanφ.
  - `infinite_slope_fos` — infinite-slope translational factor of safety.
  - `soil_phase_relations` — void ratio/porosity/unit weights/relative density.
- PROOF L332: `        e = porosity / (1.0 - porosity)`

### /home/user/jarvis-app/underworld/server/services/methods_cs_ai.py (353 lines)
- purpose: Real CS/AI in-world simulation methods (real named algorithms) verified against known ground-truth values; uses numpy/scipy/sklearn/networkx; exposes a METHODS dict.
- public functions (8 topics; 9 functions):
  - `dijkstra_shortest_path` — Dijkstra single-source shortest path (cross-checked vs networkx).
  - `shannon_entropy` — Shannon entropy in bits (cross-checked vs scipy).
  - `kmeans_clustering` — Lloyd's k-means clustering purity/inertia on blobs.
  - `random_forest_accuracy` — random-forest held-out accuracy on a separable set.
  - `huffman_coding` — Huffman optimal prefix code within Shannon bound.
  - `pagerank` — Brin-Page PageRank stationary distribution.
  - `edit_distance` — Levenshtein (Wagner-Fischer) DP edit distance.
  - `knapsack_01` — 0/1 knapsack dynamic-programming optimum.
  - `gradient_descent_regression` — batch gradient-descent linear regression recovering a slope.
- PROOF L313: `def gradient_descent_regression(true_slope: float = 2.0, true_intercept: float = 1.0,`

### /home/user/jarvis-app/underworld/server/services/methods_metallurgy.py (358 lines)
- purpose: Real metallurgy & welding methods each verifiable against a known value; keyword route table.
- public functions (8 topics; functions + route):
  - `carbon_equivalent_iiw` — IIW carbon equivalent & preheat/weldability.
  - `rosenthal_temperature` — Rosenthal 3-D moving point-heat-source temperature.
  - `cooling_time_t85` — weld t8/5 cooling time (3-D thick plate).
  - `heat_input` — net arc heat input Q = ηUI/v.
  - `hollomon_jaffe` — Hollomon-Jaffe / Larson-Miller tempering parameter.
  - `scheil_segregation` — Scheil-Gulliver non-equilibrium microsegregation.
  - `avrami_jmak` — JMAK transformed fraction kinetics & half-time.
  - `avrami_time_for_fraction` — invert JMAK for time to reach fraction X.
  - `ideal_critical_diameter` — Grossmann ideal critical diameter D_I (ASTM A255).
  - `hall_petch_yield` — Hall-Petch grain-size yield strengthening.
  - `route` — returns the function matching a keyword.
- PROOF L318: `    sigma_y = sigma_0 + k_y / math.sqrt(grain_size_m)`

### /home/user/jarvis-app/underworld/server/services/methods_control.py (364 lines)
- purpose: Real control-systems / control-theory methods (transient response, PID, Routh-Hurwitz, poles, Ziegler-Nichols, Bode margins, controllability, Lyapunov) verified against known/exact values; uses scipy.
- public functions (8):
  - `second_order_step_metrics` — underdamped 2nd-order overshoot/peak/settling/rise times.
  - `pid_closed_loop_response` — PID closed-loop simulation of a first-order plant.
  - `routh_hurwitz` — Routh-Hurwitz stability test & RHP-root count.
  - `pole_damping` — damping ratio & natural frequency per closed-loop pole.
  - `ziegler_nichols_tuning` — Ziegler-Nichols ultimate-gain PID tuning rules.
  - `bode_margins` — Bode gain & phase margins of an open-loop transfer function.
  - `state_space_controllability` — discrete state-space propagation & Kalman controllability.
  - `lyapunov_stability` — continuous Lyapunov-equation stability certificate.
- PROOF L351: `    P = linalg.solve_continuous_lyapunov(Am.T, -Qm)`

### /home/user/jarvis-app/underworld/server/services/methods_neuro.py (364 lines)
- purpose: Computational-neuroscience methods from canonical models verified against known textbook values/qualitative laws; HH integrator helper.
- public functions (8 + _hh_simulate helper):
  - `lif_neuron` — leaky integrate-and-fire firing rate & rheobase.
  - `fitzhugh_nagumo` — FitzHugh-Nagumo excitable spike vs subthreshold.
  - `cable_length_constant` — passive-cable length constant λ = √(r_m/r_i).
  - `synaptic_epsp_decay` — single-exponential EPSP decay & recovered τ.
  - `stdp_weight_change` — spike-timing-dependent plasticity weight change.
  - `hodgkin_huxley_refractory` — HH paired-pulse refractoriness probe.
  - `population_fi_curve` — sigmoid population firing-rate f-I curve.
  - `resting_membrane_potential` — Nernst & Goldman-Hodgkin-Katz resting potential.
- PROOF L351: `    e_k = rt_f * np.log(k_out / k_in) * 1000.0     # mV`

### /home/user/jarvis-app/underworld/server/services/methods_photovoltaics.py (381 lines)
- purpose: Photovoltaics & solar-energy methods from canonical formulae verified against known published values; CODATA constants & blackbody integrals.
- public functions (8 + helpers/optimum):
  - `thermal_voltage` — thermal voltage Vt = kT/q.
  - `solar_cell_iv_curve` — single-diode I-V curve, Isc & Voc.
  - `fill_factor_efficiency` — fill factor FF & efficiency η (with Green check).
  - `shockley_queisser` — detailed-balance SQ efficiency for one bandgap.
  - `shockley_queisser_optimum` — scan bandgaps for SQ-optimum efficiency.
  - `maximum_power_point` — MPPT Pmax/Vmp/Imp from the I-V sweep.
  - `air_mass_irradiance` — Kasten-Young air mass & clear-sky irradiance.
  - `voc_temperature_coeff` — Voc temperature coefficient dVoc/dT.
  - `series_shunt_resistance` — fill factor with series/shunt resistance.
  - `bandgap_wavelength` — photon energy ↔ wavelength Eg = 1239.84/λ.
- PROOF L372: `        lam = HC_EV_NM / bandgap_ev`

### /home/user/jarvis-app/underworld/server/services/methods_qcomputing.py (397 lines)
- purpose: Real quantum-computing state-vector simulations of textbook algorithms verified against known analytic values; numpy unitary/measurement helpers.
- public functions (8 + helpers):
  - `single_qubit_gates` — apply X/H/Z to |0> and report state/probabilities.
  - `bell_state` — build a Bell state & measure Z-basis correlations.
  - `grover_search` — Grover amplitude amplification for a marked item.
  - `quantum_fourier_transform` — build the QFT and verify unitarity.
  - `deutsch_jozsa` — Deutsch-Jozsa constant-vs-balanced oracle test.
  - `entanglement_entropy` — von Neumann entropy of a reduced density matrix.
  - `chsh_inequality` — CHSH correlator reaching the Tsirelson bound.
  - `phase_estimation` — quantum phase estimation recovering a known phase.
- PROOF L378: `    counting = np.ones(Nc, dtype=complex) / np.sqrt(Nc)`

### /home/user/jarvis-app/underworld/server/services/methods_robotics.py (431 lines)
- purpose: Real robotics & kinematics methods from canonical formulae/algorithms verified against known values; uses numpy/heapq.
- public functions (8 + helpers/optimum):
  - `two_link_forward_kinematics` — planar 2R arm forward kinematics.
  - `two_link_inverse_kinematics` — geometric 2R inverse kinematics with FK round-trip.
  - `two_link_jacobian` — 2R velocity Jacobian & singularity analysis.
  - `pd_joint_control` — PD setpoint regulation of a 2nd-order joint.
  - `differential_drive_odometry` — exact unicycle dead-reckoning odometry.
  - `astar_grid_path` — A* shortest path on a 4/8-connected grid.
  - `projectile_range` — ballistic projectile range/flight-time/max-height.
  - `projectile_optimal_angle` — scan launch angles for maximum range.
  - `homogeneous_transform` — SO(2)/SE(2) rotation & homogeneous-transform composition.
- PROOF L405: `    a1, a2 = np.radians(angle1_deg), np.radians(angle2_deg)`

### /home/user/jarvis-app/underworld/server/services/sim_methods.py (421 lines)
- purpose: Library of distinct CRISPR-depth scientific simulations (real named methods) verified against known physical results; the deep-method base the field router draws on.
- public functions (24):
  - `ising_2d` — 2D Ising Metropolis Monte Carlo phase transition.
  - `double_pendulum` — chaotic double pendulum (RK4) Lyapunov sensitivity.
  - `wave_1d` — 1D wave equation FDTD propagation.
  - `hodgkin_huxley` — Hodgkin-Huxley action-potential spiking.
  - `brusselator` — Brusselator autocatalytic chemical oscillator.
  - `decay_chain` — radioactive decay N(t)=N0·exp(−λt) half-life check.
  - `blackbody` — Planck/Wien blackbody peak wavelength.
  - `logistic_map` — logistic-map period-doubling route to chaos.
  - `tight_binding_1d` — 1D tight-binding band structure (width 4t).
  - `percolation_2d` — 2D site percolation spanning-cluster transition.
  - `genetic_algorithm` — genetic algorithm (selection/crossover/mutation).
  - `game_of_life` — Conway's Game of Life blinker oscillator.
  - `energy_balance_climate` — zero-D energy-balance climate model.
  - `fft_spectral` — FFT recovery of a multi-tone signal's frequencies.
  - `markov_stationary` — Markov stationary distribution by power iteration.
  - `schrodinger_1d` — 1D Schrödinger harmonic-oscillator eigenvalues.
  - `random_walk_diffusion` — Brownian random-walk MSD ∝ t.
  - `black_scholes` — Black-Scholes analytic vs Monte-Carlo option pricing.
  - `neural_xor` — MLP learns XOR via backpropagation.
  - `schelling` — Schelling segregation agent-based model.
  - `upgma` — UPGMA phylogenetic tree from a distance matrix.
- PROOF L327: `    analytic = S*N(d1) - K*exp(-r*T)*N(d2)`

### /home/user/jarvis-app/underworld/server/services/field_science.py (435 lines)
- purpose: Per-FIELD real-science router — maps each of ~198 taxonomy fields (by keywords) to a genuine engine that runs a real computation and returns real data plus a quality score; falls back to a real statistics computation and the methods_registry before a fake.
- public functions (engines + router):
  - per-cluster engine functions (`_genetics`, `_protein`, `_chemistry`, `_quantum_chem`, `_quantum_phys`, `_thermo_md`, `_fluids`, `_structural`, `_electrical`, `_astro`, `_maths`, `_computing`, `_epidemiology`, `_ecology`, `_economics`, `_acoustics`, `_navigation`, and ~26 sim_methods-backed wrappers like `_ising`/`_chaos`/`_waves`/`_neuro`/`_finance`/`_ml`/`_social`/`_phylogenetics`/`_aerospace`, plus `_stats_fallback`) — each returns (summary, data, quality).
  - `engine_for(field)` — keyword-routes a field to its engine (else `_stats_fallback`).
  - `simulate(field, *, seed)` — runs the field-appropriate simulation (trying methods_registry before the statistics fallback) and returns a grounded result dict with quality in [0,1].
- PROOF L412: `def simulate(field: str, *, seed: int = 0) -> dict:`

### /home/user/jarvis-app/underworld/server/services/methods_registry.py (586 lines)
- purpose: Unified registry wiring the ~65 benchmark-verified method modules (across 7 "fleets") into one keyword→callable ROUTES table so the field router can reach any of them; each call returns a real computed, individually-verified result.
- public functions (lookup + run; plus the ROUTES table & imports):
  - `ROUTES` — ordered list of (keyword-substring tuple, callable) mappings spanning physics/chemistry/biology/materials/earth/engineering/math/CS and fleets 2-7 (quantum, optics, fluids, electronics, astronomy, geology, ecology, economics, medicine, neuro, agronomy, acoustics, robotics, crypto, statmech, immunology, ocean, metallurgy, qcomputing, linguistics, geodesy, nuclear, polymer, atmoschem, plasma, photovoltaics, foodscience, biomechanics, forestry, hydrogeology, pharmacology, veterinary, seismology, control, electrochem, spectroscopy, heattransfer, signal, crystallography, epidemiology, tribology, combustion, aerodynamics, structural, semiconductor, geotechnical, hydrology, RF).
  - `lookup(field)` — first-match keyword resolution of a field to a registered callable.
  - `run(field, *, seed)` — invoke the matched method with safe numeric defaults and return a normalised result dict (quality 0.95), or None if no match.
- PROOF L564: `    fn = lookup(field)`

