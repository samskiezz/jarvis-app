/**
 * OpsAlertIntelProfileGraphThreatNetwork — F75
 *
 * Fetches /v1/ops/alerts + /entities/IntelProfile + /v1/graph/centrality
 * Keyword-matches each ops alert against intel profiles AND graph centrality nodes to classify:
 *   ATTRIBUTED — alert matches an intel profile AND a graph node (fully tracked threat)
 *   PROFILED   — alert matches an intel profile only (known actor, no graph trace)
 *   TRACED     — alert matches a graph node only (graph-visible, no intel profile)
 *   DARK       — no intel profile match and no graph node match (blind-spot alert)
 *
 * Toggle: ◈ OAGNET button (fixed, bottom strip) left:90360, zIndex:172
 * Stat tiles: alerts / profiles / nodes / attributed / profiled / traced / dark
 * Red pulse on DARK count (untracked threat alerts).
 * Expandable rows: matched intel profiles with category badge
 *                  + matched graph nodes with centrality score badge.
 * Filter tabs: ALL / ATTRIBUTED / PROFILED / TRACED / DARK + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "oagnet"/"ops alert intel"/"threat network"/"alert intel graph"/
 *        "threat response network"/"alert attribution"/"ops threat network"
 * Event: jarvis:oagnet-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ATTRIBUTED', 'PROFILED', 'TRACED', 'DARK'];

const CLS_COLOR = {
  ATTRIBUTED: '#00FF88',
  PROFILED:   '#38BDF8',
  TRACED:     '#FBBF24',
  DARK:       '#FF4444',
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

export function isOagnetQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'oagnet', 'ops alert intel', 'threat network', 'alert intel graph',
    'threat response network', 'alert attribution', 'ops threat network',
    'alert graph', 'intel alert', 'ops intel graph',
  ].some(k => s.includes(k));
}

export function buildOagnetScript() {
  return `Fetch /v1/ops/alerts, /entities/IntelProfile, and /v1/graph/centrality. ` +
    `Keyword-match each ops alert against intel profiles and graph centrality nodes. ` +
    `Classify each alert as ATTRIBUTED/PROFILED/TRACED/DARK. ` +
    `Report total DARK (blind-spot) alerts, identify which alert types have no intel profile or graph trace, ` +
    `and recommend which intel profiles or graph nodes should be extended to close attribution gaps.`;
}

export default function OpsAlertIntelProfileGraphThreatNetwork() {
  const [open, setOpen]         = useState(false);
  const [alerts, setAlerts]     = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [nodes, setNodes]       = useState([]);
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
      const [aRes, pRes, gRes] = await Promise.all([
        fetch(`${API}/v1/ops/alerts`, { headers: hdrs }).catch(() => null),
        fetch(`${API}/entities/IntelProfile`, { headers: hdrs }).catch(() => null),
        fetch(`${API}/v1/graph/centrality`, { headers: hdrs }).catch(() => null),
      ]);

      const aJson = aRes?.ok ? await aRes.json().catch(() => ({})) : {};
      const pJson = pRes?.ok ? await pRes.json().catch(() => ({})) : {};
      const gJson = gRes?.ok ? await gRes.json().catch(() => ({})) : {};

      const rawAlerts   = normalizeArray(aJson, ['alerts', 'items', 'data', 'results']);
      const rawProfiles = normalizeArray(pJson, ['items', 'data', 'results', 'profiles']);
      const rawNodes    = normalizeArray(gJson, ['nodes', 'items', 'data', 'results']);

      setAlerts(rawAlerts);
      setProfiles(rawProfiles);
      setNodes(rawNodes);

      const built = rawAlerts.map(alert => {
        const alertLabel = alert.name || alert.title || alert.message || alert.type || alert.id || '';
        const alertToks  = tokens(alertLabel);
        const severity   = (alert.severity || alert.level || '').toLowerCase();

        const matchedProfiles = rawProfiles.filter(p => {
          const pStr = [p.name, p.category, p.description, p.actor, p.tags].filter(Boolean).join(' ');
          return overlaps(alertToks, pStr);
        });
        const matchedNodes = rawNodes.filter(n => {
          const nStr = [n.label, n.name, n.id, n.type].filter(Boolean).join(' ');
          return overlaps(alertToks, nStr);
        });

        let cls;
        if (matchedProfiles.length > 0 && matchedNodes.length > 0) cls = 'ATTRIBUTED';
        else if (matchedProfiles.length > 0)                        cls = 'PROFILED';
        else if (matchedNodes.length > 0)                           cls = 'TRACED';
        else                                                         cls = 'DARK';

        return { ...alert, _label: alertLabel, _severity: severity, _cls: cls, _profiles: matchedProfiles, _nodes: matchedNodes };
      });

      setRows(built);
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:oagnet-toggle', handler);
    return () => window.removeEventListener('jarvis:oagnet-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const counts = {
    ATTRIBUTED: rows.filter(r => r._cls === 'ATTRIBUTED').length,
    PROFILED:   rows.filter(r => r._cls === 'PROFILED').length,
    TRACED:     rows.filter(r => r._cls === 'TRACED').length,
    DARK:       rows.filter(r => r._cls === 'DARK').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r._label || '').toLowerCase().includes(s) ||
             (r._severity || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    try {
      const script = buildOagnetScript();
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = res.ok ? await res.json().catch(() => ({})) : {};
      const text = d.response || d.text || d.message || 'Assessment complete.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (_) {}
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ops Alert × IntelProfile × Graph Threat Response Network"
        style={{
          position: 'fixed', bottom: 8, left: 90360, zIndex: 172,
          background: 'rgba(0,255,136,0.10)', border: '1px solid rgba(0,255,136,0.35)',
          color: '#00FF88', borderRadius: 4, padding: '2px 7px', fontSize: 10,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
        }}
      >
        ◈ OAGNET
        {counts.DARK > 0 && (
          <span style={{
            color: '#FF4444', fontSize: 9,
            animation: 'oagnet-pulse 1.2s ease-in-out infinite',
          }}>●{counts.DARK}</span>
        )}
      </button>
    );
  }

  return (
    <>
      <style>{`
        @keyframes oagnet-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .oagnet-panel::-webkit-scrollbar{width:4px}
        .oagnet-panel::-webkit-scrollbar-track{background:rgba(0,0,0,0.3)}
        .oagnet-panel::-webkit-scrollbar-thumb{background:rgba(0,255,136,0.4);border-radius:2px}
      `}</style>
      <div
        className="oagnet-panel"
        style={{
          position: 'fixed', bottom: 44, right: 16, width: 520, maxHeight: '75vh',
          background: 'rgba(0,10,20,0.97)', border: '1px solid rgba(0,255,136,0.4)',
          borderRadius: 8, zIndex: 9900, display: 'flex', flexDirection: 'column',
          fontFamily: 'monospace', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '10px 14px 6px', borderBottom: '1px solid rgba(0,255,136,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ color: '#00FF88', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
            ◈ OAGNET — OPS ALERT × INTEL × GRAPH
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)',
                color: '#00FF88', borderRadius: 4, padding: '2px 8px', fontSize: 10,
                cursor: assessing ? 'default' : 'pointer',
              }}
            >▶ {assessing ? 'ASSESSING…' : 'ASSESS'}</button>
            <button onClick={fetchData} style={{
              background: 'transparent', border: '1px solid rgba(0,255,136,0.3)',
              color: '#00FF88', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer',
            }}>↺</button>
            <button onClick={() => setOpen(false)} style={{
              background: 'transparent', border: 'none',
              color: '#888', fontSize: 14, cursor: 'pointer', lineHeight: 1,
            }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{
          display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap',
          borderBottom: '1px solid rgba(0,255,136,0.1)',
        }}>
          {[
            { label: 'ALERTS',     val: alerts.length,        col: '#aaa' },
            { label: 'PROFILES',   val: profiles.length,      col: '#aaa' },
            { label: 'NODES',      val: nodes.length,         col: '#aaa' },
            { label: 'ATTRIBUTED', val: counts.ATTRIBUTED,    col: CLS_COLOR.ATTRIBUTED },
            { label: 'PROFILED',   val: counts.PROFILED,      col: CLS_COLOR.PROFILED },
            { label: 'TRACED',     val: counts.TRACED,        col: CLS_COLOR.TRACED },
            { label: 'DARK',       val: counts.DARK,          col: CLS_COLOR.DARK },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.col}44`,
              borderRadius: 4, padding: '3px 8px', textAlign: 'center', minWidth: 60,
            }}>
              <div style={{ color: t.col, fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{t.val}</div>
              <div style={{ color: '#666', fontSize: 8, marginTop: 2, letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs + search */}
        <div style={{
          display: 'flex', gap: 4, padding: '6px 14px', alignItems: 'center',
          borderBottom: '1px solid rgba(0,255,136,0.1)', flexWrap: 'wrap',
        }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? 'rgba(0,255,136,0.2)' : 'transparent',
              border: `1px solid ${tab === t ? '#00FF88' : 'rgba(0,255,136,0.25)'}`,
              color: tab === t ? '#00FF88' : '#556', borderRadius: 3,
              padding: '2px 7px', fontSize: 9, cursor: 'pointer',
            }}>{t}</button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search alerts…"
            style={{
              marginLeft: 'auto', background: 'rgba(0,255,136,0.07)',
              border: '1px solid rgba(0,255,136,0.25)', color: '#ccc',
              borderRadius: 4, padding: '2px 8px', fontSize: 10, width: 120,
            }}
          />
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {loading && (
            <div style={{ color: '#555', fontSize: 11, padding: '12px 16px' }}>Loading…</div>
          )}
          {error && (
            <div style={{ color: '#FF4444', fontSize: 10, padding: '8px 16px' }}>{error}</div>
          )}
          {!loading && !error && visible.length === 0 && (
            <div style={{ color: '#444', fontSize: 10, padding: '12px 16px' }}>No alerts match.</div>
          )}
          {visible.map((r, i) => {
            const isExp = !!expanded[i];
            return (
              <div key={i} style={{ borderBottom: '1px solid rgba(0,255,136,0.07)' }}>
                <div
                  onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 14px', cursor: 'pointer',
                    background: isExp ? 'rgba(0,255,136,0.05)' : 'transparent',
                  }}
                >
                  <span style={{
                    background: `${CLS_COLOR[r._cls]}22`,
                    border: `1px solid ${CLS_COLOR[r._cls]}55`,
                    color: CLS_COLOR[r._cls],
                    borderRadius: 3, padding: '1px 5px', fontSize: 8, letterSpacing: 1,
                    minWidth: 70, textAlign: 'center', flexShrink: 0,
                  }}>{r._cls}</span>
                  <span style={{ color: '#ccc', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r._label || r.id || '—'}
                  </span>
                  {r._severity && (
                    <span style={{
                      color: r._severity.includes('crit') || r._severity.includes('high') ? '#FF4444' : '#888',
                      fontSize: 9, flexShrink: 0,
                    }}>{r._severity.toUpperCase()}</span>
                  )}
                  <span style={{ color: '#555', fontSize: 9 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '4px 14px 8px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {r._profiles.length > 0 && (
                      <div>
                        <div style={{ color: '#666', fontSize: 8, marginBottom: 3, letterSpacing: 1 }}>INTEL PROFILES ({r._profiles.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {r._profiles.slice(0, 5).map((p, j) => (
                            <span key={j} style={{
                              background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.35)',
                              color: '#38BDF8', borderRadius: 3, padding: '1px 6px', fontSize: 9,
                            }}>{p.name || p.actor || p.id} {p.category ? `· ${p.category}` : ''}</span>
                          ))}
                          {r._profiles.length > 5 && <span style={{ color: '#555', fontSize: 9 }}>+{r._profiles.length - 5} more</span>}
                        </div>
                      </div>
                    )}
                    {r._nodes.length > 0 && (
                      <div>
                        <div style={{ color: '#666', fontSize: 8, marginBottom: 3, letterSpacing: 1 }}>GRAPH NODES ({r._nodes.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {r._nodes.slice(0, 5).map((n, j) => (
                            <span key={j} style={{
                              background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)',
                              color: '#FBBF24', borderRadius: 3, padding: '1px 6px', fontSize: 9,
                            }}>
                              {n.label || n.name || n.id}
                              {n.centrality !== undefined ? ` · ${Number(n.centrality).toFixed(2)}` : ''}
                            </span>
                          ))}
                          {r._nodes.length > 5 && <span style={{ color: '#555', fontSize: 9 }}>+{r._nodes.length - 5} more</span>}
                        </div>
                      </div>
                    )}
                    {r._profiles.length === 0 && r._nodes.length === 0 && (
                      <span style={{ color: '#FF4444', fontSize: 9 }}>No intel profile or graph node match — DARK blind spot</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
