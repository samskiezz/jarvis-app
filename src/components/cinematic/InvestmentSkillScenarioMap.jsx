import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const TABS = ['ALL', 'FULLY_COVERED', 'SKILL_COVERED', 'SCENARIO_COVERED', 'UNPROTECTED'];
const CLASS_COLOR = {
  FULLY_COVERED: '#22c55e',
  SKILL_COVERED: '#00bfff',
  SCENARIO_COVERED: '#ffd700',
  UNPROTECTED: '#ff4444',
};
const PULSE_STYLE = `@keyframes isrmap-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function classifyRow(inv, skills, scenarios) {
  const invToks = tokens(
    `${inv.name || inv.title || ''} ${inv.type || ''} ${inv.sector || ''} ${inv.description || ''} ${inv.tags || ''}`
  );
  const hitSkill = skills.some(s =>
    overlaps(invToks, `${s.name || ''} ${s.description || ''} ${s.category || ''} ${s.tags || ''}`)
  );
  const hitScenario = scenarios.some(sc =>
    overlaps(invToks, `${sc.name || sc.title || ''} ${sc.description || ''} ${sc.type || ''} ${sc.tags || ''}`)
  );
  if (hitSkill && hitScenario) return 'FULLY_COVERED';
  if (hitSkill) return 'SKILL_COVERED';
  if (hitScenario) return 'SCENARIO_COVERED';
  return 'UNPROTECTED';
}

export function isIsrmapQuery(q) {
  return /\b(isrmap|investment skill scenario|financial readiness|investment coverage|unprotected investment|investment risk readiness)\b/i.test(q);
}

export function buildIsrmapScript() {
  return 'Opening Investment Skill Scenario Readiness Map. Correlating portfolio assets against AIP skills and scenario playbooks to identify unprotected investments.';
}

export default function InvestmentSkillScenarioMap() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [skillCount, setSkillCount] = useState(0);
  const [scenarioCount, setScenarioCount] = useState(0);
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
      const [invRes, skillRes, scenRes] = await Promise.all([
        fetch(`${API}/entities/Investment`),
        fetch(`${API}/v1/aip/skill`),
        fetch(`${API}/v1/scenario/list`),
      ]);
      const [invData, skillData, scenData] = await Promise.all([
        invRes.ok ? invRes.json() : [],
        skillRes.ok ? skillRes.json() : [],
        scenRes.ok ? scenRes.json() : [],
      ]);
      const investments = Array.isArray(invData) ? invData : (invData.items || invData.data || []);
      const skills = Array.isArray(skillData) ? skillData : (skillData.items || skillData.data || []);
      const scenarios = Array.isArray(scenData) ? scenData : (scenData.items || scenData.data || scenData.scenarios || []);
      setSkillCount(skills.length);
      setScenarioCount(scenarios.length);
      const classified = investments.map(inv => {
        const invToks = tokens(
          `${inv.name || inv.title || ''} ${inv.type || ''} ${inv.sector || ''} ${inv.description || ''} ${inv.tags || ''}`
        );
        return {
          ...inv,
          _class: classifyRow(inv, skills, scenarios),
          _matchedSkills: skills.filter(s =>
            overlaps(invToks, `${s.name || ''} ${s.description || ''} ${s.category || ''} ${s.tags || ''}`)
          ).slice(0, 5),
          _matchedScenarios: scenarios.filter(sc =>
            overlaps(invToks, `${sc.name || sc.title || ''} ${sc.description || ''} ${sc.type || ''} ${sc.tags || ''}`)
          ).slice(0, 5),
        };
      });
      setRows(classified);
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:isrmap-toggle', onToggle);
    return () => window.removeEventListener('jarvis:isrmap-toggle', onToggle);
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
          message: `ISRMAP financial readiness assessment for investment "${row.name || row.title || row.id}": coverage class ${row._class}. Matched ${row._matchedSkills?.length || 0} AIP skills and ${row._matchedScenarios?.length || 0} scenarios. Provide a 2-sentence investment risk readiness analysis.`,
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
    FULLY_COVERED: rows.filter(r => r._class === 'FULLY_COVERED').length,
    SKILL_COVERED: rows.filter(r => r._class === 'SKILL_COVERED').length,
    SCENARIO_COVERED: rows.filter(r => r._class === 'SCENARIO_COVERED').length,
    UNPROTECTED: rows.filter(r => r._class === 'UNPROTECTED').length,
  };
  const covPct = counts.ALL ? Math.round((counts.FULLY_COVERED / counts.ALL) * 100) : 0;

  const visible = rows.filter(r => {
    const matchTab = tab === 'ALL' || r._class === tab;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (r.name || r.title || '').toLowerCase().includes(q) ||
      (r.type || '').toLowerCase().includes(q) ||
      (r.sector || '').toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  return (
    <>
      <style>{PULSE_STYLE}</style>
      <button
        title="ISRMAP — Investment × AIP Skill × Scenario Financial Risk Readiness Map"
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed',
          left: 1118560,
          bottom: 8,
          zIndex: 713,
          background: 'rgba(255,215,0,0.13)',
          border: '1px solid rgba(255,215,0,0.45)',
          borderRadius: 6,
          color: '#ffd700',
          fontFamily: 'monospace',
          fontSize: 11,
          padding: '4px 9px',
          cursor: 'pointer',
          letterSpacing: 1,
          animation: 'isrmap-pulse 3s ease-in-out infinite',
        }}
      >
        ISRMAP
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 714,
          background: 'rgba(0,0,0,0.82)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'monospace',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid rgba(255,215,0,0.3)',
            background: 'rgba(0,10,30,0.95)',
          }}>
            <span style={{ color: '#ffd700', fontSize: 14, letterSpacing: 2 }}>
              ◈ ISRMAP — Investment × AIP Skill × Scenario Financial Risk Readiness Map
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 12, padding: '10px 20px', background: 'rgba(0,10,30,0.9)', borderBottom: '1px solid rgba(255,215,0,0.15)', flexWrap: 'wrap' }}>
            {[
              { label: 'INVESTMENTS', val: counts.ALL, color: '#ffd700' },
              { label: 'AIP SKILLS', val: skillCount, color: '#00bfff' },
              { label: 'SCENARIOS', val: scenarioCount, color: '#22c55e' },
              { label: 'FULLY COVERED', val: counts.FULLY_COVERED, color: '#22c55e' },
              { label: 'SKILL COVERED', val: counts.SKILL_COVERED, color: '#00bfff' },
              { label: 'SCENARIO COVERED', val: counts.SCENARIO_COVERED, color: '#ffd700' },
              { label: 'UNPROTECTED', val: counts.UNPROTECTED, color: '#ff4444' },
              { label: 'COV%', val: `${covPct}%`, color: covPct >= 70 ? '#22c55e' : covPct >= 40 ? '#ffd700' : '#ff4444' },
            ].map(t => (
              <div key={t.label} style={{ textAlign: 'center', minWidth: 80 }}>
                <div style={{ color: t.color, fontSize: 20, fontWeight: 700 }}>{t.val}</div>
                <div style={{ color: '#888', fontSize: 9, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
            {counts.UNPROTECTED > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                <span style={{ background: '#ff4444', color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700, animation: 'isrmap-pulse 1.5s ease-in-out infinite' }}>
                  {counts.UNPROTECTED} UNPROTECTED
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 20px', background: 'rgba(0,8,24,0.9)', borderBottom: '1px solid rgba(255,215,0,0.1)', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(255,215,0,0.2)' : 'transparent',
                border: `1px solid ${tab === t ? 'rgba(255,215,0,0.6)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 4, color: tab === t ? '#ffd700' : '#888',
                fontFamily: 'monospace', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
              }}>
                {t} {t !== 'ALL' ? `(${counts[t] || 0})` : `(${counts.ALL})`}
              </button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search investments…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,215,0,0.25)', borderRadius: 4, color: '#fff', fontFamily: 'monospace', fontSize: 11, padding: '3px 10px', width: 200 }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
            {loading && <div style={{ color: '#888', padding: 20 }}>Loading…</div>}
            {error && <div style={{ color: '#ff4444', padding: 20 }}>Error: {error}</div>}
            {!loading && visible.length === 0 && !error && (
              <div style={{ color: '#666', padding: 20 }}>No investments match.</div>
            )}
            {visible.map((row) => {
              const key = row.id || row.name || row.title;
              const isExp = expanded === key;
              return (
                <div key={key} style={{
                  marginBottom: 8, borderRadius: 6,
                  border: `1px solid ${CLASS_COLOR[row._class] || '#444'}33`,
                  background: 'rgba(255,255,255,0.03)',
                  animation: row._class === 'UNPROTECTED' ? 'isrmap-pulse 2s ease-in-out infinite' : 'none',
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : key)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer' }}
                  >
                    <span style={{ background: `${CLASS_COLOR[row._class]}22`, color: CLASS_COLOR[row._class], border: `1px solid ${CLASS_COLOR[row._class]}55`, borderRadius: 4, fontSize: 9, padding: '2px 7px', letterSpacing: 1, minWidth: 120, textAlign: 'center' }}>
                      {row._class}
                    </span>
                    <span style={{ color: '#e8e8e8', fontSize: 13, flex: 1 }}>{row.name || row.title || row.id}</span>
                    {row.type && <span style={{ color: '#888', fontSize: 10 }}>{row.type}</span>}
                    {row.sector && <span style={{ color: '#666', fontSize: 10 }}>{row.sector}</span>}
                    <span style={{ color: '#555', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: '0 12px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {row._matchedSkills?.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ color: '#00bfff', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>MATCHED AIP SKILLS ({row._matchedSkills.length})</div>
                          {row._matchedSkills.map((s, i) => {
                            const rel = Math.min(100, 40 + i * 12);
                            return (
                              <div key={s.id || s.name || i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                                <span style={{ color: '#ddd', fontSize: 11, flex: 1 }}>{s.name}</span>
                                {s.category && <span style={{ color: '#00bfff', background: 'rgba(0,191,255,0.1)', border: '1px solid rgba(0,191,255,0.3)', borderRadius: 3, fontSize: 9, padding: '1px 5px' }}>{s.category}</span>}
                                <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                  <div style={{ width: `${rel}%`, height: '100%', background: '#00bfff', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {row._matchedScenarios?.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ color: '#ffd700', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>MATCHED SCENARIOS ({row._matchedScenarios.length})</div>
                          {row._matchedScenarios.map((sc, i) => {
                            const rel = Math.min(100, 40 + i * 12);
                            return (
                              <div key={sc.id || sc.name || i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                                <span style={{ color: '#ddd', fontSize: 11, flex: 1 }}>{sc.name || sc.title}</span>
                                {sc.type && <span style={{ color: '#ffd700', background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: 3, fontSize: 9, padding: '1px 5px' }}>{sc.type}</span>}
                                <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                  <div style={{ width: `${rel}%`, height: '100%', background: '#ffd700', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div style={{ marginTop: 10 }}>
                        <button
                          onClick={() => assess(row)}
                          disabled={assessing === key}
                          style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.4)', borderRadius: 4, color: '#ffd700', fontFamily: 'monospace', fontSize: 11, padding: '4px 12px', cursor: 'pointer' }}
                        >
                          {assessing === key ? '…' : '▶ ASSESS FINANCIAL READINESS'}
                        </button>
                        {assessment[key] && (
                          <div style={{ marginTop: 8, color: '#ccc', fontSize: 12, lineHeight: 1.6, background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 4, padding: 10 }}>
                            {assessment[key]}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 20px', borderTop: '1px solid rgba(255,215,0,0.2)', background: 'rgba(0,8,24,0.95)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: '#555' }}>
            <span>ISRMAP · Investment × AIP Skill × Scenario · 90s refresh</span>
            <button onClick={fetchData} style={{ background: 'none', border: '1px solid rgba(255,215,0,0.25)', borderRadius: 3, color: '#888', fontFamily: 'monospace', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>↺ REFRESH</button>
          </div>
        </div>
      )}
    </>
  );
}
