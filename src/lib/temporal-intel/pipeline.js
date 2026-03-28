import { buildMockConnectors } from './connectors/sources.js';
import { TemporalWorldStateGraph } from './graph/temporalGraph.js';
import { EntityRegistryService } from './registry/entityRegistry.js';
import { DecisionIntelligenceService } from './decision/decisionService.js';
import { HypothesisService } from './hypothesis/hypothesisService.js';
import { LearningLoopService } from './learning/learningLoopService.js';
import { PredictionEngine } from './prediction/predictionEngine.js';
import {
  AnomalyLayer,
  GraphLayer,
  NormalizationLayer,
  ResolutionLayer,
  SignalAcquisitionLayer
} from './layers/pipelineLayers.js';

export class TemporalCausalIntelligenceSystem {
  constructor({ connectors = buildMockConnectors(), historicalBaseline = {}, precursorLibrary = [] } = {}) {
    this.registry = new EntityRegistryService();
    this.graph = new TemporalWorldStateGraph();
    this.layers = {
      acquisition: new SignalAcquisitionLayer(connectors),
      normalization: new NormalizationLayer({ entityRegistry: this.registry }),
      resolution: new ResolutionLayer(),
      graph: new GraphLayer(this.graph),
      anomaly: new AnomalyLayer(),
      hypothesis: new HypothesisService({ graph: this.graph }),
      prediction: new PredictionEngine(),
      decision: new DecisionIntelligenceService(),
      learning: new LearningLoopService()
    };
    this.historicalBaseline = historicalBaseline;
    this.precursorLibrary = precursorLibrary;
  }

  async tick({ now = Date.now(), macroContext = {}, preferences = {} } = {}) {
    const rawObservations = await this.layers.acquisition.run({ now });
    const canonicalObservations = this.layers.normalization.run(rawObservations);
    const resolvedObjects = this.layers.resolution.run(canonicalObservations);
    const graph = this.layers.graph.run(resolvedObjects);
    const anomalies = this.layers.anomaly.run({ observations: canonicalObservations, graph, historicalBaseline: this.historicalBaseline });
    const hypotheses = this.layers.hypothesis.generate({ anomalies, precursorLibrary: this.precursorLibrary });
    const forecasts = this.layers.prediction.forecast({ observations: canonicalObservations, hypotheses, macroContext, graph });
    const decisions = this.layers.decision.rankActions({ forecasts, hypotheses, preferences });

    graph.snapshot(now);

    return {
      rawObservations,
      canonicalObservations,
      resolvedObjects,
      anomalies,
      hypotheses,
      forecasts,
      decisions
    };
  }

  learn(feedbackPayload) {
    return this.layers.learning.update(feedbackPayload);
  }
}
