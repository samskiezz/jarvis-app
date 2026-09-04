import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IKOE_RE = /\b(ikoe|investment\s+knowledge\s+ops|invest\s+kb\s+ops|investment\s+ops\s+knowledge|investment\s+knowledge\s+event|invest\s+ops\s+event|kb\s+invest\s+ops|ops\s+invest\s+knowledge)\b/i;

export function isIkoeQuery(t) { return IKOE_RE.test(t || ''); }

export async function buildIkoeScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [invR, kbR, oeR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
  ]);
  const investments = Array.isArray(invR.value) ? invR.value : (invR.value?.investments ?? invR.value?.data ?? []);
  const kb = Array.isArray(kbR.value) ? kbR.value : (kbR.value?.articles ?? kbR.value?.items ?? kbR.value?.data ?? []);
  const ops = Array.isArray(oeR.value) ? oeR.value : (oeR.value?.events ?? oeR.value?.data ?? []);

  const kbText = kb.map(a => `${a.title ?? a.name ?? a.id ?? ''} ${a.content ?? a.summary ?? ''}`.toLowerCase()).join(' ');
  const opsText = ops.map(e => `${e.title ?? e.name ?? e.type ?? e.id ?? ''} ${e.description ?? ''}`.toLowerCase()).join(' ');

  let fullyAlerted = 0, kbOnly = 0, opsTriggered = 0, blind = 0;
  for (const inv of investments) {
    const label = `${inv.title ?? inv.name ?? inv.ticker ?? inv.id ?? ''}`.toLowerCase();
    const tokens = label.split(/\W+/).filter(Boolean);
    const score = t => tokens.reduce((s, tok) => s + (t.includes(tok) ? 1 : 0), 0);
    const kbHit = score(kbText) > 0;
    const opsHit = score(opsText) > 0;
    if (kbHit && opsHit) fullyAlerted++;
    else if (kbHit) kbOnly++;
    else if (opsHit) opsTriggered++;
    else blind++;
  }
  return `IKOE Investment × Knowledge × Ops Event: ${investments.length} investments assessed. ` +
    `FULLY ALERTED: ${fullyAlerted} (KB-backed + ops-triggered). ` +
    `KB-ONLY: ${kbOnly} (KB article matched, no ops event). ` +
    `OPS-TRIGGERED: ${opsTriggered} (ops event matched, no KB). ` +
    `BLIND: ${blind} (neither KB nor ops coverage). ` +
    `${kb.length} KB articles. ${ops.length} ops events.`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { 'FULLY ALERTED': '#22d3ee', 'KB-ONLY': '#a78bfa', 'OPS-TRIGGERED': '#34d399', 'BLIND': '#f59e0b' };
const STATE_ORDER = ['FULLY ALERTED', 'KB-ONLY', 'OPS-TRIGGERED', 'BLIND'];

function correlate(investment, kb, ops) {
  const label = `${investment.title ?? investment.name ?? investment.ticker ?? investment.id ?? ''}`.toLowerCase();
  const tokens = label.split(/\W+/).filter(Boolean);
  const score = text => tokens.reduce((s, tok) => s + (text.toLowerCase().includes(tok) ? 1 : 0), 0);
  const kbText = kb.map(a => `${a.title ?? a.name ?? a.id ?? ''} ${a.content ?? a.summary ?? ''}`).join(' ');
  const opsText = ops.map(e => `${e.title ?? e.name ?? e.type ?? e.id ?? ''} ${e.description ?? ''}`).join(' ');
  const kbHit = score(kbText) > 0;
  const opsHit = score(opsText) > 0;
  if (kbHit && opsHit) return 'FULLY ALERTED';
  if (kbHit) return 'KB-ONLY';
  if (opsHit) return 'OPS-TRIGGERED';
  return 'BLIND';
}

export default function InvestmentKnowledgeOpsTriple() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [kb, setKb] = useState([]);
  const [ops, setOps] = useState([]);
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
      const [invR, kbR, oeR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
      ]);
      const invs = Array.isArray(invR.value) ? invR.value : (invR.value?.investments ?? invR.value?.data ?? []);
      const kbs = Array.isArray(kbR.value) ? kbR.value : (kbR.value?.articles ?? kbR.value?.items ?? kbR.value?.data ?? []);
      const oes = Array.isArray(oeR.value) ? oeR.value : (oeR.value?.events ?? oeR.value?.data ?? []);
      setInvestments(invs);
      setKb(kbs);
      setOps(oes);
      setRows(invs.map(inv => ({ ...inv, state: correlate(inv, kbs, oes) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:ikoe-toggle', toggle);
    return () => window.removeEventListener('jarvis:ikoe-toggle', toggle);
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
    const blind = rows.filter(r => r.state === 'BLIND').length;
    const summary = `IKOE: ${rows.length} investments. FULLY ALERTED: ${rows.filter(r => r.state === 'FULLY ALERTED').length}. KB-ONLY: ${rows.filter(r => r.state === 'KB-ONLY').length}. OPS-TRIGGERED: ${rows.filter(r => r.state === 'OPS-TRIGGERED').length}. BLIND: ${blind}.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this IKOE investment coverage state and recommend next steps: ${summary}` }),
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
    (!search || (r.title ?? r.name ?? r.ticker ?? r.id ?? '').toLowerCase().includes(search.toLowerCase()))
  );
  const blindCount = stateCounts['BLIND'] ?? 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9982, width: 680, maxHeight: 610,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(34,211,238,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="IKOE Investment × Knowledge × Ops Event Coverage" style={{
        position: 'fixed', left: 758560, bottom: 8, zIndex: 383,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ IKOE
        {blindCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {blindCount}
          </span>
        )}
      </button>
    );
  }

  const total = rows.length;
  const covered = stateCounts['FULLY ALERTED'] ?? 0;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <div style={PANEL}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ IKOE</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Investment × Knowledge × Ops Event Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 9 }}>updating…</span>}
        {lastUpdated && <span style={{ color: '#475569', fontSize: 9 }}>{lastUpdated}</span>}
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* Stat tiles */}
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

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 4 }}>
          <span>FULL ALERT COVERAGE</span><span>{pct}%</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? STATE_COLOR[f] ?? '#22d3ee' : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 3, color: filter === f ? '#000' : '#94a3b8',
            fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no investments match</div>
        ) : visible.map((inv, i) => (
          <div key={inv.id ?? i} style={{
            padding: '6px 8px', marginBottom: 4, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[inv.state]}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 8, color: STATE_COLOR[inv.state], minWidth: 100, letterSpacing: 0.5 }}>{inv.state}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {inv.title ?? inv.name ?? inv.ticker ?? inv.id ?? '—'}
            </span>
            {inv.ticker && <span style={{ fontSize: 8, color: '#64748b' }}>{inv.ticker}</span>}
            {inv.created_at && <span style={{ fontSize: 8, color: '#475569' }}>{String(inv.created_at).slice(0, 10)}</span>}
          </div>
        ))}
      </div>

      {/* Footer */}
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
