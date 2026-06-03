"""Real signal-processing & information-theory simulations.

Each function is a distinct, named DSP/information-theory method (not a shared
engine reused), implemented with numpy/scipy/math and verified against a KNOWN
published or analytically exact value in the companion tests. Domains: sampling
(Nyquist-Shannon aliasing), information theory (Shannon channel capacity,
discrete entropy), linear systems (discrete convolution, autocorrelation period
estimation), analog filters (RC low-pass response), channel coding (Hamming
(7,4) single-error correction), and data conversion (ADC quantization SNR).

This module intentionally AVOIDS the existing FFT spectral helpers
(methods_math.fft_frequencies, sim_methods.fft_spectral) and focuses on filters,
sampling, and information theory.

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_signal.py.
"""
from __future__ import annotations

import math

import numpy as np


# ── 1. Nyquist-Shannon sampling: aliased (apparent) frequency ─────────────────
def nyquist_alias_frequency(f_hz: float, fs_hz: float) -> dict:
    """Apparent (aliased) frequency observed when a tone of frequency ``f`` is
    sampled at rate ``fs``. By the Nyquist-Shannon sampling theorem a signal is
    captured without aliasing only if fs > 2*f (Nyquist rate); otherwise the
    tone folds about integer multiples of fs into the baseband [0, fs/2]:

        f_folded = | f - fs * round(f / fs) |

    KNOWN: a 1100 Hz tone sampled at 1000 Hz aliases to 100 Hz; any tone below
    the Nyquist frequency fs/2 is reported unchanged and flagged not aliased.

    Ref: Shannon, "Communication in the Presence of Noise" (Proc. IRE, 1949);
    Nyquist-Shannon sampling theorem (Wikipedia).
    """
    nyquist_hz = fs_hz / 2.0
    # fold the tone about multiples of fs into the baseband
    folded = abs(f_hz - fs_hz * round(f_hz / fs_hz))
    aliased = f_hz > nyquist_hz
    return {
        "input_freq_hz": f_hz,
        "sample_rate_hz": fs_hz,
        "nyquist_freq_hz": nyquist_hz,
        "alias_freq_hz": folded,
        "is_aliased": bool(aliased),
        "nyquist_rate_hz": 2.0 * f_hz,
    }


# ── 2. Shannon-Hartley channel capacity ───────────────────────────────────────
def shannon_channel_capacity(bandwidth_hz: float, snr_linear: float) -> dict:
    """Maximum error-free data rate of a band-limited AWGN channel via the
    Shannon-Hartley theorem:

        C = B * log2(1 + S/N)      [bits/s]

    where B is the bandwidth (Hz) and S/N is the linear signal-to-noise ratio.

    KNOWN: B = 3000 Hz, SNR = 1023 (~30.1 dB) -> C = 3000*log2(1024) =
    3000*10 = 30000 bits/s exactly.

    Ref: Shannon (1948), "A Mathematical Theory of Communication"; Hartley;
    Shannon-Hartley theorem (Wikipedia).
    """
    capacity = bandwidth_hz * math.log2(1.0 + snr_linear)
    return {
        "bandwidth_hz": bandwidth_hz,
        "snr_linear": snr_linear,
        "snr_db": 10.0 * math.log10(snr_linear) if snr_linear > 0 else float("-inf"),
        "capacity_bits_per_s": capacity,
        "spectral_efficiency_bits_per_s_per_hz": math.log2(1.0 + snr_linear),
    }


# ── 3. Shannon entropy of a discrete distribution ─────────────────────────────
def shannon_entropy(probabilities: list, *, base: float = 2.0) -> dict:
    """Shannon entropy of a discrete probability distribution:

        H = -sum_i p_i * log_base(p_i)      [bits when base = 2]

    The 0*log(0) term is taken as 0 by convention. Probabilities are normalized
    defensively so a list of unnormalized counts is also accepted.

    KNOWN: a fair coin {1/2, 1/2} -> H = 1 bit; a fair die (six outcomes) ->
    H = log2(6) = 2.585 bits; a certain (degenerate) outcome -> H = 0.

    Ref: Shannon (1948), "A Mathematical Theory of Communication", Bell Syst.
    Tech. J.; entropy (information theory) (Wikipedia).
    """
    p = np.asarray(probabilities, dtype=float)
    if np.any(p < 0):
        raise ValueError("probabilities must be non-negative")
    total = p.sum()
    if total <= 0:
        raise ValueError("probabilities must sum to a positive value")
    p = p / total
    nz = p[p > 0]
    h = float(-np.sum(nz * (np.log(nz) / np.log(base))))
    n = len(p)
    h_max = math.log(n, base) if n > 1 else 0.0
    return {
        "n_outcomes": n,
        "base": base,
        "entropy": h,
        "max_entropy": h_max,
        "normalized_entropy": (h / h_max) if h_max > 0 else 0.0,
    }


# ── 4. Discrete linear convolution of two signals ─────────────────────────────
def discrete_convolution(x: list, h: list) -> dict:
    """Full discrete linear convolution of two finite sequences:

        y[n] = sum_k x[k] * h[n-k]

    The output has length len(x) + len(h) - 1. This is the input/output relation
    of a linear time-invariant (LTI) system whose impulse response is h.

    KNOWN: [1,2,3] * [0,1,0.5] = [0, 1, 2.5, 4, 1.5] (numpy/MATLAB reference);
    convolution with a unit impulse [1] returns the input unchanged.

    Ref: Oppenheim & Schafer, "Discrete-Time Signal Processing"; convolution
    (Wikipedia). Cross-checked against numpy.convolve(mode="full").
    """
    xa = np.asarray(x, dtype=float)
    ha = np.asarray(h, dtype=float)
    y = np.convolve(xa, ha, mode="full")
    return {
        "result": y.tolist(),
        "length": int(y.size),
        "expected_length": int(xa.size + ha.size - 1),
        "sum_check": float(y.sum()),          # = sum(x)*sum(h)
        "x_sum_times_h_sum": float(xa.sum() * ha.sum()),
    }


# ── 5. Autocorrelation: dominant period of a sinusoid ─────────────────────────
def autocorrelation_period(signal: list, *, fs_hz: float = 1.0) -> dict:
    """Estimate the dominant period of a (quasi-)periodic signal from the first
    non-zero-lag peak of its normalized autocorrelation function:

        R[k] = sum_n x[n] * x[n+k]

    The signal is mean-removed; R is normalized so R[0] = 1; the lag of the first
    local maximum after the zero-lag spike is taken as the fundamental period.

    KNOWN: a pure sinusoid of frequency f sampled at fs has its first
    autocorrelation peak at lag fs/f samples, i.e. period 1/f seconds. For a
    5 Hz tone sampled at 100 Hz the peak lag is 20 samples -> period 0.2 s.

    Ref: autocorrelation (Wikipedia); Rabiner & Schafer, pitch detection.
    """
    x = np.asarray(signal, dtype=float)
    x = x - x.mean()
    n = x.size
    # full autocorrelation, keep non-negative lags
    full = np.correlate(x, x, mode="full")
    r = full[n - 1:]
    r0 = r[0]
    if r0 != 0:
        r = r / r0
    # find first local maximum after the zero-lag peak
    peak_lag = 0
    for k in range(1, n - 1):
        if r[k] > r[k - 1] and r[k] >= r[k + 1] and r[k] > 0:
            peak_lag = k
            break
    period_samples = peak_lag
    period_s = period_samples / fs_hz if fs_hz else float("nan")
    freq_hz = (fs_hz / period_samples) if period_samples else float("nan")
    return {
        "peak_lag_samples": int(peak_lag),
        "period_samples": int(period_samples),
        "period_s": period_s,
        "frequency_hz": freq_hz,
        "peak_correlation": float(r[peak_lag]) if peak_lag else 1.0,
    }


# ── 6. RC low-pass filter cutoff & magnitude response ─────────────────────────
def rc_lowpass_response(r_ohm: float, c_farad: float, f_hz: float) -> dict:
    """First-order RC low-pass filter: cutoff frequency and magnitude response.

        fc = 1 / (2*pi*R*C)                     (-3 dB corner frequency)
        |H(f)| = 1 / sqrt(1 + (f/fc)^2)

    At f = fc the magnitude is 1/sqrt(2) ~= 0.7071, i.e. exactly -3.0103 dB, and
    the phase lag is -45 deg.

    KNOWN: R = 1000 ohm, C = 1 uF -> fc = 159.15 Hz; |H(fc)| = -3.01 dB.

    Ref: Sedra & Smith, "Microelectronic Circuits"; RC low-pass filter
    (Wikipedia).
    """
    fc = 1.0 / (2.0 * math.pi * r_ohm * c_farad)
    ratio = f_hz / fc
    mag = 1.0 / math.sqrt(1.0 + ratio ** 2)
    mag_db = 20.0 * math.log10(mag) if mag > 0 else float("-inf")
    phase_deg = -math.degrees(math.atan(ratio))
    return {
        "cutoff_freq_hz": fc,
        "time_constant_s": r_ohm * c_farad,
        "freq_hz": f_hz,
        "magnitude": mag,
        "magnitude_db": mag_db,
        "phase_deg": phase_deg,
    }


# ── 7. Hamming(7,4) single-bit error detect & correct ─────────────────────────
# Parity-check matrix H = [P^T | I3] and generator G = [I4 | P] in systematic
# form, with the 3 parity bits appended (columns 5,6,7).
_HAMMING_P = np.array([        # 4x3 parity sub-matrix
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
], dtype=int)
_HAMMING_G = np.hstack([np.eye(4, dtype=int), _HAMMING_P])       # 4x7
_HAMMING_H = np.hstack([_HAMMING_P.T, np.eye(3, dtype=int)])     # 3x7


def hamming74_correct(received: list) -> dict:
    """Decode a Hamming(7,4) codeword, correcting any single-bit error.

    Encoding uses the systematic generator G = [I4 | P]; decoding computes the
    syndrome s = H * r^T (mod 2). A zero syndrome means no detectable error; a
    non-zero syndrome matches exactly one column of H, identifying (and thus
    correcting) the flipped bit. Minimum distance d = 3 => corrects t = 1 error.

    KNOWN: encode data 1011; flip any single bit; the syndrome locates and the
    decoder recovers the original 1011 (and the original codeword) exactly.

    Ref: Hamming, "Error Detecting and Error Correcting Codes" (BSTJ, 1950);
    Hamming(7,4) (Wikipedia).
    """
    r = np.asarray(received, dtype=int) % 2
    if r.size != 7:
        raise ValueError("Hamming(7,4) codeword must have length 7")
    syndrome = (_HAMMING_H @ r) % 2          # length-3 vector
    error_pos = -1                            # 0-based index of flipped bit
    corrected = r.copy()
    for j in range(7):
        if np.array_equal(_HAMMING_H[:, j], syndrome) and syndrome.any():
            error_pos = j
            corrected[j] ^= 1
            break
    data_bits = corrected[:4].tolist()       # systematic: first 4 cols are data
    return {
        "received": r.tolist(),
        "syndrome": syndrome.tolist(),
        "error_detected": bool(syndrome.any()),
        "error_position": int(error_pos),     # -1 if none, else 0-based
        "corrected_codeword": corrected.tolist(),
        "decoded_data": data_bits,
    }


def hamming74_encode(data: list) -> dict:
    """Encode 4 data bits into a 7-bit Hamming(7,4) codeword via c = d * G
    (mod 2) with systematic G = [I4 | P]. Companion to ``hamming74_correct``.

    Ref: Hamming (1950); Hamming(7,4) (Wikipedia).
    """
    d = np.asarray(data, dtype=int) % 2
    if d.size != 4:
        raise ValueError("Hamming(7,4) data word must have length 4")
    code = (d @ _HAMMING_G) % 2
    return {"data": d.tolist(), "codeword": code.tolist()}


# ── 8. ADC quantization SNR (6.02 N + 1.76 dB) ────────────────────────────────
def adc_quantization_snr(n_bits: int, *, full_scale_v: float = 1.0) -> dict:
    """Ideal signal-to-quantization-noise ratio of an N-bit ADC driven by a
    full-scale sinusoid. Uniform quantization gives a quantization-error power
    of q^2/12 (q = LSB = FS / 2^N); a full-scale sine has power FS^2/8, so:

        SNR = 6.02 * N + 1.76  dB

    KNOWN: 16-bit ADC -> 6.02*16 + 1.76 = 98.08 dB (~98.1 dB); 8-bit -> 49.9 dB;
    each extra bit adds ~6.02 dB.

    Ref: Kester, "Taking the Mystery out of the Infamous Formula SNR = 6.02N +
    1.76 dB", Analog Devices MT-001; Oppenheim & Schafer.
    """
    # closed-form coefficient form
    snr_db_formula = 6.02 * n_bits + 1.76
    # exact first-principles value: 20*log10(2^N) + 10*log10(1.5)
    q = full_scale_v / (2 ** n_bits)
    noise_power = q ** 2 / 12.0               # uniform quantization noise
    signal_power = (full_scale_v ** 2) / 8.0  # full-scale sine: (FS/2)^2 / 2
    snr_db_exact = 10.0 * math.log10(signal_power / noise_power)
    return {
        "n_bits": n_bits,
        "lsb_volts": q,
        "snr_db_formula": snr_db_formula,
        "snr_db_exact": snr_db_exact,
        "enob_from_snr": (snr_db_exact - 1.76) / 6.02,
        "quantization_noise_power": noise_power,
        "signal_power": signal_power,
    }
