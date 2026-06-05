
export type PlaneName = 'Foundry' | 'Gotham' | 'Apollo' | 'AIP';

export type VisualNode = {
  id: string;
  label: string;
  type: string;
  plane?: string;
  backend?: string;
  confidence: number;
  classification: string;
  evidence_id: string;
  audit_id: string;
};

export type VisualEdge = {
  source: string;
  target: string;
  relationship_type: string;
  weight: number;
  evidence_id: string;
  audit_id: string;
  confidence: number;
  policy_decision: string;
};

export type LayerSpec = {
  id: string;
  label: string;
  backend: string;
  objects: string[];
  edges: string[];
};

export type PlaneSpec = {
  purpose: string;
  layers: LayerSpec[];
};

export type ArchitectureManifest = {
  planes: Record<PlaneName, PlaneSpec>;
  no_random_edges_rule: boolean;
  edge_contract?: Record<string, unknown>;
  performance_targets?: Record<string, string>;
};
