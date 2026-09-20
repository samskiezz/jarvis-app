import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const LKSTRI_RE = /\b(lkstri|live\s+intel\s+knowledge\s+skill|live\s+event\s+skill|live\s+event\s+knowledge\s+skill|armed\s+live\s+event|unaddressed\s+live\s+event|live\s+event\s+coverage\s+triple|live\s+intel\s+skill\s+knowledge|live\s+knowledge\s+skill|world\s+event\s+knowledge\s+skill|live\s+intel\s+triple\s+coverage)\b/i;

export function isLkstriQuery(t) { return LKSTRI_RE.test(t || ''); }

function normaliseEvents(raw) {
  if (Array.isArray(raw)) return raw.slice(0, 80);
  const out = [];
  if (Array.isArray(raw.quakes)) out.push(...raw.quakes.map(q => ({ ...q, _src: 'quake', name: q.place ?? q.location ?? q.id })));
  if (Array.isArray(raw.crypto)) out.push(...raw.crypto.map(c => ({ ...c, _src: 'crypto', name: c.symbol ?? c.name ?? c.id })));
  if (Array.isArray(raw.fx))     out.push(...raw.fx.map(f => ({ ...f, _src: 'fx', name: f.pair ?? f.symbol ?? f.id })));
  if (Array.isArray(raw.events)) out.push(...raw.events);
  if (Array.isArray(raw.data))   out.push(...raw.data);
  if (Array.isArray(raw.results))out.push(...raw.results);
  if (Array.isArray(raw.items))  out.push(...raw.items);
  return out.slice(0, 80);
}

function normKb(raw) {
  if (Array.isArray(raw)) return raw.slice(0, 80);
  return (raw.articles ?? raw.items ?? raw.data ?? raw.results ?? []).slice(0, 80);
}

function normSkills(raw) {
  if (Array.isArray(raw)) return raw.slice(0, 80);
  return (raw.skills ?? raw.data ?? raw.results ?? []).slice(0, 80);
}

function eventKw(ev) {
  return [ev.name, ev.title, ev.place, ev.location, ev.symbol, ev.pair, ev.type,
          ev.description, ev._src, ev.sector, ev.category]
    .filter(Boolean).join(' ').toLowerCase();
}

function kbKw(a) {
  return [a.title, a.name, a.summary, a.description, a.category, ...(a.tags ?? [])]
    .filter(Boolean).join(' ').toLowerCase();
}

function skillKw(s) {
  return [s.name, s.title, s.description, s.category, ...(s.tags ?? [])]
    .filter(Boolean).join(' ').toLowerCase();
}

function tokens(str) {
  return str.split(/\W+/).filter(t => t.length > 2);
}

function hasOverlap(evTokens, corpus) {
  return evTokens.some(tok => corpus.includes(tok));
}

function scoreOverlap(evTokens, itemStr) {
  if (!evTokens.length) return 0;
  return evTokens.reduce((n, tok) => n + (itemStr.includes(tok) ? 1 : 0), 0) / evTokens.length;
}

export async function buildLkstriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [evR, kbR, skR] = await Promise.allSettled([
    fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`,             { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`,           { headers: hdr }).then(r => r.json()),
  ]);

  const events   = normaliseEvents(evR.status === 'fulfilled' ? (evR.value ?? {}) : {});
  const articles = normKb(kbR.status === 'fulfilled' ? (kbR.value ?? {}) : {});
  const skills   = normSkills(skR.status === 'fulfilled' ? (skR.value ?? {}) : {});

  const kbCorpus   = articles.map(kbKw).join(' ');
  const skillCorpus = skills.map(skillKw).join(' ');

  let fullyArmed = 0, kbBacked = 0, skillLinked = 0, unaddressed = 0;
  for (const ev of events) {
    const toks = tokens(eventKw(ev));
    const hasKb    = hasOverlap(toks, kbCorpus);
    const hasSkill = hasOverlap(toks, skillCorpus);
    if (hasKb && hasSkill) fullyArmed++;
    else if (hasKb) kbBacked++;
    else if (hasSkill) skillLinked++;
    else unaddressed++;
  }

  return `LKSTRI Live Intel × Knowledge × AIP Skill: ${events.length} live world events assessed against ` +
    `${articles.length} KB articles and ${skills.length} AIP skills. ` +
    `FULLY ARMED: ${fullyArmed} (KB article + skill — event has documented knowledge and response capability). ` +
    `KB-BACKED: ${kbBacked} (KB article found, no skill — documented but no response tool). ` +
    `SKILL-LINKED: ${skillLinked} (skill found, no KB backing — response tool without intelligence context). ` +
    `UNADDRESSED: ${unaddressed} (no KB or skill coverage). ` +
    (unaddressed > 0
      ? `${unaddressed} live world events have no knowledge or skill coverage — operational gap.`
      : 'All live events have knowledge or skill coverage.');
}

const GR = '#4ade80';
const BL = '#60a5fa';
const AM = '#fbbf24';
const RD = '#ef4444';
const CY = '#00D4FF';
const BG = 'rgba(6,16,28,0.97)';
const BD = 'rgba(0,212,255,0.18)';

const STATE_COLOR = {
  'FULLY ARMED': GR,
  'KB-BACKED':   BL,
  'SKILL-LINKED':AM,
  'UNADDRESSED': RD,
};

export default function LiveIntelKnowledgeSkillTriple() {
  const [open, setOpen]           = useState(false);
  const [events, setEvents]       = useState([]);
  const [articles, setArticles]   = useState([]);
  const [skills, setSkills]       = useState([]);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:lkstri-toggle', h);
    return () => window.removeEventListener('jarvis:lkstri-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [evR, kbR, skR] = await Promise.allSettled([
        fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`,             { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`,           { headers: hdr }).then(r => r.json()),
      ]);

      const evts = normaliseEvents(evR.status === 'fulfilled' ? (evR.value ?? {}) : {});
      const arts = normKb(kbR.status === 'fulfilled' ? (kbR.value ?? {}) : {});
      const skls = normSkills(skR.status === 'fulfilled' ? (skR.value ?? {}) : {});
      setEvents(evts); setArticles(arts); setSkills(skls);

      const kbCorpus    = arts.map(kbKw).join(' ');
      const skillCorpus = skls.map(skillKw).join(' ');

      const built = evts.map(ev => {
        const toks = tokens(eventKw(ev));
        const matchedKb = arts
          .map(a => ({ ...a, _sc: scoreOverlap(toks, kbKw(a)) }))
          .filter(a => a._sc > 0.1)
          .sort((a, b) => b._sc - a._sc)
          .slice(0, 5);
        const matchedSkills = skls
          .map(s => ({ ...s, _sc: scoreOverlap(toks, skillKw(s)) }))
          .filter(s => s._sc > 0.1)
          .sort((a, b) => b._sc - a._sc)
          .slice(0, 5);
        const hasKb    = hasOverlap(toks, kbCorpus);
        const hasSkill = hasOverlap(toks, skillCorpus);
        const state = hasKb && hasSkill ? 'FULLY ARMED'
          : hasKb    ? 'KB-BACKED'
          : hasSkill ? 'SKILL-LINKED'
          : 'UNADDRESSED';
        return { ...ev, matchedKb, matchedSkills, state };
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

  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) { const s = search.toLowerCase(); return eventKw(r).includes(s); }
    return true;
  });

  const fullyArmed  = rows.filter(r => r.state === 'FULLY ARMED').length;
  const kbBacked    = rows.filter(r => r.state === 'KB-BACKED').length;
  const skillLinked = rows.filter(r => r.state === 'SKILL-LINKED').length;
  const unaddressed = rows.filter(r => r.state === 'UNADDRESSED').length;
  const total       = rows.length || 1;

  const assess = async () => {
    setAssessing(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Summarise live world event knowledge and skill coverage in 2 sentences: ` +
            `${fullyArmed} fully armed (KB article + AIP skill), ${kbBacked} KB-backed, ` +
            `${skillLinked} skill-linked, ${unaddressed} unaddressed out of ${rows.length} live events.`,
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
      position: 'fixed', left: 797200, bottom: 8, zIndex: 452, width: 560,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: '0 0 32px rgba(0,212,255,0.12)', display: 'flex', flexDirection: 'column', maxHeight: 540,
    }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ LKSTRI</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>LIVE-INTEL × KNOWLEDGE × AIP-SKILL</span>
        {unaddressed > 0 && (
          <span style={{ marginLeft: 'auto', background: RD, color: '#fff', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{unaddressed} UNADDRESSED</span>
        )}
        <button onClick={() => setOpen(false)} style={{
          marginLeft: unaddressed > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[
          ['LIVE EVENTS', events.length, CY],
          ['KB ARTICLES', articles.length, '#6E8AA0'],
          ['AIP SKILLS', skills.length, '#6E8AA0'],
          ['FULLY ARMED', fullyArmed, GR],
          ['KB-BACKED', kbBacked, BL],
          ['SKILL-LINKED', skillLinked, AM],
          ['UNADDRESSED', unaddressed, RD],
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
        <div style={{ width: `${(fullyArmed  / total) * 100}%`, background: GR }} />
        <div style={{ width: `${(kbBacked    / total) * 100}%`, background: BL }} />
        <div style={{ width: `${(skillLinked / total) * 100}%`, background: AM }} />
        <div style={{ width: `${(unaddressed / total) * 100}%`, background: RD }} />
      </div>

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY ARMED', 'KB-BACKED', 'SKILL-LINKED', 'UNADDRESSED'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9,
              background: filter === f ? CY : 'rgba(0,212,255,0.08)',
              color: filter === f ? '#000' : '#6E8AA0', fontWeight: filter === f ? 700 : 400 }}>
            {f}
          </button>
        ))}
        <button onClick={assess} disabled={assessing}
          style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, border: `1px solid ${RD}`,
            background: 'transparent', color: RD, cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
      </div>

      {/* search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search live events…"
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
                <span style={{ color: STATE_COLOR[r.state], fontSize: 9, minWidth: 108,
                  fontWeight: 700, letterSpacing: 1 }}>{r.state}</span>
                <span style={{ flex: 1, color: '#DCEBF5', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name || r.title || r.place || r.symbol || r.id || '—'}
                </span>
                {r._src && (
                  <span style={{ color: CY, fontSize: 8, background: 'rgba(0,212,255,0.1)',
                    padding: '0 4px', borderRadius: 3 }}>{r._src.toUpperCase()}</span>
                )}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ display: 'flex', gap: 8, padding: '4px 0 8px' }}>
                  {/* KB pane */}
                  <div style={{ flex: 1, background: 'rgba(96,165,250,0.06)', borderRadius: 6, padding: 8 }}>
                    <div style={{ color: BL, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                      KB ARTICLES ({r.matchedKb.length})
                    </div>
                    {r.matchedKb.length === 0
                      ? <div style={{ color: '#4A6080', fontSize: 9 }}>none matched</div>
                      : r.matchedKb.map((a, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 9 }}>{a.title || a.name || '—'}</span>
                            {a.category && (
                              <span style={{ color: BL, fontSize: 8, background: 'rgba(96,165,250,0.1)',
                                padding: '0 4px', borderRadius: 3 }}>{a.category}</span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(96,165,250,0.15)' }}>
                            <div style={{ height: '100%', width: `${Math.round(a._sc * 100)}%`,
                              background: BL, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>

                  {/* AIP Skills pane */}
                  <div style={{ flex: 1, background: 'rgba(251,191,36,0.06)', borderRadius: 6, padding: 8 }}>
                    <div style={{ color: AM, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                      AIP SKILLS ({r.matchedSkills.length})
                    </div>
                    {r.matchedSkills.length === 0
                      ? <div style={{ color: '#4A6080', fontSize: 9 }}>none matched</div>
                      : r.matchedSkills.map((s, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 9 }}>{s.name || s.title || '—'}</span>
                            {s.category && (
                              <span style={{ color: AM, fontSize: 8, background: 'rgba(251,191,36,0.1)',
                                padding: '0 4px', borderRadius: 3 }}>{s.category}</span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(251,191,36,0.15)' }}>
                            <div style={{ height: '100%', width: `${Math.round(s._sc * 100)}%`,
                              background: AM, borderRadius: 2 }} />
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
