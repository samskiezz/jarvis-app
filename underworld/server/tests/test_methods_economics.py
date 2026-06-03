"""Verification tests for methods_economics — each asserts a computed result
matches a KNOWN published value.
"""
import numpy as np

from underworld.server.services.methods_economics import (
    compound_interest_fv,
    capm_expected_return,
    market_equilibrium,
    gini_coefficient,
    nash_equilibrium_2x2,
    black_scholes_delta,
    bond_price_ytm,
    price_elasticity_demand,
)


def test_compound_interest_fv_pv_1plus_r_n():
    # KNOWN: FV = PV*(1+r)^n; PV=1000, r=5%, n=10 -> 1628.894627...
    out = compound_interest_fv(present_value=1000.0, annual_rate=0.05, years=10)
    assert abs(out["future_value"] - 1000.0 * (1.05 ** 10)) < 1e-9
    assert abs(out["future_value"] - 1628.894626777442) < 1e-6
    # inverse: discounting FV back recovers PV exactly
    assert abs(out["discounted_back_pv"] - 1000.0) < 1e-9


def test_compound_interest_monthly_ear():
    # KNOWN: 12% nominal compounded monthly -> EAR = (1.01)^12 - 1 = 0.126825...
    out = compound_interest_fv(present_value=1.0, annual_rate=0.12, years=1,
                               compounds_per_year=12)
    assert abs(out["effective_annual_rate"] - ((1.01 ** 12) - 1.0)) < 1e-12
    assert abs(out["effective_annual_rate"] - 0.12682503013196977) < 1e-9


def test_capm_expected_return_known():
    # KNOWN: E[R] = Rf + beta*(Rm-Rf); Rf=3%, beta=1.5, Rm=8% -> 10.5%.
    out = capm_expected_return(risk_free_rate=0.03, beta=1.5, market_return=0.08)
    assert abs(out["expected_return"] - 0.105) < 1e-12
    assert abs(out["expected_return_percent"] - 10.5) < 1e-9


def test_capm_beta_one_returns_market():
    # KNOWN: beta = 1 reproduces exactly the market return.
    out = capm_expected_return(risk_free_rate=0.02, beta=1.0, market_return=0.09)
    assert abs(out["expected_return"] - 0.09) < 1e-12


def test_market_equilibrium_known():
    # KNOWN: Qd = 100 - 2P, Qs = 20 + 2P -> P* = 20, Q* = 60.
    out = market_equilibrium(demand_intercept=100.0, demand_slope=2.0,
                             supply_intercept=20.0, supply_slope=2.0)
    assert abs(out["equilibrium_price"] - 20.0) < 1e-12
    assert abs(out["equilibrium_quantity"] - 60.0) < 1e-12
    assert out["market_clears"] is True


def test_gini_perfect_equality_zero():
    # KNOWN: a perfectly equal distribution has Gini = 0.
    out = gini_coefficient(incomes=[50000, 50000, 50000, 50000])
    assert abs(out["gini"]) < 1e-12


def test_gini_max_inequality():
    # KNOWN: maximal inequality among n people (one earner) -> G = 1 - 1/n.
    out = gini_coefficient(incomes=[0, 0, 0, 100])
    assert abs(out["gini"] - (1.0 - 1.0 / 4)) < 1e-12   # 0.75


def test_nash_prisoners_dilemma_defect_defect():
    # KNOWN: Prisoner's Dilemma. Payoffs (higher better), row plays
    # {Cooperate=0, Defect=1}, col plays {Cooperate=0, Defect=1}.
    # Classic: T=5 > R=3 > P=1 > S=0.
    # row_payoffs[i][j], col_payoffs[i][j].
    row = [[3, 0], [5, 1]]   # row: CC=3, CD=0, DC=5, DD=1
    col = [[3, 5], [0, 1]]   # col: CC=3, CD=5, DC=0, DD=1
    out = nash_equilibrium_2x2(row_payoffs=row, col_payoffs=col)
    # Unique pure Nash eq is (Defect, Defect) = (1, 1).
    assert out["pure_nash_equilibria"] == [[1, 1]]
    assert out["num_pure_equilibria"] == 1
    # Defect (strategy 1) strictly dominates for both players.
    assert out["row_dominant_strategy"] == 1
    assert out["col_dominant_strategy"] == 1


def test_black_scholes_deep_itm_call_delta_one():
    # KNOWN: a deep in-the-money European call has delta -> 1.
    out = black_scholes_delta(spot=300.0, strike=100.0, time_to_expiry=1.0,
                              risk_free_rate=0.05, volatility=0.2,
                              option_type="call")
    assert abs(out["delta"] - 1.0) < 1e-3
    # deep OTM call delta -> 0
    out2 = black_scholes_delta(spot=50.0, strike=300.0, time_to_expiry=1.0,
                               risk_free_rate=0.05, volatility=0.2,
                               option_type="call")
    assert abs(out2["delta"]) < 1e-3


def test_black_scholes_atm_call_delta_above_half():
    # KNOWN: an at-the-money call (with positive r) has delta slightly > 0.5.
    out = black_scholes_delta(spot=100.0, strike=100.0, time_to_expiry=1.0,
                              risk_free_rate=0.05, volatility=0.2)
    assert 0.5 < out["delta"] < 0.75


def test_bond_par_price_equals_face():
    # KNOWN: when YTM == coupon rate the bond trades at par (price == face).
    out = bond_price_ytm(face_value=1000.0, coupon_rate=0.06, years=10,
                         yield_to_maturity=0.06)
    assert abs(out["price"] - 1000.0) < 1e-6
    assert out["trades_at_par"] is True


def test_bond_ytm_solver_roundtrip():
    # KNOWN: pricing at YTM then solving for YTM from that price recovers it.
    priced = bond_price_ytm(face_value=1000.0, coupon_rate=0.05, years=5,
                            yield_to_maturity=0.07)
    solved = bond_price_ytm(face_value=1000.0, coupon_rate=0.05, years=5,
                            market_price=priced["price"])
    assert abs(solved["yield_to_maturity"] - 0.07) < 1e-8


def test_price_elasticity_unit_elastic():
    # KNOWN: P 10->20, Q 100->50 (midpoint method) -> |E| = 1 (unit elastic).
    out = price_elasticity_demand(price1=10.0, quantity1=100.0,
                                  price2=20.0, quantity2=50.0, method="arc")
    assert abs(out["elasticity_magnitude"] - 1.0) < 1e-12
    assert out["classification"] == "unit_elastic"


def test_price_elasticity_elastic_inelastic():
    # KNOWN: a large quantity response vs small price change -> elastic (>1).
    out = price_elasticity_demand(price1=10.0, quantity1=100.0,
                                  price2=11.0, quantity2=70.0, method="point")
    # %dQ = -0.30, %dP = 0.10 -> |E| = 3 (elastic)
    assert abs(out["elasticity_magnitude"] - 3.0) < 1e-9
    assert out["classification"] == "elastic"
