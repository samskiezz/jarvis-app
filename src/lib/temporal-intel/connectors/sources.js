export const TOP_SOURCES = [
  'bloomberg_api',
  'reuters_feed',
  'fred_macro',
  'ecb_rates',
  'sec_filings',
  'openfigi',
  'gleif',
  'wikidata',
  'gdelt_events',
  'acled_conflicts',
  'noaa_weather',
  'usgs_earthquake',
  'nhc_hurricanes',
  'ais_stream',
  'adsb_exchange',
  'port_call_feed',
  'erp_internal',
  'crm_internal',
  'osint_social',
  'satellite_provider',
  'credit_card_altdata',
  'mobile_location_altdata'
];

export class SourceConnector {
  constructor(name, produce) {
    this.name = name;
    this.produce = produce;
  }

  async poll(context) {
    const observations = await this.produce(context);
    return observations.map((item) => ({
      ...item,
      source: item.source || this.name,
      ingestion_received_at: Date.now()
    }));
  }
}

export function buildMockConnectors() {
  return TOP_SOURCES.map(
    (name) =>
      new SourceConnector(name, async ({ now }) => [{
        metric_id: `heartbeat.${name}`,
        timestamp: new Date(now).toISOString(),
        value: Math.random(),
        metadata: { units: 'ratio' }
      }])
  );
}
