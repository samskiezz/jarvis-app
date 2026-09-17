import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const BSSF_RE = /\b(bssf|brain[\s_-]*status|brain[\s_-]*health|brain[\s_-]*system|system[\s_-]*brain|jarvis[\s_-]*health[\s_-]*score|brain[\s_-]*fusion|operational[\s_-]*score|brain[\s_-]*ops|jarvis[\s_-]*brain[\s_-]*status|system[\s_-]*fusion|health[\s_-]*fusion)\b/i;

export function isBssfQuery(t) { return BSSF_RE.test(t || ''); }

export async function buildBssfScript() {
  try {
    const [brainRes, sysRes] = await Promise.all([
      fetch(`${API}/v1/cinematic/brain`).then(r => r.ok ? r.json() : {}),
      fetch(`${API}/v1/jarvis/system/status`).then(r => r.ok ? r.json() : {}),
    ]);
    const nodes = brainRes?.nodes ?? brainRes?.node_count ?? brainRes?.total_nodes ?? 0;
    const synapses = brainRes?.synapses ?? brainRes?.synapse_count ?? brainRes?.total_synapses ?? 0;
    const cpu = sysRes?.cpu ?? sysRes?.cpu_percent ?? sysRes?.cpu_usage ?? null;
    const mem = sysRes?.memory ?? sysRes?.mem_percent ?? sysRes?.memory_usage ?? sysRes?.mem ?? null;
    const load = sysRes?.load ?? sysRes?.load_avg ?? sysRes?.load_average ?? null;
    const provider = sysRes?.llm_provider ?? sysRes?.provider ?? 'unknown';
    const cpuPct = cpu != null ? Math.round(typeof cpu === 'object' ? (cpu.percent ?? cpu.usage ?? 0) : cpu) : null;
    const memPct = mem != null ? Math.round(typeof mem === 'object' ? (mem.percent ?? mem.usage ?? 0) : mem) : null;
    const healthOk = cpuPct != null ? cpuPct < 85 : true;
    const score = Math.round(
      (healthOk ? 50 : 20) +
      (nodes > 100 ? 30 : nodes > 10 ? 15 : 5) +
      (synapses > 500 ? 20 : synapses > 50 ? 10 : 3)
    );
    return `JARVIS Brain+System fusion: ${nodes} nodes, ${synapses} synapses${cpuPct != null ? `, CPU ${cpuPct}%` : ''}${memPct != null ? `, Mem ${memPct}%` : ''}, LLM provider: ${provider}. Operational score: ${Math.min(score, 100)}/100 — ${score >= 80 ? 'fully operational' : score >= 50 ? 'nominal with capacity to grow' : 'initialising — brain and system resources developing'}.`;
  } catch {
    return 'BSSF: unable to fetch brain or system status — check endpoints.';
  }
}

const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 15000;
const HISTORY_MAX = 60;

function extractNum(val) {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'object') return val.percent ?? val.usage ?? val.value ?? null;
  return null;
}

export default function BrainSystemStatusFusion() {
  const [open, setOpen] = useState(false);
  const [brain, setBrain] = useState(null);
  const [sys, setSys] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [brainRes, sysRes] = await Promise.all([
        fetch(`${API}/v1/cinematic/brain`).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/v1/jarvis/system/status`).then(r => r.ok ? r.json() : {}),
      ]);
      setBrain(brainRes);
      setSys(sysRes);
      setHistory(prev => {
        const snap = {
          t: Date.now(),
          nodes: brainRes?.nodes ?? brainRes?.node_count ?? brainRes?.total_nodes ?? 0,
          synapses: brainRes?.synapses ?? brainRes?.synapse_count ?? brainRes?.total_synapses ?? 0,
          cpu: extractNum(sysRes?.cpu ?? sysRes?.cpu_percent ?? sysRes?.cpu_usage),
          mem: extractNum(sysRes?.memory ?? sysRes?.mem_percent ?? sysRes?.memory_usage ?? sysRes?.mem),
        };
        return [...prev.slice(-HISTORY_MAX + 1), snap];
      });
    } catch { /* silently ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:bssf-toggle', handler);
    return () => window.removeEventListener('jarvis:bssf-toggle', handler);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  if (!open) return null;

  const nodes = brain?.nodes ?? brain?.node_count ?? brain?.total_nodes ?? 0;
  const synapses = brain?.synapses ?? brain?.synapse_count ?? brain?.total_synapses ?? 0;
  const cpuRaw = sys?.cpu ?? sys?.cpu_percent ?? sys?.cpu_usage;
  const memRaw = sys?.memory ?? sys?.mem_percent ?? sys?.memory_usage ?? sys?.mem;
  const loadRaw = sys?.load ?? sys?.load_avg ?? sys?.load_average;
  const cpu = extractNum(cpuRaw);
  const mem = extractNum(memRaw);
  const loadVal = typeof loadRaw === 'object' ? (loadRaw?.[0] ?? null) : (typeof loadRaw === 'number' ? loadRaw : null);
  const provider = sys?.llm_provider ?? sys?.provider ?? '—';
  const uptime = sys?.uptime ?? sys?.uptime_seconds ?? null;

  const healthOk = cpu != null ? cpu < 85 : true;
  const score = Math.min(100, Math.round(
    (healthOk ? 50 : 20) +
    (nodes > 100 ? 30 : nodes > 10 ? 15 : 5) +
    (synapses > 500 ? 20 : synapses > 50 ? 10 : 3)
  ));
  const scoreColor = score >= 80 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';
  const scoreLabel = score >= 80 ? 'FULLY OPERATIONAL' : score >= 50 ? 'NOMINAL' : 'INITIALISING';

  function bar(pct, warn = 80, danger = 95) {
    const p = pct != null ? Math.round(pct) : 0;
    const col = p >= danger ? '#ef4444' : p >= warn ? '#eab308' : '#22c55e';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, height: 5, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${p}%`, height: '100%', background: col, transition: 'width 0.5s', borderRadius: 3 }} />
        </div>
        <span style={{ fontSize: 10, color: col, minWidth: 32, textAlign: 'right' }}>{pct != null ? `${Math.round(pct)}%` : '—'}</span>
      </div>
    );
  }

  // Mini sparkline for nodes/synapses
  function Sparkline({ data, field, color }) {
    if (data.length < 2) return <span style={{ fontSize: 9, color: '#475569' }}>collecting…</span>;
    const vals = data.map(d => d[field]).filter(v => v != null);
    if (!vals.length) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const W = 120, H = 28;
    const pts = vals.map((v, i) => `${Math.round((i / (vals.length - 1)) * W)},${Math.round(H - ((v - min) / range) * H)}`).join(' ');
    return (
      <svg width={W} height={H} style={{ overflow: 'visible' }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
        <circle cx={Math.round(((vals.length - 1) / (vals.length - 1)) * W)} cy={Math.round(H - ((vals[vals.length - 1] - min) / range) * H)} r={2.5} fill={color} />
      </svg>
    );
  }

  async function assess() {
    setAssessing(true);
    setAssessText('');
    try {
      const prompt = `JARVIS Brain+System status: ${nodes} brain nodes, ${synapses} synapses${cpu != null ? `, CPU ${Math.round(cpu)}%` : ''}${mem != null ? `, Memory ${Math.round(mem)}%` : ''}, LLM provider: ${provider}, Operational score: ${score}/100. Provide a 2-sentence operational health assessment and one actionable recommendation.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (r.ok) {
        const j = await r.json();
        const txt = j.response || j.message || j.content || '';
        setAssessText(txt);
        window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
      }
    } catch { /* silently ignore */ }
    setAssessing(false);
  }

  const panelStyle = {
    position: 'fixed',
    left: 872240,
    bottom: 8,
    zIndex: 566,
    width: 340,
    background: 'rgba(8,12,20,0.97)',
    border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: 10,
    padding: 14,
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#e2e8f0',
    boxShadow: '0 0 28px rgba(34,197,94,0.08)',
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>◈ BSSF — Brain × System Fusion</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {/* Operational score */}
      <div style={{ textAlign: 'center', marginBottom: 12, background: scoreColor + '11', border: `1px solid ${scoreColor}44`, borderRadius: 8, padding: '10px 0' }}>
        <div style={{ fontSize: 36, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 9, color: scoreColor, marginTop: 2, fontWeight: 700 }}>{scoreLabel}</div>
        <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>operational score / 100</div>
      </div>

      {/* Brain stats */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#22d3ee', fontWeight: 700, marginBottom: 6 }}>⬡ BRAIN</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
          {[['NODES', nodes, '#22d3ee'], ['SYNAPSES', synapses, '#a78bfa']].map(([label, val, col]) => (
            <div key={label} style={{ background: col + '11', border: `1px solid ${col}33`, borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: col }}>{Number(val).toLocaleString()}</div>
              <div style={{ fontSize: 9, color: '#94a3b8' }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 9, color: '#475569' }}>Nodes trend</div>
          <Sparkline data={history} field="nodes" color="#22d3ee" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <div style={{ fontSize: 9, color: '#475569' }}>Synapses trend</div>
          <Sparkline data={history} field="synapses" color="#a78bfa" />
        </div>
      </div>

      {/* System stats */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#fb923c', fontWeight: 700, marginBottom: 6 }}>⚙ SYSTEM</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 2 }}>
              <span>CPU</span>
            </div>
            {bar(cpu)}
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>Memory</div>
            {bar(mem)}
          </div>
          {loadVal != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
              <span style={{ color: '#64748b' }}>Load avg</span>
              <span style={{ color: '#e2e8f0' }}>{loadVal.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
            <span style={{ color: '#64748b' }}>LLM provider</span>
            <span style={{ color: '#22c55e', fontWeight: 700 }}>{provider}</span>
          </div>
          {uptime != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
              <span style={{ color: '#64748b' }}>Uptime</span>
              <span style={{ color: '#e2e8f0' }}>{typeof uptime === 'number' ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m` : uptime}</span>
            </div>
          )}
        </div>
      </div>

      {/* Assess */}
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10 }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ width: '100%', padding: '6px 0', background: assessing ? '#1e293b' : '#22c55e11', border: '1px solid #22c55e', borderRadius: 4, color: '#22c55e', cursor: assessing ? 'default' : 'pointer', fontSize: 11, fontWeight: 700 }}
        >{assessing ? '⟳ Assessing…' : '▶ ASSESS — JARVIS health brief'}</button>
        {assessText && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', background: '#0f172a', borderRadius: 4, padding: 8, lineHeight: 1.5 }}>{assessText}</div>
        )}
      </div>

      <div style={{ marginTop: 8, fontSize: 9, color: '#334155', textAlign: 'right' }}>
        {loading ? 'Refreshing…' : `Polls every ${POLL_MS / 1000}s · ${history.length} snapshots`}
      </div>
    </div>
  );
}
