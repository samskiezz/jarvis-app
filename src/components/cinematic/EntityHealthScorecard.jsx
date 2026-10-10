import { useState, useEffect, useCallback } from 'react';

const API = '';
const EHSC_RE = /\b(entity[._-]?health|entity[._-]?scorecard|ehsc|object[._-]?health|entity[._-]?status|which[._-]?entities[._-]?have[._-]?alert|entity[._-]?health[._-]?check|object[._-]?anomal|health[._-]?scorecard|entity[._-]?risk)\b/i;

export function isEhscQuery(t) {
  return EHSC_RE.test(t || '');
}

export async function buildEhscScript() {
  const [objR, anR, alR] = await Promise.allSettled([
    fetch(`${API}/v1/ontology/objects?limit=100`).then(r => r.json()),
    fetch(`${API}/v1/jarvis/analytics/anomalies?limit=30`).then(r => r.json()),
    fetch(`${API}/v1/alerts`).then(r => r.json()),
  ]);
  const objects = normaliseArray(objR.status === 'fulfilled' ? objR.value : []);
  const anomalies = normaliseArray(anR.status === 'fulfilled' ? anR.value : []);
  const alerts = normaliseArray(alR.status === 'fulfilled' ? alR.value : []);
  const scored = scoreEntities(objects, anomalies, alerts);
  const red = scored.filter(e => e._health === 'RED').length;
  const amber = scored.filter(e => e._health === 'AMBER').length;
  const healthy = scored.filter(e => e._health === 'GREEN').length;
  return `Entity Health Scorecard: ${objects.length} entities assessed against ${anomalies.length} anomalies and ${alerts.length} alerts. ` +
    `${red} entities at RED (anomaly + alert), ${amber} at AMBER (anomaly only), ${healthy} GREEN (clean). ` +
    `Critical entities: ${scored.filter(e => e._health === 'RED').slice(0, 4).map(e => e.name || e.id || '?').join(', ') || 'none'}.`;
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'objects', 'anomalies', 'alerts', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(entityTokens, candidateFields) {
  if (!entityTokens.length) return 0;
  const candTokens = candidateFields.flatMap(f => tokens(f)).filter(Boolean);
  if (!candTokens.length) return 0;
  const candSet = new Set(candTokens);
  let hits = 0;
  for (const t of entityTokens) if (candSet.has(t)) hits++;
  return hits / Math.max(entityTokens.length, candTokens.length);
}

function scoreEntities(objects, anomalies, alerts) {
  return objects.map(obj => {
    const name = obj.name || obj.title || obj.label || obj.id || '';
    const objType = obj.type || obj.kind || obj.object_type || '';
    const eToks = tokens(name);

    const anomalyMatches = anomalies
      .map(an => ({
        an,
        score: matchScore(eToks, [an.metric, an.metric_name, an.name, an.description, an.category]),
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const alertMatches = alerts
      .map(al => ({
        al,
        score: matchScore(eToks, [al.type, al.category, al.message, al.source, al.resource]),
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    let health = 'GREEN';
    if (anomalyMatches.length > 0 && alertMatches.length > 0) health = 'RED';
    else if (anomalyMatches.length > 0) health = 'AMBER';

    const healthScore =
      health === 'GREEN' ? 1
      : health === 'AMBER' ? 0.5 - Math.min(anomalyMatches[0]?.score || 0, 0.4)
      : Math.max(0, 0.25 - Math.min(anomalyMatches[0]?.score || 0, 0.2) - Math.min(alertMatches[0]?.score || 0, 0.2));

    return { ...obj, _name: name, _type: objType, _health: health, _healthScore: healthScore, _anomalyMatches: anomalyMatches, _alertMatches: alertMatches };
  });
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

function healthColor(h) {
  if (h === 'RED') return '#ef4444';
  if (h === 'AMBER') return '#f59e0b';
  return '#22c55e';
}

function sevColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return '#ef4444';
  if (s === 'high' || s === 'error') return '#f97316';
  if (s === 'medium' || s === 'warning' || s === 'warn') return '#f59e0b';
  return '#60a5fa';
}

export default function EntityHealthScorecard() {
  const [open, setOpen] = useState(false);
  const [objects, setObjects] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [scored, setScored] = useState([]);
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
      const [objR, anR, alR] = await Promise.allSettled([
        fetch(`${API}/v1/ontology/objects?limit=100`).then(r => r.json()),
        fetch(`${API}/v1/jarvis/analytics/anomalies?limit=30`).then(r => r.json()),
        fetch(`${API}/v1/alerts`).then(r => r.json()),
      ]);
      const objs = normaliseArray(objR.status === 'fulfilled' ? objR.value : []);
      const ans = normaliseArray(anR.status === 'fulfilled' ? anR.value : []);
      const als = normaliseArray(alR.status === 'fulfilled' ? alR.value : []);
      setObjects(objs);
      setAnomalies(ans);
      setAlerts(als);
      setScored(scoreEntities(objs, ans, als));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:ehsc-toggle', h);
    return () => window.removeEventListener('jarvis:ehsc-toggle', h);
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
    const red = scored.filter(e => e._health === 'RED');
    const amber = scored.filter(e => e._health === 'AMBER');
    const prompt =
      `Entity Health Scorecard: ${objects.length} entities, ${anomalies.length} anomalies, ${alerts.length} alerts. ` +
      `${red.length} RED (anomaly+alert), ${amber.length} AMBER (anomaly only), ${scored.filter(e => e._health === 'GREEN').length} GREEN. ` +
      `Critical RED entities: ${red.slice(0, 5).map(e => e._name || e.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence entity health brief.`;
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

  const redCount = scored.filter(e => e._health === 'RED').length;
  const badge = redCount > 0 ? '#ef4444' : scored.some(e => e._health === 'AMBER') ? '#f59e0b' : '#22c55e';

  const visible = scored.filter(e => {
    const label = (e._name || e.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'RED') return e._health === 'RED';
    if (tab === 'AMBER') return e._health === 'AMBER';
    if (tab === 'GREEN') return e._health === 'GREEN';
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Entity Health Scorecard"
        style={{
          position: 'fixed',
          left: 415680,
          bottom: 8,
          zIndex: 184,
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
          boxShadow: redCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        EHSC
        {redCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {redCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 580,
          maxHeight: '82vh',
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
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#22c55e' }}>◈ ENTITY HEALTH SCORECARD</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 6, color: '#22c55e', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={load} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#94a3b8', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
                ↺
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'ENTITIES', val: objects.length, color: '#60a5fa' },
              { label: 'ANOMALIES', val: anomalies.length, color: '#a78bfa' },
              { label: 'ALERTS', val: alerts.length, color: '#f97316' },
              { label: 'HEALTHY', val: scored.filter(e => e._health === 'GREEN').length, color: '#22c55e' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, fontSize: 12, color: '#4ade80', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'RED', 'AMBER', 'GREEN'].map(t => {
              const accent = t === 'RED' ? '#ef4444' : t === 'AMBER' ? '#f59e0b' : t === 'GREEN' ? '#22c55e' : '#60a5fa';
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: tab === t ? `${accent}22` : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${tab === t ? `${accent}66` : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 6,
                    color: tab === t ? accent : '#94a3b8',
                    padding: '3px 10px',
                    fontSize: 11,
                    cursor: 'pointer',
                    fontWeight: tab === t ? 700 : 400,
                  }}
                >
                  {t}
                </button>
              );
            })}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search entities…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No entities match the current filter.</div>
          )}

          <div>
            {visible.map((entity, i) => {
              const id = entity.id || entity.object_id || i;
              const label = entity._name || `Entity ${id}`;
              const hc = healthColor(entity._health);
              const isExp = expanded === id;
              const scoreBar = Math.round((1 - entity._healthScore) * 100);
              return (
                <div
                  key={id}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ ...PILL, background: `${hc}22`, color: hc, border: `1px solid ${hc}55`, boxShadow: entity._health === 'RED' ? `0 0 5px ${hc}44` : 'none' }}>
                      {entity._health}
                    </span>
                    {entity._type && (
                      <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                        {entity._type}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    <div style={{ width: 48, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${scoreBar}%`, height: '100%', background: hc, borderRadius: 2 }} />
                    </div>
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {entity._anomalyMatches.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Anomaly matches:</div>
                          {entity._anomalyMatches.map(({ an, score }, j) => {
                            const metric = an.metric || an.metric_name || an.name || `anomaly-${j}`;
                            const zscore = an.zscore || an.z_score || an.score || 0;
                            const sev = an.severity || an.level || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#a78bfa', fontSize: 11, flex: 1 }}>{metric}</span>
                                  {zscore !== 0 && <span style={{ color: '#60a5fa', fontSize: 10 }}>z={Number(zscore).toFixed(2)}</span>}
                                  {sev && <span style={{ ...PILL, background: `${sevColor(sev)}22`, color: sevColor(sev), border: `1px solid ${sevColor(sev)}44` }}>{sev}</span>}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#a78bfa', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {entity._alertMatches.length > 0 && (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Alert matches:</div>
                          {entity._alertMatches.map(({ al, score }, j) => {
                            const alertLabel = al.type || al.category || al.message || `alert-${j}`;
                            const sev = al.severity || al.level || '';
                            const status = al.status || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#fb923c', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alertLabel}</span>
                                  {sev && <span style={{ ...PILL, background: `${sevColor(sev)}22`, color: sevColor(sev), border: `1px solid ${sevColor(sev)}44` }}>{sev}</span>}
                                  {status && <span style={{ color: '#94a3b8', fontSize: 10 }}>{status}</span>}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#fb923c', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {entity._anomalyMatches.length === 0 && entity._alertMatches.length === 0 && (
                        <div style={{ color: '#22c55e', fontSize: 11 }}>✓ No anomaly or alert correlation for this entity.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {scored.length} entities · {anomalies.length} anomalies · {alerts.length} alerts · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
