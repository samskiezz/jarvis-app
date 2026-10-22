/**
 * IntelProfileFullAssetCoverage — F128
 *
 * 5-source intel asset coverage audit.
 * Fetches /entities/IntelProfile + /entities/Contact + /v1/datasets
 *         + /v1/scenario/list + /v1/aip/skill
 *
 * Keyword-matches each intel profile against contacts, datasets,
 * runnable scenarios, and available skills to classify full coverage:
 *
 *   GROUNDED — matches contact + dataset + scenario + skill
 *               (fully backed: personnel, data, playbook, capability)
 *   CAPABLE  — matches scenario + skill but no contact/dataset
 *               (capability exists but no personnel or data)
 *   SOURCED  — matches contact + dataset but no scenario/skill
 *               (people and data, no playbook or dedicated skill)
 *   SHADOW   — no match to any source
 *               (full intelligence blind spot: zero operational grounding)
 *
 * Toggle: ◈ IPFAC5 button (fixed, bottom strip) left:120040, zIndex:225
 * Stat tiles: profiles / contacts / datasets / scenarios / skills /
 *             grounded / capable / sourced / shadow
 * Red pulse on SHADOW count (full blind spots).
 * Expandable rows: matched contacts with role/org badge +
 *                  matched datasets with row-count badge +
 *                  matched scenarios with status badge +
 *                  matched skills with score badge.
 * Filter tabs: ALL / GROUNDED / CAPABLE / SOURCED / SHADOW + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ipfac5"/"intel full coverage"/"full intel coverage"/"intel asset coverage"
 *        "intel 5 source"/"full asset audit"/"shadow intel"/"intel shadow"
 *        "intel blind spot"/"full coverage audit"/"intel grounding"/"intel personnel"
 *        "intel playbook"/"intel capability coverage"/"intel asset audit"
 *        "intel sourced"/"intel capable"/"intel grounded"/"full intel audit"
 * Event: jarvis:ipfac5-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'GROUNDED', 'CAPABLE', 'SOURCED', 'SHADOW'];

const CLS_COLOR = {
  GROUNDED: '#22C55E',
  CAPABLE:  '#3B82F6',
  SOURCED:  '#F97316',
  SHADOW:   '#EF4444',
};

export function isIpfac5Query(q) {
  const s = (q || '').toLowerCase();
  return [
    'ipfac5', 'intel full coverage', 'full intel coverage', 'intel asset coverage',
    'intel 5 source', 'full asset audit', 'shadow intel', 'intel shadow',
    'intel blind spot', 'full coverage audit', 'intel grounding', 'intel personnel',
    'intel playbook', 'intel capability coverage', 'intel asset audit',
    'intel sourced', 'intel capable', 'intel grounded', 'full intel audit',
    'intel profile coverage', 'profile full coverage', 'intel full asset',
    '5-source intel', 'intel five source', 'intel complete coverage',
  ].some(kw => s.includes(kw));
}

export function buildIpfac5Script(q) {
  return `JARVIS intel-profile full-asset coverage audit triggered by: "${q}". Fetch /entities/IntelProfile + /entities/Contact + /v1/datasets + /v1/scenario/list + /v1/aip/skill. Classify each intel profile as GROUNDED/CAPABLE/SOURCED/SHADOW. Report the SHADOW count and top 3 blind-spot intel profiles with no personnel, no data, no playbook, and no skill grounding.`;
}

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function profileLabel(p) {
  return p.name || p.title || p.profile_name || p.subject || p.id || 'Unknown';
}

function profileTokens(p) {
  return tokens(
    `${p.name || ''} ${p.title || ''} ${p.profile_name || ''} ${p.subject || ''} ${p.category || ''} ${p.description || ''} ${p.type || ''} ${p.tags ? (Array.isArray(p.tags) ? p.tags.join(' ') : p.tags) : ''}`
  );
}

function classifyProfile(p, contacts, datasets, scenarios, skills) {
  const toks = profileTokens(p);

  const mContacts = contacts.filter(c =>
    overlaps(toks, `${c.name || ''} ${c.full_name || ''} ${c.role || ''} ${c.org || ''} ${c.organisation || ''} ${c.department || ''} ${c.title || ''} ${c.tags ? (Array.isArray(c.tags) ? c.tags.join(' ') : c.tags) : ''}`)
  );
  const mDatasets = datasets.filter(d =>
    overlaps(toks, `${d.name || ''} ${d.title || ''} ${d.description || ''} ${d.category || ''} ${d.type || ''} ${d.tags ? (Array.isArray(d.tags) ? d.tags.join(' ') : d.tags) : ''}`)
  );
  const mScenarios = scenarios.filter(s =>
    overlaps(toks, `${s.name || ''} ${s.title || ''} ${s.description || ''} ${s.objective || ''} ${s.category || ''} ${s.type || ''} ${s.tags ? (Array.isArray(s.tags) ? s.tags.join(' ') : s.tags) : ''}`)
  );
  const mSkills = skills.filter(sk =>
    overlaps(toks, `${sk.name || ''} ${sk.title || ''} ${sk.description || ''} ${sk.category || ''} ${sk.type || ''} ${sk.tags ? (Array.isArray(sk.tags) ? sk.tags.join(' ') : sk.tags) : ''}`)
  );

  const hasContact  = mContacts.length > 0;
  const hasDataset  = mDatasets.length > 0;
  const hasScenario = mScenarios.length > 0;
  const hasSkill    = mSkills.length > 0;

  let cls;
  if (hasContact && hasDataset && hasScenario && hasSkill) cls = 'GROUNDED';
  else if (hasScenario && hasSkill)                        cls = 'CAPABLE';
  else if (hasContact && hasDataset)                       cls = 'SOURCED';
  else                                                     cls = 'SHADOW';

  return { p, cls, mContacts, mDatasets, mScenarios, mSkills };
}

export default function IntelProfileFullAssetCoverage() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [rows,       setRows]       = useState([]);
  const [err,        setErr]        = useState(null);
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [profileRaw, contactRaw, datasetRaw, scenarioRaw, skillRaw] = await Promise.all([
        fetcher('/entities/IntelProfile'),
        fetcher('/entities/Contact'),
        fetcher('/v1/datasets'),
        fetcher('/v1/scenario/list'),
        fetcher('/v1/aip/skill'),
      ]);

      const profiles  = normalizeArray(profileRaw,  ['intel_profiles', 'intelProfiles', 'profiles', 'data', 'items', 'results']);
      const contacts  = normalizeArray(contactRaw,  ['contacts', 'data', 'items', 'results']);
      const datasets  = normalizeArray(datasetRaw,  ['datasets', 'data', 'items', 'results']);
      const scenarios = normalizeArray(scenarioRaw, ['scenarios', 'data', 'items', 'results']);
      const skills    = normalizeArray(skillRaw,    ['skills', 'data', 'items', 'results']);

      setRows(profiles.map(p => classifyProfile(p, contacts, datasets, scenarios, skills)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:ipfac5-toggle', handler);
    return () => window.removeEventListener('jarvis:ipfac5-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    GROUNDED: rows.filter(r => r.cls === 'GROUNDED').length,
    CAPABLE:  rows.filter(r => r.cls === 'CAPABLE').length,
    SOURCED:  rows.filter(r => r.cls === 'SOURCED').length,
    SHADOW:   rows.filter(r => r.cls === 'SHADOW').length,
  };

  const contactCount  = rows.reduce((n, r) => n + r.mContacts.length,  0);
  const datasetCount  = rows.reduce((n, r) => n + r.mDatasets.length,  0);
  const scenarioCount = rows.reduce((n, r) => n + r.mScenarios.length, 0);
  const skillCount    = rows.reduce((n, r) => n + r.mSkills.length,    0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return profileLabel(r.p).toLowerCase().includes(s) ||
             (r.p.category || r.p.type || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `IntelProfiles: ${rows.length}. Grounded: ${counts.GROUNDED}. Capable: ${counts.CAPABLE}. Sourced: ${counts.SOURCED}. Shadow: ${counts.SHADOW}.`;
    const prompt = `JARVIS intel-profile full-asset coverage audit: ${summary}. Identify the most critical SHADOW intel profiles — those with no contact owner, no dataset, no runnable scenario, and no supporting skill. Provide a 2-sentence advisory on the top blind-spot profiles and priority actions to anchor them across personnel, data, playbook, and capability layers.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || JSON.stringify(d);
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch (_) {}
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 120040, zIndex: 225,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ IPFAC5</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 225, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ IPFAC5</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>IntelProfile × Contact × Dataset × Scenario × Skill — Full Asset Coverage (5-source)</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #EF444455', color: '#EF4444', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'PROFILES',  val: rows.length,       color: '#94a3b8' },
          { label: 'CONTACTS',  val: contactCount,       color: '#22D3EE' },
          { label: 'DATASETS',  val: datasetCount,       color: '#a78bfa' },
          { label: 'SCENARIOS', val: scenarioCount,      color: '#F97316' },
          { label: 'SKILLS',    val: skillCount,         color: '#34D399' },
          { label: 'GROUNDED',  val: counts.GROUNDED,   color: CLS_COLOR.GROUNDED },
          { label: 'CAPABLE',   val: counts.CAPABLE,    color: CLS_COLOR.CAPABLE },
          { label: 'SOURCED',   val: counts.SOURCED,    color: CLS_COLOR.SOURCED },
          { label: 'SHADOW',    val: counts.SHADOW,     color: CLS_COLOR.SHADOW, pulse: counts.SHADOW > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 88, textAlign: 'center',
            animation: pulse ? 'ipfac5-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid #EF444444', borderRadius: 5, fontSize: 11, color: '#fca5a5', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#EF444422' : 'none',
            border: `1px solid ${tab === t ? '#EF4444' : '#1e293b'}`,
            color: tab === t ? '#EF4444' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search intel profiles…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 200 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLS_COLOR[r.cls], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profileLabel(r.p)}
                </span>
                {r.p.category && (
                  <span style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.p.category}
                  </span>
                )}
                {r.p.type && (
                  <span style={{ background: '#030c18', border: '1px solid #1e3a5f', color: '#7dd3fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.p.type}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#22D3EE', fontSize: 10, marginBottom: 3 }}>CONTACTS ({r.mContacts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mContacts.slice(0, 8).map((c, k) => (
                          <span key={k} style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {c.name || c.full_name || c.id}
                            {(c.role || c.org || c.organisation) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{c.role || ''}{c.role && (c.org || c.organisation) ? ' · ' : ''}{c.org || c.organisation || ''}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mDatasets.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>DATASETS ({r.mDatasets.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mDatasets.slice(0, 8).map((d, k) => (
                          <span key={k} style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {d.name || d.title || d.id}
                            {(d.row_count || d.rows || d.count) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(d.row_count || d.rows || d.count).toLocaleString()} rows]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mScenarios.length > 0 && (
                    <div>
                      <div style={{ color: '#F97316', fontSize: 10, marginBottom: 3 }}>SCENARIOS ({r.mScenarios.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mScenarios.slice(0, 8).map((s, k) => (
                          <span key={k} style={{ background: '#150800', border: '1px solid #7c2d12', color: '#F97316', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {s.name || s.title || s.id}
                            {s.status && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{s.status}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSkills.length > 0 && (
                    <div>
                      <div style={{ color: '#34D399', fontSize: 10, marginBottom: 3 }}>SKILLS ({r.mSkills.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSkills.slice(0, 8).map((sk, k) => (
                          <span key={k} style={{ background: '#031209', border: '1px solid #14532d', color: '#34D399', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {sk.name || sk.title || sk.id}
                            {(sk.score !== undefined || sk.level !== undefined) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{sk.score ?? sk.level}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mContacts.length === 0 && r.mDatasets.length === 0 && r.mScenarios.length === 0 && r.mSkills.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No contact owner, no dataset, no runnable scenario, no skill grounding — full intelligence blind spot with zero operational foundation.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes ipfac5-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
