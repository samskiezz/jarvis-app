"""Book V Part G.4 — the god-verb consequence-forecast (read-only dry-run).

`_forecast_verb` must predict a verb's deltas WITHOUT mutating the target, so the Intervention UI
can show "if you do this, then…" before the creator commits. Guards the UE5 client's PostForecast.
"""
import types

import pytest

from underworld.server.routes.god import _forecast_verb


def _target(**kw):
    base = dict(id="m1", name="Ada", alive=True, reputation=1.0, morale=0.5, karma=0.0)
    base.update(kw)
    return types.SimpleNamespace(**base)


def test_forecast_bless_predicts_without_mutating():
    t = _target()
    res = _forecast_verb("bless", t, {})
    assert res["verb"] == "bless" and res["valence"] == 1.0
    fields = {d["field"]: d for d in res["predicted"]}
    assert fields["reputation"]["to"] == 1.5            # +0.5 predicted
    assert fields["morale"]["to"] == 0.6                # +0.1 predicted
    # the target itself is untouched (read-only forecast)
    assert t.reputation == 1.0 and t.morale == 0.5


def test_forecast_gift_uses_amount():
    res = _forecast_verb("gift", _target(karma=2.0), {"amount": 3})
    fields = {d["field"]: d for d in res["predicted"]}
    assert fields["karma"]["to"] == 5.0


def test_forecast_cull_is_irreversible_death():
    res = _forecast_verb("cull", _target(), {})
    assert res["valence"] == -1.0 and res["reversible"] is False
    assert any(d["field"] == "alive" and d["to"] is False for d in res["predicted"])


def test_forecast_unknown_verb_raises():
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        _forecast_verb("frobnicate", _target(), {})
