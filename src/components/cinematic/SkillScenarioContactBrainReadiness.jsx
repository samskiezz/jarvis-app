/**
 * SkillScenarioContactBrainReadiness — F235
 *
 * Fetches /v1/aip/skill + /v1/scenario/list +
 *         /entities/Contact + /v1/cinematic/brain
 *
 * Keyword-matches each skill (name/description/category) against
 * scenario titles/descriptions, contact names/roles/orgs, and brain
 * node labels/types to classify:
 *
 *   FORTIFIED — matches all 3 sources
 *               (skill is deployed, staged, staffed, and modelled)
 *   CAPABLE   — matches 2 of 3 sources
 *               (skill is partially grounded)
 *   STAFFED   — matches exactly 1 source
 *               (skill is minimally anchored)
 *   BLIND     — no match to any source
 *               (capability blind spot — skill with no scenario, no contact, no brain model)
 *
 * Toggle: ◈ SSCBRM button (fixed, bottom strip) left:179400, zIndex:331
 * Stat tiles: skills / scenarios / contacts / brain nodes /
 *             fortified / capable / staffed / blind
 * Amber pulse on BLIND count (capability blind spots).
 * Expandable rows: matched scenarios with status badge +
 *                  matched contacts with role/org badge +
 *                  matched brain nodes with type badge.
 * Filter tabs: ALL / FORTIFIED / CAPABLE / STAFFED / BLIND + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "sscbrm"/"skill readiness"/"capability readiness"/"skill brain"/
 *        "blind skill"/"skill scenario"/"capability intelligence"/"skill coverage"/
 *        "capability map"/"skill contact"/"unanchored skill"/"skill grounding"
 * Event: jarvis:sscbrm-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'FORTIFIED', 'CAPABLE', 'STAFFED', 'BLIND'];

const CLS_COLOR = {
  FORTIFIED: '#22C55E',
  CAPABLE:   '#38BDF8',
  STAFFED:   '#F59E0B',
  BLIND:     '#F97316',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeSkills(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.skills))   return raw.skills;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.scenarios))  return raw.scenarios;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.contacts))  return raw.contacts;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function normalizeBrainNodes(raw) {
  if (Array.isArray(raw?.nodes))     return raw.nodes;
  if (Array.isArray(raw?.graph?.nodes)) return raw.graph.nodes;
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function skillLabel(s) {
  return s?.name || s?.title || s?.skill_name || s?.id || 'Unknown';
}

function skillText(s) {
  return [s?.name, s?.title, s?.skill_name, s?.description, s?.category, s?.domain,
          (s?.tags || []).join(' ')].join(' ');
}

function classify(skill, scenarios, contacts, brainNodes) {
  const stoks = tokens(skillText(skill));

  const matchedScenarios = scenarios.filter(sc =>
    overlaps(stoks, [sc?.name, sc?.title, sc?.description, sc?.type, sc?.status,
                     sc?.objective, sc?.category].join(' '))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(stoks, [c?.name, c?.full_name, c?.role, c?.organisation, c?.org,
                     c?.email, (c?.tags || []).join(' ')].join(' '))
  );
  const matchedBrain = brainNodes.filter(n =>
    overlaps(stoks, [n?.label, n?.name, n?.type, n?.category, n?.description].join(' '))
  );

  const hasS = matchedScenarios.length > 0;
  const hasC = matchedContacts.length > 0;
  const hasB = matchedBrain.length > 0;
  const srcCnt = [hasS, hasC, hasB].filter(Boolean).length;

  let cls;
  if (srcCnt === 3)      cls = 'FORTIFIED';
  else if (srcCnt === 2) cls = 'CAPABLE';
  else if (srcCnt === 1) cls = 'STAFFED';
  else                   cls = 'BLIND';

  return { cls, matchedScenarios, matchedContacts, matchedBrain };
}

export function isSscbrmQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes('sscbrm') ||
    s.includes('skill readiness') ||
    s.includes('capability readiness') ||
    s.includes('skill brain') ||
    s.includes('blind skill') ||
    s.includes('skill scenario') ||
    s.includes('capability intelligence') ||
    s.includes('skill coverage') ||
    s.includes('capability map') ||
    s.includes('skill contact') ||
    s.includes('unanchored skill') ||
    s.includes('skill grounding')
  );
}

export function buildSscbrmScript(counts) {
  return `Analyse the JARVIS Skill Scenario Contact Brain Capability Readiness Intelligence Map.
Total skills: ${counts.total}. Fortified: ${counts.fortified}. Capable: ${counts.capable}. Staffed: ${counts.staffed}. Blind: ${counts.blind}.
Focus on the ${counts.blind} blind capability gaps — skills with no matching scenario playbook, no contact owner, and no brain model grounding.
Identify the highest-priority blind skills and propose concrete grounding actions: map each to a relevant scenario, assign a contact sponsor, or add a brain model node.`;
}

export default function SkillScenarioContactBrainReadiness() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [scenarios, setScenarios]   = useState([]);
  const [contacts, setContacts]     = useState([]);
  const [brainNodes, setBrainNodes] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing]   = useState(false);
  const timerRef                    = useRef(null);

  const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [skRes, scRes, cRes, bRes] = await Promise.all([
        fetch(`${API}/v1/aip/skill`,          { headers: hdrs }),
        fetch(`${API}/v1/scenario/list`,      { headers: hdrs }),
        fetch(`${API}/entities/Contact`,      { headers: hdrs }),
        fetch(`${API}/v1/cinematic/brain`,    { headers: hdrs }),
      ]);
      const [skRaw, scRaw, cRaw, bRaw] = await Promise.all([
        skRes.ok ? skRes.json() : [],
        scRes.ok ? scRes.json() : [],
        cRes.ok  ? cRes.json()  : [],
        bRes.ok  ? bRes.json()  : {},
      ]);
      const skills   = normalizeSkills(skRaw);
      const scens    = normalizeScenarios(scRaw);
      const ctcts    = normalizeContacts(cRaw);
      const bnodes   = normalizeBrainNodes(bRaw);
      setScenarios(scens); setContacts(ctcts); setBrainNodes(bnodes);
      setRows(skills.map(s => ({ skill: s, ...classify(s, scens, ctcts, bnodes) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:sscbrm-toggle', toggle);
    return () => window.removeEventListener('jarvis:sscbrm-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    const blind = rows.filter(r => r.cls === 'BLIND').length;
    const script = buildSscbrmScript({
      total:     rows.length,
      fortified: rows.filter(r => r.cls === 'FORTIFIED').length,
      capable:   rows.filter(r => r.cls === 'CAPABLE').length,
      staffed:   rows.filter(r => r.cls === 'STAFFED').length,
      blind,
    });
    setAssessing(true); setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: script }),
      });
      const j = await res.json();
      const txt = j?.response || j?.message || j?.content || JSON.stringify(j);
      setAssessment(txt);
      if (window.__jarvisTTS) window.__jarvisTTS(txt.slice(0, 300));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = {
    total:     rows.length,
    fortified: rows.filter(r => r.cls === 'FORTIFIED').length,
    capable:   rows.filter(r => r.cls === 'CAPABLE').length,
    staffed:   rows.filter(r => r.cls === 'STAFFED').length,
    blind:     rows.filter(r => r.cls === 'BLIND').length,
  };
  const blindPulse = counts.blind > 0;

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || skillLabel(r.skill).toLowerCase().includes(search.toLowerCase()))
  );

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const TILE = (label, val, color) => (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 10px', minWidth: 70, textAlign: 'center' }}>
      <div style={{ color, fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>{val}</div>
      <div style={{ color: '#64748B', fontSize: 9, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 8, left: 179400, zIndex: 331,
          background: open ? 'rgba(249,115,22,0.25)' : 'rgba(249,115,22,0.08)',
          border: `1px solid ${open ? '#F97316' : 'rgba(249,115,22,0.3)'}`,
          color: '#F97316', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ SSCBRM
        {blindPulse && (
          <span style={{
            marginLeft: 5, background: '#F97316', color: '#fff', borderRadius: 9,
            padding: '1px 5px', fontSize: 9, fontWeight: 700,
            animation: 'pulse 1.5s infinite',
          }}>
            {counts.blind}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 36, left: 0, right: 0, margin: '0 auto',
          width: 760, maxHeight: '70vh', zIndex: 10331,
          background: 'rgba(10,14,22,0.97)', border: '1px solid rgba(249,115,22,0.3)',
          borderRadius: 10, display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 40px rgba(249,115,22,0.15)',
          fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(249,115,22,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#F97316', fontSize: 13, fontWeight: 700 }}>◈ SKILL CAPABILITY READINESS MAP</span>
              <span style={{ color: '#64748B', fontSize: 10, marginLeft: 8 }}>F235 · /v1/aip/skill + /v1/scenario/list + /entities/Contact + /v1/cinematic/brain</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: '8px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(249,115,22,0.1)' }}>
            {TILE('SKILLS',     counts.total,     '#94A3B8')}
            {TILE('SCENARIOS',  scenarios.length, '#818CF8')}
            {TILE('CONTACTS',   contacts.length,  '#38BDF8')}
            {TILE('BRAIN',      brainNodes.length,'#A78BFA')}
            {TILE('FORTIFIED',  counts.fortified, '#22C55E')}
            {TILE('CAPABLE',    counts.capable,   '#38BDF8')}
            {TILE('STAFFED',    counts.staffed,   '#F59E0B')}
            {TILE('BLIND',      counts.blind,     '#F97316')}
          </div>

          {/* Filter tabs + search */}
          <div style={{ padding: '6px 14px', display: 'flex', gap: 6, alignItems: 'center', borderBottom: '1px solid rgba(249,115,22,0.1)', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(249,115,22,0.2)' : 'transparent',
                  border: `1px solid ${tab === t ? '#F97316' : 'rgba(255,255,255,0.1)'}`,
                  color: tab === t ? '#F97316' : '#64748B',
                  padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search skills…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)', color: '#CBD5E1',
                padding: '2px 8px', fontSize: 10, borderRadius: 4, width: 160,
              }}
            />
          </div>

          {/* Row list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
            {loading && <div style={{ color: '#64748B', fontSize: 11, padding: 12 }}>Loading…</div>}
            {error   && <div style={{ color: '#EF4444', fontSize: 11, padding: 12 }}>Error: {error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: '#64748B', fontSize: 11, padding: 12 }}>No skills match this filter.</div>
            )}
            {visible.map((row, i) => {
              const id     = row.skill?.id || row.skill?.name || i;
              const isOpen = !!expanded[id];
              const color  = CLS_COLOR[row.cls];
              const score  = row.skill?.score ?? row.skill?.level ?? row.skill?.rating;
              return (
                <div key={id} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => toggleRow(id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                      padding: '5px 8px', borderRadius: 5,
                      background: isOpen ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border: `1px solid ${isOpen ? 'rgba(249,115,22,0.2)' : 'transparent'}`,
                    }}
                  >
                    <span style={{ color, fontSize: 9, minWidth: 76, fontWeight: 700 }}>{row.cls}</span>
                    <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {skillLabel(row.skill)}
                    </span>
                    {score != null && (
                      <span style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', color: '#A78BFA', padding: '1px 6px', fontSize: 9, borderRadius: 3 }}>
                        {typeof score === 'number' ? score.toFixed(1) : score}
                      </span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 5, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {row.matchedScenarios.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>SCENARIOS ({row.matchedScenarios.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedScenarios.slice(0, 6).map((sc, si) => (
                              <span key={si} style={{ background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', color: '#818CF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {sc?.name || sc?.title || sc?.id || '—'}
                                {sc?.status ? ` · ${sc.status}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>CONTACTS ({row.matchedContacts.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedContacts.slice(0, 6).map((c, ci) => (
                              <span key={ci} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {c?.name || c?.full_name || c?.email || '—'}
                                {(c?.role || c?.organisation || c?.org) ? ` · ${c.role || c.organisation || c.org}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedBrain.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>BRAIN NODES ({row.matchedBrain.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedBrain.slice(0, 6).map((n, ni) => (
                              <span key={ni} style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', color: '#A78BFA', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {n?.label || n?.name || n?.id || '—'}
                                {n?.type ? ` · ${n.type}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedScenarios.length === 0 && row.matchedContacts.length === 0 && row.matchedBrain.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No matched sources — unanchored capability blind spot.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS button + result */}
          <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(249,115,22,0.1)' }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.2)',
                border: '1px solid rgba(249,115,22,0.4)', color: '#F97316',
                padding: '4px 14px', fontSize: 10, cursor: assessing ? 'not-allowed' : 'pointer',
                borderRadius: 4,
              }}
            >
              {assessing ? '▶ ASSESSING…' : '▶ ASSESS BLIND SKILLS'}
            </button>
            {assessment && (
              <div style={{ marginTop: 6, color: '#CBD5E1', fontSize: 10, lineHeight: 1.5, maxHeight: 80, overflowY: 'auto' }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
