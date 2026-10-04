import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const COEDS_RE = /\b(coeds|contact\s+ops\s+dataset|contact\s+ops\s+data|contact\s+operations\s+dataset|contact\s+dataset\s+ops|contact\s+event\s+dataset|fully\s+tracked\s+contact|untracked\s+contact|contact\s+data\s+ops|ops\s+contact\s+dataset|contact\s+event\s+data|contact\s+operational\s+data)\b/i;

export function isCoedQuery(t) {
  return COEDS_RE.test(t || '');
}

export async function buildCoedScript() {
  try {
    const [ctRes, opsRes, dsRes] = await Promise.all([
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
    ]);
    const contacts = normaliseContacts(ctRes);
    const opsEvents = normaliseOpsEvents(opsRes);
    const datasets = normaliseDatasets(dsRes);
    const classified = contacts.map(c => classifyContact(c, opsEvents, datasets));
    const fully = classified.filter(c => c.state === 'FULLY_TRACKED').length;
    const opsFlagged = classified.filter(c => c.state === 'OPS_FLAGGED').length;
    const dataBacked = classified.filter(c => c.state === 'DATA_BACKED').length;
    const untracked = classified.filter(c => c.state === 'UNTRACKED').length;
    return `COEDS contact ops-dataset coverage: ${contacts.length} contacts — ${fully} fully tracked (ops+dataset), ${opsFlagged} ops-flagged only, ${dataBacked} data-backed only, ${untracked} untracked (neither). ${untracked > 0 ? `${untracked} contacts have no operational or dataset coverage — these represent intelligence gaps in the contact registry.` : 'All contacts have operational or dataset coverage.'}`;
  } catch {
    return 'COEDS data unavailable — check /entities/Contact, /v1/ops/events, and /v1/datasets endpoints.';
  }
}

const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fToks = tok(fieldText);
  const fSet = new Set(fToks);
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseContacts(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.contacts || raw?.items || raw?.data || raw?.results || []);
  return arr.map((c, i) => ({
    id: c.id || c._id || `ct-${i}`,
    name: c.name || c.full_name || c.contact_name || `Contact ${i + 1}`,
    role: c.role || c.title || c.job_title || '',
    company: c.company || c.organisation || c.organization || '',
    sector: c.sector || c.industry || c.domain || '',
    aliases: Array.isArray(c.aliases) ? c.aliases.join(' ') : (c.aliases || ''),
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseOpsEvents(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.events || raw?.ops_events || raw?.items || raw?.data || raw?.results || []);
  return arr.map((e, i) => ({
    id: e.id || e._id || `op-${i}`,
    title: e.title || e.name || e.event_name || `Event ${i + 1}`,
    description: e.description || e.summary || e.body || '',
    type: e.type || e.event_type || e.kind || '',
    severity: e.severity || e.level || '',
    tags: Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
  }));
}

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.datasets || raw?.items || raw?.data || raw?.results || []);
  return arr.map((d, i) => ({
    id: d.id || d._id || `ds-${i}`,
    name: d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    description: d.description || d.summary || '',
    kind: d.kind || d.type || d.category || '',
    rowCount: d.row_count || d.rows || d.count || null,
    tags: Array.isArray(d.tags) ? d.tags.join(' ') : (d.tags || ''),
  }));
}

function classifyContact(contact, opsEvents, datasets) {
  const cToks = tok([contact.name, contact.role, contact.company, contact.sector, contact.aliases, contact.tags].join(' '));

  const matchedOps = opsEvents.filter(e => {
    const score = matchScore(cToks, [e.title, e.description, e.type, e.tags].join(' '));
    return score >= THRESHOLD;
  });

  const matchedDatasets = datasets.filter(d => {
    const score = matchScore(cToks, [d.name, d.description, d.kind, d.tags].join(' '));
    return score >= THRESHOLD;
  });

  let state;
  if (matchedOps.length > 0 && matchedDatasets.length > 0) state = 'FULLY_TRACKED';
  else if (matchedOps.length > 0) state = 'OPS_FLAGGED';
  else if (matchedDatasets.length > 0) state = 'DATA_BACKED';
  else state = 'UNTRACKED';

  return { ...contact, state, matchedOps, matchedDatasets };
}

const STATE_META = {
  FULLY_TRACKED: { label: 'FULLY TRACKED', color: '#22d3ee', bg: 'rgba(34,211,238,0.08)' },
  OPS_FLAGGED:   { label: 'OPS FLAGGED',   color: '#f97316', bg: 'rgba(249,115,22,0.08)'  },
  DATA_BACKED:   { label: 'DATA BACKED',   color: '#60a5fa', bg: 'rgba(96,165,250,0.08)'  },
  UNTRACKED:     { label: 'UNTRACKED',     color: '#6b7280', bg: 'rgba(107,114,128,0.06)' },
};

const FILTERS = ['ALL', 'FULLY_TRACKED', 'OPS_FLAGGED', 'DATA_BACKED', 'UNTRACKED'];
const REFRESH_MS = 90_000;

export default function ContactOpsDatasetTriple() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [contacts, setContacts]   = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [ctRes, opsRes, dsRes] = await Promise.all([
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
      ]);
      const ct  = normaliseContacts(ctRes);
      const ops = normaliseOpsEvents(opsRes);
      const ds  = normaliseDatasets(dsRes);
      setContacts(ct);
      setOpsEvents(ops);
      setDatasets(ds);
      setClassified(ct.map(c => classifyContact(c, ops, ds)));
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:coeds-toggle', toggle);
    return () => window.removeEventListener('jarvis:coeds-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = classified.reduce((acc, c) => {
    acc[c.state] = (acc[c.state] || 0) + 1;
    return acc;
  }, { FULLY_TRACKED: 0, OPS_FLAGGED: 0, DATA_BACKED: 0, UNTRACKED: 0 });

  const total = classified.length || 1;

  const visible = classified.filter(c => {
    if (filter !== 'ALL' && c.state !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return [c.name, c.role, c.company, c.sector, c.tags].some(f => f.toLowerCase().includes(s));
    }
    return true;
  });

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const summary = `Contacts: ${contacts.length}, Ops Events: ${opsEvents.length}, Datasets: ${datasets.length}. Fully tracked: ${counts.FULLY_TRACKED}, ops-flagged: ${counts.OPS_FLAGGED}, data-backed: ${counts.DATA_BACKED}, untracked: ${counts.UNTRACKED}.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `JARVIS contact ops-dataset coverage assessment. ${summary} In 2 sentences: which contacts are missing operational and dataset coverage, and what is the intelligence risk?` }),
      });
      const j = await r.json();
      const txt = j.response || j.message || j.content || '';
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }, [contacts, opsEvents, datasets, counts]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="F385: Contact × Ops Event × Dataset Triple Coverage"
        style={{
          position: 'fixed', left: 842000, bottom: 8, zIndex: 532,
          background: counts.UNTRACKED > 0 ? 'rgba(107,114,128,0.15)' : 'rgba(34,211,238,0.12)',
          border: `1px solid ${counts.UNTRACKED > 0 ? '#6b7280' : '#22d3ee'}44`,
          color: counts.UNTRACKED > 0 ? '#6b7280' : '#22d3ee',
          borderRadius: 5, padding: '3px 8px', fontSize: 10,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        ◈ COEDS
        {counts.UNTRACKED > 0 && (
          <span style={{
            background: 'rgba(107,114,128,0.25)', color: '#9ca3af',
            borderRadius: 3, padding: '0 4px', fontSize: 9, fontWeight: 700,
          }}>{counts.UNTRACKED}</span>
        )}
        {counts.FULLY_TRACKED > 0 && (
          <span style={{
            background: 'rgba(34,211,238,0.2)', color: '#22d3ee',
            borderRadius: 3, padding: '0 4px', fontSize: 9, fontWeight: 700,
          }}>{counts.FULLY_TRACKED}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 16, top: 60, width: 480, zIndex: 532,
      background: 'rgba(8,14,26,0.97)', border: '1px solid rgba(34,211,238,0.18)',
      borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 80px)',
      fontFamily: 'monospace', fontSize: 11, color: '#cbd5e1',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid rgba(34,211,238,0.12)',
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>
          ◈ CONTACT × OPS × DATASET
        </span>
        <span style={{ color: '#475569', fontSize: 9, flex: 1 }}>
          {loading ? 'loading…' : `${classified.length} contacts · ${opsEvents.length} events · ${datasets.length} datasets`}
        </span>
        {counts.FULLY_TRACKED > 0 && (
          <span style={{
            background: 'rgba(34,211,238,0.15)', color: '#22d3ee',
            borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
          }}>{counts.FULLY_TRACKED} TRACKED</span>
        )}
        {counts.UNTRACKED > 0 && (
          <span style={{
            background: 'rgba(107,114,128,0.18)', color: '#9ca3af',
            borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
          }}>{counts.UNTRACKED} UNTRACKED</span>
        )}
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
        >×</button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '4px 12px', background: 'rgba(239,68,68,0.12)', color: '#f87171', fontSize: 11, flexShrink: 0 }}>
          ⚠ {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, padding: '8px 12px', flexShrink: 0 }}>
        {[
          { label: 'CONTACTS',    value: contacts.length,          color: '#22d3ee' },
          { label: 'OPS EVENTS',  value: opsEvents.length,         color: '#f97316' },
          { label: 'DATASETS',    value: datasets.length,          color: '#60a5fa' },
          { label: 'FULLY TRACK', value: counts.FULLY_TRACKED,     color: '#22d3ee' },
          { label: 'OPS FLAGGED', value: counts.OPS_FLAGGED,       color: '#f97316' },
          { label: 'DATA BACKED', value: counts.DATA_BACKED,       color: '#60a5fa' },
          { label: 'UNTRACKED',   value: counts.UNTRACKED,         color: '#6b7280' },
          { label: 'COVERAGE',    value: `${Math.round(((total - counts.UNTRACKED) / total) * 100)}%`, color: '#22d3ee' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(255,255,255,0.03)', borderRadius: 5,
            padding: '5px 6px', textAlign: 'center',
          }}>
            <div style={{ color: s.color, fontWeight: 700, fontSize: 14 }}>{s.value}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, background: '#1e293b', overflow: 'hidden', display: 'flex' }}>
          {(['FULLY_TRACKED', 'OPS_FLAGGED', 'DATA_BACKED', 'UNTRACKED']).map(state => (
            <div key={state} style={{
              width: `${(counts[state] / total) * 100}%`,
              background: STATE_META[state].color,
              transition: 'width 0.4s',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {Object.entries(STATE_META).map(([k, v]) => (
            <span key={k} style={{ color: v.color, fontSize: 9 }}>
              ■ {v.label} ({counts[k]})
            </span>
          ))}
        </div>
      </div>

      {/* Filters + Search */}
      <div style={{ padding: '0 12px 6px', display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${filter === f ? '#22d3ee' : 'rgba(255,255,255,0.08)'}`,
            color: filter === f ? '#22d3ee' : '#64748b',
            borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer',
          }}>
            {f === 'ALL' ? `ALL (${classified.length})` : `${STATE_META[f]?.label} (${counts[f]})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts…"
          style={{
            flex: 1, minWidth: 80, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4,
            color: '#cbd5e1', padding: '2px 8px', fontSize: 10,
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 20 }}>No contacts match</div>
        )}
        {visible.map(item => {
          const meta = STATE_META[item.state];
          const isExp = expanded === item.id;
          return (
            <div key={item.id} style={{
              border: `1px solid ${isExp ? meta.color : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 6, marginBottom: 4,
              background: isExp ? meta.bg : 'rgba(255,255,255,0.02)',
              cursor: 'pointer', transition: 'all 0.2s',
            }} onClick={() => setExpanded(isExp ? null : item.id)}>
              {/* Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px' }}>
                <span style={{
                  background: meta.bg, color: meta.color,
                  borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}>{meta.label}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </span>
                {item.role && (
                  <span style={{ color: '#64748b', fontSize: 9, whiteSpace: 'nowrap' }}>[{item.role}]</span>
                )}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded */}
              {isExp && (
                <div style={{ padding: '0 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {/* Ops Events */}
                  <div>
                    <div style={{ color: '#f97316', fontSize: 9, fontWeight: 700, marginBottom: 3 }}>
                      OPS EVENTS ({item.matchedOps.length})
                    </div>
                    {item.matchedOps.length === 0
                      ? <div style={{ color: '#334155', fontSize: 10 }}>No ops event matches</div>
                      : item.matchedOps.slice(0, 5).map((e, idx) => (
                        <div key={e.id || idx} style={{ marginBottom: 3 }}>
                          <div style={{ color: '#cbd5e1', fontSize: 10 }}>
                            {e.title}
                            {e.severity && <span style={{ color: '#f97316', fontSize: 9, marginLeft: 4 }}>[{e.severity}]</span>}
                            {e.type && <span style={{ color: '#94a3b8', fontSize: 9, marginLeft: 4 }}>{e.type}</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: '#1e293b', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, matchScore(tok([item.name, item.role, item.company, item.sector, item.aliases, item.tags].join(' ')), [e.title, e.description, e.tags].join(' ')) * 100 / THRESHOLD)}%`,
                              background: '#f97316', height: '100%',
                            }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Datasets */}
                  <div>
                    <div style={{ color: '#60a5fa', fontSize: 9, fontWeight: 700, marginBottom: 3 }}>
                      DATASETS ({item.matchedDatasets.length})
                    </div>
                    {item.matchedDatasets.length === 0
                      ? <div style={{ color: '#334155', fontSize: 10 }}>No dataset matches</div>
                      : item.matchedDatasets.slice(0, 5).map(d => (
                        <div key={d.id} style={{ marginBottom: 3 }}>
                          <div style={{ color: '#cbd5e1', fontSize: 10 }}>
                            {d.name}
                            {d.kind && <span style={{ color: '#60a5fa', fontSize: 9, marginLeft: 4 }}>[{d.kind}]</span>}
                            {d.rowCount != null && <span style={{ color: '#475569', fontSize: 9, marginLeft: 4 }}>{d.rowCount.toLocaleString()} rows</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: '#1e293b', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, matchScore(tok([item.name, item.role, item.company, item.sector, item.aliases, item.tags].join(' ')), [d.name, d.description, d.kind, d.tags].join(' ')) * 100 / THRESHOLD)}%`,
                              background: '#60a5fa', height: '100%',
                            }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Company / sector info */}
                  {(item.company || item.sector) && (
                    <div style={{ gridColumn: '1 / -1', color: '#475569', fontSize: 9, marginTop: 2 }}>
                      {item.company && <span style={{ marginRight: 8 }}>🏢 {item.company}</span>}
                      {item.sector && <span>◈ {item.sector}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment footer */}
      <div style={{
        borderTop: '1px solid rgba(34,211,238,0.12)',
        padding: '6px 12px', flexShrink: 0,
        background: 'rgba(34,211,238,0.04)',
      }}>
        {assessment && (
          <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4, lineHeight: 1.5 }}>
            {assessment}
          </div>
        )}
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? 'rgba(34,211,238,0.06)' : 'rgba(34,211,238,0.12)',
          border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee',
          borderRadius: 5, padding: '4px 12px', fontSize: 10,
          cursor: assessing ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
        }}>
          {assessing ? 'ASSESSING…' : '◈ ASSESS CONTACT COVERAGE'}
        </button>
      </div>
    </div>
  );
}
