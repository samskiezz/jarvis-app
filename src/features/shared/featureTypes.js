import { z } from 'zod';

export const FeaturePermissionSchema = z.object({
  scope: z.string(),
  level: z.enum(['read', 'write', 'admin']),
  rationale: z.string(),
});

export const FeaturePanelSchema = z.object({
  id: z.string(),
  title: z.string(),
  defaultVisible: z.boolean(),
  placement: z.enum(['left', 'center', 'right', 'bottom']),
});

export const FeatureContractSchema = z.object({
  endpoint: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  requestSchema: z.any(),
  responseSchema: z.any(),
});

export const FeatureDefinitionSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  enabledByDefault: z.boolean(),
  route: z.string(),
  stateModel: z.any(),
  actions: z.array(z.object({ type: z.string(), description: z.string() })),
  panels: z.array(FeaturePanelSchema),
  permissionsBoundary: z.array(FeaturePermissionSchema),
  apiContracts: z.array(FeatureContractSchema),
});
