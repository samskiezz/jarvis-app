import { z } from 'zod';
import { FeatureDefinitionSchema } from '../shared/featureTypes';
import { telemetry } from '../shared/telemetry';

const StateSchema = z.object({
  incidentCount: z.number().nonnegative(),
  activeFeeds: z.array(z.object({ id: z.string(), source: z.string(), health: z.enum(['ok', 'degraded', 'down']) })),
  anomalies: z.array(z.object({ id: z.string(), severity: z.number().min(1).max(100), description: z.string() })),
});

const IncidentRequestSchema = z.object({ source: z.string(), severity: z.number().min(1).max(100), description: z.string() });
const IncidentResponseSchema = z.object({ id: z.string(), status: z.enum(['logged', 'deduplicated']) });

export const panopticonFeature = FeatureDefinitionSchema.parse({
  slug: 'panopticon',
  displayName: 'Panopticon',
  enabledByDefault: false,
  route: '/features/panopticon',
  stateModel: StateSchema,
  actions: [
    { type: 'REGISTER_FEED', description: 'Registers monitoring feed.' },
    { type: 'REPORT_INCIDENT', description: 'Logs surveillance incident.' },
    { type: 'ACK_ANOMALY', description: 'Acknowledge anomaly event.' },
  ],
  panels: [
    { id: 'panopticon-wall', title: 'Observation Wall', defaultVisible: true, placement: 'center' },
    { id: 'panopticon-feed-health', title: 'Feed Health', defaultVisible: true, placement: 'right' },
    { id: 'panopticon-incidents', title: 'Incident Queue', defaultVisible: true, placement: 'bottom' },
  ],
  permissionsBoundary: [
    { scope: 'panopticon:read', level: 'read', rationale: 'View feed and anomaly state.' },
    { scope: 'panopticon:admin', level: 'admin', rationale: 'Tune detectors and close incidents.' },
  ],
  apiContracts: [
    { endpoint: '/api/panopticon/incidents', method: 'POST', requestSchema: IncidentRequestSchema, responseSchema: IncidentResponseSchema },
  ],
});

export const panopticonMockAdapter = {
  async reportIncident(payload) {
    const req = IncidentRequestSchema.parse(payload);
    const response = { id: `mock-${Date.now()}`, status: 'logged' };
    telemetry.trackIncident(panopticonFeature.slug, 'incident', req);
    return IncidentResponseSchema.parse(response);
  },
};

export const createPanopticonBackendAdapter = (httpClient) => ({
  async reportIncident(payload) {
    const req = IncidentRequestSchema.parse(payload);
    const res = await httpClient.post('/api/panopticon/incidents', req);
    return IncidentResponseSchema.parse(res.data);
  },
});
