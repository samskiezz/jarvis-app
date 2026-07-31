import { z } from 'zod';
import { FeatureDefinitionSchema } from '../shared/featureTypes';
import { telemetry } from '../shared/telemetry';

const StateSchema = z.object({
  matchId: z.string(),
  tickRate: z.number().min(1),
  teams: z.array(z.object({ id: z.string(), name: z.string(), agents: z.array(z.string()) })),
  swaps: z.array(z.object({ from: z.string(), to: z.string(), result: z.enum(['success', 'rejected']) })),
});

const SwapRequestSchema = z.object({ matchId: z.string(), fromTeamId: z.string(), toTeamId: z.string(), agentId: z.string() });
const SwapResponseSchema = z.object({ ok: z.boolean(), outcome: z.enum(['success', 'rejected']), reason: z.string().optional() });

export const agentSwapWarFeature = FeatureDefinitionSchema.parse({
  slug: 'agent-swap-war',
  displayName: 'Agent Swap War',
  enabledByDefault: false,
  route: '/features/agent-swap-war',
  stateModel: StateSchema,
  actions: [
    { type: 'SIMULATION_TICK', description: 'Advances match simulation tick.' },
    { type: 'PROPOSE_SWAP', description: 'Requests agent transfer between teams.' },
    { type: 'RESOLVE_SWAP', description: 'Resolves and stores swap outcome.' },
  ],
  panels: [
    { id: 'asw-overview', title: 'Swap Overview', defaultVisible: true, placement: 'center' },
    { id: 'asw-teams', title: 'Team Rosters', defaultVisible: true, placement: 'left' },
    { id: 'asw-events', title: 'Swap Events', defaultVisible: true, placement: 'bottom' },
  ],
  permissionsBoundary: [
    { scope: 'agent-swap-war:read', level: 'read', rationale: 'View simulation state and outcomes.' },
    { scope: 'agent-swap-war:write', level: 'write', rationale: 'Propose and approve swaps.' },
  ],
  apiContracts: [
    { endpoint: '/api/agent-swap-war/swaps', method: 'POST', requestSchema: SwapRequestSchema, responseSchema: SwapResponseSchema },
  ],
});

export const agentSwapWarMockAdapter = {
  async createSwap(payload) {
    const req = SwapRequestSchema.parse(payload);
    const accepted = req.fromTeamId !== req.toTeamId;
    const result = { ok: accepted, outcome: accepted ? 'success' : 'rejected', reason: accepted ? undefined : 'Same team.' };
    telemetry.trackSwapOutcome(agentSwapWarFeature.slug, { ...req, ...result });
    return result;
  },
};

export const createAgentSwapWarBackendAdapter = (httpClient) => ({
  async createSwap(payload) {
    const req = SwapRequestSchema.parse(payload);
    const res = await httpClient.post('/api/agent-swap-war/swaps', req);
    return SwapResponseSchema.parse(res.data);
  },
});
