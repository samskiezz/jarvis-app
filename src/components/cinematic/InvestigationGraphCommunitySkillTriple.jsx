import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY = 'dev-key';

const IGCSKL_RE = /\b(igcskl|invest(?:igation)?[._-]?graph[._-]?skill|graph[._-]?community[._-]?invest(?:igation)?|skill[._-]?invest(?:igation)?[._-]?graph|invest(?:igation)?[._-]?triple[._-]?skill|networked[._-]?invest(?:igation)?s?|isolated[._-]?invest(?:igation)?s?|invest(?:igation)?[._-]?community[._-]?skill|invest(?:igation)?[._-]?graph[._-]?community|case[._-]?graph[._-]?skill|investigation[._-]?support[._-]?matrix)\b/i;

export function isIgcsklQuery(t) {
  return IGCSKL_RE.test(t || '');
}

export async function buildIgcsklScript() {
  const [invR, comR, sklR] = await Promise.allSettled([
    fetch(`${API}/v1/investigations`).then(r => r.json()),
    fetch(`${API}/v1/graph/communities`).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`).then(r => r.json()),
  ]);
  const invs = normaliseInvestigations(invR.status === 'fulfilled' ? invR.value : []);
  const coms = normaliseCommunities(comR.status === 'fulfilled' ? comR.value : []);
  const skls = normaliseSkills(sklR.status === 'fulfilled' ? sklR.value : []);
  const enriched = correlate(invs, coms, skls);
  const fully    = enriched.filter(i => i._hasComm && i._hasSkill).length;
  const isolated = enriched.filter(i => !i._hasComm && !i._hasSkill).length;
  return (
    `Investigation × Graph Community × Skill: ${invs.length} investigations, ${coms.length} communities, ${skls.length} skills indexed. ` +
    `${fully} investigations are FULLY SUPPORTED (community network + skill coverage); ` +
    `${isolated} are ISOLATED (no community or skill backing — operational support gap). ` +
    `Top isolated: ${enriched.filter(i => !i._hasComm && !i._hasSkill).slice(0, 3).map(i => i.title || i.name || i.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = ['investigations', 'items', 'results', 'data', 'cases'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:          inv.id || String(i),
    title:       inv.title || inv.name || inv.subject || `Investigation ${i + 1}`,
    description: String(inv.description || inv.summary || inv.notes || '').slice(0, 300),
    kind:        inv.kind || inv.type || inv.category || '',
    status:      inv.status || inv.state || '',
    seeds:       inv.seeds_count || inv.seed_count || inv.seeds || 0,
    tags:        Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
  }));
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = ['communities', 'clusters', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    label:   c.label || c.name || c.title || `Community ${i + 1}`,
    type:    c.type || c.category || '',
    members: c.members || c.member_count || c.size || 0,
    summary: String(c.summary || c.description || c.label || '').slice(0, 200),
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseSkills(raw) {
  if (!raw) return [];
  const arr = ['skills', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:          s.id || String(i),
    name:        s.name || s.title || `Skill ${i + 1}`,
    description: String(s.description || s.summary || '').slice(0, 200),
    category:    s.category || s.domain || '',
    tags:        Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(inv, item, itemKeys) {
  const invToks = new Set([
    ...tokens(inv.title),
    ...tokens(inv.description),
    ...tokens(inv.kind),
    ...tokens(inv.tags),
  ]);
  const itemToks = itemKeys.flatMap(k => tokens(item[k]));
  if (!invToks.size || !itemToks.length) return 0;
  let hits = 0;
  for (const t of itemToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, itemToks.length);
}

function correlate(invs, coms, skls) {
  const COM_KEYS = ['label', 'type', 'summary', 'tags'];
  const SKL_KEYS = ['name', 'description', 'category', 'tags'];
  return invs.map(inv => {
    const commMatches = coms
      .map(c => ({ ...c, _score: matchScore(inv, c, COM_KEYS) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);
    const skillMatches = skls
      .map(s => ({ ...s, _score: matchScore(inv, s, SKL_KEYS) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);
    return {
      ...inv,
      _hasComm:     commMatches.length > 0,
      _hasSkill:    skillMatches.length > 0,
      _commMatches: commMatches,
      _skillMatches: skillMatches,
    };
  });
}

function coverageLabel(inv) {
  if (inv._hasComm && inv._hasSkill) return 'FULLY SUPPORTED';
  if (inv._hasComm)                  return 'NETWORKED';
  if (inv._hasSkill)                 return 'SKILLED';
  return 'ISOLATED';
}

function coverageColor(inv) {
  if (inv._hasComm && inv._hasSkill) return '#22C55E';
  if (inv._hasComm)                  return '#00CFFF';
  if (inv._hasSkill)                 return '#A78BFA';
  return '#EF4444';
}

const PANEL_W = 620;
const PANEL_H = 580;
const CY  = '#00CFFF';
const GR  = '#22C55E';
const VIO = '#A78BFA';
const RED = '#EF4444';
const AM  = '#F59E0B';

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
    border: `1px solid ${color}44`, background: `${color}14`,
    color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

const TABS = ['ALL', 'FULLY SUPPORTED', 'NETWORKED', 'SKILLED', 'ISOLATED'];

export default function InvestigationGraphCommunitySkillTriple() {
  const [open, setOpen]         = useState(false);
  const [invs, setInvs]         = useState([]);
  const [coms, setComs]         = useState([]);
  const [skls, setSkls]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invR, comR, sklR] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`).then(r => r.json()),
        fetch(`${API}/v1/graph/communities`).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`).then(r => r.json()),
      ]);
      setInvs(normaliseInvestigations(invR.status === 'fulfilled' ? invR.value : []));
      setComs(normaliseCommunities(comR.status === 'fulfilled' ? comR.value : []));
      setSkls(normaliseSkills(sklR.status === 'fulfilled' ? sklR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:igcskl-toggle', onToggle);
    return () => window.removeEventListener('jarvis:igcskl-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(invs, coms, skls);
  const fully    = enriched.filter(i => i._hasComm && i._hasSkill);
  const networked = enriched.filter(i => i._hasComm && !i._hasSkill);
  const skilled  = enriched.filter(i => !i._hasComm && i._hasSkill);
  const isolated = enriched.filter(i => !i._hasComm && !i._hasSkill);
  const badgeCount = isolated.length;
  const badgeColor = badgeCount > 0 ? RED : '#6E8AA0';

  const filtered = enriched
    .filter(inv => {
      const lbl = coverageLabel(inv);
      if (tab === 'ALL') return true;
      return lbl === tab;
    })
    .filter(inv => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(inv.title || '').toLowerCase().includes(s) ||
        String(inv.kind || '').toLowerCase().includes(s) ||
        String(inv.description || '').toLowerCase().includes(s)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Investigation × Graph Community × Skill Triple Coverage: ${invs.length} investigations, ${coms.length} graph communities, ${skls.length} skills. ` +
            `${fully.length} FULLY SUPPORTED (community network + skill coverage). ` +
            `${networked.length} NETWORKED (community backing only). ` +
            `${skilled.length} SKILLED (skill coverage only). ` +
            `${isolated.length} ISOLATED (no backing — no community or skill support). ` +
            `Give a 2-sentence operational support gap brief highlighting the most critical isolation or opportunity.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Investigation × Graph Community × Skill Triple (IGCSKL)"
        style={{
          position: 'fixed', left: 753520, bottom: 8, zIndex: 374,
          width: 64, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ IGCSKL
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9210,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${RED}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${RED}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${RED}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: RED, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${RED}` }}>
              ◈ INVESTIGATION × GRAPH COMMUNITY × SKILL
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${RED}55`,
                  background: 'transparent', color: RED, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'INVESTIGATIONS', val: invs.length,     col: '#DCEBF5' },
              { label: 'COMMUNITIES',    val: coms.length,     col: CY },
              { label: 'SKILLS',         val: skls.length,     col: VIO },
              { label: 'FULLY SUPPORTED',val: fully.length,    col: GR },
              { label: 'ISOLATED',       val: isolated.length, col: RED },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '5px 6px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Coverage breakdown bar */}
          {enriched.length > 0 && (
            <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
              <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
                {[
                  { count: fully.length,    col: GR },
                  { count: networked.length, col: CY },
                  { count: skilled.length,  col: VIO },
                  { count: isolated.length, col: RED },
                ].map(({ count, col }, i) => (
                  <div key={i} style={{
                    flex: count, background: col, minWidth: count > 0 ? 2 : 0,
                    transition: 'flex 0.3s',
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                {[
                  { label: 'FULLY SUPPORTED', count: fully.length,    col: GR },
                  { label: 'NETWORKED',        count: networked.length, col: CY },
                  { label: 'SKILLED',          count: skilled.length,  col: VIO },
                  { label: 'ISOLATED',         count: isolated.length, col: RED },
                ].map(({ label, count, col }) => (
                  <span key={label} style={{ color: col, fontSize: 9, letterSpacing: 1 }}>
                    {count} {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? RED : '#2a3a4a'}`,
                  background: tab === t ? `${RED}22` : 'transparent',
                  color: tab === t ? RED : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search cases…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 140,
              }}
            />
          </div>

          {/* Investigation list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No investigations found.'}
              </div>
            ) : filtered.map((inv, i) => {
              const isExp = expanded === i;
              const cov   = coverageLabel(inv);
              const col   = coverageColor(inv);
              return (
                <div
                  key={inv.id || i}
                  style={{ borderBottom: `1px solid ${RED}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: col,
                      boxShadow: `0 0 6px ${col}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1, minWidth: 0 }}>
                      {inv.title || inv.id || '?'}
                    </span>
                    {inv.kind && chip(inv.kind, AM)}
                    {chip(cov, col)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 6 }}>
                      {/* Community matches */}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          GRAPH COMMUNITIES ({inv._commMatches.length})
                        </div>
                        {inv._commMatches.length > 0 ? inv._commMatches.map((c, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1, minWidth: 0 }}>
                              {c.label || c.id || '?'}
                            </span>
                            {c.type && chip(c.type, CY)}
                            {c.members > 0 && (
                              <span style={{ color: '#6E8AA0', fontSize: 9 }}>{c.members}m</span>
                            )}
                            {scorebar(c._score, CY)}
                          </div>
                        )) : (
                          <div style={{ color: RED, fontSize: 10 }}>No community network match.</div>
                        )}
                      </div>

                      {/* Skill matches */}
                      <div>
                        <div style={{ color: VIO, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          JARVIS SKILLS ({inv._skillMatches.length})
                        </div>
                        {inv._skillMatches.length > 0 ? inv._skillMatches.map((s, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1, minWidth: 0 }}>
                              {s.name || s.id || '?'}
                            </span>
                            {s.category && chip(s.category, VIO)}
                            {scorebar(s._score, VIO)}
                          </div>
                        )) : (
                          <div style={{ color: RED, fontSize: 10 }}>No skill coverage found.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Brief block */}
          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${RED}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(239,68,68,0.03)',
            }}>
              <span style={{ color: RED, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
