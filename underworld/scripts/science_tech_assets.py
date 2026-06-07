"""SCIENCE / TECH / WORK asset catalog — the machines, instruments and work-props that show
Underworld Minions ACTUALLY DOING THE WORK. This is the valuable content (not 8 colours of fork).

Per science: signature instruments + machines a minion is seen operating.
Per guild: the workshop machines that define its craft.
Per work action: the apparatus that depicts the labour.
Each becomes ONE unique generation (no colour duplication).
"""
from __future__ import annotations

# 56 sciences -> the instruments/machines that visibly show research happening
SCIENCE_MACHINES = {
    "acoustics": ["anechoic_chamber_rig", "waveform_analyzer", "calibrated_microphone_array"],
    "aerodynamics": ["wind_tunnel", "smoke_flow_rig", "pitot_test_stand"],
    "agronomy": ["soil_analysis_bench", "automated_greenhouse_rig", "crop_drone_station"],
    "astronomy": ["observatory_telescope", "radio_dish_array", "star_tracker_mount"],
    "atmoschem": ["gas_chromatograph", "atmospheric_sampler_mast", "ozone_monitor"],
    "biology": ["compound_microscope", "specimen_incubator", "dissection_station"],
    "biomechanics": ["motion_capture_rig", "force_plate_treadmill", "gait_analysis_bench"],
    "chemistry": ["fume_hood_bench", "distillation_column", "reaction_reactor_vessel"],
    "combustion": ["combustion_test_cell", "flame_calorimeter", "engine_dyno"],
    "control": ["control_console_wall", "servo_test_rig", "plc_cabinet"],
    "crypto": ["cipher_workstation", "key_server_rack", "quantum_rng_box"],
    "crystallography": ["x_ray_diffractometer", "crystal_growth_furnace", "goniometer"],
    "cs_ai": ["gpu_compute_cluster", "ai_training_workstation", "robot_dev_bench"],
    "earth": ["seismograph_station", "core_sample_rack", "gravimeter"],
    "ecology": ["field_sampling_kit", "biodiversity_camera_trap", "water_quality_sonde"],
    "economics": ["market_data_wall", "trading_terminal", "ledger_analytics_desk"],
    "electrochem": ["potentiostat_bench", "electrolysis_cell", "battery_test_rig"],
    "electronics": ["oscilloscope_bench", "soldering_station", "pcb_pick_and_place"],
    "engineering": ["cad_workstation", "universal_test_machine", "prototype_jig"],
    "epidemiology": ["biosafety_cabinet", "pcr_thermocycler", "contact_tracing_wall"],
    "fluids": ["flow_loop_rig", "piv_laser_bench", "rheometer"],
    "foodscience": ["food_lab_bench", "fermentation_tank", "texture_analyzer"],
    "forestry": ["timber_grading_bench", "tree_corer_kit", "canopy_lidar_mast"],
    "geodesy": ["total_station_survey", "gnss_base_station", "laser_level"],
    "geology": ["rock_saw_bench", "polarizing_microscope", "core_logging_table"],
    "geotechnical": ["soil_triaxial_rig", "penetrometer", "compaction_tester"],
    "heattransfer": ["thermal_imaging_bench", "heat_exchanger_rig", "calorimeter"],
    "hydrogeology": ["well_pump_test_rig", "aquifer_sensor_array", "tracer_test_kit"],
    "hydrology": ["stream_gauge_station", "rainfall_simulator", "flow_flume"],
    "immunology": ["flow_cytometer", "elisa_plate_reader", "cell_culture_hood"],
    "linguistics": ["phonetics_recording_booth", "corpus_analysis_desk", "speech_spectrograph"],
    "materials": ["material_press", "tensile_test_machine", "sem_microscope"],
    "math": ["chalkboard_proof_wall", "computation_workstation", "geometry_model_set"],
    "medicine": ["operating_theatre_rig", "mri_scanner", "patient_monitor_cart"],
    "metallurgy": ["smelting_furnace", "metal_casting_station", "hardness_tester"],
    "neuro": ["eeg_recording_cap_rig", "brain_imaging_scanner", "neural_probe_bench"],
    "nuclear": ["reactor_control_room", "radiation_shielded_glovebox", "isotope_separator"],
    "ocean": ["research_submersible", "ctd_rosette_sampler", "wave_tank"],
    "optics": ["laser_optics_bench", "interferometer", "lens_polishing_rig"],
    "pharmacology": ["drug_synthesis_bench", "pill_press_machine", "assay_robot"],
    "photovoltaics": ["solar_cell_test_array", "sun_simulator_rig", "wafer_coater"],
    "physics": ["particle_accelerator_segment", "cloud_chamber", "vacuum_chamber_rig"],
    "plasma": ["plasma_torch_chamber", "tokamak_segment", "spectrometry_probe"],
    "polymer": ["extruder_machine", "polymer_reactor", "rheology_bench"],
    "qcomputing": ["dilution_refrigerator", "qubit_control_rack", "cryostat_chamber"],
    "quantum": ["optical_trap_bench", "single_photon_detector", "cryo_chamber"],
    "rf": ["antenna_test_range", "spectrum_analyzer_bench", "rf_shielded_chamber"],
    "robotics": ["robot_arm_cell", "humanoid_test_rig", "mobile_robot_dock"],
    "seismology": ["broadband_seismometer", "shake_table", "geophone_array"],
    "semiconductor": ["cleanroom_wafer_stepper", "etching_chamber", "probe_station"],
    "signal": ["dsp_workbench", "logic_analyzer", "signal_generator_rack"],
    "spectroscopy": ["mass_spectrometer", "ftir_bench", "raman_microscope"],
    "statmech": ["monte_carlo_compute_node", "thermo_demo_rig", "lattice_model_display"],
    "structural": ["load_frame_test_rig", "strain_gauge_bench", "shake_table_structural"],
    "tribology": ["friction_test_rig", "wear_tester", "lubricant_bench"],
    "veterinary": ["animal_exam_table", "vet_ultrasound_cart", "surgery_vet_rig"],
}

# 11 guilds -> their defining workshop machines (minions crafting/producing)
GUILD_WORKSHOPS = {
    "maths": ["proof_chalkboard_hall", "computation_terminal_bank"],
    "physics": ["experiment_test_bench", "vacuum_apparatus"],
    "electrical": ["high_voltage_bench", "motor_winding_station"],
    "mechanical": ["machine_lathe", "cnc_mill", "assembly_jig_station"],
    "civil": ["structural_model_table", "surveying_station"],
    "materials": ["materials_furnace", "composite_layup_table"],
    "computing": ["server_build_bench", "robotics_lab_cell"],
    "energy": ["turbine_assembly_rig", "battery_pack_station", "reactor_console"],
    "agriculture": ["hydroponic_grow_rack", "harvest_processing_line"],
    "patent": ["drafting_review_desk", "prototype_showcase_stand"],
    "safety": ["inspection_test_booth", "hazard_containment_rig"],
}

# work actions -> apparatus that depicts a minion doing that labour
WORK_PROPS = {
    "study": ["research_desk_setup", "open_codex_stand"],
    "forge": ["blacksmith_anvil_forge", "molten_metal_crucible"],
    "farm": ["futuristic_plough_drone", "irrigation_control_post"],
    "trade": ["market_trading_stall", "goods_scale_counter"],
    "teach": ["lecture_podium_holo", "demonstration_table"],
    "invent": ["inventor_workbench", "prototype_assembly_arm"],
    "build": ["construction_exosuit", "auto_bricklayer_rig", "site_crane_rig"],
    "mine": ["mining_drill_rig", "ore_conveyor_unit", "excavation_mech"],
    "heal": ["medic_treatment_station", "diagnostic_scanner_arch"],
    "experiment": ["lab_experiment_bench", "data_capture_terminal"],
}


def all_work_assets():
    """Flatten to (base_item, category, science/guild/action) generation entries."""
    out = []
    for sci, items in SCIENCE_MACHINES.items():
        for it in items:
            out.append((it, "prop", f"science:{sci}"))
    for g, items in GUILD_WORKSHOPS.items():
        for it in items:
            out.append((it, "industrial", f"guild:{g}"))
    for act, items in WORK_PROPS.items():
        for it in items:
            out.append((it, "prop", f"work:{act}"))
    # dedup by base_item
    seen, uniq = set(), []
    for it, cat, src in out:
        if it in seen:
            continue
        seen.add(it); uniq.append((it, cat, src))
    return uniq
