import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CASCNTRI_RE = /\b(cascntri|contact\s+aip\s+scenario|contact\s+skill\s+scenario|contact\s+scenario\s+skill|unequipped\s+contact|skilled\s+contact|contact\s+capability\s+scenario|contact\s+scenario\s+aip|contact\s+fully\s+equipped|contact\s+triple\s+capability|contact\s+aip\s+skill\s+scenario)\b/i;

export function isCascntriQuery(t) { return CASCNTRI_RE.test(t || ''); }

function normContacts(raw) {
  if (Array.isArray(raw)) return raw.slice(0, 80);
  return (raw.contacts ?? raw.data ?? raw.results ?? raw.items ?? []).slice(0, 80);
}

function normSkills(raw) {
  if (Array.isArray(raw)) return raw.slice(0, 80);
  return (raw.skills ?? raw.data ?? raw.results ?? []).slice(0, 80);
}

function normScenarios(raw) {
  if (Array.isArray(raw)) return raw.slice(0, 80);
  return (raw.scenarios ?? raw.data ?? raw.results ?? raw.items ?? []).slice(0, 80);
}

function contactKw(c) {
  return [c.name, c.full_name, c.email, c.company, c.organisation, c.title, c.role, c.description, c.sector]
    .filter(Boolean).join(' ').toLowerCase();
}

function skillKw(s) {
  return [s.name, s.title, s.description, s.category, ...(s.tags ?? [])]
    .filter(Boolean).join(' ').toLowerCase();
}

function scenarioKw(sc) {
  return [sc.name, sc.title, sc.description, sc.category, sc.type, ...(sc.tags ?? [])]
    .filter(Boolean).join(' ').toLowerCase();
}

function tokens(str) {
  return str.split(/\W+/).filter(t => t.length > 2);
}

function hasOverlap(ctxTokens, corpus) {
  return ctxTokens.some(tok => corpus.includes(tok));
}

function scoreOverlap(ctxTokens, itemStr) {
  if (!ctxTokens.length) return 0;
  return ctxTokens.reduce((n, tok) => n + (itemStr.includes(tok) ? 1 : 0), 0) / ctxTokens.length;
}

export async function buildCascntriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [cR, skR, scR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`,    { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`,        { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`,    { headers: hdr }).then(r => r.json()),
  ]);

  const contacts   = normContacts(cR.status === 'fulfilled' ? (cR.value ?? {}) : {});
  const skills     = normSkills(skR.status === 'fulfilled' ? (skR.value ?? {}) : {});
  const scenarios  = normScenarios(scR.status === 'fulfilled' ? (scR.value ?? {}) : {});

  const skillCorpus    = skills.map(skillKw).join(' ');
  const scenarioCorpus = scenarios.map(scenarioKw).join(' ');

  let fullyEquipped = 0, skilled = 0, scenarioLinked = 0, unequipped = 0;
  for (const c of contacts) {
    const toks = tokens(contactKw(c));
    const hasSk = hasOverlap(toks, skillCorpus);
    const hasSc = hasOverlap(toks, scenarioCorpus);
    if (hasSk && hasSc) fullyEquipped++;
    else if (hasSk) skilled++;
    else if (hasSc) scenarioLinked++;
    else unequipped++;
  }

  return `CASCNTRI Contact × AIP Skill × Scenario: ${contacts.length} contacts assessed against ` +
    `${skills.length} AIP skills and ${scenarios.length} scenario plans. ` +
    `FULLY EQUIPPED: ${fullyEquipped} (matching AIP skill + scenario — both capability and response plan confirmed). ` +
    `SKILLED: ${skilled} (skill match, no scenario — capable but no response plan). ` +
    `SCENARIO-LINKED: ${scenarioLinked} (scenario match, no skill — response plan without matching capability). ` +
    `UNEQUIPPED: ${unequipped} (no skill or scenario coverage — capability gap). ` +
    (unequipped > 0
      ? `${unequipped} contacts have no AIP skill or scenario coverage — personnel capability gap.`
      : 'All contacts have AIP skill or scenario coverage.');
}

const GR = '#4ade80';
const VI = '#a78bfa';
const CY = '#67e8f9';
const GY = '#94a3b8';
const CYB = '#00D4FF';
const BG = 'rgba(6,16,28,0.97)';
const BD = 'rgba(0,212,255,0.18)';

const STATE_COLOR = {
  'FULLY EQUIPPED':  GR,
  'SKILLED':         VI,
  'SCENARIO-LINKED': CY,
  'UNEQUIPPED':      GY,
};

export default function ContactAipScenarioTriple() {
  const [open, setOpen]           = useState(false);
  const [contacts, setContacts]   = useState([]);
  const [skills, setSkills]       = useState([]);
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
    window.addEventListener('jarvis:cascntri-toggle', h);
    return () => window.removeEventListener('jarvis:cascntri-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [cR, skR, scR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`,    { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`,        { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`,    { headers: hdr }).then(r => r.json()),
      ]);

      const cts  = normContacts(cR.status === 'fulfilled' ? (cR.value ?? {}) : {});
      const skls = normSkills(skR.status === 'fulfilled' ? (skR.value ?? {}) : {});
      const scs  = normScenarios(scR.status === 'fulfilled' ? (scR.value ?? {}) : {});
      setContacts(cts); setSkills(skls); setScenarios(scs);

      const skillCorpus    = skls.map(skillKw).join(' ');
      const scenarioCorpus = scs.map(scenarioKw).join(' ');

      const built = cts.map(c => {
        const toks = tokens(contactKw(c));
        const matchedSkills = skls
          .map(s => ({ ...s, _sc: scoreOverlap(toks, skillKw(s)) }))
          .filter(s => s._sc > 0.1)
          .sort((a, b) => b._sc - a._sc)
          .slice(0, 5);
        const matchedScenarios = scs
          .map(sc => ({ ...sc, _sc: scoreOverlap(toks, scenarioKw(sc)) }))
          .filter(sc => sc._sc > 0.1)
          .sort((a, b) => b._sc - a._sc)
          .slice(0, 5);
        const hasSk = hasOverlap(toks, skillCorpus);
        const hasSc = hasOverlap(toks, scenarioCorpus);
        const state = hasSk && hasSc ? 'FULLY EQUIPPED'
          : hasSk ? 'SKILLED'
          : hasSc ? 'SCENARIO-LINKED'
          : 'UNEQUIPPED';
        return { ...c, matchedSkills, matchedScenarios, state };
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
    if (search) { const s = search.toLowerCase(); return contactKw(r).includes(s); }
    return true;
  });

  const fullyEquipped  = rows.filter(r => r.state === 'FULLY EQUIPPED').length;
  const skilled        = rows.filter(r => r.state === 'SKILLED').length;
  const scenarioLinked = rows.filter(r => r.state === 'SCENARIO-LINKED').length;
  const unequipped     = rows.filter(r => r.state === 'UNEQUIPPED').length;
  const total          = rows.length || 1;

  const assess = async () => {
    setAssessing(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Summarise contact AIP skill and scenario coverage in 2 sentences: ` +
            `${fullyEquipped} fully equipped (AIP skill + scenario), ${skilled} skilled (no scenario), ` +
            `${scenarioLinked} scenario-linked (no skill), ${unequipped} unequipped out of ${rows.length} contacts.`,
        }),
      });
      const d = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', left: 797760, bottom: 8, zIndex: 453, width: 560,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: '0 0 32px rgba(0,212,255,0.12)', display: 'flex', flexDirection: 'column', maxHeight: 540,
    }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CYB, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ CASCNTRI</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>CONTACT × AIP-SKILL × SCENARIO</span>
        {unequipped > 0 && (
          <span style={{ marginLeft: 'auto', background: GY, color: '#000', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{unequipped} UNEQUIPPED</span>
        )}
        <button onClick={() => setOpen(false)} style={{
          marginLeft: unequipped > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[
          ['CONTACTS',   contacts.length,  CYB],
          ['AIP SKILLS', skills.length,    '#6E8AA0'],
          ['SCENARIOS',  scenarios.length, '#6E8AA0'],
          ['EQUIPPED',   fullyEquipped,    GR],
          ['SKILLED',    skilled,          VI],
          ['SCEN-LINK',  scenarioLinked,   CY],
          ['UNEQUIPPED', unequipped,       GY],
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
        <div style={{ width: `${(fullyEquipped  / total) * 100}%`, background: GR }} />
        <div style={{ width: `${(skilled        / total) * 100}%`, background: VI }} />
        <div style={{ width: `${(scenarioLinked / total) * 100}%`, background: CY }} />
        <div style={{ width: `${(unequipped     / total) * 100}%`, background: GY }} />
      </div>

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY EQUIPPED', 'SKILLED', 'SCENARIO-LINKED', 'UNEQUIPPED'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9,
              background: filter === f ? CYB : 'rgba(0,212,255,0.08)',
              color: filter === f ? '#000' : '#6E8AA0', fontWeight: filter === f ? 700 : 400 }}>
            {f}
          </button>
        ))}
        <button onClick={assess} disabled={assessing}
          style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, border: `1px solid ${GY}`,
            background: 'transparent', color: GY, cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>
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
          const id = r.id ?? r._id ?? i;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ borderBottom: `1px solid rgba(0,212,255,0.07)` }}>
              <div onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                <span style={{ color: STATE_COLOR[r.state], fontSize: 9, minWidth: 120,
                  fontWeight: 700, letterSpacing: 1 }}>{r.state}</span>
                <span style={{ flex: 1, color: '#DCEBF5', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name || r.full_name || r.email || r.id || '—'}
                </span>
                {r.company && (
                  <span style={{ color: CYB, fontSize: 8, background: 'rgba(0,212,255,0.1)',
                    padding: '0 4px', borderRadius: 3 }}>{r.company}</span>
                )}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ display: 'flex', gap: 8, padding: '4px 0 8px' }}>
                  {/* AIP Skills pane */}
                  <div style={{ flex: 1, background: 'rgba(167,139,250,0.06)', borderRadius: 6, padding: 8 }}>
                    <div style={{ color: VI, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                      AIP SKILLS ({r.matchedSkills.length})
                    </div>
                    {r.matchedSkills.length === 0
                      ? <div style={{ color: '#4A6080', fontSize: 9 }}>none matched</div>
                      : r.matchedSkills.map((s, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 9 }}>{s.name || s.title || '—'}</span>
                            {s.category && (
                              <span style={{ color: VI, fontSize: 8, background: 'rgba(167,139,250,0.1)',
                                padding: '0 4px', borderRadius: 3 }}>{s.category}</span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(167,139,250,0.15)' }}>
                            <div style={{ height: '100%', width: `${Math.round(s._sc * 100)}%`,
                              background: VI, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>

                  {/* Scenarios pane */}
                  <div style={{ flex: 1, background: 'rgba(103,232,249,0.06)', borderRadius: 6, padding: 8 }}>
                    <div style={{ color: CY, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                      SCENARIOS ({r.matchedScenarios.length})
                    </div>
                    {r.matchedScenarios.length === 0
                      ? <div style={{ color: '#4A6080', fontSize: 9 }}>none matched</div>
                      : r.matchedScenarios.map((sc, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 9 }}>{sc.name || sc.title || '—'}</span>
                            {sc.category && (
                              <span style={{ color: CY, fontSize: 8, background: 'rgba(103,232,249,0.1)',
                                padding: '0 4px', borderRadius: 3 }}>{sc.category}</span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(103,232,249,0.15)' }}>
                            <div style={{ height: '100%', width: `${Math.round(sc._sc * 100)}%`,
                              background: CY, borderRadius: 2 }} />
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
