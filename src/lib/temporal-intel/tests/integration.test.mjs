import assert from 'assert';
import { TemporalCausalIntelligenceSystem } from '../pipeline.js';

async function run() {
  const system = new TemporalCausalIntelligenceSystem({
    historicalBaseline: {
      'heartbeat.bloomberg_api': { mean: 0.1, stdDev: 0.01, typicalHour: 12 }
    },
    precursorLibrary: [{ pattern: ['statistical', 'spatial'], outcome: 'supply_disruption' }]
  });

  const result = await system.tick({
    now: Date.now(),
    macroContext: { vix: 35 },
    preferences: { risk_aversion: 0.6 }
  });

  assert.ok(result.rawObservations.length > 0, 'should acquire observations');
  assert.ok(result.canonicalObservations.every((obs) => obs.timestamp_utc_ns), 'should normalize timestamps');
  assert.ok(Array.isArray(result.hypotheses) && result.hypotheses.length > 0, 'should build hypotheses');
  assert.ok(Array.isArray(result.forecasts) && result.forecasts[0].scenarios.length === 4, 'should build scenarios');
  assert.ok(result.decisions.length >= 3, 'should rank actions');

  const learning = system.learn({
    anomalies: result.anomalies,
    hypotheses: result.hypotheses,
    decisions: result.decisions,
    outcomes: [{ related_action: result.decisions[0].action, realized_payoff: 4, correct: true, source: 'bloomberg' }],
    sourceReliability: { bloomberg: 0.95 }
  });

  assert.equal(learning.retraining_schedule.time_series, 'daily');

  console.log('temporal-intelligence integration test passed');
}

run();
