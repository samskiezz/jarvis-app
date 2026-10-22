/**
 * SkillSwarmReportGraphExecutionNetwork — F125
 *
 * Fetches /v1/aip/skill + /entities/SwarmJob + /v1/reports + /v1/graph/centrality.
 *
 * Keyword-matches each skill against swarm jobs, reports, and graph nodes to classify:
 *
 *   DEPLOYED  — skill matches swarm job AND report AND graph node
 *               (fully operational: running, documented, and networked)
 *   PROCESSING — skill matches swarm job AND report but no graph trace
 *               (active but unnetworked — graph coverage gap)
 *   PUBLISHED  — skill matches report but no swarm job
 *               (documented but idle — no active automation)
 *   DORMANT    — no match to any source
 *               (isolated skill: no automation, no report, no graph trace)
 *
 * Toggle: ◈ SSGEX button (fixed, bottom strip) left:118360, zIndex:222
 * Stat tiles: skills / swarm-jobs / reports / graph-nodes / deployed / processing / published / dormant
 * Red pulse on DORMANT count (operational blind spots).
 * Expandable rows: matched swarm jobs with status badge +
 *                  matched reports with date badge +
 *                  matched graph nodes with centrality score badge.
 * Filter tabs: ALL / DEPLOYED / PROCESSING / PUBLISHED / DORMANT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ssgex"/"skill execution network"/"skill swarm report"/"skill graph network"
 *        "dormant skills"/"idle skills"/"skill deployment"/"skill automation network"
 *        "skill swarm graph"/"skill operational network"/"skill production network"
 *        "execution network"/"skill report graph"/"skill coverage network"
 * Event: jarvis:ssgex-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'DEPLOYED', 'PROCESSING', 'PUBLISHED', 'DORMANT'];

const CLS_COLOR = {
  DEPLOYED:   '#22C55E',
  PROCESSING: '#3B82F6',
  PUBLISHED:  '#F97316',
  DORMANT:    '#EF4444',
};

export function isSsgexQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'ssgex', 'skill execution network', 'skill swarm report', 'skill graph network',
    'dormant skills', 'idle skills', 'skill deployment', 'skill automation network',
    'skill swarm graph', 'skill operational network', 'skill production network',
    'execution network', 'skill report graph', 'skill coverage network',
    'skill swarm', 'skill graph', 'skill automation coverage',
  ].some(kw => s.includes(kw));
}

export function buildSsgexScript(q) {
  return `JARVIS skill–swarm–report–graph operational execution network triggered by: "${q}". Fetch /v1/aip/skill + /entities/SwarmJob + /v1/reports + /v1/graph/centrality. Classify each skill as DEPLOYED/PROCESSING/PUBLISHED/DORMANT. Report the dormant count and top 3 isolated skills with no automation, no report trail, and no graph trace.`;
}

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

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function skillLabel(s) {
  return s.name || s.title || s.skill_name || s.id || 'Unknown';
}

function skillTokens(s) {
  return tokens(
    `${s.name || ''} ${s.title || ''} ${s.skill_name || ''} ${s.description || ''} ${s.category || ''} ${s.type || ''} ${s.tags ? (Array.isArray(s.tags) ? s.tags.join(' ') : s.tags) : ''}`
  );
}

function classifySkill(skill, swarmJobs, reports, graphNodes) {
  const toks = skillTokens(skill);

  const mSwarm = swarmJobs.filter(j =>
    overlaps(toks, `${j.name || ''} ${j.title || ''} ${j.description || ''} ${j.type || ''} ${j.category || ''} ${j.tags ? (Array.isArray(j.tags) ? j.tags.join(' ') : j.tags) : ''}`)
  );
  const mReports = reports.filter(r =>
    overlaps(toks, `${r.title || ''} ${r.name || ''} ${r.summary || ''} ${r.description || ''} ${r.type || ''} ${r.category || ''} ${r.tags ? (Array.isArray(r.tags) ? r.tags.join(' ') : r.tags) : ''}`)
  );
  const mGraph = graphNodes.filter(n =>
    overlaps(toks, `${n.label || ''} ${n.name || ''} ${n.entity || ''} ${n.type || ''} ${n.category || ''} ${n.description || ''}`)
  );

  const hasSwarm  = mSwarm.length > 0;
  const hasReport = mReports.length > 0;
  const hasGraph  = mGraph.length > 0;

  let cls;
  if (hasSwarm && hasReport && hasGraph)  cls = 'DEPLOYED';
  else if (hasSwarm && hasReport)         cls = 'PROCESSING';
  else if (hasReport)                     cls = 'PUBLISHED';
  else                                    cls = 'DORMANT';

  return { skill, cls, mSwarm, mReports, mGraph };
}

export default function SkillSwarmReportGraphExecutionNetwork() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [rows,       setRows]       = useState([]);
  const [err,        setErr]        = useState(null);
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [skillRaw, swarmRaw, reportRaw, graphRaw] = await Promise.all([
        fetcher('/v1/aip/skill'),
        fetcher('/entities/SwarmJob'),
        fetcher('/v1/reports'),
        fetcher('/v1/graph/centrality'),
      ]);

      const skills    = normalizeArray(skillRaw,  ['skills', 'data', 'items', 'results']);
      const swarmJobs = normalizeArray(swarmRaw,  ['swarm_jobs', 'jobs', 'data', 'items', 'results']);
      const reports   = normalizeArray(reportRaw, ['reports', 'data', 'items', 'results']);
      const graphNodes = normalizeArray(
        graphRaw,
        ['nodes', 'entities', 'centrality', 'data', 'items', 'results']
      );

      setRows(skills.map(s => classifySkill(s, swarmJobs, reports, graphNodes)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:ssgex-toggle', handler);
    return () => window.removeEventListener('jarvis:ssgex-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    DEPLOYED:   rows.filter(r => r.cls === 'DEPLOYED').length,
    PROCESSING: rows.filter(r => r.cls === 'PROCESSING').length,
    PUBLISHED:  rows.filter(r => r.cls === 'PUBLISHED').length,
    DORMANT:    rows.filter(r => r.cls === 'DORMANT').length,
  };

  const swarmCount  = rows.reduce((n, r) => n + r.mSwarm.length,   0);
  const reportCount = rows.reduce((n, r) => n + r.mReports.length,  0);
  const graphCount  = rows.reduce((n, r) => n + r.mGraph.length,    0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return skillLabel(r.skill).toLowerCase().includes(s) ||
             (r.skill.category || r.skill.type || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Skills: ${rows.length}. Deployed: ${counts.DEPLOYED}. Processing: ${counts.PROCESSING}. Published: ${counts.PUBLISHED}. Dormant: ${counts.DORMANT}.`;
    const prompt = `JARVIS skill–swarm–report–graph operational execution network: ${summary}. Identify the most critical DORMANT skills — isolated capabilities with no swarm automation, no filed report, and no graph trace. Provide a 2-sentence advisory on the highest-risk dormant skills and priority actions to activate and integrate them into the operational execution network.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || JSON.stringify(d);
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch (_) {}
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 118360, zIndex: 222,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ SSGEX</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 222, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ SSGEX</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Skill × SwarmJob × Report × Graph — Operational Execution Network</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #EF444455', color: '#EF4444', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'SKILLS',     val: rows.length,       color: '#94a3b8' },
          { label: 'SWARM',      val: swarmCount,         color: '#22D3EE' },
          { label: 'REPORTS',    val: reportCount,        color: '#34D399' },
          { label: 'GRAPH',      val: graphCount,         color: '#a78bfa' },
          { label: 'DEPLOYED',   val: counts.DEPLOYED,   color: CLS_COLOR.DEPLOYED },
          { label: 'PROCESSING', val: counts.PROCESSING, color: CLS_COLOR.PROCESSING },
          { label: 'PUBLISHED',  val: counts.PUBLISHED,  color: CLS_COLOR.PUBLISHED },
          { label: 'DORMANT',    val: counts.DORMANT,    color: CLS_COLOR.DORMANT, pulse: counts.DORMANT > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 88, textAlign: 'center',
            animation: pulse ? 'ssgex-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid #EF444444', borderRadius: 5, fontSize: 11, color: '#fca5a5', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#EF444422' : 'none',
            border: `1px solid ${tab === t ? '#EF4444' : '#1e293b'}`,
            color: tab === t ? '#EF4444' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search skills…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 180 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLS_COLOR[r.cls], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {skillLabel(r.skill)}
                </span>
                {(r.skill.score != null) && (
                  <span style={{ background: '#030c18', border: '1px solid #1e3a5f', color: '#7dd3fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    score:{typeof r.skill.score === 'number' ? r.skill.score.toFixed(2) : r.skill.score}
                  </span>
                )}
                {r.skill.category && (
                  <span style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.skill.category}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mSwarm.length > 0 && (
                    <div>
                      <div style={{ color: '#22D3EE', fontSize: 10, marginBottom: 3 }}>SWARM JOBS ({r.mSwarm.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSwarm.slice(0, 8).map((j, k) => (
                          <span key={k} style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {j.name || j.title || j.id}
                            {(j.status || j.state) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{j.status || j.state}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mReports.length > 0 && (
                    <div>
                      <div style={{ color: '#34D399', fontSize: 10, marginBottom: 3 }}>REPORTS ({r.mReports.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mReports.slice(0, 8).map((rep, k) => (
                          <span key={k} style={{ background: '#021208', border: '1px solid #065f46', color: '#34D399', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {rep.title || rep.name || rep.id}
                            {(rep.date || rep.created_at || rep.timestamp) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(rep.date || rep.created_at || rep.timestamp || '').toString().slice(0, 10)}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mGraph.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({r.mGraph.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mGraph.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.entity || n.id}
                            {n.centrality != null && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [c:{typeof n.centrality === 'number' ? n.centrality.toFixed(3) : n.centrality}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSwarm.length === 0 && r.mReports.length === 0 && r.mGraph.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No swarm automation, no filed report, no graph trace — dormant skill with zero operational execution grounding.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes ssgex-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
