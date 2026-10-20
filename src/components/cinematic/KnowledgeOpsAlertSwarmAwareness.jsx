/**
 * KnowledgeOpsAlertSwarmAwareness — F76
 *
 * Fetches /knowledge/ + /v1/ops/alerts + /entities/SwarmJob
 * Keyword-matches each knowledge article against ops alerts AND swarm jobs to classify:
 *   AWARE      — article matches an ops alert AND a swarm job (fully monitored + processing)
 *   ALERTED    — article matches an ops alert only (monitored, no active processing)
 *   PROCESSING — article matches a swarm job only (being processed, no active alert)
 *   BLIND      — no ops alert and no swarm job match (situational blind spot)
 *
 * Toggle: ◈ KOSAMAT button (fixed, bottom strip) left:90920, zIndex:173
 * Stat tiles: articles / alerts / jobs / aware / alerted / processing / blind
 * Amber pulse on BLIND count (situational blind spots).
 * Expandable rows: matched ops alerts with severity badge
 *                  + matched swarm jobs with status badge.
 * Filter tabs: ALL / AWARE / ALERTED / PROCESSING / BLIND + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "kosamat"/"knowledge ops awareness"/"aware knowledge"/"situational awareness"/
 *        "blind knowledge"/"knowledge alerts"/"knowledge swarm"/"ops knowledge coverage"/
 *        "knowledge monitoring"/"awareness audit"
 * Event: jarvis:kosamat-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'AWARE', 'ALERTED', 'PROCESSING', 'BLIND'];

const CLS_COLOR = {
  AWARE:      '#00FF88',
  ALERTED:    '#38BDF8',
  PROCESSING: '#FBBF24',
  BLIND:      '#FF9900',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 1);
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

export function isKosamatQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'kosamat', 'knowledge ops awareness', 'aware knowledge', 'situational awareness',
    'blind knowledge', 'knowledge alerts', 'knowledge swarm', 'ops knowledge coverage',
    'knowledge monitoring', 'awareness audit',
  ].some(k => s.includes(k));
}

export function buildKosamatScript() {
  return `Fetch /knowledge/, /v1/ops/alerts, and /entities/SwarmJob. ` +
    `Keyword-match each knowledge article against ops alerts and swarm jobs. ` +
    `Classify each article as AWARE/ALERTED/PROCESSING/BLIND. ` +
    `Report total BLIND (situational blind-spot) articles, identify which knowledge domains ` +
    `have no alert coverage and no swarm processing, and recommend which ops alerts or ` +
    `swarm jobs should be extended to eliminate monitoring gaps.`;
}

export default function KnowledgeOpsAlertSwarmAwareness() {
  const [open, setOpen]         = useState(false);
  const [articles, setArticles] = useState([]);
  const [alerts, setAlerts]     = useState([]);
  const [jobs, setJobs]         = useState([]);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef                = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [kRes, aRes, jRes] = await Promise.all([
        fetch(`${API}/knowledge/`, { headers: hdrs }).catch(() => null),
        fetch(`${API}/v1/ops/alerts`, { headers: hdrs }).catch(() => null),
        fetch(`${API}/entities/SwarmJob`, { headers: hdrs }).catch(() => null),
      ]);

      const kJson = kRes?.ok ? await kRes.json().catch(() => ({})) : {};
      const aJson = aRes?.ok ? await aRes.json().catch(() => ({})) : {};
      const jJson = jRes?.ok ? await jRes.json().catch(() => ({})) : {};

      const rawArticles = normalizeArray(kJson, ['articles', 'items', 'data', 'results', 'documents']);
      const rawAlerts   = normalizeArray(aJson, ['alerts', 'items', 'data', 'results']);
      const rawJobs     = normalizeArray(jJson, ['items', 'data', 'results', 'jobs']);

      setArticles(rawArticles);
      setAlerts(rawAlerts);
      setJobs(rawJobs);

      const built = rawArticles.map(article => {
        const artLabel = article.title || article.name || article.id || '';
        const artBody  = [artLabel, article.category, article.summary, article.content, article.tags]
          .filter(Boolean).join(' ');
        const artToks  = tokens(artBody);

        const matchedAlerts = rawAlerts.filter(a => {
          const aStr = [a.name, a.title, a.message, a.type, a.description].filter(Boolean).join(' ');
          return overlaps(artToks, aStr);
        });
        const matchedJobs = rawJobs.filter(j => {
          const jStr = [j.name, j.job_type, j.description, j.target, j.status].filter(Boolean).join(' ');
          return overlaps(artToks, jStr);
        });

        const hasAlert = matchedAlerts.length > 0;
        const hasJob   = matchedJobs.length > 0;
        const cls = hasAlert && hasJob ? 'AWARE'
                  : hasAlert           ? 'ALERTED'
                  : hasJob             ? 'PROCESSING'
                  :                      'BLIND';

        return { article, artLabel, cls, matchedAlerts, matchedJobs };
      });

      setRows(built);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:kosamat-toggle', handler);
    return () => window.removeEventListener('jarvis:kosamat-toggle', handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const res  = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ message: buildKosamatScript() }),
      });
      const j = res.ok ? await res.json().catch(() => ({})) : {};
      const reply = j.response || j.message || j.content || j.text || 'Assessment complete.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: reply } }));
    } catch {
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: 'Assessment unavailable.' } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const counts = {
    AWARE:      rows.filter(r => r.cls === 'AWARE').length,
    ALERTED:    rows.filter(r => r.cls === 'ALERTED').length,
    PROCESSING: rows.filter(r => r.cls === 'PROCESSING').length,
    BLIND:      rows.filter(r => r.cls === 'BLIND').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search && !r.artLabel.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Knowledge × Ops Alert × SwarmJob Situational Awareness Matrix"
        style={{
          position: 'fixed', bottom: 8, left: 90920, zIndex: 173,
          background: 'rgba(0,20,40,0.85)', border: '1px solid #FF9900',
          color: '#FF9900', fontFamily: 'monospace', fontSize: 10,
          padding: '3px 7px', cursor: 'pointer', borderRadius: 3,
          whiteSpace: 'nowrap',
        }}
      >
        ◈ KOSAMAT
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 173,
      background: 'rgba(0,6,18,0.97)', color: '#E2E8F0',
      fontFamily: 'monospace', display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #1e3a5f' }}>
        <span style={{ color: '#FF9900', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>◈ KOSAMAT</span>
        <span style={{ color: '#64748B', fontSize: 11 }}>Knowledge × Ops Alert × SwarmJob Situational Awareness Matrix</span>
        <div style={{ flex: 1 }} />
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? '#1e3a5f' : '#0f3460', border: '1px solid #38BDF8',
          color: '#38BDF8', fontFamily: 'monospace', fontSize: 10, padding: '3px 10px',
          cursor: assessing ? 'wait' : 'pointer', borderRadius: 3,
        }}>
          {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
        </button>
        <button onClick={fetchData} disabled={loading} style={{
          background: 'none', border: '1px solid #334155', color: '#94A3B8',
          fontFamily: 'monospace', fontSize: 10, padding: '3px 8px', cursor: 'pointer', borderRadius: 3,
        }}>⟳ REFRESH</button>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: '1px solid #334155', color: '#94A3B8',
          fontFamily: 'monospace', fontSize: 11, padding: '2px 8px', cursor: 'pointer', borderRadius: 3,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid #1e3a5f', flexWrap: 'wrap' }}>
        {[
          ['ARTICLES', articles.length, '#94A3B8'],
          ['ALERTS', alerts.length, '#38BDF8'],
          ['JOBS', jobs.length, '#FBBF24'],
          ['AWARE', counts.AWARE, CLS_COLOR.AWARE],
          ['ALERTED', counts.ALERTED, CLS_COLOR.ALERTED],
          ['PROCESSING', counts.PROCESSING, CLS_COLOR.PROCESSING],
          ['BLIND', counts.BLIND, CLS_COLOR.BLIND],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: 'rgba(0,20,40,0.7)', border: `1px solid ${color}33`,
            borderRadius: 4, padding: '5px 12px', textAlign: 'center', minWidth: 70,
          }}>
            <div style={{ color, fontSize: 16, fontWeight: 700,
              animation: label === 'BLIND' && val > 0 ? 'pulse-amber 1.5s ease-in-out infinite' : 'none' }}>
              {loading ? '…' : val}
            </div>
            <div style={{ color: '#64748B', fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', borderBottom: '1px solid #1e3a5f', alignItems: 'center', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? (CLS_COLOR[t] || '#1e3a5f') : 'rgba(0,20,40,0.7)',
            border: `1px solid ${CLS_COLOR[t] || '#334155'}`,
            color: tab === t ? '#000' : (CLS_COLOR[t] || '#94A3B8'),
            fontFamily: 'monospace', fontSize: 10, padding: '3px 10px',
            cursor: 'pointer', borderRadius: 3, fontWeight: tab === t ? 700 : 400,
          }}>
            {t}{t !== 'ALL' ? ` (${counts[t] ?? ''})` : ` (${rows.length})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search articles…"
          style={{
            background: 'rgba(0,20,40,0.8)', border: '1px solid #334155', color: '#E2E8F0',
            fontFamily: 'monospace', fontSize: 10, padding: '3px 8px', borderRadius: 3,
            outline: 'none', marginLeft: 8, width: 180,
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {error && (
          <div style={{ color: '#FF4444', fontSize: 11, marginBottom: 8 }}>Error: {error}</div>
        )}
        {loading && rows.length === 0 && (
          <div style={{ color: '#64748B', fontSize: 11 }}>Loading situational awareness data…</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: '#64748B', fontSize: 11 }}>No articles match current filter.</div>
        )}
        {visible.map((r, i) => {
          const key = r.artLabel + i;
          const isExp = !!expanded[key];
          return (
            <div key={key} style={{ marginBottom: 4 }}>
              <div
                onClick={() => toggleRow(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  background: 'rgba(0,20,40,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`,
                  borderRadius: 4, padding: '5px 10px',
                  borderLeft: `3px solid ${CLS_COLOR[r.cls]}`,
                }}
              >
                <span style={{ color: CLS_COLOR[r.cls], fontSize: 9, fontWeight: 700, minWidth: 72 }}>{r.cls}</span>
                <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1 }}>{r.artLabel || '(unnamed)'}</span>
                {r.article.category && (
                  <span style={{ color: '#64748B', fontSize: 9, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 2 }}>
                    {r.article.category}
                  </span>
                )}
                <span style={{ color: '#38BDF8', fontSize: 9 }}>{r.matchedAlerts.length} alerts</span>
                <span style={{ color: '#FBBF24', fontSize: 9 }}>{r.matchedJobs.length} jobs</span>
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ background: 'rgba(0,10,30,0.7)', border: '1px solid #1e3a5f', borderRadius: '0 0 4px 4px', padding: '8px 12px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: '#38BDF8', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED OPS ALERTS</div>
                    {r.matchedAlerts.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>None</div>
                      : r.matchedAlerts.map((a, ai) => (
                        <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: '#E2E8F0', fontSize: 10 }}>{a.title || a.name || a.message || a.id || '(alert)'}</span>
                          {(a.severity || a.level) && (
                            <span style={{
                              fontSize: 9, padding: '1px 5px', borderRadius: 2,
                              background: (a.severity || a.level) === 'critical' ? '#FF444433' : '#FBBF2433',
                              color: (a.severity || a.level) === 'critical' ? '#FF4444' : '#FBBF24',
                            }}>
                              {(a.severity || a.level).toUpperCase()}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: '#FBBF24', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED SWARM JOBS</div>
                    {r.matchedJobs.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>None</div>
                      : r.matchedJobs.map((j, ji) => (
                        <div key={ji} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: '#E2E8F0', fontSize: 10 }}>{j.name || j.job_type || j.id || '(job)'}</span>
                          {j.status && (
                            <span style={{
                              fontSize: 9, padding: '1px 5px', borderRadius: 2,
                              background: j.status === 'running' ? '#00FF8833' : '#33415533',
                              color: j.status === 'running' ? '#00FF88' : '#94A3B8',
                            }}>
                              {j.status.toUpperCase()}
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
          50% { opacity:0.4; }
        }
      `}</style>
    </div>
  );
}
