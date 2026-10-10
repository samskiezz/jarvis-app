import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const TABS = ['ALL', 'FULLY_COVERED', 'DUAL_COVERED', 'SINGLE_LINKED', 'UNCOVERED'];

const CLASS_COLOR = {
  FULLY_COVERED: '#22c55e',
  DUAL_COVERED:  '#00bfff',
  SINGLE_LINKED: '#ffd700',
  UNCOVERED:     '#ff4444',
};

const PULSE_STYLE = `
@keyframes rdiricov-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

export default function RiskSignalDatasetIntelReportCoverage() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState('');
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [rsRes, dsRes, ipRes, rpRes] = await Promise.all([
        fetch(`${API}/entities/RiskSignal?limit=200`),
        fetch(`${API}/v1/datasets`),
        fetch(`${API}/entities/IntelProfile?limit=200`),
        fetch(`${API}/v1/reports`),
      ]);
      const rsData = rsRes.ok ? await rsRes.json() : {};
      const dsData = dsRes.ok ? await dsRes.json() : {};
      const ipData = ipRes.ok ? await ipRes.json() : {};
      const rpData = rpRes.ok ? await rpRes.json() : {};

      const signals  = rsData.signals  || rsData.items || rsData.data || [];
      const datasets = dsData.datasets || dsData.items || dsData.data || [];
      const profiles = ipData.profiles || ipData.items || ipData.data || [];
      const reports  = rpData.reports  || rpData.items || rpData.data || [];

      const dsBlobs = datasets.map(d => ({
        id:   d.id || d.dataset_id,
        name: d.name || d.title || '',
        type: d.type || d.category || '',
        text: [d.name, d.title, d.description, d.type, d.category, d.source,
               ...(d.tags || [])].filter(Boolean).join(' '),
      }));

      const ipBlobs = profiles.map(p => ({
        id:   p.id || p.profile_id,
        name: p.name || p.title || p.subject || '',
        org:  p.organization || p.org || p.affiliation || '',
        text: [p.name, p.title, p.subject, p.organization, p.affiliation,
               p.description, p.role, p.type,
               ...(p.tags || [])].filter(Boolean).join(' '),
      }));

      const rpBlobs = reports.map(r => ({
        id:    r.id || r.report_id,
        title: r.title || r.name || '',
        type:  r.type || r.category || '',
        text:  [r.title, r.name, r.summary, r.type, r.category, r.subject,
                r.author, r.description,
                ...(r.tags || [])].filter(Boolean).join(' '),
      }));

      const classified = signals.map(sig => {
        const sToks = [
          sig.name, sig.title, sig.description, sig.type, sig.category,
          sig.severity, sig.source, sig.subject,
          ...(sig.tags || []),
        ].filter(Boolean).flatMap(f => tokens(f));

        const matchedDs = dsBlobs.filter(d => overlaps(sToks, d.text)).slice(0, 4);
        const matchedIp = ipBlobs.filter(p => overlaps(sToks, p.text)).slice(0, 4);
        const matchedRp = rpBlobs.filter(r => overlaps(sToks, r.text)).slice(0, 4);

        const hasDs = matchedDs.length > 0;
        const hasIp = matchedIp.length > 0;
        const hasRp = matchedRp.length > 0;
        const matchCount = [hasDs, hasIp, hasRp].filter(Boolean).length;

        let cls;
        if (matchCount === 3)      cls = 'FULLY_COVERED';
        else if (matchCount === 2) cls = 'DUAL_COVERED';
        else if (matchCount === 1) cls = 'SINGLE_LINKED';
        else                       cls = 'UNCOVERED';

        return { ...sig, _class: cls, _ds: matchedDs, _ip: matchedIp, _rp: matchedRp };
      });

      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:rdiricov-toggle', handler);
    return () => window.removeEventListener('jarvis:rdiricov-toggle', handler);
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
      timerRef.current = setInterval(fetchData, 90000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const counts = {
    ALL:           rows.length,
    FULLY_COVERED: rows.filter(r => r._class === 'FULLY_COVERED').length,
    DUAL_COVERED:  rows.filter(r => r._class === 'DUAL_COVERED').length,
    SINGLE_LINKED: rows.filter(r => r._class === 'SINGLE_LINKED').length,
    UNCOVERED:     rows.filter(r => r._class === 'UNCOVERED').length,
  };

  const covPct = counts.ALL > 0
    ? Math.round(((counts.FULLY_COVERED + counts.DUAL_COVERED) / counts.ALL) * 100)
    : 0;

  const filtered = rows.filter(r => {
    if (tab !== 'ALL' && r._class !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.name, r.title, r.description, r.type, r.severity, r.source]
      .filter(Boolean).some(v => v.toLowerCase().includes(q));
  });

  const assess = async () => {
    setAssessing(true);
    setBrief('');
    try {
      const summary = `${counts.ALL} risk signals — ${counts.FULLY_COVERED} fully covered (dataset+intel+report), ${counts.DUAL_COVERED} dual-covered, ${counts.SINGLE_LINKED} single-linked, ${counts.UNCOVERED} uncovered (no intelligence backing). Coverage: ${covPct}%.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `RiskSignal × Dataset × IntelProfile × Report Strategic Intelligence Coverage (RDIRICOV): ${summary} Provide a 2-sentence operational brief on which uncovered risk signals represent the greatest blind spots and what dataset, intel profile, or report coverage should be prioritised.`,
          stream: false,
        }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || data.content || 'No brief available.';
      setBrief(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setBrief('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const SEV_COLOR = { CRITICAL: '#ff4444', HIGH: '#ff8c00', MEDIUM: '#ffd700', LOW: '#22c55e' };
  const barColor = covPct >= 70 ? '#22c55e' : covPct >= 40 ? '#ffd700' : '#ff4444';

  if (!open) {
    return (
      <>
        <style>{PULSE_STYLE}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', left: 1114640, bottom: 8, zIndex: 706,
            background: 'rgba(0,0,0,0.85)', border: '1px solid #00bfff',
            color: '#00bfff', padding: '6px 14px', borderRadius: 6,
            fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ◈ RDIRICOV
          {counts.UNCOVERED > 0 && (
            <span style={{
              background: '#ff4444', color: '#fff', borderRadius: 10,
              padding: '1px 6px', fontSize: 10, fontWeight: 700,
              animation: 'rdiricov-pulse 2s infinite',
            }}>
              {counts.UNCOVERED}
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.93)', zIndex: 9100, display: 'flex',
      flexDirection: 'column', fontFamily: 'monospace', color: '#e0e0e0',
    }}>
      <style>{PULSE_STYLE}</style>

      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid #001020',
        background: 'rgba(0,5,10,0.9)',
      }}>
        <div>
          <span style={{ color: '#00bfff', fontWeight: 700, fontSize: 16 }}>◈ RDIRICOV</span>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 12 }}>
            RiskSignal × Dataset × IntelProfile × Report Strategic Intelligence Coverage
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={assess}
            disabled={assessing || loading}
            style={{
              background: 'rgba(0,191,255,0.1)', border: '1px solid #00bfff',
              color: '#00bfff', padding: '4px 12px', borderRadius: 4,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            {assessing ? '⟳ Assessing…' : '▶ ASSESS COVERAGE'}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 10px', borderRadius: 4,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            ⟳
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 10px', borderRadius: 4,
              cursor: 'pointer', fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 20px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          ['FULLY_COVERED', counts.FULLY_COVERED],
          ['DUAL_COVERED',  counts.DUAL_COVERED],
          ['SINGLE_LINKED', counts.SINGLE_LINKED],
          ['UNCOVERED',     counts.UNCOVERED],
        ].map(([k, v]) => (
          <div
            key={k}
            onClick={() => setTab(k)}
            style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${CLASS_COLOR[k]}44`,
              borderLeft: `3px solid ${CLASS_COLOR[k]}`,
              borderRadius: 6, padding: '8px 16px', minWidth: 160, cursor: 'pointer',
            }}
          >
            <div style={{ color: CLASS_COLOR[k], fontSize: 22, fontWeight: 700 }}>{v}</div>
            <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>{k.replace(/_/g, ' ')}</div>
          </div>
        ))}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid #333',
          borderRadius: 6, padding: '8px 16px', minWidth: 120,
        }}>
          <div style={{ color: '#e0e0e0', fontSize: 22, fontWeight: 700 }}>{counts.ALL}</div>
          <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>TOTAL SIGNALS</div>
        </div>
        {/* coverage bar */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ color: '#777', fontSize: 10, marginBottom: 4 }}>INTEL COVERAGE {covPct}%</div>
          <div style={{ background: '#111', borderRadius: 3, height: 8, overflow: 'hidden' }}>
            <div style={{
              width: `${covPct}%`, height: '100%',
              background: barColor, borderRadius: 3, transition: 'width 0.5s',
            }} />
          </div>
        </div>
      </div>

      {/* brief */}
      {brief && (
        <div style={{
          margin: '0 20px 10px', background: 'rgba(0,191,255,0.05)',
          border: '1px solid #00bfff44', borderRadius: 6, padding: '8px 12px',
          color: '#7dd3fc', fontSize: 12, lineHeight: 1.5,
        }}>
          {brief}
        </div>
      )}

      {/* tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 10px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(0,191,255,0.15)' : 'transparent',
            border: `1px solid ${tab === t ? '#00bfff' : '#333'}`,
            color: tab === t ? '#00bfff' : '#666',
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}>
            {t} ({counts[t] ?? 0})
          </button>
        ))}
        <input
          placeholder="Search risk signals…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
            border: '1px solid #333', borderRadius: 4, color: '#e0e0e0',
            padding: '4px 10px', fontSize: 11, width: 220,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 16px' }}>
        {loading && <div style={{ color: '#555', fontSize: 12, padding: 16 }}>⟳ Loading…</div>}
        {err && <div style={{ color: '#ff4444', fontSize: 12, padding: 16 }}>Error: {err}</div>}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ color: '#555', fontSize: 12, padding: 16 }}>No risk signals match.</div>
        )}
        {!loading && filtered.map((sig, i) => {
          const sid = sig.id || sig.signal_id || i;
          const isExp = expanded === sid;
          const col = CLASS_COLOR[sig._class] || '#888';
          const sev = (sig.severity || '').toUpperCase();
          const sevCol = SEV_COLOR[sev] || '#888';
          const isUncovered = sig._class === 'UNCOVERED';
          return (
            <div
              key={sid}
              onClick={() => setExpanded(isExp ? null : sid)}
              style={{
                borderBottom: '1px solid #1a1a1a', padding: '8px 0', cursor: 'pointer',
                animation: isUncovered ? 'rdiricov-pulse 2.5s infinite' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: col, fontSize: 10, minWidth: 130, fontWeight: 600 }}>
                  {sig._class.replace(/_/g, ' ')}
                </span>
                <span style={{ color: '#aaa', fontSize: 11, flex: 1 }}>
                  {sig.name || sig.title || `Signal ${sid}`}
                </span>
                {sev && (
                  <span style={{
                    background: `${sevCol}22`, border: `1px solid ${sevCol}`,
                    color: sevCol, borderRadius: 3, padding: '1px 6px', fontSize: 9, fontWeight: 700,
                  }}>
                    {sev}
                  </span>
                )}
                {sig.type && (
                  <span style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid #333',
                    borderRadius: 3, padding: '1px 6px', fontSize: 9, color: '#777',
                  }}>
                    {sig.type}
                  </span>
                )}
                <span style={{ color: '#333', fontSize: 10 }}>▾</span>
              </div>

              {isExp && (
                <div style={{
                  marginTop: 6, padding: '10px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 4, fontSize: 11,
                }}>
                  {sig.description && (
                    <div style={{ color: '#666', marginBottom: 8 }}>{sig.description}</div>
                  )}

                  {/* Dataset matches */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: '#00bfff', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      DATASETS ({sig._ds.length})
                    </div>
                    {sig._ds.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No datasets matched.</div>
                      : sig._ds.map((d, di) => (
                        <div key={di} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '3px 0', borderBottom: '1px solid #111',
                        }}>
                          {d.type && (
                            <span style={{
                              background: '#00bfff22', border: '1px solid #00bfff',
                              color: '#00bfff', borderRadius: 3, padding: '1px 5px', fontSize: 9,
                            }}>
                              {d.type}
                            </span>
                          )}
                          <span style={{ color: '#00bfff', fontSize: 10, flex: 1 }}>{d.name || d.id}</span>
                        </div>
                      ))
                    }
                  </div>

                  {/* IntelProfile matches */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: '#a855f7', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      INTEL PROFILES ({sig._ip.length})
                    </div>
                    {sig._ip.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No intel profiles matched.</div>
                      : sig._ip.map((p, pi) => (
                        <div key={pi} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '3px 0', borderBottom: '1px solid #111',
                        }}>
                          {p.org && (
                            <span style={{
                              background: '#a855f722', border: '1px solid #a855f7',
                              color: '#a855f7', borderRadius: 3, padding: '1px 5px', fontSize: 9,
                            }}>
                              {p.org}
                            </span>
                          )}
                          <span style={{ color: '#a855f7', fontSize: 10, flex: 1 }}>{p.name || p.id}</span>
                        </div>
                      ))
                    }
                  </div>

                  {/* Report matches */}
                  <div>
                    <div style={{ color: '#ffd700', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      REPORTS ({sig._rp.length})
                    </div>
                    {sig._rp.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No reports matched.</div>
                      : sig._rp.map((r, ri) => (
                        <div key={ri} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '3px 0', borderBottom: '1px solid #111',
                        }}>
                          {r.type && (
                            <span style={{
                              background: '#ffd70022', border: '1px solid #ffd700',
                              color: '#ffd700', borderRadius: 3, padding: '1px 5px', fontSize: 9,
                            }}>
                              {r.type}
                            </span>
                          )}
                          <span style={{ color: '#ffd700', fontSize: 10, flex: 1 }}>{r.title || r.id}</span>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: '6px 20px', borderTop: '1px solid #1a1a1a',
        color: '#444', fontSize: 10, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>RDIRICOV — auto-refresh 90s · /entities/RiskSignal · /v1/datasets · /entities/IntelProfile · /v1/reports</span>
        <span>{filtered.length} of {rows.length} shown</span>
      </div>
    </div>
  );
}

export function isRdiricovQuery(q) {
  const lower = q.toLowerCase();
  return [
    'rdiricov', 'risk signal intelligence', 'risk dataset', 'risk intel report',
    'uncovered risk', 'risk signal coverage', 'strategic intelligence coverage',
    'risk intelligence nexus', 'risk signal dataset', 'risk intel coverage',
    'risk report coverage', 'signal intelligence coverage', 'rdiricov nexus',
    'risk signal blind spot', 'uncovered signal', 'risk coverage nexus',
  ].some(kw => lower.includes(kw));
}

export function buildRdiricovScript() {
  return 'Opening RiskSignal Strategic Intelligence Coverage — correlating risk signals against datasets, intel profiles, and reports.';
}
