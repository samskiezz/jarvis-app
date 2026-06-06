import React, {useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles/theme.css';
import {planes, PlaneName} from './data/planes';

function NeuralGlobe({active}:{active:PlaneName}) {
  const nodes = useMemo(()=>Array.from({length:180},(_,i)=>{
    const angle = i * 0.65;
    const radius = 145 + (i % 4) * 32;
    return {i, x: Math.cos(angle)*radius, y: Math.sin(angle)*radius, r: 3 + (i%5), opacity: .45 + (i%7)*.06};
  }),[]);
  const color = active === 'Foundry' ? '#00d4ff' : active === 'Gotham' ? '#ff3864' : '#7CFF7C';
  return <div className="neuralSvgWrap" aria-label={`${active} neural visualiser`}>
    <svg viewBox="-260 -260 520 520" className="neuralSvg">
      <defs>
        <filter id="softGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <radialGradient id="core"><stop offset="0%" stopColor={color}/><stop offset="100%" stopColor="#06111f"/></radialGradient>
      </defs>
      <circle r="248" fill="rgba(10,20,38,.45)" stroke="rgba(140,220,255,.22)"/>
      {nodes.slice(0,70).map((n,idx)=>{
        const m=nodes[(idx*7)%nodes.length];
        return <line key={'e'+idx} x1={n.x} y1={n.y} x2={m.x} y2={m.y} stroke={color} strokeOpacity=".12" strokeWidth="1"/>;
      })}
      {nodes.map(n=><circle key={n.i} cx={n.x} cy={n.y} r={n.r} fill={color} opacity={n.opacity} filter="url(#softGlow)"/>)}
      <circle r="54" fill="url(#core)" opacity=".96" filter="url(#softGlow)"/>
      <text y="5" textAnchor="middle" fill="#e8f2ff" fontSize="22" fontWeight="700">{active}</text>
    </svg>
  </div>;
}

function LeftPanel({active,setActive}:{active:PlaneName,setActive:(p:PlaneName)=>void}) {
  const p = planes[active];
  return <div className="panel">
    <h2>JARVIS OS</h2>
    <div className="toggle">
      {Object.keys(planes).map(k=><button key={k} className={active===k?'active':''} onClick={()=>setActive(k as PlaneName)}>{k}</button>)}
    </div>
    <div style={{padding:'0 18px 18px'}}>
      <p>{p.purpose}</p>
      {p.layers.map(x=><span className="badge" key={x}>{x}</span>)}
    </div>
    <div className="metric"><span>Domain subjects</span><b>10,000</b></div>
    <div className="metric"><span>Priority acquisition points</span><b>1,000</b></div>
    <div className="metric"><span>Endpoint candidates</span><b>92,000</b></div>
    <div className="metric"><span>OCR candidates</span><b>30,000</b></div>
    <div className="metric"><span>Benchmark candidates</span><b>30,000</b></div>
  </div>
}

function JarvisPanel({active}:{active:PlaneName}) {
  const [messages,setMessages] = useState([`Jarvis online. ${active} plane selected. I can trace source → ontology → graph/vector → workflow → action → audit.`]);
  const [input,setInput] = useState('');
  const send=()=>{
    if(!input.trim()) return;
    const reply = active==='Foundry'
      ? 'Foundry route: source family → connector → raw storage → quality gate → ontology object → graph/vector projection → workflow.'
      : active==='Gotham'
      ? 'Gotham route: live event/entity → operational picture → map/timeline/evidence → case/action proposal → approval → audit replay.'
      : 'Apollo route: desired state → rollout plan → fleet health gate → canary/progressive release → drift monitor → rollback/audit.';
    setMessages([...messages, `Operator: ${input}`, `Jarvis: ${reply}`]);
    setInput('');
  };
  return <div className="panel jarvis"><h2>Jarvis Operator</h2><div className="chat">{messages.map((m,i)=><div key={i} className="msg">{m}</div>)}</div><div className="input"><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask Jarvis to trace a domain, source, object, workflow, rollout..."/><button onClick={send}>Run</button></div></div>;
}

function App(){
  const [active,setActive]=useState<PlaneName>('Foundry');
  return <main className="shell"><LeftPanel active={active} setActive={setActive}/><section className="visual"><NeuralGlobe active={active}/></section><JarvisPanel active={active}/></main>;
}

createRoot(document.getElementById('root')!).render(<App/>);
