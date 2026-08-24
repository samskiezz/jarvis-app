import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GAIRTRIP_RE = /\b(gairtrip|annotation\s+intel(?:ligence)?\s+report|graph\s+annotation\s+intel|annotation\s+report\s+intel|profiled\s+annotation|dark\s+annotation\s+intel|annotation\s+intel\s+profile\s+report|graph\s+annot\s+intel|annotation\s+intel\s+coverage|annotation\s+report\s+coverage|intel\s+report\s+annotation|annotation\s+profile\s+report)\b/i;

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

function normaliseAnnotations(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.annotations) ? data.annotations
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(a => ({
    id: a.id || a._id || String(Math.random()),
    name: a.name || a.title || a.label || a.annotation || 'Unnamed Annotation',
    text: a.text || a.body || a.content || a.description || '',
    target_type: a.target_type || a.targetType || a.type || '',
    actor: a.actor || a.author || a.created_by || '',
    category: a.category || a.kind || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : String(a.tags || ''),
    raw: a,
  }));
}

function normaliseIntelProfiles(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.intel_profiles) ? data.intel_profiles
    : Array.isArray(data.profiles) ? data.profiles
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(p => ({
    id: p.id || p._id || String(Math.random()),
    name: p.name || p.title || p.label || 'Unnamed Profile',
    role: p.role || p.position || p.title || '',
    company: p.company || p.organisation || p.organization || '',
    sector: p.sector || p.industry || '',
    nationality: p.nationality || p.country || '',
    aliases: Array.isArray(p.aliases) ? p.aliases.join(' ') : String(p.aliases || ''),
    description: p.description || p.summary || p.bio || '',
    tags: Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags || ''),
    raw: p,
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

function correlate(annotations, profiles, reports) {
  return annotations.map(ann => {
    const toks = tok([ann.name, ann.text, ann.target_type, ann.actor, ann.category, ann.tags].join(' '));

    const matchedProfiles = profiles
      .map(p => {
        const score = Math.max(
          matchScore(toks, p.name),
          matchScore(toks, p.role),
          matchScore(toks, p.company),
          matchScore(toks, p.sector),
          matchScore(toks, p.nationality),
          matchScore(toks, p.aliases),
          matchScore(toks, p.description),
          matchScore(toks, p.tags),
        );
        return { ...p, score };
      })
      .filter(p => p.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

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

    const hasProfile = matchedProfiles.length > 0;
    const hasReport = matchedReports.length > 0;

    let state;
    if (hasProfile && hasReport) state = 'FULLY PROFILED';
    else if (hasProfile) state = 'INTEL-BACKED';
    else if (hasReport) state = 'REPORTED';
    else state = 'DARK';

    return { ann, matchedProfiles, matchedReports, state };
  });
}

export function isGairtripQuery(t) {
  return GAIRTRIP_RE.test(t || '');
}

export async function buildGairtripScript() {
  try {
    const [aRes, pRes, rRes] = await Promise.allSettled([
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : null),
    ]);
    const annotations = normaliseAnnotations(aRes.status === 'fulfilled' ? aRes.value : null);
    const profiles = normaliseIntelProfiles(pRes.status === 'fulfilled' ? pRes.value : null);
    const reports = normaliseReports(rRes.status === 'fulfilled' ? rRes.value : null);
    const rows = correlate(annotations, profiles, reports);
    const fully = rows.filter(r => r.state === 'FULLY PROFILED').length;
    const intelBacked = rows.filter(r => r.state === 'INTEL-BACKED').length;
    const reported = rows.filter(r => r.state === 'REPORTED').length;
    const dark = rows.filter(r => r.state === 'DARK').length;
    return `GAIRTRIP Graph Annotation×IntelProfile×Report: ${rows.length} annotations analysed. ` +
      `${fully} FULLY PROFILED (intel profile + report), ` +
      `${intelBacked} INTEL-BACKED (profile only), ${reported} REPORTED (report only), ${dark} DARK (no coverage). ` +
      (dark > 0 ? `${dark} annotations have no intel profile or report coverage — intelligence blind spot.` :
        fully > 0 ? `Top profiled: ${rows.find(r => r.state === 'FULLY PROFILED')?.ann.name || 'see panel'}.` :
        'No fully profiled annotations at this time.');
  } catch {
    return 'GAIRTRIP: data fetch failed.';
  }
}

export default function GraphAnnotationIntelReportTriple() {
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
    window.addEventListener('jarvis:gairtrip-toggle', handler);
    return () => window.removeEventListener('jarvis:gairtrip-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [aRes, pRes, rRes] = await Promise.allSettled([
        fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const annotations = normaliseAnnotations(aRes.status === 'fulfilled' ? aRes.value : null);
      const profiles = normaliseIntelProfiles(pRes.status === 'fulfilled' ? pRes.value : null);
      const reports = normaliseReports(rRes.status === 'fulfilled' ? rRes.value : null);
      if (!annotations.length && !profiles.length && !reports.length) {
        setErr('No data returned from Graph Annotations, IntelProfile, or Reports endpoints.');
      }
      setRows(correlate(annotations, profiles, reports));
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

  const fully = rows.filter(r => r.state === 'FULLY PROFILED').length;
  const intelBacked = rows.filter(r => r.state === 'INTEL-BACKED').length;
  const reported = rows.filter(r => r.state === 'REPORTED').length;
  const dark = rows.filter(r => r.state === 'DARK').length;

  const TABS = ['ALL', 'FULLY PROFILED', 'INTEL-BACKED', 'REPORTED', 'DARK'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.ann.name.toLowerCase().includes(q) ||
        r.ann.text.toLowerCase().includes(q) ||
        r.matchedProfiles.some(p => p.name.toLowerCase().includes(q)) ||
        r.matchedReports.some(rep => rep.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const cbw = total > 0 ? {
    fully: (fully / total) * 100,
    intel: (intelBacked / total) * 100,
    reported: (reported / total) * 100,
    dark: (dark / total) * 100,
  } : { fully: 0, intel: 0, reported: 0, dark: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Graph annotation "${row.ann.name}" [${row.state}]: ` +
      `intel profiles: ${row.matchedProfiles.map(p => p.name).join(', ') || 'none'}. ` +
      `reports: ${row.matchedReports.map(r => r.name).join(', ') || 'none'}. ` +
      `Target: ${row.ann.target_type || 'unknown'}, Category: ${row.ann.category || 'unknown'}. ` +
      `Give a 2-sentence annotation intelligence coverage brief.`;
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
    'FULLY PROFILED': '#00e5ff',
    'INTEL-BACKED': '#ff9800',
    'REPORTED': '#00bcd4',
    'DARK': '#555',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 815120,
          bottom: 8,
          zIndex: 484,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #ff980044',
          color: '#ff9800',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ GAIRTRIP
        {dark > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#ff9800',
            color: '#001820',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {dark}
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
      border: '1px solid #ff980055',
      borderRadius: 8,
      zIndex: 484,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #ff980022',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px 8px',
        borderBottom: '1px solid #ff980033',
        background: 'rgba(255,152,0,0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 2,
      }}>
        <div>
          <span style={{ color: '#ff9800', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>◈ GAIRTRIP</span>
          <span style={{ color: '#4a6fa0', marginLeft: 10, fontSize: 10 }}>
            Graph Annotation × IntelProfile × Report
          </span>
          {lastRefresh && (
            <span style={{ color: '#2a4060', marginLeft: 10, fontSize: 9 }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#ff9800', fontSize: 10, animation: 'pulse 1s infinite' }}>◌ LOADING</span>}
          <button onClick={load} style={{ background: 'none', border: '1px solid #ff980044', color: '#ff9800', padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 10 }}>↻</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#4a6fa0', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px 6px', flexWrap: 'wrap' }}>
        {[
          { label: 'ANNOTATIONS', val: total, col: '#ff9800' },
          { label: 'FULLY PROFILED', val: fully, col: '#00e5ff' },
          { label: 'INTEL-BACKED', val: intelBacked, col: '#ff9800' },
          { label: 'REPORTED', val: reported, col: '#00bcd4' },
          { label: 'DARK', val: dark, col: '#555' },
        ].map(t => (
          <div key={t.label} style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${t.col}44`,
            borderRadius: 4,
            padding: '4px 10px',
            minWidth: 80,
            textAlign: 'center',
          }}>
            <div style={{ color: t.col, fontSize: 16, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: '#4a6fa0', fontSize: 9, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {total > 0 && (
        <div style={{ margin: '0 14px 8px', height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: '#111' }}>
          <div style={{ width: `${cbw.fully}%`, background: '#00e5ff', transition: 'width 0.4s' }} />
          <div style={{ width: `${cbw.intel}%`, background: '#ff9800', transition: 'width 0.4s' }} />
          <div style={{ width: `${cbw.reported}%`, background: '#00bcd4', transition: 'width 0.4s' }} />
          <div style={{ width: `${cbw.dark}%`, background: '#333', transition: 'width 0.4s' }} />
        </div>
      )}

      {/* Error */}
      {err && <div style={{ color: '#f44', padding: '4px 14px', fontSize: 10 }}>{err}</div>}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 14px 6px', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              background: filter === tab ? '#ff980022' : 'none',
              border: `1px solid ${filter === tab ? '#ff9800' : '#1a3050'}`,
              color: filter === tab ? '#ff9800' : '#4a6fa0',
              padding: '2px 8px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 10,
              letterSpacing: 0.5,
            }}
          >{tab}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search annotations…"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid #1a3050',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 10,
            outline: 'none',
            marginLeft: 'auto',
            width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ padding: '0 14px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#2a4060', textAlign: 'center', padding: 20, fontSize: 11 }}>
            No annotations match current filter.
          </div>
        )}
        {visible.map(row => (
          <div key={row.ann.id} style={{
            marginBottom: 6,
            border: `1px solid ${STATE_COLOUR[row.state]}33`,
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            {/* Row header */}
            <div
              onClick={() => setExpanded(expanded === row.ann.id ? null : row.ann.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                cursor: 'pointer',
                background: expanded === row.ann.id ? `${STATE_COLOUR[row.state]}11` : 'transparent',
              }}
            >
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: STATE_COLOUR[row.state],
                background: `${STATE_COLOUR[row.state]}22`,
                padding: '1px 5px',
                borderRadius: 3,
                letterSpacing: 1,
                minWidth: 100,
                textAlign: 'center',
              }}>{row.state}</span>
              <span style={{ color: '#c8e6ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.ann.name}
              </span>
              {row.ann.target_type && (
                <span style={{ color: '#2a4060', fontSize: 9 }}>{row.ann.target_type}</span>
              )}
              <span style={{ color: '#ff9800', fontSize: 9 }}>{row.matchedProfiles.length}P</span>
              <span style={{ color: '#00bcd4', fontSize: 9 }}>{row.matchedReports.length}R</span>
              <button
                onClick={e => { e.stopPropagation(); assess(row); }}
                disabled={assessing}
                style={{
                  background: 'rgba(255,152,0,0.15)',
                  border: '1px solid #ff980055',
                  color: '#ff9800',
                  padding: '2px 6px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 9,
                  letterSpacing: 0.5,
                }}
              >ASSESS</button>
              <span style={{ color: '#2a4060', fontSize: 10 }}>{expanded === row.ann.id ? '▲' : '▼'}</span>
            </div>

            {/* Expand: split pane */}
            {expanded === row.ann.id && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
                borderTop: `1px solid ${STATE_COLOUR[row.state]}22`,
                background: 'rgba(0,8,20,0.6)',
              }}>
                {/* Left: Intel Profiles */}
                <div style={{ padding: '8px 10px', borderRight: '1px solid #1a3050' }}>
                  <div style={{ color: '#ff9800', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>INTEL PROFILES ({row.matchedProfiles.length})</div>
                  {row.matchedProfiles.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No profile match</div>
                  ) : row.matchedProfiles.slice(0, 5).map(p => (
                    <div key={p.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{p.name}</div>
                      {(p.role || p.company) && (
                        <div style={{ color: '#4a6fa0', fontSize: 9 }}>{p.role}{p.role && p.company ? ' · ' : ''}{p.company}</div>
                      )}
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(p.score * 100)}%`, background: '#ff9800', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: Reports */}
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ color: '#00bcd4', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>REPORTS ({row.matchedReports.length})</div>
                  {row.matchedReports.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No report match</div>
                  ) : row.matchedReports.slice(0, 5).map(r => (
                    <div key={r.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{r.name}</div>
                      {r.type && (
                        <div style={{ color: '#4a6fa0', fontSize: 9 }}>{r.type}</div>
                      )}
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(r.score * 100)}%`, background: '#00bcd4', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Annotation text if available */}
                {row.ann.text && (
                  <div style={{ gridColumn: '1 / -1', padding: '6px 10px', borderTop: '1px solid #1a3050' }}>
                    <span style={{ color: '#2a4060', fontSize: 9 }}>ANNOTATION: </span>
                    <span style={{ color: '#4a6fa0', fontSize: 10 }}>{row.ann.text.slice(0, 200)}{row.ann.text.length > 200 ? '…' : ''}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
