import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const TABS = ['ALL', 'FULLY_MAPPED', 'DUAL_LINKED', 'SINGLE_LINKED', 'UNMAPPED'];
const CLASS_COLOR = {
  FULLY_MAPPED: '#22c55e',
  DUAL_LINKED: '#00bfff',
  SINGLE_LINKED: '#ffd700',
  UNMAPPED: '#ff4444',
};
const PULSE_STYLE = `@keyframes gstarmex-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function classifyRow(sub, tasks, skills, reports) {
  const subToks = tokens(
    `${sub.name || sub.label || ''} ${sub.description || ''} ${sub.type || ''} ${sub.tags || ''}`
  );
  const hitTask = tasks.some(t =>
    overlaps(subToks, `${t.name || t.title || ''} ${t.description || ''} ${t.priority || ''} ${t.tags || ''}`)
  );
  const hitSkill = skills.some(s =>
    overlaps(subToks, `${s.name || ''} ${s.description || ''} ${s.category || ''} ${s.tags || ''}`)
  );
  const hitReport = reports.some(r =>
    overlaps(subToks, `${r.title || r.name || ''} ${r.description || ''} ${r.type || ''} ${r.tags || ''}`)
  );
  const count = [hitTask, hitSkill, hitReport].filter(Boolean).length;
  if (count === 3) return 'FULLY_MAPPED';
  if (count === 2) return 'DUAL_LINKED';
  if (count === 1) return 'SINGLE_LINKED';
  return 'UNMAPPED';
}

export default function GraphSubgraphTaskSkillReportNexus() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [taskCount, setTaskCount] = useState(0);
  const [skillCount, setSkillCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [assessment, setAssessment] = useState({});
  const intervalRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [subRes, taskRes, skillRes, rptRes] = await Promise.all([
        fetch(`${API}/v1/graph/subgraph`),
        fetch(`${API}/entities/Task`),
        fetch(`${API}/v1/aip/skill`),
        fetch(`${API}/v1/reports`),
      ]);
      const [subData, taskData, skillData, rptData] = await Promise.all([
        subRes.ok ? subRes.json() : [],
        taskRes.ok ? taskRes.json() : [],
        skillRes.ok ? skillRes.json() : [],
        rptRes.ok ? rptRes.json() : [],
      ]);
      const subgraphs = Array.isArray(subData) ? subData : (subData.items || subData.data || subData.subgraphs || []);
      const tasks = Array.isArray(taskData) ? taskData : (taskData.items || taskData.data || []);
      const skills = Array.isArray(skillData) ? skillData : (skillData.items || skillData.data || []);
      const reports = Array.isArray(rptData) ? rptData : (rptData.items || rptData.data || []);
      setTaskCount(tasks.length);
      setSkillCount(skills.length);
      setReportCount(reports.length);
      const classified = subgraphs.map(sub => ({
        ...sub,
        _class: classifyRow(sub, tasks, skills, reports),
        _matchedTasks: tasks.filter(t =>
          overlaps(tokens(`${sub.name || sub.label || ''} ${sub.description || ''} ${sub.tags || ''}`),
            `${t.name || t.title || ''} ${t.description || ''} ${t.priority || ''} ${t.tags || ''}`)
        ).slice(0, 5),
        _matchedSkills: skills.filter(s =>
          overlaps(tokens(`${sub.name || sub.label || ''} ${sub.description || ''} ${sub.tags || ''}`),
            `${s.name || ''} ${s.description || ''} ${s.category || ''} ${s.tags || ''}`)
        ).slice(0, 5),
        _matchedReports: reports.filter(r =>
          overlaps(tokens(`${sub.name || sub.label || ''} ${sub.description || ''} ${sub.tags || ''}`),
            `${r.title || r.name || ''} ${r.description || ''} ${r.type || ''} ${r.tags || ''}`)
        ).slice(0, 5),
      }));
      setRows(classified);
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gstarmex-toggle', onToggle);
    return () => window.removeEventListener('jarvis:gstarmex-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    fetchData();
    intervalRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async (row) => {
    setAssessing(row.id || row.name);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `GSTARMEX assessment for subgraph "${row.name || row.label || row.id}": coverage class ${row._class}. Provide a 2-sentence operational mapping analysis.`,
        }),
      });
      const d = await r.json();
      const text = d.response || d.answer || d.message || d.result || JSON.stringify(d);
      setAssessment(prev => ({ ...prev, [row.id || row.name]: text }));
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment(prev => ({ ...prev, [row.id || row.name]: `Error: ${e.message}` }));
    } finally {
      setAssessing(null);
    }
  }, []);

  const counts = {
    ALL: rows.length,
    FULLY_MAPPED: rows.filter(r => r._class === 'FULLY_MAPPED').length,
    DUAL_LINKED: rows.filter(r => r._class === 'DUAL_LINKED').length,
    SINGLE_LINKED: rows.filter(r => r._class === 'SINGLE_LINKED').length,
    UNMAPPED: rows.filter(r => r._class === 'UNMAPPED').length,
  };
  const covPct = counts.ALL ? Math.round((counts.FULLY_MAPPED / counts.ALL) * 100) : 0;

  const visible = rows.filter(r => {
    const matchTab = tab === 'ALL' || r._class === tab;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (r.name || r.label || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  return (
    <>
      <style>{PULSE_STYLE}</style>
      <button
        title="GSTARMEX — Graph Subgraph × Task × AIP Skill × Report Operational Mapping Nexus"
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed',
          left: 1117440,
          bottom: 8,
          zIndex: 711,
          background: 'rgba(0,191,255,0.13)',
          border: '1px solid rgba(0,191,255,0.45)',
          borderRadius: 6,
          color: '#00bfff',
          fontFamily: 'monospace',
          fontSize: 11,
          padding: '4px 9px',
          cursor: 'pointer',
          letterSpacing: 1,
          animation: 'gstarmex-pulse 3s ease-in-out infinite',
        }}
      >
        GSTARMEX
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 712,
          background: 'rgba(0,0,0,0.82)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'monospace',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid rgba(0,191,255,0.3)',
            background: 'rgba(0,10,30,0.95)',
          }}>
            <span style={{ color: '#00bfff', fontSize: 14, letterSpacing: 2 }}>
              ◈ GSTARMEX — Graph Subgraph × Task × AIP Skill × Report Operational Mapping Nexus
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: '1px solid #ff4444', color: '#ff4444',
              borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 12,
            }}>✕ CLOSE</button>
          </div>

          <div style={{
            display: 'flex', gap: 10, padding: '8px 20px',
            background: 'rgba(0,5,20,0.92)', flexWrap: 'wrap',
          }}>
            {[
              ['SUBGRAPHS', counts.ALL, '#00bfff'],
              ['TASKS', taskCount, '#22c55e'],
              ['SKILLS', skillCount, '#a78bfa'],
              ['REPORTS', reportCount, '#ffd700'],
              ['FULLY MAPPED', counts.FULLY_MAPPED, '#22c55e'],
              ['DUAL LINKED', counts.DUAL_LINKED, '#00bfff'],
              ['SINGLE', counts.SINGLE_LINKED, '#ffd700'],
              ['UNMAPPED', counts.UNMAPPED, '#ff4444'],
              ['COV%', covPct + '%', covPct >= 70 ? '#22c55e' : covPct >= 40 ? '#ffd700' : '#ff4444'],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: 'rgba(0,10,30,0.8)', border: `1px solid ${col}33`,
                borderRadius: 5, padding: '4px 12px', textAlign: 'center', minWidth: 70,
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#556', fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{
            padding: '4px 20px 6px', background: 'rgba(0,5,20,0.92)',
            borderBottom: '1px solid rgba(0,191,255,0.1)',
          }}>
            <div style={{ height: 6, background: '#0a1020', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${covPct}%`,
                background: covPct >= 70 ? '#22c55e' : covPct >= 40 ? '#ffd700' : '#ff4444',
                borderRadius: 3, transition: 'width 0.5s',
              }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '8px 20px', background: 'rgba(0,5,20,0.9)', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(0,191,255,0.22)' : 'rgba(0,191,255,0.06)',
                border: `1px solid ${tab === t ? '#00bfff' : 'rgba(0,191,255,0.25)'}`,
                color: tab === t ? '#00bfff' : '#668',
                borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
                fontSize: 11, letterSpacing: 1,
              }}>
                {t} <span style={{ opacity: 0.7 }}>({counts[t] || 0})</span>
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search subgraphs…"
              style={{
                marginLeft: 'auto', background: 'rgba(0,191,255,0.07)',
                border: '1px solid rgba(0,191,255,0.3)', borderRadius: 4,
                color: '#cce', padding: '3px 10px', fontSize: 11, width: 200,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px' }}>
            {loading && <div style={{ color: '#00bfff', textAlign: 'center', padding: 30 }}>Loading…</div>}
            {error && <div style={{ color: '#ff4444', padding: 10 }}>{error}</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: '#557', textAlign: 'center', padding: 40 }}>No subgraphs match</div>
            )}
            {visible.map(row => {
              const key = row.id || row.name || row.label;
              const isUnmapped = row._class === 'UNMAPPED';
              return (
                <div key={key} style={{
                  background: 'rgba(0,10,30,0.8)',
                  border: `1px solid ${CLASS_COLOR[row._class] || '#334'}40`,
                  borderLeft: `3px solid ${CLASS_COLOR[row._class] || '#334'}`,
                  borderRadius: 5,
                  marginBottom: 6,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  animation: isUnmapped ? 'gstarmex-pulse 2s ease-in-out infinite' : 'none',
                }} onClick={() => setExpanded(expanded === key ? null : key)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontSize: 10, padding: '1px 7px', borderRadius: 3,
                      background: `${CLASS_COLOR[row._class]}22`,
                      color: CLASS_COLOR[row._class] || '#aaa',
                      border: `1px solid ${CLASS_COLOR[row._class] || '#aaa'}44`,
                      letterSpacing: 1,
                    }}>{row._class}</span>
                    <span style={{ color: '#cce', fontSize: 12, flex: 1 }}>
                      {row.name || row.label || row.id || '—'}
                    </span>
                    {row.type && (
                      <span style={{ color: '#445', fontSize: 10, background: 'rgba(0,191,255,0.08)',
                        border: '1px solid rgba(0,191,255,0.2)', borderRadius: 3, padding: '1px 5px' }}>
                        {row.type}
                      </span>
                    )}
                    <span style={{ color: '#445', fontSize: 10 }}>▼</span>
                  </div>

                  {expanded === key && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(0,191,255,0.1)' }}>
                      {row.description && (
                        <div style={{ color: '#889', fontSize: 11, marginBottom: 6 }}>{row.description}</div>
                      )}

                      {row._matchedTasks && row._matchedTasks.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: '#22c55e', fontSize: 10, marginBottom: 3, letterSpacing: 1 }}>
                            MATCHED TASKS ({row._matchedTasks.length})
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row._matchedTasks.map((t, i) => (
                              <span key={i} style={{
                                background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                                borderRadius: 3, padding: '2px 7px', fontSize: 10, color: '#22c55e',
                              }}>
                                {t.name || t.title || t.id}
                                {t.priority && (
                                  <span style={{ marginLeft: 4, color: '#888', fontSize: 9 }}>{t.priority}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {row._matchedSkills && row._matchedSkills.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3, letterSpacing: 1 }}>
                            MATCHED SKILLS ({row._matchedSkills.length})
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row._matchedSkills.map((s, i) => (
                              <span key={i} style={{
                                background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)',
                                borderRadius: 3, padding: '2px 7px', fontSize: 10, color: '#a78bfa',
                              }}>
                                {s.name || s.id}
                                {s.category && (
                                  <span style={{ marginLeft: 4, color: '#888', fontSize: 9 }}>{s.category}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {row._matchedReports && row._matchedReports.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: '#ffd700', fontSize: 10, marginBottom: 3, letterSpacing: 1 }}>
                            MATCHED REPORTS ({row._matchedReports.length})
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row._matchedReports.map((r, i) => (
                              <span key={i} style={{
                                background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)',
                                borderRadius: 3, padding: '2px 7px', fontSize: 10, color: '#ffd700',
                              }}>
                                {r.title || r.name || r.id}
                                {r.type && (
                                  <span style={{ marginLeft: 4, color: '#888', fontSize: 9 }}>{r.type}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {assessment[key] && (
                        <div style={{
                          background: 'rgba(0,191,255,0.07)', border: '1px solid rgba(0,191,255,0.2)',
                          borderRadius: 4, padding: '6px 10px', color: '#adf', fontSize: 11, marginBottom: 8,
                        }}>{assessment[key]}</div>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); assess(row); }}
                        disabled={assessing === key}
                        style={{
                          background: 'rgba(0,191,255,0.15)', border: '1px solid #00bfff',
                          color: '#00bfff', borderRadius: 4, padding: '3px 12px',
                          cursor: assessing === key ? 'wait' : 'pointer', fontSize: 11,
                        }}
                      >
                        {assessing === key ? 'ASSESSING…' : '▶ ASSESS MAPPING'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{
            padding: '6px 20px',
            borderTop: '1px solid rgba(0,191,255,0.15)',
            background: 'rgba(0,5,20,0.95)',
            color: '#446',
            fontSize: 10,
            display: 'flex', gap: 20, flexWrap: 'wrap',
          }}>
            <span>SUBGRAPHS {counts.ALL}</span>
            <span style={{ color: CLASS_COLOR.FULLY_MAPPED }}>● FULL {counts.FULLY_MAPPED}</span>
            <span style={{ color: CLASS_COLOR.DUAL_LINKED }}>● DUAL {counts.DUAL_LINKED}</span>
            <span style={{ color: CLASS_COLOR.SINGLE_LINKED }}>● SINGLE {counts.SINGLE_LINKED}</span>
            <span style={{ color: CLASS_COLOR.UNMAPPED }}>● UNMAPPED {counts.UNMAPPED}</span>
            <span>COV {covPct}%</span>
            <span style={{ marginLeft: 'auto' }}>AUTO-REFRESH 90s · GSTARMEX</span>
          </div>
        </div>
      )}
    </>
  );
}

export function isGstarmexQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes('gstarmex') ||
    (s.includes('graph') && s.includes('subgraph') && s.includes('task')) ||
    (s.includes('subgraph') && s.includes('skill')) ||
    (s.includes('subgraph') && s.includes('report')) ||
    (s.includes('subgraph') && s.includes('operational')) ||
    s.includes('operational mapping nexus') ||
    (s.includes('graph') && s.includes('subgraph') && s.includes('skill')) ||
    (s.includes('subgraph') && s.includes('mapping')) ||
    (s.includes('graph') && s.includes('report') && s.includes('task'))
  );
}

export function buildGstarmexScript() {
  return 'GSTARMEX online. Graph Subgraph operational mapping nexus open — correlating subgraphs against tasks, AIP skills, and reports to surface unmapped coverage gaps.';
}
