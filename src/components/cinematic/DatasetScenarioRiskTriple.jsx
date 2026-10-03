import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const DSSRTRI_RE = /\b(dssrtri|dataset\s+scenario\s+risk|scenario\s+risk\s+dataset|dataset\s+triple\s+coverage|risk\s+scenario\s+dataset|dataset\s+scenario\s+signal|dataset\s+risk\s+scenario|dark\s+dataset|unmapped\s+dataset|dataset\s+coverage\s+triple)\b/i;

export function isDssrtriQuery(t) { return DSSRTRI_RE.test(t || ''); }

export async function buildDssrtriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [dsR, scR, rkR] = await Promise.allSettled([
    fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
  ]);
  const datasets = Array.isArray(dsR.value) ? dsR.value : (dsR.value?.datasets ?? dsR.value?.data ?? []);
  const scenarios = Array.isArray(scR.value) ? scR.value : (scR.value?.scenarios ?? scR.value?.data ?? []);
  const risks = Array.isArray(rkR.value) ? rkR.value : (rkR.value?.signals ?? rkR.value?.data ?? []);

  const scText = scenarios.map(s => `${s.title ?? s.name ?? s.id ?? ''} ${s.description ?? ''}`.toLowerCase()).join(' ');
  const rkText = risks.map(r => `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.type ?? ''}`.toLowerCase()).join(' ');

  let fullyMapped = 0, scenarioOnly = 0, riskFlagged = 0, dark = 0;
  for (const ds of datasets) {
    const label = `${ds.name ?? ds.title ?? ds.id ?? ''}`.toLowerCase();
    const tokens = label.split(/\W+/).filter(Boolean);
    const score = text => tokens.reduce((s, tok) => s + (text.includes(tok) ? 1 : 0), 0);
    const scHit = score(scText) > 0;
    const rkHit = score(rkText) > 0;
    if (scHit && rkHit) fullyMapped++;
    else if (scHit) scenarioOnly++;
    else if (rkHit) riskFlagged++;
    else dark++;
  }
  return `DSSRTRI Dataset × Scenario × RiskSignal: ${datasets.length} datasets assessed. ` +
    `FULLY MAPPED: ${fullyMapped} (scenario-backed + risk-flagged). ` +
    `SCENARIO-ONLY: ${scenarioOnly} (scenario match, no risk signal). ` +
    `RISK-FLAGGED: ${riskFlagged} (risk signal found, no scenario). ` +
    `DARK: ${dark} (neither scenario nor risk coverage). ` +
    `${scenarios.length} scenarios. ${risks.length} risk signals.`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { 'FULLY MAPPED': '#22d3ee', 'SCENARIO-ONLY': '#a78bfa', 'RISK-FLAGGED': '#f87171', 'DARK': '#f59e0b' };
const STATE_ORDER = ['FULLY MAPPED', 'SCENARIO-ONLY', 'RISK-FLAGGED', 'DARK'];

function correlate(dataset, scenarios, risks) {
  const label = `${dataset.name ?? dataset.title ?? dataset.id ?? ''}`.toLowerCase();
  const tokens = label.split(/\W+/).filter(Boolean);
  const score = text => tokens.reduce((s, tok) => s + (text.toLowerCase().includes(tok) ? 1 : 0), 0);
  const scText = scenarios.map(s => `${s.title ?? s.name ?? s.id ?? ''} ${s.description ?? ''}`).join(' ');
  const rkText = risks.map(r => `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.type ?? ''}`).join(' ');
  const scHit = score(scText) > 0;
  const rkHit = score(rkText) > 0;
  if (scHit && rkHit) return 'FULLY MAPPED';
  if (scHit) return 'SCENARIO-ONLY';
  if (rkHit) return 'RISK-FLAGGED';
  return 'DARK';
}

export default function DatasetScenarioRiskTriple() {
  const [open, setOpen] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [risks, setRisks] = useState([]);
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
      const [dsR, scR, rkR] = await Promise.allSettled([
        fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
      ]);
      const dss = Array.isArray(dsR.value) ? dsR.value : (dsR.value?.datasets ?? dsR.value?.data ?? []);
      const scs = Array.isArray(scR.value) ? scR.value : (scR.value?.scenarios ?? scR.value?.data ?? []);
      const rks = Array.isArray(rkR.value) ? rkR.value : (rkR.value?.signals ?? rkR.value?.data ?? []);
      setDatasets(dss);
      setScenarios(scs);
      setRisks(rks);
      setRows(dss.map(ds => ({ ...ds, state: correlate(ds, scs, rks) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:dssrtri-toggle', toggle);
    return () => window.removeEventListener('jarvis:dssrtri-toggle', toggle);
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
    const dark = rows.filter(r => r.state === 'DARK').length;
    const summary = `DSSRTRI: ${rows.length} datasets. FULLY MAPPED: ${rows.filter(r => r.state === 'FULLY MAPPED').length}. SCENARIO-ONLY: ${rows.filter(r => r.state === 'SCENARIO-ONLY').length}. RISK-FLAGGED: ${rows.filter(r => r.state === 'RISK-FLAGGED').length}. DARK: ${dark}.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this DSSRTRI dataset coverage state and recommend next steps: ${summary}` }),
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
    (!search || (r.name ?? r.title ?? r.id ?? '').toLowerCase().includes(search.toLowerCase()))
  );
  const darkCount = stateCounts['DARK'] ?? 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9983, width: 680, maxHeight: 610,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(34,211,238,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="DSSRTRI Dataset × Scenario × RiskSignal Coverage" style={{
        position: 'fixed', left: 759120, bottom: 8, zIndex: 384,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ DSSRTRI
        {darkCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {darkCount}
          </span>
        )}
      </button>
    );
  }

  const total = rows.length;
  const covered = stateCounts['FULLY MAPPED'] ?? 0;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ DSSRTRI</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Dataset × Scenario × RiskSignal Triple Coverage</span>
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
          <span>FULL MAPPING COVERAGE</span><span>{pct}%</span>
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
          placeholder="search datasets…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no datasets match</div>
        ) : visible.map((ds, i) => (
          <div key={ds.id ?? i} style={{
            padding: '6px 8px', marginBottom: 4, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[ds.state]}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 8, color: STATE_COLOR[ds.state], minWidth: 110, letterSpacing: 0.5 }}>{ds.state}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ds.name ?? ds.title ?? ds.id ?? '—'}
            </span>
            {ds.row_count != null && <span style={{ fontSize: 8, color: '#64748b' }}>{ds.row_count.toLocaleString()} rows</span>}
            {ds.updated_at && <span style={{ fontSize: 8, color: '#475569' }}>{String(ds.updated_at).slice(0, 10)}</span>}
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
