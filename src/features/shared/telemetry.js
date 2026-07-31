const TELEMETRY_BUFFER_LIMIT = 250;
const events = [];

export const telemetry = {
  trackSimulationTickRate(feature, ticksPerSecond) {
    events.push({
      type: 'simulation_tick_rate',
      feature,
      ticksPerSecond,
      ts: new Date().toISOString(),
    });
    this.prune();
  },

  trackSwapOutcome(feature, payload) {
    events.push({
      type: 'swap_outcome',
      feature,
      payload,
      ts: new Date().toISOString(),
    });
    this.prune();
  },

  trackIncident(feature, error, context = {}) {
    events.push({
      type: 'incident_error',
      feature,
      context,
      error: error instanceof Error ? error.message : String(error),
      ts: new Date().toISOString(),
    });
    this.prune();
  },

  readAll() {
    return [...events];
  },

  prune() {
    if (events.length > TELEMETRY_BUFFER_LIMIT) {
      events.splice(0, events.length - TELEMETRY_BUFFER_LIMIT);
    }
  },
};
