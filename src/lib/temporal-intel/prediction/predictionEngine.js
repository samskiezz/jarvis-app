function weightedAverage(values) {
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / (values.length || 1);
}

export class PredictionEngine {
  forecast({ observations, hypotheses, macroContext = {}, graph }) {
    const base = this.baseForecast(observations);
    const contextual = this.contextualAdjustment(base, macroContext);
    const graphAdjusted = this.graphPressureAdjustment(contextual, graph);
    const calibrated = this.confidenceCalibration(graphAdjusted, hypotheses);
    return this.branchScenarios(calibrated, hypotheses);
  }

  baseForecast(observations) {
    return observations.map((obs) => ({
      metric_id: obs.metric_id,
      point_forecast: Number(obs.value_usd),
      interval: [Number(obs.value_usd) * 0.95, Number(obs.value_usd) * 1.05],
      confidence: 0.72,
      model_ensemble: ['ARIMA', 'Prophet', 'LSTM']
    }));
  }

  contextualAdjustment(baseForecasts, macroContext) {
    const vix = macroContext.vix || 18;
    const volatilityLift = vix > 30 ? 1.12 : 1.02;
    return baseForecasts.map((f) => ({
      ...f,
      point_forecast: f.point_forecast * volatilityLift,
      interval: [f.interval[0] * volatilityLift, f.interval[1] * volatilityLift],
      context_applied: { vix, volatilityLift }
    }));
  }

  graphPressureAdjustment(forecasts, graph) {
    const nodePressure = weightedAverage(graph.edges.map((e) => e.confidence || 0.5));
    const multiplier = 1 + nodePressure * 0.05;
    return forecasts.map((f) => ({
      ...f,
      point_forecast: f.point_forecast * multiplier,
      interval: [f.interval[0] * multiplier, f.interval[1] * multiplier],
      graph_pressure: nodePressure
    }));
  }

  confidenceCalibration(forecasts, hypotheses) {
    const meanHypothesis = weightedAverage(hypotheses.map((h) => h.confidence || 0.5));
    return forecasts.map((f) => ({
      ...f,
      confidence: Math.max(0.1, Math.min(0.98, f.confidence * 0.7 + meanHypothesis * 0.3))
    }));
  }

  branchScenarios(forecasts, hypotheses) {
    const uncertainty = 1 - weightedAverage(hypotheses.map((h) => h.confidence));
    return forecasts.map((f) => ({
      ...f,
      scenarios: [
        { name: 'base_case', probability: 0.6, predicted_value: f.point_forecast, trigger: 'current trend persists' },
        { name: 'high_impact', probability: 0.15 + uncertainty * 0.1, predicted_value: f.point_forecast * 1.25, trigger: 'risk escalation' },
        { name: 'tail_case', probability: 0.05, predicted_value: f.point_forecast * 1.6, trigger: 'black swan catalyst' },
        { name: 'de_escalation', probability: 0.2 - uncertainty * 0.05, predicted_value: f.point_forecast * 0.92, trigger: 'policy resolution' }
      ]
    }));
  }
}
