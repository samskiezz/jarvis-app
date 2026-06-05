
import type { VisualEdge, VisualNode } from '../contracts/types';

export function validateNode(node: VisualNode): string[] {
  const errors: string[] = [];
  for (const field of ['id','label','type','confidence','classification','evidence_id','audit_id'] as const) {
    if ((node as any)[field] === undefined || (node as any)[field] === '') errors.push(`node ${node.id || '<unknown>'} missing ${field}`);
  }
  if (node.confidence < 0 || node.confidence > 1) errors.push(`node ${node.id} confidence outside 0..1`);
  return errors;
}

export function validateEdge(edge: VisualEdge, nodeIds: Set<string>): string[] {
  const errors: string[] = [];
  for (const field of ['source','target','relationship_type','evidence_id','audit_id','confidence','policy_decision'] as const) {
    if ((edge as any)[field] === undefined || (edge as any)[field] === '') errors.push(`edge missing ${field}`);
  }
  if (!nodeIds.has(edge.source)) errors.push(`edge source missing node: ${edge.source}`);
  if (!nodeIds.has(edge.target)) errors.push(`edge target missing node: ${edge.target}`);
  if (edge.policy_decision !== 'allow_internal' && edge.policy_decision !== 'allow') errors.push(`edge ${edge.source}->${edge.target} blocked by policy`);
  return errors;
}

export function filterRenderableGraph(nodes: VisualNode[], edges: VisualEdge[]) {
  const nodeIds = new Set(nodes.map(n => n.id));
  const validNodes = nodes.filter(n => validateNode(n).length === 0);
  const validNodeIds = new Set(validNodes.map(n => n.id));
  const validEdges = edges.filter(e => validateEdge(e, nodeIds).length === 0 && validNodeIds.has(e.source) && validNodeIds.has(e.target));
  return { nodes: validNodes, edges: validEdges };
}
