"""Unified "ask anything" PREDICTION ENGINE.

A single ``predict(question, params)`` entrypoint that:
  1. classifies the natural-language question into a domain
     (crypto | seismic | trajectory | growth | generic),
  2. loads the required data (from ``params`` if supplied, else best-effort
     network fetch — CoinGecko / USGS, reusing the http patterns in
     ``services/live_intel.py``),
  3. runs a domain-appropriate, mathematically real forecaster, and
  4. assembles an HONEST response: every answer carries a confidence
     interval / probability + stated assumptions and caveats. No fake
     precision — when there is not enough data we say so.

Forecasters (all native numpy/math; underworld methods reused best-effort):
  - PRICE / time-series : log-returns -> drift mu & vol sigma -> Geometric
        Brownian Motion Monte-Carlo (10k paths) + EWMA/Holt linear-trend blend.
  - EVENT (seismic)     : Gutenberg-Richter (b,a) + Poisson rate ->
        P(>=1 quake >= M in horizon T) = 1 - exp(-lambda*T). Omori for
        aftershock decay when a recent mainshock is supplied.
  - TRAJECTORY          : great-circle (haversine) forward step from a state
        vector (lat,lng,alt,speed,heading,vertical_rate); ballistic/orbital
        reuse projectile_range / orbital_period.
  - GROWTH / generic    : fit exponential (doubling time) AND logistic
        (saturating) to a series; project with CI from residual variance.

Design: ``params`` may carry the data series directly (offline/tests/power
users); the network is only touched when params omit the data. ``predict``
never raises on a normal question — it returns a structured
"insufficient_data" result describing what is needed.
"""

from __future__ import annotations

import math
import re
import time
from typing import Any, Optional

import numpy as np

# ── Best-effort reuse of the underworld verified-method registry ───────────────
# These imports MUST NOT be a hard dependency: the engine has to work even when
# the underworld package is absent or fails to import.
_UW: dict[str, Any] = {}
_UW_AVAILABLE = False
try:  # pragma: no cover - import guard
    from underworld.server.services import methods_seismology as _SEIS
    from underworld.server.services import methods_robotics as _ROB
    from underworld.server.services import aerospace as _AERO

    _UW = {
        "gutenberg_richter_b_value": _SEIS.gutenberg_richter_b_value,
        "omori_aftershock_rate": _SEIS.omori_aftershock_rate,
        "energy_from_magnitude": _SEIS.energy_from_magnitude,
        "projectile_range": _ROB.projectile_range,
        "orbital_period": _AERO.orbital_period,
    }
    _UW_AVAILABLE = True
except Exception:  # noqa: BLE001 - any failure -> fall back to native maths
    _UW = {}
    _UW_AVAILABLE = False


# ── Optional Kimi NL intent extraction (best-effort, key-optional) ─────────────
def _kimi_extract(question: str) -> Optional[dict]:
    """Ask Kimi to extract structured intent. Returns None on any failure / no
    key so the regex fallback takes over. Kept fully synchronous + defensive."""
    try:
        from ..config import KIMI_API_KEY, KIMI_BASE_URL, KIMI_MODEL
    except Exception:  # noqa: BLE001
        return None
    if not KIMI_API_KEY:
        return None
    try:  # pragma: no cover - network path, not exercised in offline tests
        import json

        import httpx

        sys_prompt = (
            "You extract forecasting intent from a question. Respond with ONLY a "
            "JSON object with keys: domain (one of crypto, seismic, trajectory, "
            "growth, generic), target (string or null), horizon_hours (number or "
            "null), magnitude (number or null), latitude (number or null), "
            "longitude (number or null). No prose."
        )
        url = f"{KIMI_BASE_URL.rstrip('/')}/chat/completions"
        resp = httpx.post(
            url,
            headers={"Authorization": f"Bearer {KIMI_API_KEY}"},
            json={
                "model": KIMI_MODEL,
                "temperature": 0.0,
                "messages": [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": question},
                ],
            },
            timeout=httpx.Timeout(20.0, connect=8.0),
        )
        if resp.status_code != 200:
            return None
        content = resp.json()["choices"][0]["message"]["content"]
        m = re.search(r"\{.*\}", content, re.DOTALL)
        if not m:
            return None
        return json.loads(m.group(0))
    except Exception:  # noqa: BLE001
        return None


# ── Ticker mapping (reuses the CoinGecko ids used by live_intel) ───────────────
_TICKER_TO_ID = {
    "xrp": "ripple", "ripple": "ripple",
    "btc": "bitcoin", "bitcoin": "bitcoin", "xbt": "bitcoin",
    "eth": "ethereum", "ethereum": "ethereum", "ether": "ethereum",
    "sol": "solana", "solana": "solana",
    "ada": "cardano", "cardano": "cardano",
    "doge": "dogecoin", "dogecoin": "dogecoin",
    "dot": "polkadot", "polkadot": "polkadot",
    "ltc": "litecoin", "litecoin": "litecoin",
    "bnb": "binancecoin", "matic": "matic-network", "polygon": "matic-network",
    "avax": "avalanche-2", "link": "chainlink", "chainlink": "chainlink",
}

_COINGECKO_BASE = "https://api.coingecko.com/api/v3"
_USGS_QUERY = "https://earthquake.usgs.gov/fdsnws/event/1/query"

# small in-process cache (~5 min) for network data loaders
_CACHE: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 300.0


def _cache_get(key: str) -> Any:
    hit = _CACHE.get(key)
    if hit and (time.time() - hit[0]) < _CACHE_TTL:
        return hit[1]
    return None


def _cache_put(key: str, value: Any) -> None:
    _CACHE[key] = (time.time(), value)


# ══════════════════════════════════════════════════════════════════════════════
# DATA LOADERS
# ══════════════════════════════════════════════════════════════════════════════
def load_crypto_series(asset: str, days: int = 90) -> list[dict]:
    """Fetch a real CoinGecko price series. Returns [{t: ms, v: price}, ...] or
    [] on any error (no network, rate limit, bad id). Cached ~5 min."""
    coin_id = _TICKER_TO_ID.get(asset.lower().strip(), asset.lower().strip())
    key = f"crypto:{coin_id}:{days}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        import httpx

        resp = httpx.get(
            f"{_COINGECKO_BASE}/coins/{coin_id}/market_chart",
            params={"vs_currency": "usd", "days": str(days)},
            timeout=httpx.Timeout(15.0, connect=8.0),
        )
        resp.raise_for_status()
        prices = resp.json().get("prices", [])
        series = [{"t": int(p[0]), "v": float(p[1])} for p in prices if len(p) >= 2]
    except Exception:  # noqa: BLE001
        series = []
    if series:
        _cache_put(key, series)
    return series


def load_seismic_catalog(
    *,
    min_magnitude: float = 2.5,
    days: float = 30.0,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius_km: Optional[float] = None,
) -> list[dict]:
    """Fetch a USGS earthquake catalog (best-effort). Returns
    [{mag, lat, lng, time}, ...] or [] on error. Cached ~5 min."""
    starttime = time.strftime(
        "%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - days * 86400.0)
    )
    key = f"seis:{min_magnitude}:{days}:{latitude}:{longitude}:{radius_km}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    params: dict[str, Any] = {
        "format": "geojson",
        "starttime": starttime,
        "minmagnitude": str(min_magnitude),
        "limit": "20000",
    }
    if latitude is not None and longitude is not None and radius_km is not None:
        params.update(
            latitude=str(latitude),
            longitude=str(longitude),
            maxradiuskm=str(radius_km),
        )
    try:
        import httpx

        resp = httpx.get(_USGS_QUERY, params=params, timeout=httpx.Timeout(20.0, connect=8.0))
        resp.raise_for_status()
        feats = resp.json().get("features", [])
        catalog = []
        for f in feats:
            props = f.get("properties", {})
            coords = f.get("geometry", {}).get("coordinates", [])
            if props.get("mag") is None or len(coords) < 2:
                continue
            catalog.append(
                {
                    "mag": float(props["mag"]),
                    "lat": float(coords[1]),
                    "lng": float(coords[0]),
                    "time": props.get("time"),
                }
            )
    except Exception:  # noqa: BLE001
        catalog = []
    if catalog:
        _cache_put(key, catalog)
    return catalog


# ══════════════════════════════════════════════════════════════════════════════
# FORECASTERS
# ══════════════════════════════════════════════════════════════════════════════
def _infer_dt_years(timestamps: Optional[list], n: int) -> float:
    """Sampling interval in *years* (for annualising sigma). Defaults to daily."""
    if timestamps and len(timestamps) >= 2:
        diffs = np.diff(np.asarray(timestamps, dtype=float))
        diffs = diffs[diffs > 0]
        if diffs.size:
            med_ms = float(np.median(diffs))
            return med_ms / (1000.0 * 86400.0 * 365.25)
    return 1.0 / 365.25  # assume daily samples


def gbm_montecarlo_forecast(
    values: list[float],
    horizon_steps: int,
    *,
    timestamps: Optional[list] = None,
    n_paths: int = 10000,
    seed: Optional[int] = 42,
) -> dict:
    """Geometric Brownian Motion Monte-Carlo price forecast blended with an
    EWMA/Holt linear-trend estimate.

    Math:
        r_i  = ln(P_i / P_{i-1})                      (log-returns)
        mu_step  = mean(r), sigma_step = std(r)       (per sample interval)
        annualise: sigma_ann = sigma_step / sqrt(dt_yr); mu_ann = mu_step/dt_yr
        GBM: P_h = P_0 * exp( (mu_step - 0.5 sigma_step^2) h + sigma_step * Z*sqrt(h) )
             simulated over n_paths; report percentiles 5/25/50/75/95 and P(up).
        Holt linear trend (additive) gives a deterministic level+slope estimate;
        final point estimate = 0.5*(GBM median) + 0.5*(Holt level at horizon).
    """
    p = np.asarray(values, dtype=float)
    p = p[np.isfinite(p) & (p > 0)]
    if p.size < 3:
        raise ValueError("need >= 3 positive price points")
    p0 = float(p[-1])
    rets = np.diff(np.log(p))
    mu = float(np.mean(rets))
    sigma = float(np.std(rets, ddof=1)) if rets.size > 1 else 0.0
    dt_yr = _infer_dt_years(timestamps, p.size)
    sigma = max(sigma, 1e-9)
    sigma_ann = sigma / math.sqrt(dt_yr)
    mu_ann = mu / dt_yr

    h = int(max(1, horizon_steps))
    rng = np.random.default_rng(seed)
    # exact GBM terminal distribution: sum of h iid normal increments
    drift = (mu - 0.5 * sigma * sigma) * h
    diffusion = sigma * math.sqrt(h)
    z = rng.standard_normal(n_paths)
    terminal = p0 * np.exp(drift + diffusion * z)

    pct = {p_: float(np.percentile(terminal, p_)) for p_ in (5, 25, 50, 75, 95)}
    gbm_median = pct[50]
    p_up = float(np.mean(terminal > p0))

    # Holt linear trend (EWMA level + trend), additive, on prices.
    alpha, beta = 0.3, 0.1
    level = float(p[0])
    trend = float(p[1] - p[0]) if p.size > 1 else 0.0
    for x in p[1:]:
        prev_level = level
        level = alpha * float(x) + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1 - beta) * trend
    # Holt is a linear (additive) trend and can run negative over long horizons;
    # a price is non-negative, so floor it at 0 before blending (honest bound).
    holt_point = max(0.0, level + trend * h)

    point = 0.5 * gbm_median + 0.5 * holt_point

    return {
        "point_estimate": float(point),
        "gbm_median": float(gbm_median),
        "holt_estimate": float(holt_point),
        "interval": {"low": pct[5], "high": pct[95], "confidence": 0.90},
        "percentiles": pct,
        "probability_up": p_up,
        "drivers": {
            "p0": p0,
            "drift_per_step": mu,
            "volatility_per_step": sigma,
            "drift_annualized": mu_ann,
            "volatility_annualized": sigma_ann,
            "sampling_interval_years": dt_yr,
            "horizon_steps": h,
            "n_paths": int(n_paths),
        },
        "math": (
            "log-returns r=ln(P_i/P_{i-1}); mu,sigma per step; "
            "GBM P_h=P0*exp((mu-0.5*sigma^2)h+sigma*Z*sqrt(h)) Monte-Carlo "
            f"({n_paths} paths); sigma annualised /sqrt(dt); blended 50/50 with "
            "Holt linear-trend (alpha=0.3,beta=0.1)."
        ),
    }


def gutenberg_richter_poisson(
    magnitudes: list[float],
    *,
    target_magnitude: float,
    horizon_days: float,
    catalog_days: float,
    mc: Optional[float] = None,
) -> dict:
    """Fit Gutenberg-Richter (b, a) then a Poisson rate to estimate
    P(>=1 event >= target M in horizon T).

    Math:
        G-R: log10(N>=M) = a - b*M          (Aki/Utsu MLE b-value)
        expected count >= target in catalog window:
            N_target = 10^(a - b*M_target)
        Poisson rate lambda = N_target / catalog_days  (events/day)
        P(>=1 in T) = 1 - exp(-lambda * T)
    Reuses underworld gutenberg_richter_b_value when importable, else native MLE.
    """
    m = np.asarray([x for x in magnitudes if x is not None], dtype=float)
    if m.size < 2:
        raise ValueError("need >= 2 magnitudes to fit Gutenberg-Richter")
    if mc is None:
        mc = float(np.min(m))

    used_uw = False
    if _UW.get("gutenberg_richter_b_value") is not None:
        try:
            gr = _UW["gutenberg_richter_b_value"](list(m), mc=mc)
            b = float(gr["b_value"])
            a = float(gr["a_value"])
            n_events = int(gr["n_events"])
            b_err = float(gr.get("b_std_error", float("nan")))
            used_uw = True
        except Exception:  # noqa: BLE001
            used_uw = False
    if not used_uw:
        sel = m[m >= mc - 1e-12]
        n_events = int(sel.size)
        mean_m = float(np.mean(sel))
        delta_m = 0.1
        denom = mean_m - (mc - delta_m / 2.0)
        b = math.log10(math.e) / denom if denom > 0 else float("nan")
        a = math.log10(n_events) + b * mc
        var_m = float(np.sum((sel - mean_m) ** 2)) / (n_events * (n_events - 1)) if n_events > 1 else 0.0
        b_err = 2.30 * b * b * math.sqrt(var_m) if math.isfinite(b) else float("nan")

    n_target = 10.0 ** (a - b * target_magnitude)
    lam_per_day = n_target / max(catalog_days, 1e-9)
    prob = 1.0 - math.exp(-lam_per_day * horizon_days)
    expected_in_horizon = lam_per_day * horizon_days

    return {
        "probability": float(min(max(prob, 0.0), 1.0)),
        "expected_events": float(expected_in_horizon),
        "drivers": {
            "b_value": b,
            "a_value": a,
            "b_std_error": b_err,
            "mc": float(mc),
            "n_events": n_events,
            "rate_per_day": lam_per_day,
            "target_magnitude": float(target_magnitude),
            "used_underworld_gr": used_uw,
        },
        "math": (
            "G-R log10(N>=M)=a-b*M (Aki/Utsu MLE b); "
            "N_target=10^(a-b*M); lambda=N_target/catalog_days; "
            "P(>=1 in T)=1-exp(-lambda*T) (Poisson)."
        ),
        "used_underworld": used_uw,
    }


def omori_aftershock_probability(
    *, K: float, c_days: float, p: float, t_days: float, horizon_days: float
) -> dict:
    """Aftershock count in [t, t+T] via the modified Omori-Utsu law and a
    Poisson P(>=1). Reuses underworld omori_aftershock_rate when available."""
    used_uw = False
    if _UW.get("omori_aftershock_rate") is not None:
        try:
            r0 = _UW["omori_aftershock_rate"](t_days, K, c_days, p)
            r1 = _UW["omori_aftershock_rate"](t_days + horizon_days, K, c_days, p)
            cum = float(r1.get("cumulative", 0.0) - r0.get("cumulative", 0.0))
            used_uw = True
        except Exception:  # noqa: BLE001
            used_uw = False
    if not used_uw:
        if abs(p - 1.0) < 1e-12:
            cum = K * (math.log(t_days + horizon_days + c_days) - math.log(t_days + c_days))
        else:
            cum = K / (1 - p) * (
                (t_days + horizon_days + c_days) ** (1 - p) - (t_days + c_days) ** (1 - p)
            )
    prob = 1.0 - math.exp(-max(cum, 0.0))
    return {
        "probability": float(min(max(prob, 0.0), 1.0)),
        "expected_aftershocks": float(cum),
        "drivers": {"K": K, "c_days": c_days, "p": p, "t_days": t_days, "used_underworld": used_uw},
        "math": "Omori-Utsu n(t)=K/(t+c)^p; N=int over horizon; P=1-exp(-N).",
        "used_underworld": used_uw,
    }


def great_circle_forward(
    *,
    lat: float,
    lng: float,
    alt_m: float = 0.0,
    speed_mps: float,
    heading_deg: float,
    vertical_rate_mps: float = 0.0,
    minutes: float,
) -> dict:
    """Great-circle (haversine forward / direct geodesic on a sphere) projection
    of a state vector after t minutes.

    Math (spherical Earth, R=6371 km):
        d = speed * t                      (ground distance)
        delta = d / R                      (angular distance)
        lat2 = asin(sin lat1 cos delta + cos lat1 sin delta cos heading)
        lng2 = lng1 + atan2(sin heading sin delta cos lat1,
                            cos delta - sin lat1 sin lat2)
        alt2 = alt1 + vertical_rate * t
    """
    R = 6371000.0  # m
    t_s = minutes * 60.0
    d = speed_mps * t_s
    delta = d / R
    lat1 = math.radians(lat)
    lng1 = math.radians(lng)
    brng = math.radians(heading_deg)
    lat2 = math.asin(
        math.sin(lat1) * math.cos(delta) + math.cos(lat1) * math.sin(delta) * math.cos(brng)
    )
    lng2 = lng1 + math.atan2(
        math.sin(brng) * math.sin(delta) * math.cos(lat1),
        math.cos(delta) - math.sin(lat1) * math.sin(lat2),
    )
    lat2d = math.degrees(lat2)
    lng2d = (math.degrees(lng2) + 540.0) % 360.0 - 180.0  # normalise to [-180,180]
    alt2 = alt_m + vertical_rate_mps * t_s
    return {
        "lat": lat2d,
        "lng": lng2d,
        "alt_m": alt2,
        "ground_distance_m": d,
        "drivers": {
            "speed_mps": speed_mps,
            "heading_deg": heading_deg,
            "vertical_rate_mps": vertical_rate_mps,
            "minutes": minutes,
            "earth_radius_m": R,
        },
        "math": (
            "haversine direct: delta=d/R; "
            "lat2=asin(sin l1 cos d + cos l1 sin d cos h); "
            "lng2=l1+atan2(sin h sin d cos l1, cos d - sin l1 sin l2)."
        ),
    }


def fit_growth_series(
    values: list[float],
    horizon_steps: int,
    *,
    timestamps: Optional[list] = None,
) -> dict:
    """Fit exponential (doubling time) AND logistic (saturating) growth to a
    series; project to horizon with a CI from residual variance.

    Math:
        Exponential: ln(y) = ln(y0) + r*t  (OLS) -> y=y0*e^{r t}; T2=ln2/r.
        Logistic:    y = K / (1 + A e^{-r t}); K via fixed-grid search that
                     minimises SSE of the linearised logit, A,r by OLS on
                     logit(y/K). Better-fitting model (lower SSE) is chosen.
        CI: point +/- 1.96 * sigma_resid (residual std of chosen model on the
            original scale), clipped to >=0 for non-negative quantities.
    """
    y = np.asarray(values, dtype=float)
    y = y[np.isfinite(y)]
    n = y.size
    if n < 3:
        raise ValueError("need >= 3 points to fit growth")
    t = np.arange(n, dtype=float)

    # ── exponential (log-linear OLS) ──
    pos = y > 0
    exp_ok = pos.sum() >= 3
    if exp_ok:
        coef = np.polyfit(t[pos], np.log(y[pos]), 1)
        r_exp = float(coef[0])
        y0_exp = float(math.exp(coef[1]))
        exp_fit = y0_exp * np.exp(r_exp * t)
        sse_exp = float(np.sum((y - exp_fit) ** 2))
        doubling = math.log(2) / r_exp if r_exp > 1e-12 else float("inf")
    else:
        r_exp, y0_exp, sse_exp, doubling = float("nan"), float("nan"), float("inf"), float("inf")

    # ── logistic (grid over K, OLS on logit) ──
    best = None
    ymax = float(np.max(y))
    if ymax > 0:
        for kmult in np.linspace(1.05, 4.0, 40):
            K = ymax * kmult
            frac = np.clip(y / K, 1e-6, 1 - 1e-6)
            logit = np.log(frac / (1 - frac))
            c = np.polyfit(t, logit, 1)
            r_log = float(c[0])
            A = float(math.exp(-c[1]))
            fit = K / (1 + A * np.exp(-r_log * t))
            sse = float(np.sum((y - fit) ** 2))
            if best is None or sse < best["sse"]:
                best = {"K": K, "r": r_log, "A": A, "sse": sse}

    use_logistic = best is not None and best["sse"] < sse_exp
    last_t = float(n - 1)
    fut_t = last_t + float(max(1, horizon_steps))

    forecast = []
    if use_logistic:
        model = "logistic"
        K, r, A = best["K"], best["r"], best["A"]
        resid = y - (K / (1 + A * np.exp(-r * t)))
        sigma_r = float(np.std(resid, ddof=1)) if n > 1 else 0.0
        for step in range(1, int(max(1, horizon_steps)) + 1):
            tt = last_t + step
            v = K / (1 + A * math.exp(-r * tt))
            forecast.append({"t": tt, "v": v, "low": max(0.0, v - 1.96 * sigma_r), "high": v + 1.96 * sigma_r})
        point = K / (1 + A * math.exp(-r * fut_t))
        drivers = {"model": "logistic", "K": K, "growth_rate": r, "A": A, "doubling_time_exp": doubling}
    else:
        model = "exponential"
        resid = y - exp_fit if exp_ok else y - float(np.mean(y))
        sigma_r = float(np.std(resid, ddof=1)) if n > 1 else 0.0
        for step in range(1, int(max(1, horizon_steps)) + 1):
            tt = last_t + step
            v = y0_exp * math.exp(r_exp * tt)
            forecast.append({"t": tt, "v": v, "low": max(0.0, v - 1.96 * sigma_r), "high": v + 1.96 * sigma_r})
        point = y0_exp * math.exp(r_exp * fut_t)
        drivers = {"model": "exponential", "y0": y0_exp, "growth_rate": r_exp, "doubling_time": doubling}

    return {
        "point_estimate": float(point),
        "interval": {
            "low": float(max(0.0, point - 1.96 * sigma_r)),
            "high": float(point + 1.96 * sigma_r),
            "confidence": 0.95,
        },
        "forecast": forecast,
        "model": model,
        "drivers": drivers,
        "residual_std": sigma_r,
        "math": (
            "exp: ln(y)=ln(y0)+r t (OLS), T2=ln2/r; "
            "logistic: y=K/(1+A e^{-r t}), K grid-searched, A,r OLS on logit; "
            "pick lower-SSE; CI=point +/- 1.96*sigma_resid."
        ),
    }


# ══════════════════════════════════════════════════════════════════════════════
# ROUTER
# ══════════════════════════════════════════════════════════════════════════════
def _parse_horizon_hours(q: str) -> Optional[float]:
    """Parse '48h', 'in 2 days', '20 min', '3 weeks', or a target year."""
    ql = q.lower()
    m = re.search(r"in\s+(\d+(?:\.\d+)?)\s*(min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks|month|months|y|year|years)", ql)
    if not m:
        m = re.search(r"(\d+(?:\.\d+)?)\s*(min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks|month|months|y|year|years)\b", ql)
    if m:
        n = float(m.group(1))
        unit = m.group(2)
        if unit.startswith("min"):
            return n / 60.0
        if unit in ("h", "hr", "hour", "hours"):
            return n
        if unit in ("d", "day", "days"):
            return n * 24.0
        if unit in ("w", "week", "weeks"):
            return n * 24.0 * 7.0
        if unit.startswith("month"):
            return n * 24.0 * 30.0
        if unit in ("y", "year", "years"):
            return n * 24.0 * 365.25
    # bare future year, e.g. "by 2029"
    ym = re.search(r"\b(20[2-9]\d)\b", q)
    if ym:
        target_year = int(ym.group(1))
        now = time.gmtime()
        if target_year > now.tm_year:
            return (target_year - now.tm_year) * 365.25 * 24.0
    return None


def _find_ticker(q: str) -> Optional[str]:
    ql = q.lower()
    for tok in re.findall(r"[a-z\-]+", ql):
        if tok in _TICKER_TO_ID:
            return tok
    return None


def classify(question: str, params: Optional[dict] = None) -> dict:
    """Route a question -> {domain, target, horizon_hours, params, used_llm}.

    Tries Kimi for structured NL extraction (best-effort, key-optional); always
    falls back to a robust regex/keyword parser so it works offline."""
    params = dict(params or {})
    q = question or ""
    ql = q.lower()
    used_llm = False

    out = {
        "domain": None,
        "target": params.get("target"),
        "horizon_hours": params.get("horizon_hours"),
        "params": params,
        "used_llm": False,
    }

    # 1. LLM (best-effort)
    llm = _kimi_extract(q) if not params.get("domain") else None
    if llm and llm.get("domain") in ("crypto", "seismic", "trajectory", "growth", "generic"):
        used_llm = True
        out["domain"] = llm["domain"]
        out["target"] = out["target"] or llm.get("target")
        if out["horizon_hours"] is None and llm.get("horizon_hours") is not None:
            out["horizon_hours"] = float(llm["horizon_hours"])
        for k in ("magnitude", "latitude", "longitude"):
            if llm.get(k) is not None and k not in params:
                params[k] = llm[k]

    # 2. explicit param override
    if params.get("domain"):
        out["domain"] = params["domain"]

    # 3. regex/keyword fallback for domain
    if not out["domain"]:
        ticker = _find_ticker(q)
        if ticker or any(w in ql for w in ("price", "crypto", "coin", "bitcoin", "stock", "$")):
            out["domain"] = "crypto"
            out["target"] = out["target"] or ticker
        elif any(w in ql for w in ("earthquake", "quake", "seismic", "magnitude", "aftershock", "tremor")):
            out["domain"] = "seismic"
        elif any(w in ql for w in ("flight", "plane", "aircraft", "trajectory", "projectile", "missile", "orbit", "satellite", "heading", "position")):
            out["domain"] = "trajectory"
        elif any(w in ql for w in ("growth", "users", "subscribers", "doubling", "adoption", "spread", "saturate", "logistic", "exponential")):
            out["domain"] = "growth"
        else:
            out["domain"] = "generic"

    # crypto target backfill
    if out["domain"] == "crypto" and not out["target"]:
        out["target"] = _find_ticker(q)

    # horizon backfill
    if out["horizon_hours"] is None:
        out["horizon_hours"] = _parse_horizon_hours(q)

    # seismic params from text
    if out["domain"] == "seismic":
        if "magnitude" not in params:
            mm = re.search(r"(?:magnitude|mag|m)\s*(\d(?:\.\d+)?)", ql)
            if mm:
                params["magnitude"] = float(mm.group(1))
        latlng = re.search(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)", q)
        if latlng and "latitude" not in params:
            params["latitude"] = float(latlng.group(1))
            params["longitude"] = float(latlng.group(2))

    out["params"] = params
    out["used_llm"] = used_llm
    return out


# ══════════════════════════════════════════════════════════════════════════════
# ORCHESTRATION
# ══════════════════════════════════════════════════════════════════════════════
def _insufficient(question, domain, target, horizon, needs, used_llm) -> dict:
    return {
        "question": question,
        "domain": domain,
        "target": target,
        "horizon": horizon,
        "prediction": {
            "value": None,
            "unit": None,
            "point_estimate": None,
            "interval": {"low": None, "high": None, "confidence": 0.0},
            "probability": None,
        },
        "method": {"name": "insufficient_data", "family": domain or "unknown", "models_used": [], "math": ""},
        "drivers": {},
        "data": {"source": None, "as_of": None, "lookback": None, "history": [], "forecast": []},
        "assumptions": [],
        "caveats": [f"Insufficient data to answer. Needs: {needs}"],
        "used_llm": used_llm,
    }


def _series_from_params(params: dict) -> tuple[list[float], Optional[list], Optional[str]]:
    """Extract a (values, timestamps, source) triple from supplied params.
    Accepts: 'series'=[{t,v}|number], 'values'=[number], 'prices'=[number]."""
    raw = params.get("series") or params.get("values") or params.get("prices")
    if not raw:
        return [], None, None
    values: list[float] = []
    ts: list = []
    for item in raw:
        if isinstance(item, dict):
            values.append(float(item.get("v", item.get("value"))))
            if "t" in item or "time" in item:
                ts.append(float(item.get("t", item.get("time"))))
        else:
            values.append(float(item))
    return values, (ts if len(ts) == len(values) and ts else None), "params"


def predict(question: str, params: Optional[dict] = None) -> dict:
    """Top-level: classify -> load data -> forecast -> assemble schema.

    Never raises on a normal question: any failure returns a structured
    insufficient-data result. ``params`` may carry the data series directly so
    the engine works fully offline / deterministically (used by the tests)."""
    params = dict(params or {})
    try:
        route = classify(question, params)
    except Exception:  # noqa: BLE001
        route = {"domain": "generic", "target": None, "horizon_hours": None, "params": params, "used_llm": False}
    domain = route["domain"]
    target = route.get("target")
    horizon_hours = route.get("horizon_hours")
    params = route.get("params", params)
    used_llm = route.get("used_llm", False)

    try:
        if domain == "crypto":
            return _predict_crypto(question, target, horizon_hours, params, used_llm)
        if domain == "seismic":
            return _predict_seismic(question, target, horizon_hours, params, used_llm)
        if domain == "trajectory":
            return _predict_trajectory(question, target, horizon_hours, params, used_llm)
        if domain == "growth":
            return _predict_growth(question, target, horizon_hours, params, used_llm)
        return _predict_generic(question, target, horizon_hours, params, used_llm)
    except Exception as exc:  # noqa: BLE001 - never 500 a normal query
        res = _insufficient(question, domain, target, _horizon_label(horizon_hours), str(exc), used_llm)
        res["caveats"].append("An internal error was caught and handled; result degraded gracefully.")
        return res


def _horizon_label(hours: Optional[float]) -> Optional[str]:
    if hours is None:
        return None
    if hours < 1:
        return f"{hours * 60:.0f} min"
    if hours < 48:
        return f"{hours:.0f}h"
    if hours < 24 * 60:
        return f"{hours / 24:.1f}d"
    return f"{hours / 24 / 365.25:.2f}y"


# ── domain handlers ────────────────────────────────────────────────────────────
def _predict_crypto(question, target, horizon_hours, params, used_llm) -> dict:
    values, ts, source = _series_from_params(params)
    lookback_days = int(params.get("lookback_days", 90))
    if not values and target:
        series = load_crypto_series(target, days=lookback_days)
        if series:
            values = [s["v"] for s in series]
            ts = [s["t"] for s in series]
            source = f"CoinGecko /coins/{_TICKER_TO_ID.get(target.lower(), target.lower())}/market_chart"
    if len(values) < 3:
        return _insufficient(
            question, "crypto", target, _horizon_label(horizon_hours),
            "a price series via params.series/values, or a recognised ticker with network access", used_llm,
        )

    # horizon in *steps* of the sampling interval (default daily) ~ from hours.
    dt_yr = _infer_dt_years(ts, len(values))
    step_hours = dt_yr * 365.25 * 24.0
    h_hours = horizon_hours if horizon_hours is not None else 24.0
    horizon_steps = max(1, int(round(h_hours / max(step_hours, 1e-9))))

    fc = gbm_montecarlo_forecast(values, horizon_steps, timestamps=ts)
    last_t = ts[-1] if ts else None
    forecast_points = []
    pe, lo, hi = fc["point_estimate"], fc["interval"]["low"], fc["interval"]["high"]
    if last_t is not None:
        forecast_points = [{"t": last_t + horizon_steps * step_hours * 3600 * 1000, "v": pe, "low": lo, "high": hi}]

    history = (
        [{"t": ts[i], "v": values[i]} for i in range(len(values))]
        if ts else [{"t": i, "v": v} for i, v in enumerate(values)]
    )
    return {
        "question": question,
        "domain": "crypto",
        "target": target,
        "horizon": _horizon_label(h_hours),
        "prediction": {
            "value": pe,
            "unit": "USD",
            "point_estimate": pe,
            "interval": {"low": lo, "high": hi, "confidence": fc["interval"]["confidence"]},
            "probability": fc["probability_up"],
        },
        "method": {
            "name": "GBM Monte-Carlo + Holt blend",
            "family": "time_series",
            "models_used": ["geometric_brownian_motion_montecarlo", "holt_linear_trend"],
            "math": fc["math"],
        },
        "drivers": fc["drivers"] | {"percentiles": fc["percentiles"], "probability_up": fc["probability_up"]},
        "data": {
            "source": source or "params",
            "as_of": last_t,
            "lookback": f"{len(values)} samples",
            "history": history[-200:],
            "forecast": forecast_points,
        },
        "assumptions": [
            "Log-returns are i.i.d. Gaussian (Geometric Brownian Motion).",
            "Drift and volatility are constant over the forecast horizon.",
            f"Sampling interval inferred as ~{step_hours:.1f}h; sigma annualised accordingly.",
        ],
        "caveats": [
            "Crypto is heavy-tailed and regime-switching; real tails are fatter than Gaussian.",
            "Not financial advice. The interval is a model band, not a guarantee.",
            "P(up) is the Monte-Carlo fraction of terminal paths above the last price.",
        ],
        "used_llm": used_llm,
    }


def _predict_seismic(question, target, horizon_hours, params, used_llm) -> dict:
    target_mag = float(params.get("magnitude", 5.0))
    horizon_days = (horizon_hours / 24.0) if horizon_hours is not None else 30.0

    # aftershock branch (Omori) when mainshock params supplied
    if params.get("omori") or params.get("mainshock_K") is not None:
        K = float(params.get("mainshock_K", params.get("omori", {}).get("K", 100.0)))
        c = float(params.get("omori_c", 0.05))
        p = float(params.get("omori_p", 1.1))
        t_since = float(params.get("days_since_mainshock", 1.0))
        om = omori_aftershock_probability(K=K, c_days=c, p=p, t_days=t_since, horizon_days=horizon_days)
        return _seismic_result(
            question, target, horizon_hours, used_llm, om,
            name="Omori-Utsu aftershock decay", models=["omori_aftershock_rate"],
            mags=[], source="params (mainshock state)", target_mag=target_mag,
            assumptions=[
                "Aftershocks follow the modified Omori-Utsu law n(t)=K/(t+c)^p.",
                "Occurrence is an inhomogeneous Poisson process with this rate.",
            ],
        )

    mags, _, source = _seismic_mags_from_params(params)
    catalog_days = float(params.get("catalog_days", 30.0))
    if not mags:
        cat = load_seismic_catalog(
            min_magnitude=float(params.get("min_magnitude", 2.5)),
            days=catalog_days,
            latitude=params.get("latitude"),
            longitude=params.get("longitude"),
            radius_km=params.get("radius_km"),
        )
        if cat:
            mags = [c["mag"] for c in cat]
            source = "USGS fdsnws/event/1/query"
    if len(mags) < 2:
        return _insufficient(
            question, "seismic", target, _horizon_label(horizon_hours),
            "a magnitude catalog via params.magnitudes, or network access to USGS", used_llm,
        )
    gr = gutenberg_richter_poisson(
        mags, target_magnitude=target_mag, horizon_days=horizon_days, catalog_days=catalog_days
    )
    return _seismic_result(
        question, target, horizon_hours, used_llm, gr,
        name="Gutenberg-Richter + Poisson", models=["gutenberg_richter_b_value", "poisson_rate"],
        mags=mags, source=source, target_mag=target_mag,
        assumptions=[
            "Earthquake magnitudes follow the Gutenberg-Richter frequency-magnitude law.",
            "Occurrence is a stationary Poisson process at the fitted rate.",
            f"Catalog complete above Mc; window = {catalog_days:.0f} days.",
        ],
    )


def _seismic_mags_from_params(params: dict):
    raw = params.get("magnitudes") or params.get("catalog")
    if not raw:
        return [], None, None
    mags = [float(x["mag"]) if isinstance(x, dict) else float(x) for x in raw]
    return mags, None, "params"


def _seismic_result(question, target, horizon_hours, used_llm, model_out, *, name, models, mags, source, target_mag, assumptions) -> dict:
    return {
        "question": question,
        "domain": "seismic",
        "target": target or f"M>={target_mag}",
        "horizon": _horizon_label(horizon_hours) or "30d",
        "prediction": {
            "value": model_out["probability"],
            "unit": "probability",
            "point_estimate": model_out["probability"],
            "interval": {"low": 0.0, "high": 1.0, "confidence": 0.0},
            "probability": model_out["probability"],
        },
        "method": {"name": name, "family": "event_probability", "models_used": models, "math": model_out["math"]},
        "drivers": model_out["drivers"],
        "data": {
            "source": source,
            "as_of": int(time.time() * 1000),
            "lookback": f"{len(mags)} events" if mags else "mainshock state",
            "history": [{"t": i, "v": m} for i, m in enumerate(mags)][:500],
            "forecast": [{"t": "horizon", "v": model_out["probability"], "low": 0.0, "high": 1.0}],
        },
        "assumptions": assumptions,
        "caveats": [
            "Poisson stationarity ignores clustering / triggering beyond the model used.",
            "Probability is for AT LEAST ONE event of the target magnitude in the horizon.",
            "G-R extrapolation to large M above the catalog max is uncertain.",
        ],
        "used_llm": used_llm,
    }


def _predict_trajectory(question, target, horizon_hours, params, used_llm) -> dict:
    minutes = (horizon_hours * 60.0) if horizon_hours is not None else float(params.get("minutes", 10.0))

    # orbital period query
    if params.get("semi_major_axis_km") or "orbit" in (question or "").lower() and params.get("a_km"):
        a_km = float(params.get("semi_major_axis_km", params.get("a_km")))
        if _UW.get("orbital_period"):
            orb = _UW["orbital_period"](a_km=a_km)
            period_min = orb["period_min"]
            used_uw = True
        else:
            mu = 398600.4418
            period_min = 2 * math.pi * math.sqrt(a_km ** 3 / mu) / 60.0
            used_uw = False
        return _trajectory_result(
            question, target, horizon_hours, used_llm,
            value=period_min, unit="minutes", point=period_min,
            name="Orbital period (Kepler III)", models=["orbital_period"],
            drivers={"semi_major_axis_km": a_km, "used_underworld": used_uw},
            math="T=2*pi*sqrt(a^3/mu) (Kepler's third law).",
            forecast=[{"t": "period", "v": period_min, "low": period_min, "high": period_min}],
            assumptions=["Two-body Keplerian orbit about Earth (mu=398600 km^3/s^2)."],
            extra_caveats=["Ignores J2 oblateness, drag, and third-body perturbations."],
        )

    # ballistic projectile query
    if params.get("projectile") or (params.get("speed") is not None and params.get("angle_deg") is not None):
        speed = float(params.get("speed", 100.0))
        angle = float(params.get("angle_deg", 45.0))
        if _UW.get("projectile_range"):
            pr = _UW["projectile_range"](speed=speed, angle_deg=angle, height0=float(params.get("height0", 0.0)))
            rng = pr["range"]
            used_uw = True
        else:
            g = 9.80665
            rng = speed * speed * math.sin(math.radians(2 * angle)) / g
            used_uw = False
        return _trajectory_result(
            question, target, horizon_hours, used_llm,
            value=rng, unit="meters", point=rng,
            name="Ballistic projectile range", models=["projectile_range"],
            drivers={"speed_mps": speed, "angle_deg": angle, "used_underworld": used_uw},
            math="R=v^2 sin(2*theta)/g (no drag, flat ground).",
            forecast=[{"t": "impact", "v": rng, "low": rng, "high": rng}],
            assumptions=["No aerodynamic drag; flat ground; constant g."],
            extra_caveats=["Real ballistics need drag, wind, and Coriolis corrections."],
        )

    # great-circle flight extrapolation (default)
    sv = params.get("state_vector") or params
    if sv.get("lat") is None or sv.get("lng") is None or sv.get("speed_mps") is None or sv.get("heading_deg") is None:
        return _insufficient(
            question, "trajectory", target, _horizon_label(horizon_hours),
            "a state vector params.{lat,lng,alt_m,speed_mps,heading_deg,vertical_rate_mps} "
            "(no live ADS-B feed; supply current state), or projectile/orbital params", used_llm,
        )
    gc = great_circle_forward(
        lat=float(sv["lat"]), lng=float(sv["lng"]), alt_m=float(sv.get("alt_m", 0.0)),
        speed_mps=float(sv["speed_mps"]), heading_deg=float(sv["heading_deg"]),
        vertical_rate_mps=float(sv.get("vertical_rate_mps", 0.0)), minutes=minutes,
    )
    return {
        "question": question,
        "domain": "trajectory",
        "target": target or "great_circle_position",
        "horizon": _horizon_label(horizon_hours) or f"{minutes:.0f} min",
        "prediction": {
            "value": None,
            "unit": "lat/lng/alt",
            "point_estimate": {"lat": gc["lat"], "lng": gc["lng"], "alt_m": gc["alt_m"]},
            "interval": {"low": None, "high": None, "confidence": 0.0},
            "probability": None,
        },
        "method": {"name": "Great-circle forward (haversine)", "family": "trajectory", "models_used": ["great_circle_forward"], "math": gc["math"]},
        "drivers": gc["drivers"] | {"predicted_lat": gc["lat"], "predicted_lng": gc["lng"], "ground_distance_m": gc["ground_distance_m"]},
        "data": {
            "source": "params (state vector)",
            "as_of": int(time.time() * 1000),
            "lookback": "single state vector",
            "history": [{"t": 0, "v": {"lat": float(sv["lat"]), "lng": float(sv["lng"])}}],
            "forecast": [{"t": minutes, "v": {"lat": gc["lat"], "lng": gc["lng"], "alt_m": gc["alt_m"]}, "low": None, "high": None}],
        },
        "assumptions": [
            "Constant speed, heading, and vertical rate over the horizon.",
            "Spherical Earth (R=6371 km); great-circle (geodesic) track.",
        ],
        "caveats": [
            "No live ADS-B feed: the supplied state vector is taken as ground truth.",
            "Real aircraft change heading/speed; this is a straight-track extrapolation.",
        ],
        "used_llm": used_llm,
    }


def _trajectory_result(question, target, horizon_hours, used_llm, *, value, unit, point, name, models, drivers, math, forecast, assumptions, extra_caveats) -> dict:
    return {
        "question": question,
        "domain": "trajectory",
        "target": target or name,
        "horizon": _horizon_label(horizon_hours),
        "prediction": {
            "value": value,
            "unit": unit,
            "point_estimate": point,
            "interval": {"low": None, "high": None, "confidence": 0.0},
            "probability": None,
        },
        "method": {"name": name, "family": "trajectory", "models_used": models, "math": math},
        "drivers": drivers,
        "data": {"source": "params", "as_of": int(time.time() * 1000), "lookback": "analytic", "history": [], "forecast": forecast},
        "assumptions": assumptions,
        "caveats": ["Analytic idealisation; point estimate has no statistical interval."] + extra_caveats,
        "used_llm": used_llm,
    }


def _predict_growth(question, target, horizon_hours, params, used_llm) -> dict:
    values, ts, source = _series_from_params(params)
    if len(values) < 3:
        return _insufficient(
            question, "growth", target, _horizon_label(horizon_hours),
            "a numeric series via params.series/values (>= 3 points)", used_llm,
        )
    horizon_steps = int(params.get("horizon_steps", 0)) or _growth_steps(horizon_hours, ts, len(values))
    fc = fit_growth_series(values, horizon_steps, timestamps=ts)
    history = [{"t": ts[i] if ts else i, "v": values[i]} for i in range(len(values))]
    return {
        "question": question,
        "domain": "growth",
        "target": target,
        "horizon": _horizon_label(horizon_hours) or f"{horizon_steps} steps",
        "prediction": {
            "value": fc["point_estimate"],
            "unit": params.get("unit"),
            "point_estimate": fc["point_estimate"],
            "interval": fc["interval"],
            "probability": None,
        },
        "method": {
            "name": f"{fc['model']} growth fit",
            "family": "growth",
            "models_used": ["exponential_fit", "logistic_fit"],
            "math": fc["math"],
        },
        "drivers": fc["drivers"] | {"residual_std": fc["residual_std"]},
        "data": {
            "source": source or "params",
            "as_of": (ts[-1] if ts else None),
            "lookback": f"{len(values)} points",
            "history": history,
            "forecast": fc["forecast"],
        },
        "assumptions": [
            f"Best-fit model selected by SSE: {fc['model']}.",
            "Residuals are homoscedastic; CI is +/-1.96*sigma_resid (95%).",
            "Growth regime is stable over the forecast horizon.",
        ],
        "caveats": [
            "Exponential growth cannot continue indefinitely; check the logistic K.",
            "Short series make the fit and CI unreliable.",
        ],
        "used_llm": used_llm,
    }


def _growth_steps(horizon_hours, ts, n) -> int:
    if horizon_hours is None:
        return max(1, n // 4)
    if ts and len(ts) >= 2:
        step_hours = _infer_dt_years(ts, n) * 365.25 * 24.0
        return max(1, int(round(horizon_hours / max(step_hours, 1e-9))))
    return max(1, int(round(horizon_hours / 24.0)))  # assume daily steps


def _predict_generic(question, target, horizon_hours, params, used_llm) -> dict:
    """Generic numeric series -> reuse the growth fitter (exp/logistic + CI)."""
    values, ts, source = _series_from_params(params)
    if len(values) >= 3:
        res = _predict_growth(question, target, horizon_hours, params, used_llm)
        res["domain"] = "generic"
        return res
    return _insufficient(
        question, "generic", target, _horizon_label(horizon_hours),
        "a numeric series via params.series/values to forecast, or a more specific "
        "question (crypto ticker, seismic magnitude+region, trajectory state vector)",
        used_llm,
    )
