import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const CGASC_RE = /\b(cgasc|contact\s+graph\s+annotation\s+scenario|contact\s+annotation\s+scenario|dark\s+contact\s+annotation|contact\s+scenario\s+annotation|annotation\s+scenario\s+contact|contact\s+annotation\s+plan|contact\s+fully\s+planned|annotated\s+contact\s+scenario|contact\s+graph\s+scenario\s+annotation|contact\s+graph\s+plan|contact\s+annotation\s+response\s+plan|contact\s+graph\s+response|contact\s+annotation\s+gap)\b/i;

export function isCgascQuery(t) { return CGASC_RE.test(t || ''); }

function kwContact(c) {
  return [c?.name, c?.email, c?.company, c?.title, c?.description,
          c?.role, c?.tags, c?.sector, c?.department]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwAnnotation(a) {
  return [a?.text, a?.target_type, a?.actor, a?.name,
          a?.description, a?.category, a?.tags, a?.kind]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwScenario(s) {
  return [s?.name, s?.description, s?.category, s?.tags,
          s?.title, s?.objective, s?.type, s?.status]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildCgascScript() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [cR, aR, sR] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`,        { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/graph/annotations`,    { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`,        { headers: hdr }).then(r => r.json()),
  ]);

  const contacts     = (cR.status === 'fulfilled'
    ? (cR.value?.data ?? cR.value?.contacts ?? cR.value ?? []) : []).slice(0, 200);
  const annotations  = (aR.status === 'fulfilled'
    ? (aR.value?.data ?? aR.value?.annotations ?? aR.value ?? []) : []).slice(0, 200);
  const scenarios    = (sR.status === 'fulfilled'
    ? (sR.value?.data ?? sR.value?.scenarios ?? sR.value ?? []) : []).slice(0, 200);

  let fullyPlanned = 0, annotated = 0, scenarioLinked = 0, dark = 0;
  for (const contact of contacts) {
    const words = kwContact(contact).split(/\s+/).filter(w => w.length > 3);
    const hasAnnotation = annotations.some(a => relevance(words, kwAnnotation(a)) > 0.12);
    const hasScenario   = scenarios.some(s => relevance(words, kwScenario(s)) > 0.12);
    if (hasAnnotation && hasScenario) fullyPlanned++;
    else if (hasAnnotation)           annotated++;
    else if (hasScenario)             scenarioLinked++;
    else                              dark++;
  }

  return `CGASC: ${contacts.length} contacts × ${annotations.length} graph annotations × ${scenarios.length} scenarios. ` +
    `${fullyPlanned} FULLY PLANNED (annotation+scenario), ${annotated} ANNOTATED, ` +
    `${scenarioLinked} SCENARIO-LINKED, ${dark} DARK. ` +
    (dark > 0
      ? `${dark} contacts have no graph annotation or scenario coverage — personnel intelligence gap.`
      : 'All contacts have annotation or scenario coverage.');
}

const CY  = '#00D4FF';
const CY2 = '#22D3EE';
const GN  = '#10B981';
const VT  = '#8B5CF6';
const AM  = '#F59E0B';
const GY  = '#6B7280';
const BG  = 'rgba(6,16,28,0.97)';
const BD  = 'rgba(0,212,255,0.18)';

const STATE_COL = { 'FULLY PLANNED': GN, 'ANNOTATED': CY, 'SCENARIO-LINKED': VT, DARK: GY };

export default function ContactGraphAnnotationScenarioTriple() {
  const [open, setOpen]           = useState(false);
  const [contacts, setContacts]   = useState([]);
  const [annotations, setAnnotations] = useState([]);
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
    window.addEventListener('jarvis:cgasc-toggle', h);
    return () => window.removeEventListener('jarvis:cgasc-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [cR, aR, sR] = await Promise.allSettled([
        fetch(`${base}/entities/Contact`,     { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`,     { headers: hdr }).then(r => r.json()),
      ]);
      const cs = (cR.status === 'fulfilled'
        ? (cR.value?.data ?? cR.value?.contacts ?? cR.value ?? []) : []).slice(0, 200);
      const as_ = (aR.status === 'fulfilled'
        ? (aR.value?.data ?? aR.value?.annotations ?? aR.value ?? []) : []).slice(0, 200);
      const ss = (sR.status === 'fulfilled'
        ? (sR.value?.data ?? sR.value?.scenarios ?? sR.value ?? []) : []).slice(0, 200);
      setContacts(cs);
      setAnnotations(as_);
      setScenarios(ss);

      const built = cs.map(contact => {
        const words = kwContact(contact).split(/\s+/).filter(w => w.length > 3);
        const matchedAnnotations = as_
          .map(a => ({ ...a, _r: relevance(words, kwAnnotation(a)) }))
          .filter(a => a._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const matchedScenarios = ss
          .map(s => ({ ...s, _r: relevance(words, kwScenario(s)) }))
          .filter(s => s._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const hasAnnotation = matchedAnnotations.length > 0;
        const hasScenario   = matchedScenarios.length > 0;
        const state = hasAnnotation && hasScenario ? 'FULLY PLANNED'
          : hasAnnotation                          ? 'ANNOTATED'
          : hasScenario                            ? 'SCENARIO-LINKED'
          : 'DARK';
        return { ...contact, matchedAnnotations, matchedScenarios, state };
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

  const fullyPlanned   = rows.filter(r => r.state === 'FULLY PLANNED').length;
  const annotated_     = rows.filter(r => r.state === 'ANNOTATED').length;
  const scenarioLinked = rows.filter(r => r.state === 'SCENARIO-LINKED').length;
  const dark           = rows.filter(r => r.state === 'DARK').length;
  const total          = rows.length || 1;

  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) { const s = search.toLowerCase(); return kwContact(r).includes(s); }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const base = apiBase();
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message:
          `Summarise contact graph annotation and scenario coverage in 2 sentences: ` +
          `${fullyPlanned} FULLY PLANNED (annotation+scenario), ${annotated_} ANNOTATED only, ` +
          `${scenarioLinked} SCENARIO-LINKED only, ${dark} DARK out of ${rows.length} contacts. ` +
          `Annotations: ${annotations.length}, scenarios: ${scenarios.length}.` }),
      });
      const d   = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 808400, bottom: 8, zIndex: 472, width: 540,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: '0 0 32px rgba(0,212,255,0.12)', display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ CGASC</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>CONTACT × ANNOTATION × SCENARIO</span>
        {dark > 0 && (
          <span style={{ marginLeft: 'auto', background: AM, color: '#000', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{dark} DARK</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: dark > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[
          ['CONTACTS',   contacts.length,   CY],
          ['ANNOTS',     annotations.length, CY2],
          ['SCENARIOS',  scenarios.length,  VT],
          ['PLANNED',    fullyPlanned,       GN],
          ['ANNOTATED',  annotated_,         CY],
          ['SCEN-LINK',  scenarioLinked,     VT],
          ['DARK',       dark,               AM],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{ flex: 1, background: 'rgba(0,212,255,0.05)', borderRadius: 6,
            padding: '4px 2px', textAlign: 'center' }}>
            <div style={{ color: col, fontWeight: 700, fontSize: 12 }}>{loading ? '…' : val}</div>
            <div style={{ color: '#4A6080', fontSize: 7, letterSpacing: 0.5 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ display: 'flex', height: 4, margin: '0 12px 8px', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${(fullyPlanned   / total) * 100}%`, background: GN }} />
        <div style={{ width: `${(annotated_     / total) * 100}%`, background: CY }} />
        <div style={{ width: `${(scenarioLinked / total) * 100}%`, background: VT }} />
        <div style={{ width: `${(dark           / total) * 100}%`, background: 'rgba(107,114,128,0.4)' }} />
      </div>

      {/* filter + assess */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY PLANNED', 'ANNOTATED', 'SCENARIO-LINKED', 'DARK'].map(f => (
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
          placeholder="search contacts…"
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
          const label = r.name ?? r.email ?? r.company ?? '—';
          const stateCol = STATE_COL[r.state] ?? GY;
          return (
            <div key={id} style={{ borderBottom: `1px solid rgba(0,212,255,0.07)` }}>
              <div onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 0', cursor: 'pointer' }}>
                <span style={{ color: stateCol, fontSize: 8, minWidth: 128,
                  fontWeight: 700, letterSpacing: 0.5 }}>{r.state}</span>
                <span style={{ flex: 1, color: '#DCEBF5', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {(r.title ?? r.role) && (
                  <span style={{ color: '#4A6080', fontSize: 9 }}>{r.title ?? r.role}</span>
                )}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '4px 0 8px' }}>
                  {r.matchedAnnotations.length === 0 && r.matchedScenarios.length === 0 ? (
                    <div style={{ color: '#4A6080', fontSize: 9, padding: '4px 0' }}>
                      no annotation or scenario matched this contact
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, background: 'rgba(0,212,255,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: CY, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          ANNOTATIONS ({r.matchedAnnotations.length})
                        </div>
                        {r.matchedAnnotations.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedAnnotations.map((a, k) => (
                            <div key={k} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 130 }}>{a.text ?? a.name ?? `Annotation ${k + 1}`}</span>
                                {(a.target_type ?? a.kind) && (
                                  <span style={{ color: '#4A6080', fontSize: 8, flexShrink: 0, marginLeft: 4 }}>
                                    {a.target_type ?? a.kind}
                                  </span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(0,212,255,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(a._r * 100)}%`, background: CY }} />
                              </div>
                            </div>
                          ))
                        }
                      </div>
                      <div style={{ flex: 1, background: 'rgba(139,92,246,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: VT, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          SCENARIOS ({r.matchedScenarios.length})
                        </div>
                        {r.matchedScenarios.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedScenarios.map((s, idx) => (
                            <div key={idx} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 110 }}>{s.name ?? s.title ?? `Scenario ${idx + 1}`}</span>
                                {(s.category ?? s.type) && (
                                  <span style={{ color: VT, fontSize: 8, flexShrink: 0, marginLeft: 4, fontWeight: 700 }}>
                                    {s.category ?? s.type}
                                  </span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(139,92,246,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(s._r * 100)}%`, background: VT }} />
                              </div>
                            </div>
                          ))
                        }
                      </div>
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
