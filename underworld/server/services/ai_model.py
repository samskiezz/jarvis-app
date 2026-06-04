"""A real, trained, cross-validated AI model — not a metaphor. Trains several
genuine ML regressors (RandomForest, Gradient Boosting, a neural-net MLP) on a
REAL public laboratory dataset (Yeh concrete compressive strength, 1030 measured
samples), compares them by k-fold cross-validation, picks the best, and exposes a
predict() interface with honest held-out R²/RMSE. This is how a real ML pipeline
is built + validated; the numbers are externally checkable against the literature
(published R²≈0.90 for tree ensembles on this dataset).
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.model_selection import KFold, cross_val_score
from sklearn.metrics import r2_score, mean_squared_error
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from . import real_materials


def _models() -> dict:
    return {
        "random_forest": RandomForestRegressor(n_estimators=200, random_state=0),
        "gradient_boosting": GradientBoostingRegressor(n_estimators=200, random_state=0),
        "neural_net_mlp": make_pipeline(
            StandardScaler(),
            MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=2000, random_state=0)),
    }


@lru_cache(maxsize=1)
def train_and_select() -> dict:
    """Train + 5-fold cross-validate each model on the real dataset; select the
    best by mean CV R². Returns honest metrics for every model."""
    ds = real_materials.load()
    X, y = ds.X, ds.y
    kf = KFold(n_splits=5, shuffle=True, random_state=0)
    results = {}
    for name, model in _models().items():
        scores = cross_val_score(model, X, y, cv=kf, scoring="r2")
        rmse = -cross_val_score(model, X, y, cv=kf, scoring="neg_root_mean_squared_error")
        results[name] = {"cv_r2_mean": round(float(scores.mean()), 4),
                         "cv_r2_std": round(float(scores.std()), 4),
                         "cv_rmse_mpa": round(float(rmse.mean()), 3)}
    best = max(results, key=lambda k: results[k]["cv_r2_mean"])
    return {"dataset": "Yeh concrete compressive strength (real, 1030 samples)",
            "n_samples": int(ds.n), "features": ds.names, "models": results,
            "best_model": best, "best_cv_r2": results[best]["cv_r2_mean"]}


@lru_cache(maxsize=1)
def _fitted_best():
    sel = train_and_select()
    model = _models()[sel["best_model"]]
    ds = real_materials.load()
    model.fit(ds.X, ds.y)
    return model, ds.names


def predict_strength(features: dict) -> dict:
    """Predict concrete compressive strength (MPa) for a mix with the trained
    best model. `features` keys are the dataset's feature names."""
    model, names = _fitted_best()
    x = np.array([[float(features.get(n, 0.0)) for n in names]])
    return {"predicted_strength_mpa": round(float(model.predict(x)[0]), 2)}


def feature_importance() -> dict:
    """Which mix variables drive strength (from the fitted tree ensemble)."""
    from sklearn.ensemble import RandomForestRegressor as RF
    ds = real_materials.load()
    rf = RF(n_estimators=200, random_state=0).fit(ds.X, ds.y)
    imp = sorted(zip(ds.names, rf.feature_importances_), key=lambda kv: -kv[1])
    return {"importances": [{"feature": f, "importance": round(float(i), 4)} for f, i in imp]}
