"""Each signal-processing / information-theory method must reproduce its KNOWN
published or analytically exact value.

Citations are inline. Tolerances are explicit.
"""
import math

import numpy as np

from underworld.server.services.methods_signal import (
    adc_quantization_snr,
    autocorrelation_period,
    discrete_convolution,
    hamming74_correct,
    hamming74_encode,
    nyquist_alias_frequency,
    rc_lowpass_response,
    shannon_channel_capacity,
    shannon_entropy,
)


# 1. Nyquist-Shannon aliasing — KNOWN: 1100 Hz tone sampled at 1000 Hz aliases
#    to 100 Hz; a sub-Nyquist tone is reported unchanged and not aliased.
#    Ref: Shannon (1949); Nyquist-Shannon sampling theorem (Wikipedia).
def test_nyquist_alias_known_fold():
    r = nyquist_alias_frequency(1100.0, 1000.0)
    assert abs(r["alias_freq_hz"] - 100.0) < 1e-9       # folds to 100 Hz
    assert r["is_aliased"] is True
    assert abs(r["nyquist_freq_hz"] - 500.0) < 1e-12
    # 7 kHz sampled at 6 kHz -> |7000 - 6000| = 1000 Hz
    assert abs(nyquist_alias_frequency(7000.0, 6000.0)["alias_freq_hz"] - 1000.0) < 1e-9
    # sub-Nyquist tone is unchanged and not flagged
    ok = nyquist_alias_frequency(100.0, 1000.0)
    assert abs(ok["alias_freq_hz"] - 100.0) < 1e-9
    assert ok["is_aliased"] is False


# 2. Shannon-Hartley capacity — KNOWN: B=3000 Hz, SNR=1023 -> C = 3000*10 =
#    30000 bits/s exactly (log2(1024)=10).
#    Ref: Shannon (1948); Shannon-Hartley theorem (Wikipedia).
def test_shannon_capacity_known_value():
    r = shannon_channel_capacity(3000.0, 1023.0)
    assert abs(r["capacity_bits_per_s"] - 30000.0) < 1e-6
    assert abs(r["spectral_efficiency_bits_per_s_per_hz"] - 10.0) < 1e-9
    # SNR = 1 (0 dB) -> 1 bit/s/Hz
    unit = shannon_channel_capacity(1.0, 1.0)
    assert abs(unit["capacity_bits_per_s"] - 1.0) < 1e-12
    assert abs(unit["snr_db"] - 0.0) < 1e-9


# 3. Shannon entropy — KNOWN: fair coin = 1 bit; fair die = log2(6) = 2.585
#    bits; a certain outcome = 0 bits.
#    Ref: Shannon (1948); entropy (information theory) (Wikipedia).
def test_shannon_entropy_known_values():
    coin = shannon_entropy([0.5, 0.5])
    assert abs(coin["entropy"] - 1.0) < 1e-12
    die = shannon_entropy([1, 1, 1, 1, 1, 1])           # unnormalized counts
    assert abs(die["entropy"] - math.log2(6)) < 1e-9
    assert abs(die["entropy"] - 2.585) < 1e-3           # 2.585 bits
    certain = shannon_entropy([1.0, 0.0, 0.0, 0.0])
    assert abs(certain["entropy"] - 0.0) < 1e-12
    # uniform distribution maximizes entropy => normalized entropy = 1
    assert abs(die["normalized_entropy"] - 1.0) < 1e-12


# 4. Discrete convolution — KNOWN: [1,2,3]*[0,1,0.5] = [0,1,2.5,4,1.5]
#    (numpy/MATLAB reference); impulse leaves the signal unchanged.
#    Ref: Oppenheim & Schafer; convolution (Wikipedia).
def test_discrete_convolution_known_example():
    r = discrete_convolution([1, 2, 3], [0, 1, 0.5])
    expected = [0.0, 1.0, 2.5, 4.0, 1.5]
    assert r["length"] == 5 == r["expected_length"]
    for got, want in zip(r["result"], expected):
        assert abs(got - want) < 1e-12
    # sum of convolution = (sum x)*(sum h)
    assert abs(r["sum_check"] - r["x_sum_times_h_sum"]) < 1e-12
    # convolution with the unit impulse returns the input unchanged
    imp = discrete_convolution([4, -2, 7], [1])
    assert imp["result"] == [4.0, -2.0, 7.0]


# 5. Autocorrelation period — KNOWN: a 5 Hz sinusoid sampled at 100 Hz has its
#    first autocorrelation peak at lag 20 samples => period 0.2 s, freq 5 Hz.
#    Ref: autocorrelation (Wikipedia); Rabiner & Schafer.
def test_autocorrelation_recovers_sinusoid_period():
    fs = 100.0
    f = 5.0
    t = np.arange(0, 2.0, 1.0 / fs)
    x = np.sin(2.0 * np.pi * f * t)
    r = autocorrelation_period(x.tolist(), fs_hz=fs)
    assert r["period_samples"] == 20                    # fs/f = 100/5
    assert abs(r["period_s"] - 0.2) < 1e-9
    assert abs(r["frequency_hz"] - 5.0) < 1e-9
    # a 10 Hz tone at the same fs -> 10 samples
    x2 = np.sin(2.0 * np.pi * 10.0 * t)
    assert autocorrelation_period(x2.tolist(), fs_hz=fs)["period_samples"] == 10


# 6. RC low-pass filter — KNOWN: R=1k, C=1uF -> fc = 159.15 Hz; |H(fc)| =
#    1/sqrt(2) = -3.01 dB; phase = -45 deg at the corner.
#    Ref: Sedra & Smith; RC low-pass filter (Wikipedia).
def test_rc_lowpass_minus_3db_at_cutoff():
    r = rc_lowpass_response(1000.0, 1e-6, 159.1549)
    assert abs(r["cutoff_freq_hz"] - 159.1549) < 1e-2   # 1/(2*pi*RC)
    # at f = fc magnitude is 1/sqrt(2) and -3.0103 dB
    assert abs(r["magnitude"] - (1.0 / math.sqrt(2.0))) < 1e-5
    assert abs(r["magnitude_db"] - (-3.0103)) < 1e-3
    assert abs(r["phase_deg"] - (-45.0)) < 1e-3
    # one decade above fc -> ~-20 dB (first-order roll-off)
    high = rc_lowpass_response(1000.0, 1e-6, 1591.549)
    assert abs(high["magnitude_db"] - (-20.0)) < 0.1
    # DC (f=0) passes unattenuated
    dc = rc_lowpass_response(1000.0, 1e-6, 0.0)
    assert abs(dc["magnitude"] - 1.0) < 1e-12


# 7. Hamming(7,4) — KNOWN: encode 1011, flip any single bit, the decoder
#    locates the error and recovers the original data 1011 and codeword.
#    Ref: Hamming (1950); Hamming(7,4) (Wikipedia).
def test_hamming74_corrects_single_bit_error():
    data = [1, 0, 1, 1]
    code = hamming74_encode(data)["codeword"]
    assert len(code) == 7
    # clean codeword decodes with no error
    clean = hamming74_correct(code)
    assert clean["error_detected"] is False
    assert clean["decoded_data"] == data
    # flipping EACH single bit must be detected, located, and corrected
    for j in range(7):
        corrupted = code.copy()
        corrupted[j] ^= 1
        dec = hamming74_correct(corrupted)
        assert dec["error_detected"] is True
        assert dec["error_position"] == j
        assert dec["corrected_codeword"] == code
        assert dec["decoded_data"] == data


# 8. ADC quantization SNR — KNOWN: 16-bit -> 6.02*16 + 1.76 = 98.08 dB (~98.1);
#    8-bit -> 49.9 dB; each extra bit adds ~6.02 dB.
#    Ref: Kester, Analog Devices MT-001 "SNR = 6.02N + 1.76 dB".
def test_adc_quantization_snr_known_values():
    r16 = adc_quantization_snr(16)
    assert abs(r16["snr_db_formula"] - 98.08) < 0.05    # 6.02*16+1.76
    assert abs(r16["snr_db_exact"] - 98.09) < 0.1       # first-principles
    assert abs(r16["snr_db_exact"] - 98.1) < 0.1
    # ENOB recovered from the exact SNR equals the bit count
    assert abs(r16["enob_from_snr"] - 16.0) < 0.05
    # 8-bit ADC -> 49.9 dB
    assert abs(adc_quantization_snr(8)["snr_db_exact"] - 49.9) < 0.1
    # one extra bit adds ~6.02 dB
    delta = adc_quantization_snr(13)["snr_db_exact"] - adc_quantization_snr(12)["snr_db_exact"]
    assert abs(delta - 6.0206) < 1e-3
