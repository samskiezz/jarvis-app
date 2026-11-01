/**
 * KnowledgeRiskOpsSwarmCoverageMap — F254
 *
 * Fetches /knowledge/         (articles)
 *         /entities/RiskSignal
 *         /v1/ops/alerts
 *         /entities/SwarmJob
 *
 * Keyword-matches each knowledge article against risk signals,
 * ops alerts, and swarm jobs to classify:
 *
 *   COVERED    — matches all 3 sources
 *   ALERTED    — matches 2 of 3 sources
 *   PROCESSING — matches exactly 1 source
 *   DARK       — no match to any source
 *               (intelligence blind spots — articles with no risk signal,
 *                no ops alert, no swarm processing)
 *
 * Toggle: ◈ KRSMAP button (fixed, bottom strip) left:190040, zIndex:350
 * Stat tiles: articles / risk signals / ops alerts / swarm jobs /
 *             covered / alerted / processing / dark
 * Red pulse on DARK count (intelligence dead-ends).
 * Expandable rows: matched risk signals with severity badge +
 *                  matched ops alerts with severity badge +
 *                  matched swarm jobs with status badge.
 * Filter tabs: ALL / COVERED / ALERTED / PROCESSING / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "krsmap"/"knowledge risk ops"/"knowledge swarm coverage"/
 *        "knowledge response coverage"/"dark knowledge"/"intelligence blind spot"/
 *        "knowledge ops swarm"/"knowledge coverage map"
 * Event: jarvis:krsmap-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

// API base resolved via apiBase()
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'ALERTED', 'PROCESSING', 'DARK'];

const CLS_COLOR = {
  COVERED:    '#22C55E',
  ALERTED:    '#F59E0B',
  PROCESSING: '#38BDF8',
  DARK:       '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.articles))    return raw.articles;
  if (Array.isArray(raw?.knowledge))   return raw.knowledge;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function normalizeRisks(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.risk_signals)) return raw.risk_signals;
  if (Array.isArray(raw?.signals))      return raw.signals;
  if (Array.isArray(raw?.data))         return raw.data;
  if (Array.isArray(raw?.results))      return raw.results;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))         return raw;
  if (Array.isArray(raw?.alerts)) return raw.alerts;
  if (Array.isArray(raw?.data))   return raw.data;
  if (Array.isArray(raw?.results))return raw.results;
  return [];
}

function normalizeSwarm(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.jobs))     return raw.jobs;
  if (Array.isArray(raw?.swarm))    return raw.swarm;
  if (Array.isArray(raw?.data))     return raw.data;
  if (Array.isArray(raw?.results))  return raw.results;
  return [];
}

function articleText(a) {
  return [a.title, a.name, a.content, a.summary, a.category, a.tags,
          a.topic, a.description]
    .filter(Boolean).join(' ');
}

function classifyArticle(artToks, risks, alerts, swarmJobs) {
  const matchedRisks = risks.filter(r => {
    const t = [r.name, r.title, r.description, r.type, r.category, r.signal_type, r.severity].filter(Boolean).join(' ');
    return overlaps(artToks, t);
  });
  const matchedAlerts = alerts.filter(a => {
    const t = [a.title, a.message, a.description, a.type, a.severity, a.source].filter(Boolean).join(' ');
    return overlaps(artToks, t);
  });
  const matchedSwarm = swarmJobs.filter(j => {
    const t = [j.name, j.title, j.description, j.type, j.status, j.task_type, j.job_type].filter(Boolean).join(' ');
    return overlaps(artToks, t);
  });
  const hits = (matchedRisks.length > 0 ? 1 : 0)
             + (matchedAlerts.length > 0 ? 1 : 0)
             + (matchedSwarm.length > 0 ? 1 : 0);
  const cls = hits === 3 ? 'COVERED'
            : hits === 2 ? 'ALERTED'
            : hits === 1 ? 'PROCESSING'
            : 'DARK';
  return { cls, matchedRisks, matchedAlerts, matchedSwarm };
}

export function isKrsmapQuery(q) {
  const s = q.toLowerCase();
  return s.includes('krsmap')
      || s.includes('knowledge risk ops')
      || s.includes('knowledge swarm coverage')
      || s.includes('knowledge response coverage')
      || s.includes('dark knowledge')
      || s.includes('intelligence blind spot')
      || s.includes('knowledge ops swarm')
      || s.includes('knowledge coverage map');
}

export function buildKrsmapScript(rows) {
  const dark     = rows.filter(r => r.cls === 'DARK');
  const covered  = rows.filter(r => r.cls === 'COVERED');
  return `Knowledge × RiskSignal × Ops Alert × SwarmJob Intelligence Response Coverage Map (◈ KRSMAP):
Total knowledge articles analysed: ${rows.length}.
Covered (all 3 sources): ${covered.length}.
Alerted (2 sources): ${rows.filter(r => r.cls === 'ALERTED').length}.
Processing (1 source): ${rows.filter(r => r.cls === 'PROCESSING').length}.
DARK (no grounding — intelligence blind spots): ${dark.length}${dark.length ? ' — ' + dark.slice(0, 3).map(r => r.label).join(', ') : ''}.
Identify root cause for each DARK article. Propose risk-signal linkages, ops alert monitoring, and swarm processing assignments. Return findings, evidence, and next action.`;
}

export default function KnowledgeRiskOpsSwarmCoverageMap() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [stats, setStats]           = useState({ articles: 0, risks: 0, alerts: 0, swarm: 0 });
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [kn, ri, al, sw] = await Promise.all([
        fetch(`${apiBase()}/knowledge/`,           { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${apiBase()}/entities/RiskSignal`,  { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${apiBase()}/v1/ops/alerts`,        { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${apiBase()}/entities/SwarmJob`,    { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const articles   = normalizeKnowledge(kn);
      const risks      = normalizeRisks(ri);
      const alerts     = normalizeAlerts(al);
      const swarmJobs  = normalizeSwarm(sw);

      const classified = articles.map(a => {
        const toks = tokens(articleText(a));
        const { cls, matchedRisks, matchedAlerts, matchedSwarm } = classifyArticle(toks, risks, alerts, swarmJobs);
        return {
          id:       a.id || a._id || a.title || a.name,
          label:    a.title || a.name || a.id || 'Untitled',
          category: a.category || a.topic || '',
          cls,
          matchedRisks,
          matchedAlerts,
          matchedSwarm,
        };
      });

      setRows(classified);
      setStats({ articles: articles.length, risks: risks.length, alerts: alerts.length, swarm: swarmJobs.length });
    } catch (e) {
      setError(e.message || 'Load error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:krsmap-toggle', toggle);
    return () => window.removeEventListener('jarvis:krsmap-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const assess = async () => {
    setAssessing(true);
    setAssessText('');
    const script = buildKrsmapScript(rows);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.answer || JSON.stringify(d);
      setAssessText(text);
      try {
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch (_) {}
    } catch (e) {
      setAssessText('Assessment error: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  const visible = rows
    .filter(r => tab === 'ALL' || r.cls === tab)
    .filter(r => !search || r.label.toLowerCase().includes(search.toLowerCase()));

  const counts = { COVERED: 0, ALERTED: 0, PROCESSING: 0, DARK: 0 };
  rows.forEach(r => counts[r.cls]++);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 190040, zIndex: 350,
          background: '#0a0a1a', border: '1px solid #334155',
          color: '#94a3b8', fontSize: 9, padding: '2px 6px',
          cursor: 'pointer', borderRadius: 3, whiteSpace: 'nowrap',
        }}
        title="Knowledge × RiskSignal × Ops Alert × SwarmJob Intelligence Response Coverage Map"
      >
        ◈ KRSMAP
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9200,
      background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #1e293b' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#38BDF8', letterSpacing: 1 }}>
          ◈ KRSMAP — Intelligence Response Coverage Map
        </span>
        <span style={{ fontSize: 10, color: '#64748b' }}>
          Knowledge × RiskSignal × Ops Alert × SwarmJob
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={loading}
            style={{ fontSize: 10, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '2px 8px', cursor: 'pointer', borderRadius: 3 }}>
            {loading ? '...' : '↻'}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ fontSize: 10, background: '#1e293b', border: '1px solid #334155', color: '#ef4444', padding: '2px 8px', cursor: 'pointer', borderRadius: 3 }}>
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexWrap: 'wrap' }}>
        {[
          { label: 'ARTICLES',   val: stats.articles, col: '#38BDF8' },
          { label: 'RISKS',      val: stats.risks,    col: '#EF4444' },
          { label: 'ALERTS',     val: stats.alerts,   col: '#F59E0B' },
          { label: 'SWARM',      val: stats.swarm,    col: '#818CF8' },
          { label: 'COVERED',    val: counts.COVERED,    col: '#22C55E' },
          { label: 'ALERTED',    val: counts.ALERTED,    col: '#F59E0B' },
          { label: 'PROCESSING', val: counts.PROCESSING, col: '#38BDF8' },
          {
            label: 'DARK', val: counts.DARK, col: '#EF4444',
            pulse: counts.DARK > 0,
          },
        ].map(t => (
          <div key={t.label} style={{
            background: '#0f172a', border: `1px solid ${t.col}33`,
            borderRadius: 4, padding: '4px 10px', textAlign: 'center', minWidth: 70,
            boxShadow: t.pulse ? `0 0 8px ${t.col}88` : 'none',
            animation: t.pulse ? 'krsmap-pulse 1.5s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.col }}>{t.val}</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 16px', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              fontSize: 9, padding: '2px 8px', cursor: 'pointer', borderRadius: 3,
              background: tab === t ? '#1e3a5f' : '#0f172a',
              border: `1px solid ${tab === t ? '#38BDF8' : '#1e293b'}`,
              color: tab === t ? '#38BDF8' : '#64748b',
            }}>
            {t}{t !== 'ALL' ? ` (${counts[t] ?? 0})` : ` (${rows.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="filter articles…"
          style={{
            marginLeft: 'auto', fontSize: 10, background: '#0f172a',
            border: '1px solid #1e293b', color: '#94a3b8',
            padding: '2px 8px', borderRadius: 3, width: 160,
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 10, color: '#ef4444', padding: '2px 16px' }}>{error}</div>
      )}

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ fontSize: 11, color: '#475569', padding: '20px 0', textAlign: 'center' }}>
            {rows.length === 0 ? 'No knowledge articles returned.' : 'No items match current filter.'}
          </div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ borderBottom: '1px solid #0f172a', marginBottom: 2 }}>
            <div
              onClick={() => toggleRow(row.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 0', cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 9, color: CLS_COLOR[row.cls], fontWeight: 700, minWidth: 90 }}>
                {row.cls}
              </span>
              <span style={{ fontSize: 11, color: '#e2e8f0', flex: 1 }}>{row.label}</span>
              {row.category && (
                <span style={{ fontSize: 8, color: '#64748b', background: '#1e293b', padding: '1px 4px', borderRadius: 2 }}>
                  {row.category}
                </span>
              )}
              <span style={{ fontSize: 9, color: '#475569' }}>{expanded[row.id] ? '▲' : '▼'}</span>
            </div>

            {expanded[row.id] && (
              <div style={{ paddingLeft: 12, paddingBottom: 6, fontSize: 10, color: '#64748b' }}>
                {/* Risk signals */}
                {row.matchedRisks.length > 0 ? (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#EF4444', fontWeight: 700 }}>RISK SIGNALS: </span>
                    {row.matchedRisks.slice(0, 4).map(r => (
                      <span key={r.id || r.name} style={{ marginRight: 6 }}>
                        {r.name || r.title || r.id}
                        <span style={{ fontSize: 8, color: '#991B1B', background: '#450a0a', borderRadius: 2, padding: '0 3px', marginLeft: 2 }}>
                          {r.severity || r.level || '–'}
                        </span>
                      </span>
                    ))}
                    {row.matchedRisks.length > 4 && <span style={{ color: '#475569' }}>+{row.matchedRisks.length - 4} more</span>}
                  </div>
                ) : (
                  <div style={{ color: '#374151', marginBottom: 4 }}>No risk signal match.</div>
                )}

                {/* Ops alerts */}
                {row.matchedAlerts.length > 0 ? (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#F59E0B', fontWeight: 700 }}>OPS ALERTS: </span>
                    {row.matchedAlerts.slice(0, 4).map(a => (
                      <span key={a.id || a.title} style={{ marginRight: 6 }}>
                        {a.title || a.message || a.id}
                        <span style={{ fontSize: 8, color: '#92400E', background: '#451a03', borderRadius: 2, padding: '0 3px', marginLeft: 2 }}>
                          {a.severity || a.level || '–'}
                        </span>
                      </span>
                    ))}
                    {row.matchedAlerts.length > 4 && <span style={{ color: '#475569' }}>+{row.matchedAlerts.length - 4} more</span>}
                  </div>
                ) : (
                  <div style={{ color: '#374151', marginBottom: 4 }}>No ops alert match.</div>
                )}

                {/* Swarm jobs */}
                {row.matchedSwarm.length > 0 ? (
                  <div>
                    <span style={{ color: '#818CF8', fontWeight: 700 }}>SWARM JOBS: </span>
                    {row.matchedSwarm.slice(0, 4).map(j => (
                      <span key={j.id || j.name} style={{ marginRight: 6 }}>
                        {j.name || j.title || j.id}
                        <span style={{ fontSize: 8, color: '#3730A3', background: '#1e1b4b', borderRadius: 2, padding: '0 3px', marginLeft: 2 }}>
                          {j.status || j.state || '–'}
                        </span>
                      </span>
                    ))}
                    {row.matchedSwarm.length > 4 && <span style={{ color: '#475569' }}>+{row.matchedSwarm.length - 4} more</span>}
                  </div>
                ) : (
                  <div style={{ color: '#374151' }}>No swarm job match.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Assess */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid #1e293b' }}>
        <button
          onClick={assess}
          disabled={assessing || rows.length === 0}
          style={{
            fontSize: 10, padding: '4px 14px', cursor: 'pointer',
            background: '#0c4a6e', border: '1px solid #38BDF8',
            color: '#38BDF8', borderRadius: 3, fontWeight: 700,
          }}
        >
          {assessing ? 'Assessing…' : '⟐ ASSESS'}
        </button>
        {assessText && (
          <div style={{
            marginTop: 6, fontSize: 10, color: '#94a3b8',
            background: '#0f172a', border: '1px solid #1e293b',
            borderRadius: 3, padding: 8, maxHeight: 120, overflowY: 'auto',
          }}>
            {assessText}
          </div>
        )}
      </div>

      <style>{`
        @keyframes krsmap-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
