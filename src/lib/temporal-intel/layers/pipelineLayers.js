import { ANOMALY_TYPES, SOURCE_RELIABILITY_BASELINE } from '../types.js';

const toUtcNanos = (dateLike) => BigInt(new Date(dateLike).getTime()) * 1000000n;

export class SignalAcquisitionLayer {
  constructor(connectors = []) {
    this.connectors = connectors;
  }

  async run({ now = Date.now() }) {
    const batches = await Promise.all(this.connectors.map((connector) => connector.poll({ now })));
    return batches.flat();
  }
}

export class NormalizationLayer {
  constructor({ entityRegistry, fxProvider } = {}) {
    this.entityRegistry = entityRegistry;
    this.fxProvider = fxProvider || { toUsd: (value) => value };
  }

  normalize(obs) {
    const mentions = obs.metadata?.mentions || (obs.metric_id ? obs.metric_id.split('.') : []);
    const resolved = mentions.slice(0, 1).map((mention) => this.entityRegistry.resolveMention(mention));
    const sourceKey = String(obs.source || '').toLowerCase();

    return {
      ...obs,
      original_timestamp: obs.timestamp,
      timestamp_utc_ns: toUtcNanos(obs.timestamp).toString(),
      value_usd: obs.metadata?.currency && obs.metadata.currency !== 'USD' ? this.fxProvider.toUsd(obs.value, obs.metadata.currency) : obs.value,
      source_reliability: SOURCE_RELIABILITY_BASELINE[sourceKey] || 0.6,
      entities: resolved,
      geospatial: obs.metadata?.location || null,
      canonical_units: obs.metadata?.units || 'unitless'
    };
  }

  run(observations) {
    const dedup = new Map();
    observations.forEach((obs) => {
      const normalized = this.normalize(obs);
      const key = `${normalized.metric_id}|${normalized.timestamp_utc_ns}|${normalized.value_usd}`;
      dedup.set(key, normalized);
    });
    return [...dedup.values()];
  }
}

export class ResolutionLayer {
  run(canonicalObservations) {
    return canonicalObservations.map((obs) => {
      const entityId = obs.entities?.[0]?.entity_id;
      const riskKeywords = ['default', 'sanction', 'shortage', 'strike'];
      const text = `${obs.metric_id} ${JSON.stringify(obs.metadata || {})}`.toLowerCase();
      const hasRisk = riskKeywords.some((word) => text.includes(word));
      return {
        type: 'Signal',
        signal: {
          id: `${obs.metric_id}:${obs.timestamp_utc_ns}`,
          metric_id: obs.metric_id,
          value: obs.value_usd,
          confidence: obs.source_reliability,
          timestamp: obs.timestamp_utc_ns,
          entity_id: entityId
        },
        events: hasRisk ? [{ type: 'RiskEvent', severity: 'MEDIUM', source_metric: obs.metric_id }] : [],
        relationships: entityId ? [{ type: 'MEASURES', from: entityId, to: obs.metric_id, confidence: 0.8 }] : [],
        hypothesis_seeds: hasRisk ? [{ description: `Risk escalation driven by ${obs.metric_id}`, confidence: 0.52 }] : []
      };
    });
  }
}

export class GraphLayer {
  constructor(graph) {
    this.graph = graph;
  }

  run(resolvedObjects) {
    resolvedObjects.forEach((obj) => {
      this.graph.upsertNode({ id: obj.signal.id, type: 'Signal', ...obj.signal });
      if (obj.signal.entity_id) {
        this.graph.addEdge({ type: 'AFFECTS', from: obj.signal.id, to: obj.signal.entity_id, confidence: obj.signal.confidence });
      }
      obj.events.forEach((event) => {
        const eventId = this.graph.upsertNode({ type: 'Event', ...event });
        this.graph.addEdge({ type: 'PRECEDED_BY', from: obj.signal.id, to: eventId, confidence: 0.6 });
      });
    });
    return this.graph;
  }
}

export class AnomalyLayer {
  run({ observations, graph, historicalBaseline = {} }) {
    const anomalies = [];
    for (const obs of observations) {
      const baseline = historicalBaseline[obs.metric_id] || { mean: 0, stdDev: 1, typicalHour: 12, region: obs.geospatial };
      const z = (Number(obs.value_usd) - baseline.mean) / (baseline.stdDev || 1);
      if (Math.abs(z) >= 3) anomalies.push(this.makeAnomaly(ANOMALY_TYPES.STATISTICAL, obs, Math.abs(z), 0.82));

      const hour = new Date(Number(BigInt(obs.timestamp_utc_ns) / 1000000n)).getUTCHours();
      if (Math.abs(hour - baseline.typicalHour) > 8) anomalies.push(this.makeAnomaly(ANOMALY_TYPES.TEMPORAL, obs, Math.abs(hour - baseline.typicalHour), 0.67));

      if (baseline.region && obs.geospatial && baseline.region !== obs.geospatial) anomalies.push(this.makeAnomaly(ANOMALY_TYPES.SPATIAL, obs, 1, 0.71));

      if ((obs.metadata?.pattern_deviation || 0) > 0.8) anomalies.push(this.makeAnomaly(ANOMALY_TYPES.BEHAVIORAL, obs, obs.metadata.pattern_deviation, 0.74));

      if (obs.source_reliability < 0.3 && (obs.metadata?.corroborated_count || 0) >= 3) {
        anomalies.push(this.makeAnomaly(ANOMALY_TYPES.CONFIDENCE, obs, obs.metadata.corroborated_count, 0.69));
      }
    }

    if (graph.edges.some((edge) => edge.type === 'TRADES_WITH' && edge.confidence > 0.9)) {
      anomalies.push({ id: `anom-rel-${Date.now()}`, type: ANOMALY_TYPES.RELATIONAL, magnitude: 1, confidence: 0.72, timestamp: Date.now(), affected_metrics: [] });
    }

    if (observations.length >= 2) {
      const [first, second] = observations;
      const deltaA = Math.abs(Number(first.value_usd) - (historicalBaseline[first.metric_id]?.mean || 0));
      const deltaB = Math.abs(Number(second.value_usd) - (historicalBaseline[second.metric_id]?.mean || 0));
      if (deltaA < 2 && deltaB > 5) {
        anomalies.push({ id: `anom-cas-${Date.now()}`, type: ANOMALY_TYPES.CASCADE, magnitude: deltaB, confidence: 0.63, timestamp: Date.now(), affected_metrics: [first.metric_id, second.metric_id] });
      }
    }

    return anomalies;
  }

  makeAnomaly(type, obs, magnitude, confidence) {
    return {
      id: `anom-${type}-${obs.metric_id}-${obs.timestamp_utc_ns}`,
      type,
      affected_metrics: [obs.metric_id],
      affected_entities: obs.entities?.map((entity) => entity.entity_id) || [],
      magnitude,
      confidence,
      precursors: obs.metadata?.precursors || [],
      timestamp: obs.timestamp_utc_ns
    };
  }
}
