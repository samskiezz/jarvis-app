import { useState, useEffect, useCallback } from 'react';

const API = '';
const SCAN_RE = /\b(scenario[._-]?anom|anom[._-]?scenario|scan[._-]?panel|exposed[._-]?scenario|scenario[._-]?with[._-]?anom|which[._-]?scenario[._-]?have[._-]?anom|scenario[._-]?metric[._-]?anom|scenario[._-]?anom[._-]?correlat|anomaly[._-]?scenario)\b/i;

export function isScanQuery(t) {
  return SCAN_RE.test(t || '');
}

export async function buildScanScript() {
  const [scR, anomR] = await Promise.allSettled([
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
    fetch(`${API}/v1/jarvis/analytics/anomalies?limit=30`).then(r => r.json()),
  ]);
  const scenarios = normaliseScenarios(scR.status === 'fulfilled' ? scR.value : []);
  const anomalies = normaliseAnomalies(anomR.status === 'fulfilled' ? anomR.value : []);
  const enriched = correlate(scenarios, anomalies);
  const exposed = enriched.filter(s => s._linked).length;
  const clear = enriched.length - exposed;
  return (
    `Scenario × Anomaly Correlation: ${scenarios.length} scenarios, ${anomalies.length} metric anomalies indexed. ` +
    `${exposed} scenarios are exposed by active metric anomalies; ${clear} appear clear. ` +
    `Top exposed: ${enriched.filter(s => s._linked).slice(0, 4).map(s => s.name || s.title || s.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['scenarios', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseAnomalies(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['anomalies', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(scenario, anomaly) {
  const scToks = new Set([
    ...tokens(scenario.name),
    ...tokens(scenario.title),
    ...tokens(scenario.description),
    ...tokens(scenario.type),
    ...tokens(scenario.category),
    ...tokens(scenario.tags),
  ].filter(Boolean));
  const anomToks = [
    ...tokens(anomaly.metric),
    ...tokens(anomaly.name),
    ...tokens(anomaly.description),
    ...tokens(anomaly.kind),
    ...tokens(anomaly.source),
  ].filter(Boolean);
  if (!scToks.size || !anomToks.length) return 0;
  let hits = 0;
  for (const t of anomToks) if (scToks.has(t)) hits++;
  return hits / Math.max(scToks.size, anomToks.length);
}

function correlate(scenarios, anomalies) {
  return scenarios.map(sc => {
    const scored = anomalies
      .map(anom => ({ anom, score: matchScore(sc, anom) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...sc, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';
const OR = '#F97316';

const SEVERITY_COLOR = { high: RD, critical: RD, medium: AM, low: GR };

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

export default function ScenarioAnomalyCorrelator() {
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scR, anomR] = await Promise.allSettled([
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
        fetch(`${API}/v1/jarvis/analytics/anomalies?limit=30`).then(r => r.json()),
      ]);
      setScenarios(normaliseScenarios(scR.status === 'fulfilled' ? scR.value : []));
      setAnomalies(normaliseAnomalies(anomR.status === 'fulfilled' ? anomR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:scan-toggle', onToggle);
    return () => window.removeEventListener('jarvis:scan-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(scenarios, anomalies);
  const exposed = enriched.filter(s => s._linked);
  const clear = enriched.filter(s => !s._linked);
  const badgeCount = exposed.length;
  const badgeColor = badgeCount > 0 ? RD : GR;

  const filtered = enriched
    .filter(s => tab === 'ALL' || (tab === 'EXPOSED' ? s._linked : !s._linked))
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.title || '').toLowerCase().includes(q) ||
        String(s.type || '').toLowerCase().includes(q) ||
        String(s.category || '').toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `You have ${scenarios.length} scenarios and ${anomalies.length} metric anomalies. ${exposed.length} scenarios are exposed by active anomalies; ${clear.length} appear clear. Give a 2-sentence scenario anomaly correlation brief with the key operational risk pattern.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = s => s.name || s.title || s.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Scenario × Anomaly Correlator (SCAN)"
        style={{
          position: 'fixed', left: 689280, bottom: 8, zIndex: 245,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ SCAN
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9200,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${CY}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ◈ SCENARIO × ANOMALY CORRELATOR
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${CY}55`,
                  background: 'transparent', color: CY, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0,
                }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'SCENARIOS', val: scenarios.length, col: CY },
              { label: 'ANOMALIES', val: anomalies.length, col: AM },
              { label: 'EXPOSED', val: exposed.length, col: RD },
              { label: 'CLEAR', val: clear.length, col: GR },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'EXPOSED', 'CLEAR'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? CY : '#2a3a4a'}`,
                  background: tab === t ? `${CY}22` : 'transparent',
                  color: tab === t ? CY : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search scenarios…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No scenarios found.'}
              </div>
            ) : filtered.map((sc, i) => {
              const isExp = expanded === i;
              const statusColor = sc._linked ? RD : GR;
              return (
                <div
                  key={sc.id || i}
                  style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(sc)}</span>
                    {sc.type && chip(sc.type, OR)}
                    {sc.category && chip(sc.category, '#6E8AA0')}
                    {chip(sc._linked ? 'EXPOSED' : 'CLEAR', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {sc._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED ANOMALIES
                          </div>
                          {sc._matches.map(({ anom, score }, j) => {
                            const sevColor = SEVERITY_COLOR[String(anom.severity || '').toLowerCase()] || AM;
                            const zScore = anom.z_score != null ? Number(anom.z_score).toFixed(2) : null;
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                {anom.severity && chip(anom.severity, sevColor)}
                                {zScore && <span style={{ color: AM, fontSize: 10 }}>z={zScore}</span>}
                                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                  {anom.metric || anom.name || anom.id || '?'}
                                </span>
                                {scorebar(score, RD)}
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: GR, fontSize: 10 }}>No anomalies matched this scenario.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${CY}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(0,207,255,0.03)',
            }}>
              <span style={{ color: CY, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
