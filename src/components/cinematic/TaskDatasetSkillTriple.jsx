import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TDASKCO_RE = /\b(tdaskco|task\s+dataset\s+skill|task\s+aip\s+skill|task\s+data\s+skill|unaddressed\s+task\s+skill|task\s+skill\s+dataset|skill\s+task\s+dataset|task\s+skill\s+data|task\s+data\s+aip|task\s+aip\s+dataset|task\s+coverage\s+triple|equipped\s+task)\b/i;

export function isTdaskcoQuery(t) { return TDASKCO_RE.test(t || ''); }

function kw(obj) {
  return [obj?.name, obj?.title, obj?.description, obj?.mission, obj?.type,
          obj?.priority, obj?.status, obj?.tags, obj?.category, obj?.kind, obj?.sector]
    .filter(Boolean).join(' ').toLowerCase();
}

function score(haystack, needles) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildTdaskcoScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [taskR, dataR, skillR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`,   { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/datasets`,     { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`,    { headers: hdr }).then(r => r.json()),
  ]);

  const tasks  = (taskR.status  === 'fulfilled' ? (taskR.value?.data  ?? taskR.value  ?? []) : []).slice(0, 80);
  const data   = (dataR.status  === 'fulfilled' ? (dataR.value?.data  ?? dataR.value  ?? []) : []).slice(0, 80);
  const skills = (skillR.status === 'fulfilled' ? (skillR.value?.data ?? skillR.value ?? []) : []).slice(0, 80);

  let fullyEquipped = 0, dataBacked = 0, skillCovered = 0, unaddressed = 0;
  for (const t of tasks) {
    const words = kw(t).split(/\s+/).filter(w => w.length > 3);
    const hasData  = data.some(d   => score(kw(d),   words) > 0.15);
    const hasSkill = skills.some(s => score(kw(s), words) > 0.15);
    if (hasData && hasSkill) fullyEquipped++;
    else if (hasData) dataBacked++;
    else if (hasSkill) skillCovered++;
    else unaddressed++;
  }

  return `TDASKCO: ${tasks.length} tasks × ${data.length} datasets × ${skills.length} AIP skills. ` +
    `${fullyEquipped} FULLY EQUIPPED, ${dataBacked} DATA-BACKED, ${skillCovered} SKILL-COVERED, ${unaddressed} UNADDRESSED. ` +
    (unaddressed > 0
      ? `${unaddressed} tasks lack both dataset coverage and AIP skill linkage — operational gap.`
      : 'All tasks have dataset or AIP skill coverage.');
}

const GR = '#00FF88'; const EM = '#10B981'; const VL = '#A855F7'; const RD = '#EF4444';
const BG = 'rgba(6,16,28,0.97)'; const BD = 'rgba(0,212,255,0.18)'; const CY = '#00D4FF';

export default function TaskDatasetSkillTriple() {
  const [open, setOpen]         = useState(false);
  const [tasks, setTasks]       = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [skills, setSkills]     = useState([]);
  const [rows, setRows]         = useState([]);
  const [filter, setFilter]     = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:tdaskco-toggle', h);
    return () => window.removeEventListener('jarvis:tdaskco-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [tR, dR, sR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`,  { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/datasets`,    { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`,   { headers: hdr }).then(r => r.json()),
      ]);
      const tsks = (tR.status === 'fulfilled' ? (tR.value?.data ?? tR.value ?? []) : []).slice(0, 80);
      const dats = (dR.status === 'fulfilled' ? (dR.value?.data ?? dR.value ?? []) : []).slice(0, 80);
      const skls = (sR.status === 'fulfilled' ? (sR.value?.data ?? sR.value ?? []) : []).slice(0, 80);
      setTasks(tsks); setDatasets(dats); setSkills(skls);

      const built = tsks.map(t => {
        const words = kw(t).split(/\s+/).filter(w => w.length > 3);
        const matchedDatasets = dats
          .map(d => ({ ...d, _sd: score(kw(d), words) }))
          .filter(d => d._sd > 0.15)
          .sort((a, b) => b._sd - a._sd)
          .slice(0, 5);
        const matchedSkills = skls
          .map(s => ({ ...s, _ss: score(kw(s), words) }))
          .filter(s => s._ss > 0.15)
          .sort((a, b) => b._ss - a._ss)
          .slice(0, 5);
        const hasD = matchedDatasets.length > 0;
        const hasS = matchedSkills.length > 0;
        const state = hasD && hasS ? 'FULLY EQUIPPED'
          : hasD ? 'DATA-BACKED'
          : hasS ? 'SKILL-COVERED'
          : 'UNADDRESSED';
        return { ...t, matchedDatasets, matchedSkills, state };
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
  const dataBacked    = rows.filter(r => r.state === 'DATA-BACKED').length;
  const skillCovered  = rows.filter(r => r.state === 'SKILL-COVERED').length;
  const unaddressed   = rows.filter(r => r.state === 'UNADDRESSED').length;
  const total         = rows.length || 1;

  const assess = async () => {
    setAssessing(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Summarise task dataset and AIP skill coverage in 2 sentences: ${fullyEquipped} fully equipped (dataset+skill), ${dataBacked} data-only, ${skillCovered} skill-only, ${unaddressed} unaddressed out of ${rows.length} tasks.` }),
      });
      const d = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  const stateColor = s =>
    s === 'FULLY EQUIPPED' ? GR :
    s === 'DATA-BACKED'    ? EM :
    s === 'SKILL-COVERED'  ? VL : RD;

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 800000, bottom: 8, zIndex: 457, width: 560,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: `0 0 32px rgba(0,212,255,0.12)`, display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ TDASKCO</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>TASK × DATASET × AIP-SKILL</span>
        {unaddressed > 0 && (
          <span style={{ marginLeft: 'auto', background: RD, color: '#fff', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{unaddressed} UNADDRESSED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: unaddressed > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[['TASKS', tasks.length, CY], ['DATASETS', datasets.length, '#6E8AA0'],
          ['AIP SKILLS', skills.length, '#6E8AA0'], ['EQUIPPED', fullyEquipped, GR],
          ['DATA-BKND', dataBacked, EM], ['SKILL-COV', skillCovered, VL], ['UNADDRESSED', unaddressed, RD]
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
        <div style={{ width: `${(dataBacked    / total) * 100}%`, background: EM }} />
        <div style={{ width: `${(skillCovered  / total) * 100}%`, background: VL }} />
        <div style={{ width: `${(unaddressed   / total) * 100}%`, background: RD }} />
      </div>

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY EQUIPPED', 'DATA-BACKED', 'SKILL-COVERED', 'UNADDRESSED'].map(f => (
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
          placeholder="search tasks…"
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
                  {r.name || r.title || r.mission || r.id || '—'}
                </span>
                {r.priority && <span style={{ color: '#4A6080', fontSize: 9 }}>{r.priority}</span>}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ display: 'flex', gap: 8, padding: '4px 0 8px' }}>
                  {/* datasets pane */}
                  <div style={{ flex: 1, background: 'rgba(16,185,129,0.06)', borderRadius: 6, padding: 8 }}>
                    <div style={{ color: EM, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                      DATASETS ({r.matchedDatasets.length})
                    </div>
                    {r.matchedDatasets.length === 0
                      ? <div style={{ color: '#4A6080', fontSize: 9 }}>none matched</div>
                      : r.matchedDatasets.map((d, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 9 }}>{d.name || d.title || '—'}</span>
                            {d.kind && <span style={{ color: EM, fontSize: 8, background: 'rgba(16,185,129,0.1)',
                              padding: '0 4px', borderRadius: 3 }}>{d.kind}</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(16,185,129,0.15)' }}>
                            <div style={{ height: '100%', width: `${Math.round(d._sd * 100)}%`,
                              background: EM, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>

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
