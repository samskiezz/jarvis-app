/**
 * LiveIntelScenarioSkillCrisisReadiness — F68
 *
 * Fetches /functions/getLiveIntel + /v1/scenario/list + /v1/aip/skill
 * Keyword-matches each live intel event (quake/crypto/fx) against runnable
 * scenarios AND available skills to classify:
 *   READY    — event matched both a Scenario AND a Skill (fully covered)
 *   SCRIPTED — event matched a Scenario only (script exists, no skill)
 *   SKILLED  — event matched a Skill only (capability exists, no script)
 *   BLIND    — no scenario or skill match (undefended event type)
 *
 * Toggle: ◈ LCRCOV button (fixed, bottom strip) left:86440, zIndex:165
 * Stat tiles: events / scenarios / skills / ready / scripted / skilled / blind
 * Red pulse on BLIND count.
 * Expandable rows: matched scenarios with status badge + matched skills with score badge.
 * Filter tabs: ALL / READY / SCRIPTED / SKILLED / BLIND + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "lcrcov"/"live crisis"/"crisis readiness"/"crisis response coverage"/
 *        "intel scenario skill"/"blind events"/"undefended events"/
 *        "live intel crisis"/"event coverage"/"event readiness"
 * Event: jarvis:lcrcov-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'READY', 'SCRIPTED', 'SKILLED', 'BLIND'];

const CLS_COLOR = {
  READY:    '#00FF88',
  SCRIPTED: '#38BDF8',
  SKILLED:  '#A78BFA',
  BLIND:    '#FF4466',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
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

function extractEvents(raw) {
  if (!raw) return [];
  const out = [];
  // earthquakes
  const quakes = raw.earthquakes || raw.quakes || [];
  (Array.isArray(quakes) ? quakes : []).forEach(q => {
    out.push({
      id:       q.id || q.event_id || `quake-${q.place || ''}`,
      name:     q.place || q.location || q.title || 'Earthquake',
      type:     'earthquake',
      severity: q.magnitude || q.mag || '',
      label:    ['earthquake', q.place, q.location, q.title, q.region, String(q.magnitude || '')].join(' '),
    });
  });
  // crypto
  const crypto = raw.crypto || raw.cryptos || [];
  (Array.isArray(crypto) ? crypto : []).forEach(c => {
    out.push({
      id:    c.id || c.symbol || `crypto-${c.name || ''}`,
      name:  c.name || c.symbol || 'Crypto',
      type:  'crypto',
      label: ['crypto', c.name, c.symbol, c.currency, c.id].join(' '),
    });
  });
  // fx / forex
  const fx = raw.fx || raw.forex || raw.currencies || [];
  (Array.isArray(fx) ? fx : []).forEach(f => {
    out.push({
      id:    f.id || f.pair || f.symbol || `fx-${f.name || ''}`,
      name:  f.pair || f.name || f.symbol || 'FX',
      type:  'fx',
      label: ['forex', 'fx', f.pair, f.name, f.symbol, f.currency].join(' '),
    });
  });
  return out;
}

function classify(eventToks, scenarios, skills) {
  const matchedScenarios = scenarios.filter(s =>
    overlaps(eventToks, [
      s.id, s.name, s.title, s.type, s.category,
      s.description, s.tags, s.topic, s.subject, s.summary,
    ].join(' '))
  );
  const matchedSkills = skills.filter(sk =>
    overlaps(eventToks, [
      sk.id, sk.name, sk.title, sk.type, sk.category,
      sk.description, sk.tags, sk.domain, sk.subject, sk.capability,
    ].join(' '))
  );
  const hasScene = matchedScenarios.length > 0;
  const hasSkill = matchedSkills.length > 0;
  const cls = hasScene && hasSkill ? 'READY'
            : hasScene             ? 'SCRIPTED'
            : hasSkill             ? 'SKILLED'
            : 'BLIND';
  return {
    cls,
    matchedScenarios: matchedScenarios.slice(0, 4),
    matchedSkills:    matchedSkills.slice(0, 4),
  };
}

export function isLcrcovQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('lcrcov') ||
    s.includes('live crisis') ||
    s.includes('crisis readiness') ||
    s.includes('crisis response coverage') ||
    s.includes('intel scenario skill') ||
    s.includes('blind events') ||
    s.includes('undefended events') ||
    s.includes('live intel crisis') ||
    s.includes('event coverage') ||
    s.includes('event readiness')
  );
}

export default function LiveIntelScenarioSkillCrisisReadiness() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [rows, setRows]             = useState([]);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [intelRes, scRes, skRes] = await Promise.all([
        fetch(`${API}/functions/getLiveIntel`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/v1/scenario/list`,        { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/v1/aip/skill`,            { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [intelRaw, scRaw, skRaw] = await Promise.all([
        intelRes.ok ? intelRes.json() : {},
        scRes.ok    ? scRes.json()    : {},
        skRes.ok    ? skRes.json()    : {},
      ]);

      const events    = extractEvents(intelRaw);
      const scenarios = normalizeArray(scRaw, ['scenarios', 'items', 'data', 'results', 'entities']);
      const skills    = normalizeArray(skRaw,  ['skills',   'items', 'data', 'results', 'entities']);

      const classified = events.map(ev => {
        const toks = tokens(ev.label || ev.name);
        const { cls, matchedScenarios, matchedSkills } = classify(toks, scenarios, skills);
        return { ...ev, cls, matchedScenarios, matchedSkills };
      });

      setRows(classified);
    } catch (_) {
      /* network error — leave existing rows */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:lcrcov-toggle', handler);
    return () => window.removeEventListener('jarvis:lcrcov-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setAssessment('');
    const blindCount  = rows.filter(r => r.cls === 'BLIND').length;
    const readyCount  = rows.filter(r => r.cls === 'READY').length;
    const prompt = `Jarvis, I have ${rows.length} live intel events. ${blindCount} are BLIND (no scenario script and no skill coverage — undefended event types). ${readyCount} are READY (both a scenario and a skill are matched). Provide a 2-sentence operational advisory on addressing blind event types and ensuring crisis response readiness for live incidents.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = r.ok ? await r.json() : {};
      const text = data.response || data.message || data.answer || data.content || '';
      setAssessment(text);
      if (text) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({ text, voice: 'ash' }),
          });
        } catch (_) { /* TTS is best-effort */ }
      }
    } catch (_) { /* assessment failed */ } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const counts = {
    total:    rows.length,
    ready:    rows.filter(r => r.cls === 'READY').length,
    scripted: rows.filter(r => r.cls === 'SCRIPTED').length,
    skilled:  rows.filter(r => r.cls === 'SKILLED').length,
    blind:    rows.filter(r => r.cls === 'BLIND').length,
  };

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || (r.name || '').toLowerCase().includes(search.toLowerCase()) || r.type.includes(search.toLowerCase()))
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 86440, zIndex: 165,
          background: 'rgba(255,68,102,0.08)', border: '1px solid #FF446644',
          color: '#FF4466', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
        title="Live Intel × Scenario × Skill Crisis Response Coverage"
      >◈ LCRCOV</button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 52, right: 14, zIndex: 165,
        width: 560, maxHeight: '78vh',
        background: 'rgba(8,10,18,0.97)', border: '1px solid #FF446633',
        borderRadius: 6, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', fontSize: 11, color: '#ccc',
        boxShadow: '0 0 32px rgba(255,68,102,0.08)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 12px', borderBottom: '1px solid #FF446622',
          background: 'rgba(255,68,102,0.04)',
        }}>
          <span style={{ color: '#FF4466', fontWeight: 700, letterSpacing: 1, fontSize: 10 }}>
            ◈ LCRCOV — LIVE CRISIS RESPONSE COVERAGE
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {loading && <span style={{ color: '#FF446677', fontSize: 9 }}>LOADING…</span>}
            <button onClick={load} title="Refresh"
              style={{ background: 'none', border: 'none', color: '#FF446666', cursor: 'pointer', fontSize: 12, padding: 0 }}>↻</button>
            <button onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap' }}>
          {[
            ['TOTAL',    counts.total,    '#888',    false],
            ['READY',    counts.ready,    '#00FF88', false],
            ['SCRIPTED', counts.scripted, '#38BDF8', false],
            ['SKILLED',  counts.skilled,  '#A78BFA', false],
            ['BLIND',    counts.blind,    '#FF4466', true],
          ].map(([label, val, color, pulse]) => (
            <div key={label} style={{
              background: `rgba(${
                color === '#00FF88' ? '0,255,136'
                : color === '#38BDF8' ? '56,189,248'
                : color === '#A78BFA' ? '167,139,250'
                : color === '#FF4466' ? '255,68,102'
                : '136,136,136'
              },0.07)`,
              border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 72,
            }}>
              <span style={{
                fontSize: 16, fontWeight: 700, color,
                animation: pulse && val > 0 ? 'lcrcov-pulse 1.8s ease-in-out infinite' : 'none',
              }}>{val}</span>
              <span style={{ fontSize: 8, color: `${color}99`, letterSpacing: 1 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? 'rgba(255,68,102,0.15)' : 'none',
                border: `1px solid ${tab === t ? '#FF4466' : '#FF446633'}`,
                color: tab === t ? '#FF4466' : '#888',
                fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                fontFamily: 'monospace', letterSpacing: 1,
              }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,68,102,0.04)',
              border: '1px solid #FF446633', borderRadius: 3, color: '#ccc',
              fontSize: 9, padding: '2px 8px', fontFamily: 'monospace', outline: 'none', width: 110,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#555', textAlign: 'center', padding: 20, fontSize: 10 }}>
              {rows.length === 0 ? 'No live intel events loaded.' : 'No matches.'}
            </div>
          )}
          {visible.map((ev, idx) => {
            const id = ev.id || ev.name || String(idx);
            const isExp = !!expanded[id];
            const color = CLS_COLOR[ev.cls] || '#888';
            return (
              <div key={id} style={{
                marginBottom: 4,
                background: `rgba(${
                  color === '#00FF88' ? '0,255,136'
                  : color === '#38BDF8' ? '56,189,248'
                  : color === '#A78BFA' ? '167,139,250'
                  : '255,68,102'
                },0.03)`,
                border: `1px solid ${color}22`, borderRadius: 4,
              }}>
                <div
                  onClick={() => setExpanded(e => ({ ...e, [id]: !e[id] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer' }}
                >
                  <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1, minWidth: 66 }}>{ev.cls}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ccc' }}>
                    {ev.name || id}
                  </span>
                  {ev.type && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 2,
                      background: 'rgba(255,255,255,0.06)', color: '#aaa', letterSpacing: 1,
                    }}>{ev.type}</span>
                  )}
                  {ev.severity !== undefined && ev.severity !== '' && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 2,
                      background: 'rgba(255,68,102,0.12)', color: '#FF4466', letterSpacing: 1,
                    }}>M{ev.severity}</span>
                  )}
                  <span style={{ color: '#555', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 8px 8px', borderTop: `1px solid ${color}11` }}>
                    {/* Matched Scenarios */}
                    {ev.matchedScenarios.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 8, color: '#38BDF899', marginBottom: 3, letterSpacing: 1 }}>MATCHED SCENARIOS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {ev.matchedScenarios.map((s, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(56,189,248,0.10)', border: '1px solid #38BDF833', color: '#38BDF8',
                            }}>
                              {s.name || s.title || s.id}
                              {s.status && (
                                <span style={{ color: '#38BDF877', marginLeft: 4 }}>{s.status}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Matched Skills */}
                    {ev.matchedSkills.length > 0 && (
                      <div>
                        <div style={{ fontSize: 8, color: '#A78BFA99', marginBottom: 3, letterSpacing: 1 }}>MATCHED SKILLS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {ev.matchedSkills.map((sk, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(167,139,250,0.10)', border: '1px solid #A78BFA33', color: '#A78BFA',
                            }}>
                              {sk.name || sk.title || sk.id}
                              {sk.score !== undefined && (
                                <span style={{ color: '#A78BFA77', marginLeft: 4 }}>
                                  {typeof sk.score === 'number' ? sk.score.toFixed(1) : sk.score}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {ev.matchedScenarios.length === 0 && ev.matchedSkills.length === 0 && (
                      <div style={{ fontSize: 9, color: '#FF446666' }}>No matching scenarios or skills found.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Assess */}
        <div style={{ padding: '6px 12px 10px', borderTop: '1px solid #FF446611' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,68,102,0.05)' : 'rgba(255,68,102,0.10)',
              border: '1px solid #FF446655', color: '#FF4466',
              fontSize: 10, padding: '4px 14px', borderRadius: 3,
              cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS CRISIS READINESS'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(255,68,102,0.03)',
              border: '1px solid #FF446622', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>

      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 86440, zIndex: 165,
          background: 'rgba(255,68,102,0.15)', border: '1px solid #FF4466',
          color: '#FF4466', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >◈ LCRCOV ✕</button>

      <style>{`
        @keyframes lcrcov-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </>
  );
}
