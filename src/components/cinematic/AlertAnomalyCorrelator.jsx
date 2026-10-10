import { useState, useEffect, useCallback } from 'react';

const API = '';
const ALAC_RE = /\b(alert[._-]?anomaly|anomaly[._-]?alert|alac|alert[._-]?correlat|linked[._-]?alert|orphan[._-]?alert|alert[._-]?anomaly[._-]?match|correlated[._-]?alert|which[._-]?alerts[._-]?have[._-]?anomal)\b/i;

export function isAlacQuery(t) {
  return ALAC_RE.test(t || '');
}

export async function buildAlacScript() {
  const [alR, anR] = await Promise.allSettled([
    fetch(`${API}/v1/alerts`).then(r => r.json()),
    fetch(`${API}/v1/jarvis/analytics/anomalies?limit=30`).then(r => r.json()),
  ]);
  const alerts = normaliseArray(alR.status === 'fulfilled' ? alR.value : []);
  const anomalies = normaliseArray(anR.status === 'fulfilled' ? anR.value : []);
  const enriched = correlate(alerts, anomalies);
  const orphan = enriched.filter(a => !a._linked).length;
  const linked = enriched.filter(a => a._linked).length;
  return `Alert × Anomaly Correlator: ${alerts.length} alerts, ${anomalies.length} anomalies detected. ` +
    `${linked} alerts are LINKED to anomalies; ${orphan} are ORPHAN (no anomaly coverage). ` +
    `Orphan alerts: ${enriched.filter(a => !a._linked).slice(0, 4).map(a => a.type || a.category || a.id || '?').join(', ') || 'none'}.`;
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'alerts', 'anomalies', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(alert, anomaly) {
  const aToks = new Set([
    ...tokens(alert.type),
    ...tokens(alert.category),
    ...tokens(alert.message),
    ...tokens(alert.severity),
    ...tokens(alert.source),
  ].filter(Boolean));
  const anToks = [
    ...tokens(anomaly.metric),
    ...tokens(anomaly.metric_name),
    ...tokens(anomaly.name),
    ...tokens(anomaly.description),
    ...tokens(anomaly.category),
  ].filter(Boolean);
  if (!aToks.size || !anToks.length) return 0;
  let hits = 0;
  for (const t of anToks) if (aToks.has(t)) hits++;
  return hits / Math.max(aToks.size, anToks.length);
}

function correlate(alerts, anomalies) {
  return alerts.map(alert => {
    const scored = anomalies
      .map(an => ({ an, score: matchScore(alert, an) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { ...alert, _matches: scored, _linked: scored.length > 0 };
  });
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

function sevColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return '#ef4444';
  if (s === 'high' || s === 'error') return '#f97316';
  if (s === 'medium' || s === 'warning' || s === 'warn') return '#f59e0b';
  return '#60a5fa';
}

export default function AlertAnomalyCorrelator() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
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
      const [alR, anR] = await Promise.allSettled([
        fetch(`${API}/v1/alerts`).then(r => r.json()),
        fetch(`${API}/v1/jarvis/analytics/anomalies?limit=30`).then(r => r.json()),
      ]);
      const als = normaliseArray(alR.status === 'fulfilled' ? alR.value : []);
      const ans = normaliseArray(anR.status === 'fulfilled' ? anR.value : []);
      setAlerts(als);
      setAnomalies(ans);
      setEnriched(correlate(als, ans));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:alac-toggle', h);
    return () => window.removeEventListener('jarvis:alac-toggle', h);
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
    const orphan = enriched.filter(a => !a._linked);
    const linked = enriched.filter(a => a._linked);
    const prompt =
      `Alert × Anomaly Correlator: ${alerts.length} total alerts, ${anomalies.length} anomalies. ` +
      `${linked.length} alerts linked to anomalies; ${orphan.length} orphan alerts with no anomaly match. ` +
      `Top orphan alerts: ${orphan.slice(0, 5).map(a => a.type || a.category || a.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence operational correlation brief.`;
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

  const orphanCount = enriched.filter(a => !a._linked).length;
  const badge = orphanCount > 0 ? '#f59e0b' : '#22c55e';

  const visible = enriched.filter(a => {
    const label = (a.type || a.category || a.message || a.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'LINKED') return a._linked;
    if (tab === 'ORPHAN') return !a._linked;
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Alert × Anomaly Correlator"
        style={{
          position: 'fixed',
          left: 351840,
          bottom: 8,
          zIndex: 170,
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
          boxShadow: orphanCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        ALAC
        {orphanCount > 0 && (
          <span style={{ background: badge, color: '#000', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {orphanCount}
          </span>
        )}
      </button>

      {/* Panel */}
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
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#f59e0b' }}>◈ ALERT × ANOMALY CORRELATOR</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, color: '#f59e0b', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'ALERTS', val: alerts.length, color: '#60a5fa' },
              { label: 'ANOMALIES', val: anomalies.length, color: '#a78bfa' },
              { label: 'LINKED', val: enriched.filter(a => a._linked).length, color: '#22c55e' },
              { label: 'ORPHAN', val: orphanCount, color: orphanCount > 0 ? '#f59e0b' : '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assessment block */}
          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: '#fbbf24', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'LINKED', 'ORPHAN'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#f59e0b' : '#94a3b8',
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
              placeholder="Search alerts…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {/* Status / error */}
          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {/* Alert rows */}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No alerts match the current filter.</div>
          )}

          <div>
            {visible.map((alert, i) => {
              const id = alert.id || alert.alert_id || i;
              const label = alert.type || alert.category || alert.message || `Alert ${id}`;
              const sev = alert.severity || alert.level || '';
              const isExp = expanded === id;
              return (
                <div
                  key={id}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ ...PILL, background: alert._linked ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: alert._linked ? '#22c55e' : '#f59e0b', border: `1px solid ${alert._linked ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                      {alert._linked ? 'LINKED' : 'ORPHAN'}
                    </span>
                    {sev && (
                      <span style={{ ...PILL, background: `${sevColor(sev)}22`, color: sevColor(sev), border: `1px solid ${sevColor(sev)}55` }}>
                        {sev.toUpperCase()}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {alert.message && alert.message !== label && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{alert.message}</div>
                      )}
                      {alert._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched anomalies:</div>
                          {alert._matches.map(({ an, score }, j) => {
                            const metric = an.metric || an.metric_name || an.name || an.id || `anomaly-${j}`;
                            const zscore = an.zscore || an.z_score || an.score || 0;
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#a78bfa', fontSize: 11, flex: 1 }}>{metric}</span>
                                  {zscore !== 0 && (
                                    <span style={{ color: '#60a5fa', fontSize: 10 }}>z={Number(zscore).toFixed(2)}</span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}% match</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#a78bfa', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#f59e0b', fontSize: 11 }}>⚠ No anomaly correlation for this alert.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} alerts · {anomalies.length} anomalies indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
