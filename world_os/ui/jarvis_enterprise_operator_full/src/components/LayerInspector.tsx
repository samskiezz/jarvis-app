
import React from 'react';
import type { ArchitectureManifest, PlaneName } from '../contracts/types';

export function LayerInspector({manifest, active, selectedNodeId}:{manifest: ArchitectureManifest; active: PlaneName; selectedNodeId: string | null}) {
  const plane = manifest.planes[active];
  const selectedLayer = selectedNodeId?.startsWith(active + '.')
    ? plane.layers.find(l => selectedNodeId.endsWith(l.id))
    : null;

  return <div className="layerList">
    <p style={{color:'#9fc4d9'}}>{plane.purpose}</p>
    {plane.layers.map(layer => (
      <div key={layer.id} className={'layer ' + (selectedLayer?.id===layer.id ? 'active' : '')}>
        <b>{layer.label}</b>
        <div className="badge">{layer.backend}</div>
        <div>{layer.objects.map(o => <span className="badge" key={o}>{o}</span>)}</div>
        <small>Edges: {layer.edges.join(', ')}</small>
      </div>
    ))}
  </div>;
}
