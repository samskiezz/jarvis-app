/**
 * InvestmentSkillScenarioDefenseCoverage — F89
 *
 * Fetches /entities/Investment + /v1/aip/skill + /v1/scenario/list.
 * Keyword-matches each investment against skills AND scenarios to classify:
 *   DEFENDED  — investment matched both a skill AND a scenario (fully covered)
 *   SKILLED   — investment matched skill only (capability exists, no runnable scenario)
 *   SCRIPTED  — investment matched scenario only (script exists, no skill support)
 *   EXPOSED   — no matching skill and no matching scenario (full blind spot)
 *
 * Toggle: ◈ IWSDEF button (fixed, bottom strip) left:98200, zIndex:186
 * Stat tiles: investments / skills / scenarios / defended / skilled / scripted / exposed
 * Red pulse on EXPOSED count.
 * Expandable rows: matched skills with score badge + matched scenarios with status badge.
 * Filter tabs: ALL / DEFENDED / SKILLED / SCRIPTED / EXPOSED + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "iwsdef"/"investment defense"/"wealth defense"/"investment skill scenario"
 *        "exposed investments"/"investment coverage"/"investment scenario coverage"
 *        "investment skill coverage"/"investment risk coverage"
 *        "undefended investments"/"wealth defense coverage"/"investment protection"
 * Event: jarvis:iwsdef-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'DEFENDED', 'SKILLED', 'SCRIPTED', 'EXPOSED'];

const CLS_COLOR = {
  DEFENDED: '#22C55E',
  SKILLED:  '#38BDF8',
  SCRIPTED: '#A78BFA',
  EXPOSED:  '#EF4444',
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

export function isIwsdefQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'iwsdef', 'investment defense', 'wealth defense', 'investment skill scenario',
    'exposed investments', 'investment coverage', 'investment scenario coverage',
    'investment skill coverage', 'investment risk coverage',
    'undefended investments', 'wealth defense coverage', 'investment protection',
  ].some(k => s.includes(k));
}

export function buildIwsdefScript() {
  return `Fetch /entities/Investment, /v1/aip/skill, and /v1/scenario/list. ` +
    `Keyword-match each investment (by name, type, description, and asset class) against skill names/descriptions AND scenario titles/descriptions. ` +
    `Classify each investment as DEFENDED/SKILLED/SCRIPTED/EXPOSED. ` +
    `Report total EXPOSED count (investments with no skill coverage and no runnable defensive scenario — wealth blind spots), ` +
    `identify which EXPOSED investments are highest value or highest risk, ` +
    `and recommend skill acquisition or scenario creation to close the wealth defense gap.`;
}

export default function InvestmentSkillScenarioDefenseCoverage() {
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
    investments:0, skills:0, scenarios:0,
    defended:0, skilled:0, scripted:0, exposed:0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [invRaw, skillRaw, scenRaw] = await Promise.all([
        fetch(`${API}/entities/Investment`,  { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/aip/skill`,         { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/scenario/list`,     { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const investments = normalizeArray(invRaw,   ['items','investments','results','data','entities']);
      const skills      = normalizeArray(skillRaw, ['items','skills','results','data']);
      const scenarios   = normalizeArray(scenRaw,  ['items','scenarios','results','data']);

      const built = investments.map((inv, idx) => {
        const invText = [
          inv.name, inv.title, inv.type, inv.asset_class, inv.assetClass,
          inv.description, inv.ticker, inv.sector, inv.category, inv.tags,
        ].filter(Boolean).join(' ');
        const invToks = tokens(invText);

        const matchedSkills = skills.filter(sk => {
          const skStr = [sk.name, sk.title, sk.description, sk.category, sk.type, sk.tags].filter(Boolean).join(' ');
          return overlaps(invToks, skStr);
        });
        const matchedScenarios = scenarios.filter(sc => {
          const scStr = [sc.name, sc.title, sc.description, sc.type, sc.category, sc.tags, sc.status].filter(Boolean).join(' ');
          return overlaps(invToks, scStr);
        });

        const hasSkills    = matchedSkills.length > 0;
        const hasScenarios = matchedScenarios.length > 0;
        const cls = hasSkills && hasScenarios ? 'DEFENDED'
                  : hasSkills                 ? 'SKILLED'
                  : hasScenarios              ? 'SCRIPTED'
                  :                             'EXPOSED';

        const id    = inv.id || inv._id || `inv-${idx}`;
        const label = inv.name || inv.title || `Investment ${idx + 1}`;
        const type  = inv.type || inv.asset_class || inv.assetClass || null;
        const value = inv.value || inv.amount || inv.currentValue || null;

        return { id, label, type, value, cls, matchedSkills, matchedScenarios };
      });

      setRows(built);
      const c = {
        investments: built.length,
        skills: skills.length,
        scenarios: scenarios.length,
        defended:0, skilled:0, scripted:0, exposed:0,
      };
      built.forEach(r => { c[r.cls.toLowerCase()]++; });
      setCounts(c);
    } catch (e) {
      setError(e.message || 'fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:iwsdef-toggle', onToggle);
    return () => window.removeEventListener('jarvis:iwsdef-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: buildIwsdefScript() }),
      });
      const d = await r.json();
      const txt = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(r.label || '').toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const CY = '#38BDF8';

  if (!open) {
    const hasExposed = counts.exposed > 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investment × Skill × Scenario Wealth Defense Coverage"
        style={{
          position:'fixed', bottom:8, left:98200, zIndex:186,
          background:'rgba(5,8,13,0.82)', border:`1px solid ${CY}55`,
          color: hasExposed ? '#EF4444' : CY, padding:'3px 10px', borderRadius:6,
          fontFamily:"'JetBrains Mono',monospace", fontSize:11, cursor:'pointer',
          letterSpacing:1,
          boxShadow: hasExposed ? '0 0 10px #EF444466' : 'none',
          animation: hasExposed ? 'iwsdefPulse 1.4s ease-in-out infinite' : 'none',
        }}
      >
        ◈ IWSDEF{counts.exposed > 0 ? ` ●${counts.exposed}` : ''}
        <style>{`@keyframes iwsdefPulse{0%,100%{box-shadow:0 0 6px #EF444444}50%{box-shadow:0 0 18px #EF4444cc}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9100,
      background:'rgba(4,6,10,0.92)', backdropFilter:'blur(8px)',
      fontFamily:"'JetBrains Mono',monospace", color:'#DCEBF5',
      display:'flex', flexDirection:'column', overflow:'hidden',
    }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 20px',
        borderBottom:`1px solid ${CY}33`, flexShrink:0 }}>
        <span style={{ color:CY, fontSize:13, letterSpacing:2, fontWeight:700 }}>◈ IWSDEF</span>
        <span style={{ color:'#6E8AA0', fontSize:11 }}>Investment × Skill × Scenario — Wealth Defense Coverage</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={fetchData} disabled={loading}
            style={{ background:'transparent', border:`1px solid ${CY}55`, color:CY,
              padding:'3px 10px', borderRadius:5, cursor:'pointer', fontSize:11 }}>
            {loading ? '…' : '↻'}
          </button>
          <button onClick={assess} disabled={assessing}
            style={{ background:'transparent', border:`1px solid #22C55E55`, color:'#22C55E',
              padding:'3px 10px', borderRadius:5, cursor:'pointer', fontSize:11 }}>
            {assessing ? '…' : '▶ ASSESS'}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background:'transparent', border:`1px solid #ffffff33`, color:'#8899AA',
              padding:'3px 10px', borderRadius:5, cursor:'pointer', fontSize:11 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display:'flex', gap:10, padding:'12px 20px', flexShrink:0, flexWrap:'wrap' }}>
        {[
          ['INVESTMENTS', counts.investments, CY],
          ['SKILLS',      counts.skills,      '#38BDF8'],
          ['SCENARIOS',   counts.scenarios,   '#A78BFA'],
          ['DEFENDED',    counts.defended,    '#22C55E'],
          ['SKILLED',     counts.skilled,     '#38BDF8'],
          ['SCRIPTED',    counts.scripted,    '#A78BFA'],
          ['EXPOSED',     counts.exposed,     '#EF4444'],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background:'rgba(14,22,34,0.7)', border:`1px solid ${col}33`,
            borderRadius:8, padding:'8px 14px', minWidth:90, textAlign:'center',
          }}>
            <div style={{ color:col, fontSize:18, fontWeight:700 }}>{val}</div>
            <div style={{ color:'#6E8AA0', fontSize:9, letterSpacing:1, marginTop:2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin:'0 20px 10px', padding:'10px 14px',
          background:'rgba(14,22,34,0.7)', border:`1px solid #22C55E33`,
          borderRadius:8, fontSize:12, color:'#DCEBF5', lineHeight:1.6, flexShrink:0 }}>
          {assessment}
        </div>
      )}

      {/* filter */}
      <div style={{ display:'flex', gap:6, padding:'0 20px 10px', flexShrink:0, flexWrap:'wrap', alignItems:'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab===t ? `${CLS_COLOR[t] || CY}22` : 'transparent',
            border:`1px solid ${tab===t ? (CLS_COLOR[t] || CY) : '#2A3A4A'}`,
            color: tab===t ? (CLS_COLOR[t] || CY) : '#6E8AA0',
            padding:'3px 10px', borderRadius:5, cursor:'pointer', fontSize:11,
          }}>{t}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ marginLeft:'auto', background:'rgba(14,22,34,0.7)',
            border:`1px solid ${CY}33`, color:CY, padding:'4px 10px',
            borderRadius:5, fontSize:11, width:200, outline:'none' }} />
      </div>

      {/* rows */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 20px 20px' }}>
        {error && <div style={{ color:'#EF4444', fontSize:12, padding:'8px 0' }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color:'#6E8AA0', fontSize:12, padding:'8px 0' }}>No investments match the current filter.</div>
        )}
        {visible.map(r => {
          const isExp = !!expanded[r.id];
          const col   = CLS_COLOR[r.cls];
          return (
            <div key={r.id} style={{
              marginBottom:6, background:'rgba(14,22,34,0.6)',
              border:`1px solid ${col}33`, borderRadius:8, overflow:'hidden',
            }}>
              <div onClick={() => setExpanded(p => ({ ...p, [r.id]: !p[r.id] }))}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', cursor:'pointer' }}>
                <span style={{ color:col, fontSize:10, fontWeight:700, letterSpacing:1,
                  background:`${col}18`, padding:'2px 8px', borderRadius:4 }}>{r.cls}</span>
                <span style={{ flex:1, fontSize:12, color:'#DCEBF5' }}>{r.label}</span>
                {r.type && (
                  <span style={{ fontSize:10, color:'#6E8AA0', background:'rgba(30,42,54,0.8)',
                    padding:'2px 6px', borderRadius:4 }}>{r.type}</span>
                )}
                {r.value != null && (
                  <span style={{ fontSize:10, color:'#A78BFA', background:'rgba(167,139,250,0.12)',
                    padding:'2px 6px', borderRadius:4 }}>
                    {typeof r.value === 'number' ? r.value.toLocaleString() : r.value}
                  </span>
                )}
                <span style={{ fontSize:11, color:CY, marginLeft:8 }}>
                  {r.matchedSkills.length}SK / {r.matchedScenarios.length}SC
                </span>
                <span style={{ color:'#6E8AA0', fontSize:12, marginLeft:6 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding:'0 12px 10px', borderTop:`1px solid ${col}22` }}>
                  {r.matchedSkills.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ color:'#38BDF8', fontSize:10, letterSpacing:1, marginBottom:4 }}>MATCHED SKILLS</div>
                      {r.matchedSkills.map((sk, j) => {
                        const score = sk.score ?? sk.rating ?? sk.level ?? null;
                        return (
                          <div key={j} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'4px 8px', background:'rgba(56,189,248,0.06)',
                            borderRadius:5, marginBottom:3 }}>
                            <span style={{ color:'#DCEBF5', fontSize:11, flex:1 }}>
                              {sk.name || sk.title || `Skill ${j+1}`}
                            </span>
                            {score != null && (
                              <span style={{ fontSize:10, color:'#38BDF8', background:'rgba(56,189,248,0.15)',
                                padding:'1px 6px', borderRadius:3 }}>{score}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {r.matchedScenarios.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ color:'#A78BFA', fontSize:10, letterSpacing:1, marginBottom:4 }}>MATCHED SCENARIOS</div>
                      {r.matchedScenarios.map((sc, j) => {
                        const status = sc.status || sc.state || null;
                        const statusCol = status && ['active','running','live'].includes(String(status).toLowerCase())
                          ? '#22C55E' : '#A78BFA';
                        return (
                          <div key={j} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'4px 8px', background:'rgba(167,139,250,0.06)',
                            borderRadius:5, marginBottom:3 }}>
                            <span style={{ color:'#DCEBF5', fontSize:11, flex:1 }}>
                              {sc.name || sc.title || `Scenario ${j+1}`}
                            </span>
                            {status && (
                              <span style={{ fontSize:10, color:statusCol, background:`${statusCol}22`,
                                padding:'1px 6px', borderRadius:3 }}>{status}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {r.matchedSkills.length === 0 && r.matchedScenarios.length === 0 && (
                    <div style={{ color:'#6E8AA0', fontSize:11, padding:'6px 0' }}>
                      No matched skills or scenarios — investment fully exposed.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
