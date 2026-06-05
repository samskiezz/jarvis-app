
import React, {useState} from 'react';
import type { ArchitectureManifest, PlaneName } from '../contracts/types';

export function JarvisOperator({manifest, active}:{manifest: ArchitectureManifest; active: PlaneName}) {
  const [input,setInput] = useState('');
  const [messages,setMessages] = useState<string[]>([
    'Jarvis online. Ask me to trace source → ontology → graph/vector → workflow → action → audit.'
  ]);

  function answer(q: string) {
    const plane = manifest.planes[active];
    const route = plane.layers.map(l => l.label).join(' → ');
    if (/gap|missing|risk/i.test(q)) return `${active} gap scan: verify source terms, parser tests, policy gates, audit evidence, and live connector implementation. Route: ${route}.`;
    if (/trace|flow|lineage/i.test(q)) return `${active} trace route: ${route}. Every visible edge requires evidence_id, audit_id, confidence and policy_decision.`;
    if (/deploy|rollout|apollo/i.test(q)) return `Apollo route: desired state → fleet agents → workload identity → OPA policy → health gates → canary rollout → observability → rollback evidence.`;
    if (/mission|case|gotham/i.test(q)) return `Gotham route: live events → entity resolution → geospatial/timeline view → evidence chain → case workspace → action approval → decision replay.`;
    if (/data|ontology|foundry/i.test(q)) return `Foundry route: source registry → acquisition points → raw storage → quality gates → ontology → graph/vector projection → workflow bridge → audit.`;
    return `${active} operational layout: ${route}.`;
  }

  function send() {
    if (!input.trim()) return;
    const q = input.trim();
    setMessages(m => [...m, 'Operator: ' + q, 'Jarvis: ' + answer(q)]);
    setInput('');
  }

  return <div className="panel">
    <div className="header"><h2>Jarvis Operator</h2><span className="badge">{active}</span></div>
    <div className="chatBody">{messages.map((m,i)=><p key={i}>{m}</p>)}</div>
    <div className="input">
      <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send();}} placeholder="Trace a source, gap, mission, rollout, or ontology object..." />
      <button onClick={send}>Run</button>
    </div>
  </div>;
}
