/**
 * ReportKnowledgeScenarioSynthesis — F48
 *
 * Fetches /v1/reports + /knowledge/ + /v1/scenario/list
 * Cross-references each report against knowledge items AND scenarios to classify:
 *   SYNTHESIZED — matched both a knowledge item AND a scenario (full intelligence synthesis)
 *   SCRIPTED    — matched a scenario only (executable plan but no knowledge backing)
 *   PUBLISHED   — matched a knowledge item only (knowledge exists, no scenario linkage)
 *   RAW         — no match in either (isolated report, no synthesis path)
 *
 * Toggle: ◈ RKSSYN button (fixed, bottom strip) left:75800, zIndex:146
 * Stat tiles: reports / knowledge / scenarios / synthesized / scripted / published / raw
 * Amber pulse on RAW count.
 * Expandable rows: matched knowledge items with category badge + matched scenarios with status badge.
 * Filter tabs: ALL / SYNTHESIZED / SCRIPTED / PUBLISHED / RAW + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "report synthesis"/"knowledge scenario"/"rkssyn"/"intelligence synthesis"/
 *        "report coverage"/"synthesis audit"/"raw reports"/"report scenario"/"report knowledge"
 * Event: jarvis:rkssyn-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'SYNTHESIZED', 'SCRIPTED', 'PUBLISHED', 'RAW'];

const CLS_COLOR = {
  SYNTHESIZED: '#00E5A0',
  SCRIPTED:    '#29E7FF',
  PUBLISHED:   '#A78BFA',
  RAW:         '#FFB800',
};

const PULSE_CSS = `@keyframes rkssyn-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function classifyReport(rptToks, knowledge, scenarios) {
  const matchedKnowledge = knowledge.filter(k =>
    overlaps(rptToks, [k.title, k.name, k.category, k.tags, k.topic, k.summary, k.description, k.content].join(' '))
  );
  const matchedScenarios = scenarios.filter(s =>
    overlaps(rptToks, [s.name, s.title, s.description, s.type, s.category, s.tags, s.summary, s.objective].join(' '))
  );
  const hasKnowledge = matchedKnowledge.length > 0;
  const hasScenario  = matchedScenarios.length > 0;
  const cls = hasKnowledge && hasScenario ? 'SYNTHESIZED'
            : hasScenario  ? 'SCRIPTED'
            : hasKnowledge ? 'PUBLISHED'
            : 'RAW';
  return { cls, matchedKnowledge, matchedScenarios };
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

export function isRkssynQuery(q) {
  return /\b(report.synth|knowledge.scenario|rkssyn|intelligence.synth|report.coverage|synthesis.audit|raw.report|report.scenario|report.knowledge|knowledge.gap|scenario.knowledge|synthesis.gap|intel.synth|knowledge.synthesis)\b/i.test(q);
}
export function buildRkssynScript() {
  return 'Opening Report × Knowledge × Scenario Intelligence Synthesis. Cross-referencing reports against knowledge items and scenarios to identify raw unanchored reports and synthesis gaps.';
}

export default function ReportKnowledgeScenarioSynthesis() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const [scenarioCount, setScenarioCount]   = useState(0);
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
      const [rptRes, knwRes, scnRes] = await Promise.all([
        fetch(`${API}/v1/reports`,       { headers: h }),
        fetch(`${API}/knowledge/`,       { headers: h }),
        fetch(`${API}/v1/scenario/list`, { headers: h }),
      ]);
      const [rptRaw, knwRaw, scnRaw] = await Promise.all([
        rptRes.ok ? rptRes.json() : [],
        knwRes.ok ? knwRes.json() : [],
        scnRes.ok ? scnRes.json() : [],
      ]);

      const reports   = normalizeArray(rptRaw, ['items','data','results','reports']);
      const knowledge = normalizeArray(knwRaw, ['items','data','results','entries','knowledge','docs','documents']);
      const scenarios = normalizeArray(scnRaw, ['items','data','results','scenarios']);

      setKnowledgeCount(knowledge.length);
      setScenarioCount(scenarios.length);

      const built = reports.map((rpt, i) => {
        const id    = rpt.id || rpt.report_id || `rpt-${i}`;
        const title = rpt.title || rpt.name || rpt.report_name || id;
        const date  = rpt.date || rpt.created_at || rpt.timestamp || rpt.published_at || '';
        const type  = rpt.type || rpt.category || rpt.report_type || '';
        const toks  = tokens([title, type, rpt.summary, rpt.description, rpt.tags, rpt.topic].join(' '));
        const { cls, matchedKnowledge, matchedScenarios } = classifyReport(toks, knowledge, scenarios);
        return { id, title, date, type, _cls: cls, _knowledge: matchedKnowledge, _scenarios: matchedScenarios };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:rkssyn-toggle', handler);
    return () => window.removeEventListener('jarvis:rkssyn-toggle', handler);
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
    const counts = { SYNTHESIZED: 0, SCRIPTED: 0, PUBLISHED: 0, RAW: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const rawTitles = rows.filter(r => r._cls === 'RAW').slice(0, 5).map(r => r.title).join(', ');
    const prompt = `Report × Knowledge × Scenario Intelligence Synthesis assessment: ${rows.length} reports cross-referenced against ${knowledgeCount} knowledge items and ${scenarioCount} scenarios. ${counts.SYNTHESIZED} reports are fully synthesized (knowledge + scenario). ${counts.SCRIPTED} are scripted only (scenario linked, no knowledge). ${counts.PUBLISHED} are published only (knowledge exists, no scenario). ${counts.RAW} reports are raw — no knowledge or scenario linkage. ${rawTitles ? `Raw reports: ${rawTitles}.` : ''} Assess the intelligence synthesis coverage, identify the most critical raw reports, and recommend which knowledge items or scenarios should be created to close the synthesis gap.`;
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
  }, [rows, assessing, knowledgeCount, scenarioCount]);

  const counts = { SYNTHESIZED: 0, SCRIPTED: 0, PUBLISHED: 0, RAW: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.title, r.type, r.id].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 75800, zIndex: 146,
          background: 'rgba(255,184,0,0.10)', border: '1px solid #FFB800',
          color: '#FFB800', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ RKSSYN
      </button>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 560, maxHeight: '82vh',
        background: 'rgba(5,15,25,0.97)', border: '1px solid #1a1a0a',
        borderRadius: 6, zIndex: 9147, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', color: '#e2eaf0', overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid #1a1a0a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(255,184,0,0.04)',
        }}>
          <span style={{ fontSize: 11, color: '#FFB800', letterSpacing: 2 }}>
            ◈ REPORT × KNOWLEDGE × SCENARIO — RKSSYN
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#6A8BA0', cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'REPORTS',     val: rows.length,          color: '#29E7FF' },
            { label: 'KNOWLEDGE',   val: knowledgeCount,       color: '#29E7FF' },
            { label: 'SCENARIOS',   val: scenarioCount,        color: '#29E7FF' },
            { label: 'SYNTHESIZED', val: counts.SYNTHESIZED,   color: CLS_COLOR.SYNTHESIZED },
            { label: 'SCRIPTED',    val: counts.SCRIPTED,      color: CLS_COLOR.SCRIPTED },
            { label: 'PUBLISHED',   val: counts.PUBLISHED,     color: CLS_COLOR.PUBLISHED },
            { label: 'RAW',         val: counts.RAW,           color: CLS_COLOR.RAW, pulse: counts.RAW > 0 },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}33`,
              borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center',
              animation: t.pulse ? 'rkssyn-pulse 2s ease-in-out infinite' : 'none',
            }}>
              <div style={{ fontSize: 15, color: t.color, fontWeight: 700 }}>{t.val}</div>
              <div style={{ fontSize: 8, color: '#6A8BA0', letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ padding: '4px 14px', borderBottom: '1px solid #1a1a0a', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLS_COLOR[t] || '#29E7FF'}22` : 'transparent',
              border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#2a4a5a'}`,
              color: tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#6A8BA0',
              padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 9, letterSpacing: 1,
            }}>{t}{t !== 'ALL' ? ` (${counts[t] ?? 0})` : ''}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search reports…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #2a4a5a',
              color: '#e2eaf0', padding: '2px 8px', borderRadius: 3, fontSize: 9, width: 140,
            }}
          />
        </div>

        {/* Status */}
        {loading && <div style={{ padding: '4px 14px', fontSize: 9, color: '#6A8BA0' }}>⟳ loading…</div>}
        {error   && <div style={{ padding: '4px 14px', fontSize: 9, color: '#ef4444' }}>⚠ {error}</div>}

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {visible.map((rpt, i) => {
            const isExp = expanded === (rpt.id || i);
            return (
              <div key={rpt.id || i} style={{
                borderBottom: '1px solid #0e2233',
                background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent',
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (rpt.id || i))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer' }}
                >
                  <span style={{
                    fontSize: 8, padding: '1px 6px', borderRadius: 10,
                    background: `${CLS_COLOR[rpt._cls]}22`, color: CLS_COLOR[rpt._cls],
                    border: `1px solid ${CLS_COLOR[rpt._cls]}55`, letterSpacing: 1,
                    minWidth: 88, textAlign: 'center',
                  }}>{rpt._cls}</span>
                  {rpt.type && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(255,255,255,0.05)', color: '#6A8BA0',
                      border: '1px solid #2a4a5a',
                    }}>{rpt.type.toUpperCase().slice(0, 12)}</span>
                  )}
                  <span style={{ fontSize: 10, flex: 1, color: '#c8d8e8' }}>{rpt.title}</span>
                  {rpt.date && (
                    <span style={{ fontSize: 8, color: '#4a7a9a' }}>
                      {String(rpt.date).slice(0, 10)}
                    </span>
                  )}
                  <span style={{ fontSize: 8, color: '#2a5a7a' }}>
                    {rpt._knowledge.length}K {rpt._scenarios.length}S
                  </span>
                  <span style={{ fontSize: 9, color: '#2a5a7a' }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 8px 28px' }}>
                    {rpt._knowledge.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#A78BFA', letterSpacing: 1, marginBottom: 2 }}>MATCHED KNOWLEDGE</div>
                        {rpt._knowledge.slice(0, 5).map((k, ki) => (
                          <div key={ki} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {k.title || k.name || `Knowledge ${ki + 1}`}
                            {(k.category || k.topic) && (
                              <span style={{ color: '#4a7a9a', marginLeft: 4, fontSize: 8 }}>
                                {[k.category, k.topic].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {rpt._scenarios.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#29E7FF', letterSpacing: 1, marginBottom: 2 }}>MATCHED SCENARIOS</div>
                        {rpt._scenarios.slice(0, 5).map((s, si) => (
                          <div key={si} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {s.name || s.title || `Scenario ${si + 1}`}
                            {(s.status || s.type) && (
                              <span style={{ color: '#4a7a9a', marginLeft: 4, fontSize: 8 }}>
                                {[s.status, s.type].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {rpt._knowledge.length === 0 && rpt._scenarios.length === 0 && (
                      <div style={{ color: '#6A8BA0', fontSize: 9 }}>⬡ No matched knowledge items or scenarios — report is raw and unanchored.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '12px 14px', color: '#6A8BA0', fontSize: 10 }}>No reports match current filter.</div>
          )}
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid #1a1a0a' }}>
          <button
            onClick={assess} disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,184,0,0.08)' : 'rgba(255,184,0,0.13)',
              border: '1px solid #FFB800', color: '#FFB800',
              padding: '4px 14px', cursor: assessing ? 'default' : 'pointer',
              borderRadius: 3, fontSize: 10, letterSpacing: 1,
            }}
          >
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS SYNTHESIS'}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(255,184,0,0.06)', borderLeft: '2px solid #FFB800', color: '#e2eaf0', fontSize: 10, lineHeight: 1.6 }}>
              {assessment}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
