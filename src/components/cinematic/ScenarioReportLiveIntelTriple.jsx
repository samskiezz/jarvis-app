import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCRLIVE_RE = /\b(scrlive|scenario\s+report\s+live|live\s+scenario\s+report|scenario\s+live\s+intel\s+report|briefed\s+scenario\s+live|live\s+triggered\s+scenario|scenario\s+intel\s+live)\b/i;

const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseScenarios(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.scenarios) ? data.scenarios
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(s => ({
    id: s.id || s._id || s.scenarioId || String(Math.random()),
    name: s.name || s.title || s.label || 'Untitled Scenario',
    description: s.description || s.summary || s.objective || '',
    type: s.type || s.category || s.phase || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    raw: s,
  }));
}

function normaliseReports(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.reports) ? data.reports
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(r => ({
    id: r.id || r._id || r.reportId || String(Math.random()),
    name: r.name || r.title || r.label || 'Untitled Report',
    description: r.description || r.summary || r.body || r.content || '',
    type: r.type || r.category || r.kind || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    raw: r,
  }));
}

function normaliseLiveIntel(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.events) ? data.events
    : Array.isArray(data.intel) ? data.intel
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(e => ({
    id: e.id || e._id || e.eventId || String(Math.random()),
    name: e.name || e.title || e.headline || e.summary || 'Live Event',
    description: e.description || e.body || e.content || e.details || '',
    source: e.source || e.origin || e.feed || '',
    tags: Array.isArray(e.tags) ? e.tags.join(' ') : String(e.tags || ''),
    raw: e,
  }));
}

function correlate(scenarios, reports, liveIntel) {
  return scenarios.map(scenario => {
    const toks = tok([scenario.name, scenario.description, scenario.type, scenario.tags].join(' '));

    const matchedReports = reports
      .map(r => {
        const score = Math.max(
          matchScore(toks, r.name),
          matchScore(toks, r.description),
          matchScore(toks, r.type),
          matchScore(toks, r.tags),
        );
        return { ...r, matchScore: score };
      })
      .filter(r => r.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const matchedLiveIntel = liveIntel
      .map(e => {
        const score = Math.max(
          matchScore(toks, e.name),
          matchScore(toks, e.description),
          matchScore(toks, e.source),
          matchScore(toks, e.tags),
        );
        return { ...e, matchScore: score };
      })
      .filter(e => e.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasReport = matchedReports.length > 0;
    const hasLive = matchedLiveIntel.length > 0;

    let state;
    if (hasReport && hasLive) state = 'FULLY BRIEFED';
    else if (hasReport) state = 'REPORTED';
    else if (hasLive) state = 'LIVE-TRIGGERED';
    else state = 'DARK';

    return { scenario, matchedReports, matchedLiveIntel, state };
  });
}

export function isScrliveQuery(t) {
  return SCRLIVE_RE.test(t || '');
}

export async function buildScrliveScript() {
  try {
    const [scenRes, repRes, liveRes] = await Promise.allSettled([
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : null),
    ]);

    const scenarios = normaliseScenarios(scenRes.status === 'fulfilled' ? scenRes.value : null);
    const reports = normaliseReports(repRes.status === 'fulfilled' ? repRes.value : null);
    const liveIntel = normaliseLiveIntel(liveRes.status === 'fulfilled' ? liveRes.value : null);
    const rows = correlate(scenarios, reports, liveIntel);

    const fullyBriefed = rows.filter(r => r.state === 'FULLY BRIEFED').length;
    const reported = rows.filter(r => r.state === 'REPORTED').length;
    const liveTriggered = rows.filter(r => r.state === 'LIVE-TRIGGERED').length;
    const dark = rows.filter(r => r.state === 'DARK').length;

    return `SCRLIVE Scenario×Report×LiveIntel: ${rows.length} scenarios analysed. ` +
      `${fullyBriefed} FULLY BRIEFED (report + live event), ` +
      `${reported} REPORTED (report only), ${liveTriggered} LIVE-TRIGGERED (live event, no report), ${dark} DARK. ` +
      (liveTriggered > 0
        ? `Top live-triggered gap: "${rows.find(r => r.state === 'LIVE-TRIGGERED')?.scenario.name || 'see panel'}" — scenario is firing in the real world with no intelligence report.`
        : dark > 0
          ? `${dark} scenarios have no report or live event coverage.`
          : 'All scenarios have report or live event coverage.');
  } catch {
    return 'SCRLIVE: data fetch failed.';
  }
}

export default function ScenarioReportLiveIntelTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:scrlive-toggle', handler);
    return () => window.removeEventListener('jarvis:scrlive-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [scenRes, repRes, liveRes] = await Promise.allSettled([
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);

      const scenarios = normaliseScenarios(scenRes.status === 'fulfilled' ? scenRes.value : null);
      const reports = normaliseReports(repRes.status === 'fulfilled' ? repRes.value : null);
      const liveIntel = normaliseLiveIntel(liveRes.status === 'fulfilled' ? liveRes.value : null);

      setRows(correlate(scenarios, reports, liveIntel));
      setLastRefresh(new Date());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyBriefed  = rows.filter(r => r.state === 'FULLY BRIEFED').length;
  const reported      = rows.filter(r => r.state === 'REPORTED').length;
  const liveTriggered = rows.filter(r => r.state === 'LIVE-TRIGGERED').length;
  const dark          = rows.filter(r => r.state === 'DARK').length;

  const TABS = ['ALL', 'FULLY BRIEFED', 'REPORTED', 'LIVE-TRIGGERED', 'DARK'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.scenario.name.toLowerCase().includes(q) ||
        r.matchedReports.some(rp => rp.name.toLowerCase().includes(q)) ||
        r.matchedLiveIntel.some(e => e.name.toLowerCase().includes(q));
    }
    return true;
  });

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Scenario "${row.scenario.name}" [${row.state}]: ` +
      `matched reports: ${row.matchedReports.map(r => r.name).join(', ') || 'none'}. ` +
      `matched live intel events: ${row.matchedLiveIntel.map(e => e.name).join(', ') || 'none'}. ` +
      `Give a 2-sentence scenario intelligence briefing — does this scenario have adequate report coverage and live-event validation, or is there an intelligence gap?`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'No assessment returned.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, []);

  const STATE_COLOUR = {
    'FULLY BRIEFED':  '#22d3ee',
    'REPORTED':       '#a78bfa',
    'LIVE-TRIGGERED': '#f87171',
    'DARK':           '#888',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 777600,
          bottom: 8,
          zIndex: 417,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #22d3ee44',
          color: '#22d3ee',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ SCRLIVE
        {liveTriggered > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#f87171',
            color: '#fff',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {liveTriggered}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 16,
      width: 700,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #22d3ee55',
      borderRadius: 8,
      zIndex: 417,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #22d3ee22',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #22d3ee22',
        background: 'rgba(34,211,238,0.05)',
      }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, letterSpacing: 1 }}>
          ◈ SCENARIO × REPORT × LIVE INTEL
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastRefresh && (
            <span style={{ color: '#555', fontSize: 10 }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: 'none',
              border: '1px solid #22d3ee44',
              color: '#22d3ee',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            {loading ? '…' : '↻'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #22d3ee11' }}>
        {[
          { label: 'FULLY BRIEFED',  val: fullyBriefed,  col: '#22d3ee' },
          { label: 'REPORTED',       val: reported,       col: '#a78bfa' },
          { label: 'LIVE-TRIGGERED', val: liveTriggered,  col: '#f87171' },
          { label: 'DARK',           val: dark,           col: '#888'    },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(34,211,238,0.04)',
            border: `1px solid ${s.col}33`,
            borderRadius: 4,
            padding: '6px 4px',
          }}>
            <div style={{ color: s.col, fontSize: 18, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#556', fontSize: 9, letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #22d3ee11' }}>
          <div style={{ fontSize: 10, color: '#556', marginBottom: 3 }}>
            COVERAGE — {Math.round((fullyBriefed / rows.length) * 100)}% fully briefed
          </div>
          <div style={{ height: 4, background: '#111', borderRadius: 2, display: 'flex', overflow: 'hidden' }}>
            <div style={{ width: `${(fullyBriefed / rows.length) * 100}%`, background: '#22d3ee' }} />
            <div style={{ width: `${(reported / rows.length) * 100}%`, background: '#a78bfa' }} />
            <div style={{ width: `${(liveTriggered / rows.length) * 100}%`, background: '#f87171' }} />
            <div style={{ width: `${(dark / rows.length) * 100}%`, background: '#333' }} />
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #22d3ee11', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? 'rgba(34,211,238,0.18)' : 'none',
              border: `1px solid ${filter === t ? '#22d3ee' : '#22d3ee22'}`,
              color: filter === t ? '#22d3ee' : '#556',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(34,211,238,0.05)',
            border: '1px solid #22d3ee22',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 10,
            fontFamily: 'monospace',
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ padding: '6px 12px', color: '#ff4444', fontSize: 11 }}>
          {err}
        </div>
      )}

      {/* Loading */}
      {loading && !rows.length && (
        <div style={{ padding: '16px 12px', color: '#556', textAlign: 'center' }}>
          Loading…
        </div>
      )}

      {/* Rows */}
      <div>
        {visible.map((row, i) => {
          const key = row.scenario.id + i;
          const isExpanded = expanded === key;
          return (
            <div
              key={key}
              style={{ borderBottom: '1px solid #22d3ee0a', padding: '6px 12px' }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => setExpanded(isExpanded ? null : key)}
              >
                <span style={{
                  display: 'inline-block',
                  minWidth: 118,
                  fontSize: 9,
                  fontWeight: 700,
                  color: STATE_COLOUR[row.state],
                  background: `${STATE_COLOUR[row.state]}18`,
                  border: `1px solid ${STATE_COLOUR[row.state]}44`,
                  borderRadius: 3,
                  padding: '1px 5px',
                  letterSpacing: 0.5,
                  textAlign: 'center',
                }}>
                  {row.state}
                </span>
                <span style={{ flex: 1, color: '#c8e6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.scenario.name}
                </span>
                <span style={{ fontSize: 9, color: '#a78bfa88' }}>
                  {row.matchedReports.length}R
                </span>
                <span style={{ fontSize: 9, color: '#f8717188' }}>
                  {row.matchedLiveIntel.length}LI
                </span>
                <span style={{ color: '#444', fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  {/* Reports */}
                  <div style={{ flex: 1, background: 'rgba(167,139,250,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      REPORTS ({row.matchedReports.length})
                    </div>
                    {row.matchedReports.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No report match</div>
                    ) : (
                      row.matchedReports.slice(0, 5).map((r, k) => (
                        <div key={r.id + k} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: '#c8e6ff', fontSize: 10 }}>{r.name}</span>
                            {r.type && (
                              <span style={{ fontSize: 9, color: '#a78bfa88' }}>{r.type}</span>
                            )}
                          </div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(r.matchScore * 100)}%`, background: '#a78bfa', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Live Intel */}
                  <div style={{ flex: 1, background: 'rgba(248,113,113,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#f87171', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      LIVE INTEL ({row.matchedLiveIntel.length})
                    </div>
                    {row.matchedLiveIntel.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No live event match</div>
                    ) : (
                      row.matchedLiveIntel.slice(0, 5).map((e, k) => (
                        <div key={e.id + k} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: '#c8e6ff', fontSize: 10 }}>{e.name}</span>
                            {e.source && (
                              <span style={{ fontSize: 9, color: '#f8717188' }}>{e.source}</span>
                            )}
                          </div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(e.matchScore * 100)}%`, background: '#f87171', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {isExpanded && (
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      background: 'rgba(34,211,238,0.1)',
                      border: '1px solid #22d3ee44',
                      color: '#22d3ee',
                      padding: '3px 12px',
                      borderRadius: 3,
                      fontSize: 10,
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                    }}
                  >
                    {assessing ? '…' : '▶ ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {!loading && !err && visible.length === 0 && rows.length > 0 && (
          <div style={{ padding: '12px', color: '#556', textAlign: 'center', fontSize: 11 }}>
            No items match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}
