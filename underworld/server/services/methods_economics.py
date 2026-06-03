"""Real economics & finance simulation methods.

Eight named, real economics/finance methods, each computed from its canonical
published formula and each verified in the test suite against a KNOWN value:

  1. compound_interest_fv     — time value of money (FV = PV*(1+r)^n)
  2. capm_expected_return      — CAPM (E[R] = Rf + beta*(Rm - Rf))
  3. market_equilibrium        — supply/demand intersection price & quantity
  4. gini_coefficient          — income inequality (Gini of perfect equality = 0)
  5. nash_equilibrium_2x2      — pure-strategy Nash eq. of a 2x2 game
  6. black_scholes_delta       — option Greek delta = N(d1) (deep ITM call ~ 1)
  7. bond_price_ytm            — bond pricing & yield (par bond price = face)
  8. price_elasticity_demand   — point/arc elasticity (unit elasticity = 1)

Sources: Wikipedia (Time value of money, Capital asset pricing model,
Economic equilibrium, Gini coefficient, Nash equilibrium, Greeks (finance),
Bond valuation, Price elasticity of demand); Black & Scholes (1973).
"""
from __future__ import annotations

import numpy as np
from scipy.stats import norm
from scipy.optimize import brentq


# 1. TIME VALUE OF MONEY — COMPOUND INTEREST / PRESENT VALUE -----------------
def compound_interest_fv(*, present_value: float, annual_rate: float,
                         years: float, compounds_per_year: int = 1) -> dict:
    """Future value of a present sum under compound interest, and its inverse.

    FV = PV * (1 + r/m)^(m*n)      (m = compounding periods per year)
    PV = FV / (1 + r/m)^(m*n)

    Known check: PV=1000, r=5%, n=10, annual compounding ->
    FV = 1000*(1.05)^10 = 1628.894627...
    """
    m = int(compounds_per_year)
    if m < 1:
        raise ValueError("compounds_per_year must be >= 1")
    periodic_rate = annual_rate / m
    n_periods = m * years
    growth = (1.0 + periodic_rate) ** n_periods
    future_value = present_value * growth
    # effective annual rate (EAR)
    ear = (1.0 + periodic_rate) ** m - 1.0
    return {
        "future_value": float(future_value),
        "present_value": float(present_value),
        "growth_factor": float(growth),
        "effective_annual_rate": float(ear),
        # round-trip discount of FV back to PV (verifies inverse)
        "discounted_back_pv": float(future_value / growth),
    }


# 2. CAPITAL ASSET PRICING MODEL ---------------------------------------------
def capm_expected_return(*, risk_free_rate: float, beta: float,
                         market_return: float) -> dict:
    """CAPM expected return of an asset given its systematic risk (beta).

    E[R] = Rf + beta * (Rm - Rf)

    Known check: Rf=3%, beta=1.5, Rm=8% -> 0.03 + 1.5*(0.05) = 0.105 (10.5%).
    A beta of 1 returns exactly the market return.
    """
    equity_risk_premium = market_return - risk_free_rate
    expected_return = risk_free_rate + beta * equity_risk_premium
    return {
        "expected_return": float(expected_return),
        "expected_return_percent": float(expected_return * 100.0),
        "equity_risk_premium": float(equity_risk_premium),
        "risk_premium_on_asset": float(beta * equity_risk_premium),
    }


# 3. SUPPLY / DEMAND MARKET EQUILIBRIUM --------------------------------------
def market_equilibrium(*, demand_intercept: float, demand_slope: float,
                       supply_intercept: float, supply_slope: float) -> dict:
    """Competitive market equilibrium for linear supply & demand schedules.

    Demand:  Qd = a - b*P     (a = demand_intercept, b = demand_slope > 0)
    Supply:  Qs = c + d*P     (c = supply_intercept, d = supply_slope > 0)
    Equilibrium where Qd = Qs:
        P* = (a - c) / (b + d)
        Q* = a - b*P*

    Known check: Qd = 100 - 2P, Qs = 20 + 2P -> P* = 20, Q* = 60.
    """
    b = demand_slope
    d = supply_slope
    if (b + d) == 0:
        raise ValueError("supply and demand slopes cannot cancel")
    p_star = (demand_intercept - supply_intercept) / (b + d)
    q_demand = demand_intercept - b * p_star
    q_supply = supply_intercept + d * p_star
    return {
        "equilibrium_price": float(p_star),
        "equilibrium_quantity": float(q_demand),
        "quantity_supplied": float(q_supply),
        "market_clears": bool(abs(q_demand - q_supply) < 1e-9),
    }


# 4. GINI COEFFICIENT --------------------------------------------------------
def gini_coefficient(*, incomes) -> dict:
    """Gini coefficient of an income distribution (relative mean abs. diff.).

    G = sum_i sum_j |x_i - x_j| / (2 * n^2 * mean(x))

    Known check: a perfectly equal distribution has G = 0;
    the maximally unequal n-person distribution (one earner) has G -> 1 - 1/n.
    """
    x = np.asarray(incomes, dtype=float)
    if x.size == 0:
        raise ValueError("incomes must be non-empty")
    if np.any(x < 0):
        raise ValueError("incomes must be non-negative")
    n = x.size
    mu = x.mean()
    if mu == 0:
        gini = 0.0
    else:
        abs_diff_sum = np.abs(x[:, None] - x[None, :]).sum()
        gini = abs_diff_sum / (2.0 * n * n * mu)
    return {
        "gini": float(gini),
        "n": int(n),
        "mean_income": float(mu),
        "max_possible_gini": float(1.0 - 1.0 / n),
    }


# 5. NASH EQUILIBRIUM OF A 2x2 GAME ------------------------------------------
def nash_equilibrium_2x2(*, row_payoffs, col_payoffs) -> dict:
    """Pure-strategy Nash equilibria of a 2x2 normal-form game.

    `row_payoffs[i][j]`, `col_payoffs[i][j]` give the row/column player payoff
    when row plays i (0/1) and column plays j (0/1). A cell (i,j) is a Nash
    equilibrium iff neither player can improve by a unilateral deviation:
      row_payoffs[i][j]  >= row_payoffs[1-i][j]   and
      col_payoffs[i][j]  >= col_payoffs[i][1-j].

    Known check (Prisoner's Dilemma, payoffs = years saved, higher is better):
    Defect strictly dominates Cooperate for both players, so the unique pure
    Nash equilibrium is (Defect, Defect) = cell (1,1).
    """
    R = np.asarray(row_payoffs, dtype=float)
    C = np.asarray(col_payoffs, dtype=float)
    if R.shape != (2, 2) or C.shape != (2, 2):
        raise ValueError("payoff matrices must be 2x2")
    equilibria = []
    for i in (0, 1):
        for j in (0, 1):
            row_best = R[i, j] >= R[1 - i, j]
            col_best = C[i, j] >= C[i, 1 - j]
            if row_best and col_best:
                equilibria.append((i, j))
    # strictly dominant strategy detection per player
    row_dominant = None
    if R[0, 0] > R[1, 0] and R[0, 1] > R[1, 1]:
        row_dominant = 0
    elif R[1, 0] > R[0, 0] and R[1, 1] > R[0, 1]:
        row_dominant = 1
    col_dominant = None
    if C[0, 0] > C[0, 1] and C[1, 0] > C[1, 1]:
        col_dominant = 0
    elif C[0, 1] > C[0, 0] and C[1, 1] > C[1, 0]:
        col_dominant = 1
    return {
        "pure_nash_equilibria": [list(e) for e in equilibria],
        "num_pure_equilibria": int(len(equilibria)),
        "row_dominant_strategy": row_dominant,
        "col_dominant_strategy": col_dominant,
    }


# 6. BLACK-SCHOLES OPTION GREEK — DELTA --------------------------------------
def black_scholes_delta(*, spot: float, strike: float, time_to_expiry: float,
                        risk_free_rate: float, volatility: float,
                        option_type: str = "call") -> dict:
    """Black-Scholes price and delta (Greek) of a European option.

    d1 = [ln(S/K) + (r + sigma^2/2) T] / (sigma sqrt(T))
    d2 = d1 - sigma sqrt(T)
    Call: price = S N(d1) - K e^{-rT} N(d2),  delta_call = N(d1)
    Put : price = K e^{-rT} N(-d2) - S N(-d1), delta_put = N(d1) - 1

    Known check: a deep in-the-money call (S>>K) has delta -> 1.0;
    a deep out-of-the-money call has delta -> 0.
    """
    S, K, T, r, sigma = spot, strike, time_to_expiry, risk_free_rate, volatility
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        raise ValueError("S, K, T, sigma must be positive")
    sqrtT = np.sqrt(T)
    d1 = (np.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
    d2 = d1 - sigma * sqrtT
    disc = np.exp(-r * T)
    if option_type == "call":
        delta = norm.cdf(d1)
        price = S * norm.cdf(d1) - K * disc * norm.cdf(d2)
    elif option_type == "put":
        delta = norm.cdf(d1) - 1.0
        price = K * disc * norm.cdf(-d2) - S * norm.cdf(-d1)
    else:
        raise ValueError("option_type must be 'call' or 'put'")
    return {
        "price": float(price),
        "delta": float(delta),
        "d1": float(d1),
        "d2": float(d2),
        "option_type": option_type,
    }


# 7. BOND PRICING / YIELD TO MATURITY ----------------------------------------
def bond_price_ytm(*, face_value: float, coupon_rate: float, years: float,
                   yield_to_maturity: float | None = None,
                   payments_per_year: int = 1, market_price: float | None = None
                   ) -> dict:
    """Price a coupon bond from its yield, or solve for YTM from a market price.

    Price = sum_{t=1}^{N} C/(1+y)^t + F/(1+y)^N
      with per-period coupon C = face*coupon_rate/m, periods N = m*years,
      per-period yield y = ytm/m.

    Known check: when YTM == coupon_rate the bond trades at par (price = face).
    If `market_price` is given, YTM is solved numerically (Newton/Brent).

    Pass exactly one of `yield_to_maturity` or `market_price`.
    """
    m = int(payments_per_year)
    if m < 1:
        raise ValueError("payments_per_year must be >= 1")
    n_periods = int(round(m * years))
    coupon = face_value * coupon_rate / m

    def price_from_yield(ytm_annual: float) -> float:
        y = ytm_annual / m
        t = np.arange(1, n_periods + 1)
        if y == 0.0:
            return float(coupon * n_periods + face_value)
        pv_coupons = coupon * np.sum(1.0 / (1.0 + y) ** t)
        pv_face = face_value / (1.0 + y) ** n_periods
        return float(pv_coupons + pv_face)

    if (yield_to_maturity is None) == (market_price is None):
        raise ValueError("provide exactly one of yield_to_maturity / market_price")

    if yield_to_maturity is not None:
        price = price_from_yield(yield_to_maturity)
        solved_ytm = yield_to_maturity
    else:
        solved_ytm = brentq(lambda y: price_from_yield(y) - market_price,
                             -0.99, 10.0, xtol=1e-12)
        price = float(market_price)

    return {
        "price": float(price),
        "yield_to_maturity": float(solved_ytm),
        "coupon_payment": float(coupon),
        "num_periods": int(n_periods),
        "trades_at_par": bool(abs(price - face_value) < 1e-6),
    }


# 8. PRICE ELASTICITY OF DEMAND ----------------------------------------------
def price_elasticity_demand(*, price1: float, quantity1: float,
                            price2: float, quantity2: float,
                            method: str = "arc") -> dict:
    """Price elasticity of demand from two (price, quantity) observations.

    Arc (midpoint) elasticity:
        E = (dQ / avg_Q) / (dP / avg_P)
    Point elasticity (relative to point 1):
        E = (dQ / Q1) / (dP / P1)

    Reported value is the magnitude |E|; demand is "unit elastic" when |E| = 1.

    Known check: P 10->20 (midpoint 15) with Q 100->50 (midpoint 75):
    %dQ = -50/75 = -0.6667, %dP = 10/15 = 0.6667 -> |E| = 1 (unit elastic).
    """
    dP = price2 - price1
    dQ = quantity2 - quantity1
    if dP == 0:
        raise ValueError("prices must differ")
    if method == "arc":
        avg_p = (price1 + price2) / 2.0
        avg_q = (quantity1 + quantity2) / 2.0
        pct_q = dQ / avg_q
        pct_p = dP / avg_p
    elif method == "point":
        pct_q = dQ / quantity1
        pct_p = dP / price1
    else:
        raise ValueError("method must be 'arc' or 'point'")
    elasticity = pct_q / pct_p
    magnitude = abs(elasticity)
    if magnitude > 1.0 + 1e-12:
        classification = "elastic"
    elif magnitude < 1.0 - 1e-12:
        classification = "inelastic"
    else:
        classification = "unit_elastic"
    return {
        "elasticity": float(elasticity),
        "elasticity_magnitude": float(magnitude),
        "classification": classification,
        "percent_change_quantity": float(pct_q),
        "percent_change_price": float(pct_p),
    }
