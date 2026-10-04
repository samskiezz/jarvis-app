import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const GALIE_RE = /\b(galie|annotation\s+live|live\s+annotation|graph\s+annotation\s+live|live\s+graph\s+note|annotation\s+world\s+event|annotation\s+intel|graph\s+note\s+live|annotation\s+live\s+intel)\b/i;

export function isGalieQuery(t) { return GALIE_RE.test(t || ''); }

function normaliseEvents(raw) {
  const quakes = Array.isArray(raw?.earthquakes) ? raw.earthquakes : [];
  const crypto = Array.isArray(raw?.crypto)      ? raw.crypto      : [];
  const fx     = Array.isArray(raw?.fx)          ? raw.fx          :
                 Array.isArray(raw?.forex)        ? raw.forex       : [];
  const out = [];
  quakes.forEach((q, i) => {
    const mag   = q.magnitude ?? q.mag ?? q.properties?.mag ?? '';
    const place = q.place ?? q.location ?? q.properties?.place ?? '';
    out.push({ id: `quake-${i}`, type: 'SEISMIC',
      title: String(q.title ?? q.properties?.title ?? `M${mag} ${place}`).slice(0, 120),
      body: `magnitude:${mag} region:${place} earthquake seismic disaster emergency geopolitical`.slice(0, 300) });
  });
  crypto.forEach((c, i) => {
    const sym = c.symbol ?? c.name ?? `CRYPTO${i}`;
    out.push({ id: `crypto-${i}`, type: 'CRYPTO',
      title: sym,
      body: `asset:${sym} cryptocurrency blockchain defi token trading investment market finance`.slice(0, 300) });
  });
  fx.forEach((f, i) => {
    const pair = f.pair ?? f.symbol ?? f.name ?? `FX${i}`;
    out.push({ id: `fx-${i}`, type: 'FX',
      title: pair,
      body: `currency:${pair} forex exchange-rate international trade monetary FX market`.slice(0, 300) });
  });
  return out;
}

function kwAnn(a) {
  return [a?.text, a?.target_type, a?.actor, a?.name, a?.title,
          a?.description, a?.category, a?.tags, a?.kind, a?.target_id]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildGalieScript() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [annR, intR] = await Promise.allSettled([
    fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
  ]);

  const annotations = (annR.status === 'fulfilled'
    ? (annR.value?.annotations ?? annR.value?.data ?? annR.value ?? []) : []).slice(0, 80);
  const events = intR.status === 'fulfilled' ? normaliseEvents(intR.value) : [];

  let liveAligned = 0, staticCount = 0;
  for (const ann of annotations) {
    const words = kwAnn(ann).split(/\s+/).filter(w => w.length > 3);
    const hasLive = events.some(e => relevance(words, e.body + ' ' + e.title) > 0.12);
    if (hasLive) liveAligned++; else staticCount++;
  }

  return `GALIE: ${annotations.length} graph annotations × ${events.length} live world events. ` +
    `${liveAligned} LIVE-ALIGNED (annotation domain matches current world event), ${staticCount} STATIC (no live signal). ` +
    (liveAligned > 0
      ? `${liveAligned} annotation nodes are operationally heightened by live world events.`
      : 'No graph annotations currently align with live world events.');
}

const CY  = '#00D4FF';
const CY2 = '#22D3EE';
const AM  = '#F59E0B';
const GR  = '#6B7280';
const BG  = 'rgba(6,16,28,0.97)';
const BD  = 'rgba(0,212,255,0.18)';

const TYPE_COL = { SEISMIC: '#EF4444', CRYPTO: CY2, FX: '#A855F7' };

export default function GraphAnnotationLiveIntelExposure() {
  const [open, setOpen]           = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [events, setEvents]       = useState([]);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:galie-toggle', h);
    return () => window.removeEventListener('jarvis:galie-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [aR, iR] = await Promise.allSettled([
        fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
      ]);
      const anns = (aR.status === 'fulfilled'
        ? (aR.value?.annotations ?? aR.value?.data ?? aR.value ?? []) : []).slice(0, 80);
      const evts = iR.status === 'fulfilled' ? normaliseEvents(iR.value) : [];
      setAnnotations(anns);
      setEvents(evts);

      const built = anns.map(ann => {
        const words = kwAnn(ann).split(/\s+/).filter(w => w.length > 3);
        const matched = evts
          .map(e => ({ ...e, _r: relevance(words, e.body + ' ' + e.title) }))
          .filter(e => e._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 6);
        return { ...ann, matched, state: matched.length > 0 ? 'LIVE-ALIGNED' : 'STATIC' };
      });
      setRows(built);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const liveAligned = rows.filter(r => r.state === 'LIVE-ALIGNED').length;
  const staticCount = rows.filter(r => r.state === 'STATIC').length;
  const total       = rows.length || 1;

  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) { const s = search.toLowerCase(); return kwAnn(r).includes(s); }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    try {
      const hdr  = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const base = apiBase();
      const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message:
          `Summarise graph annotation live-world exposure in 2 sentences: ${liveAligned} LIVE-ALIGNED (annotation matches current world event) and ${staticCount} STATIC (no live signal) out of ${rows.length} graph annotations. Events: ${events.length} live signals (seismic/crypto/FX).` }),
      });
      const d   = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 802240, bottom: 8, zIndex: 461, width: 540,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: '0 0 32px rgba(0,212,255,0.12)', display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ GALIE</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>GRAPH-ANNOTATION × LIVE-INTEL</span>
        {liveAligned > 0 && (
          <span style={{ marginLeft: 'auto', background: CY2, color: '#000', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{liveAligned} LIVE</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: liveAligned > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[
          ['ANNOTATIONS', annotations.length, CY],
          ['LIVE EVENTS',  events.length,      '#6E8AA0'],
          ['LIVE-ALIGNED', liveAligned,         CY2],
          ['STATIC',       staticCount,         GR],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{ flex: 1, background: 'rgba(0,212,255,0.05)', borderRadius: 6,
            padding: '4px 2px', textAlign: 'center' }}>
            <div style={{ color: col, fontWeight: 700, fontSize: 13 }}>{loading ? '…' : val}</div>
            <div style={{ color: '#4A6080', fontSize: 8, letterSpacing: 1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ display: 'flex', height: 4, margin: '0 12px 8px', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${(liveAligned / total) * 100}%`, background: CY2 }} />
        <div style={{ width: `${(staticCount  / total) * 100}%`, background: 'rgba(107,114,128,0.4)' }} />
      </div>

      {/* filter + assess */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'LIVE-ALIGNED', 'STATIC'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9,
              background: filter === f ? CY : 'rgba(0,212,255,0.08)',
              color: filter === f ? '#000' : '#6E8AA0', fontWeight: filter === f ? 700 : 400 }}>
            {f}
          </button>
        ))}
        <button onClick={assess} disabled={assessing}
          style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, border: `1px solid ${CY2}`,
            background: 'transparent', color: CY2, cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
      </div>

      {/* search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search annotations…"
          style={{ width: '100%', background: 'rgba(0,212,255,0.05)', border: `1px solid ${BD}`,
            borderRadius: 4, padding: '4px 8px', color: '#DCEBF5', fontSize: 10,
            outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#4A6080', padding: '12px 0', textAlign: 'center' }}>loading…</div>}
        {!loading && filtered.map((r, i) => {
          const id    = r.id ?? r._id ?? i;
          const isExp = expanded === id;
          const label = r.text
            ? (r.text.length > 60 ? r.text.slice(0, 60) + '…' : r.text)
            : (r.target_id || r.actor || '—');
          const stateCol = r.state === 'LIVE-ALIGNED' ? CY2 : GR;
          return (
            <div key={id} style={{ borderBottom: `1px solid rgba(0,212,255,0.07)` }}>
              <div onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 0', cursor: 'pointer' }}>
                <span style={{ color: stateCol, fontSize: 9, minWidth: 96,
                  fontWeight: 700, letterSpacing: 1 }}>{r.state}</span>
                <span style={{ flex: 1, color: '#DCEBF5', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {r.target_type && (
                  <span style={{ color: '#4A6080', fontSize: 9 }}>{r.target_type}</span>
                )}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '4px 0 8px' }}>
                  {r.matched.length === 0 ? (
                    <div style={{ color: '#4A6080', fontSize: 9, padding: '4px 0' }}>
                      no live world event matched this annotation
                    </div>
                  ) : (
                    <div style={{ background: 'rgba(34,211,238,0.06)', borderRadius: 6, padding: 8 }}>
                      <div style={{ color: CY2, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                        MATCHED LIVE EVENTS ({r.matched.length})
                      </div>
                      {r.matched.map((e, j) => (
                        <div key={j} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 9,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              maxWidth: 340 }}>{e.title}</span>
                            <span style={{ color: TYPE_COL[e.type] ?? CY, fontSize: 8,
                              background: 'rgba(0,212,255,0.08)', padding: '0 4px',
                              borderRadius: 3, flexShrink: 0, marginLeft: 4 }}>{e.type}</span>
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(34,211,238,0.15)' }}>
                            <div style={{ height: '100%', borderRadius: 2,
                              width: `${Math.round(e._r * 100)}%`,
                              background: TYPE_COL[e.type] ?? CY }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ color: '#4A6080', textAlign: 'center', padding: '12px 0' }}>no results</div>
        )}
      </div>
    </div>
  );
}
