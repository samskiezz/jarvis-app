/**
 * ContactKnowledgeOpsAlertBriefing — F90
 *
 * Fetches /entities/Contact + /knowledge/ + /v1/ops/alerts.
 * Keyword-matches each contact against knowledge articles AND ops alerts to classify:
 *   BRIEFED — contact matched both a knowledge article AND an active ops alert (fully monitored)
 *   ALERTED — contact matched an ops alert only (live signal, no knowledge grounding)
 *   KNOWN   — contact matched a knowledge article only (documented, no active alert)
 *   DARK    — no matching knowledge article and no matching ops alert (invisible actor)
 *
 * Toggle: ◈ CKOBRF button (fixed, bottom strip) left:98760, zIndex:187
 * Stat tiles: contacts / knowledge / alerts / briefed / alerted / known / dark
 * Amber pulse on DARK count (invisible actors — no knowledge grounding, no alert coverage).
 * Expandable rows: matched knowledge articles with category badge + matched ops alerts with severity badge.
 * Filter tabs: ALL / BRIEFED / ALERTED / KNOWN / DARK + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ckobrf"/"contact briefing"/"contact knowledge ops"/"dark contacts"
 *        "contact alert coverage"/"contact situational briefing"/"invisible contacts"
 *        "contact ops alert"/"contact knowledge alert"/"unmonitored contacts"
 *        "contact dark"/"briefed contacts"/"contact coverage"
 * Event: jarvis:ckobrf-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'BRIEFED', 'ALERTED', 'KNOWN', 'DARK'];

const CLS_COLOR = {
  BRIEFED: '#22C55E',
  ALERTED: '#F59E0B',
  KNOWN:   '#38BDF8',
  DARK:    '#6B7280',
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

export function isCkobrfQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'ckobrf', 'contact briefing', 'contact knowledge ops', 'dark contacts',
    'contact alert coverage', 'contact situational briefing', 'invisible contacts',
    'contact ops alert', 'contact knowledge alert', 'unmonitored contacts',
    'contact dark', 'briefed contacts', 'contact coverage',
  ].some(k => s.includes(k));
}

export function buildCkobrfScript() {
  return `Fetch /entities/Contact, /knowledge/, and /v1/ops/alerts. ` +
    `Keyword-match each contact (by name, role, organisation, and description) against knowledge article titles/categories AND ops alert messages/types. ` +
    `Classify each contact as BRIEFED/ALERTED/KNOWN/DARK. ` +
    `Report total DARK count (contacts with no knowledge grounding and no active alert coverage — invisible actors), ` +
    `identify which DARK contacts hold the highest-risk roles or organisations, ` +
    `and recommend knowledge creation or alert rule configuration to close the situational briefing gap.`;
}

export default function ContactKnowledgeOpsAlertBriefing() {
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
    contacts:0, knowledge:0, alerts:0,
    briefed:0, alerted:0, known:0, dark:0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [conRaw, knowRaw, alertRaw] = await Promise.all([
        fetch(`${API}/entities/Contact`,   { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/knowledge/`,         { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/ops/alerts`,      { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const contacts  = normalizeArray(conRaw,   ['items','contacts','results','data','entities']);
      const knowledge = normalizeArray(knowRaw,  ['items','articles','results','data','knowledge']);
      const alerts    = normalizeArray(alertRaw, ['items','alerts','results','data']);

      const built = contacts.map((con, idx) => {
        const conText = [
          con.name, con.full_name, con.fullName, con.role, con.title,
          con.organisation, con.organization, con.org, con.email,
          con.description, con.bio, con.category, con.tags,
        ].filter(Boolean).join(' ');
        const conToks = tokens(conText);

        const matchedKnowledge = knowledge.filter(art => {
          const artStr = [art.title, art.name, art.category, art.description, art.content, art.tags, art.type].filter(Boolean).join(' ');
          return overlaps(conToks, artStr);
        });
        const matchedAlerts = alerts.filter(al => {
          const alStr = [al.message, al.title, al.type, al.source, al.description, al.category, al.tags].filter(Boolean).join(' ');
          return overlaps(conToks, alStr);
        });

        const hasKnowledge = matchedKnowledge.length > 0;
        const hasAlerts    = matchedAlerts.length > 0;
        const cls = hasKnowledge && hasAlerts ? 'BRIEFED'
                  : hasAlerts                  ? 'ALERTED'
                  : hasKnowledge               ? 'KNOWN'
                  :                              'DARK';

        const id   = con.id || con._id || `con-${idx}`;
        const label = con.name || con.full_name || con.fullName || `Contact ${idx + 1}`;
        const role  = con.role || con.title || null;
        const org   = con.organisation || con.organization || con.org || null;

        return { id, label, role, org, cls, matchedKnowledge, matchedAlerts };
      });

      setRows(built);
      const c = {
        contacts: built.length,
        knowledge: knowledge.length,
        alerts: alerts.length,
        briefed:0, alerted:0, known:0, dark:0,
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
    window.addEventListener('jarvis:ckobrf-toggle', onToggle);
    return () => window.removeEventListener('jarvis:ckobrf-toggle', onToggle);
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
        body: JSON.stringify({ message: buildCkobrfScript() }),
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
    const hasDark = counts.dark > 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × Knowledge × Ops Alert — Situational Briefing Matrix"
        style={{
          position:'fixed', bottom:8, left:98760, zIndex:187,
          background:'rgba(5,8,13,0.82)', border:`1px solid ${CY}55`,
          color: hasDark ? '#F59E0B' : CY, padding:'3px 10px', borderRadius:6,
          fontFamily:"'JetBrains Mono',monospace", fontSize:11, cursor:'pointer',
          letterSpacing:1,
          boxShadow: hasDark ? '0 0 10px #F59E0B66' : 'none',
          animation: hasDark ? 'ckobrfPulse 1.4s ease-in-out infinite' : 'none',
        }}
      >
        ◈ CKOBRF{counts.dark > 0 ? ` ●${counts.dark}` : ''}
        <style>{`@keyframes ckobrfPulse{0%,100%{box-shadow:0 0 6px #F59E0B44}50%{box-shadow:0 0 18px #F59E0Bcc}}`}</style>
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
        <span style={{ color:CY, fontSize:13, letterSpacing:2, fontWeight:700 }}>◈ CKOBRF</span>
        <span style={{ color:'#6E8AA0', fontSize:11 }}>Contact × Knowledge × Ops Alert — Situational Briefing Matrix</span>
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
          ['CONTACTS',  counts.contacts,  CY],
          ['KNOWLEDGE', counts.knowledge, '#38BDF8'],
          ['ALERTS',    counts.alerts,    '#F59E0B'],
          ['BRIEFED',   counts.briefed,   '#22C55E'],
          ['ALERTED',   counts.alerted,   '#F59E0B'],
          ['KNOWN',     counts.known,     '#38BDF8'],
          ['DARK',      counts.dark,      '#6B7280'],
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
          placeholder="search contacts…"
          style={{ marginLeft:'auto', background:'rgba(14,22,34,0.7)',
            border:`1px solid ${CY}33`, color:CY, padding:'4px 10px',
            borderRadius:5, fontSize:11, width:200, outline:'none' }} />
      </div>

      {/* rows */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 20px 20px' }}>
        {error && <div style={{ color:'#EF4444', fontSize:12, padding:'8px 0' }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color:'#6E8AA0', fontSize:12, padding:'8px 0' }}>No contacts match the current filter.</div>
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
                {r.role && (
                  <span style={{ fontSize:10, color:'#6E8AA0', background:'rgba(30,42,54,0.8)',
                    padding:'2px 6px', borderRadius:4 }}>{r.role}</span>
                )}
                {r.org && (
                  <span style={{ fontSize:10, color:'#A78BFA', background:'rgba(167,139,250,0.12)',
                    padding:'2px 6px', borderRadius:4 }}>{r.org}</span>
                )}
                <span style={{ fontSize:11, color:CY, marginLeft:8 }}>
                  {r.matchedKnowledge.length}KN / {r.matchedAlerts.length}AL
                </span>
                <span style={{ color:'#6E8AA0', fontSize:12, marginLeft:6 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding:'0 12px 10px', borderTop:`1px solid ${col}22` }}>
                  {r.matchedKnowledge.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ color:'#38BDF8', fontSize:10, letterSpacing:1, marginBottom:4 }}>MATCHED KNOWLEDGE</div>
                      {r.matchedKnowledge.map((art, j) => {
                        const cat = art.category || art.type || null;
                        return (
                          <div key={j} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'4px 8px', background:'rgba(56,189,248,0.06)',
                            borderRadius:5, marginBottom:3 }}>
                            <span style={{ color:'#DCEBF5', fontSize:11, flex:1 }}>
                              {art.title || art.name || `Article ${j+1}`}
                            </span>
                            {cat && (
                              <span style={{ fontSize:10, color:'#38BDF8', background:'rgba(56,189,248,0.15)',
                                padding:'1px 6px', borderRadius:3 }}>{cat}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {r.matchedAlerts.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ color:'#F59E0B', fontSize:10, letterSpacing:1, marginBottom:4 }}>MATCHED OPS ALERTS</div>
                      {r.matchedAlerts.map((al, j) => {
                        const sev = al.severity || al.level || al.priority || null;
                        const sevCol = sev && ['critical','high'].includes(String(sev).toLowerCase())
                          ? '#EF4444' : '#F59E0B';
                        return (
                          <div key={j} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'4px 8px', background:'rgba(245,158,11,0.06)',
                            borderRadius:5, marginBottom:3 }}>
                            <span style={{ color:'#DCEBF5', fontSize:11, flex:1 }}>
                              {al.message || al.title || al.type || `Alert ${j+1}`}
                            </span>
                            {sev && (
                              <span style={{ fontSize:10, color:sevCol, background:`${sevCol}22`,
                                padding:'1px 6px', borderRadius:3 }}>{sev}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {r.matchedKnowledge.length === 0 && r.matchedAlerts.length === 0 && (
                    <div style={{ color:'#6E8AA0', fontSize:11, padding:'6px 0' }}>
                      No matched knowledge or alerts — contact is dark (invisible actor).
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
