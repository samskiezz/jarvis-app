"""Verification tests for methods_neuro — each asserts a computed result
matches a KNOWN published value or qualitative neuroscience law.
"""
import numpy as np

from underworld.server.services.methods_neuro import (
    lif_neuron,
    fitzhugh_nagumo,
    cable_length_constant,
    synaptic_epsp_decay,
    stdp_weight_change,
    hodgkin_huxley_refractory,
    population_fi_curve,
    resting_membrane_potential,
)


# 1. LEAKY INTEGRATE-AND-FIRE ------------------------------------------------
def test_lif_silent_below_rheobase():
    # KNOWN (Gerstner, Neuronal Dynamics 1.3): the LIF neuron is silent unless
    # I exceeds the rheobase I_thresh = v_threshold / R.
    out = lif_neuron(input_current=0.05)        # R=10, V_th=1 -> rheobase=0.1
    assert out["rheobase_current"] == 0.1
    assert out["above_threshold"] is False
    assert out["fired"] is False
    assert out["n_spikes"] == 0


def test_lif_fires_above_threshold_and_rate_increases_with_current():
    # KNOWN: above the rheobase the neuron fires, and the firing rate
    # increases monotonically with injected current.
    low = lif_neuron(input_current=0.2)
    high = lif_neuron(input_current=0.5)
    assert low["fired"] is True
    assert high["fired"] is True
    assert high["firing_rate_hz"] > low["firing_rate_hz"]   # rate rises with I
    # the rate can never exceed the refractory ceiling 1/t_ref.
    assert high["firing_rate_hz"] <= high["max_rate_hz"] + 1e-6


# 2. FITZHUGH-NAGUMO EXCITABILITY --------------------------------------------
def test_fitzhugh_nagumo_spike_vs_subthreshold():
    # KNOWN (Scholarpedia, FitzHugh-Nagumo): a large stimulus elicits a full
    # spike (v overshoots ~+1.5..2), a small one stays subthreshold.
    spike = fitzhugh_nagumo(stimulus=1.0)
    sub = fitzhugh_nagumo(stimulus=0.1)
    assert spike["spiked"] is True
    assert spike["v_peak"] > 1.0
    assert sub["spiked"] is False
    assert sub["v_peak"] < 1.0
    assert spike["v_peak"] > sub["v_peak"]


# 3. CABLE LENGTH CONSTANT ---------------------------------------------------
def test_cable_length_constant_known_value():
    # KNOWN: lambda = sqrt(r_m / r_i); with r_m=4, r_i=1 -> lambda=2.
    out = cable_length_constant(r_m=4.0, r_i=1.0)
    assert abs(out["length_constant"] - 2.0) < 1e-12
    # signal decays to 1/e (~0.3679) over one length constant.
    assert abs(out["voltage_fraction"] - np.exp(-1.0)) < 1e-12
    assert abs(out["fraction_at_one_lambda"] - 0.36787944117) < 1e-6


# 4. SYNAPTIC EXPONENTIAL EPSP DECAY -----------------------------------------
def test_epsp_decays_with_time_constant():
    # KNOWN: V(t)=V0*exp(-t/tau); at t=tau, V has fallen to V0/e (~36.8%).
    out = synaptic_epsp_decay(tau=5.0, v0=1.0)
    assert abs(out["v_at_tau"] - np.exp(-1.0)) < 1e-12     # V0/e
    assert abs(out["fraction_at_tau"] - 0.36787944) < 1e-6
    # the time constant recovered from the simulated trace equals tau.
    assert abs(out["tau_recovered"] - 5.0) < 1e-6
    # half-life = tau * ln2.
    assert abs(out["half_life"] - 5.0 * np.log(2.0)) < 1e-9


# 5. HEBBIAN / STDP ----------------------------------------------------------
def test_stdp_potentiation_when_pre_precedes_post():
    # KNOWN (Bi & Poo 1998): pre BEFORE post (dt=t_post-t_pre>0) potentiates
    # the synapse (dW>0); the reverse order depresses it (dW<0).
    pot = stdp_weight_change(t_pre=0.0, t_post=10.0)
    dep = stdp_weight_change(t_pre=10.0, t_post=0.0)
    assert pot["pre_before_post"] is True
    assert pot["potentiated"] is True
    assert pot["delta_w"] > 0.0
    assert dep["depressed"] is True
    assert dep["delta_w"] < 0.0
    # closer-timed pre->post pairs potentiate more strongly (exponential window).
    near = stdp_weight_change(t_pre=0.0, t_post=5.0)
    far = stdp_weight_change(t_pre=0.0, t_post=40.0)
    assert near["delta_w"] > far["delta_w"] > 0.0


# 6. HODGKIN-HUXLEY REFRACTORY BEHAVIOUR -------------------------------------
def test_hodgkin_huxley_second_spike_needs_higher_current():
    # KNOWN (Hodgkin & Huxley 1952): during the refractory period the second
    # spike requires a LARGER current than the first.
    # At amplitude 15 the first pulse already fires a spike...
    first = hodgkin_huxley_refractory(current_amplitude=15.0, inter_pulse=5.0)
    assert first["first_pulse_fired"] is True
    # ...but a second pulse 5 ms later at the SAME amplitude stays refractory.
    assert first["second_pulse_fired"] is False
    # A much larger amplitude is needed to evoke the second spike during the
    # refractory window -> 2nd spike threshold is higher than the 1st.
    strong = hodgkin_huxley_refractory(current_amplitude=400.0, inter_pulse=5.0)
    assert strong["second_pulse_fired"] is True


# 7. POPULATION FIRING-RATE / SIGMOID f-I CURVE ------------------------------
def test_population_fi_curve_saturates():
    # KNOWN: the sigmoid f-I curve is monotonic and SATURATES at r_max.
    low = population_fi_curve(input_current=-50.0)
    mid = population_fi_curve(input_current=5.0)     # = theta -> half-max
    high = population_fi_curve(input_current=100.0)
    assert low["rate"] < mid["rate"] < high["rate"]          # monotonic
    assert abs(mid["saturation_fraction"] - 0.5) < 1e-9      # half-max at theta
    assert high["saturation_fraction"] > 0.999               # saturates at r_max
    assert low["saturation_fraction"] < 1e-3                 # floor near 0


# 8. NERNST / GOLDMAN RESTING MEMBRANE POTENTIAL -----------------------------
def test_potassium_nernst_about_minus_90_mV():
    # KNOWN: E_K = (RT/F) ln([K]o/[K]i) ~= -90 mV for a mammalian neuron
    # ([K]o=5 mM, [K]i=140 mM, 37 C).
    out = resting_membrane_potential()
    assert abs(out["E_K_mV"] - (-90.0)) < 5.0    # ~ -89 mV
    # E_Na is large and positive (~+60 mV) for the standard concentrations.
    assert out["E_Na_mV"] > 50.0


def test_goldman_resting_potential_about_minus_70_mV():
    # KNOWN: the Goldman-Hodgkin-Katz resting potential of a neuron ~= -70 mV,
    # i.e. between E_K and E_Na but much closer to E_K.
    out = resting_membrane_potential()
    assert abs(out["resting_potential_mV"] - (-70.0)) < 5.0   # ~ -67 mV
    # resting potential sits above E_K (Na leak depolarises it).
    assert out["resting_potential_mV"] > out["E_K_mV"]
