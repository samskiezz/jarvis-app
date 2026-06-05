
import React from 'react';
import type { ArchitectureManifest, PlaneName } from '../contracts/types';

export function PlaneSelector({manifest, active, onChange}:{manifest: ArchitectureManifest; active: PlaneName; onChange:(p:PlaneName)=>void}) {
  return <div className="planeTabs">
    {(Object.keys(manifest.planes) as PlaneName[]).map((p) => (
      <button key={p} className={active===p ? 'active' : ''} onClick={() => onChange(p)}>
        {p}
      </button>
    ))}
  </div>;
}
