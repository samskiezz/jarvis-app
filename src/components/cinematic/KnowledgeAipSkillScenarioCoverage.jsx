/**
 * F449 — Knowledge × AIP Skill × Scenario Grand Coverage (KASGO)
 *
 * Answers: "For each KB article, is there an AIP skill that can execute it
 * AND a scenario that plans for it — or is it purely theoretical?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /knowledge/         → knowledge base articles
 *   GET /v1/aip/skill       → AIP skill catalogue
 *   GET /v1/scenario/list   → scenario plans
 *
 * Classification per article:
 *   FULLY_ACTIONABLE — ≥1 skill match AND ≥1 scenario match
 *   SKILLED_ONLY     — skill match but no scenario
 *   PLANNED_ONLY     — scenario match but no skill
 *   THEORETICAL      — no skill, no scenario — knowledge without execution path
 *
 * Stat tiles:  articles / skills / scenarios / theoretical
 * Amber badge: THEORETICAL count on button
 * Expand row:  matched skills (max 5) + matched scenarios (max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat +
 *             jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ KASGO  at left:7980, bottom:18, zIndex:68
 * Event:   jarvis:kasgo-toggle
 * Voice:   "knowledge skill scenario / kasgo / actionable knowledge /
 *           theoretical knowledge / kb without skill / kb without plan /
 *           grounded knowledge / actionable kb / knowledge gap /
 *           which knowledge has skills / which kb has scenarios"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const RD   = '#EF4444';
const CY   = '#06B6D4';
const GR   = '#10B981';
const AM   = '#F59E0B';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS = ['ALL', 'FULLY_ACTIONABLE', 'SKILLED_ONLY', 'PLANNED_ONLY', 'THEORETICAL'];
const CLASS_COLOR = {
  FULLY_ACTIONABLE: GR,
  SKILLED_ONLY:     CY,
  PLANNED_ONLY:     AM,
  THEORETICAL:      MU,
};
const CLASS_LABEL = {
  FULLY_ACTIONABLE: 'FULL',
  SKILLED_ONLY:     'SKILL',
  PLANNED_ONLY:     'PLAN',
  THEORETICAL:      'NONE',
};

function tokens(str) {
  if (!str) return [];
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(s => s.length > 2);
}

function score(srcTokens, target) {
  const tgt = tokens(
    [target.name, target.title, target.description, target.subject,
     target.content, ...(target.tags || [])].join(' ')
  );
  if (!tgt.length) return 0;
  return srcTokens.filter(t => tgt.includes(t)).length / Math.max(srcTokens.length, 1);
}

function classify(artToks, skills, scenarios) {
  const matchedSkills = skills
    .map(s => ({ ...s, _rel: score(artToks, s) }))
    .filter(s => s._rel > 0)
    .sort((a, b) => b._rel - a._rel)
    .slice(0, 5);
  const matchedScenarios = scenarios
    .map(s => ({ ...s, _rel: score(artToks, s) }))
    .filter(s => s._rel > 0)
    .sort((a, b) => b._rel - a._rel)
    .slice(0, 5);
  const hasSkill = matchedSkills.length > 0;
  const hasPlan  = matchedScenarios.length > 0;
  let cls;
  if (hasSkill && hasPlan)      cls = 'FULLY_ACTIONABLE';
  else if (hasSkill && !hasPlan) cls = 'SKILLED_ONLY';
  else if (!hasSkill && hasPlan) cls = 'PLANNED_ONLY';
  else                           cls = 'THEORETICAL';
  return { cls, matchedSkills, matchedScenarios };
}

export default function KnowledgeAipSkillScenarioCoverage() {
  const [visible, setVisible]     = useState(false);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [assessText, setAssessText] = useState({});
  const [stats, setStats]         = useState({ articles: 0, skills: 0, scenarios: 0, theoretical: 0 });
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const itvRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [kbRaw, skillsRaw, scenRaw] = await Promise.all([
        fetch(`${API}/knowledge/`,      { headers: h }).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`,    { headers: h }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`,{ headers: h }).then(r => r.json()),
      ]);
      const articles  = Array.isArray(kbRaw)        ? kbRaw
                      : Array.isArray(kbRaw?.items)  ? kbRaw.items
                      : Array.isArray(kbRaw?.results)? kbRaw.results
                      : [];
      const skills    = Array.isArray(skillsRaw)         ? skillsRaw
                      : Array.isArray(skillsRaw?.skills)  ? skillsRaw.skills
                      : Array.isArray(skillsRaw?.items)   ? skillsRaw.items
                      : [];
      const scenarios = Array.isArray(scenRaw)            ? scenRaw
                      : Array.isArray(scenRaw?.scenarios) ? scenRaw.scenarios
                      : Array.isArray(scenRaw?.items)     ? scenRaw.items
                      : [];

      const enriched = articles.map(a => {
        const artToks = tokens(
          [a.title, a.name, a.content, a.summary, a.description,
           ...(a.tags || [])].join(' ')
        );
        const { cls, matchedSkills, matchedScenarios } = classify(artToks, skills, scenarios);
        return { ...a, _cls: cls, _skills: matchedSkills, _scenarios: matchedScenarios };
      });

      setRows(enriched);
      setStats({
        articles:    enriched.length,
        skills:      skills.length,
        scenarios:   scenarios.length,
        theoretical: enriched.filter(r => r._cls === 'THEORETICAL').length,
      });
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => { setVisible(v => { if (!v) load(); return !v; }); };
    window.addEventListener('jarvis:kasgo-toggle', onToggle);
    return () => window.removeEventListener('jarvis:kasgo-toggle', onToggle);
  }, [load]);

  useEffect(() => {
    if (!visible) return;
    itvRef.current = setInterval(load, 90000);
    return () => clearInterval(itvRef.current);
  }, [visible, load]);

  const assess = useCallback(async (art) => {
    const key = art.id || art.title || art.name;
    setAssessing(key);
    try {
      const h = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const msg = `Knowledge article "${art.title || art.name}" is classified ${art._cls}. ` +
        `Matched skills: ${art._skills.map(s => s.name || s.title).join(', ') || 'none'}. ` +
        `Matched scenarios: ${art._scenarios.map(s => s.name || s.title).join(', ') || 'none'}. ` +
        `Give a 2-sentence operational brief on this knowledge coverage gap or strength.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: h, body: JSON.stringify({ message: msg }),
      }).then(r => r.json());
      const txt = res.response || res.message || res.text || 'No assessment.';
      setAssessText(prev => ({ ...prev, [key]: txt }));
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessText(prev => ({ ...prev, [key]: 'Assessment unavailable.' }));
    }
    setAssessing(null);
  }, []);

  const displayed = rows.filter(r => {
    if (filter !== 'ALL' && r._cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.title || r.name || '').toLowerCase().includes(q) ||
             (r.description || r.summary || '').toLowerCase().includes(q);
    }
    return true;
  });

  if (!visible) {
    const theoretical = stats.theoretical;
    return (
      <button
        onClick={() => { setVisible(true); load(); }}
        title="Knowledge × AIP Skill × Scenario Grand Coverage"
        style={{
          position: 'fixed', left: 7980, bottom: 18, zIndex: 68,
          background: BG, border: `1px solid ${theoretical > 0 ? AM : BD}`,
          color: theoretical > 0 ? AM : MU, fontFamily: MONO,
          fontSize: 10, padding: '4px 8px', cursor: 'pointer', borderRadius: 4,
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        ◈ KASGO
        {theoretical > 0 && (
          <span style={{
            background: AM, color: '#000', borderRadius: '50%',
            width: 16, height: 16, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 9, fontWeight: 700,
          }}>{theoretical > 99 ? '99+' : theoretical}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', left: 7980, bottom: 50, zIndex: 68,
      width: 680, maxHeight: '80vh', background: BG,
      border: `1px solid ${BD}`, borderRadius: 8, display: 'flex',
      flexDirection: 'column', fontFamily: MONO, fontSize: 11, overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: AM, fontWeight: 700, fontSize: 12 }}>◈ KASGO — Knowledge × Skill × Scenario Coverage</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: MU, fontSize: 10 }}>loading…</span>}
          <button onClick={load} style={{ background: 'none', border: `1px solid ${BD}`, color: CY, fontFamily: MONO, fontSize: 10, padding: '2px 6px', cursor: 'pointer', borderRadius: 3 }}>↻</button>
          <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${BD}` }}>
        {[
          { label: 'ARTICLES',    val: stats.articles,    col: CY },
          { label: 'SKILLS',      val: stats.skills,      col: GR },
          { label: 'SCENARIOS',   val: stats.scenarios,   col: AM },
          { label: 'THEORETICAL', val: stats.theoretical, col: MU },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MU, fontSize: 9, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: `1px solid ${BD}`, overflowX: 'auto' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(255,255,255,0.1)' : 'none',
            border: `1px solid ${filter === f ? BD : 'transparent'}`,
            color: filter === f ? '#fff' : MU, fontFamily: MONO, fontSize: 9,
            padding: '2px 7px', cursor: 'pointer', borderRadius: 3, whiteSpace: 'nowrap',
          }}>{f}</button>
        ))}
      </div>

      {/* search */}
      <div style={{ padding: '6px 14px', borderBottom: `1px solid ${BD}` }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search articles…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, color: '#fff', fontFamily: MONO, fontSize: 10, padding: '4px 8px', borderRadius: 3, boxSizing: 'border-box', outline: 'none' }}
        />
      </div>

      {/* error */}
      {error && <div style={{ color: RD, padding: '6px 14px', fontSize: 10 }}>Error: {error}</div>}

      {/* rows */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: MU, padding: '20px 14px', textAlign: 'center' }}>No articles match.</div>
        )}
        {displayed.map((art, i) => {
          const key  = art.id || art.title || art.name || i;
          const isEx = expanded === key;
          const aKey = art.id || art.title || art.name;
          return (
            <div key={key} style={{ borderBottom: `1px solid ${BD}` }}>
              <div
                onClick={() => setExpanded(isEx ? null : key)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', background: isEx ? 'rgba(255,255,255,0.04)' : 'none' }}
              >
                <span style={{ color: CLASS_COLOR[art._cls], fontWeight: 700, fontSize: 9, minWidth: 38 }}>{CLASS_LABEL[art._cls]}</span>
                <span style={{ color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art.title || art.name || '(untitled)'}</span>
                <span style={{ color: MU, fontSize: 9 }}>skills:{art._skills.length} plans:{art._scenarios.length}</span>
                <span style={{ color: MU }}>{isEx ? '▲' : '▼'}</span>
              </div>
              {isEx && (
                <div style={{ padding: '8px 20px 12px', background: 'rgba(255,255,255,0.02)' }}>
                  {/* description */}
                  {(art.description || art.summary) && (
                    <div style={{ color: MU, marginBottom: 8, fontSize: 10 }}>{(art.description || art.summary).slice(0, 200)}</div>
                  )}
                  {/* matched skills */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: GR, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>MATCHED SKILLS ({art._skills.length})</div>
                    {art._skills.length === 0
                      ? <div style={{ color: MU, fontSize: 9 }}>none</div>
                      : art._skills.map((s, si) => (
                          <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ color: GR, fontSize: 10, flex: 1 }}>{s.name || s.title}</span>
                            <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                              <div style={{ width: `${Math.round(s._rel * 100)}%`, height: '100%', background: GR, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: MU, fontSize: 9, minWidth: 28, textAlign: 'right' }}>{Math.round(s._rel * 100)}%</span>
                          </div>
                        ))
                    }
                  </div>
                  {/* matched scenarios */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: AM, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>MATCHED SCENARIOS ({art._scenarios.length})</div>
                    {art._scenarios.length === 0
                      ? <div style={{ color: MU, fontSize: 9 }}>none</div>
                      : art._scenarios.map((s, si) => (
                          <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ color: AM, fontSize: 10, flex: 1 }}>{s.name || s.title}</span>
                            <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                              <div style={{ width: `${Math.round(s._rel * 100)}%`, height: '100%', background: AM, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: MU, fontSize: 9, minWidth: 28, textAlign: 'right' }}>{Math.round(s._rel * 100)}%</span>
                          </div>
                        ))
                    }
                  </div>
                  {/* assess */}
                  <button
                    onClick={() => assess(art)}
                    disabled={assessing === aKey}
                    style={{ background: 'none', border: `1px solid ${CY}`, color: CY, fontFamily: MONO, fontSize: 9, padding: '3px 8px', cursor: assessing === aKey ? 'wait' : 'pointer', borderRadius: 3 }}
                  >
                    {assessing === aKey ? '…assessing' : '▶ ASSESS'}
                  </button>
                  {assessText[aKey] && (
                    <div style={{ color: '#c0d4e0', marginTop: 8, fontSize: 10, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{assessText[aKey]}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ padding: '5px 14px', borderTop: `1px solid ${BD}`, display: 'flex', justifyContent: 'space-between', color: MU, fontSize: 9 }}>
        <span>showing {displayed.length} / {rows.length}</span>
        <span>90 s auto-refresh</span>
      </div>
    </div>
  );
}

// ── JarvisBrain integration ──────────────────────────────────────────────────

const KASGO_TRIGGERS = [
  'knowledge skill scenario', 'kasgo', 'actionable knowledge',
  'theoretical knowledge', 'kb without skill', 'kb without plan',
  'grounded knowledge', 'actionable kb', 'knowledge gap',
  'which knowledge has skills', 'which kb has scenarios',
];

export function isKasgoQuery(q) {
  const lq = (q || '').toLowerCase();
  return KASGO_TRIGGERS.some(t => lq.includes(t));
}

export async function buildKasgoScript() {
  try {
    const h = { Authorization: `Bearer ${API_KEY}` };
    const [kbRaw, skillsRaw, scenRaw] = await Promise.all([
      fetch(`${API}/knowledge/`,       { headers: h }).then(r => r.json()),
      fetch(`${API}/v1/aip/skill`,     { headers: h }).then(r => r.json()),
      fetch(`${API}/v1/scenario/list`, { headers: h }).then(r => r.json()),
    ]);
    const articles  = Array.isArray(kbRaw)              ? kbRaw
                    : Array.isArray(kbRaw?.items)        ? kbRaw.items
                    : Array.isArray(kbRaw?.results)      ? kbRaw.results : [];
    const skills    = Array.isArray(skillsRaw)           ? skillsRaw
                    : Array.isArray(skillsRaw?.skills)   ? skillsRaw.skills
                    : Array.isArray(skillsRaw?.items)    ? skillsRaw.items : [];
    const scenarios = Array.isArray(scenRaw)             ? scenRaw
                    : Array.isArray(scenRaw?.scenarios)  ? scenRaw.scenarios
                    : Array.isArray(scenRaw?.items)      ? scenRaw.items : [];

    let fullAct = 0, skillOnly = 0, planOnly = 0, theoretical = 0;
    articles.forEach(a => {
      const toks = tokens([a.title, a.name, a.content, a.summary, a.description, ...(a.tags||[])].join(' '));
      const { cls } = classify(toks, skills, scenarios);
      if (cls === 'FULLY_ACTIONABLE') fullAct++;
      else if (cls === 'SKILLED_ONLY') skillOnly++;
      else if (cls === 'PLANNED_ONLY') planOnly++;
      else theoretical++;
    });
    return `JARVIS: ${articles.length} KB articles — ${fullAct} fully actionable, ${theoretical} theoretical gaps. Opening KASGO…`;
  } catch {
    return 'JARVIS: Opening Knowledge × Skill × Scenario Coverage — KASGO panel loading.';
  }
}
