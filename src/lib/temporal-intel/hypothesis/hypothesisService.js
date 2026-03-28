export class HypothesisService {
  constructor({ graph }) {
    this.graph = graph;
  }

  generate({ anomalies, precursorLibrary = [] }) {
    const clustered = this.clusterAnomalies(anomalies);
    return clustered.flatMap((cluster) => this.generateCompetingHypotheses(cluster, precursorLibrary));
  }

  clusterAnomalies(anomalies) {
    const byEntity = new Map();
    anomalies.forEach((anomaly) => {
      const key = anomaly.affected_entities?.[0] || anomaly.affected_metrics?.[0] || 'global';
      const group = byEntity.get(key) || [];
      group.push(anomaly);
      byEntity.set(key, group);
    });
    return [...byEntity.values()];
  }

  generateCompetingHypotheses(cluster, precursorLibrary) {
    const evidence = cluster.map((a) => a.id);
    const avgConfidence = cluster.reduce((sum, item) => sum + item.confidence, 0) / (cluster.length || 1);
    const graphSupport = cluster.flatMap((a) => a.affected_entities || []).flatMap((entityId) => this.graph.neighbors(entityId, { hops: 2 })).length;
    const precursorHits = precursorLibrary.filter((rule) => cluster.some((a) => rule.pattern.includes(a.type)));

    return [
      {
        id: `hyp-${cluster[0]?.id}-1`,
        description: 'Primary causal chain hypothesis based on graph-neighbor propagation',
        supporting_evidence: evidence,
        contradicting_evidence: [],
        confidence: Math.min(0.95, avgConfidence + Math.min(0.2, graphSupport / 50)),
        predicted_next_signals: ['volatility_up', 'cross_domain_spread'],
        decision_relevance: ['portfolio', 'supply_chain']
      },
      {
        id: `hyp-${cluster[0]?.id}-2`,
        description: 'Precursor rule activation hypothesis',
        supporting_evidence: evidence,
        contradicting_evidence: precursorHits.length ? [] : ['no_matching_precursors'],
        confidence: precursorHits.length ? avgConfidence : avgConfidence * 0.55,
        predicted_next_signals: ['macro_sentiment_shift', 'flow_rotation'],
        decision_relevance: ['risk_committee']
      },
      {
        id: `hyp-${cluster[0]?.id}-3`,
        description: 'Noise / spurious correlation hypothesis',
        supporting_evidence: [],
        contradicting_evidence: evidence,
        confidence: 1 - avgConfidence,
        predicted_next_signals: ['mean_reversion'],
        decision_relevance: ['monitoring']
      }
    ];
  }
}
