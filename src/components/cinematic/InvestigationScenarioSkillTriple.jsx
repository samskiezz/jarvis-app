import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const ISSKTRI_RE = /\b(issktri|investigation\s+scenario\s+skill|invest\s+scenario|investigation\s+skill\s+gap|case\s+scenario\s+skill|investigate\s+skill|invest\s+skill|investigation\s+response\s+capability)\b/i;

export function isIssktriQuery(t) { return ISSKTRI_RE.test(t || ''); }

export async function buildIssktriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [invR, scR, skR] = await Promise.allSettled([
    fetch(`${API}/v1/investigations`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
  ]);
  const investigations = Array.isArray(invR.value) ? invR.value : (invR.value?.investigations ?? invR.value?.data ?? []);
  const scenarios = Array.isArray(scR.value) ? scR.value : (scR.value?.scenarios ?? scR.value?.data ?? []);
  const skills = Array.isArray(skR.value) ? skR.value : (skR.value?.skills ?? skR.value?.data ?? []);

  const scText = scenarios.map(s => `${s.name ?? s.title ?? ''} ${s.description ?? ''} ${s.type ?? ''} ${(s.tags ?? []).join(' ')}`.toLowerCase()).join(' ');
  const skText = skills.map(s => `${s.name ?? s.title ?? ''} ${s.description ?? ''} ${s.category ?? ''} ${s.domain ?? ''} ${(s.tags ?? []).join(' ')}`.toLowerCase()).join(' ');

  let fullySup = 0, playbookOnly = 0, skilledOnly = 0, unsupported = 0;
  for (const inv of investigations) {
    const label = `${inv.title ?? inv.name ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.subject ?? ''} ${inv.kind ?? inv.type ?? ''}`.toLowerCase();
    const tokens = label.split(/\W+/).filter(Boolean);
    const score = text => tokens.reduce((s, tok) => s + (text.includes(tok) ? 1 : 0), 0);
    const scHit = score(scText) > 0;
    const skHit = score(skText) > 0;
    if (scHit && skHit) fullySup++;
    else if (scHit) playbookOnly++;
    else if (skHit) skilledOnly++;
    else unsupported++;
  }
  return `ISSKTRI Investigation × Scenario × Skill: ${investigations.length} investigations assessed. ` +
    `FULLY SUPPORTED: ${fullySup} (scenario-backed + skill-available). ` +
    `PLAYBOOK-ONLY: ${playbookOnly} (scenario match, no skill coverage). ` +
    `SKILLED-ONLY: ${skilledOnly} (skill match, no scenario playbook). ` +
    `UNSUPPORTED: ${unsupported} (neither — investigation with no scenario or skill coverage — response gap). ` +
    `${scenarios.length} scenarios. ${skills.length} skills.`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { 'FULLY SUPPORTED': '#22d3ee', 'PLAYBOOK-ONLY': '#a78bfa', 'SKILLED-ONLY': '#34d399', 'UNSUPPORTED': '#f59e0b' };
const STATE_ORDER = ['FULLY SUPPORTED', 'PLAYBOOK-ONLY', 'SKILLED-ONLY', 'UNSUPPORTED'];

function correlate(inv, scenarios, skills) {
  const label = `${inv.title ?? inv.name ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.subject ?? ''} ${inv.kind ?? inv.type ?? ''}`.toLowerCase();
  const tokens = label.split(/\W+/).filter(Boolean);
  const score = text => tokens.reduce((s, tok) => s + (text.toLowerCase().includes(tok) ? 1 : 0), 0);
  const scText = scenarios.map(s => `${s.name ?? s.title ?? ''} ${s.description ?? ''} ${s.type ?? ''} ${(s.tags ?? []).join(' ')}`).join(' ');
  const skText = skills.map(s => `${s.name ?? s.title ?? ''} ${s.description ?? ''} ${s.category ?? ''} ${s.domain ?? ''} ${(s.tags ?? []).join(' ')}`).join(' ');
  const scHit = score(scText) > 0;
  const skHit = score(skText) > 0;
  if (scHit && skHit) return 'FULLY SUPPORTED';
  if (scHit) return 'PLAYBOOK-ONLY';
  if (skHit) return 'SKILLED-ONLY';
  return 'UNSUPPORTED';
}

export default function InvestigationScenarioSkillTriple() {
  const [open, setOpen] = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [skills, setSkills] = useState([]);
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
      const [invR, scR, skR] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
      ]);
      const invs = Array.isArray(invR.value) ? invR.value : (invR.value?.investigations ?? invR.value?.data ?? []);
      const scs = Array.isArray(scR.value) ? scR.value : (scR.value?.scenarios ?? scR.value?.data ?? []);
      const sks = Array.isArray(skR.value) ? skR.value : (skR.value?.skills ?? skR.value?.data ?? []);
      setInvestigations(invs);
      setScenarios(scs);
      setSkills(sks);
      setRows(invs.map(inv => ({ ...inv, state: correlate(inv, scs, sks) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:issktri-toggle', toggle);
    return () => window.removeEventListener('jarvis:issktri-toggle', toggle);
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
    const summary = `ISSKTRI: ${rows.length} investigations. FULLY SUPPORTED: ${rows.filter(r => r.state === 'FULLY SUPPORTED').length}. PLAYBOOK-ONLY: ${rows.filter(r => r.state === 'PLAYBOOK-ONLY').length}. SKILLED-ONLY: ${rows.filter(r => r.state === 'SKILLED-ONLY').length}. UNSUPPORTED: ${rows.filter(r => r.state === 'UNSUPPORTED').length}.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this ISSKTRI investigation × scenario × skill coverage state and recommend next steps: ${summary}` }),
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
  const unsupportedCount = stateCounts['UNSUPPORTED'] ?? 0;
  const total = rows.length;
  const fullySupCount = stateCounts['FULLY SUPPORTED'] ?? 0;
  const pct = total > 0 ? Math.round((fullySupCount / total) * 100) : 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9985, width: 680, maxHeight: 610,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(245,158,11,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="ISSKTRI Investigation × Scenario × Skill Triple Coverage" style={{
        position: 'fixed', left: 763600, bottom: 8, zIndex: 392,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ ISSKTRI
        {unsupportedCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {unsupportedCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ ISSKTRI</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Investigation × Scenario × Skill Triple Coverage</span>
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
          <span>FULLY SUPPORTED COVERAGE</span><span>{pct}%</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
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
          placeholder="search investigations…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no investigations match</div>
        ) : visible.map((inv, i) => (
          <div key={inv.id ?? i} style={{
            padding: '6px 8px', marginBottom: 4, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[inv.state]}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 8, color: STATE_COLOR[inv.state], minWidth: 120, letterSpacing: 0.5 }}>{inv.state}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {inv.title ?? inv.name ?? inv.id ?? '—'}
            </span>
            {inv.kind ?? inv.type ? <span style={{ fontSize: 8, color: '#64748b' }}>{inv.kind ?? inv.type}</span> : null}
            {inv.status && <span style={{ fontSize: 8, color: '#475569' }}>{inv.status}</span>}
          </div>
        ))}
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
        <button onClick={load} disabled={loading} style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>⟳ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: assessing ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4,
          color: '#f59e0b', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>{assessing ? '…ASSESSING' : '⬡ ASSESS'}</button>
      </div>
    </div>
  );
}
