import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const DRINVCO_RE = /\b(drinvco|dataset\s+report\s+invest(?:igation)?|dataset\s+invest(?:igation)?\s+report|data(?:set)?\s+case\s+report|dataset\s+case|active\s+dataset|reported\s+dataset|investigated\s+dataset|dark\s+dataset\s+report|dataset\s+coverage\s+triple|dataset\s+intel(?:ligence)?\s+case|dataset\s+report\s+investigation|data\s+report\s+case|dataset\s+intelligence\s+coverage)\b/i;

const THRESHOLD = 0.08;

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

function normaliseDatasets(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.datasets) ? data.datasets
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(d => ({
    id: d.id || d._id || String(Math.random()),
    name: d.name || d.title || d.label || 'Unnamed Dataset',
    description: d.description || d.summary || d.abstract || '',
    kind: d.kind || d.type || d.category || '',
    tags: Array.isArray(d.tags) ? d.tags.join(' ') : String(d.tags || ''),
    source: d.source || d.origin || '',
    raw: d,
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
    id: r.id || r._id || String(Math.random()),
    name: r.name || r.title || r.label || 'Unnamed Report',
    description: r.description || r.summary || r.abstract || '',
    type: r.type || r.kind || r.category || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    raw: r,
  }));
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.investigations) ? data.investigations
    : Array.isArray(data.cases) ? data.cases
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(i => ({
    id: i.id || i._id || i.caseId || String(Math.random()),
    name: i.name || i.title || i.subject || i.label || 'Unnamed Investigation',
    description: i.description || i.summary || i.abstract || '',
    status: i.status || i.state || '',
    kind: i.kind || i.type || i.category || '',
    tags: Array.isArray(i.tags) ? i.tags.join(' ') : String(i.tags || ''),
    raw: i,
  }));
}

function correlate(datasets, reports, investigations) {
  return datasets.map(ds => {
    const toks = tok([ds.name, ds.description, ds.kind, ds.tags, ds.source].join(' '));

    const matchedReports = reports
      .map(r => {
        const score = Math.max(
          matchScore(toks, r.name),
          matchScore(toks, r.description),
          matchScore(toks, r.type),
          matchScore(toks, r.tags),
        );
        return { ...r, score };
      })
      .filter(r => r.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedInvestigations = investigations
      .map(i => {
        const score = Math.max(
          matchScore(toks, i.name),
          matchScore(toks, i.description),
          matchScore(toks, i.kind),
          matchScore(toks, i.tags),
        );
        return { ...i, score };
      })
      .filter(i => i.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasReport = matchedReports.length > 0;
    const hasInvestigation = matchedInvestigations.length > 0;

    let state;
    if (hasReport && hasInvestigation) state = 'FULLY ACTIVE';
    else if (hasReport) state = 'REPORTED';
    else if (hasInvestigation) state = 'INVESTIGATED';
    else state = 'DARK';

    return { ds, matchedReports, matchedInvestigations, state };
  });
}

export function isDrinvcoQuery(t) {
  return DRINVCO_RE.test(t || '');
}

export async function buildDrinvcoScript() {
  try {
    const [dRes, rRes, iRes] = await Promise.allSettled([
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : null),
    ]);
    const datasets = normaliseDatasets(dRes.status === 'fulfilled' ? dRes.value : null);
    const reports = normaliseReports(rRes.status === 'fulfilled' ? rRes.value : null);
    const investigations = normaliseInvestigations(iRes.status === 'fulfilled' ? iRes.value : null);
    const rows = correlate(datasets, reports, investigations);
    const fully = rows.filter(r => r.state === 'FULLY ACTIVE').length;
    const reported = rows.filter(r => r.state === 'REPORTED').length;
    const investigated = rows.filter(r => r.state === 'INVESTIGATED').length;
    const dark = rows.filter(r => r.state === 'DARK').length;
    return `DRINVCO Dataset×Report×Investigation: ${rows.length} datasets analysed. ` +
      `${fully} FULLY ACTIVE (report + investigation), ` +
      `${reported} REPORTED (no case), ${investigated} INVESTIGATED (no report), ${dark} DARK (no coverage). ` +
      (dark > 0 ? `${dark} datasets have no report or investigation coverage — intelligence blind spot.` :
        fully > 0 ? `Top active: ${rows.find(r => r.state === 'FULLY ACTIVE')?.ds.name || 'see panel'}.` :
        'No fully active datasets at this time.');
  } catch {
    return 'DRINVCO: data fetch failed.';
  }
}

export default function DatasetReportInvestTriple() {
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
    window.addEventListener('jarvis:drinvco-toggle', handler);
    return () => window.removeEventListener('jarvis:drinvco-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [dRes, rRes, iRes] = await Promise.allSettled([
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const datasets = normaliseDatasets(dRes.status === 'fulfilled' ? dRes.value : null);
      const reports = normaliseReports(rRes.status === 'fulfilled' ? rRes.value : null);
      const investigations = normaliseInvestigations(iRes.status === 'fulfilled' ? iRes.value : null);
      if (!datasets.length && !reports.length && !investigations.length) {
        setErr('No data returned from Datasets, Reports, or Investigations endpoints.');
      }
      setRows(correlate(datasets, reports, investigations));
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
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fully = rows.filter(r => r.state === 'FULLY ACTIVE').length;
  const reported = rows.filter(r => r.state === 'REPORTED').length;
  const investigated = rows.filter(r => r.state === 'INVESTIGATED').length;
  const dark = rows.filter(r => r.state === 'DARK').length;

  const TABS = ['ALL', 'FULLY ACTIVE', 'REPORTED', 'INVESTIGATED', 'DARK'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.ds.name.toLowerCase().includes(q) ||
        r.ds.description.toLowerCase().includes(q) ||
        r.matchedReports.some(rep => rep.name.toLowerCase().includes(q)) ||
        r.matchedInvestigations.some(inv => inv.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const cbw = total > 0 ? {
    fully: (fully / total) * 100,
    reported: (reported / total) * 100,
    investigated: (investigated / total) * 100,
    dark: (dark / total) * 100,
  } : { fully: 0, reported: 0, investigated: 0, dark: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Dataset "${row.ds.name}" [${row.state}]: ` +
      `reports: ${row.matchedReports.map(r => r.name).join(', ') || 'none'}. ` +
      `investigations: ${row.matchedInvestigations.map(i => i.name).join(', ') || 'none'}. ` +
      `Kind: ${row.ds.kind || 'unknown'}. ` +
      `Give a 2-sentence dataset intelligence and investigation coverage brief.`;
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
    'FULLY ACTIVE': '#00e5ff',
    'REPORTED': '#00bcd4',
    'INVESTIGATED': '#ff9800',
    'DARK': '#555',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 814560,
          bottom: 8,
          zIndex: 483,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #00e5ff44',
          color: '#00e5ff',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ DRINVCO
        {fully > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#00e5ff',
            color: '#001820',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {fully}
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
      width: 680,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #00e5ff55',
      borderRadius: 8,
      zIndex: 483,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #00e5ff22',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #00e5ff22',
        background: 'rgba(0,229,255,0.05)',
      }}>
        <span style={{ color: '#00e5ff', fontWeight: 700, letterSpacing: 1 }}>
          ◈ DATASET × REPORT × INVESTIGATION
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
              border: '1px solid #00e5ff44',
              color: '#00e5ff',
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
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #00e5ff11' }}>
        {[
          { label: 'FULLY ACTIVE', val: fully, col: '#00e5ff' },
          { label: 'REPORTED', val: reported, col: '#00bcd4' },
          { label: 'INVESTIGATED', val: investigated, col: '#ff9800' },
          { label: 'DARK', val: dark, col: '#555' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(0,229,255,0.04)',
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
      {total > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #00e5ff11' }}>
          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: '#001828' }}>
            <div style={{ width: `${cbw.fully}%`, background: '#00e5ff', transition: 'width 0.4s' }} />
            <div style={{ width: `${cbw.reported}%`, background: '#00bcd4', transition: 'width 0.4s' }} />
            <div style={{ width: `${cbw.investigated}%`, background: '#ff9800', transition: 'width 0.4s' }} />
            <div style={{ width: `${cbw.dark}%`, background: '#333', transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 9, color: '#556' }}>
            <span style={{ color: '#00e5ff' }}>■ FULLY ACTIVE</span>
            <span style={{ color: '#00bcd4' }}>■ REPORTED</span>
            <span style={{ color: '#ff9800' }}>■ INVESTIGATED</span>
            <span style={{ color: '#444' }}>■ DARK</span>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? '#00e5ff22' : 'none',
              border: `1px solid ${filter === t ? '#00e5ff' : '#00e5ff33'}`,
              color: filter === t ? '#00e5ff' : '#556',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              letterSpacing: 0.5,
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
            background: 'rgba(0,229,255,0.05)',
            border: '1px solid #00e5ff33',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 11,
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ color: '#ff6666', padding: '4px 12px', fontSize: 11 }}>⚠ {err}</div>
      )}

      {/* Rows */}
      <div style={{ padding: '0 0 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#444', textAlign: 'center', padding: 24, fontSize: 12 }}>
            No matching datasets.
          </div>
        )}
        {visible.map((row) => {
          const isExp = expanded === row.ds.id;
          const stateCol = STATE_COLOUR[row.state] || '#888';
          return (
            <div
              key={row.ds.id}
              style={{
                borderBottom: '1px solid #00e5ff0d',
                background: isExp ? 'rgba(0,229,255,0.03)' : 'transparent',
              }}
            >
              {/* Row header */}
              <div
                onClick={() => setExpanded(isExp ? null : row.ds.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: stateCol,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${stateCol}`,
                }} />
                <span style={{ flex: 1, fontWeight: 600, color: '#d0eeff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.ds.name}
                </span>
                <span style={{ color: stateCol, fontSize: 9, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                  {row.state}
                </span>
                {row.ds.kind && (
                  <span style={{ color: '#667', fontSize: 9, marginLeft: 4 }}>
                    [{row.ds.kind}]
                  </span>
                )}
                <span style={{ color: '#00e5ff44', fontSize: 10, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded split pane */}
              {isExp && (
                <div style={{ padding: '0 12px 10px' }}>
                  {row.ds.description && (
                    <div style={{ color: '#667', fontSize: 11, marginBottom: 8 }}>
                      {row.ds.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* Left: matched reports */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#00bcd4', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        REPORTS ({row.matchedReports.length})
                      </div>
                      {row.matchedReports.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No reports matched.</div>
                      )}
                      {row.matchedReports.slice(0, 5).map(rep => (
                        <div key={rep.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#a0e8ff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{rep.name}</span>
                            <span style={{ color: '#00bcd4', fontSize: 10 }}>{(rep.score * 100).toFixed(0)}%</span>
                          </div>
                          {rep.type && (
                            <span style={{
                              display: 'inline-block',
                              background: '#00bcd422',
                              color: '#00bcd4',
                              borderRadius: 3,
                              padding: '1px 5px',
                              fontSize: 9,
                              marginTop: 2,
                            }}>
                              {rep.type}
                            </span>
                          )}
                          <div style={{ height: 3, background: '#001828', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(rep.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #00bcd4, #006080)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right: matched investigations */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#ff9800', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        INVESTIGATIONS ({row.matchedInvestigations.length})
                      </div>
                      {row.matchedInvestigations.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No investigations matched.</div>
                      )}
                      {row.matchedInvestigations.slice(0, 5).map(inv => (
                        <div key={inv.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#ffd0a0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{inv.name}</span>
                            <span style={{ color: '#ff9800', fontSize: 10 }}>{(inv.score * 100).toFixed(0)}%</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                            {inv.status && (
                              <span style={{
                                background: '#ff980022',
                                color: '#ffb74d',
                                borderRadius: 3,
                                padding: '1px 5px',
                                fontSize: 9,
                              }}>
                                {inv.status}
                              </span>
                            )}
                            {inv.kind && (
                              <span style={{
                                background: '#ff980015',
                                color: '#ff9800',
                                borderRadius: 3,
                                padding: '1px 5px',
                                fontSize: 9,
                              }}>
                                {inv.kind}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, background: '#201000', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(inv.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #ff9800, #e65100)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ASSESS button */}
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      marginTop: 8,
                      background: 'rgba(0,229,255,0.08)',
                      border: '1px solid #00e5ff55',
                      color: '#00e5ff',
                      padding: '3px 14px',
                      borderRadius: 3,
                      cursor: assessing ? 'wait' : 'pointer',
                      fontSize: 11,
                      letterSpacing: 1,
                    }}
                  >
                    {assessing ? 'ASSESSING…' : 'ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
