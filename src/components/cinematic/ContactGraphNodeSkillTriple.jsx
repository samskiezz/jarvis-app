import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CGNSKTR_RE = /\b(cgnsktr|contact\s+graph\s+node\s+skill|contact\s+node\s+skill|graph\s+skill\s+contact|skill\s+contact\s+node|contact\s+graph\s+skill|node\s+skill\s+contact)\b/i;

export function isCgnsktrQuery(t) { return CGNSKTR_RE.test(t || ''); }

export async function buildCgnsktrScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [ctR, gnR, skR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
  ]);
  const contacts = Array.isArray(ctR.value) ? ctR.value : (ctR.value?.contacts ?? ctR.value?.data ?? []);
  const nodes = Array.isArray(gnR.value) ? gnR.value : (gnR.value?.nodes ?? gnR.value?.data ?? []);
  const skills = Array.isArray(skR.value) ? skR.value : (skR.value?.skills ?? skR.value?.data ?? []);

  const gnText = nodes.map(n => `${n.label ?? n.id ?? ''} ${n.type ?? ''} ${n.category ?? ''}`.toLowerCase()).join(' ');
  const skText = skills.map(s => `${s.name ?? s.title ?? ''} ${s.description ?? ''} ${s.category ?? ''} ${s.domain ?? ''} ${(s.tags ?? []).join(' ')}`.toLowerCase()).join(' ');

  let fullyMapped = 0, nodeLinked = 0, skilled = 0, disconnected = 0;
  for (const c of contacts) {
    const label = `${c.name ?? c.title ?? c.id ?? ''} ${c.org ?? c.organisation ?? c.role ?? ''} ${c.description ?? ''} ${(c.tags ?? []).join(' ')}`.toLowerCase();
    const tokens = label.split(/\W+/).filter(Boolean);
    const score = text => tokens.reduce((s, tok) => s + (text.includes(tok) ? 1 : 0), 0);
    const gnHit = score(gnText) > 0;
    const skHit = score(skText) > 0;
    if (gnHit && skHit) fullyMapped++;
    else if (gnHit) nodeLinked++;
    else if (skHit) skilled++;
    else disconnected++;
  }
  return `CGNSKTR Contact × Graph Node × Skill: ${contacts.length} contacts assessed. ` +
    `FULLY MAPPED: ${fullyMapped} (node-linked + skill-backed). ` +
    `NODE-LINKED: ${nodeLinked} (graph node match, no skill). ` +
    `SKILLED: ${skilled} (skill match, no node). ` +
    `DISCONNECTED: ${disconnected} (neither — no node or skill coverage). ` +
    `${nodes.length} graph nodes. ${skills.length} skills.`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { 'FULLY MAPPED': '#22d3ee', 'NODE-LINKED': '#a78bfa', 'SKILLED': '#34d399', 'DISCONNECTED': '#f59e0b' };
const STATE_ORDER = ['FULLY MAPPED', 'NODE-LINKED', 'SKILLED', 'DISCONNECTED'];

function correlate(contact, nodes, skills) {
  const label = `${contact.name ?? contact.title ?? contact.id ?? ''} ${contact.org ?? contact.organisation ?? contact.role ?? ''} ${contact.description ?? ''} ${(contact.tags ?? []).join(' ')}`.toLowerCase();
  const tokens = label.split(/\W+/).filter(Boolean);
  const score = text => tokens.reduce((s, tok) => s + (text.toLowerCase().includes(tok) ? 1 : 0), 0);
  const gnText = nodes.map(n => `${n.label ?? n.id ?? ''} ${n.type ?? ''} ${n.category ?? ''}`).join(' ');
  const skText = skills.map(s => `${s.name ?? s.title ?? ''} ${s.description ?? ''} ${s.category ?? ''} ${s.domain ?? ''} ${(s.tags ?? []).join(' ')}`).join(' ');
  const gnHit = score(gnText) > 0;
  const skHit = score(skText) > 0;
  if (gnHit && skHit) return 'FULLY MAPPED';
  if (gnHit) return 'NODE-LINKED';
  if (skHit) return 'SKILLED';
  return 'DISCONNECTED';
}

export default function ContactGraphNodeSkillTriple() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [nodes, setNodes] = useState([]);
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
      const [ctR, gnR, skR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
      ]);
      const cts = Array.isArray(ctR.value) ? ctR.value : (ctR.value?.contacts ?? ctR.value?.data ?? []);
      const gns = Array.isArray(gnR.value) ? gnR.value : (gnR.value?.nodes ?? gnR.value?.data ?? []);
      const sks = Array.isArray(skR.value) ? skR.value : (skR.value?.skills ?? skR.value?.data ?? []);
      setContacts(cts);
      setNodes(gns);
      setSkills(sks);
      setRows(cts.map(c => ({ ...c, state: correlate(c, gns, sks) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:cgnsktr-toggle', toggle);
    return () => window.removeEventListener('jarvis:cgnsktr-toggle', toggle);
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
    const summary = `CGNSKTR: ${rows.length} contacts. FULLY MAPPED: ${rows.filter(r => r.state === 'FULLY MAPPED').length}. NODE-LINKED: ${rows.filter(r => r.state === 'NODE-LINKED').length}. SKILLED: ${rows.filter(r => r.state === 'SKILLED').length}. DISCONNECTED: ${rows.filter(r => r.state === 'DISCONNECTED').length}.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this CGNSKTR contact × graph node × skill coverage state and recommend next steps: ${summary}` }),
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
  const disconnectedCount = stateCounts['DISCONNECTED'] ?? 0;
  const total = rows.length;
  const mappedCount = stateCounts['FULLY MAPPED'] ?? 0;
  const pct = total > 0 ? Math.round((mappedCount / total) * 100) : 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9985, width: 680, maxHeight: 610,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(245,158,11,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="CGNSKTR Contact × Graph Node × Skill Triple Coverage" style={{
        position: 'fixed', left: 763040, bottom: 8, zIndex: 391,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ CGNSKTR
        {disconnectedCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {disconnectedCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ CGNSKTR</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Contact × Graph Node × Skill Triple Coverage</span>
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
          <span>FULLY MAPPED COVERAGE</span><span>{pct}%</span>
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
          placeholder="search contacts…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no contacts match</div>
        ) : visible.map((c, i) => (
          <div key={c.id ?? i} style={{
            padding: '6px 8px', marginBottom: 4, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[c.state]}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 8, color: STATE_COLOR[c.state], minWidth: 100, letterSpacing: 0.5 }}>{c.state}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name ?? c.title ?? c.id ?? '—'}
            </span>
            {c.org ?? c.organisation ? <span style={{ fontSize: 8, color: '#64748b' }}>{c.org ?? c.organisation}</span> : null}
            {c.role && <span style={{ fontSize: 8, color: '#475569' }}>{c.role}</span>}
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
