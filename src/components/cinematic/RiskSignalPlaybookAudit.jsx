/**
 * RiskSignalPlaybookAudit — F52
 *
 * Fetches /entities/RiskSignal + /knowledge/ + /v1/scenario/list
 * Cross-references each risk signal against knowledge articles AND scenarios:
 *   PREPARED   — matched both a knowledge article AND a scenario (playbook exists)
 *   SCRIPTED   — matched a scenario only (runnable script, no knowledge backing)
 *   DOCUMENTED — matched a knowledge article only (documented, no runnable scenario)
 *   BLIND      — no match in either (dark risk — no playbook, no documentation)
 *
 * Toggle: ◈ RSPLAY button (fixed, bottom strip) left:77480, zIndex:149
 * Stat tiles: signals / articles / scenarios / prepared / scripted / documented / blind
 * Red pulse on BLIND count.
 * Expandable rows: matched knowledge articles with category badge + matched scenarios with status badge.
 * Filter tabs: ALL / PREPARED / SCRIPTED / DOCUMENTED / BLIND + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "risk playbook"/"response playbook"/"rsplay"/"blind risks"/"risk knowledge scenario"/
 *        "unscripted risks"/"playbook audit"/"risk response gap"/"blind risk signals"
 * Event: jarvis:rsplay-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'PREPARED', 'SCRIPTED', 'DOCUMENTED', 'BLIND'];

const CLS_COLOR = {
  PREPARED:   '#00E5A0',
  SCRIPTED:   '#A78BFA',
  DOCUMENTED: '#29E7FF',
  BLIND:      '#FF4444',
};

const SEV_COLOR = {
  critical: '#FF4444',
  high:     '#FF8800',
  medium:   '#FFB800',
  low:      '#29E7FF',
  info:     '#888',
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

function classifySignal(sigToks, articles, scenarios) {
  const matchedArticles = articles.filter(a =>
    overlaps(sigToks, [a.title, a.content, a.summary, a.category, a.type, a.tags, a.topic, a.subject, a.keywords].join(' '))
  );
  const matchedScenarios = scenarios.filter(sc =>
    overlaps(sigToks, [sc.title, sc.name, sc.type, sc.category, sc.description, sc.topic, sc.domain, sc.tags, sc.objective, sc.threat].join(' '))
  );
  const hasArticle   = matchedArticles.length > 0;
  const hasScenario  = matchedScenarios.length > 0;
  const cls = hasArticle && hasScenario ? 'PREPARED'
            : hasScenario ? 'SCRIPTED'
            : hasArticle  ? 'DOCUMENTED'
            : 'BLIND';
  return { cls, matchedArticles: matchedArticles.slice(0, 4), matchedScenarios: matchedScenarios.slice(0, 4) };
}

export function isRsplayQuery(q) {
  return /\b(rsplay|risk.playbook|response.playbook|blind.risk|risk.knowledge.scenario|unscript.risk|playbook.audit|risk.response.gap|blind.risk.signal|risk.response)\b/i.test(q);
}
export function buildRsplayScript() {
  return 'Opening Risk Signal Playbook Audit. Cross-referencing risk signals against knowledge base and runnable scenarios to identify which threats have no documented response playbook.';
}

export default function RiskSignalPlaybookAudit() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [articleCount, setArticleCount] = useState(0);
  const [scenarioCount, setScenarioCount] = useState(0);
  const [tab, setTab]                 = useState('ALL');
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(false);
  const [assessment, setAssessment]   = useState('');
  const intervalRef                   = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [sigRes, artRes, scnRes] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`, { headers: h }),
        fetch(`${API}/knowledge/`,          { headers: h }),
        fetch(`${API}/v1/scenario/list`,    { headers: h }),
      ]);
      const [sigRaw, artRaw, scnRaw] = await Promise.all([
        sigRes.ok ? sigRes.json() : [],
        artRes.ok ? artRes.json() : [],
        scnRes.ok ? scnRes.json() : [],
      ]);

      const signals   = normalizeArray(sigRaw, ['items','data','results','signals','risks']);
      const articles  = normalizeArray(artRaw, ['items','data','results','knowledge','articles','chunks','documents']);
      const scenarios = normalizeArray(scnRaw, ['items','data','results','scenarios','list']);

      setArticleCount(articles.length);
      setScenarioCount(scenarios.length);

      const built = signals.map((s, i) => {
        const id       = s.id || s.signal_id || `sig-${i}`;
        const name     = s.name || s.title || s.signal || s.description || id;
        const severity = (s.severity || s.level || s.priority || '').toLowerCase();
        const category = s.category || s.type || s.source || '';
        const toks     = tokens([name, category, s.description, s.tags, s.domain, s.threat, s.vector, s.asset, s.context].join(' '));
        const { cls, matchedArticles, matchedScenarios } = classifySignal(toks, articles, scenarios);
        return { id, name, severity, category, _cls: cls, _articles: matchedArticles, _scenarios: matchedScenarios };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:rsplay-toggle', handler);
    return () => window.removeEventListener('jarvis:rsplay-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true); setAssessment('');
    const counts = { PREPARED: 0, SCRIPTED: 0, DOCUMENTED: 0, BLIND: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const blindNames = rows.filter(r => r._cls === 'BLIND').slice(0, 5).map(r => r.name).join(', ');
    const critBlinds = rows.filter(r => r._cls === 'BLIND' && ['critical','high'].includes(r.severity)).length;
    const prompt = `Risk Signal Playbook Audit: ${rows.length} risk signals cross-referenced against ${articleCount} knowledge articles and ${scenarioCount} runnable scenarios. ${counts.PREPARED} signals are fully prepared (both documented AND have a runnable scenario playbook). ${counts.SCRIPTED} have a scenario only (script exists but no knowledge backing). ${counts.DOCUMENTED} have knowledge documentation only (no runnable scenario). ${counts.BLIND} signals are completely blind — no documentation and no scenario playbook.${critBlinds ? ` Of those, ${critBlinds} are critical or high severity.` : ''}${blindNames ? ` Blind signals include: ${blindNames}.` : ''} Assess the overall playbook coverage, identify the highest-priority blind risk signals that need immediate scenario development or documentation, and recommend a remediation sequence to eliminate the most dangerous coverage gaps.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: text.slice(0, 400) } }));
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    }
    setAssessing(false);
  }, [rows, assessing, articleCount, scenarioCount]);

  const counts = { PREPARED: 0, SCRIPTED: 0, DOCUMENTED: 0, BLIND: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.category, r.severity, r.id].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  const PANEL = {
    position: 'fixed', bottom: 50, left: '50%', transform: 'translateX(-50%)',
    width: 740, maxHeight: '78vh', zIndex: 149,
    background: 'rgba(8,12,20,0.97)', border: '1px solid #FF4444',
    borderRadius: 8, display: 'flex', flexDirection: 'column',
    fontFamily: 'monospace', color: '#ccc', overflow: 'hidden',
    boxShadow: '0 0 32px rgba(255,68,68,0.18)',
  };

  if (!open) {
    return (
      <>
        <style>{`@keyframes rsplay-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 8, left: 77480, zIndex: 149,
            background: 'rgba(255,68,68,0.10)', border: '1px solid #FF4444',
            color: '#FF4444', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
            borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
          }}
        >
          ◈ RSPLAY{counts.BLIND > 0 && (
            <span style={{
              marginLeft: 4, background: '#FF4444', color: '#000',
              borderRadius: 8, padding: '0 4px', fontSize: 8,
              animation: 'rsplay-pulse 1.4s infinite',
            }}>{counts.BLIND}</span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes rsplay-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      <div style={PANEL}>
        {/* Header */}
        <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#FF4444', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>◈ RISK PLAYBOOK AUDIT</span>
          <span style={{ fontSize: 10, color: '#888' }}>RiskSignal × Knowledge × Scenario</span>
          <span style={{ flex: 1 }} />
          {loading && <span style={{ color: '#888', fontSize: 10 }}>loading…</span>}
          {error && <span style={{ color: '#FF4444', fontSize: 10 }}>{error}</span>}
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #222' }}>
          {[
            { label: 'SIGNALS',    val: rows.length,          color: '#ccc' },
            { label: 'ARTICLES',   val: articleCount,          color: '#29E7FF' },
            { label: 'SCENARIOS',  val: scenarioCount,         color: '#A78BFA' },
            { label: 'PREPARED',   val: counts.PREPARED,       color: '#00E5A0' },
            { label: 'SCRIPTED',   val: counts.SCRIPTED,       color: '#A78BFA' },
            { label: 'DOCUMENTED', val: counts.DOCUMENTED,     color: '#29E7FF' },
            { label: 'BLIND',      val: counts.BLIND,          color: '#FF4444', pulse: counts.BLIND > 0 },
          ].map(({ label, val, color, pulse }) => (
            <div key={label} style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 4,
              padding: '5px 4px', textAlign: 'center',
              border: `1px solid ${color}22`,
            }}>
              <div style={{
                fontSize: 16, fontWeight: 700, color,
                animation: pulse ? 'rsplay-pulse 1.4s infinite' : 'none',
              }}>{val}</div>
              <div style={{ fontSize: 8, color: '#666', letterSpacing: 0.5 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter + search */}
        <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid #222', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLS_COLOR[t] || '#FF4444'}22` : 'none',
              border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#FF4444') : '#333'}`,
              color: tab === t ? (CLS_COLOR[t] || '#FF4444') : '#666',
              fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', fontFamily: 'monospace',
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search signals…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
              border: '1px solid #333', color: '#ccc', fontSize: 10,
              padding: '3px 8px', borderRadius: 3, outline: 'none', width: 160,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {visible.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: '#444', padding: 20, fontSize: 11 }}>No signals match current filter.</div>
          )}
          {visible.map(row => (
            <div key={row.id}>
              <div
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 14px', cursor: 'pointer',
                  borderBottom: '1px solid #181c24',
                  background: expanded === row.id ? 'rgba(255,255,255,0.04)' : 'none',
                }}
              >
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 3,
                  background: `${CLS_COLOR[row._cls]}22`,
                  border: `1px solid ${CLS_COLOR[row._cls]}`,
                  color: CLS_COLOR[row._cls], letterSpacing: 0.5, minWidth: 76, textAlign: 'center',
                }}>{row._cls}</span>
                {row.severity && (
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: `${SEV_COLOR[row.severity] || '#666'}22`,
                    border: `1px solid ${SEV_COLOR[row.severity] || '#666'}`,
                    color: SEV_COLOR[row.severity] || '#888',
                    minWidth: 52, textAlign: 'center',
                  }}>{row.severity.toUpperCase()}</span>
                )}
                <span style={{ flex: 1, fontSize: 11, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                {row.category && <span style={{ fontSize: 9, color: '#666' }}>{row.category}</span>}
                <span style={{ fontSize: 9, color: '#555' }}>
                  {row._articles.length}📄 {row._scenarios.length}▶
                </span>
                <span style={{ color: '#555', fontSize: 10 }}>{expanded === row.id ? '▲' : '▼'}</span>
              </div>
              {expanded === row.id && (
                <div style={{ padding: '8px 20px 10px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid #181c24' }}>
                  {row._articles.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: 0.5 }}>KNOWLEDGE ARTICLES ({row._articles.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row._articles.map((a, i) => (
                          <span key={i} style={{
                            fontSize: 9, padding: '2px 7px', borderRadius: 10,
                            background: 'rgba(41,231,255,0.10)', border: '1px solid #29E7FF33',
                            color: '#29E7FF',
                          }}>
                            {a.title || a.name || 'Untitled'}
                            {(a.category || a.type) && (
                              <span style={{ marginLeft: 4, color: '#29E7FF88' }}>{a.category || a.type}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {row._scenarios.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: 0.5 }}>SCENARIOS ({row._scenarios.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row._scenarios.map((sc, i) => (
                          <span key={i} style={{
                            fontSize: 9, padding: '2px 7px', borderRadius: 10,
                            background: 'rgba(167,139,250,0.10)', border: '1px solid #A78BFA33',
                            color: '#A78BFA',
                          }}>
                            {sc.title || sc.name || 'Untitled'}
                            {(sc.status || sc.type) && (
                              <span style={{ marginLeft: 4, color: '#A78BFA88' }}>{sc.status || sc.type}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {row._articles.length === 0 && row._scenarios.length === 0 && (
                    <div style={{ color: '#FF4444', fontSize: 10 }}>⚠ No knowledge articles or runnable scenarios found for this risk signal.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Assess footer */}
        <div style={{ borderTop: '1px solid #222', padding: '8px 14px' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,68,68,0.05)' : 'rgba(255,68,68,0.12)',
              border: '1px solid #FF4444', color: '#FF4444',
              fontSize: 10, padding: '4px 14px', borderRadius: 3, cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS PLAYBOOK COVERAGE'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(255,68,68,0.05)',
              border: '1px solid #FF444422', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>
    </>
  );
}
