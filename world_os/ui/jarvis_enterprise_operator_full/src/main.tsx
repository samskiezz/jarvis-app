
import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles/operator.css';
import manifest from './data/architecture.manifest.json';
import graph from './data/visual_graph.sample.json';
import type {ArchitectureManifest, PlaneName, VisualNode, VisualEdge} from './contracts/types';
import {PlaneSelector} from './components/PlaneSelector';
import {LayerInspector} from './components/LayerInspector';
import {GraphCanvas} from './components/GraphCanvas';
import {JarvisOperator} from './components/JarvisOperator';
import {MetricsPanel} from './components/MetricsPanel';

const architecture = manifest as ArchitectureManifest;
const sampleGraph = graph as {nodes: VisualNode[]; edges: VisualEdge[]};

function App() {
  const [active,setActive] = useState<PlaneName>('Foundry');
  const [selected,setSelected] = useState<string | null>(null);

  const counts = useMemo(() => ({
    'Domain subjects': 10000,
    'Priority points': 1000,
    'V4 acquisition points': 5000,
    'Source families': 500,
    'Endpoint candidates': 92000,
    'OCR candidates': 30000,
    'Benchmarks': 30000
  }), []);

  useEffect(() => { setSelected(null); }, [active]);

  return <div className="operator">
    <div className="panel">
      <div className="header"><h2>Jarvis OS</h2><span className="badge">typed / audited</span></div>
      <PlaneSelector manifest={architecture} active={active} onChange={setActive}/>
      <MetricsPanel counts={counts}/>
      <LayerInspector manifest={architecture} active={active} selectedNodeId={selected}/>
    </div>
    <div className="panel" style={{position:'relative'}}>
      <div className="overlay">
        <h3>{active} Architecture Graph</h3>
        <span className="badge">no random edges — evidence-backed only</span>
      </div>
      <GraphCanvas nodes={sampleGraph.nodes} edges={sampleGraph.edges} active={active} onSelect={setSelected}/>
    </div>
    <JarvisOperator manifest={architecture} active={active}/>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
