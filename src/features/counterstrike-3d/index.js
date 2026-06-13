import { z } from 'zod';
import { FeatureDefinitionSchema } from '../shared/featureTypes';
import { telemetry } from '../shared/telemetry';

const StateSchema = z.object({
  sceneId: z.string(),
  tickRate: z.number().min(1),
  entities: z.array(z.object({ id: z.string(), kind: z.enum(['player', 'projectile', 'objective']), status: z.string() })),
  incidents: z.array(z.object({ id: z.string(), code: z.string(), detail: z.string() })),
});

const TickRequestSchema = z.object({ sceneId: z.string(), deltaMs: z.number().positive() });
const TickResponseSchema = z.object({ sceneId: z.string(), tickRate: z.number().min(1), incidents: z.array(z.object({ code: z.string(), detail: z.string() })) });

export const counterstrike3dFeature = FeatureDefinitionSchema.parse({
  slug: 'counterstrike-3d',
  displayName: 'Counterstrike 3D',
  enabledByDefault: false,
  route: '/features/counterstrike-3d',
  stateModel: StateSchema,
  actions: [
    { type: 'BOOT_SCENE', description: 'Initialize 3D scene and entities.' },
    { type: 'SIMULATION_TICK', description: 'Advance simulation by delta.' },
    { type: 'REPORT_ENGINE_INCIDENT', description: 'Store rendering/physics incident.' },
  ],
  panels: [
    { id: 'cs3d-viewport', title: '3D Viewport', defaultVisible: true, placement: 'center' },
    { id: 'cs3d-tick-metrics', title: 'Tick Metrics', defaultVisible: true, placement: 'right' },
    { id: 'cs3d-incident-log', title: 'Incident Log', defaultVisible: true, placement: 'bottom' },
  ],
  permissionsBoundary: [
    { scope: 'counterstrike-3d:read', level: 'read', rationale: 'Observe simulation status.' },
    { scope: 'counterstrike-3d:write', level: 'write', rationale: 'Run scene controls and mutations.' },
  ],
  apiContracts: [
    { endpoint: '/api/counterstrike-3d/tick', method: 'POST', requestSchema: TickRequestSchema, responseSchema: TickResponseSchema },
  ],
});

export const counterstrike3dMockAdapter = {
  async runTick(payload) {
    const req = TickRequestSchema.parse(payload);
    const tickRate = Math.max(1, Math.round(1000 / req.deltaMs));
    telemetry.trackSimulationTickRate(counterstrike3dFeature.slug, tickRate);
    return TickResponseSchema.parse({ sceneId: req.sceneId, tickRate, incidents: [] });
  },
};

export const createCounterstrike3dBackendAdapter = (httpClient) => ({
  async runTick(payload) {
    const req = TickRequestSchema.parse(payload);
    const res = await httpClient.post('/api/counterstrike-3d/tick', req);
    const parsed = TickResponseSchema.parse(res.data);
    telemetry.trackSimulationTickRate(counterstrike3dFeature.slug, parsed.tickRate);
    return parsed;
  },
});
