/**
 * F269 — Investigation × AIP Skill × Dataset Triple (IASD)
 *
 * Answers: "For each open investigation, is there a JARVIS skill that can address it
 * AND a dataset that backs it with data?"
 * FULLY_RESOURCED — both a skill AND a dataset are correlated.
 * SKILL_ONLY       — a skill is matched, but no backing dataset.
 * DATA_ONLY        — a dataset is present, but no capability skill.
 * DARK             — no skill and no dataset (highest risk — blind spot investigation).
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/investigations   → open investigation cases
 *   GET /v1/aip/skill        → JARVIS AIP skill catalog
 *   GET /v1/datasets         → dataset catalog
 *
 * Stat tiles:  investigations / skills / datasets / dark
 * Amber badge: dark count on button (uninvestigated from both angles).
 * Expand row:  matched skills with category badge + relevance bar
 *              + matched datasets with type badge + relevance bar.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IASD  at left:5880 bottom:18, zIndex:68.
 * Event:   jarvis:iasd-toggle
 * Voice:   "investigation skill dataset / iasd / dark investigations /
 *           investigation resource / skill coverage investigation /
 *           investigation data / resource gap / skill investigation /
 *           investigation coverage triple"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const IASD_RE =
  /\b(invest(?:igation)?[._-]?skill[._-]?dataset|iasd|dark[._-]?invest(?:igation)?s?|invest(?:igation)?[._-]?resource|skill[._-]?coverage[._-]?invest(?:igation)?|invest(?:igation)?[._-]?data(?:set)?|resource[._-]?gap|skill[._-]?invest(?:igation)?|invest(?:igation)?[._-]?coverage[._-]?triple|uninvestigated)\b/i;

export function isIasdQuery(t) {
  return IASD_RE.test(t || '');
}

export async function buildIasdScript() {
  const [invR, skR, dsR] = await Promise.allSettled([
    fetch(`${API}/v1/investigations`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const invs = normInvs(invR.status === 'fulfilled' ? invR.value : []);
  const skills = normSkills(skR.status === 'fulfilled' ? skR.value : []);
  const datasets = normDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
  const enriched = enrich(invs, skills, datasets);
  const dark = enriched.filter(r => r._class === 'DARK').length;
  const full = enriched.filter(r => r._class === 'FULLY_RESOURCED').length;
  return (
    `Investigation × Skill × Dataset: ${invs.length} investigations, ${skills.length} skills, ${datasets.length} datasets. ` +
    `${full} are FULLY_RESOURCED (skill + data coverage); ${dark} are DARK — no skill address and no backing dataset (immediate intelligence gap). ` +
    `Top dark investigations: ${enriched.filter(r => r._class === 'DARK').slice(0, 3).map(r => r.title || '?').join(', ') || 'none'}.`
  );
}

// ─── normalise ───────────────────────────────────────────────────────────────

function normInvs(raw) {
  if (!raw) return [];
  for (const k of ['investigations', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normSkills(raw) {
  if (!raw) return [];
  for (const k of ['skills', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normDatasets(raw) {
  if (!raw) return [];
  for (const k of ['datasets', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

// ─── keyword scoring ─────────────────────────────────────────────────────────

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[\s,._\-/|:;()\[\]]+/)
    .filter(t => t.length > 2);
}

function invTokens(inv) {
  return tokens(
    [inv.title, inv.name, inv.description, inv.summary, inv.status,
     ...(Array.isArray(inv.tags) ? inv.tags : [])].join(' ')
  );
}

function skillTokens(sk) {
  return tokens(
    [sk.name, sk.title, sk.description, sk.category, sk.type,
     ...(Array.isArray(sk.tags) ? sk.tags : [])].join(' ')
  );
}

function datasetTokens(ds) {
  return tokens(
    [ds.name, ds.title, ds.description, ds.category, ds.type,
     ds.source, ds.domain,
     ...(Array.isArray(ds.tags) ? ds.tags : [])].join(' ')
  );
}

function score(aToks, bToks) {
  if (!aToks.length || !bToks.length) return 0;
  const a = new Set(aToks);
  const b = new Set(bToks);
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  return hits / Math.max(a.size, b.size);
}

// ─── enrich ──────────────────────────────────────────────────────────────────

function enrich(invs, skills, datasets) {
  const THRESHOLD = 0.07;
  return invs.map(inv => {
    const it = invTokens(inv);
    const skMatches = skills
      .map(sk => ({ sk, score: score(it, skillTokens(sk)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const dsMatches = datasets
      .map(ds => ({ ds, score: score(it, datasetTokens(ds)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const hasSk = skMatches.length > 0;
    const hasDs = dsMatches.length > 0;
    const _class = hasSk && hasDs
      ? 'FULLY_RESOURCED'
      : hasSk
      ? 'SKILL_ONLY'
      : hasDs
      ? 'DATA_ONLY'
      : 'DARK';
    return { ...inv, _class, _skMatches: skMatches, _dsMatches: dsMatches };
  });
}

// ─── UI ──────────────────────────────────────────────────────────────────────

const CY  = '#29E7FF';
const AMB = '#FFD700';
const GRN = '#00E5A0';
const RED = '#FF4D6D';
const PRP = '#B485FF';

const CLASS_COL = {
  FULLY_RESOURCED: GRN,
  SKILL_ONLY:      CY,
  DATA_ONLY:       PRP,
  DARK:            AMB,
};

const FILTER_TABS = ['ALL', 'FULLY_RESOURCED', 'SKILL_ONLY', 'DATA_ONLY', 'DARK'];

const BASE = {
  position: 'fixed',
  fontFamily: "'Share Tech Mono', 'Courier New', monospace",
  fontSize: 11,
  color: CY,
  zIndex: 68,
};

export default function InvestigationSkillDatasetTriple() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [stats, setStats]     = useState({ invs: 0, skills: 0, datasets: 0, dark: 0 });
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invR, skR, dsR] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/v1/datasets`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const invs     = normInvs(invR.status === 'fulfilled' ? invR.value : []);
      const skills   = normSkills(skR.status === 'fulfilled' ? skR.value : []);
      const datasets = normDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
      const enriched = enrich(invs, skills, datasets);
      setRows(enriched);
      setStats({
        invs:     invs.length,
        skills:   skills.length,
        datasets: datasets.length,
        dark:     enriched.filter(r => r._class === 'DARK').length,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:iasd-toggle', handler);
    return () => window.removeEventListener('jarvis:iasd-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.title || r.name || '').toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildIasdScript();
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `You are JARVIS. Summarise in 2 sentences: ${script}` }),
      });
      const j = res.ok ? await res.json() : {};
      const brief = j.response || j.message || j.content || script;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: brief } }));
    } finally {
      setAssessing(false);
    }
  }

  const darkCount = stats.dark;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investigation × AIP Skill × Dataset Triple (IASD)"
        style={{
          ...BASE,
          left: 5880, bottom: 18,
          background: 'rgba(0,0,0,0.7)',
          border: `1px solid ${darkCount > 0 ? AMB : CY}`,
          borderRadius: 4, padding: '3px 7px', cursor: 'pointer',
          color: darkCount > 0 ? AMB : CY,
        }}
      >
        ◈ IASD
        {darkCount > 0 && (
          <span style={{ marginLeft: 5, background: AMB, color: '#000', borderRadius: 3, padding: '0 4px', fontSize: 10 }}>
            {darkCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      ...BASE,
      left: 5880, bottom: 55, width: 520, maxHeight: 560,
      background: 'rgba(0,6,16,0.97)', border: `1px solid ${AMB}`,
      borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid rgba(255,215,0,0.2)`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: AMB, fontWeight: 700, flex: 1 }}>◈ INVESTIGATION × SKILL × DATASET (IASD)</span>
        <button onClick={assess} disabled={assessing} style={{ background: 'none', border: `1px solid ${CY}`, color: CY, borderRadius: 3, padding: '2px 7px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: `1px solid rgba(255,215,0,0.1)` }}>
        {[
          { label: 'INVESTIGATIONS', val: stats.invs, col: CY },
          { label: 'SKILLS',         val: stats.skills, col: GRN },
          { label: 'DATASETS',       val: stats.datasets, col: PRP },
          { label: 'DARK',           val: stats.dark, col: AMB },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '4px 2px' }}>
            <div style={{ fontSize: 16, color: col, fontWeight: 700 }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* proportional coverage bar */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', height: 6, margin: '4px 12px' }}>
          {FILTER_TABS.slice(1).map(cls => {
            const cnt = rows.filter(r => r._class === cls).length;
            const pct = (cnt / rows.length) * 100;
            return pct > 0 ? (
              <div key={cls} title={`${cls}: ${cnt}`} style={{ width: `${pct}%`, background: CLASS_COL[cls], transition: 'width 0.4s' }} />
            ) : null;
          })}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px 0', flexWrap: 'wrap' }}>
        {FILTER_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? (CLASS_COL[t] || CY) : 'none',
            border: `1px solid ${CLASS_COL[t] || CY}`,
            color: tab === t ? '#000' : (CLASS_COL[t] || CY),
            borderRadius: 3, padding: '2px 7px', cursor: 'pointer', fontSize: 10,
          }}>{t.replace('_', ' ')}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: `1px solid #333`, color: CY, borderRadius: 3, padding: '2px 6px', fontSize: 10, width: 110 }}
        />
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px 10px' }}>
        {loading && !rows.length && <div style={{ color: '#555', textAlign: 'center', padding: 20 }}>loading…</div>}
        {!loading && !visible.length && <div style={{ color: '#555', textAlign: 'center', padding: 20 }}>no results</div>}
        {visible.map(inv => {
          const isExp = expanded[inv.id];
          const col = CLASS_COL[inv._class];
          return (
            <div key={inv.id} style={{ marginBottom: 6, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [inv.id]: !e[inv.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}
              >
                <span style={{ color: col, fontSize: 10, minWidth: 100, fontWeight: 700 }}>{inv._class.replace('_', ' ')}</span>
                <span style={{ flex: 1, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inv.title || inv.name || inv.id}
                </span>
                <span style={{ color: '#555', fontSize: 10 }}>
                  {inv._skMatches.length}sk / {inv._dsMatches.length}ds {isExp ? '▲' : '▼'}
                </span>
              </div>
              {isExp && (
                <div style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {inv._skMatches.length > 0 && (
                    <>
                      <div style={{ color: GRN, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>MATCHED SKILLS</div>
                      {inv._skMatches.map(({ sk, score: s }) => (
                        <div key={sk.id || sk.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ background: GRN, color: '#000', borderRadius: 2, padding: '0 4px', fontSize: 9, minWidth: 60, textAlign: 'center' }}>
                            {(sk.category || sk.type || 'SKILL').toUpperCase().slice(0, 10)}
                          </span>
                          <span style={{ flex: 1, color: '#aaa', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sk.name || sk.title || sk.id}
                          </span>
                          <div style={{ width: 50, height: 4, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(s * 100)}%`, height: '100%', background: GRN }} />
                          </div>
                          <span style={{ color: '#666', fontSize: 9, minWidth: 28, textAlign: 'right' }}>{(s * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </>
                  )}
                  {inv._dsMatches.length > 0 && (
                    <>
                      <div style={{ color: PRP, fontSize: 9, letterSpacing: 1, marginTop: 6, marginBottom: 4 }}>MATCHED DATASETS</div>
                      {inv._dsMatches.map(({ ds, score: s }) => (
                        <div key={ds.id || ds.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ background: PRP, color: '#000', borderRadius: 2, padding: '0 4px', fontSize: 9, minWidth: 60, textAlign: 'center' }}>
                            {(ds.category || ds.type || ds.domain || 'DATA').toUpperCase().slice(0, 10)}
                          </span>
                          <span style={{ flex: 1, color: '#aaa', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ds.name || ds.title || ds.id}
                          </span>
                          <div style={{ width: 50, height: 4, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(s * 100)}%`, height: '100%', background: PRP }} />
                          </div>
                          <span style={{ color: '#666', fontSize: 9, minWidth: 28, textAlign: 'right' }}>{(s * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </>
                  )}
                  {inv._skMatches.length === 0 && inv._dsMatches.length === 0 && (
                    <div style={{ color: AMB, fontSize: 10 }}>No skill or dataset match — this investigation is DARK.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ borderTop: `1px solid rgba(255,215,0,0.1)`, padding: '5px 12px', fontSize: 9, color: '#444', display: 'flex', justifyContent: 'space-between' }}>
        <span>IASD — 90 s auto-refresh</span>
        <span>{visible.length} / {rows.length} shown</span>
      </div>
    </div>
  );
}
