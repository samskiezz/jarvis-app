/**
 * InvestigationDatasetSkillContactCoverage — F126
 *
 * Fetches /v1/investigations + /v1/datasets + /v1/aip/skill + /entities/Contact.
 *
 * Keyword-matches each investigation against datasets, skills, and contacts to classify:
 *
 *   COVERED   — investigation matches dataset AND skill AND contact
 *               (fully grounded: data sourced, capable, and staffed)
 *   RESOURCED — investigation matches dataset AND contact but no skill
 *               (resourced but un-skilled — capability gap)
 *   SKILLED   — investigation matches skill but no dataset
 *               (capable but unsupported — data gap)
 *   EXPOSED   — no match to any source
 *               (undefended open case: no data source, no skill, no contact)
 *
 * Toggle: ◈ IDSCOV button (fixed, bottom strip) left:118920, zIndex:223
 * Stat tiles: investigations / datasets / skills / contacts / covered / resourced / skilled / exposed
 * Red pulse on EXPOSED count (mission blind spots).
 * Expandable rows: matched datasets with row-count badge +
 *                  matched skills with score badge +
 *                  matched contacts with role/org.
 * Filter tabs: ALL / COVERED / RESOURCED / SKILLED / EXPOSED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "idscov"/"investigation coverage"/"investigation dataset skill"/"open case coverage"
 *        "exposed investigations"/"undefended cases"/"case intelligence coverage"
 *        "investigation contact skill"/"mission coverage"/"active case coverage"
 *        "investigation skill gap"/"case data coverage"/"investigation dataset contact"
 * Event: jarvis:idscov-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'RESOURCED', 'SKILLED', 'EXPOSED'];

const CLS_COLOR = {
  COVERED:   '#22C55E',
  RESOURCED: '#3B82F6',
  SKILLED:   '#F97316',
  EXPOSED:   '#EF4444',
};

export function isIdscovQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'idscov', 'investigation coverage', 'investigation dataset skill', 'open case coverage',
    'exposed investigations', 'undefended cases', 'case intelligence coverage',
    'investigation contact skill', 'mission coverage', 'active case coverage',
    'investigation skill gap', 'case data coverage', 'investigation dataset contact',
    'case coverage', 'investigation data gap', 'investigation staffing',
  ].some(kw => s.includes(kw));
}

export function buildIdscovScript(q) {
  return `JARVIS investigation–dataset–skill–contact active mission intelligence coverage triggered by: "${q}". Fetch /v1/investigations + /v1/datasets + /v1/aip/skill + /entities/Contact. Classify each investigation as COVERED/RESOURCED/SKILLED/EXPOSED. Report the exposed count and top 3 undefended open cases with no data source, no matching skill, and no assigned contact.`;
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

function invLabel(inv) {
  return inv.title || inv.name || inv.subject || inv.id || 'Unknown';
}

function invTokens(inv) {
  return tokens(
    `${inv.title || ''} ${inv.name || ''} ${inv.subject || ''} ${inv.description || ''} ${inv.category || ''} ${inv.type || ''} ${inv.tags ? (Array.isArray(inv.tags) ? inv.tags.join(' ') : inv.tags) : ''}`
  );
}

function classifyInvestigation(inv, datasets, skills, contacts) {
  const toks = invTokens(inv);

  const mDatasets = datasets.filter(d =>
    overlaps(toks, `${d.name || ''} ${d.title || ''} ${d.description || ''} ${d.type || ''} ${d.category || ''} ${d.tags ? (Array.isArray(d.tags) ? d.tags.join(' ') : d.tags) : ''}`)
  );
  const mSkills = skills.filter(s =>
    overlaps(toks, `${s.name || ''} ${s.title || ''} ${s.skill_name || ''} ${s.description || ''} ${s.category || ''} ${s.type || ''} ${s.tags ? (Array.isArray(s.tags) ? s.tags.join(' ') : s.tags) : ''}`)
  );
  const mContacts = contacts.filter(c =>
    overlaps(toks, `${c.name || ''} ${c.full_name || ''} ${c.title || ''} ${c.role || ''} ${c.organization || ''} ${c.org || ''} ${c.email || ''} ${c.tags ? (Array.isArray(c.tags) ? c.tags.join(' ') : c.tags) : ''}`)
  );

  const hasDataset  = mDatasets.length > 0;
  const hasSkill    = mSkills.length > 0;
  const hasContact  = mContacts.length > 0;

  let cls;
  if (hasDataset && hasSkill && hasContact)  cls = 'COVERED';
  else if (hasDataset && hasContact)          cls = 'RESOURCED';
  else if (hasSkill)                          cls = 'SKILLED';
  else                                        cls = 'EXPOSED';

  return { inv, cls, mDatasets, mSkills, mContacts };
}

export default function InvestigationDatasetSkillContactCoverage() {
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
      const [invRaw, datasetRaw, skillRaw, contactRaw] = await Promise.all([
        fetcher('/v1/investigations'),
        fetcher('/v1/datasets'),
        fetcher('/v1/aip/skill'),
        fetcher('/entities/Contact'),
      ]);

      const investigations = normalizeArray(invRaw,     ['investigations', 'data', 'items', 'results']);
      const datasets       = normalizeArray(datasetRaw, ['datasets', 'data', 'items', 'results']);
      const skills         = normalizeArray(skillRaw,   ['skills', 'data', 'items', 'results']);
      const contacts       = normalizeArray(contactRaw, ['contacts', 'data', 'items', 'results']);

      setRows(investigations.map(inv => classifyInvestigation(inv, datasets, skills, contacts)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:idscov-toggle', handler);
    return () => window.removeEventListener('jarvis:idscov-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    COVERED:   rows.filter(r => r.cls === 'COVERED').length,
    RESOURCED: rows.filter(r => r.cls === 'RESOURCED').length,
    SKILLED:   rows.filter(r => r.cls === 'SKILLED').length,
    EXPOSED:   rows.filter(r => r.cls === 'EXPOSED').length,
  };

  const datasetCount  = rows.reduce((n, r) => n + r.mDatasets.length,  0);
  const skillCount    = rows.reduce((n, r) => n + r.mSkills.length,    0);
  const contactCount  = rows.reduce((n, r) => n + r.mContacts.length,  0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return invLabel(r.inv).toLowerCase().includes(s) ||
             (r.inv.category || r.inv.type || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Investigations: ${rows.length}. Covered: ${counts.COVERED}. Resourced: ${counts.RESOURCED}. Skilled: ${counts.SKILLED}. Exposed: ${counts.EXPOSED}.`;
    const prompt = `JARVIS investigation–dataset–skill–contact active mission intelligence coverage: ${summary}. Identify the most critical EXPOSED investigations — open cases with no dataset, no skill coverage, and no assigned contact. Provide a 2-sentence advisory on the highest-risk exposed cases and priority actions to resource, skill, and staff them to close the mission intelligence gap.`;
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
          position: 'fixed', bottom: 8, left: 118920, zIndex: 223,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ IDSCOV</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 223, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ IDSCOV</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Investigation × Dataset × Skill × Contact — Active Mission Intelligence Coverage</span>
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
          { label: 'CASES',      val: rows.length,         color: '#94a3b8' },
          { label: 'DATASETS',   val: datasetCount,         color: '#22D3EE' },
          { label: 'SKILLS',     val: skillCount,           color: '#34D399' },
          { label: 'CONTACTS',   val: contactCount,         color: '#a78bfa' },
          { label: 'COVERED',    val: counts.COVERED,       color: CLS_COLOR.COVERED },
          { label: 'RESOURCED',  val: counts.RESOURCED,     color: CLS_COLOR.RESOURCED },
          { label: 'SKILLED',    val: counts.SKILLED,       color: CLS_COLOR.SKILLED },
          { label: 'EXPOSED',    val: counts.EXPOSED,       color: CLS_COLOR.EXPOSED, pulse: counts.EXPOSED > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 88, textAlign: 'center',
            animation: pulse ? 'idscov-pulse 2s ease-in-out infinite' : 'none',
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
          placeholder="search investigations…"
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
                  {invLabel(r.inv)}
                </span>
                {r.inv.status && (
                  <span style={{ background: '#030c18', border: '1px solid #1e3a5f', color: '#7dd3fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.inv.status}
                  </span>
                )}
                {r.inv.category && (
                  <span style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.inv.category}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mDatasets.length > 0 && (
                    <div>
                      <div style={{ color: '#22D3EE', fontSize: 10, marginBottom: 3 }}>DATASETS ({r.mDatasets.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mDatasets.slice(0, 8).map((d, k) => (
                          <span key={k} style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {d.name || d.title || d.id}
                            {(d.row_count != null || d.rows != null || d.count != null) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{d.row_count ?? d.rows ?? d.count}r]</span>
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
                        {r.mSkills.slice(0, 8).map((s, k) => (
                          <span key={k} style={{ background: '#021208', border: '1px solid #065f46', color: '#34D399', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {s.name || s.title || s.skill_name || s.id}
                            {s.score != null && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [s:{typeof s.score === 'number' ? s.score.toFixed(2) : s.score}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>CONTACTS ({r.mContacts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mContacts.slice(0, 8).map((c, k) => (
                          <span key={k} style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {c.name || c.full_name || c.id}
                            {(c.role || c.title) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{c.role || c.title}]</span>
                            )}
                            {(c.organization || c.org) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> {c.organization || c.org}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mDatasets.length === 0 && r.mSkills.length === 0 && r.mContacts.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No dataset source, no skill coverage, no assigned contact — exposed investigation with zero mission intelligence grounding.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes idscov-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
