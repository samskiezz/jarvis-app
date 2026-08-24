import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CGCDS_RE = /\b(cgcds|contact\s+community\s+dataset|contact\s+graph\s+dataset|contact\s+graph\s+community|community\s+dataset\s+contact|graph\s+community\s+contact|dark\s+contact\s+community|contact\s+graph\s+coverage|graph\s+dataset\s+contact)\b/i;

export function isCgcdsQuery(t) { return CGCDS_RE.test(t || ''); }

function normContacts(raw) {
  if (Array.isArray(raw)) return raw.slice(0, 80);
  return (raw.contacts ?? raw.data ?? raw.results ?? raw.items ?? []).slice(0, 80);
}

function normCommunities(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.communities) ? raw.communities
    : Array.isArray(raw?.clusters) ? raw.clusters
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.items) ? raw.items
    : [];
  return arr.slice(0, 80).map((c, i) => ({
    id: c.id || c.community_id || String(i),
    label: c.label || c.name || c.title || `Community ${i + 1}`,
    members: Array.isArray(c.members) ? c.members.join(' ') : (c.members || ''),
    summary: (c.summary || c.description || c.notes || '').toString().slice(0, 300),
  }));
}

function normDatasets(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.datasets) ? raw.datasets
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.results) ? raw.results
    : [];
  return arr.slice(0, 80).map((d, i) => ({
    id: d.id || String(i),
    label: d.name || d.title || d.label || `Dataset ${i + 1}`,
    kind: (d.type || d.kind || d.format || 'DATASET').toString().toUpperCase(),
    kw: [d.name, d.title, d.description, d.type, d.source, d.tags]
      .flat().filter(Boolean).join(' ').toLowerCase(),
  }));
}

function contactKw(c) {
  return [c.name, c.email, c.company, c.organisation, c.org, c.title, c.role, c.description, c.tags]
    .flat().filter(Boolean).join(' ').toLowerCase();
}

function communityKw(c) {
  return `${c.label} ${c.members} ${c.summary}`.toLowerCase();
}

function score(ckw, other) {
  const words = ckw.split(/\s+/).filter(w => w.length > 3);
  if (!words.length) return 0;
  let hits = 0;
  words.forEach(w => { if (other.includes(w)) hits++; });
  return hits / words.length;
}

function classify(contact, communities, datasets) {
  const ckw = contactKw(contact);
  const matchedComms = communities.filter(c =>
    score(ckw, communityKw(c)) > 0.07 || score(communityKw(c), ckw) > 0.07
  );
  const matchedDs = datasets.filter(d =>
    score(ckw, d.kw) > 0.07 || score(d.kw, ckw) > 0.07
  );
  const hasComm = matchedComms.length > 0;
  const hasDs = matchedDs.length > 0;
  const state = hasComm && hasDs ? 'FULLY MAPPED'
    : hasComm ? 'COMMUNITY-ONLY'
    : hasDs ? 'DATA-BACKED'
    : 'DARK';
  return {
    ...contact, state, matchedComms, matchedDs,
    commScore: matchedComms.length ? Math.max(...matchedComms.map(c => score(ckw, communityKw(c)))) : 0,
    dsScore: matchedDs.length ? Math.max(...matchedDs.map(d => score(ckw, d.kw))) : 0,
  };
}

export async function buildCgcdsScript() {
  try {
    const [cr, gr, dr] = await Promise.allSettled([
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
    ]);
    const contacts = normContacts(cr.status === 'fulfilled' ? cr.value : []);
    const communities = normCommunities(gr.status === 'fulfilled' ? gr.value : []);
    const datasets = normDatasets(dr.status === 'fulfilled' ? dr.value : []);
    const rows = contacts.map(c => classify(c, communities, datasets));
    const mapped = rows.filter(r => r.state === 'FULLY MAPPED').length;
    const commOnly = rows.filter(r => r.state === 'COMMUNITY-ONLY').length;
    const dataBacked = rows.filter(r => r.state === 'DATA-BACKED').length;
    const dark = rows.filter(r => r.state === 'DARK').length;
    const darkTop = rows.filter(r => r.state === 'DARK').slice(0, 2).map(r => r.name || r.email || 'unknown');
    return `CGCDS Coverage: ${contacts.length} contacts × ${communities.length} graph communities × ${datasets.length} datasets. ` +
      `FULLY MAPPED: ${mapped} contacts linked to both a graph community and a dataset. ` +
      `COMMUNITY-ONLY: ${commOnly}. DATA-BACKED: ${dataBacked}. DARK: ${dark} contacts with no community or dataset coverage. ` +
      (darkTop.length ? `Dark contacts: ${darkTop.join(', ')}.` : 'No dark contacts detected.');
  } catch {
    return 'CGCDS: Unable to fetch contact-community-dataset coverage data.';
  }
}

const STATE_COLOR = {
  'FULLY MAPPED': '#10b981',
  'COMMUNITY-ONLY': '#f59e0b',
  'DATA-BACKED': '#60a5fa',
  'DARK': '#6b7280',
};

const TABS = ['ALL', 'FULLY MAPPED', 'COMMUNITY-ONLY', 'DATA-BACKED', 'DARK'];

export default function ContactGraphCommunityDatasetTriple() {
  const [visible, setVisible] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cr, gr, dr] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
      ]);
      const c = normContacts(cr.status === 'fulfilled' ? cr.value : []);
      const g = normCommunities(gr.status === 'fulfilled' ? gr.value : []);
      const d = normDatasets(dr.status === 'fulfilled' ? dr.value : []);
      setContacts(c); setCommunities(g); setDatasets(d);
      setRows(c.map(x => classify(x, g, d)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setVisible(v => { if (!v) load(); return !v; });
    window.addEventListener('jarvis:cgcds-toggle', toggle);
    return () => window.removeEventListener('jarvis:cgcds-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!visible) return;
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [visible, load]);

  const filtered = rows.filter(r =>
    (tab === 'ALL' || r.state === tab) &&
    (!search || contactKw(r).includes(search.toLowerCase()))
  );

  const mapped = rows.filter(r => r.state === 'FULLY MAPPED').length;
  const commOnly = rows.filter(r => r.state === 'COMMUNITY-ONLY').length;
  const dataBacked = rows.filter(r => r.state === 'DATA-BACKED').length;
  const dark = rows.filter(r => r.state === 'DARK').length;

  const assess = useCallback(async () => {
    setAssessing(true); setBrief('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `CGCDS contact-community-dataset triple coverage: ${rows.length} contacts, ${mapped} fully mapped (graph community + dataset), ${commOnly} community-only, ${dataBacked} data-backed, ${dark} dark (no community or dataset — intelligence gap). Identify the highest-priority dark contacts and recommended action. Two sentences.` }),
      });
      const d = await res.json();
      const text = d.response ?? d.content ?? d.message ?? d.text ?? JSON.stringify(d);
      setBrief(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch { setBrief('Assessment unavailable.'); }
    setAssessing(false);
  }, [rows, mapped, commOnly, dataBacked, dark]);

  if (!visible) return null;

  const AMBER = '#f59e0b';
  const panelStyle = {
    position: 'fixed', left: 798880, bottom: 8, zIndex: 455, width: 560,
    background: 'rgba(0,0,0,0.92)', border: `1px solid rgba(245,158,11,0.35)`,
    borderRadius: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
    color: '#e2e8f0', backdropFilter: 'blur(12px)', userSelect: 'none',
  };

  const badgeStyle = { background: '#78716c', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 9, marginLeft: 6 };

  return (
    <div style={panelStyle}>
      <div style={{ padding: '6px 10px', borderBottom: `1px solid rgba(245,158,11,0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: AMBER, letterSpacing: 2, fontSize: 9 }}>◈ CGCDS</span>
        <span style={{ color: '#94a3b8', fontSize: 9 }}>CONTACT × GRAPH COMMUNITY × DATASET</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {dark > 0 && <span style={badgeStyle}>{dark} DARK</span>}
          <span style={{ cursor: 'pointer', color: '#64748b', fontSize: 11 }} onClick={() => setVisible(false)}>✕</span>
        </div>
      </div>

      <div style={{ padding: '5px 10px', borderBottom: `1px solid rgba(245,158,11,0.15)`, display: 'flex', gap: 10 }}>
        {[
          { label: 'CONTACTS', val: contacts.length, col: '#94a3b8' },
          { label: 'COMMS', val: communities.length, col: AMBER },
          { label: 'DATASETS', val: datasets.length, col: '#60a5fa' },
          { label: 'MAPPED', val: mapped, col: '#10b981' },
          { label: 'COMM-ONLY', val: commOnly, col: AMBER },
          { label: 'DATA-BKD', val: dataBacked, col: '#60a5fa' },
          { label: 'DARK', val: dark, col: '#6b7280' },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ color: col, fontWeight: 700, fontSize: 11 }}>{val}</div>
            <div style={{ color: '#475569', fontSize: 7.5, letterSpacing: 0.5 }}>{label}</div>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div style={{ padding: '4px 10px', borderBottom: `1px solid rgba(245,158,11,0.1)` }}>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex' }}>
            {mapped > 0 && <div style={{ width: `${(mapped / rows.length) * 100}%`, background: '#10b981' }} />}
            {commOnly > 0 && <div style={{ width: `${(commOnly / rows.length) * 100}%`, background: AMBER }} />}
            {dataBacked > 0 && <div style={{ width: `${(dataBacked / rows.length) * 100}%`, background: '#60a5fa' }} />}
          </div>
        </div>
      )}

      <div style={{ padding: '4px 10px', borderBottom: `1px solid rgba(245,158,11,0.1)`, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `rgba(245,158,11,0.2)` : 'transparent',
            border: `1px solid ${tab === t ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.08)'}`,
            color: tab === t ? AMBER : '#64748b', borderRadius: 3, padding: '2px 6px', fontSize: 8, cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="search contacts…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 3, padding: '2px 6px', fontSize: 8, width: 110 }}
        />
      </div>

      <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 6px' }}>
        {loading && <div style={{ color: '#475569', textAlign: 'center', padding: 12, fontSize: 9 }}>◌ LOADING…</div>}
        {!loading && filtered.length === 0 && <div style={{ color: '#475569', textAlign: 'center', padding: 12, fontSize: 9 }}>NO CONTACTS MATCH</div>}
        {filtered.map((row, i) => {
          const isExp = expanded === i;
          const col = STATE_COLOR[row.state] ?? '#64748b';
          return (
            <div key={i} style={{ marginBottom: 2 }}>
              <div onClick={() => setExpanded(isExp ? null : i)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 3, cursor: 'pointer', background: isExp ? `rgba(245,158,11,0.07)` : 'transparent' }}>
                <span style={{ color: col, fontSize: 8, fontWeight: 700, minWidth: 98 }}>{row.state}</span>
                <span style={{ color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name || row.email || 'unknown'}</span>
                <span style={{ color: '#475569', fontSize: 8 }}>{row.company || row.org || ''}</span>
                <span style={{ color: '#334155', fontSize: 9 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ display: 'flex', gap: 6, padding: '4px 6px 6px 6px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: AMBER, fontSize: 7.5, marginBottom: 3, letterSpacing: 1 }}>COMMUNITIES ({row.matchedComms.length})</div>
                    {row.matchedComms.length === 0
                      ? <div style={{ color: '#334155', fontSize: 8 }}>no community linkage</div>
                      : row.matchedComms.slice(0, 4).map((comm, j) => {
                          const sc = Math.min(1, score(contactKw(row), communityKw(comm)) * 5);
                          return (
                            <div key={j} style={{ marginBottom: 3 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
                                <span style={{ color: '#fcd34d', fontSize: 8, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comm.label}</span>
                                <span style={{ color: '#92400e', fontSize: 7 }}>{comm.size ? `${comm.size}m` : ''}</span>
                              </div>
                              <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden' }}>
                                <div style={{ width: `${sc * 100}%`, height: '100%', background: AMBER }} />
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#60a5fa', fontSize: 7.5, marginBottom: 3, letterSpacing: 1 }}>DATASETS ({row.matchedDs.length})</div>
                    {row.matchedDs.length === 0
                      ? <div style={{ color: '#334155', fontSize: 8 }}>no dataset found</div>
                      : row.matchedDs.slice(0, 4).map((ds, j) => {
                          const sc = Math.min(1, score(contactKw(row), ds.kw) * 5);
                          return (
                            <div key={j} style={{ marginBottom: 3 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
                                <span style={{ color: '#93c5fd', fontSize: 8, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ds.label}</span>
                                <span style={{ color: '#1d4ed8', fontSize: 7 }}>{ds.kind}</span>
                              </div>
                              <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden' }}>
                                <div style={{ width: `${sc * 100}%`, height: '100%', background: '#3b82f6' }} />
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '5px 10px', borderTop: `1px solid rgba(245,158,11,0.15)`, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? `rgba(245,158,11,0.1)` : `rgba(245,158,11,0.2)`,
          border: `1px solid rgba(245,158,11,0.4)`, color: AMBER,
          borderRadius: 3, padding: '3px 8px', fontSize: 8, cursor: assessing ? 'wait' : 'pointer', letterSpacing: 1,
        }}>{assessing ? '◌ ASSESSING…' : '⚑ ASSESS'}</button>
        {brief && <div style={{ flex: 1, color: '#94a3b8', fontSize: 8, lineHeight: 1.5 }}>{brief}</div>}
      </div>
    </div>
  );
}
