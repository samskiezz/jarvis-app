/**
 * LiveIntelBrainSystemConvergence — F74
 *
 * Fetches /functions/getLiveIntel + /v1/cinematic/brain + /v1/jarvis/system/status
 * Groups live intel events by category (quake region, crypto symbol, FX pair) and
 * cross-references each against brain node labels AND system service health to classify:
 *   CONVERGED  — brain node match + system healthy (fully aware & capable)
 *   SENSING    — brain node match but system stressed/degraded (aware but capacity-limited)
 *   DEGRADED   — no brain match but system partially healthy (system ok but no mental model)
 *   BLIND      — no brain match + system unhealthy/missing (blind spot)
 *
 * Toggle: ◈ LBCONV button (fixed, bottom strip) left:89800, zIndex:171
 * Stat tiles: events / brain-nodes / services / converged / sensing / degraded / blind
 * Red pulse on BLIND count.
 * Expandable rows: matched brain nodes with centrality score badge
 *                  + system service status list.
 * Filter tabs: ALL / CONVERGED / SENSING / DEGRADED / BLIND + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "lbconv"/"convergence radar"/"live intel brain"/"system convergence"/
 *        "brain convergence"/"intel brain system"/"blind spots"/"convergence"
 * Event: jarvis:lbconv-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'CONVERGED', 'SENSING', 'DEGRADED', 'BLIND'];

const CLS_COLOR = {
  CONVERGED: '#00FF88',
  SENSING:   '#38BDF8',
  DEGRADED:  '#FBBF24',
  BLIND:     '#FF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

function systemHealthy(services) {
  if (!services || services.length === 0) return false;
  const up = services.filter(s => {
    const st = (s.status || s.state || '').toLowerCase();
    return st === 'ok' || st === 'healthy' || st === 'up' || st === 'running' || st === 'online';
  });
  return up.length > 0 && up.length >= services.length * 0.5;
}

function systemStressed(services) {
  if (!services || services.length === 0) return false;
  const down = services.filter(s => {
    const st = (s.status || s.state || '').toLowerCase();
    return st === 'degraded' || st === 'warn' || st === 'warning' || st === 'slow';
  });
  return down.length > 0;
}

export function isLbconvQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'lbconv', 'convergence radar', 'live intel brain', 'system convergence',
    'brain convergence', 'intel brain system', 'blind spots convergence',
    'convergence', 'live brain system',
  ].some(k => s.includes(k));
}

export function buildLbconvScript() {
  return `Fetch /functions/getLiveIntel, /v1/cinematic/brain, and /v1/jarvis/system/status. ` +
    `Group live events by category and cross-reference each against brain node labels and system service health. ` +
    `Classify each event category as CONVERGED/SENSING/DEGRADED/BLIND. ` +
    `Report total blind spots, identify which live event types Jarvis cannot reason about, ` +
    `and suggest which brain nodes or system services need attention to close coverage gaps.`;
}

export default function LiveIntelBrainSystemConvergence() {
  const [open, setOpen]           = useState(false);
  const [events, setEvents]       = useState([]);
  const [nodes, setNodes]         = useState([]);
  const [services, setServices]   = useState([]);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const headers = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [iRes, bRes, sRes] = await Promise.all([
        fetch(`${API}/functions/getLiveIntel`, { headers }),
        fetch(`${API}/v1/cinematic/brain`,      { headers }),
        fetch(`${API}/v1/jarvis/system/status`, { headers }),
      ]);
      const [iRaw, bRaw, sRaw] = await Promise.all([
        iRes.ok ? iRes.json() : {},
        bRes.ok ? bRes.json() : {},
        sRes.ok ? sRes.json() : {},
      ]);

      // Extract nodes from brain response
      const ns = normalizeArray(bRaw, ['nodes', 'items', 'results', 'data']);

      // Extract services from system status
      const svcs = normalizeArray(sRaw, ['services', 'items', 'results', 'data']);
      setServices(svcs);
      setNodes(ns);

      // Build event categories from live intel
      const eventCategories = [];

      // Quakes
      const quakes = normalizeArray(iRaw, ['earthquakes', 'quakes']);
      if (quakes.length > 0) {
        const regions = {};
        quakes.forEach(q => {
          const region = q.region || q.location || q.place || q.title || 'Unknown Region';
          const key = region.split(',')[0].trim();
          if (!regions[key]) regions[key] = { count: 0, items: [] };
          regions[key].count++;
          regions[key].items.push(q);
        });
        Object.entries(regions).forEach(([region, data]) => {
          eventCategories.push({
            category: 'QUAKE',
            label: region,
            detail: `${data.count} earthquake${data.count > 1 ? 's' : ''}`,
            items: data.items,
          });
        });
      }

      // Crypto
      const crypto = normalizeArray(iRaw, ['crypto', 'cryptocurrency', 'cryptocurrencies']);
      crypto.slice(0, 6).forEach(c => {
        const sym = c.symbol || c.name || c.id || '?';
        eventCategories.push({
          category: 'CRYPTO',
          label: sym.toUpperCase(),
          detail: c.price ? `$${Number(c.price).toLocaleString()}` : (c.change || ''),
          items: [c],
        });
      });

      // FX
      const fx = normalizeArray(iRaw, ['fx', 'forex', 'currency', 'currencies']);
      fx.slice(0, 6).forEach(f => {
        const pair = f.pair || f.symbol || f.name || f.id || '?';
        eventCategories.push({
          category: 'FX',
          label: pair.toUpperCase(),
          detail: f.rate ? `${Number(f.rate).toFixed(4)}` : (f.change || ''),
          items: [f],
        });
      });

      // If no events from specific keys, try generic
      if (eventCategories.length === 0) {
        const generic = normalizeArray(iRaw, ['events', 'items', 'results', 'data']);
        generic.slice(0, 12).forEach(ev => {
          const label = ev.title || ev.name || ev.type || ev.id || '?';
          eventCategories.push({
            category: ev.type || 'EVENT',
            label,
            detail: ev.description || '',
            items: [ev],
          });
        });
      }

      setEvents(eventCategories);

      const sysHealthy  = systemHealthy(svcs);
      const sysStressed = systemStressed(svcs);

      const built = eventCategories.map(ev => {
        const evToks = tokens(ev.label + ' ' + ev.category + ' ' + ev.detail);
        const matchedNodes = ns.filter(n =>
          overlaps(evToks, [n.id, n.label, n.name, n.type, n.description].join(' '))
        );
        const hasBrainMatch = matchedNodes.length > 0;

        let cls;
        if (hasBrainMatch && sysHealthy && !sysStressed)    cls = 'CONVERGED';
        else if (hasBrainMatch && (sysHealthy || !svcs.length)) cls = 'SENSING';
        else if (!hasBrainMatch && (sysHealthy || !svcs.length)) cls = 'DEGRADED';
        else                                                   cls = 'BLIND';

        return { ...ev, _cls: cls, _nodes: matchedNodes };
      });

      setRows(built);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:lbconv-toggle', toggle);
    return () => window.removeEventListener('jarvis:lbconv-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = buildLbconvScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers,
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.answer || '';
      if (text && window._jarvisTTS) window._jarvisTTS(text);
    } catch {/* silent */}
    setAssessing(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="LiveIntel × Brain × System Convergence Radar"
        style={{
          position:'fixed', bottom:8, left:89800, zIndex:171,
          background:'rgba(0,20,0,0.85)', border:'1px solid #00FF8866',
          color:'#00FF88', padding:'3px 8px', fontSize:9, borderRadius:3,
          cursor:'pointer', fontFamily:'monospace', whiteSpace:'nowrap',
        }}
      >
        ◈ LBCONV
      </button>
    );
  }

  const counts = { CONVERGED:0, SENSING:0, DEGRADED:0, BLIND:0 };
  rows.forEach(r => { counts[r._cls] = (counts[r._cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(r.label + ' ' + r.category).toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <div style={{
      position:'fixed', bottom:50, right:20, zIndex:9171,
      width:580, maxHeight:'78vh', overflow:'auto',
      background:'rgba(0,8,0,0.97)', border:'1px solid #00FF8833',
      borderRadius:8, padding:14, fontFamily:'monospace', fontSize:11, color:'#ccc',
    }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ color:'#00FF88', fontWeight:700, fontSize:12 }}>
          ◈ LIVEINTEL × BRAIN × SYSTEM — CONVERGENCE RADAR
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background:'none', border:'none', color:'#FF4444', cursor:'pointer', fontSize:14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
        {[
          ['EVENTS',    events.length,        '#00FF88'],
          ['NODES',     nodes.length,         '#38BDF8'],
          ['SERVICES',  services.length,      '#A78BFA'],
          ['CONVERGED', counts.CONVERGED,     '#00FF88'],
          ['SENSING',   counts.SENSING,       '#38BDF8'],
          ['DEGRADED',  counts.DEGRADED,      '#FBBF24'],
          ['BLIND',     counts.BLIND,         '#FF4444'],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background:'rgba(0,20,0,0.6)', border:`1px solid ${color}44`,
            borderRadius:4, padding:'4px 10px', textAlign:'center', minWidth:64,
            animation: label === 'BLIND' && counts.BLIND > 0 ? 'pulse 1.4s ease-in-out infinite' : undefined,
          }}>
            <div style={{ color, fontWeight:700, fontSize:13 }}>{val}</div>
            <div style={{ color:'#555', fontSize:8 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* system health summary */}
      {services.length > 0 && (
        <div style={{
          background:'rgba(0,15,0,0.5)', border:'1px solid #333',
          borderRadius:4, padding:'4px 8px', marginBottom:8, fontSize:9, color:'#888',
        }}>
          SYSTEM:{' '}
          {services.slice(0, 8).map((s, i) => {
            const st = (s.status || s.state || '').toLowerCase();
            const color =
              st === 'ok' || st === 'healthy' || st === 'up' || st === 'running' || st === 'online' ? '#00FF88' :
              st === 'degraded' || st === 'warn' ? '#FBBF24' : '#FF4444';
            return (
              <span key={i} style={{ color, marginRight:6 }}>
                {s.name || s.service || s.id || '?'} [{s.status || s.state || '?'}]
              </span>
            );
          })}
          {services.length > 8 && <span style={{ color:'#555' }}>+{services.length - 8}</span>}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display:'flex', gap:4, marginBottom:8, flexWrap:'wrap', alignItems:'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#00FF8822' : 'transparent',
            border: `1px solid ${tab === t ? '#00FF88' : '#333'}`,
            color: tab === t ? '#00FF88' : '#666',
            padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search events…"
          style={{
            marginLeft:'auto', background:'rgba(0,20,0,0.6)', border:'1px solid #333',
            color:'#ccc', padding:'2px 8px', borderRadius:3, fontSize:9, width:130,
          }}
        />
      </div>

      {/* assess */}
      <button onClick={assess} disabled={assessing} style={{
        background:'rgba(0,40,0,0.8)', border:'1px solid #00FF8866',
        color:'#00FF88', padding:'3px 12px', borderRadius:3, cursor:'pointer',
        fontSize:9, marginBottom:10,
      }}>
        {assessing ? '…' : '▶ ASSESS'}
      </button>

      {loading && <div style={{ color:'#555', marginBottom:6 }}>loading…</div>}
      {error   && <div style={{ color:'#FF4444', marginBottom:6 }}>Error: {error}</div>}

      {/* rows */}
      {visible.map((row, i) => (
        <div key={i} style={{ borderBottom:'1px solid #111', paddingBottom:6, marginBottom:6 }}>
          <div
            onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
            style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}
          >
            <span style={{
              color: CLS_COLOR[row._cls],
              background:`${CLS_COLOR[row._cls]}18`,
              border:`1px solid ${CLS_COLOR[row._cls]}44`,
              padding:'1px 6px', borderRadius:3, fontSize:8, fontWeight:700, minWidth:72,
            }}>{row._cls}</span>
            <span style={{
              color:'#888', fontSize:8, fontWeight:700,
              background:'rgba(255,255,255,0.05)', padding:'1px 5px', borderRadius:2,
            }}>{row.category}</span>
            <span style={{ color:'#ddd', flex:1 }}>{row.label}</span>
            {row.detail && (
              <span style={{ color:'#666', fontSize:9 }}>{row.detail}</span>
            )}
            <span style={{ color:'#444', fontSize:8 }}>N:{row._nodes.length}</span>
            <span style={{ color:'#444' }}>{expanded[i] ? '▲' : '▼'}</span>
          </div>

          {expanded[i] && (
            <div style={{ paddingLeft:12, marginTop:6, display:'flex', flexDirection:'column', gap:6 }}>
              {row._nodes.length > 0 && (
                <div>
                  <span style={{ color:'#38BDF8', fontWeight:700 }}>Brain Nodes ({row._nodes.length}):</span>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:3 }}>
                    {row._nodes.slice(0, 8).map((n, j) => (
                      <span key={j} style={{
                        background:'rgba(56,189,248,0.12)', border:'1px solid #38BDF844',
                        padding:'1px 6px', borderRadius:3, fontSize:9,
                      }}>
                        {n.label || n.name || n.id || '?'}
                        {n.centrality !== undefined && (
                          <span style={{ color:'#38BDF8', marginLeft:4 }}>
                            {typeof n.centrality === 'number' ? n.centrality.toFixed(3) : n.centrality}
                          </span>
                        )}
                      </span>
                    ))}
                    {row._nodes.length > 8 && (
                      <span style={{ fontSize:9, color:'#555' }}>+{row._nodes.length - 8}</span>
                    )}
                  </div>
                </div>
              )}
              {services.length > 0 && (
                <div>
                  <span style={{ color:'#A78BFA', fontWeight:700 }}>System Services:</span>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:3 }}>
                    {services.slice(0, 6).map((s, j) => {
                      const st = (s.status || s.state || '').toLowerCase();
                      const color =
                        st === 'ok' || st === 'healthy' || st === 'up' || st === 'running' || st === 'online' ? '#00FF88' :
                        st === 'degraded' || st === 'warn' ? '#FBBF24' : '#FF6666';
                      return (
                        <span key={j} style={{
                          background:'rgba(167,139,250,0.1)', border:`1px solid ${color}44`,
                          padding:'1px 6px', borderRadius:3, fontSize:9,
                        }}>
                          {s.name || s.service || s.id || '?'}
                          <span style={{ color, marginLeft:4 }}>{s.status || s.state || '?'}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {row._nodes.length === 0 && (
                <span style={{ color:'#FF4444', fontSize:9 }}>
                  No brain node maps to this event — blind spot in Jarvis reasoning model.
                </span>
              )}
            </div>
          )}
        </div>
      ))}

      {visible.length === 0 && !loading && (
        <div style={{ color:'#555', padding:'10px 0' }}>
          {events.length === 0 ? 'No live intel events received.' : 'No events match filter.'}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.3; }
        }
      `}</style>
    </div>
  );
}
