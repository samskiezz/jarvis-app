import { ACTION_TYPES } from '../types.js';

function scenarioExpectedValue(scenarios) {
  return scenarios.reduce((sum, scenario) => sum + scenario.probability * scenario.predicted_value, 0);
}

export class DecisionIntelligenceService {
  rankActions({ forecasts, hypotheses, exposureMap = {}, preferences = { risk_aversion: 0.5 } }) {
    const hypothesisConfidence = hypotheses.reduce((sum, h) => sum + h.confidence, 0) / (hypotheses.length || 1);

    return ACTION_TYPES.map((action) => {
      const expectedPayoff = forecasts.reduce((sum, forecast) => sum + scenarioExpectedValue(forecast.scenarios), 0);
      const downside = forecasts.reduce((worst, forecast) => Math.min(worst, ...forecast.scenarios.map((s) => s.predicted_value)), 0);
      const urgency = action === 'ESCALATE' ? 0.9 : action === 'WAIT' ? 0.2 : 0.5;
      const informationGain = action === 'INVESTIGATE' ? 0.8 : 0.3;
      const opportunityCost = action === 'WAIT' ? expectedPayoff * 0.1 : expectedPayoff * 0.02;
      const riskAdjusted = expectedPayoff - preferences.risk_aversion * Math.abs(downside);

      return {
        action,
        expected_payoff: expectedPayoff,
        downside_risk: downside,
        confidence: Math.min(0.95, hypothesisConfidence),
        urgency,
        information_gain: informationGain,
        opportunity_cost: opportunityCost,
        exposure: exposureMap,
        score: riskAdjusted - opportunityCost + informationGain * 10 - (1 - hypothesisConfidence) * 5
      };
    }).sort((a, b) => b.score - a.score);
  }
}
