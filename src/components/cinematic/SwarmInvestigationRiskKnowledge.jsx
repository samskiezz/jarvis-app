/**
 * SwarmInvestigationRiskKnowledge — F251
 *
 * Fetches /entities/SwarmJob + /v1/investigations +
 *         /entities/RiskSignal  + /knowledge/
 *
 * Keyword-matches each SwarmJob (name/description/tags)
 * against investigations, risk signals, and knowledge articles to classify:
 *
 *   CONVERGED  — matches all 3 sources
 *   TRACKED    — matches 2 of 3 sources
 *   PARTIAL    — matches exactly 1 source
 *   DORMANT    — no match to any source
 *               (swarm jobs with no investigation, no risk signal, no knowledge link)
 *
 * Toggle: ◈ SIRKMAP button (fixed, bottom strip) left:188360, zIndex:347
 * Stat tiles: swarm jobs / investigations / risk signals / knowledge /
 *             converged / tracked / partial / dormant
 * Red pulse on DORMANT count (ungrounded swarm jobs).
 * Expandable rows: matched investigations with status badge +
 *                  matched risk signals with level badge +
 *                  matched knowledge articles with category badge.
 * Filter tabs: ALL / CONVERGED / TRACKED / PARTIAL / DORMANT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "sirkmap"/"swarm investigation"/"swarm risk knowledge"/
 *        "dormant swarm"/"swarm convergence"/"swarm intelligence knowledge"/
 *        "swarm intel"/"swarm knowledge gap"
 * Event: jarvis:sirkmap-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

// API base resolved via apiBase()
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'CONVERGED', 'TRACKED', 'PARTIAL', 'DORMANT'];

const CLS_COLOR = {
  CONVERGED: '#22C55E',
  TRACKED:   '#38BDF8',
  PARTIAL:   '#F59E0B',
  DORMANT:   '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeSwarms(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.swarm_jobs))   return raw.swarm_jobs;
  if (Array.isArray(raw?.swarms))       return raw.swarms;
  if (Array.isArray(raw?.data))         return raw.data;
  if (Array.isArray(raw?.results))      return raw.results;
  return [];
}

function normalizeInvestigations(raw) {
  if (Array.isArray(raw))                    return raw;
  if (Array.isArray(raw?.investigations))    return raw.investigations;
  if (Array.isArray(raw?.data))              return raw.data;
  if (Array.isArray(raw?.results))           return raw.results;
  return [];
}

function normalizeRiskSignals(raw) {
  if (Array.isArray(raw))                return raw;
  if (Array.isArray(raw?.risk_signals))  return raw.risk_signals;
  if (Array.isArray(raw?.signals))       return raw.signals;
  if (Array.isArray(raw?.data))          return raw.data;
  if (Array.isArray(raw?.results))       return raw.results;
  return [];
}

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.articles))    return raw.articles;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function swarmText(s) {
  return [s.name, s.description, s.objective, s.tags, s.type, s.status]
    .filter(Boolean).join(' ');
}

function classifySwarm(swarmToks, investigations, riskSignals, knowledge) {
  const matchedInvs = investigations.filter(inv => {
    const t = [inv.title, inv.description, inv.summary, inv.type, inv.status].filter(Boolean).join(' ');
    return overlaps(swarmToks, t);
  });
  const matchedRisks = riskSignals.filter(rs => {
    const t = [rs.name, rs.description, rs.signal_type, rs.source, rs.level].filter(Boolean).join(' ');
    return overlaps(swarmToks, t);
  });
  const matchedKnowledge = knowledge.filter(k => {
    const t = [k.title, k.summary, k.content, k.category, k.tags].filter(Boolean).join(' ');
    return overlaps(swarmToks, t);
  });
  const hits = (matchedInvs.length > 0 ? 1 : 0)
             + (matchedRisks.length > 0 ? 1 : 0)
             + (matchedKnowledge.length > 0 ? 1 : 0);
  let cls = hits === 3 ? 'CONVERGED' : hits === 2 ? 'TRACKED' : hits === 1 ? 'PARTIAL' : 'DORMANT';
  return { cls, matchedInvs, matchedRisks, matchedKnowledge };
}

export function isSirkmapQuery(q) {
  const s = q.toLowerCase();
  return s.includes('sirkmap')
      || s.includes('swarm investigation')
      || s.includes('swarm risk knowledge')
      || s.includes('dormant swarm')
      || s.includes('swarm convergence')
      || s.includes('swarm intelligence knowledge')
      || s.includes('swarm intel')
      || s.includes('swarm knowledge gap');
}

export function buildSirkmapScript(rows) {
  const dormant = rows.filter(r => r.cls === 'DORMANT');
  const converged = rows.filter(r => r.cls === 'CONVERGED');
  return `Swarm Intelligence Threat Convergence (◈ SIRKMAP):
Total swarm jobs analysed: ${rows.length}.
Converged (all 3 sources): ${converged.length}.
Tracked (2 sources): ${rows.filter(r => r.cls === 'TRACKED').length}.
Partial (1 source): ${rows.filter(r => r.cls === 'PARTIAL').length}.
DORMANT (no grounding): ${dormant.length}${dormant.length ? ' — ' + dormant.slice(0, 3).map(r => r.name).join(', ') : ''}.
Identify root cause for each DORMANT swarm job. Propose investigation assignments and knowledge article linkages. Return findings, evidence, and next action.`;
}

export default function SwarmInvestigationRiskKnowledge() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [stats, setStats]       = useState({ swarms: 0, investigations: 0, risks: 0, knowledge: 0 });
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [sw, iv, rs, kn] = await Promise.all([
        fetch(`${apiBase()}/entities/SwarmJob`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${apiBase()}/v1/investigations`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${apiBase()}/entities/RiskSignal`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${apiBase()}/knowledge/`, { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const swarms       = normalizeSwarms(sw);
      const investigations = normalizeInvestigations(iv);
      const riskSignals  = normalizeRiskSignals(rs);
      const knowledge    = normalizeKnowledge(kn);

      const classified = swarms.map(s => {
        const toks = tokens(swarmText(s));
        const { cls, matchedInvs, matchedRisks, matchedKnowledge } = classifySwarm(toks, investigations, riskSignals, knowledge);
        return {
          id: s.id || s._id || s.name,
          name: s.name || s.objective || s.id || 'Unnamed',
          status: s.status || '',
          type: s.type || '',
          cls,
          matchedInvs,
          matchedRisks,
          matchedKnowledge,
        };
      });

      setRows(classified);
      setStats({ swarms: swarms.length, investigations: investigations.length, risks: riskSignals.length, knowledge: knowledge.length });
    } catch (e) {
      setError(e.message || 'Load error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:sirkmap-toggle', toggle);
    return () => window.removeEventListener('jarvis:sirkmap-toggle', toggle);
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
    const script = buildSirkmapScript(rows);
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
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));

  const counts = { CONVERGED: 0, TRACKED: 0, PARTIAL: 0, DORMANT: 0 };
  rows.forEach(r => counts[r.cls]++);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 188360, zIndex: 347,
          background: '#0a0a1a', border: '1px solid #334155',
          color: '#94a3b8', fontSize: 9, padding: '2px 6px',
          cursor: 'pointer', borderRadius: 3, whiteSpace: 'nowrap',
        }}
        title="Swarm × Investigation × RiskSignal × Knowledge Convergence"
      >
        ◈ SIRKMAP
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
          ◈ SIRKMAP — Swarm Intelligence Threat Convergence
        </span>
        <span style={{ fontSize: 10, color: '#64748b' }}>
          SwarmJob × Investigation × RiskSignal × Knowledge
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
          { label: 'SWARMS', val: stats.swarms, col: '#38BDF8' },
          { label: 'INVESTS', val: stats.investigations, col: '#818CF8' },
          { label: 'RISKS', val: stats.risks, col: '#F59E0B' },
          { label: 'KNOWLEDGE', val: stats.knowledge, col: '#34D399' },
          { label: 'CONVERGED', val: counts.CONVERGED, col: '#22C55E' },
          { label: 'TRACKED', val: counts.TRACKED, col: '#38BDF8' },
          { label: 'PARTIAL', val: counts.PARTIAL, col: '#F59E0B' },
          {
            label: 'DORMANT', val: counts.DORMANT, col: '#EF4444',
            pulse: counts.DORMANT > 0,
          },
        ].map(t => (
          <div key={t.label} style={{
            background: '#0f172a', border: `1px solid ${t.col}33`,
            borderRadius: 4, padding: '4px 10px', textAlign: 'center', minWidth: 70,
            boxShadow: t.pulse ? `0 0 8px ${t.col}88` : 'none',
            animation: t.pulse ? 'sirkmap-pulse 1.5s ease-in-out infinite' : 'none',
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
          placeholder="filter swarms…"
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
            {rows.length === 0 ? 'No swarm jobs returned.' : 'No items match current filter.'}
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
              <span style={{ fontSize: 9, color: CLS_COLOR[row.cls], fontWeight: 700, minWidth: 68 }}>
                {row.cls}
              </span>
              <span style={{ fontSize: 11, color: '#e2e8f0', flex: 1 }}>{row.name}</span>
              {row.type && (
                <span style={{ fontSize: 8, color: '#64748b', background: '#1e293b', padding: '1px 4px', borderRadius: 2 }}>
                  {row.type}
                </span>
              )}
              {row.status && (
                <span style={{ fontSize: 8, color: '#94a3b8', background: '#0f172a', border: '1px solid #1e293b', padding: '1px 4px', borderRadius: 2 }}>
                  {row.status}
                </span>
              )}
              <span style={{ fontSize: 9, color: '#475569' }}>{expanded[row.id] ? '▲' : '▼'}</span>
            </div>

            {expanded[row.id] && (
              <div style={{ paddingLeft: 12, paddingBottom: 6, fontSize: 10, color: '#64748b' }}>
                {/* Investigations */}
                {row.matchedInvs.length > 0 ? (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#818CF8', fontWeight: 700 }}>INVESTIGATIONS: </span>
                    {row.matchedInvs.slice(0, 4).map(inv => (
                      <span key={inv.id || inv.title} style={{ marginRight: 6 }}>
                        {inv.title || inv.name || inv.id}
                        <span style={{ fontSize: 8, color: '#475569', background: '#1e293b', borderRadius: 2, padding: '0 3px', marginLeft: 2 }}>
                          {inv.status || '–'}
                        </span>
                      </span>
                    ))}
                    {row.matchedInvs.length > 4 && <span style={{ color: '#475569' }}>+{row.matchedInvs.length - 4} more</span>}
                  </div>
                ) : (
                  <div style={{ color: '#374151', marginBottom: 4 }}>No investigation match.</div>
                )}

                {/* Risk signals */}
                {row.matchedRisks.length > 0 ? (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#F59E0B', fontWeight: 700 }}>RISK SIGNALS: </span>
                    {row.matchedRisks.slice(0, 4).map(rs => (
                      <span key={rs.id || rs.name} style={{ marginRight: 6 }}>
                        {rs.name || rs.id}
                        <span style={{ fontSize: 8, color: '#B45309', background: '#451a03', borderRadius: 2, padding: '0 3px', marginLeft: 2 }}>
                          {rs.level || rs.severity || '–'}
                        </span>
                      </span>
                    ))}
                    {row.matchedRisks.length > 4 && <span style={{ color: '#475569' }}>+{row.matchedRisks.length - 4} more</span>}
                  </div>
                ) : (
                  <div style={{ color: '#374151', marginBottom: 4 }}>No risk signal match.</div>
                )}

                {/* Knowledge articles */}
                {row.matchedKnowledge.length > 0 ? (
                  <div>
                    <span style={{ color: '#34D399', fontWeight: 700 }}>KNOWLEDGE: </span>
                    {row.matchedKnowledge.slice(0, 4).map(k => (
                      <span key={k.id || k.title} style={{ marginRight: 6 }}>
                        {k.title || k.name || k.id}
                        <span style={{ fontSize: 8, color: '#065F46', background: '#022c22', borderRadius: 2, padding: '0 3px', marginLeft: 2 }}>
                          {k.category || '–'}
                        </span>
                      </span>
                    ))}
                    {row.matchedKnowledge.length > 4 && <span style={{ color: '#475569' }}>+{row.matchedKnowledge.length - 4} more</span>}
                  </div>
                ) : (
                  <div style={{ color: '#374151' }}>No knowledge article match.</div>
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
        @keyframes sirkmap-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
