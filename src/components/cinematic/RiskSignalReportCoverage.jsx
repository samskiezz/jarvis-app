import { useState, useEffect, useCallback } from 'react';

const API = '';
const RSRPT_RE = /\b(risk[._-]?report|report[._-]?risk[._-]?signal|rsrpt|risk[._-]?coverage[._-]?report|risk[._-]?signal[._-]?reports?|which[._-]?risks?[._-]?have[._-]?reports?|risk[._-]?signal[._-]?report[._-]?coverage|undocumented[._-]?risks?[._-]?report|risk[._-]?report[._-]?gap|risk[._-]?intelligence[._-]?report)\b/i;

export function isRsrptQuery(t) {
  return RSRPT_RE.test(t || '');
}

export async function buildRsrptScript() {
  const [rsR, rpR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/v1/reports`).then(r => r.json()),
  ]);
  const signals = normaliseSignals(rsR.status === 'fulfilled' ? rsR.value : []);
  const reports = normaliseReports(rpR.status === 'fulfilled' ? rpR.value : []);
  const enriched = correlate(signals, reports);
  const covered = enriched.filter(s => s._linked).length;
  const undocumented = enriched.length - covered;
  return (
    `Risk Signal × Report Coverage: ${signals.length} risk signals, ${reports.length} reports indexed. ` +
    `${covered} signals have report documentation; ${undocumented} have no report coverage. ` +
    `Top undocumented: ${enriched.filter(s => !s._linked).slice(0, 4).map(s => s.name || s.title || s.category || s.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseSignals(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['signals', 'risk_signals', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseReports(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['reports', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(signal, report) {
  const sToks = new Set([
    ...tokens(signal.name),
    ...tokens(signal.title),
    ...tokens(signal.category),
    ...tokens(signal.sector),
    ...tokens(signal.description),
    ...tokens(signal.source),
    ...tokens(signal.type),
  ].filter(Boolean));
  const rToks = [
    ...tokens(report.title),
    ...tokens(report.content),
    ...tokens(report.summary),
    ...tokens(report.tags),
    ...tokens(report.body),
    ...tokens(report.text),
  ].filter(Boolean);
  if (!sToks.size || !rToks.length) return 0;
  let hits = 0;
  for (const t of rToks) if (sToks.has(t)) hits++;
  return hits / Math.max(sToks.size, rToks.length);
}

function correlate(signals, reports) {
  return signals.map(signal => {
    const scored = reports
      .map(report => ({ report, score: matchScore(signal, report) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...signal, _linked: scored.length > 0, _matches: scored };
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

const SEVERITY_COLOR = { high: RD, critical: RD, medium: AM, low: GR };

export default function RiskSignalReportCoverage() {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rsR, rpR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/v1/reports`).then(r => r.json()),
      ]);
      setSignals(normaliseSignals(rsR.status === 'fulfilled' ? rsR.value : []));
      setReports(normaliseReports(rpR.status === 'fulfilled' ? rpR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rsrpt-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rsrpt-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(signals, reports);
  const covered = enriched.filter(s => s._linked);
  const undocumented = enriched.filter(s => !s._linked);
  const badgeCount = undocumented.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(s => tab === 'ALL' || (tab === 'COVERED' ? s._linked : !s._linked))
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.title || '').toLowerCase().includes(q) ||
        String(s.category || '').toLowerCase().includes(q) ||
        String(s.sector || '').toLowerCase().includes(q) ||
        String(s.description || '').toLowerCase().includes(q)
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
          message: `You have ${signals.length} risk signals and ${reports.length} reports. ${covered.length} signals have report documentation; ${undocumented.length} have no report coverage. Give a 2-sentence risk-report coverage brief identifying the key intelligence gap and which undocumented risk signals most urgently need a dedicated report.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const sigLabel = s => s.name || s.title || s.category || s.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Risk Signal × Report Coverage (RSRPT)"
        style={{
          position: 'fixed', left: 761680, bottom: 8, zIndex: 261,
          width: 60, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ RSRPT
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
              ◈ RISK SIGNAL × REPORT COVERAGE
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
              { label: 'RISK SIGNALS', val: signals.length, col: CY },
              { label: 'REPORTS', val: reports.length, col: PR },
              { label: 'COVERED', val: covered.length, col: GR },
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

          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0 }}>
            {['ALL', 'COVERED', 'UNDOCUMENTED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, fontSize: 9, letterSpacing: 1, cursor: 'pointer',
                  border: `1px solid ${tab === t ? CY : CY + '33'}`,
                  background: tab === t ? `${CY}18` : 'transparent',
                  color: tab === t ? CY : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search risk signals…"
              style={{
                marginLeft: 'auto', background: 'rgba(0,207,255,0.06)', border: `1px solid ${CY}33`,
                borderRadius: 3, color: '#DCEBF5', fontSize: 10, padding: '2px 8px',
                outline: 'none', fontFamily: 'inherit', width: 150,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 && (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 24 }}>
                {loading ? 'loading…' : 'no risk signals found'}
              </div>
            )}
            {filtered.map((signal, i) => {
              const label = sigLabel(signal);
              const isExpanded = expanded === i;
              const linkColor = signal._linked ? GR : AM;
              const sevColor = SEVERITY_COLOR[String(signal.severity || '').toLowerCase()] || CY;
              return (
                <div
                  key={signal.id || i}
                  style={{
                    borderRadius: 6, border: `1px solid ${linkColor}22`,
                    background: `${linkColor}08`, marginBottom: 6, overflow: 'hidden',
                  }}
                >
                  <div
                    onClick={() => setExpanded(isExpanded ? null : i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: linkColor, flexShrink: 0,
                      boxShadow: signal._linked ? undefined : `0 0 6px ${AM}`,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label}</span>
                    {signal.category && chip(signal.category, CY)}
                    {signal.severity && chip(signal.severity, sevColor)}
                    {chip(signal._linked ? 'COVERED' : 'UNDOCUMENTED', linkColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '6px 10px 8px 24px', borderTop: `1px solid ${linkColor}22` }}>
                      {signal.sector && (
                        <div style={{ marginBottom: 4 }}>{chip(signal.sector, PR)}</div>
                      )}
                      {signal.description && (
                        <div style={{ color: '#6E8AA0', fontSize: 10, marginBottom: 6 }}>
                          {String(signal.description).slice(0, 120)}{signal.description?.length > 120 ? '…' : ''}
                        </div>
                      )}
                      {signal._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#4E6070', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED REPORTS ({signal._matches.length})
                          </div>
                          {signal._matches.map(({ report: rp, score }, j) => (
                            <div
                              key={rp.id || j}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '3px 0', borderBottom: j < signal._matches.length - 1 ? `1px solid ${CY}11` : 'none',
                              }}
                            >
                              <span style={{ color: '#7A95AB', fontSize: 10, flex: 1 }}>
                                {rp.title || rp.name || rp.id || '?'}
                              </span>
                              {scorebar(score, GR)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10, letterSpacing: 1 }}>
                          ⚠ NO REPORT COVERAGE — intelligence gap
                        </div>
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
              color: '#7A95AB', fontSize: 10, lineHeight: 1.5, flexShrink: 0,
            }}>
              {brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
