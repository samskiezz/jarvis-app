import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CSDTRI_RE = /\b(csdtri|contact\s+scenario\s+dataset|scenario\s+contact\s+data|contact\s+equipped|contact\s+data\s+scenario|contact\s+playbook\s+data|personnel\s+scenario\s+dataset)\b/i;

export function isCsdtriQuery(t) { return CSDTRI_RE.test(t || ''); }

export async function buildCsdtriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [ctR, scR, dsR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
  ]);
  const contacts = Array.isArray(ctR.value) ? ctR.value : (ctR.value?.contacts ?? ctR.value?.data ?? []);
  const scenarios = Array.isArray(scR.value) ? scR.value : (scR.value?.scenarios ?? scR.value?.data ?? []);
  const datasets = Array.isArray(dsR.value) ? dsR.value : (dsR.value?.datasets ?? dsR.value?.data ?? []);

  const scText = scenarios.map(s => `${s.name ?? s.title ?? ''} ${s.description ?? ''} ${s.type ?? ''} ${(s.tags ?? []).join(' ')}`.toLowerCase()).join(' ');
  const dsText = datasets.map(d => `${d.name ?? d.title ?? ''} ${d.description ?? ''} ${d.kind ?? d.type ?? ''} ${(d.tags ?? []).join(' ')}`.toLowerCase()).join(' ');

  let fullyEquipped = 0, playbookOnly = 0, dataBacked = 0, uncovered = 0;
  for (const ct of contacts) {
    const label = `${ct.name ?? ct.first_name ?? ct.full_name ?? ''} ${ct.company ?? ct.org ?? ct.organization ?? ''} ${ct.title ?? ct.role ?? ''} ${ct.description ?? ''} ${(ct.tags ?? []).join(' ')}`.toLowerCase();
    const tokens = label.split(/\W+/).filter(t => t.length > 2);
    const score = text => tokens.reduce((s, tok) => s + (text.includes(tok) ? 1 : 0), 0);
    const scHit = score(scText) > 0;
    const dsHit = score(dsText) > 0;
    if (scHit && dsHit) fullyEquipped++;
    else if (scHit) playbookOnly++;
    else if (dsHit) dataBacked++;
    else uncovered++;
  }
  return `CSDTRI Contact × Scenario × Dataset: ${contacts.length} contacts assessed. ` +
    `FULLY EQUIPPED: ${fullyEquipped} (scenario playbook + dataset backing). ` +
    `PLAYBOOK-ONLY: ${playbookOnly} (scenario match, no dataset). ` +
    `DATA-BACKED: ${dataBacked} (dataset found, no scenario coverage). ` +
    `UNCOVERED: ${uncovered} (neither — contact with no scenario or dataset coverage — intelligence gap). ` +
    `${scenarios.length} scenarios. ${datasets.length} datasets.`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { 'FULLY EQUIPPED': '#84cc16', 'PLAYBOOK-ONLY': '#a78bfa', 'DATA-BACKED': '#22d3ee', 'UNCOVERED': '#f59e0b' };
const STATE_ORDER = ['FULLY EQUIPPED', 'PLAYBOOK-ONLY', 'DATA-BACKED', 'UNCOVERED'];

function correlate(ct, scenarios, datasets) {
  const label = `${ct.name ?? ct.first_name ?? ct.full_name ?? ''} ${ct.company ?? ct.org ?? ct.organization ?? ''} ${ct.title ?? ct.role ?? ''} ${ct.description ?? ''} ${(ct.tags ?? []).join(' ')}`.toLowerCase();
  const tokens = label.split(/\W+/).filter(t => t.length > 2);
  const score = text => tokens.reduce((s, tok) => s + (text.toLowerCase().includes(tok) ? 1 : 0), 0);
  const scText = scenarios.map(s => `${s.name ?? s.title ?? ''} ${s.description ?? ''} ${s.type ?? ''} ${(s.tags ?? []).join(' ')}`).join(' ');
  const dsText = datasets.map(d => `${d.name ?? d.title ?? ''} ${d.description ?? ''} ${d.kind ?? d.type ?? ''} ${(d.tags ?? []).join(' ')}`).join(' ');
  const scHit = score(scText) > 0;
  const dsHit = score(dsText) > 0;
  if (scHit && dsHit) return 'FULLY EQUIPPED';
  if (scHit) return 'PLAYBOOK-ONLY';
  if (dsHit) return 'DATA-BACKED';
  return 'UNCOVERED';
}

export default function ContactScenarioDatasetTriple() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [datasets, setDatasets] = useState([]);
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
      const [ctR, scR, dsR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
      ]);
      const cts = Array.isArray(ctR.value) ? ctR.value : (ctR.value?.contacts ?? ctR.value?.data ?? []);
      const scs = Array.isArray(scR.value) ? scR.value : (scR.value?.scenarios ?? scR.value?.data ?? []);
      const dss = Array.isArray(dsR.value) ? dsR.value : (dsR.value?.datasets ?? dsR.value?.data ?? []);
      setContacts(cts);
      setScenarios(scs);
      setDatasets(dss);
      setRows(cts.map(ct => ({ ...ct, state: correlate(ct, scs, dss) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:csdtri-toggle', toggle);
    return () => window.removeEventListener('jarvis:csdtri-toggle', toggle);
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
    const summary = `CSDTRI: ${rows.length} contacts. FULLY EQUIPPED: ${rows.filter(r => r.state === 'FULLY EQUIPPED').length}. PLAYBOOK-ONLY: ${rows.filter(r => r.state === 'PLAYBOOK-ONLY').length}. DATA-BACKED: ${rows.filter(r => r.state === 'DATA-BACKED').length}. UNCOVERED: ${rows.filter(r => r.state === 'UNCOVERED').length}.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this CSDTRI contact × scenario × dataset coverage state and recommend next steps: ${summary}` }),
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
    (!search || (r.name ?? r.first_name ?? r.full_name ?? r.id ?? '').toLowerCase().includes(search.toLowerCase()))
  );
  const uncoveredCount = stateCounts['UNCOVERED'] ?? 0;
  const total = rows.length;
  const fullyEquippedCount = stateCounts['FULLY EQUIPPED'] ?? 0;
  const pct = total > 0 ? Math.round((fullyEquippedCount / total) * 100) : 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9985, width: 680, maxHeight: 610,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(132,204,22,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="CSDTRI Contact × Scenario × Dataset Triple Coverage" style={{
        position: 'fixed', left: 764160, bottom: 8, zIndex: 393,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ CSDTRI
        {uncoveredCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {uncoveredCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#84cc16', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ CSDTRI</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Contact × Scenario × Dataset Triple Coverage</span>
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
          <span>FULLY EQUIPPED COVERAGE</span><span>{pct}%</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#84cc16', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? STATE_COLOR[f] ?? '#f59e0b' : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 3, color: filter === f ? '#000' : '#94a3b8',
            fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no contacts match</div>
        ) : visible.map((ct, i) => (
          <div key={ct.id ?? i} style={{
            padding: '6px 8px', marginBottom: 4, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[ct.state]}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 8, color: STATE_COLOR[ct.state], minWidth: 130, letterSpacing: 0.5 }}>{ct.state}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ct.name ?? ct.first_name ?? ct.full_name ?? ct.id ?? '—'}
            </span>
            {(ct.company ?? ct.org ?? ct.organization) && (
              <span style={{ fontSize: 8, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                {ct.company ?? ct.org ?? ct.organization}
              </span>
            )}
            {(ct.title ?? ct.role) && <span style={{ fontSize: 8, color: '#475569' }}>{ct.title ?? ct.role}</span>}
          </div>
        ))}
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
        <button onClick={load} disabled={loading} style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>⟳ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: assessing ? 'rgba(132,204,22,0.08)' : 'rgba(132,204,22,0.12)',
          border: '1px solid rgba(132,204,22,0.3)', borderRadius: 4,
          color: '#84cc16', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>{assessing ? '…ASSESSING' : '⬡ ASSESS'}</button>
      </div>
    </div>
  );
}
