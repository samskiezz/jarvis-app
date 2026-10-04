import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IRKTRI_RE = /\b(irktri|investigation\s+report\s+knowledge|invest\s+report\s+kb|dark\s+investigation|undocumented\s+investigation|investigation\s+knowledge\s+gap|case\s+report\s+knowledge|documented\s+investigation|investigation\s+dark\s+triple|case\s+knowledge\s+report)\b/i;
export function isIrktriQuery(t) { return IRKTRI_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw) ? raw
    : raw && Array.isArray(raw.investigations) ? raw.investigations
    : raw && Array.isArray(raw.data) ? raw.data
    : raw && Array.isArray(raw.items) ? raw.items
    : raw && Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((r, i) => ({
    id: r.id || r._id || String(i),
    title: r.title || r.name || r.subject || `Investigation ${i + 1}`,
    desc: [r.title, r.name, r.description, r.subject, r.kind, r.status].filter(Boolean).join(' '),
  }));
}

function normaliseReports(raw) {
  const arr = Array.isArray(raw) ? raw
    : raw && Array.isArray(raw.reports) ? raw.reports
    : raw && Array.isArray(raw.data) ? raw.data
    : raw && Array.isArray(raw.items) ? raw.items
    : raw && Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((r, i) => ({
    id: r.id || r._id || String(i),
    text: [r.title, r.subject, r.summary, r.kind, r.content].filter(Boolean).join(' '),
    label: r.title || r.subject || `Report ${i + 1}`,
  }));
}

function normaliseKb(raw) {
  const arr = Array.isArray(raw) ? raw
    : raw && Array.isArray(raw.articles) ? raw.articles
    : raw && Array.isArray(raw.data) ? raw.data
    : raw && Array.isArray(raw.items) ? raw.items
    : raw && Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((r, i) => ({
    id: r.id || r._id || String(i),
    text: [r.title, r.content, r.summary, r.category, r.tags].filter(Boolean).join(' '),
    label: r.title || `KB Article ${i + 1}`,
  }));
}

function matchScore(investToks, fields) {
  if (!investToks.length) return 0;
  const fToks = new Set(tok(fields));
  let hits = 0;
  for (const t of investToks) if (fToks.has(t)) hits++;
  return hits / investToks.length;
}

const THRESHOLD = 0.1;

function correlate(investigations, reports, kb) {
  return investigations.map(inv => {
    const toks = tok(inv.desc);
    let bestRep = null, repScore = 0;
    for (const rp of reports) {
      const s = matchScore(toks, rp.text);
      if (s > repScore) { repScore = s; bestRep = rp; }
    }
    let bestKb = null, kbScore = 0;
    for (const art of kb) {
      const s = matchScore(toks, art.text);
      if (s > kbScore) { kbScore = s; bestKb = art; }
    }
    const hasRep = repScore >= THRESHOLD;
    const hasKb = kbScore >= THRESHOLD;
    let state;
    if (hasRep && hasKb) state = 'FULLY DOCUMENTED';
    else if (hasRep) state = 'REPORTED';
    else if (hasKb) state = 'KB-BACKED';
    else state = 'DARK';
    return { ...inv, state, bestRep, repScore, bestKb, kbScore };
  });
}

export async function buildIrktriScript() {
  const key = (typeof localStorage !== 'undefined' && localStorage.getItem('jarvis_api_key')) || 'dev-key';
  const h = { Authorization: `Bearer ${key}` };
  const base = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
  const [invRes, repRes, kbRes] = await Promise.allSettled([
    fetch(`${base}/v1/investigations`, { headers: h }).then(r => r.json()),
    fetch(`${base}/v1/reports`, { headers: h }).then(r => r.json()),
    fetch(`${base}/knowledge/`, { headers: h }).then(r => r.json()),
  ]);
  const invs = normaliseInvestigations(invRes.status === 'fulfilled' ? invRes.value : []);
  const reps = normaliseReports(repRes.status === 'fulfilled' ? repRes.value : []);
  const kbs = normaliseKb(kbRes.status === 'fulfilled' ? kbRes.value : []);
  const rows = correlate(invs, reps, kbs);
  const fd = rows.filter(r => r.state === 'FULLY DOCUMENTED').length;
  const dark = rows.filter(r => r.state === 'DARK').length;
  return `IRKTRI: ${rows.length} investigations, ${reps.length} reports, ${kbs.length} KB articles. ${fd} FULLY DOCUMENTED, ${dark} DARK (no report or KB coverage). ${dark > 0 ? `${dark} investigation${dark > 1 ? 's' : ''} lack both report and knowledge backing — priority documentation gap.` : 'All investigations have report or KB coverage.'}`;
}

const TILE = { background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '6px 10px', textAlign: 'center', minWidth: 72 };
const LBL = { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 };
const VAL = { fontSize: 18, fontWeight: 700, color: '#e2e8f0' };
const STATE_COLOR = { 'FULLY DOCUMENTED': '#22d3ee', 'REPORTED': '#a78bfa', 'KB-BACKED': '#34d399', 'DARK': '#f59e0b' };
const STATE_ORDER = ['FULLY DOCUMENTED', 'REPORTED', 'KB-BACKED', 'DARK'];

export default function InvestigationReportKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const h = { Authorization: `Bearer ${key}` };
      const [invRes, repRes, kbRes] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`, { headers: h }).then(r => r.json()),
        fetch(`${API}/v1/reports`, { headers: h }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: h }).then(r => r.json()),
      ]);
      const invs = normaliseInvestigations(invRes.status === 'fulfilled' ? invRes.value : []);
      const reps = normaliseReports(repRes.status === 'fulfilled' ? repRes.value : []);
      const kbs = normaliseKb(kbRes.status === 'fulfilled' ? kbRes.value : []);
      setRows(correlate(invs, reps, kbs));
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:irktri-toggle', handler);
    return () => window.removeEventListener('jarvis:irktri-toggle', handler);
  }, []);

  useEffect(() => {
    if (open && rows.length === 0) load();
    if (open) {
      timerRef.current = setInterval(load, 90000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, load, rows.length]);

  const assess = useCallback(async () => {
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const dark = rows.filter(r => r.state === 'DARK');
    const fd = rows.filter(r => r.state === 'FULLY DOCUMENTED');
    const msg = `IRKTRI investigation documentation coverage: ${rows.length} investigations total. ${fd.length} FULLY DOCUMENTED (have both report and KB article). ${dark.length} DARK (no report or KB coverage). ${dark.length > 0 ? `Highest-priority undocumented investigations: ${dark.slice(0, 3).map(r => r.title).join(', ')}.` : 'All investigations have documentation coverage.'} Provide a 2-sentence brief on documentation gaps and priorities.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      const text = data.response || data.message || data.content || JSON.stringify(data);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: `IRKTRI assess error: ${e}` } }));
    }
  }, [rows]);

  const counts = STATE_ORDER.reduce((acc, s) => { acc[s] = rows.filter(r => r.state === s).length; return acc; }, {});
  const dark = counts['DARK'] || 0;
  const fd = counts['FULLY DOCUMENTED'] || 0;
  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q);
    }
    return true;
  });
  const coverBar = rows.length ? Math.round((fd / rows.length) * 100) : 0;

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); if (rows.length === 0) load(); }}
        style={{
          position: 'fixed', left: 771440, bottom: 8, zIndex: 406,
          background: 'rgba(30,41,59,0.92)', border: '1px solid rgba(100,116,139,0.4)',
          borderRadius: 6, color: '#94a3b8', fontSize: 10, fontWeight: 600,
          padding: '3px 8px', cursor: 'pointer', letterSpacing: 0.5,
        }}
      >
        ◈ IRKTRI{dark > 0 && <span style={{ color: '#f59e0b', marginLeft: 4 }}>{dark}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, zIndex: 9999,
      width: 680, maxHeight: 620,
      background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(100,116,139,0.35)',
      borderRadius: 12, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(12px)',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid rgba(100,116,139,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#22d3ee', letterSpacing: 1 }}>◈ IRKTRI</span>
        <span style={{ fontSize: 10, color: '#64748b', flex: 1 }}>Investigation × Report × Knowledge Triple Coverage</span>
        {loading && <span style={{ fontSize: 9, color: '#64748b' }}>⟳</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'TOTAL', val: rows.length, color: '#e2e8f0' },
          { label: 'FULLY DOC', val: fd, color: '#22d3ee' },
          { label: 'REPORTED', val: counts['REPORTED'] || 0, color: '#a78bfa' },
          { label: 'KB-BACKED', val: counts['KB-BACKED'] || 0, color: '#34d399' },
          { label: 'DARK', val: dark, color: '#f59e0b' },
        ].map(({ label, val, color }) => (
          <div key={label} style={TILE}>
            <div style={LBL}>{label}</div>
            <div style={{ ...VAL, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '2px 14px 8px' }}>
        <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>FULLY DOCUMENTED {coverBar}%</div>
        <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${coverBar}%`, background: '#22d3ee', borderRadius: 3, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px', flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            background: filter === s ? (STATE_COLOR[s] || 'rgba(100,116,139,0.5)') : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 4, color: filter === s ? '#0f172a' : '#94a3b8',
            fontSize: 9, fontWeight: 600, padding: '3px 8px', cursor: 'pointer', letterSpacing: 0.5,
          }}>{s} {s !== 'ALL' ? `(${counts[s] || 0})` : `(${rows.length})`}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 14px 6px' }}>
        <input
          placeholder="Search investigations…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(100,116,139,0.3)', borderRadius: 5, color: '#e2e8f0',
            fontSize: 10, padding: '4px 8px', outline: 'none',
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px' }}>
        {err && <div style={{ fontSize: 10, color: '#f87171', marginBottom: 6 }}>{err}</div>}
        {visible.length === 0 && !loading && (
          <div style={{ fontSize: 10, color: '#475569', textAlign: 'center', paddingTop: 24 }}>No investigations</div>
        )}
        {visible.map(r => {
          const isExp = expanded === r.id;
          return (
            <div key={r.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : r.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                  background: 'rgba(255,255,255,0.04)', borderRadius: 6, cursor: 'pointer',
                  borderLeft: `3px solid ${STATE_COLOR[r.state]}`,
                }}
              >
                <span style={{ fontSize: 10, flex: 1, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.title}
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, color: STATE_COLOR[r.state], minWidth: 90, textAlign: 'right' }}>
                  {r.state}
                </span>
                <span style={{ fontSize: 10, color: '#475569' }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ display: 'flex', gap: 8, padding: '6px 8px 2px 12px' }}>
                  {/* Report pane */}
                  <div style={{ flex: 1, background: 'rgba(167,139,250,0.07)', borderRadius: 5, padding: '5px 7px' }}>
                    <div style={{ fontSize: 9, color: '#a78bfa', marginBottom: 3, fontWeight: 600 }}>RP REPORT</div>
                    {r.bestRep ? (
                      <>
                        <div style={{ fontSize: 9, color: '#cbd5e1', marginBottom: 3 }}>{r.bestRep.label}</div>
                        <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)' }}>
                          <div style={{ height: '100%', width: `${Math.round(r.repScore * 100)}%`, background: '#a78bfa', borderRadius: 2 }} />
                        </div>
                        <div style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>{Math.round(r.repScore * 100)}% match</div>
                      </>
                    ) : <div style={{ fontSize: 9, color: '#475569' }}>No report found</div>}
                  </div>
                  {/* KB pane */}
                  <div style={{ flex: 1, background: 'rgba(52,211,153,0.07)', borderRadius: 5, padding: '5px 7px' }}>
                    <div style={{ fontSize: 9, color: '#34d399', marginBottom: 3, fontWeight: 600 }}>KB ARTICLE</div>
                    {r.bestKb ? (
                      <>
                        <div style={{ fontSize: 9, color: '#cbd5e1', marginBottom: 3 }}>{r.bestKb.label}</div>
                        <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)' }}>
                          <div style={{ height: '100%', width: `${Math.round(r.kbScore * 100)}%`, background: '#34d399', borderRadius: 2 }} />
                        </div>
                        <div style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>{Math.round(r.kbScore * 100)}% match</div>
                      </>
                    ) : <div style={{ fontSize: 9, color: '#475569' }}>No KB article found</div>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(100,116,139,0.15)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={load} style={{
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(100,116,139,0.3)',
          borderRadius: 5, color: '#94a3b8', fontSize: 9, padding: '3px 10px', cursor: 'pointer',
        }}>⟳ Refresh</button>
        <button onClick={assess} style={{
          background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)',
          borderRadius: 5, color: '#22d3ee', fontSize: 9, fontWeight: 700, padding: '3px 10px', cursor: 'pointer',
        }}>▶ ASSESS</button>
        {lastRefresh && <span style={{ fontSize: 8, color: '#475569', marginLeft: 'auto' }}>↻ {lastRefresh}</span>}
      </div>
    </div>
  );
}
