import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const TABS = ['ALL', 'FULLY_GROUNDED', 'DUAL_LINKED', 'SINGLE_LINKED', 'UNGROUNDED'];
const CLASS_COLOR = {
  FULLY_GROUNDED: '#22c55e',
  DUAL_LINKED:    '#00bfff',
  SINGLE_LINKED:  '#ffd700',
  UNGROUNDED:     '#ff4444',
};
const PULSE_STYLE = `@keyframes iahmon-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

export function isIahmonQuery(q) {
  return /\b(iahmon|intel horizon|alert annotation|ops alert horizon|grounded alerts|alert knowledge dataset|intelligence horizon)\b/i.test(q);
}
export function buildIahmonScript() {
  return 'Opening Intelligence Horizon Monitor. Cross-referencing ops alerts against graph annotations, knowledge articles, and datasets to surface grounding gaps.';
}

export default function OpsAlertHorizonMonitor() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [annotCount, setAnnotCount] = useState(0);
  const [kbCount, setKbCount]     = useState(0);
  const [dsCount, setDsCount]     = useState(0);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [assessment, setAssessment] = useState({});
  const intervalRef               = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [alertsRes, annotRes, kbRes, dsRes] = await Promise.all([
        fetch(`${API}/v1/ops/alerts`),
        fetch(`${API}/v1/graph/annotations`),
        fetch(`${API}/knowledge/`),
        fetch(`${API}/v1/datasets`),
      ]);
      const alertsJson = alertsRes.ok ? await alertsRes.json() : {};
      const annotJson  = annotRes.ok  ? await annotRes.json()  : {};
      const kbJson     = kbRes.ok     ? await kbRes.json()     : {};
      const dsJson     = dsRes.ok     ? await dsRes.json()     : {};

      const alerts      = Array.isArray(alertsJson)          ? alertsJson          : alertsJson.alerts      || alertsJson.results      || [];
      const annotations = Array.isArray(annotJson)           ? annotJson           : annotJson.annotations  || annotJson.results       || [];
      const kbArticles  = Array.isArray(kbJson)              ? kbJson              : kbJson.articles        || kbJson.results          || [];
      const datasets    = Array.isArray(dsJson)              ? dsJson              : dsJson.datasets        || dsJson.results          || [];

      setAnnotCount(annotations.length);
      setKbCount(kbArticles.length);
      setDsCount(datasets.length);

      const built = alerts.map(a => {
        const alertText = [a.title, a.message, a.description, a.type, a.category].join(' ');
        const aToks = tokens(alertText);

        const matchedAnnot = annotations.filter(n => {
          const nText = [n.label, n.text, n.entity, n.type].join(' ');
          return overlaps(aToks, nText);
        });
        const matchedKb = kbArticles.filter(k => {
          const kText = [k.title, k.summary, k.content, k.category].join(' ');
          return overlaps(aToks, kText);
        });
        const matchedDs = datasets.filter(d => {
          const dText = [d.name, d.description, d.type, d.tags].join(' ');
          return overlaps(aToks, dText);
        });

        const links = (matchedAnnot.length > 0 ? 1 : 0)
                    + (matchedKb.length   > 0 ? 1 : 0)
                    + (matchedDs.length   > 0 ? 1 : 0);

        const cls = links === 3 ? 'FULLY_GROUNDED'
                  : links === 2 ? 'DUAL_LINKED'
                  : links === 1 ? 'SINGLE_LINKED'
                  : 'UNGROUNDED';

        return { ...a, _cls: cls, _annots: matchedAnnot, _kb: matchedKb, _ds: matchedDs };
      });

      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    document.addEventListener('jarvis:iahmon-toggle', handler);
    return () => document.removeEventListener('jarvis:iahmon-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    intervalRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async (row) => {
    setAssessing(row._id || row.id);
    try {
      const prompt = `Intelligence horizon brief for alert "${row.title || row.message || 'unknown'}": classification ${row._cls}, ${row._annots.length} annotations, ${row._kb.length} KB articles, ${row._ds.length} datasets. Two sentences.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || data.result || 'No assessment available.';
      setAssessment(prev => ({ ...prev, [row._id || row.id]: text }));
      const ttsRes = await fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (ttsRes.ok) {
        const ttsData = await ttsRes.json();
        const audioUrl = ttsData.url || ttsData.audio_url;
        if (audioUrl) new Audio(audioUrl).play().catch(() => {});
      }
    } catch (e) {
      setAssessment(prev => ({ ...prev, [row._id || row.id]: 'Assessment unavailable.' }));
    } finally {
      setAssessing(null);
    }
  }, []);

  if (!open) return null;

  const clsCounts = { FULLY_GROUNDED: 0, DUAL_LINKED: 0, SINGLE_LINKED: 0, UNGROUNDED: 0 };
  rows.forEach(r => { if (clsCounts[r._cls] !== undefined) clsCounts[r._cls]++; });
  const grounded = clsCounts.FULLY_GROUNDED + clsCounts.DUAL_LINKED + clsCounts.SINGLE_LINKED;
  const covPct   = pct(grounded, rows.length);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (!search) return true;
    const hay = [r.title, r.message, r.description, r.type, r.category].join(' ').toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  const id = r => r._id || r.id || r.alert_id || JSON.stringify(r).slice(0, 16);

  return (
    <div style={{
      position: 'fixed', left: 1119120, bottom: 8, zIndex: 714,
      width: 860, maxHeight: '88vh',
      background: 'rgba(8,12,24,0.97)', border: '1px solid #00bfff44',
      borderRadius: 12, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#c8d8f0', boxShadow: '0 0 32px #00bfff22',
      overflow: 'hidden',
    }}>
      <style>{PULSE_STYLE}</style>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #00bfff22', background: 'rgba(0,191,255,0.06)' }}>
        <span style={{ color: '#00bfff', fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>◈ IAHMON</span>
        <span style={{ fontSize: 11, color: '#7a9bc0', flex: 1 }}>Intelligence Horizon Monitor — Ops Alert Grounding</span>
        {loading && <span style={{ fontSize: 11, color: '#ffd700' }}>REFRESHING…</span>}
        <button onClick={fetchData} style={{ background: 'none', border: '1px solid #00bfff44', color: '#00bfff', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: 16, cursor: 'pointer' }}>✕</button>
      </div>

      {error && (
        <div style={{ padding: '6px 14px', background: 'rgba(255,68,68,0.12)', color: '#ff4444', fontSize: 11 }}>
          ERROR: {error}
        </div>
      )}

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'ALERTS',   val: rows.length,          color: '#00bfff' },
          { label: 'ANNOTS',   val: annotCount,            color: '#a855f7' },
          { label: 'KB',       val: kbCount,               color: '#22c55e' },
          { label: 'DATASETS', val: dsCount,               color: '#14b8a6' },
          { label: 'COV%',     val: covPct + '%',          color: covPct >= 70 ? '#22c55e' : '#ffd700' },
          { label: 'FULL',     val: clsCounts.FULLY_GROUNDED, color: CLASS_COLOR.FULLY_GROUNDED },
          { label: 'DUAL',     val: clsCounts.DUAL_LINKED,    color: CLASS_COLOR.DUAL_LINKED },
          { label: 'SINGLE',   val: clsCounts.SINGLE_LINKED,  color: CLASS_COLOR.SINGLE_LINKED },
          { label: 'UNGND',    val: clsCounts.UNGROUNDED,     color: CLASS_COLOR.UNGROUNDED, badge: clsCounts.UNGROUNDED > 0 },
        ].map(t => (
          <div key={t.label} style={{
            background: 'rgba(0,0,0,0.4)', border: `1px solid ${t.color}44`,
            borderRadius: 6, padding: '4px 10px', minWidth: 64, textAlign: 'center',
            position: 'relative',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.color }}>{t.val}</div>
            <div style={{ fontSize: 9, color: '#7a9bc0', letterSpacing: 1 }}>{t.label}</div>
            {t.badge && (
              <span style={{
                position: 'absolute', top: -4, right: -4, background: '#ff4444',
                borderRadius: '50%', width: 10, height: 10, display: 'block',
              }} />
            )}
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? (CLASS_COLOR[t] || '#00bfff') + '33' : 'rgba(0,0,0,0.3)',
            border: `1px solid ${tab === t ? (CLASS_COLOR[t] || '#00bfff') : '#00bfff22'}`,
            color: tab === t ? (CLASS_COLOR[t] || '#00bfff') : '#7a9bc0',
            borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search alerts…"
          style={{
            background: 'rgba(0,0,0,0.4)', border: '1px solid #00bfff33', color: '#c8d8f0',
            borderRadius: 4, padding: '3px 8px', fontSize: 11, fontFamily: 'monospace',
            outline: 'none', marginLeft: 'auto', width: 160,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#7a9bc0', fontSize: 12, textAlign: 'center', padding: 24 }}>
            {rows.length === 0 ? 'No alerts loaded.' : 'No matching alerts.'}
          </div>
        )}
        {visible.map(row => {
          const rid = id(row);
          const isExp = expanded === rid;
          const pulse = row._cls === 'UNGROUNDED';
          const clsColor = CLASS_COLOR[row._cls] || '#888';
          return (
            <div key={rid} style={{
              background: 'rgba(0,0,0,0.35)', border: `1px solid ${clsColor}33`,
              borderRadius: 7, marginBottom: 7, padding: '8px 10px',
              animation: pulse ? 'iahmon-pulse 2s ease-in-out infinite' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => setExpanded(isExp ? null : rid)}>
                <span style={{
                  background: clsColor + '22', border: `1px solid ${clsColor}66`,
                  color: clsColor, borderRadius: 4, fontSize: 9, padding: '1px 5px', whiteSpace: 'nowrap',
                }}>{row._cls}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#dde8f8', flex: 1 }}>
                  {row.title || row.message || row.alert_id || 'Unnamed Alert'}
                </span>
                <span style={{ fontSize: 10, color: '#7a9bc0' }}>
                  A:{row._annots.length} K:{row._kb.length} D:{row._ds.length}
                </span>
                <span style={{ fontSize: 11, color: '#00bfff44' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ marginTop: 8, borderTop: '1px solid #00bfff11', paddingTop: 8 }}>
                  {/* annotations */}
                  {row._annots.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#a855f7', marginBottom: 4, letterSpacing: 1 }}>ANNOTATIONS ({row._annots.length})</div>
                      {row._annots.slice(0, 4).map((n, i) => {
                        const shared = tokens([row.title, row.message].join(' '))
                          .filter(t => tokens([n.label, n.text, n.entity].join(' ')).includes(t));
                        const rel = Math.min(100, 25 + shared.length * 20);
                        return (
                          <div key={i} style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid #a855f722', borderRadius: 4, padding: '4px 8px', marginBottom: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#c4b5fd' }}>{n.label || n.entity || n.text || 'Annotation'}</span>
                              {n.type && <span style={{ fontSize: 9, color: '#a855f7', border: '1px solid #a855f733', borderRadius: 3, padding: '0 4px' }}>{n.type}</span>}
                            </div>
                            <div style={{ marginTop: 3, height: 3, background: 'rgba(168,85,247,0.15)', borderRadius: 2 }}>
                              <div style={{ width: rel + '%', height: '100%', background: '#a855f7', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* KB articles */}
                  {row._kb.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#22c55e', marginBottom: 4, letterSpacing: 1 }}>KB ARTICLES ({row._kb.length})</div>
                      {row._kb.slice(0, 4).map((k, i) => {
                        const shared = tokens([row.title, row.message].join(' '))
                          .filter(t => tokens([k.title, k.summary].join(' ')).includes(t));
                        const rel = Math.min(100, 25 + shared.length * 20);
                        return (
                          <div key={i} style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid #22c55e22', borderRadius: 4, padding: '4px 8px', marginBottom: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#86efac' }}>{k.title || k.name || 'Article'}</span>
                              {k.category && <span style={{ fontSize: 9, color: '#22c55e', border: '1px solid #22c55e33', borderRadius: 3, padding: '0 4px' }}>{k.category}</span>}
                            </div>
                            <div style={{ marginTop: 3, height: 3, background: 'rgba(34,197,94,0.15)', borderRadius: 2 }}>
                              <div style={{ width: rel + '%', height: '100%', background: '#22c55e', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* datasets */}
                  {row._ds.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#14b8a6', marginBottom: 4, letterSpacing: 1 }}>DATASETS ({row._ds.length})</div>
                      {row._ds.slice(0, 4).map((d, i) => {
                        const shared = tokens([row.title, row.message].join(' '))
                          .filter(t => tokens([d.name, d.description].join(' ')).includes(t));
                        const rel = Math.min(100, 25 + shared.length * 20);
                        return (
                          <div key={i} style={{ background: 'rgba(20,184,166,0.07)', border: '1px solid #14b8a622', borderRadius: 4, padding: '4px 8px', marginBottom: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#5eead4' }}>{d.name || d.title || 'Dataset'}</span>
                              {d.type && <span style={{ fontSize: 9, color: '#14b8a6', border: '1px solid #14b8a633', borderRadius: 3, padding: '0 4px' }}>{d.type}</span>}
                            </div>
                            <div style={{ marginTop: 3, height: 3, background: 'rgba(20,184,166,0.15)', borderRadius: 2 }}>
                              <div style={{ width: rel + '%', height: '100%', background: '#14b8a6', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {row._cls === 'UNGROUNDED' && row._annots.length === 0 && row._kb.length === 0 && row._ds.length === 0 && (
                    <div style={{ fontSize: 11, color: '#ff4444', padding: '4px 0', marginBottom: 6 }}>
                      ⚠ Intelligence horizon gap — no grounding found in annotations, KB, or datasets.
                    </div>
                  )}

                  {/* assess button */}
                  <button
                    disabled={assessing === rid}
                    onClick={() => assess(row)}
                    style={{
                      background: 'rgba(0,191,255,0.12)', border: '1px solid #00bfff44',
                      color: '#00bfff', borderRadius: 5, padding: '4px 12px',
                      cursor: assessing === rid ? 'not-allowed' : 'pointer',
                      fontSize: 11, fontFamily: 'monospace', opacity: assessing === rid ? 0.5 : 1,
                    }}>
                    {assessing === rid ? '…ASSESSING' : '▶ ASSESS HORIZON'}
                  </button>

                  {assessment[rid] && (
                    <div style={{ marginTop: 8, background: 'rgba(0,191,255,0.07)', border: '1px solid #00bfff22', borderRadius: 5, padding: '6px 10px', fontSize: 11, color: '#a0c8f0', lineHeight: 1.5 }}>
                      {assessment[rid]}
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
