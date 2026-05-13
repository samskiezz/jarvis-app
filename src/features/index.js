import { agentSwapWarFeature, agentSwapWarMockAdapter, createAgentSwapWarBackendAdapter } from './agent-swap-war';
import { panopticonFeature, panopticonMockAdapter, createPanopticonBackendAdapter } from './panopticon';
import { counterstrike3dFeature, counterstrike3dMockAdapter, createCounterstrike3dBackendAdapter } from './counterstrike-3d';

export const featureRegistry = {
  'agent-swap-war': {
    definition: agentSwapWarFeature,
    toggles: { routeEnabled: true, panelsEnabled: true, telemetryEnabled: true },
    adapters: { mock: agentSwapWarMockAdapter, backend: createAgentSwapWarBackendAdapter },
  },
  panopticon: {
    definition: panopticonFeature,
    toggles: { routeEnabled: true, panelsEnabled: true, telemetryEnabled: true },
    adapters: { mock: panopticonMockAdapter, backend: createPanopticonBackendAdapter },
  },
  'counterstrike-3d': {
    definition: counterstrike3dFeature,
    toggles: { routeEnabled: true, panelsEnabled: true, telemetryEnabled: true },
    adapters: { mock: counterstrike3dMockAdapter, backend: createCounterstrike3dBackendAdapter },
  },
};

export const getEnabledFeatureDefinitions = () => Object.values(featureRegistry)
  .filter((feature) => feature.toggles.routeEnabled || feature.toggles.panelsEnabled)
  .map((feature) => feature.definition);
