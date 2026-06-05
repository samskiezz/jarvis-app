
import React from 'react';

export function MetricsPanel({counts}:{counts: Record<string, number>}) {
  return <div>
    {Object.entries(counts).map(([k,v]) => <div className="kv" key={k}><span>{k}</span><b>{v.toLocaleString()}</b></div>)}
  </div>;
}
