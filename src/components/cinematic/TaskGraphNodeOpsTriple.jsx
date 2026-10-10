import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TGNOE_RE = /\b(tgnoe|task\s+graph\s+ops|task\s+node\s+ops|reactive\s+task|node\s+ops\s+task|task\s+graph\s+node\s+ops|task\s+ops\s+node|dormant\s+task\s+triple|task\s+centrality\s+ops|node\s+backed\s+task)\b/i;

export function isTgnoeQuery(t) { return TGNOE_RE.test(t || ''); }

export async function buildTgnoeScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [tkR, gnR, oeR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
  ]);
  const tasks = Array.isArray(tkR.value) ? tkR.value : (tkR.value?.tasks ?? tkR.value?.data ?? []);
  const nodes = Array.isArray(gnR.value) ? gnR.value : (gnR.value?.nodes ?? gnR.value?.data ?? []);
  const events = Array.isArray(oeR.value) ? oeR.value : (oeR.value?.events ?? oeR.value?.data ?? []);

  const gnText = nodes.map(n => `${n.label ?? n.id ?? ''} ${n.type ?? ''}`.toLowerCase()).join(' ');
  const oeText = events.map(e => `${e.title ?? e.name ?? e.type ?? ''} ${e.description ?? ''} ${e.service ?? ''}`.toLowerCase()).join(' ');

  let fullyReactive = 0, nodeBacked = 0, opsTriggered = 0, dormant = 0;
  for (const t of tasks) {
    const label = `${t.title ?? t.name ?? t.id ?? ''} ${t.description ?? ''}`.toLowerCase();
    const tokens = label.split(/\W+/).filter(Boolean);
    const score = text => tokens.reduce((s, tok) => s + (text.includes(tok) ? 1 : 0), 0);
    const gnHit = score(gnText) > 0;
    const oeHit = score(oeText) > 0;
    if (gnHit && oeHit) fullyReactive++;
    else if (gnHit) nodeBacked++;
    else if (oeHit) opsTriggered++;
    else dormant++;
  }
  return `TGNOE Task × Graph Node × Ops Event: ${tasks.length} tasks assessed. ` +
    `FULLY REACTIVE: ${fullyReactive} (node-backed + ops-triggered). ` +
    `NODE-BACKED: ${nodeBacked} (graph node match, no ops event). ` +
    `OPS-TRIGGERED: ${opsTriggered} (ops event match, no node). ` +
    `DORMANT: ${dormant} (neither — no graph or ops coverage). ` +
    `${nodes.length} graph nodes. ${events.length} ops events.`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { 'FULLY REACTIVE': '#22d3ee', 'NODE-BACKED': '#a78bfa', 'OPS-TRIGGERED': '#f87171', 'DORMANT': '#f59e0b' };
const STATE_ORDER = ['FULLY REACTIVE', 'NODE-BACKED', 'OPS-TRIGGERED', 'DORMANT'];

function correlate(task, nodes, events) {
  const label = `${task.title ?? task.name ?? task.id ?? ''} ${task.description ?? ''}`.toLowerCase();
  const tokens = label.split(/\W+/).filter(Boolean);
  const score = text => tokens.reduce((s, tok) => s + (text.toLowerCase().includes(tok) ? 1 : 0), 0);
  const gnText = nodes.map(n => `${n.label ?? n.id ?? ''} ${n.type ?? ''}`).join(' ');
  const oeText = events.map(e => `${e.title ?? e.name ?? e.type ?? ''} ${e.description ?? ''} ${e.service ?? ''}`).join(' ');
  const gnHit = score(gnText) > 0;
  const oeHit = score(oeText) > 0;
  if (gnHit && oeHit) return 'FULLY REACTIVE';
  if (gnHit) return 'NODE-BACKED';
  if (oeHit) return 'OPS-TRIGGERED';
  return 'DORMANT';
}

export default function TaskGraphNodeOpsTriple() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [events, setEvents] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [tkR, gnR, oeR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
      ]);
      const tks = Array.isArray(tkR.value) ? tkR.value : (tkR.value?.tasks ?? tkR.value?.data ?? []);
      const gns = Array.isArray(gnR.value) ? gnR.value : (gnR.value?.nodes ?? gnR.value?.data ?? []);
      const oes = Array.isArray(oeR.value) ? oeR.value : (oeR.value?.events ?? oeR.value?.data ?? []);
      setTasks(tks);
      setNodes(gns);
      setEvents(oes);
      setRows(tks.map(t => ({ ...t, state: correlate(t, gns, oes) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:tgnoe-toggle', toggle);
    return () => window.removeEventListener('jarvis:tgnoe-toggle', toggle);
  }, [toggle]);

  useEffect(() => {
    if (open) {
      load();
      intervalRef.current = setInterval(load, 90_000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const summary = `TGNOE: ${rows.length} tasks. FULLY REACTIVE: ${rows.filter(r => r.state === 'FULLY REACTIVE').length}. NODE-BACKED: ${rows.filter(r => r.state === 'NODE-BACKED').length}. OPS-TRIGGERED: ${rows.filter(r => r.state === 'OPS-TRIGGERED').length}. DORMANT: ${rows.filter(r => r.state === 'DORMANT').length}.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this TGNOE task × graph node × ops event coverage state and recommend next steps: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response ?? d.message ?? summary;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (_) {}
    setAssessing(false);
  }, [rows]);

  const stateCounts = STATE_ORDER.reduce((acc, s) => ({ ...acc, [s]: rows.filter(r => r.state === s).length }), {});
  const visible = rows.filter(r =>
    (filter === 'ALL' || r.state === filter) &&
    (!search || (r.title ?? r.name ?? r.id ?? '').toLowerCase().includes(search.toLowerCase()))
  );
  const reactiveCount = stateCounts['FULLY REACTIVE'] ?? 0;
  const total = rows.length;
  const pct = total > 0 ? Math.round((reactiveCount / total) * 100) : 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9984, width: 680, maxHeight: 610,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(34,211,238,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="TGNOE Task × Graph Node × Ops Event Triple Coverage" style={{
        position: 'fixed', left: 762480, bottom: 8, zIndex: 390,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ TGNOE
        {reactiveCount > 0 && (
          <span style={{ background: '#22d3ee', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {reactiveCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ TGNOE</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Task × Graph Node × Ops Event Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 9 }}>updating…</span>}
        {lastUpdated && <span style={{ color: '#475569', fontSize: 9 }}>{lastUpdated}</span>}
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={TILE}>
            <div style={{ ...LABEL, color: STATE_COLOR[s] }}>{s}</div>
            <div style={{ ...VAL, color: STATE_COLOR[s] }}>{stateCounts[s] ?? 0}</div>
          </div>
        ))}
        <div style={TILE}>
          <div style={LABEL}>TOTAL</div>
          <div style={VAL}>{total}</div>
        </div>
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 4 }}>
          <span>FULLY REACTIVE COVERAGE</span><span>{pct}%</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? STATE_COLOR[f] ?? '#22d3ee' : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 3, color: filter === f ? '#000' : '#94a3b8',
            fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no tasks match</div>
        ) : visible.map((t, i) => (
          <div key={t.id ?? i} style={{
            padding: '6px 8px', marginBottom: 4, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[t.state]}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 8, color: STATE_COLOR[t.state], minWidth: 110, letterSpacing: 0.5 }}>{t.state}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.title ?? t.name ?? t.id ?? '—'}
            </span>
            {t.priority && <span style={{ fontSize: 8, color: '#64748b' }}>{t.priority}</span>}
            {t.status && <span style={{ fontSize: 8, color: '#475569' }}>{t.status}</span>}
          </div>
        ))}
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
        <button onClick={load} disabled={loading} style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>⟳ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: assessing ? 'rgba(34,211,238,0.08)' : 'rgba(34,211,238,0.12)',
          border: '1px solid rgba(34,211,238,0.3)', borderRadius: 4,
          color: '#22d3ee', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>{assessing ? '…ASSESSING' : '⬡ ASSESS'}</button>
      </div>
    </div>
  );
}
