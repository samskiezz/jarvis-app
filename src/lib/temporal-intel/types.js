export const LAYER_NAMES = {
  ACQUISITION: 'signal_acquisition',
  NORMALIZATION: 'normalization_harmonization',
  RESOLUTION: 'entity_event_resolution',
  GRAPH: 'temporal_world_state_graph',
  ANOMALY: 'multi_dimensional_anomaly_detection',
  HYPOTHESIS: 'cross_domain_correlation_hypothesis_generation',
  PREDICTION: 'prediction_simulation',
  DECISION: 'decision_intelligence',
  LEARNING: 'learning_loop'
};

export const ANOMALY_TYPES = {
  STATISTICAL: 'statistical',
  TEMPORAL: 'temporal',
  SPATIAL: 'spatial',
  BEHAVIORAL: 'behavioral',
  RELATIONAL: 'relational',
  CASCADE: 'cascade',
  CONFIDENCE: 'confidence'
};

export const ACTION_TYPES = ['MONITOR', 'INVESTIGATE', 'HEDGE', 'DIVERSIFY', 'MITIGATE', 'ESCALATE', 'WAIT'];

export const SOURCE_RELIABILITY_BASELINE = {
  bloomberg: 0.95,
  reuters: 0.93,
  noaa: 0.92,
  usgs: 0.9,
  ais: 0.82,
  adsb: 0.82,
  erp: 0.9,
  social_media: 0.5,
  osint_forum: 0.35,
  web_scrape: 0.55
};

export const EDGE_TYPES = ['LOCATED_IN', 'AFFECTS', 'CAUSES', 'CORRELATES_WITH', 'SUPPORTS', 'CONTRADICTS', 'PRECEDED_BY', 'TRADES_WITH', 'SUPPLIES'];
