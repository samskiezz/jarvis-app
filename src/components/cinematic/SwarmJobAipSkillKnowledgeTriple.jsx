import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SJASKCO_RE = /\b(sjaskco|swarm\s+job\s+skill\s+knowledge|swarm\s+skill\s+kb|swarm\s+job\s+aip\s+skill|swarm\s+skill\s+knowledge|unequipped\s+swarm\s+job|swarm\s+knowledge\s+skill|swarm\s+job\s+fully\s+equipped|swarm\s+job\s+capability|swarm\s+aip\s+knowledge)\b/i;

export function isSjaskcoQuery(t) { return SJASKCO_RE.test(t || ''); }

function kw(obj) {
  return [obj?.name, obj?.title, obj?.type, obj?.objective, obj?.description,
          obj?.kind, obj?.category, obj?.tags, obj?.sector]
    .filter(Boolean).join(' ').toLowerCase();
}

function score(haystack, needles) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildSjaskcoScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [jobR, skillR, kbR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`,      { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`,         { headers: hdr }).then(r => r.json()),
  ]);

  const jobs   = (jobR.status   === 'fulfilled' ? (jobR.value?.data   ?? jobR.value   ?? []) : []).slice(0, 80);
  const skills = (skillR.status === 'fulfilled' ? (skillR.value?.data ?? skillR.value ?? []) : []).slice(0, 80);
  const kbs    = (kbR.status    === 'fulfilled' ? (kbR.value?.data    ?? kbR.value    ?? []) : []).slice(0, 80);

  let fullyEquipped = 0, skilled = 0, kbBacked = 0, unequipped = 0;
  for (const j of jobs) {
    const words = kw(j).split(/\s+/).filter(w => w.length > 3);
    const hasSkill = skills.some(s => score(kw(s), words) > 0.15);
    const hasKb    = kbs.some(k    => score(kw(k), words) > 0.15);
    if (hasSkill && hasKb) fullyEquipped++;
    else if (hasSkill) skilled++;
    else if (hasKb) kbBacked++;
    else unequipped++;
  }

  return `SJASKCO: ${jobs.length} swarm jobs × ${skills.length} AIP skills × ${kbs.length} KB articles. ` +
    `${fullyEquipped} FULLY EQUIPPED, ${skilled} SKILLED, ${kbBacked} KB-BACKED, ${unequipped} UNEQUIPPED. ` +
    (unequipped > 0
      ? `${unequipped} swarm jobs lack both AIP skill and knowledge coverage — capability gap.`
      : 'All swarm jobs have AIP skill or knowledge coverage.');
}

const GR = '#00FF88'; const VL = '#A855F7'; const IN = '#6366F1'; const GY = '#6E8AA0';
const BG = 'rgba(6,16,28,0.97)'; const BD = 'rgba(0,212,255,0.18)'; const CY = '#00D4FF';

export default function SwarmJobAipSkillKnowledgeTriple() {
  const [open, setOpen]         = useState(false);
  const [jobs, setJobs]         = useState([]);
  const [skills, setSkills]     = useState([]);
  const [kbs, setKbs]           = useState([]);
  const [rows, setRows]         = useState([]);
  const [filter, setFilter]     = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:sjaskco-toggle', h);
    return () => window.removeEventListener('jarvis:sjaskco-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [jR, sR, kR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`,      { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`,         { headers: hdr }).then(r => r.json()),
      ]);
      const jbs  = (jR.status === 'fulfilled' ? (jR.value?.data  ?? jR.value  ?? []) : []).slice(0, 80);
      const skls = (sR.status === 'fulfilled' ? (sR.value?.data  ?? sR.value  ?? []) : []).slice(0, 80);
      const kbas = (kR.status === 'fulfilled' ? (kR.value?.data  ?? kR.value  ?? []) : []).slice(0, 80);
      setJobs(jbs); setSkills(skls); setKbs(kbas);

      const built = jbs.map(j => {
        const words = kw(j).split(/\s+/).filter(w => w.length > 3);
        const matchedSkills = skls
          .map(s => ({ ...s, _ss: score(kw(s), words) }))
          .filter(s => s._ss > 0.15)
          .sort((a, b) => b._ss - a._ss)
          .slice(0, 5);
        const matchedKbs = kbas
          .map(k => ({ ...k, _sk: score(kw(k), words) }))
          .filter(k => k._sk > 0.15)
          .sort((a, b) => b._sk - a._sk)
          .slice(0, 5);
        const hasS = matchedSkills.length > 0;
        const hasK = matchedKbs.length > 0;
        const state = hasS && hasK ? 'FULLY EQUIPPED'
          : hasS ? 'SKILLED'
          : hasK ? 'KB-BACKED'
          : 'UNEQUIPPED';
        return { ...j, matchedSkills, matchedKbs, state };
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

  const fullyEquipped = rows.filter(r => r.state === 'FULLY EQUIPPED').length;
  const skilled       = rows.filter(r => r.state === 'SKILLED').length;
  const kbBacked      = rows.filter(r => r.state === 'KB-BACKED').length;
  const unequipped    = rows.filter(r => r.state === 'UNEQUIPPED').length;
  const total         = rows.length || 1;

  const assess = async () => {
    setAssessing(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Summarise swarm job AIP skill and knowledge coverage in 2 sentences: ${fullyEquipped} fully equipped (skill+KB), ${skilled} skill-only, ${kbBacked} KB-only, ${unequipped} unequipped out of ${rows.length} swarm jobs.` }),
      });
      const d = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  const stateColor = s =>
    s === 'FULLY EQUIPPED' ? GR :
    s === 'SKILLED'        ? VL :
    s === 'KB-BACKED'      ? IN : GY;

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 799440, bottom: 8, zIndex: 456, width: 560,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: `0 0 32px rgba(0,212,255,0.12)`, display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ SJASKCO</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>SWARMJOB × AIP-SKILL × KNOWLEDGE</span>
        {unequipped > 0 && (
          <span style={{ marginLeft: 'auto', background: GY, color: '#fff', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{unequipped} UNEQUIPPED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: unequipped > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[['SWARM JOBS', jobs.length, CY], ['AIP SKILLS', skills.length, '#6E8AA0'],
          ['KB ARTICLES', kbs.length, '#6E8AA0'], ['EQUIPPED', fullyEquipped, GR],
          ['SKILLED', skilled, VL], ['KB-BACKED', kbBacked, IN], ['UNEQUIPPED', unequipped, GY]
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
        <div style={{ width: `${(fullyEquipped / total) * 100}%`, background: GR }} />
        <div style={{ width: `${(skilled       / total) * 100}%`, background: VL }} />
        <div style={{ width: `${(kbBacked      / total) * 100}%`, background: IN }} />
        <div style={{ width: `${(unequipped    / total) * 100}%`, background: GY }} />
      </div>

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY EQUIPPED', 'SKILLED', 'KB-BACKED', 'UNEQUIPPED'].map(f => (
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
                <span style={{ color: stateColor(r.state), fontSize: 9, minWidth: 108,
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

                  {/* KB articles pane */}
                  <div style={{ flex: 1, background: 'rgba(99,102,241,0.06)', borderRadius: 6, padding: 8 }}>
                    <div style={{ color: IN, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                      KB ARTICLES ({r.matchedKbs.length})
                    </div>
                    {r.matchedKbs.length === 0
                      ? <div style={{ color: '#4A6080', fontSize: 9 }}>none matched</div>
                      : r.matchedKbs.map((k, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 9 }}>{k.name || k.title || '—'}</span>
                            {k.category && <span style={{ color: IN, fontSize: 8, background: 'rgba(99,102,241,0.1)',
                              padding: '0 4px', borderRadius: 3 }}>{k.category}</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(99,102,241,0.15)' }}>
                            <div style={{ height: '100%', width: `${Math.round(k._sk * 100)}%`,
                              background: IN, borderRadius: 2 }} />
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
