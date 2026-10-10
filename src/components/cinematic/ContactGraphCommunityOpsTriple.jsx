import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CGCOE_RE = /\b(cgcoe|contact\s+graph\s+community\s+ops|contact\s+community\s+ops|contact\s+ops\s+community|ops\s+contact\s+community|community\s+ops\s+contact|active\s+contact\s+community|contact\s+graph\s+ops|community\s+monitored\s+contact)\b/i;

export function isCgcoeQuery(t) { return CGCOE_RE.test(t || ''); }

export async function buildCgcoeScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [cR, gcR, oeR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
  ]);
  const contacts = Array.isArray(cR.value) ? cR.value : (cR.value?.contacts ?? cR.value?.data ?? []);
  const communities = Array.isArray(gcR.value) ? gcR.value : (gcR.value?.communities ?? gcR.value?.data ?? []);
  const events = Array.isArray(oeR.value) ? oeR.value : (oeR.value?.events ?? oeR.value?.data ?? []);

  const gcText = communities.map(c => `${c.label ?? c.name ?? ''} ${c.summary ?? ''} ${(c.members ?? []).join(' ')} ${(c.tags ?? []).join(' ')}`.toLowerCase()).join(' ');
  const oeText = events.map(e => `${e.name ?? e.title ?? ''} ${e.description ?? ''} ${e.type ?? ''} ${e.category ?? ''} ${e.severity ?? ''}`.toLowerCase()).join(' ');

  let fullyActive = 0, communityLinked = 0, opsMonitored = 0, quiet = 0;
  for (const c of contacts) {
    const label = `${c.name ?? ''} ${c.title ?? ''} ${c.email ?? ''} ${c.company ?? ''} ${c.description ?? ''} ${(c.tags ?? []).join(' ')}`.toLowerCase();
    const tokens = label.split(/\W+/).filter(t => t.length > 2);
    const score = text => tokens.reduce((s, tok) => s + (text.includes(tok) ? 1 : 0), 0);
    const gcHit = score(gcText) > 0;
    const oeHit = score(oeText) > 0;
    if (gcHit && oeHit) fullyActive++;
    else if (gcHit) communityLinked++;
    else if (oeHit) opsMonitored++;
    else quiet++;
  }
  return `CGCOE Contact × Graph Community × Ops Event: ${contacts.length} contacts assessed. ` +
    `FULLY ACTIVE: ${fullyActive} (community-backed + ops-triggered — contact has both network community alignment and live operational event). ` +
    `COMMUNITY-LINKED: ${communityLinked} (graph community match, no ops event). ` +
    `OPS-MONITORED: ${opsMonitored} (ops event match, no community context). ` +
    `QUIET: ${quiet} (neither — contact not operationally positioned). ` +
    `${communities.length} graph communities. ${events.length} ops events.`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { 'FULLY ACTIVE': '#22d3ee', 'COMMUNITY-LINKED': '#4ade80', 'OPS-MONITORED': '#a78bfa', 'QUIET': '#f59e0b' };
const STATE_ORDER = ['FULLY ACTIVE', 'COMMUNITY-LINKED', 'OPS-MONITORED', 'QUIET'];

function correlate(contact, communities, events) {
  const label = `${contact.name ?? ''} ${contact.title ?? ''} ${contact.email ?? ''} ${contact.company ?? ''} ${contact.description ?? ''} ${(contact.tags ?? []).join(' ')}`.toLowerCase();
  const tokens = label.split(/\W+/).filter(t => t.length > 2);
  const score = text => tokens.reduce((s, tok) => s + (text.toLowerCase().includes(tok) ? 1 : 0), 0);
  const gcText = communities.map(c => `${c.label ?? c.name ?? ''} ${c.summary ?? ''} ${(c.members ?? []).join(' ')} ${(c.tags ?? []).join(' ')}`).join(' ');
  const oeText = events.map(e => `${e.name ?? e.title ?? ''} ${e.description ?? ''} ${e.type ?? ''} ${e.category ?? ''} ${e.severity ?? ''}`).join(' ');
  const gcHit = score(gcText) > 0;
  const oeHit = score(oeText) > 0;
  if (gcHit && oeHit) return 'FULLY ACTIVE';
  if (gcHit) return 'COMMUNITY-LINKED';
  if (oeHit) return 'OPS-MONITORED';
  return 'QUIET';
}

export default function ContactGraphCommunityOpsTriple() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [communities, setCommunities] = useState([]);
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
      const [cR, gcR, oeR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
      ]);
      const cts = Array.isArray(cR.value) ? cR.value : (cR.value?.contacts ?? cR.value?.data ?? []);
      const gcs = Array.isArray(gcR.value) ? gcR.value : (gcR.value?.communities ?? gcR.value?.data ?? []);
      const oes = Array.isArray(oeR.value) ? oeR.value : (oeR.value?.events ?? oeR.value?.data ?? []);
      setContacts(cts);
      setCommunities(gcs);
      setEvents(oes);
      setRows(cts.map(c => ({ ...c, state: correlate(c, gcs, oes) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:cgcoe-toggle', toggle);
    return () => window.removeEventListener('jarvis:cgcoe-toggle', toggle);
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
    const counts = STATE_ORDER.reduce((acc, s) => ({ ...acc, [s]: rows.filter(r => r.state === s).length }), {});
    const summary = `CGCOE: ${rows.length} contacts. FULLY ACTIVE: ${counts['FULLY ACTIVE']}. COMMUNITY-LINKED: ${counts['COMMUNITY-LINKED']}. OPS-MONITORED: ${counts['OPS-MONITORED']}. QUIET: ${counts['QUIET']}.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this CGCOE contact × graph community × ops event coverage state and recommend next steps: ${summary}` }),
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
    (!search || (r.name ?? r.email ?? r.id ?? '').toLowerCase().includes(search.toLowerCase()))
  );
  const quietCount = stateCounts['QUIET'] ?? 0;
  const total = rows.length;
  const fullyActiveCount = stateCounts['FULLY ACTIVE'] ?? 0;
  const pct = total > 0 ? Math.round((fullyActiveCount / total) * 100) : 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9986, width: 680, maxHeight: 610,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(34,211,238,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="CGCOE Contact × Graph Community × Ops Event Triple Coverage" style={{
        position: 'fixed', left: 765280, bottom: 8, zIndex: 395,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ CGCOE
        {quietCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {quietCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ CGCOE</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Contact × Graph Community × Ops Event Triple Coverage</span>
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
          <span>FULLY ACTIVE COVERAGE</span><span>{pct}%</span>
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
            <span style={{ fontSize: 8, color: STATE_COLOR[c.state], minWidth: 130, letterSpacing: 0.5 }}>{c.state}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name ?? c.email ?? c.id ?? '—'}
            </span>
            {(c.title ?? c.role) && (
              <span style={{ fontSize: 8, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
                {c.title ?? c.role}
              </span>
            )}
            {(c.company ?? c.org) && (
              <span style={{ fontSize: 8, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
                {c.company ?? c.org}
              </span>
            )}
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
