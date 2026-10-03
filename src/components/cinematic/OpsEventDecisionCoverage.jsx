import { useState, useEffect, useCallback } from 'react';

const API = '';
const OEDC_RE = /\b(ops[._-]?decision|decision[._-]?ops|oedc|ops[._-]?event[._-]?decision|decision[._-]?ops[._-]?event|which[._-]?ops[._-]?events?[._-]?have[._-]?decisions?|ops[._-]?event[._-]?decision[._-]?coverage|ops[._-]?governance|decision[._-]?covered[._-]?ops)\b/i;

export function isOedcQuery(t) {
  return OEDC_RE.test(t || '');
}

export async function buildOedcScript() {
  const [evR, dcR] = await Promise.allSettled([
    fetch(`${API}/v1/ops/events`).then(r => r.json()),
    fetch(`${API}/v1/decision/list?limit=50`).then(r => r.json()),
  ]);
  const events = normaliseEvents(evR.status === 'fulfilled' ? evR.value : []);
  const decisions = normaliseDecisions(dcR.status === 'fulfilled' ? dcR.value : []);
  const enriched = correlate(events, decisions);
  const documented = enriched.filter(e => e._linked).length;
  const undocumented = enriched.length - documented;
  return (
    `OpsEvent × Decision Coverage: ${events.length} ops events, ${decisions.length} decisions indexed. ` +
    `${documented} events are backed by a decision; ${undocumented} have no decision governance. ` +
    `Top undocumented: ${enriched.filter(e => !e._linked).slice(0, 4).map(e => e.event_type || e.title || e.service || e.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseEvents(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['events', 'items', 'results', 'data', 'records']) {
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

function matchScore(event, decision) {
  const eToks = new Set([
    ...tokens(event.event_type),
    ...tokens(event.title),
    ...tokens(event.service),
    ...tokens(event.severity),
    ...tokens(event.source),
    ...tokens(event.message),
    ...tokens(event.description),
  ].filter(Boolean));
  const dToks = [
    ...tokens(decision.title),
    ...tokens(decision.body_md),
    ...tokens(decision.status),
    ...tokens(decision.kind),
    ...tokens(decision.summary),
  ].filter(Boolean);
  if (!eToks.size || !dToks.length) return 0;
  let hits = 0;
  for (const t of dToks) if (eToks.has(t)) hits++;
  return hits / Math.max(eToks.size, dToks.length);
}

function correlate(events, decisions) {
  return events.map(event => {
    const scored = decisions
      .map(decision => ({ decision, score: matchScore(event, decision) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...event, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';
const PR = '#A78BFA';

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

const DECISION_STATUS_COLOR = { final: GR, approved: GR, draft: AM, pending: AM, reviewed: CY };

export default function OpsEventDecisionCoverage() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
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
      const [evR, dcR] = await Promise.allSettled([
        fetch(`${API}/v1/ops/events`).then(r => r.json()),
        fetch(`${API}/v1/decision/list?limit=50`).then(r => r.json()),
      ]);
      setEvents(normaliseEvents(evR.status === 'fulfilled' ? evR.value : []));
      setDecisions(normaliseDecisions(dcR.status === 'fulfilled' ? dcR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:oedc-toggle', onToggle);
    return () => window.removeEventListener('jarvis:oedc-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(events, decisions);
  const documented = enriched.filter(e => e._linked);
  const undocumented = enriched.filter(e => !e._linked);
  const badgeCount = undocumented.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(e => tab === 'ALL' || (tab === 'DOCUMENTED' ? e._linked : !e._linked))
    .filter(e => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(e.event_type || '').toLowerCase().includes(q) ||
        String(e.title || '').toLowerCase().includes(q) ||
        String(e.service || '').toLowerCase().includes(q) ||
        String(e.severity || '').toLowerCase().includes(q) ||
        String(e.source || '').toLowerCase().includes(q)
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
          message: `You have ${events.length} ops events and ${decisions.length} decisions. ${documented.length} events are backed by a decision; ${undocumented.length} have no decision governance. Give a 2-sentence ops-decision coverage brief identifying the key governance gap and which undocumented event types most need decision backing.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const eventLabel = e => e.event_type || e.title || e.service || e.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="OpsEvent × Decision Coverage (OEDC)"
        style={{
          position: 'fixed', left: 766240, bottom: 8, zIndex: 262,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ OEDC
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
              ◈ OPS EVENT × DECISION COVERAGE
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
              { label: 'OPS EVENTS', val: events.length, col: CY },
              { label: 'DECISIONS', val: decisions.length, col: PR },
              { label: 'DOCUMENTED', val: documented.length, col: GR },
              { label: 'UNDOCUMENTED', val: undocumented.length, col: AM },
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
            {['ALL', 'DOCUMENTED', 'UNDOCUMENTED'].map(t => (
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
              placeholder="search events…"
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
                {loading ? 'Loading…' : 'No ops events found.'}
              </div>
            ) : filtered.map((event, i) => {
              const isExp = expanded === i;
              const statusColor = event._linked ? GR : AM;
              const sevColor =
                event.severity === 'high' || event.severity === 'critical' ? RD :
                event.severity === 'medium' ? AM : CY;
              return (
                <div
                  key={event.id || i}
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
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{eventLabel(event)}</span>
                    {event.service && chip(event.service, CY)}
                    {event.severity && chip(event.severity, sevColor)}
                    {chip(event._linked ? 'DOCUMENTED' : 'UNDOCUMENTED', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {event.source && (
                        <div style={{ marginBottom: 4 }}>
                          {chip('source', '#6E8AA0')}
                          <span style={{ color: '#6E8AA0', fontSize: 10 }}>{event.source}</span>
                        </div>
                      )}
                      {event._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED DECISIONS
                          </div>
                          {event._matches.map(({ decision, score }, j) => {
                            const st = String(decision.status || '').toLowerCase();
                            const stColor = DECISION_STATUS_COLOR[st] || CY;
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                {st && chip(st, stColor)}
                                {decision.quality_score != null && (
                                  <span style={{ color: '#6E8AA0', fontSize: 9 }}>
                                    q={Number(decision.quality_score).toFixed(2)}
                                  </span>
                                )}
                                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                  {decision.title || decision.name || decision.id || '?'}
                                </span>
                                {scorebar(score, GR)}
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10 }}>No decisions matched this ops event.</div>
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
