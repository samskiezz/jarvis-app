/**
 * InvestigationBrainSkillReportCoverage — F107
 *
 * Fetches /v1/investigations + /v1/cinematic/brain + /v1/aip/skill + /v1/reports.
 *
 * Keyword-matches each investigation (title/description/status) against
 * brain node labels, skill names/categories, and report titles/categories
 * to classify:
 *
 *   GROUNDED  — investigation matches brain node AND skill AND report
 *               (fully covered: modeled, capable, and documented)
 *   CAPABLE   — investigation matches skill + at least one other source
 *               (has capability backing but partially ungrounded)
 *   DOCUMENTED— investigation matches report or brain node but NO skill match
 *               (has documentation trail but missing capability coverage)
 *   BLIND     — no match to any source (undefended open cases — intelligence dead-ends)
 *
 * Toggle: ◈ IBSRCOV button (fixed, bottom strip) left:108280, zIndex:204
 * Stat tiles: investigations / brain nodes / skills / reports / grounded / capable / documented / blind
 * Red pulse on BLIND count (undefended open investigations with zero intelligence coverage).
 * Expandable rows: matched brain nodes with centrality score badge +
 *                  matched skills with score badge +
 *                  matched reports with date badge.
 * Filter tabs: ALL / GROUNDED / CAPABLE / DOCUMENTED / BLIND + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ibsrcov"/"investigation brain skill"/"active intelligence coverage"
 *        "blind investigations"/"investigation coverage"/"investigation skill report"
 *        "investigation brain"/"undefended investigations"/"open case coverage"
 *        "case intelligence"/"investigation intelligence gap"/"intelligence dead ends"
 * Event: jarvis:ibsrcov-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'GROUNDED', 'CAPABLE', 'DOCUMENTED', 'BLIND'];

const CLS_COLOR = {
  GROUNDED:    '#22C55E',
  CAPABLE:     '#38BDF8',
  DOCUMENTED:  '#F97316',
  BLIND:       '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

export function isIbsrcovQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'ibsrcov', 'investigation brain skill', 'active intelligence coverage',
    'blind investigations', 'investigation coverage', 'investigation skill report',
    'investigation brain', 'undefended investigations', 'open case coverage',
    'case intelligence', 'investigation intelligence gap', 'intelligence dead ends',
  ].some(kw => s.includes(kw));
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function classify(inv, brainNodes, skills, reports) {
  const toks = tokens(`${inv.title || ''} ${inv.description || ''} ${inv.status || ''}`);
  const mNodes   = brainNodes.filter(n => overlaps(toks, `${n.label || ''} ${n.type || ''}`));
  const mSkills  = skills.filter(s => overlaps(toks, `${s.name || ''} ${s.category || ''}`));
  const mReports = reports.filter(r => overlaps(toks, `${r.title || ''} ${r.category || ''} ${r.type || ''}`));

  let cls;
  if (mNodes.length && mSkills.length && mReports.length) cls = 'GROUNDED';
  else if (mSkills.length && (mNodes.length || mReports.length)) cls = 'CAPABLE';
  else if (mNodes.length || mReports.length) cls = 'DOCUMENTED';
  else cls = 'BLIND';

  return { inv, cls, mNodes, mSkills, mReports };
}

export default function InvestigationBrainSkillReportCoverage() {
  const [open, setOpen]     = useState(false);
  const [rows, setRows]     = useState([]);
  const [stats, setStats]   = useState({ invs:0, nodes:0, skills:0, reports:0, grounded:0, capable:0, documented:0, blind:0 });
  const [tab, setTab]       = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [invRaw, brainRaw, skillRaw, repRaw] = await Promise.all([
        fetcher('/v1/investigations'),
        fetcher('/v1/cinematic/brain'),
        fetcher('/v1/aip/skill'),
        fetcher('/v1/reports'),
      ]);
      const invs    = normalizeArray(invRaw, ['investigations','items','data','results']);
      const brainNodes = normalizeArray(brainRaw?.nodes || brainRaw, ['nodes','entities']);
      const skills  = normalizeArray(skillRaw, ['skills','items','data','results']);
      const reports = normalizeArray(repRaw, ['reports','items','data','results']);

      const classified = invs.map(inv => classify(inv, brainNodes, skills, reports));
      setRows(classified);
      setStats({
        invs: invs.length, nodes: brainNodes.length,
        skills: skills.length, reports: reports.length,
        grounded:   classified.filter(r => r.cls === 'GROUNDED').length,
        capable:    classified.filter(r => r.cls === 'CAPABLE').length,
        documented: classified.filter(r => r.cls === 'DOCUMENTED').length,
        blind:      classified.filter(r => r.cls === 'BLIND').length,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:ibsrcov-toggle', handler);
    return () => window.removeEventListener('jarvis:ibsrcov-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const summary = `IBSRCOV: ${stats.invs} investigations | ${stats.grounded} GROUNDED | ${stats.capable} CAPABLE | ${stats.documented} DOCUMENTED | ${stats.blind} BLIND (undefended open cases). Brain nodes: ${stats.nodes}, Skills: ${stats.skills}, Reports: ${stats.reports}.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Active intelligence coverage assessment: ${summary} Identify the highest-risk blind spot investigations and recommend immediate remediation actions.` }),
      });
      const d = await r.json();
      const text = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      /* silent */
    } finally {
      setAssessing(false);
    }
  }, [stats]);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const inv = r.inv;
      return (inv.title || '').toLowerCase().includes(s)
          || (inv.description || '').toLowerCase().includes(s)
          || (inv.status || '').toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 108280, zIndex: 204,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #334155',
          color: '#94a3b8', fontSize: 10, padding: '2px 6px',
          cursor: 'pointer', borderRadius: 3, letterSpacing: 1,
          fontFamily: 'monospace',
        }}
      >◈ IBSRCOV</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 48, right: 20, zIndex: 9900,
      width: 780, maxHeight: '82vh',
      background: 'rgba(2,6,23,0.97)', border: '1px solid #1e3a5f',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(239,68,68,0.15)',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#ef4444', fontSize: 14 }}>◈</span>
        <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 13 }}>IBSRCOV</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Investigation × Brain × Skill × Report — Active Intelligence Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={assess} disabled={assessing}
            style={{ background: '#1e40af', border: 'none', color: '#bfdbfe', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}
          >{assessing ? '…' : '▶ ASSESS'}</button>
          <button onClick={() => load()} style={{ background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>↻</button>
          <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap', borderBottom: '1px solid #1e3a5f' }}>
        {[
          ['INVS',   stats.invs,       '#94a3b8'],
          ['NODES',  stats.nodes,      '#64748b'],
          ['SKILLS', stats.skills,     '#64748b'],
          ['REPORTS',stats.reports,    '#64748b'],
          ['GROUNDED',stats.grounded,  CLS_COLOR.GROUNDED],
          ['CAPABLE', stats.capable,   CLS_COLOR.CAPABLE],
          ['DOCD',   stats.documented, CLS_COLOR.DOCUMENTED],
          ['BLIND',  stats.blind,      CLS_COLOR.BLIND],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: '#0f172a', border: `1px solid ${color}33`,
            borderRadius: 4, padding: '4px 8px', textAlign: 'center', minWidth: 56,
          }}>
            <div style={{ color, fontSize: 15, fontWeight: 700, ...(label === 'BLIND' && val > 0 ? {
              animation: 'ibsrcov-pulse 1.2s ease-in-out infinite',
            } : {}) }}>{val}</div>
            <div style={{ color: '#475569', fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #1e3a5f', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#1e3a5f' : '#0f172a',
            border: `1px solid ${tab === t ? '#3b82f6' : '#1e293b'}`,
            color: tab === t ? '#bfdbfe' : '#64748b',
            borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="filter…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#cbd5e1', borderRadius: 4, padding: '2px 8px', fontSize: 11, width: 140 }}
        />
      </div>

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
        {loading && <div style={{ color: '#475569', textAlign: 'center', padding: 16 }}>loading…</div>}
        {error   && <div style={{ color: '#ef4444', textAlign: 'center', padding: 8 }}>{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 16 }}>no results</div>
        )}
        {visible.map((r, i) => {
          const inv = r.inv;
          const id  = inv.id || inv._id || i;
          const ex  = expanded[id];
          return (
            <div key={id} style={{ borderBottom: '1px solid #0f172a' }}>
              <div
                onClick={() => setExpanded(v => ({ ...v, [id]: !v[id] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px',
                  cursor: 'pointer', background: ex ? '#0f172a' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ color: CLS_COLOR[r.cls], fontSize: 10, minWidth: 80 }}>{r.cls}</span>
                <span style={{ flex: 1, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inv.title || inv.name || inv.id || '—'}
                </span>
                {inv.status && (
                  <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{inv.status}</span>
                )}
                <span style={{ color: '#475569', fontSize: 10 }}>{ex ? '▲' : '▼'}</span>
              </div>
              {ex && (
                <div style={{ padding: '4px 24px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.mNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#38bdf8', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({r.mNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mNodes.slice(0, 8).map((n, j) => (
                          <span key={j} style={{ background: '#0c2231', border: '1px solid #0e4f6e', color: '#7dd3fc', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.id} {n.centrality != null && <span style={{ color: '#94a3b8', fontSize: 9 }}>c:{Number(n.centrality).toFixed(2)}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSkills.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>SKILLS ({r.mSkills.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSkills.slice(0, 8).map((s, j) => (
                          <span key={j} style={{ background: '#1a0e2e', border: '1px solid #4c1d95', color: '#c4b5fd', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {s.name || s.id} {s.score != null && <span style={{ color: '#94a3b8', fontSize: 9 }}>s:{Number(s.score).toFixed(1)}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mReports.length > 0 && (
                    <div>
                      <div style={{ color: '#fb923c', fontSize: 10, marginBottom: 3 }}>REPORTS ({r.mReports.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mReports.slice(0, 8).map((rep, j) => (
                          <span key={j} style={{ background: '#1c1007', border: '1px solid #7c2d12', color: '#fed7aa', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {rep.title || rep.id} {(rep.date || rep.created_at) && <span style={{ color: '#94a3b8', fontSize: 9 }}>{(rep.date || rep.created_at || '').slice(0,10)}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mNodes.length === 0 && r.mSkills.length === 0 && r.mReports.length === 0 && (
                    <div style={{ color: '#ef4444', fontSize: 10 }}>No brain node, skill, or report match — intelligence dead-end.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes ibsrcov-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
