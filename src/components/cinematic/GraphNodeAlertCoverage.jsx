import { useState, useEffect, useCallback } from 'react';

const API = '';
const GNAC_RE = /\b(graph[._-]?alerts?|central[._-]?node[._-]?alerts?|gnac|node[._-]?alert[._-]?coverage|which[._-]?nodes?[._-]?have[._-]?alerts?|alert[._-]?nodes?|network[._-]?alert[._-]?coverage|graph[._-]?node[._-]?alerts?|alerted[._-]?nodes?|node[._-]?alerts?)\b/i;

export function isGnacQuery(t) {
  return GNAC_RE.test(t || '');
}

export async function buildGnacScript() {
  const [cR, aR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
    fetch(`${API}/v1/alerts`).then(r => r.json()),
  ]);
  const nodes = normaliseNodes(cR.status === 'fulfilled' ? cR.value : []);
  const alerts = normaliseAlerts(aR.status === 'fulfilled' ? aR.value : []);
  const enriched = correlate(nodes, alerts);
  const alerted = enriched.filter(n => n._alerted).length;
  const clear = enriched.length - alerted;
  const topAlerted = enriched.filter(n => n._alerted).slice(0, 4).map(n => n.label || n.name || n.id || '?').join(', ') || 'none';
  return (
    `Graph Node × Alert Coverage: ${nodes.length} central nodes, ${alerts.length} alerts indexed. ` +
    `${alerted} nodes are ALERTED (matched active alerts); ${clear} are CLEAR. ` +
    `Top alerted nodes: ${topAlerted}.`
  );
}

function normaliseNodes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['nodes', 'items', 'results', 'data', 'centrality', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseAlerts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'alerts', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(t => t.length > 2);
}

function matchScore(node, alert) {
  const nToks = new Set([
    ...tokens(node.label),
    ...tokens(node.name),
    ...tokens(node.id),
    ...tokens(node.type),
    ...tokens(node.entity_type),
  ].filter(Boolean));
  const aToks = [
    ...tokens(alert.type),
    ...tokens(alert.category),
    ...tokens(alert.message),
    ...tokens(alert.source),
    ...tokens(alert.description),
    ...tokens(alert.title),
  ].filter(Boolean);
  if (!nToks.size || !aToks.length) return 0;
  let hits = 0;
  for (const t of aToks) if (nToks.has(t)) hits++;
  return hits / Math.max(nToks.size, aToks.length);
}

function correlate(nodes, alerts) {
  return nodes.map(n => {
    const scored = alerts
      .map(a => ({ a, score: matchScore(n, a) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { ...n, _matches: scored, _alerted: scored.length > 0 };
  });
}

function severityColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical' || s === 'high') return '#ef4444';
  if (s === 'medium' || s === 'warning') return '#f59e0b';
  if (s === 'low' || s === 'info') return '#60a5fa';
  return '#94a3b8';
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };
const ACCENT = '#f87171';

export default function GraphNodeAlertCoverage() {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [cR, aR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
        fetch(`${API}/v1/alerts`).then(r => r.json()),
      ]);
      const n = normaliseNodes(cR.status === 'fulfilled' ? cR.value : []);
      const a = normaliseAlerts(aR.status === 'fulfilled' ? aR.value : []);
      setNodes(n);
      setAlerts(a);
      setEnriched(correlate(n, a));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:gnac-toggle', h);
    return () => window.removeEventListener('jarvis:gnac-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const alerted = enriched.filter(n => n._alerted);
    const prompt =
      `Graph Node × Alert Coverage: ${nodes.length} central nodes, ${alerts.length} alerts. ` +
      `${alerted.length} nodes are ALERTED; ${enriched.length - alerted.length} are CLEAR. ` +
      `Top alerted: ${alerted.slice(0, 5).map(n => n.label || n.name || n.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence graph alert network coverage brief.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.answer || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const alertedCount = enriched.filter(n => n._alerted).length;
  const clearCount = enriched.length - alertedCount;
  const badge = alertedCount > 0 ? '#ef4444' : '#22c55e';

  const visible = enriched.filter(n => {
    const label = (n.label || n.name || n.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'ALERTED') return n._alerted;
    if (tab === 'CLEAR') return !n._alerted;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Graph Node × Alert Coverage"
        style={{
          position: 'fixed',
          left: 566160,
          bottom: 8,
          zIndex: 217,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: '#e2e8f0',
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          letterSpacing: 1,
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: badge,
          boxShadow: alertedCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        GNAC
        {alertedCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {alertedCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 560,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9600,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: ACCENT }}>◈ GRAPH NODE × ALERT COVERAGE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 6, color: ACCENT, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'CENTRAL NODES', val: nodes.length, color: '#60a5fa' },
              { label: 'ALERTS', val: alerts.length, color: '#f59e0b' },
              { label: 'ALERTED', val: alertedCount, color: alertedCount > 0 ? '#ef4444' : '#64748b' },
              { label: 'CLEAR', val: clearCount, color: '#22c55e' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, fontSize: 12, color: '#fca5a5', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'ALERTED', 'CLEAR'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? ACCENT : '#94a3b8',
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search central nodes…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No nodes match the current filter.</div>
          )}

          <div>
            {visible.map((n, i) => {
              const id = n.id || n.node_id || i;
              const label = n.label || n.name || `Node ${id}`;
              const centrality = typeof n.centrality === 'number' ? n.centrality : (typeof n.score === 'number' ? n.score : null);
              const isExp = expanded === id;
              return (
                <div
                  key={id}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      ...PILL,
                      background: n._alerted ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.12)',
                      color: n._alerted ? '#ef4444' : '#22c55e',
                      border: `1px solid ${n._alerted ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.25)'}`,
                    }}>
                      {n._alerted ? 'ALERTED' : 'CLEAR'}
                    </span>
                    {n.type && (
                      <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                        {n.type}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {centrality !== null && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>c={centrality.toFixed(4)}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {n._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched alerts:</div>
                          {n._matches.map(({ a, score }, j) => {
                            const aLabel = a.type || a.title || a.message || a.id || `alert-${j}`;
                            const sev = a.severity || a.level || '';
                            const cat = a.category || '';
                            return (
                              <div key={j} style={{ marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{aLabel}</span>
                                  {sev && (
                                    <span style={{ ...PILL, background: `${severityColor(sev)}22`, color: severityColor(sev), border: `1px solid ${severityColor(sev)}44` }}>
                                      {sev.toUpperCase()}
                                    </span>
                                  )}
                                  {cat && (
                                    <span style={{ ...PILL, background: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }}>
                                      {cat}
                                    </span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}% match</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: ACCENT, borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#22c55e', fontSize: 11 }}>✓ No alerts matched for this central node.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} nodes · {alerts.length} alerts indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
