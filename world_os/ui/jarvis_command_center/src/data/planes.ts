export const planes = {
  Foundry: {
    purpose: 'Data, ontology, lineage, vector memory, graph projection and operational workflows',
    layers: ['Sources','Raw Assets','Pipelines','Ontology','Graph','Vector','Workflow','Audit']
  },
  Gotham: {
    purpose: 'Mission operating picture, investigation, map/timeline, sensor/tasking and action approval',
    layers: ['Live Events','Entities','Map','Timeline','Evidence','Cases','Actions','Replay']
  },
  Apollo: {
    purpose: 'Deployment/runtime desired state, fleet health, releases, drift, rollback and compliance',
    layers: ['Desired State','Fleet','Services','Rollouts','Health Gates','Drift','Rollback','SBOM/CVE']
  }
} as const;
export type PlaneName = keyof typeof planes;
