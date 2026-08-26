/**
 * F80 — Report × Ops Event Coverage (RPOPS)
 *
 * Parallel-fetches /v1/reports + /v1/ops/events, then keyword-correlates
 * each ops event against the intelligence report corpus to surface:
 *   REPORTED   — at least one report covers this ops event's domain
 *   UNREPORTED — no report addresses this ops event — intelligence lag
 *
 * Stat tiles: ops events / reports / reported / unreported
 * Filter tabs: ALL | REPORTED | UNREPORTED + text search
 * Expand any event → matched reports with type badge + relevance score bar.
 * Amber badge on UNREPORTED count.
 * ▶ ASSESS: 2-sentence ops-reporting coverage brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ RPOPS  at bottom:8 left:690800, zIndex:262.
 * Event:   jarvis:rpops-toggle
 * Voice:   "report ops / ops report / rpops / unreported ops /
 *           ops reporting gap / ops report coverage / which ops events have reports /
 *           ops without reports / unresolved ops reporting"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API      = '';
const POLL_MS  = 90_000;
const AM       = '#f59e0b';

const RPOPS_RE =
  /\b(report[._-]?ops?|ops?[._-]?report|rpops|unreported[._-]?ops?|ops?[._-]?reporting[._-]?gap|ops?[._-]?report[._-]?coverage|which[._-]?ops?[._-]?events?[._-]?have[._-]?reports?|ops?[._-]?without[._-]?reports?|unresolved[._-]?ops?[._-]?reporting)\b/i;

export function isRpopsQuery(t) {
  return RPOPS_RE.test(t || '');
}

export async function buildRpopsScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [rptR, opsR] = await Promise.allSettled([
      fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
      fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
    ]);
    const reports = normaliseReports(rptR.status === 'fulfilled' ? rptR.value : []);
    const events  = normaliseOps(opsR.status === 'fulfilled' ? opsR.value : []);
    const enriched = correlate(events, reports);
    const reported   = enriched.filter(e => e._covered).length;
    const unreported = enriched.length - reported;
    const topGaps = enriched
      .filter(e => !e._covered)
      .slice(0, 4)
      .map(e => e.name)
      .join(', ') || 'none';

    return (
      `Report × Ops Event Coverage: ${events.length} ops events cross-matched against ` +
      `${reports.length} intelligence reports. ` +
      `${reported} ops events are REPORTED (intelligence corpus coverage found); ` +
      `${unreported} are UNREPORTED (no report addresses this domain — intelligence lag). ` +
      `Top unreported ops events: ${topGaps}.`
    );
  } catch {
    return 'Report × Ops Event Coverage assessment unavailable at this time, sir.';
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.reports)            ? raw.reports
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.data)              ? raw.data
    : [];
  return arr.map((r, i) => ({
    id:       r.id || r.report_id || String(i),
    name:     r.title || r.name || r.subject || `Report ${i + 1}`,
    type:     r.type || r.kind || r.category || '',
    summary:  (r.summary || r.abstract || r.description || r.content || '').toString().slice(0, 300),
    tags:     Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
    category: r.category || r.domain || '',
  }));
}

function normaliseOps(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.events)             ? raw.events
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.data)               ? raw.data
    : [];
  return arr.map((e, i) => ({
    id:          e.id || e.event_id || String(i),
    name:        e.name || e.title || e.event_name || e.type || `Event ${i + 1}`,
    type:        e.type || e.event_type || e.kind || '',
    severity:    e.severity || e.level || e.priority || '',
    description: (e.description || e.summary || e.details || e.message || '').toString().slice(0, 300),
    category:    e.category || e.domain || '',
    tags:        Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function matchScore(opsEvent, report) {
  const opsToks = new Set([
    ...tokens(opsEvent.name),
    ...tokens(opsEvent.description),
    ...tokens(opsEvent.type),
    ...tokens(opsEvent.category),
    ...tokens(opsEvent.tags),
  ].filter(Boolean));
  const rptToks = [
    ...tokens(report.name),
    ...tokens(report.summary),
    ...tokens(report.type),
    ...tokens(report.tags),
    ...tokens(report.category),
  ];
  if (!opsToks.size || !rptToks.length) return 0;
  let hits = 0;
  for (const t of rptToks) if (opsToks.has(t)) hits++;
  return hits / Math.max(opsToks.size, rptToks.length);
}

function correlate(opsEvents, reports) {
  return opsEvents.map(ev => {
    const scored = reports
      .map(r => ({ ...r, _score: matchScore(ev, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);
    return { ...ev, _matches: scored, _covered: scored.length > 0 };
  });
}

function severityColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s.includes('crit') || s.includes('high') || s === 'red')   return '#f87171';
  if (s.includes('warn') || s.includes('med') || s === 'amber')  return '#facc15';
  if (s.includes('info') || s.includes('low') || s === 'green')  return '#4ade80';
  return '#64748b';
}

// ── styles ────────────────────────────────────────────────────────────────────
const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW  = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

const TABS = ['ALL', 'REPORTED', 'UNREPORTED'];

// ── component ─────────────────────────────────────────────────────────────────
export default function ReportOpsEventCoverage() {
  const [open,      setOpen]      = useState(false);
  const [reports,   setReports]   = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
  const [enriched,  setEnriched]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState('');
  const [tab,       setTab]       = useState('ALL');
  const [search,    setSearch]    = useState('');
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment,setAssessment]= useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [rptR, opsR] = await Promise.allSettled([
        fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
      ]);
      const rawRpts = normaliseReports(rptR.status === 'fulfilled' ? rptR.value : []);
      const rawOps  = normaliseOps(opsR.status === 'fulfilled' ? opsR.value : []);
      setReports(rawRpts);
      setOpsEvents(rawOps);
      setEnriched(correlate(rawOps, rawRpts));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:rpops-toggle', h);
    return () => window.removeEventListener('jarvis:rpops-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const covered   = enriched.filter(e => e._covered).length;
    const uncovered = enriched.filter(e => !e._covered).length;
    const prompt =
      `Report × Ops Event Coverage: ${opsEvents.length} ops events cross-matched against ` +
      `${reports.length} intelligence reports. ${covered} ops events are REPORTED ` +
      `(at least one report covers the domain); ${uncovered} are UNREPORTED (intelligence lag — ` +
      `no report addresses this event). ` +
      `Top unreported ops events: ${enriched.filter(e => !e._covered).slice(0, 5).map(e => e.name).join(', ') || 'none'}. ` +
      `Provide a 2-sentence ops-reporting coverage assessment: which ops domains lack intelligence ` +
      `report coverage, and what the reporting gap implies for operational situational awareness.`;
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

  const unreportedCount = enriched.filter(e => !e._covered).length;
  const badgeColor = unreportedCount > 0 ? AM : '#22c55e';

  const visible = enriched.filter(ev => {
    if (search && !ev.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'REPORTED')   return ev._covered;
    if (tab === 'UNREPORTED') return !ev._covered;
    return true;
  });

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Report × Ops Event Coverage"
        style={{
          position: 'fixed',
          left: 690800,
          bottom: 8,
          zIndex: 262,
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
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: badgeColor,
          boxShadow: unreportedCount > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        RPOPS
        {unreportedCount > 0 && (
          <span style={{ background: badgeColor, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {unreportedCount}
          </span>
        )}
      </button>

      {/* ── panel ── */}
      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9103,
          width: 'min(720px, 96vw)',
          maxHeight: '82vh',
          background: 'rgba(8,14,24,0.96)',
          border: `1px solid ${AM}44`,
          borderRadius: 14,
          boxShadow: `0 0 60px ${AM}1a`,
          backdropFilter: 'blur(16px)',
          fontFamily: "'JetBrains Mono',monospace",
          color: '#e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: AM, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>◈ REPORT × OPS EVENT COVERAGE</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b' }}>
              {loading ? 'loading…' : err ? '⚠ ' + err : `${opsEvents.length} ops events · ${reports.length} reports`}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
            {[
              { label: 'OPS EVENTS',  val: enriched.length,                          color: '#94a3b8' },
              { label: 'REPORTS',     val: reports.length,                            color: '#22d3ee' },
              { label: 'REPORTED',    val: enriched.filter(e => e._covered).length,   color: '#22c55e' },
              { label: 'UNREPORTED',  val: unreportedCount,                           color: AM },
            ].map(t => (
              <div key={t.label} style={TILE}>
                <div style={{ fontSize: 20, fontWeight: 700, color: t.color }}>{t.val}</div>
                <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: tab === t ? AM : 'rgba(255,255,255,0.06)',
                color: tab === t ? '#000' : '#94a3b8',
                border: 'none',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search ops events…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 7, color: '#e2e8f0', padding: '3px 10px', fontSize: 11, outline: 'none', width: 170,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#475569', fontSize: 12 }}>No results</div>
            )}
            {visible.map(ev => {
              const isExp  = expanded === ev.id;
              const stClr  = ev._covered ? '#22c55e' : AM;
              const sevClr = severityColor(ev.severity);
              return (
                <div key={ev.id}>
                  <div
                    onClick={() => setExpanded(isExp ? null : ev.id)}
                    style={{ ...ROW, background: isExp ? `${AM}0d` : undefined }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isExp ? `${AM}0d` : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: stClr + '22', color: stClr }}>
                        {ev._covered ? 'REPORTED' : 'UNREPORTED'}
                      </span>
                      {ev.severity && (
                        <span style={{ ...PILL, background: sevClr + '22', color: sevClr }}>{ev.severity}</span>
                      )}
                      {ev.type && (
                        <span style={{ ...PILL, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>{ev.type}</span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</span>
                      {ev._matches?.length > 0 && (
                        <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>
                          {ev._matches.length} report{ev._matches.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* expanded: matched reports */}
                  {isExp && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 24px 10px' }}>
                      {ev._matches?.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#475569', padding: '6px 0' }}>
                          No intelligence reports cover this ops event domain — intelligence lag detected.
                        </div>
                      ) : (
                        ev._matches.map(rpt => (
                          <div key={rpt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            {rpt.type && (
                              <span style={{ ...PILL, background: 'rgba(34,211,238,0.15)', color: '#22d3ee', flexShrink: 0 }}>{rpt.type}</span>
                            )}
                            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rpt.name}</span>
                            <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                <div style={{ width: `${Math.min(100, rpt._score * 300)}%`, height: '100%', background: AM, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 9, color: '#64748b', minWidth: 22 }}>{(rpt._score * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={assess}
              disabled={assessing || enriched.length === 0}
              style={{
                padding: '5px 16px', borderRadius: 8, border: `1px solid ${AM}44`,
                background: assessing ? `${AM}26` : `${AM}14`,
                color: AM, cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1,
              }}
            >
              {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
            </button>
            {assessment && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#cbd5e1', lineHeight: 1.6, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px' }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
