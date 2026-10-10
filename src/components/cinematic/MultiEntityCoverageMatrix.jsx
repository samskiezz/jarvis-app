import { useState, useEffect, useCallback } from 'react';

const API = '';
const MECM_RE = /\b(coverage[._-]?matrix|entity[._-]?coverage|multi[._-]?entity[._-]?coverage|mecm|entity[._-]?signal[._-]?coverage|coverage[._-]?heatmap|which[._-]?entities[._-]?are[._-]?covered|entity[._-]?coverage[._-]?overview|entity[._-]?matrix|signal[._-]?coverage)\b/i;

export function isMecmQuery(t) {
  return MECM_RE.test(t || '');
}

const ENTITY_KEYS = ['Task', 'RiskSignal', 'IntelProfile', 'SwarmJob', 'Investment', 'Contact'];
const SIGNAL_KEYS = ['Alerts', 'Anomalies', 'Investigations', 'Decisions'];

function kwOverlap(a, b) {
  if (!a || !b) return false;
  const ta = a.toLowerCase();
  const words = b.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  return words.some(w => ta.includes(w));
}

function entityText(e) {
  return [e.name, e.title, e.description, e.kind, e.type, e.target, e.category, e.subject,
    e.sector, e.source, e.ticker, e.email, e.company, e.assignee, e.nationality]
    .filter(Boolean).join(' ');
}

function signalText(s) {
  return [s.metric, s.name, s.title, s.type, s.category, s.message, s.source, s.description]
    .filter(Boolean).join(' ');
}

function coverage(entities, signals) {
  if (!entities.length || !signals.length) return 0;
  const hits = entities.filter(e =>
    signals.some(s => kwOverlap(entityText(e), signalText(s)) || kwOverlap(signalText(s), entityText(e)))
  ).length;
  return Math.round((hits / entities.length) * 100);
}

function normList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'records', 'objects', 'list',
    'tasks', 'risks', 'profiles', 'jobs', 'investments', 'contacts',
    'alerts', 'anomalies', 'investigations', 'decisions']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

export async function buildMecmScript() {
  const [tasksR, rsR, ipR, sjR, ivR, ctR, alR, anR, inR, dcR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${API}/entities/Investment`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/v1/alerts`).then(r => r.json()),
    fetch(`${API}/v1/jarvis/analytics/anomalies?limit=30`).then(r => r.json()),
    fetch(`${API}/v1/investigations`).then(r => r.json()),
    fetch(`${API}/v1/decision/list?limit=50`).then(r => r.json()),
  ]);
  const entities = {
    Task: normList(tasksR.status === 'fulfilled' ? tasksR.value : []),
    RiskSignal: normList(rsR.status === 'fulfilled' ? rsR.value : []),
    IntelProfile: normList(ipR.status === 'fulfilled' ? ipR.value : []),
    SwarmJob: normList(sjR.status === 'fulfilled' ? sjR.value : []),
    Investment: normList(ivR.status === 'fulfilled' ? ivR.value : []),
    Contact: normList(ctR.status === 'fulfilled' ? ctR.value : []),
  };
  const signals = {
    Alerts: normList(alR.status === 'fulfilled' ? alR.value : []),
    Anomalies: normList(anR.status === 'fulfilled' ? anR.value : []),
    Investigations: normList(inR.status === 'fulfilled' ? inR.value : []),
    Decisions: normList(dcR.status === 'fulfilled' ? dcR.value : []),
  };
  const totEnt = Object.values(entities).reduce((a, b) => a + b.length, 0);
  const totSig = Object.values(signals).reduce((a, b) => a + b.length, 0);
  const coverages = ENTITY_KEYS.flatMap(ek =>
    SIGNAL_KEYS.map(sk => coverage(entities[ek], signals[sk]))
  );
  const avgCov = coverages.length
    ? Math.round(coverages.reduce((a, b) => a + b, 0) / coverages.length)
    : 0;
  const minCov = Math.min(...coverages);
  const maxCov = Math.max(...coverages);
  return (
    `Multi-Entity Coverage Matrix: ${totEnt} entities across 6 types vs ${totSig} signals across 4 sources. ` +
    `Average cross-coverage: ${avgCov}%. Range: ${minCov}%–${maxCov}%. ` +
    `Review MECM panel for full heatmap of which entity types have the most signal gaps.`
  );
}

const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#F43F5E';
const VI = '#A78BFA';
const PANEL_W = 640;
const PANEL_H = 540;

function pctColor(pct) {
  if (pct >= 66) return GR;
  if (pct >= 33) return AM;
  return RD;
}

function chip(label, color = CY) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 4,
      border: `1px solid ${color}44`, background: `${color}14`,
      color, fontSize: 10, letterSpacing: 1, marginRight: 4,
    }}>{label}</span>
  );
}

export default function MultiEntityCoverageMatrix() {
  const [open, setOpen] = useState(false);
  const [entities, setEntities] = useState({});
  const [signals, setSignals] = useState({});
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [tasksR, rsR, ipR, sjR, ivR, ctR, alR, anR, inR, dcR] = await Promise.allSettled([
      fetch(`${API}/entities/Task`).then(r => r.json()),
      fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
      fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
      fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
      fetch(`${API}/entities/Investment`).then(r => r.json()),
      fetch(`${API}/entities/Contact`).then(r => r.json()),
      fetch(`${API}/v1/alerts`).then(r => r.json()),
      fetch(`${API}/v1/jarvis/analytics/anomalies?limit=30`).then(r => r.json()),
      fetch(`${API}/v1/investigations`).then(r => r.json()),
      fetch(`${API}/v1/decision/list?limit=50`).then(r => r.json()),
    ]);
    setEntities({
      Task: normList(tasksR.status === 'fulfilled' ? tasksR.value : []),
      RiskSignal: normList(rsR.status === 'fulfilled' ? rsR.value : []),
      IntelProfile: normList(ipR.status === 'fulfilled' ? ipR.value : []),
      SwarmJob: normList(sjR.status === 'fulfilled' ? sjR.value : []),
      Investment: normList(ivR.status === 'fulfilled' ? ivR.value : []),
      Contact: normList(ctR.status === 'fulfilled' ? ctR.value : []),
    });
    setSignals({
      Alerts: normList(alR.status === 'fulfilled' ? alR.value : []),
      Anomalies: normList(anR.status === 'fulfilled' ? anR.value : []),
      Investigations: normList(inR.status === 'fulfilled' ? inR.value : []),
      Decisions: normList(dcR.status === 'fulfilled' ? dcR.value : []),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:mecm-toggle', onToggle);
    return () => window.removeEventListener('jarvis:mecm-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const matrix = ENTITY_KEYS.map(ek =>
    SIGNAL_KEYS.map(sk => coverage(entities[ek] || [], signals[sk] || []))
  );

  const allPcts = matrix.flat();
  const avgPct = allPcts.length
    ? Math.round(allPcts.reduce((a, b) => a + b, 0) / allPcts.length)
    : 0;
  const minPct = allPcts.length ? Math.min(...allPcts) : 0;
  const totEntities = Object.values(entities).reduce((a, b) => a + b.length, 0);
  const totSignals = Object.values(signals).reduce((a, b) => a + b.length, 0);

  const badgeColor = avgPct >= 50 ? GR : avgPct >= 25 ? AM : RD;

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief('');
    try {
      const rows = ENTITY_KEYS.map((ek, i) =>
        `${ek}: ${SIGNAL_KEYS.map((sk, j) => `${sk}=${matrix[i][j]}%`).join(', ')}`
      ).join('; ');
      const msg = `Entity-Signal Coverage Matrix: ${rows}. Avg coverage: ${avgPct}%. Give a 2-sentence gap analysis and the most critical coverage gap to address.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }, [matrix, avgPct]);

  const ENTITY_LABELS = { Task: 'Task', RiskSignal: 'RiskSig', IntelProfile: 'Intel', SwarmJob: 'Swarm', Investment: 'Invest', Contact: 'Contact' };
  const SIGNAL_COLORS = { Alerts: RD, Anomalies: AM, Investigations: VI, Decisions: CY };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Multi-Entity Coverage Matrix (MECM)"
        style={{
          position: 'fixed', left: 702960, bottom: 8, zIndex: 248,
          width: 60, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ MECM
        {avgPct > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{avgPct}%</span>
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
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ◈ MULTI-ENTITY COVERAGE MATRIX
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
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'ENTITIES', val: totEntities, col: CY },
              { label: 'SIGNALS', val: totSignals, col: AM },
              { label: 'AVG COV', val: `${avgPct}%`, col: avgPct >= 50 ? GR : avgPct >= 25 ? AM : RD },
              { label: 'MIN COV', val: `${minPct}%`, col: minPct >= 33 ? AM : RD },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center', minWidth: 0,
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            <span style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1 }}>SIGNAL →</span>
            {SIGNAL_KEYS.map(sk => (
              <span key={sk} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: SIGNAL_COLORS[sk] }} />
                <span style={{ color: SIGNAL_COLORS[sk], fontSize: 9, letterSpacing: 1 }}>{sk.toUpperCase()}</span>
                {signals[sk] && <span style={{ color: '#6E8AA0', fontSize: 9 }}>({signals[sk].length})</span>}
              </span>
            ))}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {[[GR, '≥66%'], [AM, '33–65%'], [RD, '<33%']].map(([c, l]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                  <span style={{ color: c, fontSize: 9 }}>{l}</span>
                </span>
              ))}
            </span>
          </div>

          {/* Matrix table */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, textAlign: 'left', padding: '4px 8px', borderBottom: `1px solid ${CY}22`, width: 80 }}>
                    ENTITY ↓
                  </th>
                  {SIGNAL_KEYS.map(sk => (
                    <th key={sk} style={{
                      color: SIGNAL_COLORS[sk], fontSize: 9, letterSpacing: 1,
                      textAlign: 'center', padding: '4px 8px',
                      borderBottom: `1px solid ${CY}22`,
                    }}>{sk.toUpperCase()}</th>
                  ))}
                  <th style={{ color: '#6E8AA0', fontSize: 9, textAlign: 'center', padding: '4px 8px', borderBottom: `1px solid ${CY}22` }}>
                    COUNT
                  </th>
                  <th style={{ color: '#6E8AA0', fontSize: 9, textAlign: 'center', padding: '4px 8px', borderBottom: `1px solid ${CY}22` }}>
                    ROW AVG
                  </th>
                </tr>
              </thead>
              <tbody>
                {ENTITY_KEYS.map((ek, i) => {
                  const row = matrix[i];
                  const rowAvg = row.length ? Math.round(row.reduce((a, b) => a + b, 0) / row.length) : 0;
                  const entCount = (entities[ek] || []).length;
                  return (
                    <tr key={ek} style={{ borderBottom: `1px solid ${CY}11` }}>
                      <td style={{ padding: '8px 8px', verticalAlign: 'middle' }}>
                        <span style={{ color: '#DCEBF5', fontSize: 10, letterSpacing: 1 }}>
                          {ENTITY_LABELS[ek]}
                        </span>
                      </td>
                      {row.map((pct, j) => {
                        const col = pctColor(pct);
                        return (
                          <td key={SIGNAL_KEYS[j]} style={{ textAlign: 'center', padding: '8px 6px', verticalAlign: 'middle' }}>
                            <div style={{
                              display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                            }}>
                              <span style={{
                                color: col, fontSize: 13, fontWeight: 700,
                                textShadow: pct >= 66 ? `0 0 8px ${col}88` : 'none',
                              }}>{pct}%</span>
                              <div style={{ width: 48, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{
                                  width: `${pct}%`, height: '100%',
                                  background: col, borderRadius: 2,
                                  boxShadow: `0 0 4px ${col}88`,
                                }} />
                              </div>
                            </div>
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center', padding: '8px 6px' }}>
                        <span style={{ color: entCount > 0 ? CY : '#6E8AA0', fontSize: 11, fontWeight: 700 }}>{entCount}</span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 6px' }}>
                        {chip(`${rowAvg}%`, pctColor(rowAvg))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `1px solid ${CY}22` }}>
                  <td style={{ padding: '6px 8px', color: '#6E8AA0', fontSize: 9, letterSpacing: 1 }}>COL AVG</td>
                  {SIGNAL_KEYS.map((sk, j) => {
                    const colPcts = ENTITY_KEYS.map((_, i) => matrix[i][j]);
                    const colAvg = colPcts.length ? Math.round(colPcts.reduce((a, b) => a + b, 0) / colPcts.length) : 0;
                    return (
                      <td key={sk} style={{ textAlign: 'center', padding: '6px 6px' }}>
                        {chip(`${colAvg}%`, pctColor(colAvg))}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: 'center', padding: '6px 6px' }}>
                    <span style={{ color: CY, fontSize: 10, fontWeight: 700 }}>{totEntities}</span>
                  </td>
                  <td style={{ textAlign: 'center', padding: '6px 6px' }}>
                    {chip(`${avgPct}%`, pctColor(avgPct))}
                  </td>
                </tr>
              </tfoot>
            </table>
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
