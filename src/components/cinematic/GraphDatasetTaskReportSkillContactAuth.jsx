/**
 * GraphDatasetTaskReportSkillContactAuth — F186
 *
 * Fetches /v1/graph/centrality + /v1/datasets + /entities/Task
 *         + /v1/reports + /v1/aip/skill + /entities/Contact
 *
 * Keyword-matches each graph node (label/type/description) against dataset
 * names, task titles, report titles, skill names, and contact names to classify:
 *
 *   COMMANDING — node matches all 5 secondary sources (full operational authority)
 *   ACTIVE     — node matches 3–4 of 5 secondary sources
 *   PARTIAL    — node matches 1–2 secondary sources
 *   DARK       — no match across any source (blind-spot nodes — zero authority)
 *
 * Toggle: ◈ GDTRSC button (fixed, bottom strip) left:152520, zIndex:283
 * Stat tiles: nodes / datasets / tasks / reports / skills / contacts /
 *             commanding / active / partial / dark
 * Red pulse on DARK count (blind-spot nodes — zero operational grounding).
 * Expandable rows: matched datasets with row-count badge +
 *                  matched tasks with status badge +
 *                  matched reports with date badge +
 *                  matched skills with score badge +
 *                  matched contacts with role/org.
 * Filter tabs: ALL / COMMANDING / ACTIVE / PARTIAL / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "gdtrsc"/"graph execution authority"/"graph dataset task report"
 *        "commanding nodes"/"dark graph nodes"/"operational authority"
 *        "graph operational"/"execution authority"/"graph authority"
 * Event: jarvis:gdtrsc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDING', 'ACTIVE', 'PARTIAL', 'DARK'];

const CLS_COLOR = {
  COMMANDING: '#22C55E',
  ACTIVE:     '#38BDF8',
  PARTIAL:    '#F97316',
  DARK:       '#EF4444',
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

export function isGdtrscQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'gdtrsc', 'graph execution authority', 'graph dataset task report',
    'commanding nodes', 'dark graph nodes', 'operational authority',
    'graph operational', 'execution authority', 'graph authority',
  ].some(kw => s.includes(kw));
}

export function buildGdtrscScript(stats) {
  return `GDTRSC: ${stats.nodes} graph nodes | ${stats.commanding} COMMANDING | ${stats.active} ACTIVE | ${stats.partial} PARTIAL | ${stats.dark} DARK (blind-spot nodes). Sources: ${stats.datasets} datasets, ${stats.tasks} tasks, ${stats.reports} reports, ${stats.skills} skills, ${stats.contacts} contacts. Identify the highest-priority dark nodes with zero operational grounding and recommend authority assignments.`;
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function classify(node, datasets, tasks, reports, skills, contacts) {
  const toks = tokens(`${node.label || ''} ${node.type || ''} ${node.description || ''} ${node.name || ''} ${node.id || ''}`);
  const mDatasets  = datasets.filter(d => overlaps(toks, `${d.name || ''} ${d.title || ''} ${d.description || ''}`));
  const mTasks     = tasks.filter(t => overlaps(toks, `${t.title || ''} ${t.name || ''} ${t.description || ''}`));
  const mReports   = reports.filter(r => overlaps(toks, `${r.title || ''} ${r.name || ''} ${r.description || ''}`));
  const mSkills    = skills.filter(sk => overlaps(toks, `${sk.name || ''} ${sk.title || ''} ${sk.description || ''} ${sk.category || ''}`));
  const mContacts  = contacts.filter(c => overlaps(toks, `${c.name || ''} ${c.role || ''} ${c.org || ''} ${c.organisation || ''}`));

  const matched = [
    mDatasets.length > 0,
    mTasks.length > 0,
    mReports.length > 0,
    mSkills.length > 0,
    mContacts.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (matched === 5)      cls = 'COMMANDING';
  else if (matched >= 3)  cls = 'ACTIVE';
  else if (matched >= 1)  cls = 'PARTIAL';
  else                    cls = 'DARK';

  return { node, cls, mDatasets, mTasks, mReports, mSkills, mContacts };
}

export default function GraphDatasetTaskReportSkillContactAuth() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [stats, setStats]       = useState({ nodes:0, datasets:0, tasks:0, reports:0, skills:0, contacts:0, commanding:0, active:0, partial:0, dark:0 });
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [grRaw, dsRaw, tkRaw, rpRaw, skRaw, ctRaw] = await Promise.all([
        fetcher('/v1/graph/centrality'),
        fetcher('/v1/datasets'),
        fetcher('/entities/Task'),
        fetcher('/v1/reports'),
        fetcher('/v1/aip/skill'),
        fetcher('/entities/Contact'),
      ]);
      const nodes    = normalizeArray(grRaw, ['nodes','centrality','items','data','results']);
      const datasets = normalizeArray(dsRaw, ['datasets','items','data','results']);
      const tasks    = normalizeArray(tkRaw, ['tasks','items','data','results']);
      const reports  = normalizeArray(rpRaw, ['reports','items','data','results']);
      const skills   = normalizeArray(skRaw, ['skills','items','data','results']);
      const contacts = normalizeArray(ctRaw, ['contacts','items','data','results']);

      const classified = nodes.map(n => classify(n, datasets, tasks, reports, skills, contacts));
      setRows(classified);
      setStats({
        nodes: nodes.length, datasets: datasets.length, tasks: tasks.length,
        reports: reports.length, skills: skills.length, contacts: contacts.length,
        commanding: classified.filter(r => r.cls === 'COMMANDING').length,
        active:     classified.filter(r => r.cls === 'ACTIVE').length,
        partial:    classified.filter(r => r.cls === 'PARTIAL').length,
        dark:       classified.filter(r => r.cls === 'DARK').length,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:gdtrsc-toggle', handler);
    return () => window.removeEventListener('jarvis:gdtrsc-toggle', handler);
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
      const summary = buildGdtrscScript(stats);
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Operational execution authority assessment: ${summary}` }),
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
      const n = r.node;
      return (n.label || '').toLowerCase().includes(s)
          || (n.type || '').toLowerCase().includes(s)
          || (n.id || '').toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 152520, zIndex: 283,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #334155',
          color: '#94a3b8', fontSize: 10, padding: '2px 6px',
          cursor: 'pointer', borderRadius: 3, letterSpacing: 1,
          fontFamily: 'monospace',
        }}
      >◈ GDTRSC</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 48, right: 20, zIndex: 9900,
      width: 860, maxHeight: '82vh',
      background: 'rgba(2,6,23,0.97)', border: '1px solid #1e3a5f',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(239,68,68,0.12)',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#ef4444', fontSize: 14 }}>◈</span>
        <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 13 }}>GDTRSC</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Graph × Dataset × Task × Report × Skill × Contact — Operational Execution Authority</span>
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
          ['NODES',      stats.nodes,      '#94a3b8'],
          ['DATASETS',   stats.datasets,   '#64748b'],
          ['TASKS',      stats.tasks,      '#64748b'],
          ['REPORTS',    stats.reports,    '#64748b'],
          ['SKILLS',     stats.skills,     '#64748b'],
          ['CONTACTS',   stats.contacts,   '#64748b'],
          ['COMMANDING', stats.commanding, CLS_COLOR.COMMANDING],
          ['ACTIVE',     stats.active,     CLS_COLOR.ACTIVE],
          ['PARTIAL',    stats.partial,    CLS_COLOR.PARTIAL],
          ['DARK',       stats.dark,       CLS_COLOR.DARK],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: '#0f172a', border: `1px solid ${color}33`,
            borderRadius: 4, padding: '4px 8px', textAlign: 'center', minWidth: 56,
          }}>
            <div style={{ color, fontSize: 15, fontWeight: 700, ...(label === 'DARK' && val > 0 ? {
              animation: 'gdtrsc-pulse 1.4s ease-in-out infinite',
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
          const n  = r.node;
          const id = n.id || n._id || n.label || i;
          const ex = expanded[id];
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
                <span style={{ color: CLS_COLOR[r.cls], fontSize: 10, minWidth: 88 }}>{r.cls}</span>
                <span style={{ flex: 1, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.label || n.name || n.id || '—'}
                </span>
                {n.type && (
                  <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {n.type}
                  </span>
                )}
                {typeof n.centrality === 'number' && (
                  <span style={{ background: '#0f172a', border: '1px solid #334155', color: '#64748b', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    c:{n.centrality.toFixed(3)}
                  </span>
                )}
                <span style={{ color: '#475569', fontSize: 10 }}>{ex ? '▲' : '▼'}</span>
              </div>
              {ex && (
                <div style={{ padding: '4px 24px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.mDatasets.length > 0 && (
                    <div>
                      <div style={{ color: '#38bdf8', fontSize: 10, marginBottom: 3 }}>DATASETS ({r.mDatasets.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mDatasets.slice(0, 8).map((d, j) => (
                          <span key={j} style={{ background: '#0c1a2e', border: '1px solid #0e4f6e', color: '#7dd3fc', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {d.name || d.title || d.id}
                            {(d.row_count || d.rows) != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> {d.row_count ?? d.rows}r</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mTasks.length > 0 && (
                    <div>
                      <div style={{ color: '#fbbf24', fontSize: 10, marginBottom: 3 }}>TASKS ({r.mTasks.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mTasks.slice(0, 8).map((t, j) => (
                          <span key={j} style={{ background: '#1c1500', border: '1px solid #78350f', color: '#fde68a', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {t.title || t.name || t.id}
                            {t.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> {t.status}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mReports.length > 0 && (
                    <div>
                      <div style={{ color: '#e2e8f0', fontSize: 10, marginBottom: 3 }}>REPORTS ({r.mReports.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mReports.slice(0, 8).map((rp, j) => (
                          <span key={j} style={{ background: '#0e0e0e', border: '1px solid #374151', color: '#d1d5db', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {rp.title || rp.name || rp.id}
                            {(rp.date || rp.created_at) && <span style={{ color: '#94a3b8', fontSize: 9 }}> {(rp.date || rp.created_at || '').slice(0, 10)}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSkills.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>SKILLS ({r.mSkills.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSkills.slice(0, 8).map((sk, j) => (
                          <span key={j} style={{ background: '#1a0e2e', border: '1px solid #4c1d95', color: '#c4b5fd', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {sk.name || sk.title || sk.id}
                            {sk.score != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> {sk.score}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#4ade80', fontSize: 10, marginBottom: 3 }}>CONTACTS ({r.mContacts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mContacts.slice(0, 8).map((c, j) => (
                          <span key={j} style={{ background: '#0a1e0e', border: '1px solid #14532d', color: '#86efac', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {c.name || c.id}
                            {(c.role || c.org || c.organisation) && <span style={{ color: '#94a3b8', fontSize: 9 }}> {[c.role, c.org || c.organisation].filter(Boolean).join(' · ')}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mDatasets.length === 0 && r.mTasks.length === 0 && r.mReports.length === 0 && r.mSkills.length === 0 && r.mContacts.length === 0 && (
                    <div style={{ color: '#ef4444', fontSize: 10 }}>No dataset, task, report, skill, or contact match — blind-spot node with zero operational authority.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes gdtrsc-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
