import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const TABS = ['ALL', 'FULLY_MAPPED', 'DUAL_LINKED', 'SINGLE_LINKED', 'ISOLATED'];

const CLASS_COLOR = {
  FULLY_MAPPED:  '#22c55e',
  DUAL_LINKED:   '#00bfff',
  SINGLE_LINKED: '#ffd700',
  ISOLATED:      '#ff4444',
};

const PULSE_STYLE = `
@keyframes pnetcov-pulse {
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

export default function ContactGraphOpsDatasetNexus() {
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
      const [ctRes, gcRes, oeRes, dsRes] = await Promise.all([
        fetch(`${API}/entities/Contact?limit=200`),
        fetch(`${API}/v1/graph/centrality`),
        fetch(`${API}/v1/ops/events`),
        fetch(`${API}/v1/datasets`),
      ]);
      const ctData = ctRes.ok ? await ctRes.json() : {};
      const gcData = gcRes.ok ? await gcRes.json() : {};
      const oeData = oeRes.ok ? await oeRes.json() : {};
      const dsData = dsRes.ok ? await dsRes.json() : {};

      const contacts  = ctData.contacts  || ctData.items || ctData.data || [];
      const centrality = gcData.nodes    || gcData.items || gcData.data || [];
      const events    = oeData.events    || oeData.items || oeData.data || [];
      const datasets  = dsData.datasets  || dsData.items || dsData.data || [];

      const gcBlobs = centrality.map(n => ({
        id:       n.id || n.node_id,
        name:     n.name || n.label || n.entity || '',
        category: n.category || n.type || '',
        score:    n.score || n.centrality || 0,
        text:     [n.name, n.label, n.entity, n.description, n.category, n.type,
                   ...(n.tags || [])].filter(Boolean).join(' '),
      }));

      const oeBlobs = events.map(e => ({
        id:   e.id || e.event_id,
        name: e.name || e.title || e.summary || '',
        type: e.type || e.event_type || '',
        text: [e.name, e.title, e.summary, e.description, e.type, e.category,
               e.source, e.location, ...(e.tags || [])].filter(Boolean).join(' '),
      }));

      const dsBlobs = datasets.map(d => ({
        id:   d.id || d.dataset_id,
        name: d.name || d.title || '',
        type: d.type || d.category || '',
        text: [d.name, d.title, d.description, d.type, d.category, d.source,
               ...(d.tags || [])].filter(Boolean).join(' '),
      }));

      const classified = contacts.map(ct => {
        const cToks = [
          ct.name, ct.role, ct.title, ct.organization, ct.org,
          ct.department, ct.email, ct.description,
          ...(ct.tags || []),
        ].filter(Boolean).flatMap(f => tokens(f));

        const matchedGc = gcBlobs.filter(n => overlaps(cToks, n.text)).slice(0, 4);
        const matchedOe = oeBlobs.filter(e => overlaps(cToks, e.text)).slice(0, 4);
        const matchedDs = dsBlobs.filter(d => overlaps(cToks, d.text)).slice(0, 4);

        const hasGc = matchedGc.length > 0;
        const hasOe = matchedOe.length > 0;
        const hasDs = matchedDs.length > 0;

        const matchCount = [hasGc, hasOe, hasDs].filter(Boolean).length;
        let cls;
        if (matchCount === 3)      cls = 'FULLY_MAPPED';
        else if (matchCount === 2) cls = 'DUAL_LINKED';
        else if (matchCount === 1) cls = 'SINGLE_LINKED';
        else                       cls = 'ISOLATED';

        return {
          id:       ct.id || ct.contact_id || Math.random(),
          name:     ct.name || '(unnamed contact)',
          role:     ct.role || ct.title || '',
          org:      ct.organization || ct.org || '',
          cls,
          matchedGc,
          matchedOe,
          matchedDs,
        };
      });

      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:pnetcov-toggle', onToggle);
    return () => window.removeEventListener('jarvis:pnetcov-toggle', onToggle);
  }, []);

  const filtered = rows.filter(r => {
    const matchTab = tab === 'ALL' || r.cls === tab;
    const matchSrc = !search || r.name.toLowerCase().includes(search.toLowerCase()) ||
                     r.role.toLowerCase().includes(search.toLowerCase()) ||
                     r.org.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSrc;
  });

  const stats = {
    total:       rows.length,
    fullyMapped: rows.filter(r => r.cls === 'FULLY_MAPPED').length,
    dual:        rows.filter(r => r.cls === 'DUAL_LINKED').length,
    single:      rows.filter(r => r.cls === 'SINGLE_LINKED').length,
    isolated:    rows.filter(r => r.cls === 'ISOLATED').length,
    centrality:  [...new Set(rows.flatMap(r => r.matchedGc.map(n => n.id)))].length,
    events:      [...new Set(rows.flatMap(r => r.matchedOe.map(e => e.id)))].length,
  };

  const covPct = stats.total ? Math.round((stats.fullyMapped / stats.total) * 100) : 0;
  const barColor = covPct >= 70 ? '#22c55e' : covPct >= 40 ? '#ffd700' : '#ff4444';

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `PNETCOV Personnel Network Coverage: ${stats.total} contacts analysed. ` +
            `${stats.fullyMapped} fully mapped (graph+ops+data), ${stats.dual} dual-linked, ` +
            `${stats.single} single-linked, ${stats.isolated} isolated (no network coverage). ` +
            `Coverage: ${covPct}%. Provide a 2-sentence strategic assessment.`,
        }),
      });
      const d = r.ok ? await r.json() : {};
      const text = (d.answer || 'PNETCOV assessment complete.').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setBrief(text);
      if (window.__jarvis_speak) window.__jarvis_speak(text);
    } catch {
      setBrief('PNETCOV assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <>
        <style>{PULSE_STYLE}</style>
        <button
          onClick={() => setOpen(true)}
          title="PNETCOV — Personnel Network Coverage"
          style={{
            position: 'fixed', left: 1115200, bottom: 8, zIndex: 707,
            background: 'rgba(5,8,13,0.82)', border: '1px solid #00bfff44',
            color: '#00bfff', fontSize: 9, padding: '3px 6px', borderRadius: 4,
            cursor: 'pointer', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap',
          }}
        >
          ◈ PNETCOV{stats.isolated > 0 && (
            <span style={{
              marginLeft: 4, background: '#ff4444', color: '#fff',
              borderRadius: 8, padding: '0 5px', fontSize: 8,
              animation: 'pnetcov-pulse 1.6s infinite',
            }}>{stats.isolated}</span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{PULSE_STYLE}</style>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(4,6,10,0.93)', backdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column', padding: 24, overflowY: 'auto',
        fontFamily: 'monospace',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <span style={{ color: '#00bfff', fontSize: 18, fontWeight: 700 }}>◈ PNETCOV</span>
            <span style={{ color: '#8899aa', fontSize: 13, marginLeft: 12 }}>
              Personnel Network Coverage — Contact × Graph Centrality × Ops Events × Datasets
            </span>
          </div>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: '1px solid #ff444488', color: '#ff4444',
            borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 13,
          }}>✕ CLOSE</button>
        </div>

        {/* Stat tiles */}
        {[
          { label: 'CONTACTS',     val: stats.total,       color: '#00bfff' },
          { label: 'CENTRALITY',   val: stats.centrality,  color: '#a78bfa' },
          { label: 'OPS EVENTS',   val: stats.events,      color: '#fb923c' },
          { label: 'FULLY MAPPED', val: stats.fullyMapped, color: '#22c55e' },
          { label: 'DUAL LINKED',  val: stats.dual,        color: '#00bfff' },
          { label: 'SINGLE LINK',  val: stats.single,      color: '#ffd700' },
          { label: 'ISOLATED',     val: stats.isolated,    color: '#ff4444' },
          { label: 'COV %',        val: `${covPct}%`,      color: barColor  },
        ].map(t => (
          <div key={t.label} style={{
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}44`,
            borderRadius: 6, padding: '6px 14px', marginRight: 10, marginBottom: 10,
          }}>
            <span style={{ color: t.color, fontSize: 20, fontWeight: 700 }}>{t.val}</span>
            <span style={{ color: '#6677aa', fontSize: 9 }}>{t.label}</span>
          </div>
        ))}

        {/* Coverage bar */}
        <div style={{ height: 6, background: '#111827', borderRadius: 3, marginBottom: 14 }}>
          <div style={{ height: '100%', width: `${covPct}%`, background: barColor, borderRadius: 3, transition: 'width 0.6s' }} />
        </div>

        {/* Assess button */}
        <button onClick={assess} disabled={assessing} style={{
          alignSelf: 'flex-start', marginBottom: 14, background: 'rgba(0,191,255,0.12)',
          border: '1px solid #00bfff88', color: '#00bfff', borderRadius: 4,
          padding: '5px 14px', cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 12,
        }}>
          {assessing ? '⏳ Assessing…' : '▶ ASSESS NETWORK COVERAGE'}
        </button>
        {brief && (
          <div style={{
            background: 'rgba(0,191,255,0.07)', border: '1px solid #00bfff44',
            borderRadius: 6, padding: '10px 14px', marginBottom: 14,
            color: '#cde', fontSize: 13, lineHeight: 1.5,
          }}>{brief}</div>
        )}

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? '#00bfff22' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${tab === t ? '#00bfff' : '#33445566'}`,
              color: tab === t ? '#00bfff' : '#6677aa', borderRadius: 4,
              padding: '3px 10px', cursor: 'pointer', fontSize: 11,
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid #33445566',
              color: '#cde', borderRadius: 4, padding: '3px 10px', fontSize: 11,
            }}
          />
        </div>

        {/* Error / loading */}
        {loading && <div style={{ color: '#ffd700', fontSize: 12 }}>Loading…</div>}
        {err && <div style={{ color: '#ff4444', fontSize: 12 }}>Error: {err}</div>}

        {/* Rows */}
        {filtered.map(row => (
          <div key={row.id} style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${CLASS_COLOR[row.cls]}44`,
            borderRadius: 6, padding: '8px 12px', marginBottom: 8,
            animation: row.cls === 'ISOLATED' ? 'pnetcov-pulse 1.6s infinite' : 'none',
          }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
            >
              <span style={{ color: '#e2e8f0', fontSize: 13 }}>
                {row.name}
                {row.role && <span style={{ color: '#6677aa', marginLeft: 8, fontSize: 11 }}>{row.role}</span>}
                {row.org && <span style={{ color: '#6677aa', marginLeft: 8, fontSize: 11 }}>[{row.org}]</span>}
              </span>
              <span style={{
                background: `${CLASS_COLOR[row.cls]}22`,
                border: `1px solid ${CLASS_COLOR[row.cls]}`,
                color: CLASS_COLOR[row.cls], borderRadius: 4,
                padding: '2px 8px', fontSize: 10, marginLeft: 8,
              }}>{row.cls}</span>
            </div>

            {expanded === row.id && (
              <div style={{ marginTop: 10 }}>
                {/* Graph Centrality matches */}
                {row.matchedGc.length > 0 && (
                  <>
                    <div style={{ color: '#a78bfa', fontSize: 11, marginBottom: 4 }}>◈ GRAPH CENTRALITY</div>
                    {row.matchedGc.map((n, i) => (
                      <div key={i} style={{
                        background: 'rgba(167,139,250,0.08)', border: '1px solid #a78bfa44',
                        borderRadius: 4, padding: '4px 10px', marginBottom: 4, fontSize: 11,
                        display: 'flex', justifyContent: 'space-between',
                      }}>
                        <span style={{ color: '#c4b5fd' }}>{n.name}</span>
                        {n.category && <span style={{
                          background: '#a78bfa22', border: '1px solid #a78bfa44',
                          color: '#a78bfa', borderRadius: 3, padding: '0 6px', fontSize: 10,
                        }}>{n.category}</span>}
                      </div>
                    ))}
                  </>
                )}
                {/* Ops Event matches */}
                {row.matchedOe.length > 0 && (
                  <>
                    <div style={{ color: '#fb923c', fontSize: 11, marginBottom: 4, marginTop: 6 }}>◈ OPS EVENTS</div>
                    {row.matchedOe.map((e, i) => (
                      <div key={i} style={{
                        background: 'rgba(251,146,60,0.08)', border: '1px solid #fb923c44',
                        borderRadius: 4, padding: '4px 10px', marginBottom: 4, fontSize: 11,
                        display: 'flex', justifyContent: 'space-between',
                      }}>
                        <span style={{ color: '#fdba74' }}>{e.name}</span>
                        {e.type && <span style={{
                          background: '#fb923c22', border: '1px solid #fb923c44',
                          color: '#fb923c', borderRadius: 3, padding: '0 6px', fontSize: 10,
                        }}>{e.type}</span>}
                      </div>
                    ))}
                  </>
                )}
                {/* Dataset matches */}
                {row.matchedDs.length > 0 && (
                  <>
                    <div style={{ color: '#2dd4bf', fontSize: 11, marginBottom: 4, marginTop: 6 }}>◈ DATASETS</div>
                    {row.matchedDs.map((d, i) => (
                      <div key={i} style={{
                        background: 'rgba(45,212,191,0.08)', border: '1px solid #2dd4bf44',
                        borderRadius: 4, padding: '4px 10px', marginBottom: 4, fontSize: 11,
                        display: 'flex', justifyContent: 'space-between',
                      }}>
                        <span style={{ color: '#99f6e4' }}>{d.name}</span>
                        {d.type && <span style={{
                          background: '#2dd4bf22', border: '1px solid #2dd4bf44',
                          color: '#2dd4bf', borderRadius: 3, padding: '0 6px', fontSize: 10,
                        }}>{d.type}</span>}
                      </div>
                    ))}
                  </>
                )}
                {row.matchedGc.length === 0 && row.matchedOe.length === 0 && row.matchedDs.length === 0 && (
                  <div style={{ color: '#ff4444', fontSize: 11 }}>⚠ No network coverage — contact isolated from graph, ops, and data.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export function isPnetcovQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes('pnetcov') ||
    s.includes('personnel network coverage') ||
    s.includes('contact network') ||
    s.includes('isolated contact') ||
    s.includes('isolated personnel') ||
    s.includes('contact graph coverage') ||
    s.includes('personnel graph') ||
    s.includes('contact ops dataset') ||
    s.includes('contact centrality') ||
    s.includes('network coverage personnel') ||
    s.includes('contact network nexus') ||
    s.includes('personnel coverage nexus')
  );
}

export function buildPnetcovScript() {
  return 'PNETCOV online. Opening Personnel Network Coverage — correlating contacts against graph centrality nodes, operational events, and datasets to classify network coverage.';
}
