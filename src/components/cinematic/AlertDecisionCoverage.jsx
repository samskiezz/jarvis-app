import { useState, useEffect, useCallback } from 'react';

const API = '';
const ALDC_RE = /\b(alert[._-]?decision|decision[._-]?alert|aldc|governed[._-]?alert|alert[._-]?with[._-]?decision|alert[._-]?governance|which[._-]?alert[._-]?have[._-]?decision|alert[._-]?decision[._-]?coverage|ungoverned[._-]?alert|alert[._-]?backed)\b/i;

export function isAldcQuery(t) {
  return ALDC_RE.test(t || '');
}

export async function buildAldcScript() {
  const [alR, dcR] = await Promise.allSettled([
    fetch(`${API}/v1/alerts`).then(r => r.json()),
    fetch(`${API}/v1/decision/list?limit=50`).then(r => r.json()),
  ]);
  const alerts = normaliseAlerts(alR.status === 'fulfilled' ? alR.value : []);
  const decisions = normaliseDecisions(dcR.status === 'fulfilled' ? dcR.value : []);
  const enriched = correlate(alerts, decisions);
  const governed = enriched.filter(a => a._linked).length;
  const ungoverned = enriched.length - governed;
  return (
    `Alert × Decision Coverage: ${alerts.length} alerts, ${decisions.length} decisions indexed. ` +
    `${governed} alerts have decision governance backing; ${ungoverned} lack any decision coverage. ` +
    `Top ungoverned: ${enriched.filter(a => !a._linked).slice(0, 4).map(a => a.category || a.type || a.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseAlerts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['alerts', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseDecisions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['decisions', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(alert, decision) {
  const aToks = new Set([
    ...tokens(alert.category),
    ...tokens(alert.type),
    ...tokens(alert.message),
    ...tokens(alert.title),
    ...tokens(alert.description),
    ...tokens(alert.source),
    ...tokens(alert.severity),
  ].filter(Boolean));
  const dcToks = [
    ...tokens(decision.title),
    ...tokens(decision.body_md),
    ...tokens(decision.summary),
    ...tokens(decision.kind),
  ].filter(Boolean);
  if (!aToks.size || !dcToks.length) return 0;
  let hits = 0;
  for (const t of dcToks) if (aToks.has(t)) hits++;
  return hits / Math.max(aToks.size, dcToks.length);
}

function correlate(alerts, decisions) {
  return alerts.map(alert => {
    const scored = decisions
      .map(decision => ({ decision, score: matchScore(alert, decision) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...alert, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PR = '#A78BFA';
const RD = '#F43F5E';

const SEV_COLOR = { high: RD, critical: RD, medium: AM, low: GR };
const STATUS_COLOR = { final: GR, draft: AM, reviewed: CY };

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

export default function AlertDecisionCoverage() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [alR, dcR] = await Promise.allSettled([
        fetch(`${API}/v1/alerts`).then(r => r.json()),
        fetch(`${API}/v1/decision/list?limit=50`).then(r => r.json()),
      ]);
      setAlerts(normaliseAlerts(alR.status === 'fulfilled' ? alR.value : []));
      setDecisions(normaliseDecisions(dcR.status === 'fulfilled' ? dcR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:aldc-toggle', onToggle);
    return () => window.removeEventListener('jarvis:aldc-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(alerts, decisions);
  const governed = enriched.filter(a => a._linked);
  const ungoverned = enriched.filter(a => !a._linked);
  const badgeCount = ungoverned.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(a => tab === 'ALL' || (tab === 'GOVERNED' ? a._linked : !a._linked))
    .filter(a => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(a.category || '').toLowerCase().includes(q) ||
        String(a.type || '').toLowerCase().includes(q) ||
        String(a.message || '').toLowerCase().includes(q) ||
        String(a.severity || '').toLowerCase().includes(q) ||
        String(a.source || '').toLowerCase().includes(q)
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
          message: `You have ${alerts.length} alerts and ${decisions.length} decisions. ${governed.length} alerts have decision governance backing; ${ungoverned.length} have no coverage. Give a 2-sentence alert-governance brief identifying the key gap pattern and which alert categories most urgently need decision backing.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const alertLabel = a => a.category || a.type || a.title || a.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Alert × Decision Coverage (ALDC)"
        style={{
          position: 'fixed', left: 779920, bottom: 8, zIndex: 265,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ ALDC
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
              ◈ ALERT × DECISION COVERAGE
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
              { label: 'ALERTS', val: alerts.length, col: RD },
              { label: 'DECISIONS', val: decisions.length, col: PR },
              { label: 'GOVERNED', val: governed.length, col: GR },
              { label: 'UNGOVERNED', val: ungoverned.length, col: AM },
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
            {['ALL', 'GOVERNED', 'UNGOVERNED'].map(t => (
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
              placeholder="search alerts…"
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
                {loading ? 'Loading…' : 'No alerts found.'}
              </div>
            ) : filtered.map((alert, i) => {
              const isExp = expanded === i;
              const statusColor = alert._linked ? GR : AM;
              const sevCol = SEV_COLOR[String(alert.severity || '').toLowerCase()] || CY;
              return (
                <div
                  key={alert.id || i}
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
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{alertLabel(alert)}</span>
                    {alert.severity && chip(alert.severity, sevCol)}
                    {alert.source && chip(alert.source, AM)}
                    {chip(alert._linked ? 'GOVERNED' : 'UNGOVERNED', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {alert._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED DECISIONS
                          </div>
                          {alert._matches.map(({ decision, score }, j) => {
                            const statusCol = STATUS_COLOR[String(decision.status || '').toLowerCase()] || AM;
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                {decision.status && chip(decision.status, statusCol)}
                                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                  {decision.title || decision.id || '?'}
                                </span>
                                {scorebar(score, GR)}
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10 }}>No decisions matched this alert.</div>
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
