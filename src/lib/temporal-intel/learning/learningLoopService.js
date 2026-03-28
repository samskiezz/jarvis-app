export class LearningLoopService {
  update({ anomalies = [], hypotheses = [], decisions = [], outcomes = [], sourceReliability = {} }) {
    const anomalyPrecision = this.scoreAnomalyRelevance(anomalies, outcomes);
    const hypothesisAccuracy = this.scoreHypothesisCorrectness(hypotheses, outcomes);
    const decisionPerformance = this.scoreDecisionOutcome(decisions, outcomes);

    const adjustedReliability = { ...sourceReliability };
    outcomes.forEach((outcome) => {
      if (!outcome.source) return;
      const previous = adjustedReliability[outcome.source] ?? 0.5;
      adjustedReliability[outcome.source] = Math.max(0.05, Math.min(0.99, previous * 0.9 + (outcome.correct ? 1 : 0) * 0.1));
    });

    return {
      anomaly_threshold_adjustment: anomalyPrecision < 0.5 ? 'raise_sensitivity' : 'hold',
      causal_edge_adjustment: hypothesisAccuracy,
      prediction_calibration_shift: decisionPerformance,
      source_reliability: adjustedReliability,
      retraining_schedule: {
        time_series: 'daily',
        gnn: 'weekly',
        hypothesis_models: 'daily'
      }
    };
  }

  scoreAnomalyRelevance(anomalies, outcomes) {
    if (!anomalies.length) return 0;
    const matching = anomalies.filter((anomaly) => outcomes.some((outcome) => outcome.related_anomaly_id === anomaly.id && outcome.correct)).length;
    return matching / anomalies.length;
  }

  scoreHypothesisCorrectness(hypotheses, outcomes) {
    if (!hypotheses.length) return 0;
    const confirmed = hypotheses.filter((hypothesis) => outcomes.some((outcome) => outcome.related_hypothesis_id === hypothesis.id && outcome.correct)).length;
    return confirmed / hypotheses.length;
  }

  scoreDecisionOutcome(decisions, outcomes) {
    if (!decisions.length) return 0;
    const gains = decisions.map((decision) => outcomes.find((o) => o.related_action === decision.action)?.realized_payoff || 0);
    return gains.reduce((sum, value) => sum + value, 0) / decisions.length;
  }
}
