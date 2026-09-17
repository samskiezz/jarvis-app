import { useState, useEffect, useCallback } from 'react';

const API = '';
const UWBR_RE = /\b(underworld|bridge[._-]?console|uwbr|counterfactual|bayesian[._-]?optim|causal[._-]?chain|temporal[._-]?chain|underworld[._-]?platform|graph[._-]?bridge|underworld[._-]?bridge|bridge[._-]?status|optimize[._-]?objective)\b/i;

export function isUwbrQuery(t) {
  return UWBR_RE.test(t || '');
}

export async function buildUwbrScript() {
  try {
    const r = await fetch(`${API}/v1/bridge/status`);
    const d = await r.json();
    const reachable = d.reachable ?? d.status ?? 'unknown';
    const wired = d.wired_modules || d.wired || [];
    const wiredCount = Array.isArray(wired) ? wired.length : Object.keys(wired).length;
    return (
      `Underworld Bridge: platform reachable=${reachable}, ` +
      `${wiredCount} module(s) wired (${Array.isArray(wired) ? wired.slice(0, 4).join(', ') : Object.keys(wired).slice(0, 4).join(', ')}). ` +
      `Capabilities: counterfactual, Bayesian optimization, temporal knowledge graph, graph analytics.`
    );
  } catch {
    return 'Underworld Bridge status unavailable.';
  }
}

const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const VI = '#A78BFA';
const PK = '#F472B6';
const OR = '#F97316';
const PANEL_W = 580;
const PANEL_H = 580;

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
    border: `1px solid ${color}44`, background: `${color}14`,
    color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

function JsonInput({ label, value, onChange, rows = 4, placeholder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1 }}>{label}</span>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{
          background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
          borderRadius: 4, color: '#DCEBF5', padding: '4px 8px', fontSize: 10,
          outline: 'none', fontFamily: "'JetBrains Mono',monospace", resize: 'vertical',
          width: '100%', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function ResultBlock({ data }) {
  if (!data) return null;
  return (
    <pre style={{
      background: 'rgba(0,207,255,0.03)', border: `1px solid ${CY}22`,
      borderRadius: 6, padding: '8px 10px', color: '#DCEBF5', fontSize: 10,
      fontFamily: "'JetBrains Mono',monospace", overflowX: 'auto', whiteSpace: 'pre-wrap',
      wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto',
      marginTop: 8,
    }}>{typeof data === 'string' ? data : JSON.stringify(data, null, 2)}</pre>
  );
}

export default function UnderworldBridgeConsole() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('STATUS');

  // Counterfactual state
  const [cfBaseline, setCfBaseline] = useState('{"x": 0.5}');
  const [cfIntervention, setCfIntervention] = useState('{"x": 0.8}');
  const [cfLabel, setCfLabel] = useState('intervention');
  const [cfResult, setCfResult] = useState(null);
  const [cfRunning, setCfRunning] = useState(false);

  // Optimize state
  const [optObjective, setOptObjective] = useState('branin');
  const [optNIter, setOptNIter] = useState(15);
  const [optSeed, setOptSeed] = useState(0);
  const [optResult, setOptResult] = useState(null);
  const [optRunning, setOptRunning] = useState(false);

  // Temporal state
  const [tempMode, setTempMode] = useState('SLICE');
  const [tempNodes, setTempNodes] = useState('[{"id": "A", "value": 1}]');
  const [tempTick, setTempTick] = useState(0);
  const [tempEdges, setTempEdges] = useState('[{"source": "A", "target": "B", "weight": 1}]');
  const [tempStart, setTempStart] = useState('A');
  const [tempResult, setTempResult] = useState(null);
  const [tempRunning, setTempRunning] = useState(false);

  // Graph state
  const [graphObjects, setGraphObjects] = useState('[{"id": "node1", "label": "example"}]');
  const [graphLinks, setGraphLinks] = useState('[{"source": "node1", "target": "node1"}]');
  const [graphResult, setGraphResult] = useState(null);
  const [graphRunning, setGraphRunning] = useState(false);

  // Assess
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/bridge/status`);
      setStatus(await r.json());
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:uwbr-toggle', onToggle);
    return () => window.removeEventListener('jarvis:uwbr-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      loadStatus();
      timer = setInterval(loadStatus, 60000);
    }
    return () => clearInterval(timer);
  }, [open, loadStatus]);

  const runCounterfactual = useCallback(async () => {
    setCfRunning(true); setCfResult(null);
    try {
      let baseline, intervention;
      try { baseline = JSON.parse(cfBaseline); } catch { baseline = {}; }
      try { intervention = JSON.parse(cfIntervention); } catch { intervention = {}; }
      const r = await fetch(`${API}/v1/bridge/counterfactual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseline, intervention, label: cfLabel }),
      });
      setCfResult(await r.json());
    } catch (e) { setCfResult({ error: e.message }); }
    setCfRunning(false);
  }, [cfBaseline, cfIntervention, cfLabel]);

  const runOptimize = useCallback(async () => {
    setOptRunning(true); setOptResult(null);
    try {
      const r = await fetch(`${API}/v1/bridge/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective_name: optObjective, n_iter: optNIter, seed: optSeed }),
      });
      setOptResult(await r.json());
    } catch (e) { setOptResult({ error: e.message }); }
    setOptRunning(false);
  }, [optObjective, optNIter, optSeed]);

  const runTemporal = useCallback(async () => {
    setTempRunning(true); setTempResult(null);
    try {
      let body;
      if (tempMode === 'SLICE') {
        let nodes;
        try { nodes = JSON.parse(tempNodes); } catch { nodes = []; }
        body = { nodes, tick: tempTick };
      } else {
        let edges;
        try { edges = JSON.parse(tempEdges); } catch { edges = []; }
        body = { edges, start: tempStart };
      }
      const r = await fetch(`${API}/v1/bridge/temporal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setTempResult(await r.json());
    } catch (e) { setTempResult({ error: e.message }); }
    setTempRunning(false);
  }, [tempMode, tempNodes, tempTick, tempEdges, tempStart]);

  const runGraph = useCallback(async () => {
    setGraphRunning(true); setGraphResult(null);
    try {
      let objects, links;
      try { objects = JSON.parse(graphObjects); } catch { objects = []; }
      try { links = JSON.parse(graphLinks); } catch { links = []; }
      const r = await fetch(`${API}/v1/bridge/graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objects, links }),
      });
      setGraphResult(await r.json());
    } catch (e) { setGraphResult({ error: e.message }); }
    setGraphRunning(false);
  }, [graphObjects, graphLinks]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief('');
    try {
      const reachable = status?.reachable ?? status?.status ?? 'unknown';
      const modules = status?.wired_modules || status?.wired || [];
      const msg = `Underworld Bridge status: reachable=${reachable}, modules=${JSON.stringify(modules).slice(0, 100)}. Give a 2-sentence brief on underworld platform health and capabilities.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }, [status]);

  const reachable = status?.reachable;
  const badgeColor = reachable === true ? GR : reachable === false ? '#6E8AA0' : AM;
  const badgeLabel = reachable === true ? 'LIVE' : reachable === false ? 'OFFLINE' : '?';
  const wiredModules = status?.wired_modules || status?.wired || [];
  const wiredCount = Array.isArray(wiredModules) ? wiredModules.length : Object.keys(wiredModules).length;

  const inpStyle = {
    background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
    borderRadius: 4, color: '#DCEBF5', padding: '3px 8px', fontSize: 10,
    outline: 'none', fontFamily: "'JetBrains Mono',monospace",
  };

  const btnStyle = (col = CY) => ({
    padding: '3px 10px', borderRadius: 3, border: `1px solid ${col}55`,
    background: `${col}14`, color: col, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
  });

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Underworld Bridge Console (UWBR)"
        style={{
          position: 'fixed', left: 707520, bottom: 8, zIndex: 249,
          width: 60, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ⬡ UWBR
        <span style={{
          background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
          fontSize: 8, fontWeight: 700, minWidth: 20, textAlign: 'center',
        }}>{badgeLabel}</span>
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9200,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${VI}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${VI}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${VI}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: VI, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${VI}` }}>
              ⬡ UNDERWORLD BRIDGE
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button onClick={assess} disabled={assessing} style={btnStyle(VI)}>
                {assessing ? 'assessing…' : '▶ ASSESS'}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'STATUS', val: reachable === true ? 'REACHABLE' : reachable === false ? 'OFFLINE' : 'UNKNOWN', col: badgeColor },
              { label: 'MODULES WIRED', val: wiredCount, col: VI },
              { label: 'PLATFORM', val: status?.platform || status?.engine || '—', col: GR },
              { label: 'MODE', val: status?.mode || status?.type || '—', col: OR },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center', minWidth: 0,
              }}>
                <div style={{ color: col, fontSize: typeof val === 'number' ? 16 : 9, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexShrink: 0 }}>
            {['STATUS', 'COUNTERFACTUAL', 'OPTIMIZE', 'TEMPORAL', 'GRAPH'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? VI : '#2a3a4a'}`,
                  background: tab === t ? `${VI}22` : 'transparent',
                  color: tab === t ? VI : '#6E8AA0',
                }}
              >{t}</button>
            ))}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>

            {tab === 'STATUS' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                {status ? Object.entries(status).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderBottom: `1px solid ${VI}11`, paddingBottom: 5 }}>
                    <span style={{ color: '#6E8AA0', fontSize: 10, width: 140, flexShrink: 0 }}>{k}</span>
                    <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1, wordBreak: 'break-all' }}>
                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </span>
                  </div>
                )) : (
                  <div style={{ color: '#6E8AA0', fontSize: 11, paddingTop: 20 }}>Loading bridge status…</div>
                )}
                {status && Array.isArray(wiredModules) && wiredModules.length > 0 && (
                  <div style={{ paddingTop: 6 }}>
                    <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>WIRED MODULES</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {wiredModules.map((m, i) => chip(String(m), VI))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'COUNTERFACTUAL' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1 }}>FORK BASELINE WITH INTERVENTION → REPORT DIVERGENCE</div>
                <JsonInput label="BASELINE (JSON)" value={cfBaseline} onChange={setCfBaseline} rows={3}
                  placeholder='{"x": 0.5}' />
                <JsonInput label="INTERVENTION (JSON)" value={cfIntervention} onChange={setCfIntervention} rows={3}
                  placeholder='{"x": 0.8}' />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#6E8AA0', fontSize: 10, width: 60, flexShrink: 0 }}>LABEL</span>
                  <input value={cfLabel} onChange={e => setCfLabel(e.target.value)}
                    style={{ ...inpStyle, flex: 1 }} placeholder="intervention" />
                </div>
                <button onClick={runCounterfactual} disabled={cfRunning} style={{ ...btnStyle(OR), alignSelf: 'flex-start' }}>
                  {cfRunning ? 'running…' : '▶ RUN COUNTERFACTUAL'}
                </button>
                <ResultBlock data={cfResult} />
              </div>
            )}

            {tab === 'OPTIMIZE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1 }}>BAYESIAN OPTIMIZATION OVER BENCHMARK OBJECTIVE</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#6E8AA0', fontSize: 10, width: 80, flexShrink: 0 }}>OBJECTIVE</span>
                  <select value={optObjective} onChange={e => setOptObjective(e.target.value)}
                    style={{ ...inpStyle, flex: 1 }}>
                    {['branin', 'hartmann3', 'hartmann6'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#6E8AA0', fontSize: 10, width: 80, flexShrink: 0 }}>ITERATIONS</span>
                  <input type="range" min={5} max={50} value={optNIter} onChange={e => setOptNIter(Number(e.target.value))}
                    style={{ flex: 1 }} />
                  <span style={{ color: VI, fontSize: 10, width: 24 }}>{optNIter}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#6E8AA0', fontSize: 10, width: 80, flexShrink: 0 }}>SEED</span>
                  <input type="number" value={optSeed} onChange={e => setOptSeed(Number(e.target.value))}
                    style={{ ...inpStyle, width: 70 }} min={0} max={9999} />
                </div>
                <button onClick={runOptimize} disabled={optRunning} style={{ ...btnStyle(GR), alignSelf: 'flex-start' }}>
                  {optRunning ? 'optimizing…' : '▶ RUN OPTIMIZATION'}
                </button>
                {optResult && (
                  <div>
                    {optResult.best_value != null && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        {chip(`best: ${Number(optResult.best_value).toFixed(4)}`, GR)}
                        {optResult.objective && chip(optResult.objective, VI)}
                        {optResult.n_iter && chip(`${optResult.n_iter} iters`, CY)}
                      </div>
                    )}
                    <ResultBlock data={optResult} />
                  </div>
                )}
              </div>
            )}

            {tab === 'TEMPORAL' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1 }}>TEMPORAL KNOWLEDGE GRAPH — SLICE OR CAUSAL CHAIN</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['SLICE', 'CAUSAL'].map(m => (
                    <button key={m} onClick={() => setTempMode(m)} style={{
                      padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                      border: `1px solid ${tempMode === m ? CY : '#2a3a4a'}`,
                      background: tempMode === m ? `${CY}22` : 'transparent',
                      color: tempMode === m ? CY : '#6E8AA0',
                    }}>{m}</button>
                  ))}
                </div>
                {tempMode === 'SLICE' ? (
                  <>
                    <JsonInput label="NODES (JSON array)" value={tempNodes} onChange={setTempNodes} rows={3}
                      placeholder='[{"id": "A", "value": 1}]' />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#6E8AA0', fontSize: 10, width: 40, flexShrink: 0 }}>TICK</span>
                      <input type="number" value={tempTick} onChange={e => setTempTick(Number(e.target.value))}
                        style={{ ...inpStyle, width: 70 }} min={0} />
                    </div>
                  </>
                ) : (
                  <>
                    <JsonInput label="EDGES (JSON array)" value={tempEdges} onChange={setTempEdges} rows={3}
                      placeholder='[{"source": "A", "target": "B", "weight": 1}]' />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#6E8AA0', fontSize: 10, width: 40, flexShrink: 0 }}>START</span>
                      <input value={tempStart} onChange={e => setTempStart(e.target.value)}
                        style={{ ...inpStyle, flex: 1 }} placeholder="start node id" />
                    </div>
                  </>
                )}
                <button onClick={runTemporal} disabled={tempRunning} style={{ ...btnStyle(CY), alignSelf: 'flex-start' }}>
                  {tempRunning ? 'running…' : `▶ RUN ${tempMode}`}
                </button>
                <ResultBlock data={tempResult} />
              </div>
            )}

            {tab === 'GRAPH' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1 }}>GRAPH ANALYTICS — PAGERANK · PREREQUISITES · NOVELTY · SHORTEST PATH</div>
                <JsonInput label="OBJECTS (JSON array)" value={graphObjects} onChange={setGraphObjects} rows={4}
                  placeholder='[{"id": "node1", "label": "example"}]' />
                <JsonInput label="LINKS (JSON array)" value={graphLinks} onChange={setGraphLinks} rows={3}
                  placeholder='[{"source": "node1", "target": "node2"}]' />
                <button onClick={runGraph} disabled={graphRunning} style={{ ...btnStyle(PK), alignSelf: 'flex-start' }}>
                  {graphRunning ? 'running…' : '▶ RUN GRAPH ANALYTICS'}
                </button>
                {graphResult && (
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                      {graphResult.n_nodes != null && chip(`${graphResult.n_nodes} nodes`, GR)}
                      {graphResult.n_edges != null && chip(`${graphResult.n_edges} edges`, CY)}
                      {graphResult.pagerank && chip('pagerank ✓', VI)}
                      {graphResult.prerequisites && chip('prereqs ✓', OR)}
                    </div>
                    <ResultBlock data={graphResult} />
                  </div>
                )}
              </div>
            )}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${VI}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(167,139,250,0.03)',
            }}>
              <span style={{ color: VI, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
