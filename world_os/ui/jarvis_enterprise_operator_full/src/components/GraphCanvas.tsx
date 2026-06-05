
import React, {useMemo} from 'react';
import type { PlaneName, VisualEdge, VisualNode } from '../contracts/types';
import { filterRenderableGraph } from '../engine/graphPolicy';
import { radialLayout, planeColor } from '../engine/layoutEngine';

export function GraphCanvas({nodes, edges, active, onSelect}:{nodes: VisualNode[]; edges: VisualEdge[]; active: PlaneName; onSelect:(id:string)=>void}) {
  const {layout, renderEdges} = useMemo(() => {
    const filtered = filterRenderableGraph(nodes, edges);
    const layout = radialLayout(filtered.nodes, filtered.edges, active);
    const map = new Map(layout.map(n => [n.id, n]));
    const renderEdges = filtered.edges
      .map(e => ({...e, s: map.get(e.source), t: map.get(e.target)}))
      .filter(e => e.s && e.t);
    return {layout, renderEdges};
  }, [nodes, edges, active]);

  const w = 920, h = 720;
  return <svg className="graphCanvas" viewBox={`${-w/2} ${-h/2} ${w} ${h}`}>
    <defs>
      <filter id="glow"><feGaussianBlur stdDeviation="3" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    {renderEdges.map((e, i) => (
      <line key={i} x1={e.s!.x} y1={e.s!.y} x2={e.t!.x} y2={e.t!.y}
        stroke="rgba(130,220,255,.35)" strokeWidth={Math.max(1, e.weight*2)} />
    ))}
    {layout.map(n => (
      <g key={n.id} transform={`translate(${n.x},${n.y})`} onClick={() => onSelect(n.id)} style={{cursor:'pointer'}}>
        <circle r={n.type === 'Plane' ? 34 : 18} fill={planeColor(n.plane || n.id)} opacity={n.type==='Plane' ? 0.96 : 0.78} filter="url(#glow)" />
        <text y={n.type === 'Plane' ? 54 : 34} textAnchor="middle" fill="#eaf6ff" fontSize={n.type==='Plane'?15:10}>{n.label}</text>
      </g>
    ))}
  </svg>;
}
