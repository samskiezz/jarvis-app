import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RCSCEN_RE = /\b(rcscen|report\s+contact\s+scenario|governed\s+report|unmanaged\s+report|report\s+governance\s+scenario|contact\s+report\s+scenario|scenario\s+report\s+contact|report\s+triple\s+coverage|report\s+contact\s+scenario\s+triple)\b/i;

export function isRcscenQuery(t) { return RCSCEN_RE.test(t || ''); }

function kw(obj) {
  return [obj?.name, obj?.title, obj?.description, obj?.type, obj?.category,
          obj?.email, obj?.company, obj?.tags]
    .filter(Boolean).join(' ').toLowerCase();
}

function score(haystack, needles) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildRcscenScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [rptR, conR, scnR] = await Promise.allSettled([
    fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
  ]);

  const reports   = (rptR.status === 'fulfilled' ? (rptR.value?.data ?? rptR.value ?? []) : []).slice(0, 80);
  const contacts  = (conR.status === 'fulfilled' ? (conR.value?.data ?? conR.value ?? []) : []).slice(0, 80);
  const scenarios = (scnR.status === 'fulfilled' ? (scnR.value?.data ?? scnR.value ?? []) : []).slice(0, 80);

  let governed = 0, contactLinked = 0, scenarioBacked = 0, unmanaged = 0;
  for (const r of reports) {
    const words = kw(r).split(/\s+/).filter(w => w.length > 3);
    const hasContact  = contacts.some(c  => score(kw(c),  words) > 0.15);
    const hasScenario = scenarios.some(s => score(kw(s),  words) > 0.15);
    if (hasContact && hasScenario) governed++;
    else if (hasContact) contactLinked++;
    else if (hasScenario) scenarioBacked++;
    else unmanaged++;
  }

  return `RCSCEN: ${reports.length} reports × ${contacts.length} contacts × ${scenarios.length} scenarios. ` +
    `${governed} FULLY GOVERNED, ${contactLinked} CONTACT-LINKED, ${scenarioBacked} SCENARIO-BACKED, ${unmanaged} UNMANAGED. ` +
    (unmanaged > 0 ? `${unmanaged} reports lack both contact and scenario coverage — governance gap.` : 'All reports have governance coverage.');
}

const GR = '#00FF88'; const CY = '#00D4FF'; const VL = '#A855F7'; const AM = '#F59E0B';
const BG = 'rgba(6,16,28,0.97)'; const BD = 'rgba(0,212,255,0.18)';

export default function ReportContactScenarioTriple() {
  const [open, setOpen]         = useState(false);
  const [reports, setReports]   = useState([]);
  const [contacts, setContacts] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [rows, setRows]         = useState([]);
  const [filter, setFilter]     = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:rcscen-toggle', h);
    return () => window.removeEventListener('jarvis:rcscen-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [rR, cR, sR] = await Promise.allSettled([
        fetch(`${API}/v1/reports`,         { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/Contact`,   { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`,   { headers: hdr }).then(r => r.json()),
      ]);
      const rpts = (rR.status === 'fulfilled' ? (rR.value?.data ?? rR.value ?? []) : []).slice(0, 80);
      const cons = (cR.status === 'fulfilled' ? (cR.value?.data ?? cR.value ?? []) : []).slice(0, 80);
      const scns = (sR.status === 'fulfilled' ? (sR.value?.data ?? sR.value ?? []) : []).slice(0, 80);
      setReports(rpts); setContacts(cons); setScenarios(scns);

      const built = rpts.map(r => {
        const words = kw(r).split(/\s+/).filter(w => w.length > 3);
        const matchedCons = cons
          .map(c  => ({ ...c,  _sc: score(kw(c),  words) }))
          .filter(c  => c._sc  > 0.15)
          .sort((a, b) => b._sc  - a._sc)
          .slice(0, 5);
        const matchedScns = scns
          .map(s => ({ ...s, _ss: score(kw(s), words) }))
          .filter(s => s._ss > 0.15)
          .sort((a, b) => b._ss - a._ss)
          .slice(0, 5);
        const hasC = matchedCons.length > 0;
        const hasS = matchedScns.length > 0;
        const state = hasC && hasS ? 'FULLY GOVERNED'
          : hasC ? 'CONTACT-LINKED'
          : hasS ? 'SCENARIO-BACKED'
          : 'UNMANAGED';
        return { ...r, matchedCons, matchedScns, state };
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

  const governed    = rows.filter(r => r.state === 'FULLY GOVERNED').length;
  const conLinked   = rows.filter(r => r.state === 'CONTACT-LINKED').length;
  const scnBacked   = rows.filter(r => r.state === 'SCENARIO-BACKED').length;
  const unmanaged   = rows.filter(r => r.state === 'UNMANAGED').length;
  const total       = rows.length || 1;

  const assess = async () => {
    setAssessing(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Summarise report governance coverage in 2 sentences: ${governed} fully governed, ${conLinked} contact-linked, ${scnBacked} scenario-backed, ${unmanaged} unmanaged out of ${rows.length} reports.` }),
      });
      const d = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  const stateColor = s => s === 'FULLY GOVERNED' ? GR : s === 'CONTACT-LINKED' ? CY : s === 'SCENARIO-BACKED' ? VL : AM;

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 795520, bottom: 8, zIndex: 449, width: 560,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: `0 0 32px rgba(0,212,255,0.12)`, display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ RCSCEN</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>REPORT × CONTACT × SCENARIO</span>
        {unmanaged > 0 && (
          <span style={{ marginLeft: 'auto', background: AM, color: '#000', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{unmanaged} UNMANAGED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: unmanaged > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[['REPORTS', rows.length, CY], ['CONTACTS', contacts.length, '#6E8AA0'],
          ['SCENARIOS', scenarios.length, '#6E8AA0'], ['GOVERNED', governed, GR],
          ['CON-LINK', conLinked, CY], ['SCN-BACK', scnBacked, VL], ['UNMANAGED', unmanaged, AM]
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
        <div style={{ width: `${(governed  / total) * 100}%`, background: GR }} />
        <div style={{ width: `${(conLinked / total) * 100}%`, background: CY }} />
        <div style={{ width: `${(scnBacked / total) * 100}%`, background: VL }} />
        <div style={{ width: `${(unmanaged / total) * 100}%`, background: AM }} />
      </div>

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY GOVERNED', 'CONTACT-LINKED', 'SCENARIO-BACKED', 'UNMANAGED'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9,
              background: filter === f ? CY : 'rgba(0,212,255,0.08)',
              color: filter === f ? '#000' : '#6E8AA0', fontWeight: filter === f ? 700 : 400 }}>
            {f}
          </button>
        ))}
        <button onClick={assess} disabled={assessing}
          style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, border: `1px solid ${AM}`,
            background: 'transparent', color: AM, cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
      </div>

      {/* search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search reports…"
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
                <span style={{ color: stateColor(r.state), fontSize: 9, minWidth: 90,
                  fontWeight: 700, letterSpacing: 1 }}>{r.state}</span>
                <span style={{ flex: 1, color: '#DCEBF5', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name || r.title || r.id || '—'}
                </span>
                {r.type && <span style={{ color: '#4A6080', fontSize: 9 }}>{r.type}</span>}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ display: 'flex', gap: 8, padding: '4px 0 8px' }}>
                  {/* contacts pane */}
                  <div style={{ flex: 1, background: 'rgba(0,212,255,0.05)', borderRadius: 6, padding: 8 }}>
                    <div style={{ color: CY, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                      CONTACTS ({r.matchedCons.length})
                    </div>
                    {r.matchedCons.length === 0
                      ? <div style={{ color: '#4A6080', fontSize: 9 }}>none matched</div>
                      : r.matchedCons.map((c, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 9 }}>{c.name || c.email || '—'}</span>
                            {c.title && <span style={{ color: CY, fontSize: 8, background: 'rgba(0,212,255,0.1)',
                              padding: '0 4px', borderRadius: 3 }}>{c.title}</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(0,212,255,0.15)' }}>
                            <div style={{ height: '100%', width: `${Math.round(c._sc * 100)}%`,
                              background: CY, borderRadius: 2 }} />
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
