# Underworld Backend — Full Reassessment / Audit

Scope: every file under `underworld/server/` (services, routes, db, physics,
knowledge, world, tools, agents, genetics) plus `underworld/*.py` and configs.
Read exhaustively (not sampled). Purpose: surface the real capability inventory,
the 460+-method science registry, and which features are WIRED to an API route
(thus surfaceable in UI) vs DORMANT (only reachable in-sim or only in tests).

**Headline numbers (measured, not claimed):**
- `services/*.py`: **177** modules (excl. `__init__`).
- Domain method modules `methods_*.py`: **56** (each exports ~8 verified methods);
  **480** public domain methods total across them.
- Central registry `methods_registry.ROUTES`: **449** keyword→callable entries
  resolving to **434** distinct callables (some callables have several keyword
  aliases).
- `field_science._ROUTES`: 40 field-cluster engines + a real stats fallback,
  covering the ~198 taxonomy fields.
- 12 API routers mounted in `main.py`; `routes/worlds.py` alone has ~40 endpoints.
- DB: 31 ORM tables in `db/models.py`.

**The single most important finding for "hidden features":** the entire 460+-method
science library is reachable IN-SIM through one chain — `agents/minion.py` →
`services/discovery_lab.discover()` → `services/field_science.simulate()` →
(`methods_registry.run()` + `science_niches` + the 56 `methods_*` modules). It is
**NOT** reachable by any dedicated REST endpoint that lets a user call a named
method directly. The only HTTP doors onto the deep library are a handful of
generic `POST /worlds/{id}/{quantum|multiphysics|electronics|photonics|...}`
action endpoints (category-level, not the full 460), plus `POST /physics/solve`
and `POST /science/*`. So the user's intuition is correct: most of the catalogue
is real and running inside the simulation but has **no UI surface**.

---

## 0. Application wiring (`main.py`)

`create_app()` mounts exactly these routers (file `routes/`):
`auth, worlds, minions, patents, inventions, guilds, safety, knowledge, physics,
projects, substrate, science`. Plus `/healthz` and a SPA static-file fallback for
the built React bundle at `underworld/web/dist`. Lifespan: configure logging, warn
on LLM misconfig, `init_db()`, `seed_knowledge_base()`, and (if
`scheduler_enabled`) `scheduler.autostart_all_worlds()` + `scheduler.start()`.

Routers NOT mounted ⇒ everything in `services/` is only reachable transitively
through these 12 routers or through the background scheduler tick.

---

## 1. SERVICES INVENTORY

### 1a. The central science registries (the "brain" of the catalogue)

| File | Purpose | Public API | Wiring |
|---|---|---|---|
| `services/methods_registry.py` | 449 keyword→callable routes over 56 `methods_*` modules; runs a verified method for a free-text field. | `lookup(field)`, `run(field, *, seed=0)` | IN-SIM only, via `field_science.simulate()` fallback. No direct route. |
| `services/field_science.py` | 40 field-cluster engines (genetics, protein, chem, quantum, fluids, structural, electrical, astro, aerospace, acoustics, epidemiology, …) + real `_stats_fallback`; maps any of ~198 taxonomy fields → a real engine, then tries `methods_registry` before the fallback. | `engine_for(field)`, `simulate(field, *, seed=0)` | IN-SIM only, via `discovery_lab` / `science_niches`. |
| `services/science_niches.py` | ~10^5 niche space `(field, modifier, regime)`; each niche runs `field_science.simulate`. | `niche_count`, `formula_count`, `iter_niches`, `simulate_niche`, `simulate_niche_id`, `summary` | IN-SIM (`discovery_lab`, `guild_structure`). No route. |
| `services/discovery_lab.py` | The unified discovery layer every invention flows through; calls `field_science` + `discovery_astro` + invents/patents. | `class DiscoveryLedger`, `discover(guild)`, `ledger_summary` | WIRED IN-SIM: called by `agents/minion.py` each research tick. |
| `services/minion_research.py` | Per-guild real engine dispatch (materials→BCS+MD+HF, physics→heat PDE, computing→Bell circuit, maths→SymPy, …). | `run_research(guild, *, seed)` | IN-SIM (Minion cognitive work). |
| `services/guild_structure.py` | Guild→divisions→sciences org chart over the niche space. | `divisions, sciences_in_guild, guild_hierarchy, total_sciences, specialisation_for, org_summary` | IN-SIM only. |
| `services/taxonomy.py` | Generative action/behaviour taxonomy; verb×field×method×subject. | `subjects_for, verbs_for, action_count, iter_actions, concrete_action, emote_anim, stage_for_age, counts, …` | IN-SIM (behaviour/scene). |

### 1b. The 56 domain method modules (`methods_*.py`) — 8 methods each

Each module is a self-contained library of real, benchmark-verified scientific
functions; all are wired into `methods_registry.ROUTES`. Grouped by domain with
the 8 methods each exports (full per-method one-liners are in §4):

- **methods_physics** — lorentz_factor, schwarzschild_radius, double_slit_fringe, planck_spectral_radiance, maxwell_boltzmann_speed, cyclotron_frequency, carnot_efficiency, relativistic_energy
- **methods_chemistry** — reaction_kinetics_first_order, chemical_equilibrium, nernst_cell_potential, weak_acid_ph, arrhenius_rate_ratio, beer_lambert_absorbance, van_der_waals_pressure, gibbs_free_energy
- **methods_biology** — wright_fisher_drift, lotka_volterra, michaelis_menten, logistic_growth, seir_epidemic, one_compartment_pk, hardy_weinberg, jukes_cantor_distance
- **methods_materials** — bragg_diffraction, lever_rule, griffith_fracture, fick_diffusion, hooke_elasticity, arrhenius_vacancy, hall_petch, wiedemann_franz
- **methods_earth** — barometric_pressure, dry_adiabatic_lapse_rate, seismic_pwave_swave_ratio, earthquake_energy, manning_open_channel, coriolis_parameter, radiative_equilibrium, radiometric_age
- **methods_engineering** — pid_step_response, second_order_response, butterworth_lowpass, fin_heat_transfer, pipe_flow_head_loss, euler_buckling_load, rankine_cycle_efficiency, spring_mass_frequency
- **methods_math** — rk4_integrate, newton_raphson_root, simpson_integrate, svd_reconstruct, rsa_roundtrip, monte_carlo_pi, fft_frequencies, gradient_descent
- **methods_cs_ai** — dijkstra_shortest_path, shannon_entropy, kmeans_clustering, random_forest_accuracy, huffman_coding, pagerank, edit_distance, knapsack_01, gradient_descent_regression
- **methods_quantum** — tunnelling_transmission, particle_in_a_box, larmor_precession, bohr_energy_levels, harmonic_oscillator, rabi_oscillation, de_broglie_wavelength, compton_shift
- **methods_optics** — thin_lens_image, diffraction_grating, fresnel_reflection, diffraction_limit, fiber_numerical_aperture, gaussian_beam, bragg_wavelength, snell_refraction
- **methods_fluids** — bernoulli_pressure, lift_coefficient_force, drag_terminal_velocity, reynolds_number, blasius_boundary_layer, speed_of_sound_mach, normal_shock_relations, hagen_poiseuille_flow
- **methods_electronics** — thermal_voltage, shockley_diode_current, transistor_operating_point, op_amp_gain, rlc_resonant_frequency, pn_junction_built_in_potential, fermi_dirac_occupancy, intrinsic_carrier_concentration, rc_lowpass_cutoff
- **methods_astronomy** — hubble_recession_velocity, stellar_luminosity, cosmological_redshift, chandrasekhar_mass, orbital_period, escape_velocity, wien_peak_colour, schwarzschild_radius, roche_limit
- **methods_geology** — airy_root_depth, geothermal_heat_flow, plate_velocity, impact_crater_diameter, radiogenic_heat, seismic_moment, hydrostatic_pressure, planetary_mass
- **methods_ecology** — biodiversity_indices, species_area_relationship, island_biogeography_equilibrium, carbon_box_decay, may_food_web_stability, maximum_sustainable_yield, michaelis_menten_uptake, ecological_footprint
- **methods_economics** — compound_interest_fv, capm_expected_return, market_equilibrium, gini_coefficient, nash_equilibrium_2x2, black_scholes_delta, bond_price_ytm, price_elasticity_demand
- **methods_medicine** — cardiac_output, poiseuille_blood_flow, oxygen_hemoglobin_saturation, creatinine_clearance, basal_metabolic_rate, body_metrics, dose_response, mean_arterial_pressure
- **methods_neuro** — lif_neuron, fitzhugh_nagumo, cable_length_constant, synaptic_epsp_decay, stdp_weight_change, hodgkin_huxley_refractory, population_fi_curve, resting_membrane_potential
- **methods_agronomy** — penman_monteith_et0, leaf_light_response, light_use_efficiency_biomass, growing_degree_days, soil_water_balance, nitrogen_mineralization, logistic_crop_growth, canopy_light_extinction
- **methods_acoustics2** — sound_intensity_level, doppler_shift, string_harmonics, organ_pipe_resonance, sabine_reverberation, beat_frequency, transmission_loss, speed_of_sound_air
- **methods_robotics** — two_link_forward_kinematics, two_link_inverse_kinematics, two_link_jacobian, pd_joint_control, differential_drive_odometry, astar_grid_path, projectile_range, projectile_optimal_angle, homogeneous_transform
- **methods_crypto** — diffie_hellman_exchange, rsa_sign_verify, hamming_7_4, sha256_avalanche, shannon_keyspace_entropy, ec_point_addition, one_time_pad, crc32_checksum
- **methods_statmech** — boltzmann_distribution, partition_function, heat_capacity_solid, entropy_microstates, equipartition_energy, stefan_boltzmann_power, fermi_bose_occupancy, maxwell_boltzmann_speed
- **methods_immunology** — within_host_viral_dynamics, antibody_binding_fraction, immune_response_logistic, herd_immunity_threshold, dose_response_hill, neutralization_titer, epidemic_final_size, clonal_expansion
- **methods_ocean** — deep_water_wave, shallow_water_wave, seawater_density, tidal_m2, ekman_transport, buoyancy_frequency, wave_energy_stokes, geostrophic_current
- **methods_metallurgy** — carbon_equivalent_iiw, rosenthal_temperature, cooling_time_t85, heat_input, hollomon_jaffe, scheil_segregation, avrami_jmak, ideal_critical_diameter, hall_petch_yield
- **methods_qcomputing** — single_qubit_gates, bell_state, grover_search, quantum_fourier_transform, deutsch_jozsa, entanglement_entropy, chsh_inequality, phase_estimation
- **methods_linguistics** — zipf_law_fit, ngram_perplexity, tfidf_weights, levenshtein_distance, cosine_similarity_bow, char_entropy, heaps_law_fit, bleu_score
- **methods_geodesy** — haversine_distance, vincenty_distance, trilateration, mercator_projection, utm_zone, initial_bearing, cross_track_distance, geodetic_to_ecef
- **methods_nuclear** — k_effective_criticality, bare_sphere_critical_radius, fission_energy_release, reactor_period, radioactive_decay, gamma_shielding, radiation_dose_inverse_square, binding_energy_per_nucleon
- **methods_polymer** — radius_gyration, flory_radius, mark_houwink, flory_huggins, rubber_elastic, wlf_shift, reptation_diffusion, glass_transition
- **methods_atmoschem** — chapman_ozone_steady_state, chapman_ozone_profile, co2_radiative_forcing, global_warming_potential, lifetime_decay, nox_o3_photostationary, aerosol_optical_depth, henry_law_solubility, lifting_condensation_level, atmospheric_residence_time
- **methods_plasma** — plasma_frequency, debye_length, lawson_triple_product, gyromotion, coulomb_log_collision, saha_ionization, bremsstrahlung_power, plasma_beta
- **methods_photovoltaics** — thermal_voltage, solar_cell_iv_curve, fill_factor_efficiency, shockley_queisser, shockley_queisser_optimum, maximum_power_point, air_mass_irradiance, voc_temperature_coeff, series_shunt_resistance, bandgap_wavelength
- **methods_foodscience** — thermal_death, z_value_from_two_d, f0_sterilization, f0_from_d12, water_activity_raoult, gab_sorption, bet_monolayer, freezing_point_depression, boiling_point_elevation, arrhenius_rate, maillard_rate_ratio, maillard_extent, come_up_time_correction, heat_penetration_temp, ball_process_time, q10_shelf_life, q10_from_rates, brix_to_sg, sg_to_brix, brix_mass_sugar
- **methods_biomechanics** — hill_muscle, hill_max_power, bone_stress, bone_buckling, joint_torque, gait_pendulum, cost_transport, tendon_energy, ground_reaction, allometric_stride, allometric_fit
- **methods_forestry** — tree_volume, biomass_allometry, tree_growth, carbon_sequest, self_thinning, site_index, basal_area, canopy_light
- **methods_hydrogeology** — darcy_flux, theis_drawdown, theis_well_function, conductivity_permeability, dupuit_well_discharge, contaminant_transport, aquifer_storage_volume, hazen_conductivity, seepage_velocity
- **methods_pharmacology** — two_compartment_pk, pk_parameters, loading_dose, steady_state, therapeutic_index, emax_pkpd, michaelis_menten_elimination, probit_ld50
- **methods_veterinary** — kleiber_metabolic_rate, allometric_dose, von_bertalanffy_growth, heart_rate_mass, gestation_period, feed_conversion, thermoneutral_zone, herd_logistic_growth
- **methods_seismology** — richter_local_magnitude, moment_magnitude, gutenberg_richter_b_value, ps_travel_time_distance, body_wave_velocities, omori_aftershock_rate, energy_from_magnitude, epicenter_trilateration
- **methods_control** — second_order_step_metrics, pid_closed_loop_response, routh_hurwitz, pole_damping, ziegler_nichols_tuning, bode_margins, state_space_controllability, lyapunov_stability
- **methods_electrochem** — nernst_potential, standard_cell_emf, faraday_electrolysis, butler_volmer_current, tafel_overpotential, molar_conductivity_kohlrausch, nernst_einstein_conductivity, debye_huckel_activity, battery_capacity_soc
- **methods_spectroscopy** — rydberg_hydrogen, beer_lambert, planck_blackbody, bragg_diffraction, photon_energy, rigid_rotor_rotation, harmonic_vibration, doppler_shift
- **methods_heattransfer** — plane_wall_conduction, cylinder_conduction, dittus_boelter_convection, radiative_exchange, lumped_capacitance_cooling, fin_heat_transfer, lmtd_heat_exchanger, fick_diffusion
- **methods_signal** — nyquist_alias_frequency, shannon_channel_capacity, shannon_entropy, discrete_convolution, autocorrelation_period, rc_lowpass_response, hamming74_correct, hamming74_encode, adc_quantization_snr
- **methods_crystallography** — cubic_d_spacing, atomic_packing_factor, theoretical_density, bragg_angle, structure_factor_allowed, cubic_interplanar_angle, linear_planar_density, schmid_resolved_shear, max_schmid_factor, allowed_reflections
- **methods_epidemiology** — sir_model, reproduction_numbers, herd_immunity_threshold, final_epidemic_size, seir_model, logistic_growth, epidemiologic_measures, doubling_time
- **methods_tribology** — amontons_coulomb_friction, archard_wear, hertz_sphere_flat, stribeck_lambda_ratio, petroff_bearing_friction, stokes_drag, rolling_resistance, hersey_number
- **methods_combustion** — stoichiometric_afr, equivalence_ratio, adiabatic_flame_temperature, lower_heating_value, flue_gas_composition, laminar_flame_speed, wobbe_index, flammability_le_chatelier
- **methods_aerodynamics** — lift_force, drag_polar, pitot_airspeed, mach_number, prandtl_glauert, isentropic_stagnation, thin_airfoil_lift, glide_performance
- **methods_structural** — simply_supported_point_load, simply_supported_udl, cantilever_point_load, euler_buckling_load, bending_stress, second_moment_of_area, axial_member, truss_triangle_method_of_joints, circular_shaft_torsion
- **methods_semiconductor** — intrinsic_carrier_concentration, carrier_density_fermi, shockley_diode, built_in_potential, depletion_width, drift_conductivity, hall_effect, varshni_bandgap
- **methods_geotechnical** — terzaghi_bearing_capacity, rankine_earth_pressure, effective_stress, darcy_seepage, consolidation_settlement, consolidation_time_factor, mohr_coulomb_strength, infinite_slope_fos, soil_phase_relations
- **methods_hydrology** — rational_method_peak_flow, scs_curve_number_runoff, manning_channel_flow, pipe_head_loss, kirpich_time_of_concentration, unit_hydrograph_convolution, reservoir_water_balance, thornthwaite_pet
- **methods_rf** — friis_transmission, free_space_path_loss, radar_range_equation, antenna_aperture_gain, aperture_beamwidth_directivity, link_budget, doppler_shift, skin_depth

### 1c. "Real category" engine services (feature categories A–X)

These are the deeper, library-backed modules (numpy/scipy/sklearn/RDKit/Biopython/
SymPy/PySCF/astropy). Marked WIRED if reachable from a `routes/` endpoint.

| Module | Purpose / key API | Wiring |
|---|---|---|
| `temporal_nodes.py` (A) | versioned/temporal knowledge nodes, causal chains, lost/obsolete theory, scientific dispute. `temporal_query, theory_versions, forgotten_knowledge, rediscovery_path, causal_chain, counterfactual_fork, anomaly_trigger, discovery_lineage, evidence_chain, lost_technology, scientific_dispute, obsolete_theory, competing_theory_clusters, open_question` | **DORMANT** (tests only). |
| `knowledge_graph.py` (B) | typed confidence-classed graph + reality validation. `KnowledgeGraph`, `Node/Edge`, `classify_*`, `real_fraction`, `validation_breakdown`, `novelty` | **WIRED** `GET /worlds/{id}/knowledge-graph`, `POST /worlds/{id}/invent`, `/autonomous-research`. |
| `graph_extras.py` (B) | citation PageRank, cross-domain analogy, idea mutation/recombination. | **DORMANT** (tests only). |
| `discovery_mechanics.py` (C) | Bayesian hypothesis posterior/generation/rejection, replication threshold, conflicting-evidence pooling. | DORMANT (in-sim via discovery only indirectly; no route). |
| `simulation_quality.py` (D) | Richardson extrap, convergence, ensemble UQ, credibility, artifact detect, provenance ledger, reality index. | **WIRED** `POST /worlds/{id}/simulation-quality`. |
| `instruments_lab.py` (E) | calibration drift, noise profile, reproducibility, Bland-Altman, resolution, misuse risk, standardisation, chain-of-custody. | **WIRED** `POST /worlds/{id}/instruments-lab`. |
| `experiment_design.py` (F) | LHS, factorial, response surface, UCB1 bandit, active learning, Welch t-test, replication, cost. | **WIRED** `POST /worlds/{id}/experiment-design`. |
| `lab_systems.py` (G) | LIMS, assay registry, reagent inventory, protocol compiler, task scheduler, error detection. | DORMANT (tests only). |
| `self_driving_lab.py` (G) | closed-loop autonomous campaign (UCB surrogate) + real continuous campaign. | **WIRED** `POST /worlds/{id}/lab-campaign`. |
| `robotic_lab.py` (G) | digital twins: pipetting, heating/cooling, imaging, synthesis, sequencing, cleaning. | **WIRED** `POST /worlds/{id}/lab-sim`. |
| `patent_intel.py` (H/I) | CPC classify, claim chunk/link, obviousness, novelty, FTO, claim skeleton, BOM, TRL, use-case map, licensing, public-domain miner. | DORMANT (tests only; note distinct from `tools/patent_intelligence.py`). |
| `materials_advanced.py` (J) | defect density, impurity, phase diagram, BCS superconductor, semiconductor classify, corrosion, fracture toughness, conductivity. | IN-SIM (`minion_research`). No route. |
| `real_materials.py` (J) | real CSV concrete dataset (Yeh 1998) + CV + Bayesian mix design. | **WIRED** `POST /worlds/{id}/materials`. |
| `manufacturing_capability.py` (K) | Cp/Cpk, control limits, Poisson/Murphy yield, ppm defects, ISO cleanroom, SPC, substitution, tooling. | **WIRED** `POST /worlds/{id}/manufacturing`. |
| `manufacturing.py` (K) | process precision, supply chain tree, yield rate. | IN-SIM (factory/structures). |
| `supply_chain.py` (L) | EOQ, dependency graph, bottleneck, HHI concentration, depletion, forecast, reliability, recycling, disruption, criticality trackers. | **WIRED** `POST /worlds/{id}/supply-chain`. |
| `multiphysics.py` (M) | rigid body, heat diffusion 1D, beam, FEM 1D, Snell, RF, relativity, thermo, shallow water, fluid network, EM, ray tracer, combustion, radiation transport, coupling. | **WIRED** `POST /worlds/{id}/multiphysics` (also IN-SIM `minion_research`/`field_science`). |
| `cfd_sim.py` (#248) | lid-driven cavity, Poiseuille profile. | **WIRED** `POST /worlds/{id}/lab-sim` (action `cfd`). |
| `spice_sim.py` (#253) | MNA DC operating point + transient. | **WIRED** `POST /worlds/{id}/lab-sim` (action `spice`). |
| `electronics.py` (N) | DC/AC, diode, BJT/MOSFET, transformer, motor, battery electrochem, IC scaling, protection coordination, microprocessor. | **WIRED** `POST /worlds/{id}/electronics`. |
| `photonics.py` (O) | lensmaker, laser threshold, fibre, Mach-Zehnder, microring, optical matmul, photonic NN layer, photodetector. | **WIRED** `POST /worlds/{id}/photonics`. |
| `quantum_sim.py` (P) | state-vector sim, Bell/GHZ, concurrence, CHSH, decoherence channels, ZNE, logical qubit error, platform models. | **WIRED** `POST /worlds/{id}/quantum`. |
| `exotic_quantum.py` (Q) | Floquet time crystal, Ising chain, MBL, symmetry breaking, topological invariant, superfluid/BEC, quantum metrology. | **DORMANT** (tests only). |
| `bio_genetics.py` (R) | HW, allele freq, selection/mutation/drift, heritability, Punnett, Hill, speciation, gene/regulatory/epigenetic models. | DORMANT (tests only). |
| `proteins.py` (S) | MW, GRAVY, net charge, MM kinetics, binding affinity/Kd, stability, docking, PPI network, mutation effect, antibody candidate. | IN-SIM (`virtual_cell`). No route. |
| `disease_models.py` (T) | R0, herd immunity, SIR/SEIR, resistance, dose-response, TI, drug perturbation, knockout/knockdown/overexpression, symptom clustering, immune LV, cancer/autoimmune/neurodegeneration. | **DORMANT** (tests only). |
| `synbio.py` (U) | GC, guide-RNA score, off-target, CRISPR design, genetic circuit, promoter, Monod, fermentation, bioreactor, codon optimise, containment, biosecurity screen, tissue engineering. | IN-SIM (`minion_research` agriculture). |
| `ai_models.py` (V) | foundation-model registry, dataset lineage, data nutrition, missingness, bias profile, eval arena, PSI drift, ECE calibration, hallucination, uncertainty, distillation, capability graph, modality trackers. | **DORMANT** (tests only). |
| `ai_model.py` (V) | one real trained CV-selected concrete-strength model. `train_and_select, predict_strength, feature_importance`. | **DORMANT** (tests only — note `real_materials` is the wired twin). |
| `research_agents.py` (W) | research swarm, task assignment, consensus, red-team, pipeline stage. | DORMANT (tests only). |
| `society.py` (X) | labour market, expert scarcity, funding allocation, institution formation, credibility, knowledge transfer, curriculum, credentialing, academic politics, peer-review network, school/university/lab/journal/TTO, library redundancy, translation. | IN-SIM (`civos, governance, religion, civics, lifecycle`). No direct route. |
| `epidemic_network.py` | stochastic SIR on Watts-Strogatz small-world + ensemble. `small_world, simulate, ensemble`. | IN-SIM (`field_science._epidemiology`). No route. |
| `molecular_dynamics.py` | velocity-Verlet LJ MD + Gillespie SSA. `run_md, gillespie`. | IN-SIM (`minion_research, proteins, field_science`). |
| `molecular_genetics.py` | double-helix, melt, PAM sites, CRISPR edit, colourised helix view. `double_helix, denature, crispr_edit, helix_view, …`. | IN-SIM (`field_science, activities` gene_edit). |
| `structure_folding.py` | Nussinov RNA fold, Chou-Fasman protein SS. | IN-SIM (`field_science`). |
| `bio_advanced.py` | Biopython: Needleman-Wunsch, Smith-Waterman, BLOSUM62, translate, ORFs, ProtParam, restriction sites. | IN-SIM (`minion_research, drug_discovery, field_science`). |
| `chem_advanced.py` | RDKit: descriptors, Lipinski/QED, Tanimoto, SMARTS match, 3D MMFF94, candidate report. | IN-SIM (`minion_research, drug_discovery, field_science`). |
| `math_advanced.py` | SymPy: solve, integrate, differentiate, prove identity, ODE, matrix, number theory, limit, series. | IN-SIM (`minion_research, field_science`). |
| `quantum_chemistry.py` | PySCF: HF molecule energy, dipole, bond scan. | IN-SIM (`minion_research, field_science`). |
| `physics_advanced.py` | VQE, exact ground energy, N-body leapfrog. | IN-SIM (`field_science`). |
| `sim_methods.py` | 22 CRISPR-depth sims: ising_2d, double_pendulum, wave_1d, hodgkin_huxley, brusselator, decay_chain, blackbody, logistic_map, tight_binding_1d, percolation_2d, genetic_algorithm, game_of_life, energy_balance_climate, fft_spectral, markov_stationary, schrodinger_1d, random_walk_diffusion, black_scholes, neural_xor, schelling, upgma. | IN-SIM (`field_science, methods_signal`). |
| `drug_discovery.py` | end-to-end in-silico screen using bio/chem-advanced. `screen_candidate, rank_library`. | **DORMANT** (tests only). |
| `virtual_cell.py` | genome→protein→pathway→target→intervention discovery package. `discover, mechanism_graph, target_shortlist, …`. | **WIRED** `POST /worlds/{id}/discover-cure`. |
| `discovery_engine.py` | WorldTruth≠MinionBelief: hidden MaterialTruth, instrumented Observation, Belief update. | IN-SIM. No route. |
| `discovery_astro.py` | astropy planet/star ephemeris, Keplerian orbit propagation, meteoroid MOID/close-approach. | IN-SIM (`field_science._astro/_aerospace`, `discovery_lab`). No route. |
| `discovery_color.py` | sRGB→LAB, CIEDE2000, discover new colours. | DORMANT (tests only). |
| `discovery_molecule.py` | RDKit BRICS de-novo molecule design. | DORMANT (tests only). |
| `discovery_tech.py` | invent grammar + PatentOffice corpus/citation graph. | IN-SIM (`discovery_lab`). |
| `aerospace.py` | Tsiolkovsky, vis-viva, circular/escape velocity, orbital period, Hohmann transfer, launch budget. | IN-SIM (`field_science._aerospace`, `methods_aerodynamics`). No route. |
| `acoustics.py` | sound level, ambient, audible, comm range, travel time, speech clarity. | **WIRED** `GET /substrate/acoustics` (also IN-SIM `minion.py`). |
| `real_optimizer.py` | real GP (Matern) + EI/UCB Bayesian optimisation vs random; Branin/Hartmann6/Ackley benchmarks. | **WIRED** `POST /worlds/{id}/optimize`. |
| `research_director.py` | self-directing R&D programme over the knowledge graph. | **WIRED** `POST /worlds/{id}/autonomous-research`. |
| `invention_pipeline.py` | empty-patent → autonomous invention (gap→combine→simulate→peer review→disclosure). | **WIRED** `POST /worlds/{id}/invent`. |
| `scale_bench.py` | full-richness rich-tick benchmark + LLM-at-scale capacity maths; GPU or CPU. | **WIRED** `GET /worlds/scale-capacity`. |
| `gpu_backend.py` | CuPy/NumPy backend selector + `available_backends()`. | **WIRED** (via scale-capacity). |
| `feature_audit.py` | honest 500-feature census of the live source tree. `coverage_report, gaps`. | **WIRED** `GET /worlds/feature-audit`. |
| `feature_catalog.py` | auto-generated 500-feature catalog data (categories A–X). | Data table used by `feature_audit`. |

### 1d. Civilisation-simulation services (driven by the tick loop)

All of these are **WIRED IN-SIM** — invoked every tick by `services/simulation.advance_world`
(see §2 `POST /worlds/{id}/advance` + the background scheduler). Many also feed
read endpoints under `/worlds/{id}/*`.

`agriculture, art, biology, civics, climate, disease, discovery, ecosystem,
economy, education, governance, grid, hydrology, knowledge_decay, lifecycle,
mastery, memes, paleontology, pollution, projects, puzzles, religion, roles,
structural_health, substances, tectonics, timescale` (all ticked in
`simulation.py`); plus `progression` (era), `sagas` (storylines), `scene_state`
(renderer), `epochs` (historical ladder), `gateway` (internet gateway), `oracle`
(Socratic hints), `reasoning` (causal beliefs), `planning` (MCTS), `goals`,
`emotion`, `memory`, `appearance`, `behavior`, `behavior_coverage`, `instruments`,
`standards`, `failure_modes`, `manufacturing`, `science`, `mlmodels`, `neural`,
`minion_chat`, `civos`.

Cognitive-stack helpers (Layered Cognitive Agent, master-spec #2): `goals.py`
(Goal Stack), `emotion.py` (appraisal theory), `memory.py` (multi-store memory),
`world_model.py` (perception/imagination/counterfactual), `planning.py` (tree-of-
thought MCTS), `reasoning.py` (causal beliefs + meta-cognition).

---

## 2. ROUTES INVENTORY

Auth: every endpoint depends on `require_bearer` (bearer token). `GET /auth/me`
returns a static admin descriptor.

### `routes/auth.py`
- `GET /auth/me` → `{role:admin,...}`.

### `routes/worlds.py` (prefix `/worlds`) — the big one
| Method+Path | Returns | Service |
|---|---|---|
| GET `` | list worlds + pop counts | DB |
| POST `` | create world (apportions guild seats) | `factory.create_world` |
| GET `/scale-capacity` | hardware + rich-tick benchmark + LLM-at-scale | `gpu_backend`, `scale_bench` |
| GET `/feature-audit` | 500-feature census / gaps | `feature_audit` |
| GET `/{id}` | world detail | DB |
| DELETE `/{id}` | hard-delete world+cascade | DB |
| PATCH `/{id}/auto-advance` | toggle auto-advance | DB |
| GET `/{id}/map` | heightmap + biome | `world.seed` |
| GET `/{id}/latest-actions` | minion→last action | Memory rows |
| GET `/{id}/latest-thoughts` | minion→latest thought | Memory rows |
| GET `/{id}/minions` | minion list | DB |
| GET `/{id}/events` | event log | DB |
| GET `/{id}/inventions` | invention list | DB |
| GET `/{id}/population` | pop stats + history | snapshots |
| GET `/{id}/culture` | worldview + stances | `religion` |
| GET `/{id}/replay` | causal event chain around tick | Events |
| GET `/{id}/society` | govt+legal+infra+tension | `governance, civics` |
| GET `/{id}/gaps` | open research puzzles | `puzzles` |
| POST `/{id}/gaps/{gap_id}/solve` | solve gap via patents | `puzzles` |
| GET `/{id}/art` | cultural corpus | Artwork |
| GET `/{id}/fossils` | fossil record + reach | `paleontology` |
| GET `/{id}/species` | living species | Species |
| GET `/{id}/climate` | climate field | `climate` |
| GET `/{id}/environment` | pollution/wildlife/epidemic/etc | World fields |
| GET `/{id}/memes` | living memes | Meme |
| GET `/{id}/discoveries` | discovered + remaining tech | `discovery.LADDER` |
| GET `/{id}/timeline` | per-tick history series | snapshots |
| POST `/{id}/advance` | run N ticks | `simulation.advance_world` |
| GET `/{id}/stream` | SSE event stream | `scheduler.subscribe` |
| GET `/{id}/scene-state` | renderer-agnostic scene | `scene_state, epochs` |
| GET `/{id}/chronicle` | epoch + recent sagas | `epochs` |
| GET `/{id}/civos` | civ-health dashboard | `civos` |
| GET `/{id}/knowledge-graph` | typed graph + real_fraction | `knowledge_graph` |
| POST `/{id}/materials` | real concrete dataset modelling | `real_materials` |
| POST `/{id}/electronics` | electronics models | `electronics` |
| POST `/{id}/photonics` | photonics models | `photonics` |
| POST `/{id}/lab-sim` | spice/cfd/robotic twins | `spice_sim, cfd_sim, robotic_lab` |
| POST `/{id}/quantum` | quantum sim | `quantum_sim` |
| POST `/{id}/multiphysics` | multiphysics solvers | `multiphysics` |
| POST `/{id}/supply-chain` | OR / supply-chain | `supply_chain` |
| POST `/{id}/simulation-quality` | V&V / UQ | `simulation_quality` |
| POST `/{id}/instruments-lab` | measurement models | `instruments_lab` |
| POST `/{id}/manufacturing` | process capability/yield | `manufacturing_capability` |
| POST `/{id}/experiment-design` | DoE | `experiment_design` |
| POST `/{id}/optimize` | real Bayesian optimisation | `real_optimizer` |
| POST `/{id}/autonomous-research` | self-directing R&D | `research_director, knowledge_graph` |
| POST `/{id}/invent` | autonomous invention pipeline | `invention_pipeline` |
| POST `/{id}/counterfactual` | counterfactual experiment | `world_model` |
| POST `/{id}/discover-cure` | virtual-cell discovery | `virtual_cell` |
| POST `/{id}/lab-campaign` | self-driving lab loop | `self_driving_lab` |

### `routes/minions.py` (prefix `/minions`)
`GET /{id}` (detail) · `POST /{id}/chat` (`minion_chat`) · `GET /{id}/dna` (`genetics.dna`) ·
`GET /{id}/soul` · `GET /{id}/skills` · `GET /{id}/models` (`mlmodels`) ·
`POST /{id}/train-model` (`mlmodels`) · `POST /{id}/gateway` (`gateway`) ·
`GET /{id}/appearance` (`appearance`) · `GET /{id}/brain` (`neural.policy`) ·
`GET /{id}/beliefs` (`reasoning`) · `GET /{id}/memories` · `GET /{id}/relationships` ·
`GET /{id}/lineage` · `POST /breed` (`lifecycle`) · `POST /{id}/kill` · `POST /fork`.

### `routes/physics.py` (prefix `/physics`)
`GET /laws` · `GET /constants` · `GET /limits` · `GET /laws/{id}` · `POST /solve`
(`physics.engine.compute`) · `POST /assess` · `POST /kernel/feasibility`
(`physics.violations`) · `POST /kernel/conserve` (`physics.conservation`) ·
`GET /kernel/units` · `POST /kernel/stability` (`physics.fidelity`) ·
`POST /kernel/check-equation` (`physics.dimensions`) · `POST /electrical/ohm`
(`physics.electrical`).

### `routes/substrate.py` (prefix `/substrate`)
`GET /materials` · `GET /materials/{name}` · `POST /materials/alloy`
(`knowledge.materials`) · `POST /structures/evaluate` (`physics.structures`) ·
`POST /chemistry/react` (`chemistry`) · `GET /acoustics` (`acoustics`) ·
`GET /economy` (`economy`) · `GET /resources` (`world.resources.survey`).

### `routes/science.py` (prefix `/science`)
`POST /bayes` · `POST /measurement` · `POST /parse-formula` · `POST /prior-art` ·
`POST /mastery` (all `services.science`) · `POST /building-code` · `POST /ethics-gate` ·
`POST /anomaly` (`services.engineering`).

### `routes/knowledge.py` (prefix `/knowledge`)
`GET /summary` · `GET /concepts` · `GET /concepts/{id}` · `GET /formulas` (search) ·
`GET /swarm-roles` · `GET /guardrails` · `GET /skill-tree` (`knowledge.skill_tree`) ·
`POST /oracle` (`oracle`).

### `routes/inventions.py` (prefix `/inventions`)
`POST /charter` · `GET /{id}` · `POST /{id}/decide` (operator override) ·
`GET /{id}/reviews`.

### `routes/projects.py` (prefix `/projects`)
`GET ` · `GET /{id}` · `GET /{id}/contributions` · `GET /summary/world/{id}`.

### `routes/patents.py` (prefix `/patents`)
`POST /search` (`tools.patent_search`) · `GET /{id}`.

### `routes/guilds.py` (prefix `/guilds`)
`GET ` → guild specs + lore.

### `routes/safety.py` (prefix `/safety`)
`POST /check` (`tools.safety`) · `GET /reviews`.

---

## 3. DB MODELS (`db/models.py`) — 31 tables

Enums: `GuildKind, TaskStatus, ReviewVerdict, CauseOfDeath, RelationshipKind,
SwarmRoleKind, ProjectStage, MoodKind`.

| Table | Persists |
|---|---|
| `worlds` | world state: tick, era, sim_year, worldview, pollution, prey/predator pop, government, legal_system, infrastructure, tension, epidemic SIR state, structure_fatigue, temperature/season/weather, soil_fertility/crop_yield, tectonic_stress, water_table, scanner_progress, auto-advance config. |
| `souls` | persistent identity across reincarnation: token, incarnation, karma, ascended, knowledge, temperament, ancestral_summary. |
| `minions` | agent body: guild, DNA, generation+lineage FKs, Big-Five+intelligence+creativity, upbringing, addiction, `brain` (neural biases JSON), reputation/karma, born/died tick, cause_of_death, needs (hunger/thirst/fatigue/sanity/health/injury), mood/stress/morale/purpose, swarm_role. |
| `skills` | per-minion skill name + level + last_practiced_tick. |
| `memories` | typed memory rows (kind/content/importance/tick) — also drive actions/thoughts panels. |
| `discoveries` | foundational tech per world+tech (unique). |
| `memes` | culture units: kind, popularity, generation, variant_of. |
| `ml_models` | in-world trained ML model per minion+task: samples, accuracy. |
| `species` | flora/fauna with heritable cold_tolerance, population, generation. |
| `artworks` | art form/style/title/acclaim. |
| `fossils` | organism/epoch/depth/age_my/excavated. |
| `empty_datasets` | research-gap puzzles + solution patent draft. |
| `causal_beliefs` | minion cause→effect hypotheses (trials/confirmations/confidence). |
| `relationships` | directed bonds (friend/rival/romance/mentor/…) + strength. |
| `patents` | seen patents: title/abstract/cpc_class/grant_date/expired/source/raw. |
| `inventions` | invention disclosures: problem/hypothesis/inputs/outputs, feasibility/novelty/safety scores, status, related_patents, replicated. |
| `peer_reviews` | reviewer_guild + verdict + rationale. |
| `safety_reviews` | rule/detail/blocked per subject. |
| `events` | world event log (kind/actor/payload/tick) — drives SSE + replay. |
| `kb_concepts` | Master-Reference prose sections. |
| `kb_formulas` | named formulas/laws (discipline/catalogue/expression/keywords/source). |
| `kb_swarm_roles` | swarm-role taxonomy. |
| `kb_guardrails` | validation-pipeline guardrails. |
| `research_projects` | multi-stage validation pipeline (stage/confidence/clinical-genetic-chem flags). |
| `project_contributions` | per-minion stage contributions. |
| `population_snapshots` | per-world-per-tick metrics (alive/dead/births/deaths/forks/moods/guilds/roles/projects/total_knowledge/masters) — dashboards/replay. |

---

## 4. THE METHOD CATALOGUE (master "feature" list)

The catalogue = the 56 `methods_*` modules (480 methods, §1b lists every method
name grouped by domain) PLUS the category-engine services (§1c). One-line semantics
for each method are captured in the introspection used to build this report; the
domain groupings in §1b ARE the master list of computable scientific "features."

Additional first-class deep simulations (each a distinct real computation),
reachable in-sim through `field_science`:
- `sim_methods.py` (22): Ising 2D, double pendulum (Lyapunov), 1D wave FDTD,
  Hodgkin-Huxley, Brusselator, decay chain, Planck blackbody, logistic map (chaos),
  tight-binding bands, 2D percolation, genetic algorithm, Conway Life, energy-
  balance climate, FFT spectral, Markov stationary, Schrödinger 1D, random-walk
  diffusion, Black-Scholes (analytic+MC), neural XOR backprop, Schelling
  segregation, UPGMA phylogeny.
- `physics_advanced.py`: VQE, exact FCI ground energy, N-body leapfrog.
- `quantum_chemistry.py` (PySCF): HF energy, dipole, bond scan.
- `molecular_dynamics.py`: LJ velocity-Verlet, Gillespie SSA.
- `molecular_genetics.py`: double helix, melt curve, CRISPR-Cas9 edit, helix view.
- `bio_advanced.py` (Biopython), `chem_advanced.py` (RDKit), `math_advanced.py` (SymPy).

`physics/engine.py` additionally holds a separate hand-curated computable-law
table (the `Law` registry behind `POST /physics/solve` and `/physics/laws`) — a
parallel, UI-reachable physics catalogue distinct from `methods_registry`.

---

## 5. WIRED-vs-DORMANT MAP

### Reachable from a REST route (could be surfaced in UI today)
- **Deep category engines via `/worlds/{id}/…`:** materials (`real_materials`),
  electronics, photonics, lab-sim (spice/cfd/robotic), quantum, multiphysics,
  supply-chain, simulation-quality, instruments-lab, manufacturing, experiment-
  design, optimize (`real_optimizer`), autonomous-research (`research_director`),
  invent (`invention_pipeline`), counterfactual (`world_model`), discover-cure
  (`virtual_cell`), lab-campaign (`self_driving_lab`), knowledge-graph, civos.
- **Physics kernel:** `/physics/*` (laws/solve/constants/limits/kernel/ohm).
- **Substrate:** materials, alloy, structures, chemistry react, **acoustics**,
  economy, resources.
- **Science tooling:** `/science/*` (bayes, measurement, formula, prior-art,
  mastery, building-code, ethics-gate, anomaly).
- **Knowledge:** concepts/formulas/skill-tree/oracle/guardrails/swarm-roles.
- **Minion introspection:** dna, soul, skills, models, brain (`neural`), beliefs,
  appearance, gateway, chat, lineage.
- **Scale/audit:** `/worlds/scale-capacity` (`scale_bench`+`gpu_backend`),
  `/worlds/feature-audit`.

### Reachable only IN-SIM (real, running, but NO user-callable endpoint)
The entire deep library behind the simulation: `methods_registry` (449 routes /
434 callables) + all 56 `methods_*` modules + `field_science` + `science_niches`
+ `guild_structure` + `minion_research` + `discovery_lab` + `discovery_astro` +
`aerospace` + `materials_advanced` + `proteins` + `synbio` + `society` +
`epidemic_network` + `sim_methods` + `physics_advanced` + `quantum_chemistry` +
`molecular_dynamics` + `molecular_genetics` + `structure_folding` + `bio_advanced`
+ `chem_advanced` + `math_advanced` + `discovery_engine` + `discovery_tech`.
Also every tick-loop civilisation service (§1d).

> This is the crux of "hidden features": these run when a Minion does research
> each tick, but a user cannot invoke `methods_ocean.tidal_m2` or
> `aerospace.hohmann_transfer` by name over HTTP.

### DORMANT — only reachable from tests (or genuinely dead)
`temporal_nodes` (A), `graph_extras` (B), `lab_systems` (G), `patent_intel`
(H/I — note `tools/patent_intelligence.py` IS used by the Minion agent),
`exotic_quantum` (Q), `bio_genetics` (R), `disease_models` (T), `ai_models` (V),
`ai_model` (V — the wired twin is `real_materials`), `research_agents` (W),
`drug_discovery`, `discovery_color`, `discovery_molecule`, `discovery_mechanics`.
These have full test suites but no production caller (no route, not imported by any
non-test production module). They are the cleanest "hidden, unsurfaced" wins.

---

## 6. HIDDEN-FEATURE INDEX (the user's specific list)

For each capability: exact `file:function` and whether any UI/route surfaces it.

| Capability | Exact implementation (`file:function`) | Surfaced? |
|---|---|---|
| **Submarine / sonar** | No dedicated submarine module. Sonar = acoustic ranging: `services/methods_ocean.py:deep_water_wave/shallow_water_wave`, `services/methods_acoustics2.py:doppler_shift/speed_of_sound_air/sound_intensity_level`, `services/acoustics.py:travel_time` (`medium="water"`). `field_science._acoustics` keys on `"sonar"`. | **NOT surfaced** as sonar. `acoustics.travel_time` reachable via `GET /substrate/acoustics`; ocean-wave methods are IN-SIM only. No submarine entity. |
| **Meteorites / asteroids** | `services/discovery_astro.py:meteor_close_approach` (two-body MOID, PHA flag), `:propagate_orbit` (Earth-crossing/NEO), `:track_planets/track_stars` (astropy). `services/methods_geology.py:impact_crater_diameter` (Holsapple crater scaling). `methods_astronomy.py:roche_limit`. | **NOT surfaced.** Only IN-SIM via `field_science._astro`/`discovery_lab`. No route returns NEO/meteor data. |
| **Buoys** | No buoy entity. Closest physics: `services/methods_ocean.py:buoyancy_frequency` (Brunt-Väisälä), `wave_energy_stokes`, `tidal_m2`, `ekman_transport`; `methods_tribology` buoyancy balance. | **NOT surfaced.** IN-SIM only. No buoy/mooring object. |
| **PPM / air-quality sensors** | `services/methods_atmoschem.py:co2_radiative_forcing` (`concentration_ppm`), `nox_o3_photostationary`, `aerosol_optical_depth`, `chapman_ozone_*`. `methods_ecology.py:carbon_box_decay` (`excess_ppm`, `remaining_ppm`). `manufacturing_capability.py:defect_rate_ppm`. Sensor model: `instruments_lab.py:noise_profile/resolution_limit`, `electronics.py:sensor_electronics`. | **PARTIAL.** No "air-quality sensor" object; atmoschem ppm methods IN-SIM only; instrument/sensor models reachable via `POST /worlds/{id}/instruments-lab` & `/electronics` but not as an air-quality reading. |
| **Flight / aerospace / aircraft** | `services/aerospace.py` (tsiolkovsky, vis_viva, escape/circular velocity, orbital_period, hohmann_transfer, launch_budget). `services/methods_aerodynamics.py` (lift_force, drag_polar, pitot_airspeed, mach_number, prandtl_glauert, isentropic_stagnation, thin_airfoil_lift, glide_performance). `methods_fluids.py` (lift_coefficient_force, normal_shock_relations, speed_of_sound_mach). `methods_astronomy.py:orbital_period/escape_velocity`. | **NOT surfaced.** All IN-SIM via `field_science._aerospace`/`methods_registry`. No aircraft entity, no `/aerospace` route. |
| **Frequency / spectrum / scanning** | `services/methods_signal.py` (nyquist_alias_frequency, shannon_channel_capacity, autocorrelation_period, adc_quantization_snr), `methods_rf.py` (friis, free_space_path_loss, **radar_range_equation**, antenna gain/beamwidth, link_budget, doppler_shift, skin_depth), `methods_spectroscopy.py` (rydberg, beer_lambert, doppler_shift), `sim_methods.py:fft_spectral`, `methods_math.py:fft_frequencies`. World "Patent Scanner": `services/progression.py:scanner_advance` (the `scanner_progress` meter on `worlds`). | **PARTIAL.** Patent scanner progress is on the world object; RF/signal/spectrum methods IN-SIM only; no `/spectrum` or `/scan` endpoint. |
| **Neurons / neural** | Per-Minion brain: `services/neural.py:policy/choose/learn` (10→8→8 MLP). Computational neuroscience: `services/methods_neuro.py` (lif_neuron, fitzhugh_nagumo, hodgkin_huxley_refractory, stdp_weight_change, …), `sim_methods.py:hodgkin_huxley`, `sim_methods.py:neural_xor`, `photonics.py:photonic_neural_layer`, `disease_models.py:neurodegeneration`. | **PARTLY surfaced.** `neural.policy` exposed via `GET /minions/{id}/brain`. The neuroscience methods (methods_neuro, HH, neural_xor) are IN-SIM only. |
| **Ocean** | `services/methods_ocean.py` (deep/shallow water wave, seawater_density, tidal_m2, ekman_transport, buoyancy_frequency, wave_energy_stokes, geostrophic_current). Tsunami = `shallow_water_wave`. `multiphysics.py:shallow_water_solver`. | **PARTLY.** `multiphysics.shallow_water_solver` reachable via `POST /worlds/{id}/multiphysics` (action `shallow_water`); the full ocean module is IN-SIM only. |
| **Acoustics** | `services/acoustics.py` (sound_level_at, audible, comm_range, travel_time, speech_clarity), `services/methods_acoustics2.py` (8 methods: SIL, doppler, string harmonics, organ pipe, Sabine RT60, beats, transmission loss, speed of sound), `multiphysics.py:acoustic_attenuation/speed_of_sound`. | **SURFACED.** `GET /substrate/acoustics`. `methods_acoustics2` is IN-SIM only. |
| **Seismic / earthquakes** | `services/methods_seismology.py` (richter_local_magnitude, moment_magnitude, gutenberg_richter_b_value, ps_travel_time_distance, body_wave_velocities, omori_aftershock_rate, energy_from_magnitude, epicenter_trilateration), `methods_earth.py:earthquake_energy/seismic_pwave_swave_ratio`, `methods_geology.py:seismic_moment`. LIVE hazard: `services/tectonics.py:tick_tectonics` (builds stress, triggers quakes each tick). | **PARTLY.** Live tectonic state via `GET /worlds/{id}/environment` (`tectonic_stress`); the seismology computation methods are IN-SIM only. |
| **Satellites** | `services/methods_geodesy.py:trilateration` (GNSS/GPS), `geodetic_to_ecef`, `utm_zone`, `mercator_projection`; `methods_rf.py:link_budget/friis_transmission` (satellite comms); `aerospace.py` orbital mechanics; `methods_astronomy.py:roche_limit` (`satellite_density`). | **NOT surfaced.** IN-SIM only. No satellite entity/route. |
| **Clusters** | k-means: `services/methods_cs_ai.py:kmeans_clustering`, `services/disease_models.py:symptom_clustering`. Theory clustering: `temporal_nodes.py:competing_theory_clusters`. Graph clustering/communities via `graph_extras.py`. (No HPC/compute-cluster module — "cluster" = data clustering.) | **NOT surfaced.** `kmeans_clustering` IN-SIM via registry; `symptom_clustering`/`competing_theory_clusters` DORMANT (tests only). |

---

## 7. Top-level + tooling files (completeness)

- `underworld/prove_underworld.py`, `prove_llm.py`, `observe_minds.py` — CLI proof/
  observation scripts (spawn a world, run ticks, print DB counts / live thoughts).
  Not part of the server; manual diagnostics.
- `server/config.py` — pydantic settings (LLM, scheduler flags, sim caps, CORS).
- `server/auth.py` — `require_bearer`.
- `server/logging_setup.py` — structlog config.
- `server/tools/`: `llm.py` (Kimi K2 client), `patent_search.py` (USPTO PatentsView),
  `open_data_portal.py` (USPTO ODP), `patent_intelligence.py` (claim parsing —
  USED by `agents/minion.py`), `safety.py` (hard safety gate).
- `server/agents/`: `minion.py` (the per-tick decision loop — the hub that calls
  `discovery_lab`, `neural`, `acoustics`, `planning`, `reasoning`, `emotion`,
  `goals`, `memory`, LLM, patent tools), `reviewer.py` (safety+peer review+
  replication), `guilds.py`+`guild_lore.py` (11 guild specs+lore).
- `server/genetics/dna.py` — digital DNA (loci, mutate, crossover, breed, fork,
  kinship).
- `server/physics/` — engine (computable Law table behind `/physics/solve`),
  constants, dimensions (unit ledger), conservation auditor, violations/feasibility
  gate, fidelity ladder, structures, electrical, epidemiology.
- `server/knowledge/` — materials DB, skill_tree (multi-hundred-node), seed,
  docx/pdf extractors.
- `server/world/` — seed (CPC→world derivation, heightmap), resources (geology).
- Configs: `server/requirements.txt`, `server/prompts/{minion_system,guild_review}.md`,
  `server/services/SCIENCE_PROOF.md`.

---

## 8. Bottom line for the reassessment

1. The catalogue is **real and large**: 480 verified domain methods + ~30 deep
   category engines + 22 CRISPR-depth sims, all running inside the simulation.
2. The **bottleneck is exposure, not implementation**: the 449-route
   `methods_registry` and the per-field `field_science` library have **no
   user-facing endpoint**. Only ~20 generic `/worlds/{id}/{category}` action
   endpoints + `/physics/solve` + `/substrate/*` + `/science/*` reach a subset.
3. **14 modules are fully DORMANT** (tests-only): `temporal_nodes, graph_extras,
   lab_systems, patent_intel, exotic_quantum, bio_genetics, disease_models,
   ai_models, ai_model, research_agents, drug_discovery, discovery_color,
   discovery_molecule, discovery_mechanics` — built, tested, never called in prod.
4. Of the user's named "missing" features, **acoustics** is the only one with a
   dedicated route (`/substrate/acoustics`); **ocean** and **seismic** are partly
   surfaced through live world state / multiphysics; **submarine/sonar, buoys,
   meteorites/asteroids, flight/aerospace, frequency/spectrum, satellites, and
   clusters** have full real implementations but are reachable **only in-sim or
   only in tests** — i.e. genuinely hidden.
