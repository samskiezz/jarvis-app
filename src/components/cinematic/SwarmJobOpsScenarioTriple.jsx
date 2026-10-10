import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SJOETRI_RE = /\b(sjoetri|swarm\s+job\s+ops\s+scenario|swarm\s+ops\s+scenario|unaddressed\s+swarm\s+job|swarm\s+job\s+fully\s+covered|swarm\s+scenario\s+ops|swarm\s+job\s+scenario\s+coverage|swarm\s+job\s+ops\s+coverage|swarm\s+ops\s+event\s+scenario|swarm\s+job\s+triple)\b/i;

export function isSwjoestriQuery(t) { return SJOETRI_RE.test(t || ''); }

function kw(obj) {
  return [obj?.name, obj?.title, obj?.type, obj?.objective, obj?.description,
          obj?.kind, obj?.category, obj?.severity, obj?.tags]
    .filter(Boolean).join(' ').toLowerCase();
}

function score(haystack, needles) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildSwjoestriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [jobR, opsR, scnR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/ops/events`,     { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`,  { headers: hdr }).then(r => r.json()),
  ]);

  const jobs    = (jobR.status === 'fulfilled' ? (jobR.value?.data ?? jobR.value ?? []) : []).slice(0, 80);
  const events  = (opsR.status === 'fulfilled' ? (opsR.value?.data ?? opsR.value ?? []) : []).slice(0, 80);
  const scenarios = (scnR.status === 'fulfilled' ? (scnR.value?.data ?? scnR.value ?? []) : []).slice(0, 80);

  let fullyCovered = 0, opsTriggered = 0, scenarioBacked = 0, unaddressed = 0;
  for (const j of jobs) {
    const words = kw(j).split(/\s+/).filter(w => w.length > 3);
    const hasOps = events.some(e   => score(kw(e), words) > 0.15);
    const hasScn = scenarios.some(s => score(kw(s), words) > 0.15);
    if (hasOps && hasScn) fullyCovered++;
    else if (hasOps) opsTriggered++;
    else if (hasScn) scenarioBacked++;
    else unaddressed++;
  }

  return `SJOETRI: ${jobs.length} swarm jobs × ${events.length} ops events × ${scenarios.length} scenarios. ` +
    `${fullyCovered} FULLY COVERED, ${opsTriggered} OPS-TRIGGERED, ${scenarioBacked} SCENARIO-BACKED, ${unaddressed} UNADDRESSED. ` +
    (unaddressed > 0
      ? `${unaddressed} swarm jobs lack both ops event coverage and scenario response plans — operational gap.`
      : 'All swarm jobs have ops event or scenario coverage.');
}

const GR = '#00FF88'; const OR = '#F97316'; const VL = '#A855F7'; const RD = '#EF4444';
const BG = 'rgba(6,16,28,0.97)'; const BD = 'rgba(0,212,255,0.18)'; const CY = '#00D4FF';

export default function SwarmJobOpsScenarioTriple() {
  const [open, setOpen]           = useState(false);
  const [jobs, setJobs]           = useState([]);
  const [events, setEvents]       = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:sjoetri-toggle', h);
    return () => window.removeEventListener('jarvis:sjoetri-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [jR, eR, sR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`,     { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`,  { headers: hdr }).then(r => r.json()),
      ]);
      const jbs = (jR.status === 'fulfilled' ? (jR.value?.data ?? jR.value ?? []) : []).slice(0, 80);
      const evs = (eR.status === 'fulfilled' ? (eR.value?.data ?? eR.value ?? []) : []).slice(0, 80);
      const scns = (sR.status === 'fulfilled' ? (sR.value?.data ?? sR.value ?? []) : []).slice(0, 80);
      setJobs(jbs); setEvents(evs); setScenarios(scns);

      const built = jbs.map(j => {
        const words = kw(j).split(/\s+/).filter(w => w.length > 3);
        const matchedEvs = evs
          .map(e  => ({ ...e,  _se: score(kw(e),  words) }))
          .filter(e  => e._se  > 0.15)
          .sort((a, b) => b._se  - a._se)
          .slice(0, 5);
        const matchedScns = scns
          .map(s => ({ ...s, _ss: score(kw(s), words) }))
          .filter(s => s._ss > 0.15)
          .sort((a, b) => b._ss - a._ss)
          .slice(0, 5);
        const hasE = matchedEvs.length > 0;
        const hasS = matchedScns.length > 0;
        const state = hasE && hasS ? 'FULLY COVERED'
          : hasE ? 'OPS-TRIGGERED'
          : hasS ? 'SCENARIO-BACKED'
          : 'UNADDRESSED';
        return { ...j, matchedEvs, matchedScns, state };
      });
      setRows(built);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) { const s = search.toLowerCase(); return kw(r).includes(s); }
    return true;
  });

  const fullyCovered  = rows.filter(r => r.state === 'FULLY COVERED').length;
  const opsTriggered  = rows.filter(r => r.state === 'OPS-TRIGGERED').length;
  const scenarioBacked = rows.filter(r => r.state === 'SCENARIO-BACKED').length;
  const unaddressed   = rows.filter(r => r.state === 'UNADDRESSED').length;
  const total         = rows.length || 1;

  const assess = async () => {
    setAssessing(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Summarise swarm job operational coverage in 2 sentences: ${fullyCovered} fully covered (ops+scenario), ${opsTriggered} ops-triggered, ${scenarioBacked} scenario-backed, ${unaddressed} unaddressed out of ${rows.length} swarm jobs.` }),
      });
      const d = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  const stateColor = s => s === 'FULLY COVERED' ? GR : s === 'OPS-TRIGGERED' ? OR : s === 'SCENARIO-BACKED' ? VL : RD;

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 796080, bottom: 8, zIndex: 450, width: 560,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: `0 0 32px rgba(0,212,255,0.12)`, display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ SJOETRI</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>SWARMJOB × OPS-EVENT × SCENARIO</span>
        {unaddressed > 0 && (
          <span style={{ marginLeft: 'auto', background: RD, color: '#fff', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{unaddressed} UNADDRESSED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: unaddressed > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[['SWARM JOBS', jobs.length, CY], ['OPS EVENTS', events.length, '#6E8AA0'],
          ['SCENARIOS', scenarios.length, '#6E8AA0'], ['COVERED', fullyCovered, GR],
          ['OPS-TRIG', opsTriggered, OR], ['SCN-BACK', scenarioBacked, VL], ['UNADDRESSED', unaddressed, RD]
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
        <div style={{ width: `${(fullyCovered   / total) * 100}%`, background: GR }} />
        <div style={{ width: `${(opsTriggered   / total) * 100}%`, background: OR }} />
        <div style={{ width: `${(scenarioBacked / total) * 100}%`, background: VL }} />
        <div style={{ width: `${(unaddressed    / total) * 100}%`, background: RD }} />
      </div>

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY COVERED', 'OPS-TRIGGERED', 'SCENARIO-BACKED', 'UNADDRESSED'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9,
              background: filter === f ? CY : 'rgba(0,212,255,0.08)',
              color: filter === f ? '#000' : '#6E8AA0', fontWeight: filter === f ? 700 : 400 }}>
            {f}
          </button>
        ))}
        <button onClick={assess} disabled={assessing}
          style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, border: `1px solid ${OR}`,
            background: 'transparent', color: OR, cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
      </div>

      {/* search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{ width: '100%', background: 'rgba(0,212,255,0.05)', border: `1px solid ${BD}`,
            borderRadius: 4, padding: '4px 8px', color: '#DCEBF5', fontSize: 10,
            outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#4A6080', padding: '12px 0', textAlign: 'center' }}>loading…</div>}
        {!loading && filtered.map((r, i) => {
          const id = r.id ?? r._id ?? i;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ borderBottom: `1px solid rgba(0,212,255,0.07)` }}>
              <div onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                <span style={{ color: stateColor(r.state), fontSize: 9, minWidth: 104,
                  fontWeight: 700, letterSpacing: 1 }}>{r.state}</span>
                <span style={{ flex: 1, color: '#DCEBF5', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name || r.title || r.kind || r.id || '—'}
                </span>
                {r.type && <span style={{ color: '#4A6080', fontSize: 9 }}>{r.type}</span>}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ display: 'flex', gap: 8, padding: '4px 0 8px' }}>
                  {/* ops events pane */}
                  <div style={{ flex: 1, background: 'rgba(249,115,22,0.06)', borderRadius: 6, padding: 8 }}>
                    <div style={{ color: OR, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                      OPS EVENTS ({r.matchedEvs.length})
                    </div>
                    {r.matchedEvs.length === 0
                      ? <div style={{ color: '#4A6080', fontSize: 9 }}>none matched</div>
                      : r.matchedEvs.map((e, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 9 }}>{e.name || e.title || '—'}</span>
                            {e.severity && <span style={{ color: OR, fontSize: 8, background: 'rgba(249,115,22,0.1)',
                              padding: '0 4px', borderRadius: 3 }}>{e.severity}</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(249,115,22,0.15)' }}>
                            <div style={{ height: '100%', width: `${Math.round(e._se * 100)}%`,
                              background: OR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>

                  {/* scenarios pane */}
                  <div style={{ flex: 1, background: 'rgba(168,85,247,0.06)', borderRadius: 6, padding: 8 }}>
                    <div style={{ color: VL, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                      SCENARIOS ({r.matchedScns.length})
                    </div>
                    {r.matchedScns.length === 0
                      ? <div style={{ color: '#4A6080', fontSize: 9 }}>none matched</div>
                      : r.matchedScns.map((s, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 9 }}>{s.name || s.title || '—'}</span>
                            {s.category && <span style={{ color: VL, fontSize: 8, background: 'rgba(168,85,247,0.1)',
                              padding: '0 4px', borderRadius: 3 }}>{s.category}</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(168,85,247,0.15)' }}>
                            <div style={{ height: '100%', width: `${Math.round(s._ss * 100)}%`,
                              background: VL, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>
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
