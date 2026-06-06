
import type { PlaneName, VisualNode, VisualEdge } from '../contracts/types';

export type LayoutNode = VisualNode & { x: number; y: number; vx?: number; vy?: number };

export function planeColor(plane?: string) {
  if (plane === 'Foundry') return '#00d4ff';
  if (plane === 'Gotham') return '#ff3864';
  if (plane === 'Apollo') return '#7CFF7C';
  if (plane === 'AIP') return '#b18cff';
  return '#d8e8ff';
}

export function radialLayout(nodes: VisualNode[], edges: VisualEdge[], activePlane: PlaneName): LayoutNode[] {
  const planeNodes = nodes.filter(n => n.type === 'Plane');
  const layerNodes = nodes.filter(n => n.type !== 'Plane');
  const out: LayoutNode[] = [];
  const radius = 260;
  const planeIndex = planeNodes.findIndex(n => n.id === activePlane);
  const centerPlane = planeNodes[planeIndex >= 0 ? planeIndex : 0];

  if (centerPlane) out.push({ ...centerPlane, x: 0, y: 0 });

  const activeLayers = layerNodes.filter(n => n.plane === activePlane);
  activeLayers.forEach((n, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(1, activeLayers.length) - Math.PI / 2;
    out.push({ ...n, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  });

  const otherPlanes = planeNodes.filter(n => n.id !== activePlane);
  otherPlanes.forEach((n, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(1, otherPlanes.length) + Math.PI / 4;
    out.push({ ...n, x: Math.cos(angle) * 520, y: Math.sin(angle) * 320 });
  });

  return out;
}
