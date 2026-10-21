/**
 * InvestigationIntelSkillResponseIndex — F87
 *
 * Fetches /v1/investigations + /entities/IntelProfile + /v1/aip/skill.
 * Keyword-matches each investigation against intel profiles AND skills to classify:
 *   RESPONDING — investigation has both a matched intel profile AND a matched skill (full response)
 *   PROFILED   — investigation matched intel profiles only (contextualised but no skill support)
 *   CAPABLE    — investigation matched skills only (skill exists but no intel profile match)
 *   OPEN       — no intel profile or skill match (undefended open case)
 *
 * Toggle: ◈ IIRSRP button (fixed, bottom strip) left:97080, zIndex:184
 * Stat tiles: investigations / profiles / skills / responding / profiled / capable / open
 * Red pulse on OPEN count.
 * Expandable rows: matched intel profiles with category badge + matched skills with score badge.
 * Filter tabs: ALL / RESPONDING / PROFILED / CAPABLE / OPEN + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "iirsrp"/"investigation intel skill"/"active response index"/"open investigations"
 *        "investigation response"/"undefended cases"/"investigation profile skill"
 *        "response index"/"investigation capability"/"open cases skill"
 *        "investigation blind spots"/"response pipeline"
 * Event: jarvis:iirsrp-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'RESPONDING', 'PROFILED', 'CAPABLE', 'OPEN'];

const CLS_COLOR = {
  RESPONDING: '#22C55E',
  PROFILED:   '#38BDF8',
  CAPABLE:    '#A78BFA',
  OPEN:       '#EF4444',
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

export function isIirsrpQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'iirsrp', 'investigation intel skill', 'active response index', 'open investigations',
    'investigation response', 'undefended cases', 'investigation profile skill',
    'response index', 'investigation capability', 'open cases skill',
    'investigation blind spots', 'response pipeline',
  ].some(k => s.includes(k));
}

export function buildIirsrpScript() {
  return `Fetch /v1/investigations, /entities/IntelProfile, and /v1/aip/skill. ` +
    `Keyword-match each investigation title/description against intel profile names/categories AND skill names/descriptions. ` +
    `Classify each investigation as RESPONDING/PROFILED/CAPABLE/OPEN. ` +
    `Report total OPEN count (investigations with no intel profile and no matching skill — undefended cases), ` +
    `identify which OPEN investigations are most critical given their status/priority, ` +
    `and recommend intel profiling or skill assignment to close the response gap.`;
}

export default function InvestigationIntelSkillResponseIndex() {
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
    investigations:0, profiles:0, skills:0, responding:0, profiled:0, capable:0, open:0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [invRaw, ipRaw, skRaw] = await Promise.all([
        fetch(`${API}/v1/investigations`,    { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/IntelProfile`,{ headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/aip/skill`,         { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const investigations = normalizeArray(invRaw, ['items','investigations','results','data']);
      const profiles       = normalizeArray(ipRaw,  ['items','profiles','results','data','entities']);
      const skills         = normalizeArray(skRaw,  ['items','skills','results','data']);

      const built = investigations.map(inv => {
        const invText = [
          inv.title, inv.name, inv.description, inv.type, inv.category,
          inv.subject, inv.tags, inv.status,
        ].filter(Boolean).join(' ');
        const invToks = tokens(invText);

        const matchedProfiles = profiles.filter(ip => {
          const ipStr = [ip.name, ip.title, ip.category, ip.type, ip.description, ip.aliases].filter(Boolean).join(' ');
          return overlaps(invToks, ipStr);
        });
        const matchedSkills = skills.filter(sk => {
          const skStr = [sk.name, sk.title, sk.description, sk.type, sk.category, sk.tags].filter(Boolean).join(' ');
          return overlaps(invToks, skStr);
        });

        const hasProfiles = matchedProfiles.length > 0;
        const hasSkills   = matchedSkills.length > 0;
        const cls = hasProfiles && hasSkills ? 'RESPONDING'
                  : hasProfiles              ? 'PROFILED'
                  : hasSkills                ? 'CAPABLE'
                  :                           'OPEN';

        return { inv, cls, matchedProfiles, matchedSkills };
      });

      setRows(built);
      const c = { investigations: built.length, profiles: profiles.length, skills: skills.length,
        responding:0, profiled:0, capable:0, open:0 };
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
    window.addEventListener('jarvis:iirsrp-toggle', onToggle);
    return () => window.removeEventListener('jarvis:iirsrp-toggle', onToggle);
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
        body: JSON.stringify({ message: buildIirsrpScript() }),
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
      const name = (r.inv.title || r.inv.name || '').toLowerCase();
      if (!name.includes(s)) return false;
    }
    return true;
  });

  const CY = '#38BDF8';

  if (!open) {
    const hasOpen = counts.open > 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investigation × IntelProfile × Skill Active Response Index"
        style={{
          position:'fixed', bottom:8, left:97080, zIndex:184,
          background:'rgba(5,8,13,0.82)', border:`1px solid ${CY}55`,
          color: hasOpen ? '#EF4444' : CY, padding:'3px 10px', borderRadius:6,
          fontFamily:"'JetBrains Mono',monospace", fontSize:11, cursor:'pointer',
          letterSpacing:1,
          boxShadow: hasOpen ? '0 0 10px #EF444466' : 'none',
          animation: hasOpen ? 'iirsrpPulse 1.4s ease-in-out infinite' : 'none',
        }}
      >
        ◈ IIRSRP{counts.open > 0 ? ` ●${counts.open}` : ''}
        <style>{`@keyframes iirsrpPulse{0%,100%{box-shadow:0 0 6px #EF444444}50%{box-shadow:0 0 18px #EF4444cc}}`}</style>
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
        <span style={{ color:CY, fontSize:13, letterSpacing:2, fontWeight:700 }}>◈ IIRSRP</span>
        <span style={{ color:'#6E8AA0', fontSize:11 }}>Investigation × IntelProfile × Skill — Active Response Index</span>
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
          ['INVESTIGATIONS', counts.investigations, CY],
          ['PROFILES', counts.profiles, '#38BDF8'],
          ['SKILLS', counts.skills, '#A78BFA'],
          ['RESPONDING', counts.responding, '#22C55E'],
          ['PROFILED', counts.profiled, '#38BDF8'],
          ['CAPABLE', counts.capable, '#A78BFA'],
          ['OPEN', counts.open, '#EF4444'],
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
          placeholder="search investigations…"
          style={{ marginLeft:'auto', background:'rgba(14,22,34,0.7)',
            border:`1px solid ${CY}33`, color:CY, padding:'4px 10px',
            borderRadius:5, fontSize:11, width:200, outline:'none' }} />
      </div>

      {/* rows */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 20px 20px' }}>
        {error && <div style={{ color:'#EF4444', fontSize:12, padding:'8px 0' }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color:'#6E8AA0', fontSize:12, padding:'8px 0' }}>No investigations match the current filter.</div>
        )}
        {visible.map((r, i) => {
          const id    = r.inv.id || r.inv.title || i;
          const title = r.inv.title || r.inv.name || `Investigation ${id}`;
          const status = r.inv.status || '';
          const isExp = !!expanded[id];
          const col   = CLS_COLOR[r.cls];
          return (
            <div key={id} style={{
              marginBottom:6, background:'rgba(14,22,34,0.6)',
              border:`1px solid ${col}33`, borderRadius:8, overflow:'hidden',
            }}>
              <div onClick={() => setExpanded(p => ({ ...p, [id]: !p[id] }))}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', cursor:'pointer' }}>
                <span style={{ color:col, fontSize:10, fontWeight:700, letterSpacing:1,
                  background:`${col}18`, padding:'2px 8px', borderRadius:4 }}>{r.cls}</span>
                <span style={{ flex:1, fontSize:12, color:'#DCEBF5' }}>{title}</span>
                {status && (
                  <span style={{ fontSize:10, color:'#6E8AA0', background:'rgba(30,42,54,0.8)',
                    padding:'2px 6px', borderRadius:4 }}>{status}</span>
                )}
                <span style={{ fontSize:11, color:CY,
                  marginLeft:8 }}>{r.matchedProfiles.length}P / {r.matchedSkills.length}SK</span>
                <span style={{ color:'#6E8AA0', fontSize:12, marginLeft:6 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding:'0 12px 10px', borderTop:`1px solid ${col}22` }}>
                  {r.matchedProfiles.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ color:'#38BDF8', fontSize:10, letterSpacing:1, marginBottom:4 }}>MATCHED INTEL PROFILES</div>
                      {r.matchedProfiles.map((ip, j) => (
                        <div key={j} style={{ display:'flex', alignItems:'center', gap:8,
                          padding:'4px 8px', background:'rgba(56,189,248,0.06)',
                          borderRadius:5, marginBottom:3 }}>
                          <span style={{ color:'#DCEBF5', fontSize:11, flex:1 }}>{ip.name || ip.title || `Profile ${j+1}`}</span>
                          {(ip.category || ip.type) && (
                            <span style={{ fontSize:10, color:'#38BDF8', background:'rgba(56,189,248,0.15)',
                              padding:'1px 6px', borderRadius:3 }}>{ip.category || ip.type}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {r.matchedSkills.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ color:'#A78BFA', fontSize:10, letterSpacing:1, marginBottom:4 }}>MATCHED SKILLS</div>
                      {r.matchedSkills.map((sk, j) => {
                        const score = sk.score ?? sk.confidence ?? sk.level ?? null;
                        return (
                          <div key={j} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'4px 8px', background:'rgba(167,139,250,0.06)',
                            borderRadius:5, marginBottom:3 }}>
                            <span style={{ color:'#DCEBF5', fontSize:11, flex:1 }}>{sk.name || sk.title || `Skill ${j+1}`}</span>
                            {score !== null && (
                              <span style={{ fontSize:10, color:'#A78BFA', background:'rgba(167,139,250,0.15)',
                                padding:'1px 6px', borderRadius:3 }}>{Math.round(Number(score) * 100) / 100}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {r.matchedProfiles.length === 0 && r.matchedSkills.length === 0 && (
                    <div style={{ color:'#6E8AA0', fontSize:11, padding:'6px 0' }}>No matched profiles or skills — undefended open case.</div>
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
