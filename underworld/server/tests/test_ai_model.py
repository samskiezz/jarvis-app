"""A real trained AI model on a real dataset, with honest cross-validated skill."""
from underworld.server.services import ai_model as AI


def test_models_train_and_cross_validate():
    r = AI.train_and_select()
    assert r["n_samples"] == 1030 and len(r["features"]) == 8
    # tree ensembles reach the published ~0.90 R² on this benchmark
    assert r["best_cv_r2"] > 0.85
    assert r["best_model"] in ("random_forest", "gradient_boosting", "neural_net_mlp")


def test_all_three_models_are_real_and_skilful():
    r = AI.train_and_select()
    for name in ("random_forest", "gradient_boosting", "neural_net_mlp"):
        assert r["models"][name]["cv_r2_mean"] > 0.8       # all genuinely learn
        assert r["models"][name]["cv_rmse_mpa"] > 0


def test_prediction_is_physically_sane():
    p = AI.predict_strength({"cement": 350, "water": 180, "age": 28,
                             "coarse_aggregate": 1000, "fine_aggregate": 750,
                             "blast_furnace_slag": 0, "fly_ash": 0, "superplasticizer": 5})
    assert 5 < p["predicted_strength_mpa"] < 90            # realistic MPa range


def test_feature_importance_age_and_cement_matter():
    imp = {d["feature"]: d["importance"] for d in AI.feature_importance()["importances"]}
    assert imp.get("age", 0) > 0.1 and imp.get("cement", 0) > 0.1   # known key drivers
