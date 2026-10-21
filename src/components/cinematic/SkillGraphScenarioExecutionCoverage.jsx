/**
 * SkillGraphScenarioExecutionCoverage — F86
 *
 * Fetches /v1/aip/skill + /v1/graph/centrality + /v1/scenario/list.
 * Keyword-matches each skill against graph centrality nodes AND runnable scenarios to classify:
 *   DEPLOYED  — skill has both a matched graph node AND a matched scenario (fully operational)
 *   NETWORKED — skill matched graph nodes only (connected but no runnable scenario)
 *   SCRIPTED  — skill matched scenarios only (scenario exists but no graph trace)
 *   ISOLATED  — no graph or scenario match (blind-spot skills)
 *
 * Toggle: ◈ SGSCEX button (fixed, bottom strip) left:96520, zIndex:183
 * Stat tiles: skills / nodes / scenarios / deployed / networked / scripted / isolated
 * Amber pulse on ISOLATED count.
 * Expandable rows: matched graph nodes with centrality score badge + matched scenarios with status badge.
 * Filter tabs: ALL / DEPLOYED / NETWORKED / SCRIPTED / ISOLATED + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "sgscex"/"skill graph scenario"/"execution coverage"/"isolated skills"/"skill execution"
 *        "skill network scenario"/"skill coverage"/"deployment gap"/"skill deployment"
 *        "skill blind spots"/"skill strategic coverage"
 * Event: jarvis:sgscex-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'DEPLOYED', 'NETWORKED', 'SCRIPTED', 'ISOLATED'];

const CLS_COLOR = {
  DEPLOYED:  '#22C55E',
  NETWORKED: '#38BDF8',
  SCRIPTED:  '#A78BFA',
  ISOLATED:  '#F59E0B',
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
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

export function isSgscexQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'sgscex', 'skill graph scenario', 'execution coverage', 'isolated skills',
    'skill execution', 'skill network scenario', 'skill coverage', 'deployment gap',
    'skill deployment', 'skill blind spots', 'skill strategic coverage',
  ].some(k => s.includes(k));
}

export function buildSgscexScript() {
  return `Fetch /v1/aip/skill, /v1/graph/centrality, and /v1/scenario/list. ` +
    `Keyword-match each skill name/description against graph node labels AND scenario titles/descriptions. ` +
    `Classify each skill as DEPLOYED/NETWORKED/SCRIPTED/ISOLATED. ` +
    `Report total ISOLATED count (skills with no graph presence and no runnable scenario — strategic blind spots), ` +
    `identify which ISOLATED skills are most critical given their type, ` +
    `and recommend graph node association or scenario creation to close the execution gap.`;
}

export default function SkillGraphScenarioExecutionCoverage() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const [counts, setCounts]         = useState({
    skills:0, nodes:0, scenarios:0, deployed:0, networked:0, scripted:0, isolated:0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [skRaw, grRaw, scRaw] = await Promise.all([
        fetch(`${API}/v1/aip/skill`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/graph/centrality`,   { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/scenario/list`,      { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const skills    = normalizeArray(skRaw, ['items','skills','results','data']);
      const nodes     = normalizeArray(grRaw, ['items','nodes','results','data','entities']);
      const scenarios = normalizeArray(scRaw, ['items','scenarios','results','data']);

      const built = skills.map(sk => {
        const skText = [
          sk.name, sk.title, sk.description, sk.type, sk.category, sk.tags,
        ].filter(Boolean).join(' ');
        const skToks = tokens(skText);

        const matchedNodes = nodes.filter(nd => {
          const ndStr = [nd.label, nd.name, nd.id, nd.type, nd.description].filter(Boolean).join(' ');
          return overlaps(skToks, ndStr);
        });
        const matchedScenarios = scenarios.filter(sc => {
          const scStr = [sc.title, sc.name, sc.description, sc.type, sc.tags, sc.category].filter(Boolean).join(' ');
          return overlaps(skToks, scStr);
        });

        const hasNodes     = matchedNodes.length > 0;
        const hasScenarios = matchedScenarios.length > 0;
        const cls = hasNodes && hasScenarios ? 'DEPLOYED'
                  : hasNodes                 ? 'NETWORKED'
                  : hasScenarios             ? 'SCRIPTED'
                  :                            'ISOLATED';
        return {
          id:             sk.id || sk.skill_id || String(Math.random()),
          name:           sk.name || sk.title || sk.id || '(skill)',
          score:          sk.score ?? sk.rating ?? sk.confidence ?? null,
          cls,
          matchedNodes,
          matchedScenarios,
        };
      });

      const c = {
        skills: built.length, nodes: nodes.length, scenarios: scenarios.length,
        deployed:0, networked:0, scripted:0, isolated:0,
      };
      built.forEach(r => { c[r.cls.toLowerCase()]++; });
      setRows(built);
      setCounts(c);
    } catch (e) {
      setError(e.message || 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:sgscex-toggle', handler);
    return () => window.removeEventListener('jarvis:sgscex-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: buildSgscexScript() }),
      });
      const d = await res.json();
      const text = d?.response || d?.message || d?.content || 'No assessment returned.';
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      return r.name.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:'fixed', bottom:8, left:96520, zIndex:183,
          background:'rgba(0,10,30,0.85)', border:'1px solid #F59E0B',
          color:'#F59E0B', fontSize:9, padding:'3px 7px', borderRadius:3,
          cursor:'pointer', letterSpacing:1, fontFamily:'monospace',
          whiteSpace:'nowrap',
        }}
        title="Skill × Graph × Scenario Strategic Execution Coverage"
      >
        ◈ SGSCEX
        {counts.isolated > 0 && (
          <span style={{ marginLeft:4, color:'#F59E0B', animation:'pulse-amber 1.5s infinite' }}>
            {counts.isolated}▲
          </span>
        )}
        <style>{`@keyframes pulse-amber{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9900,
      background:'rgba(0,0,10,0.92)', display:'flex', flexDirection:'column',
      fontFamily:'monospace', color:'#E2E8F0',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px',
                    borderBottom:'1px solid #1e3a5f', background:'rgba(0,5,20,0.95)' }}>
        <span style={{ color:'#F59E0B', fontWeight:700, letterSpacing:2, fontSize:12 }}>◈ SGSCEX</span>
        <span style={{ color:'#94A3B8', fontSize:10 }}>SKILL × GRAPH × SCENARIO  STRATEGIC EXECUTION COVERAGE</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={fetchData} style={{ background:'transparent', border:'1px solid #334155',
            color:'#94A3B8', padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9 }}>
            ↺ REFRESH
          </button>
          <button onClick={() => setOpen(false)} style={{ background:'transparent', border:'1px solid #475569',
            color:'#94A3B8', padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9 }}>
            ✕ CLOSE
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display:'flex', gap:8, padding:'8px 16px', flexWrap:'wrap',
                    borderBottom:'1px solid #1e3a5f' }}>
        {[
          { label:'SKILLS',    val: counts.skills,    col:'#94A3B8' },
          { label:'NODES',     val: counts.nodes,     col:'#94A3B8' },
          { label:'SCENARIOS', val: counts.scenarios, col:'#94A3B8' },
          { label:'DEPLOYED',  val: counts.deployed,  col: CLS_COLOR.DEPLOYED  },
          { label:'NETWORKED', val: counts.networked, col: CLS_COLOR.NETWORKED },
          { label:'SCRIPTED',  val: counts.scripted,  col: CLS_COLOR.SCRIPTED  },
          { label:'ISOLATED',  val: counts.isolated,  col: CLS_COLOR.ISOLATED  },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background:'rgba(0,10,30,0.8)', border:`1px solid ${col}44`,
            borderRadius:4, padding:'4px 10px', textAlign:'center', minWidth:80 }}>
            <div style={{ color: col, fontSize:16, fontWeight:700 }}>{val}</div>
            <div style={{ color:'#64748B', fontSize:8, letterSpacing:1 }}>{label}</div>
          </div>
        ))}

        <button onClick={assess} disabled={assessing} style={{
          marginLeft:'auto', background: assessing ? '#1e3a5f' : 'rgba(245,158,11,0.15)',
          border:'1px solid #F59E0B', color:'#F59E0B', padding:'4px 12px',
          borderRadius:3, cursor: assessing ? 'default' : 'pointer', fontSize:9, letterSpacing:1,
        }}>
          {assessing ? '…ASSESSING' : '▶ ASSESS'}
        </button>
      </div>

      {assessment && (
        <div style={{ margin:'6px 16px', padding:'8px 12px', background:'rgba(245,158,11,0.08)',
          border:'1px solid #F59E0B66', borderRadius:4, fontSize:10, color:'#E2E8F0',
          maxHeight:80, overflowY:'auto' }}>
          {assessment}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display:'flex', gap:4, padding:'6px 16px', alignItems:'center',
                    borderBottom:'1px solid #1e3a5f', flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab===t ? `${CLS_COLOR[t] || '#334155'}22` : 'transparent',
            border: `1px solid ${tab===t ? (CLS_COLOR[t]||'#334155') : '#334155'}`,
            color: tab===t ? (CLS_COLOR[t]||'#E2E8F0') : '#64748B',
            padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9, letterSpacing:1,
          }}>{t}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search skills…"
          style={{ marginLeft:'auto', background:'rgba(0,10,30,0.7)', border:'1px solid #334155',
            color:'#E2E8F0', padding:'2px 8px', borderRadius:3, fontSize:9, width:180, outline:'none' }} />
      </div>

      {/* Rows */}
      <div style={{ flex:1, overflowY:'auto', padding:'6px 16px' }}>
        {loading && <div style={{ color:'#64748B', fontSize:10, padding:8 }}>Loading…</div>}
        {error   && <div style={{ color:'#FF4444', fontSize:10, padding:8 }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color:'#475569', fontSize:10, padding:8 }}>No skills match the current filter.</div>
        )}
        {visible.map(r => {
          const isExp = !!expanded[r.id];
          return (
            <div key={r.id} style={{ marginBottom:3 }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px',
                  background:'rgba(0,10,30,0.6)', border:`1px solid ${CLS_COLOR[r.cls]}33`,
                  borderRadius: isExp ? '4px 4px 0 0' : 4, cursor:'pointer' }}
              >
                <span style={{ fontSize:9, padding:'1px 6px', borderRadius:2,
                  background:`${CLS_COLOR[r.cls]}22`, color: CLS_COLOR[r.cls], letterSpacing:1 }}>
                  {r.cls}
                </span>
                <span style={{ color:'#E2E8F0', fontSize:10, flex:1 }}>{r.name}</span>
                {r.score !== null && (
                  <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                    background:'#33415544', color:'#94A3B8' }}>
                    {typeof r.score === 'number' ? r.score.toFixed(2) : r.score}
                  </span>
                )}
                <span style={{ color:'#475569', fontSize:9 }}>
                  {r.matchedNodes.length}N · {r.matchedScenarios.length}S
                </span>
                <span style={{ color:'#475569', fontSize:9 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ background:'rgba(0,10,30,0.7)', border:`1px solid ${CLS_COLOR[r.cls]}22`,
                  borderRadius:'0 0 4px 4px', padding:'8px 12px', display:'flex', gap:16, flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ color:'#38BDF8', fontSize:9, marginBottom:4, letterSpacing:1 }}>
                      MATCHED GRAPH NODES
                    </div>
                    {r.matchedNodes.length === 0
                      ? <div style={{ color:'#475569', fontSize:10 }}>None</div>
                      : r.matchedNodes.map((nd, ni) => (
                        <div key={ni} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ color:'#E2E8F0', fontSize:10 }}>
                            {nd.label || nd.name || nd.id || '(node)'}
                          </span>
                          {nd.centrality !== undefined && nd.centrality !== null && (
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                              background:'#38BDF833', color:'#38BDF8' }}>
                              {typeof nd.centrality === 'number' ? nd.centrality.toFixed(3) : nd.centrality}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ color:'#A78BFA', fontSize:9, marginBottom:4, letterSpacing:1 }}>
                      MATCHED SCENARIOS
                    </div>
                    {r.matchedScenarios.length === 0
                      ? <div style={{ color:'#475569', fontSize:10 }}>None</div>
                      : r.matchedScenarios.map((sc, si) => (
                        <div key={si} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ color:'#E2E8F0', fontSize:10 }}>
                            {sc.title || sc.name || sc.id || '(scenario)'}
                          </span>
                          {(sc.status || sc.state) && (
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                              background:'#A78BFA33', color:'#A78BFA' }}>
                              {sc.status || sc.state}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse-amber {
          0%,100% { opacity:1; }
          50% { opacity:0.3; }
        }
      `}</style>
    </div>
  );
}
