/**
 * RiskSignalReportKnowledgeDepth — F49
 *
 * Fetches /entities/RiskSignal + /v1/reports + /knowledge/
 * Cross-references each risk signal against reports AND knowledge items to classify:
 *   DOCUMENTED — matched both a report AND a knowledge item (full threat documentation)
 *   REPORTED   — matched a report only (logged, but no knowledge synthesis)
 *   KNOWN      — matched a knowledge item only (documented, but no formal report)
 *   DARK       — no match in either (undocumented threat signal — blind spot)
 *
 * Toggle: ◈ RRKDEP button (fixed, bottom strip) left:76360, zIndex:147
 * Stat tiles: signals / reports / knowledge / documented / reported / known / dark
 * Red pulse on DARK count.
 * Expandable rows: matched reports with date badge + matched knowledge items with category badge.
 * Filter tabs: ALL / DOCUMENTED / REPORTED / KNOWN / DARK + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "risk report knowledge"/"threat depth"/"rrkdep"/"dark threats"/"undocumented risk"/
 *        "threat intelligence depth"/"risk knowledge"/"knowledge gap risk"/"dark risk signals"
 * Event: jarvis:rrkdep-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'DOCUMENTED', 'REPORTED', 'KNOWN', 'DARK'];

const CLS_COLOR = {
  DOCUMENTED: '#00E5A0',
  REPORTED:   '#29E7FF',
  KNOWN:      '#A78BFA',
  DARK:       '#ef4444',
};

const PULSE_CSS = `@keyframes rrkdep-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function classifySignal(sigToks, reports, knowledge) {
  const matchedReports = reports.filter(r =>
    overlaps(sigToks, [r.title, r.name, r.type, r.category, r.tags, r.summary, r.description, r.topic].join(' '))
  );
  const matchedKnowledge = knowledge.filter(k =>
    overlaps(sigToks, [k.title, k.name, k.category, k.tags, k.topic, k.summary, k.description, k.content].join(' '))
  );
  const hasReport    = matchedReports.length > 0;
  const hasKnowledge = matchedKnowledge.length > 0;
  const cls = hasReport && hasKnowledge ? 'DOCUMENTED'
            : hasReport    ? 'REPORTED'
            : hasKnowledge ? 'KNOWN'
            : 'DARK';
  return { cls, matchedReports, matchedKnowledge };
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#FFB800', low: '#29E7FF', info: '#6A8BA0' };
function sevColor(sev) {
  return SEV_COLOR[(sev || '').toLowerCase()] || '#6A8BA0';
}

export function isRrkdepQuery(q) {
  return /\b(rrkdep|risk.report.know|threat.depth|dark.threat|undoc.risk|threat.intel.depth|risk.know|know.gap.risk|dark.risk|dark.signal|threat.blind|blind.spot.risk)\b/i.test(q);
}
export function buildRrkdepScript() {
  return 'Opening RiskSignal × Report × Knowledge Threat Intelligence Depth. Cross-referencing risk signals against reports and knowledge items to identify dark undocumented threats.';
}

export default function RiskSignalReportKnowledgeDepth() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [reportCount, setReportCount] = useState(0);
  const [knowledgeCount, setKnowledgeCount] = useState(0);
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
      const [sigRes, rptRes, knwRes] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`, { headers: h }),
        fetch(`${API}/v1/reports`,          { headers: h }),
        fetch(`${API}/knowledge/`,          { headers: h }),
      ]);
      const [sigRaw, rptRaw, knwRaw] = await Promise.all([
        sigRes.ok ? sigRes.json() : [],
        rptRes.ok ? rptRes.json() : [],
        knwRes.ok ? knwRes.json() : [],
      ]);

      const signals   = normalizeArray(sigRaw, ['items','data','results','signals','risk_signals','risks']);
      const reports   = normalizeArray(rptRaw, ['items','data','results','reports']);
      const knowledge = normalizeArray(knwRaw, ['items','data','results','entries','knowledge','docs','documents']);

      setReportCount(reports.length);
      setKnowledgeCount(knowledge.length);

      const built = signals.map((sig, i) => {
        const id       = sig.id || sig.signal_id || `sig-${i}`;
        const title    = sig.title || sig.name || sig.signal_name || sig.type || id;
        const severity = sig.severity || sig.level || sig.risk_level || sig.priority || '';
        const type     = sig.type || sig.category || sig.signal_type || '';
        const toks     = tokens([title, type, severity, sig.description, sig.tags, sig.summary, sig.source].join(' '));
        const { cls, matchedReports, matchedKnowledge } = classifySignal(toks, reports, knowledge);
        return { id, title, severity, type, _cls: cls, _reports: matchedReports, _knowledge: matchedKnowledge };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:rrkdep-toggle', handler);
    return () => window.removeEventListener('jarvis:rrkdep-toggle', handler);
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
    const counts = { DOCUMENTED: 0, REPORTED: 0, KNOWN: 0, DARK: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const darkTitles = rows.filter(r => r._cls === 'DARK').slice(0, 5).map(r => r.title).join(', ');
    const prompt = `RiskSignal × Report × Knowledge Threat Intelligence Depth assessment: ${rows.length} risk signals cross-referenced against ${reportCount} reports and ${knowledgeCount} knowledge items. ${counts.DOCUMENTED} signals are fully documented (both a report AND knowledge item). ${counts.REPORTED} are reported only (logged in a report but no knowledge synthesis exists). ${counts.KNOWN} are known only (knowledge exists but no formal report). ${counts.DARK} signals are completely dark — no documentation in either reports or knowledge base.${darkTitles ? ` Dark signals include: ${darkTitles}.` : ''} Assess the threat intelligence depth, identify which dark signals pose the greatest risk, and recommend priority documentation actions to reduce blind spots.`;
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
  }, [rows, assessing, reportCount, knowledgeCount]);

  const counts = { DOCUMENTED: 0, REPORTED: 0, KNOWN: 0, DARK: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.title, r.type, r.severity, r.id].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 76360, zIndex: 147,
          background: 'rgba(239,68,68,0.10)', border: '1px solid #ef4444',
          color: '#ef4444', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ RRKDEP
      </button>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 560, maxHeight: '82vh',
        background: 'rgba(5,15,25,0.97)', border: '1px solid #1a0a0a',
        borderRadius: 6, zIndex: 9148, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', color: '#e2eaf0', overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid #1a0a0a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(239,68,68,0.04)',
        }}>
          <span style={{ fontSize: 11, color: '#ef4444', letterSpacing: 2 }}>
            ◈ RISKSIGNAL × REPORT × KNOWLEDGE — RRKDEP
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#6A8BA0', cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'SIGNALS',    val: rows.length,          color: '#29E7FF' },
            { label: 'REPORTS',    val: reportCount,          color: '#29E7FF' },
            { label: 'KNOWLEDGE',  val: knowledgeCount,       color: '#29E7FF' },
            { label: 'DOCUMENTED', val: counts.DOCUMENTED,    color: CLS_COLOR.DOCUMENTED },
            { label: 'REPORTED',   val: counts.REPORTED,      color: CLS_COLOR.REPORTED },
            { label: 'KNOWN',      val: counts.KNOWN,         color: CLS_COLOR.KNOWN },
            { label: 'DARK',       val: counts.DARK,          color: CLS_COLOR.DARK, pulse: counts.DARK > 0 },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}33`,
              borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center',
              animation: t.pulse ? 'rrkdep-pulse 2s ease-in-out infinite' : 'none',
            }}>
              <div style={{ fontSize: 15, color: t.color, fontWeight: 700 }}>{t.val}</div>
              <div style={{ fontSize: 8, color: '#6A8BA0', letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ padding: '4px 14px', borderBottom: '1px solid #1a0a0a', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
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
            placeholder="search signals…"
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
          {visible.map((sig, i) => {
            const isExp = expanded === (sig.id || i);
            return (
              <div key={sig.id || i} style={{
                borderBottom: '1px solid #0e2233',
                background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent',
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (sig.id || i))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer' }}
                >
                  <span style={{
                    fontSize: 8, padding: '1px 6px', borderRadius: 10,
                    background: `${CLS_COLOR[sig._cls]}22`, color: CLS_COLOR[sig._cls],
                    border: `1px solid ${CLS_COLOR[sig._cls]}55`, letterSpacing: 1,
                    minWidth: 88, textAlign: 'center',
                  }}>{sig._cls}</span>
                  {sig.severity && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 3,
                      background: `${sevColor(sig.severity)}22`, color: sevColor(sig.severity),
                      border: `1px solid ${sevColor(sig.severity)}55`,
                    }}>{sig.severity.toUpperCase().slice(0, 8)}</span>
                  )}
                  {sig.type && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(255,255,255,0.05)', color: '#6A8BA0',
                      border: '1px solid #2a4a5a',
                    }}>{sig.type.toUpperCase().slice(0, 12)}</span>
                  )}
                  <span style={{ fontSize: 10, flex: 1, color: '#c8d8e8' }}>{sig.title}</span>
                  <span style={{ fontSize: 8, color: '#2a5a7a' }}>
                    {sig._reports.length}R {sig._knowledge.length}K
                  </span>
                  <span style={{ fontSize: 9, color: '#2a5a7a' }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 8px 28px' }}>
                    {sig._reports.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#29E7FF', letterSpacing: 1, marginBottom: 2 }}>MATCHED REPORTS</div>
                        {sig._reports.slice(0, 5).map((r, ri) => (
                          <div key={ri} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {r.title || r.name || `Report ${ri + 1}`}
                            {(r.date || r.created_at || r.published_at) && (
                              <span style={{ color: '#4a7a9a', marginLeft: 4, fontSize: 8 }}>
                                {String(r.date || r.created_at || r.published_at).slice(0, 10)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {sig._knowledge.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#A78BFA', letterSpacing: 1, marginBottom: 2 }}>MATCHED KNOWLEDGE</div>
                        {sig._knowledge.slice(0, 5).map((k, ki) => (
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
                    {sig._reports.length === 0 && sig._knowledge.length === 0 && (
                      <div style={{ color: '#ef4444', fontSize: 9 }}>⬡ No matched reports or knowledge — this risk signal is completely dark and undocumented.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '12px 14px', color: '#6A8BA0', fontSize: 10 }}>No signals match current filter.</div>
          )}
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid #1a0a0a' }}>
          <button
            onClick={assess} disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.13)',
              border: '1px solid #ef4444', color: '#ef4444',
              padding: '4px 14px', cursor: assessing ? 'default' : 'pointer',
              borderRadius: 3, fontSize: 10, letterSpacing: 1,
            }}
          >
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS THREAT DEPTH'}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(239,68,68,0.06)', borderLeft: '2px solid #ef4444', color: '#e2eaf0', fontSize: 10, lineHeight: 1.6 }}>
              {assessment}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
