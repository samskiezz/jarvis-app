
import React, {useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Canvas} from '@react-three/fiber';
import {OrbitControls, Text, Sphere} from '@react-three/drei';
import './styles/theme.css';
import {planes, PlaneName} from './data/planes';

function NodeSphere({i, active}:{i:number, active:string}) {
  const angle = i * 0.65;
  const radius = 2.2 + (i % 4) * .55;
  const z = ((i % 7) - 3) * .28;
  const color = active === 'Foundry' ? '#00d4ff' : active === 'Gotham' ? '#ff3864' : '#7CFF7C';
  return <Sphere args={[0.075 + (i%5)*0.01, 16, 16]} position={[Math.cos(angle)*radius, Math.sin(angle)*radius, z]}>
    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55}/>
  </Sphere>
}

function NeuralGlobe({active}:{active:PlaneName}) {
  const nodes = useMemo(()=>Array.from({length:180},(_,i)=>i),[]);
  return <Canvas camera={{position:[0,0,7], fov:55}}>
    <ambientLight intensity={0.25}/>
    <pointLight position={[4,4,8]} intensity={2}/>
    <group rotation={[0.6,0.2,0]}>
      {nodes.map(i=><NodeSphere key={i} i={i} active={active}/>)}
      <Text position={[0,0,0]} fontSize={0.32} color="#e8f2ff" anchorX="center" anchorY="middle">{active}</Text>
    </group>
    <OrbitControls enablePan={false}/>
  </Canvas>
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
  const [messages,setMessages] = useState([
    `Jarvis online. ${active} plane selected. I can trace source → ontology → graph/vector → workflow → action → audit.`
  ]);
  const [input,setInput] = useState('');
  const send=()=>{
    if(!input.trim()) return;
    const reply = active==='Foundry'
      ? 'Foundry route: source family → connector → raw Iceberg → quality gate → ontology object → graph/vector projection → workflow.'
      : active==='Gotham'
      ? 'Gotham route: live event/entity → operational picture → map/timeline/evidence → case/action proposal → human approval → audit replay.'
      : 'Apollo route: desired state → rollout plan → fleet health gate → canary/progressive release → drift monitor → rollback/audit.';
    setMessages([...messages, 'Operator: '+input, 'Jarvis: '+reply]);
    setInput('');
  };
  return <div className="panel jarvis">
    <h2>Jarvis Operator</h2>
    <div className="chat">{messages.map((m,i)=><p key={i}>{m}</p>)}</div>
    <div className="input"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send()}} placeholder="Ask Jarvis to trace a dataset, action, deployment, or risk..."/><button onClick={send}>Run</button></div>
  </div>
}

function App(){
  const [active,setActive]=useState<PlaneName>('Foundry');
  return <div className="shell">
    <LeftPanel active={active} setActive={setActive}/>
    <div className="panel canvasWrap">
      <div className="overlay"><h3>{active} Neural Operating Visualiser</h3><span className="badge">3D graph / vector / workflow plane</span></div>
      <NeuralGlobe active={active}/>
    </div>
    <JarvisPanel active={active}/>
  </div>
}

createRoot(document.getElementById('root')!).render(<App/>);
