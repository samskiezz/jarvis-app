import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GNASC_RE = /\b(gnasc|graph\s+annotation\s+skill|annotation\s+skill\s+scenario|dark\s+annotation|graph\s+note\s+skill|annotation\s+scenario\s+skill|graph\s+annotation\s+triple|annotation\s+coverage\s+triple|annotation\s+skill\s+coverage|graph\s+annot\s+skill)\b/i;

export function isGnascQuery(t) { return GNASC_RE.test(t || ''); }

function kw(obj) {
  return [obj?.text, obj?.target_type, obj?.actor, obj?.name, obj?.title,
          obj?.description, obj?.category, obj?.tags, obj?.kind]
    .filter(Boolean).join(' ').toLowerCase();
}

function score(haystack, needles) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildGnascScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [annR, sklR, scnR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`,         { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`,     { headers: hdr }).then(r => r.json()),
  ]);

  const annotations = (annR.status === 'fulfilled'
    ? (annR.value?.annotations ?? annR.value?.data ?? annR.value ?? []) : []).slice(0, 80);
  const skills    = (sklR.status === 'fulfilled' ? (sklR.value?.data ?? sklR.value ?? []) : []).slice(0, 80);
  const scenarios = (scnR.status === 'fulfilled' ? (scnR.value?.data ?? scnR.value ?? []) : []).slice(0, 80);

  let fullyCovered = 0, skillBacked = 0, scenBacked = 0, dark = 0;
  for (const ann of annotations) {
    const words = kw(ann).split(/\s+/).filter(w => w.length > 3);
    const hasSkill = skills.some(s   => score(kw(s), words) > 0.15);
    const hasScen  = scenarios.some(sc => score(kw(sc), words) > 0.15);
    if (hasSkill && hasScen) fullyCovered++;
    else if (hasSkill) skillBacked++;
    else if (hasScen) scenBacked++;
    else dark++;
  }

  return `GNASC: ${annotations.length} graph annotations × ${skills.length} AIP skills × ${scenarios.length} scenarios. ` +
    `${fullyCovered} FULLY COVERED, ${skillBacked} SKILL-BACKED, ${scenBacked} SCENARIO-BACKED, ${dark} DARK. ` +
    (dark > 0
      ? `${dark} annotations have no AIP skill or scenario coverage — operational blind spots.`
      : 'All graph annotations have AIP skill or scenario coverage.');
}

const GR = '#00FF88'; const VL = '#A855F7'; const CY2 = '#22D3EE'; const AM = '#F59E0B';
const BG = 'rgba(6,16,28,0.97)'; const BD = 'rgba(0,212,255,0.18)'; const CY = '#00D4FF';

export default function GraphAnnotationSkillScenarioTriple() {
  const [open, setOpen]             = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [skills, setSkills]         = useState([]);
  const [scenarios, setScenarios]   = useState([]);
  const [rows, setRows]             = useState([]);
  const [filter, setFilter]         = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [assessing, setAssessing]   = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:gnasc-toggle', h);
    return () => window.removeEventListener('jarvis:gnasc-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [aR, sR, scR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`,         { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`,     { headers: hdr }).then(r => r.json()),
      ]);
      const anns  = (aR.status  === 'fulfilled' ? (aR.value?.annotations  ?? aR.value?.data  ?? aR.value  ?? []) : []).slice(0, 80);
      const skls  = (sR.status  === 'fulfilled' ? (sR.value?.data  ?? sR.value  ?? []) : []).slice(0, 80);
      const scens = (scR.status === 'fulfilled' ? (scR.value?.data ?? scR.value ?? []) : []).slice(0, 80);
      setAnnotations(anns); setSkills(skls); setScenarios(scens);

      const built = anns.map(ann => {
        const words = kw(ann).split(/\s+/).filter(w => w.length > 3);
        const matchedSkills = skls
          .map(s => ({ ...s, _ss: score(kw(s), words) }))
          .filter(s => s._ss > 0.15)
          .sort((a, b) => b._ss - a._ss)
          .slice(0, 5);
        const matchedScenarios = scens
          .map(sc => ({ ...sc, _sc: score(kw(sc), words) }))
          .filter(sc => sc._sc > 0.15)
          .sort((a, b) => b._sc - a._sc)
          .slice(0, 5);
        const hasSkill = matchedSkills.length > 0;
        const hasScen  = matchedScenarios.length > 0;
        const state = hasSkill && hasScen ? 'FULLY COVERED'
          : hasSkill ? 'SKILL-BACKED'
          : hasScen  ? 'SCENARIO-BACKED'
          : 'DARK';
        return { ...ann, matchedSkills, matchedScenarios, state };
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

  const fullyCovered = rows.filter(r => r.state === 'FULLY COVERED').length;
  const skillBacked  = rows.filter(r => r.state === 'SKILL-BACKED').length;
  const scenBacked   = rows.filter(r => r.state === 'SCENARIO-BACKED').length;
  const dark         = rows.filter(r => r.state === 'DARK').length;
  const total        = rows.length || 1;

  const assess = async () => {
    setAssessing(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Summarise graph annotation AIP skill and scenario coverage in 2 sentences: ${fullyCovered} fully covered (skill+scenario), ${skillBacked} skill-only, ${scenBacked} scenario-only, ${dark} dark (no coverage) out of ${rows.length} graph annotations.` }),
      });
      const d = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  const stateColor = s =>
    s === 'FULLY COVERED'    ? GR :
    s === 'SKILL-BACKED'     ? VL :
    s === 'SCENARIO-BACKED'  ? CY2 : AM;

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 801120, bottom: 8, zIndex: 459, width: 560,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: `0 0 32px rgba(0,212,255,0.12)`, display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ GNASC</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>GRAPH-ANNOTATION × AIP-SKILL × SCENARIO</span>
        {dark > 0 && (
          <span style={{ marginLeft: 'auto', background: AM, color: '#000', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{dark} DARK</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: dark > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[['ANNOTATIONS', annotations.length, CY], ['AIP SKILLS', skills.length, '#6E8AA0'],
          ['SCENARIOS', scenarios.length, '#6E8AA0'], ['COVERED', fullyCovered, GR],
          ['SKILL-BKD', skillBacked, VL], ['SCEN-BKD', scenBacked, CY2], ['DARK', dark, AM]
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
        <div style={{ width: `${(fullyCovered / total) * 100}%`, background: GR }} />
        <div style={{ width: `${(skillBacked  / total) * 100}%`, background: VL }} />
        <div style={{ width: `${(scenBacked   / total) * 100}%`, background: CY2 }} />
        <div style={{ width: `${(dark         / total) * 100}%`, background: AM }} />
      </div>

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY COVERED', 'SKILL-BACKED', 'SCENARIO-BACKED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9,
              background: filter === f ? CY : 'rgba(0,212,255,0.08)',
              color: filter === f ? '#000' : '#6E8AA0', fontWeight: filter === f ? 700 : 400 }}>
            {f}
          </button>
        ))}
        <button onClick={assess} disabled={assessing}
          style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, border: `1px solid ${VL}`,
            background: 'transparent', color: VL, cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>
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
          const id = r.id ?? r._id ?? i;
          const isExp = expanded === id;
          const label = r.text
            ? (r.text.length > 60 ? r.text.slice(0, 60) + '…' : r.text)
            : (r.target_id || r.actor || '—');
          return (
            <div key={id} style={{ borderBottom: `1px solid rgba(0,212,255,0.07)` }}>
              <div onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                <span style={{ color: stateColor(r.state), fontSize: 9, minWidth: 112,
                  fontWeight: 700, letterSpacing: 1 }}>{r.state}</span>
                <span style={{ flex: 1, color: '#DCEBF5', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {r.target_type && <span style={{ color: '#4A6080', fontSize: 9 }}>{r.target_type}</span>}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ display: 'flex', gap: 8, padding: '4px 0 8px' }}>
                  {/* AIP skills pane */}
                  <div style={{ flex: 1, background: 'rgba(168,85,247,0.06)', borderRadius: 6, padding: 8 }}>
                    <div style={{ color: VL, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                      AIP SKILLS ({r.matchedSkills.length})
                    </div>
                    {r.matchedSkills.length === 0
                      ? <div style={{ color: '#4A6080', fontSize: 9 }}>none matched</div>
                      : r.matchedSkills.map((s, j) => (
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

                  {/* scenarios pane */}
                  <div style={{ flex: 1, background: 'rgba(34,211,238,0.06)', borderRadius: 6, padding: 8 }}>
                    <div style={{ color: CY2, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                      SCENARIOS ({r.matchedScenarios.length})
                    </div>
                    {r.matchedScenarios.length === 0
                      ? <div style={{ color: '#4A6080', fontSize: 9 }}>none matched</div>
                      : r.matchedScenarios.map((sc, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 9 }}>{sc.name || sc.title || '—'}</span>
                            {sc.category && <span style={{ color: CY2, fontSize: 8, background: 'rgba(34,211,238,0.1)',
                              padding: '0 4px', borderRadius: 3 }}>{sc.category}</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(34,211,238,0.15)' }}>
                            <div style={{ height: '100%', width: `${Math.round(sc._sc * 100)}%`,
                              background: CY2, borderRadius: 2 }} />
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
