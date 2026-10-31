/**
 * GraphIntelProfileInvestmentScenarioNetwork — F232
 *
 * Fetches /v1/graph/centrality + /entities/IntelProfile +
 *         /entities/Investment + /v1/scenario/list
 *
 * Keyword-matches each graph centrality node (label/type/community) against
 * intel profile names/categories/descriptions, investment names/types/sectors,
 * and scenario names/descriptions/objectives to classify:
 *
 *   STRATEGIC  — matched all 3 sources (intel profile + investment + scenario)
 *                (full strategic coverage: grounded in intelligence, wealth, and a playbook)
 *   NETWORKED  — matched 2 of 3 sources
 *                (partially grounded node with strategic potential)
 *   VISIBLE    — matched 1 source only
 *                (some grounding but operationally isolated)
 *   BLIND      — no match to any source
 *                (blind-spot node: zero intel, wealth, or scenario grounding)
 *
 * Toggle: ◈ GIISN button (fixed, bottom strip) left:177720, zIndex:328
 * Stat tiles: nodes / profiles / investments / scenarios /
 *             strategic / networked / visible / blind
 * Amber pulse on BLIND count (blind-spot nodes).
 * Expandable rows: matched intel profiles with category badge +
 *                  matched investments with type/value badge +
 *                  matched scenarios with status badge.
 * Filter tabs: ALL / STRATEGIC / NETWORKED / VISIBLE / BLIND + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "giisn"/"graph intel investment"/"strategic network"/"graph strategy"/
 *        "intel network"/"investment network"/"scenario network"/
 *        "strategic coverage"/"network blind spot"/"graph blind"
 * Event: jarvis:giisn-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'STRATEGIC', 'NETWORKED', 'VISIBLE', 'BLIND'];

const CLS_COLOR = {
  STRATEGIC: '#00E5A0',
  NETWORKED: '#38BDF8',
  VISIBLE:   '#A78BFA',
  BLIND:     '#F59E0B',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeNodes(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.nodes))       return raw.nodes;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeProfiles(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.profiles))    return raw.profiles;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeInvestments(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.investments)) return raw.investments;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.scenarios))   return raw.scenarios;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function nodeLabel(node) {
  return node?.label || node?.name || node?.title || node?.id || 'Untitled';
}

function nodeText(node) {
  return [node?.label, node?.name, node?.title, node?.type, node?.community,
          node?.description, node?.tags?.join?.(' ')].join(' ');
}

function classify(node, profiles, investments, scenarios) {
  const ntoks = tokens(nodeText(node));

  const matchedProfiles = profiles.filter(p =>
    overlaps(ntoks, [p?.name, p?.full_name, p?.category, p?.type, p?.description,
                     p?.summary, p?.tags?.join?.(' ')].join(' '))
  );
  const matchedInvestments = investments.filter(inv =>
    overlaps(ntoks, [inv?.name, inv?.title, inv?.type, inv?.sector, inv?.description,
                     inv?.asset_class, inv?.tags?.join?.(' ')].join(' '))
  );
  const matchedScenarios = scenarios.filter(sc =>
    overlaps(ntoks, [sc?.name, sc?.title, sc?.description, sc?.objective,
                     sc?.tags?.join?.(' ')].join(' '))
  );

  const srcCount = [
    matchedProfiles.length > 0,
    matchedInvestments.length > 0,
    matchedScenarios.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (srcCount === 3)      cls = 'STRATEGIC';
  else if (srcCount === 2) cls = 'NETWORKED';
  else if (srcCount === 1) cls = 'VISIBLE';
  else                     cls = 'BLIND';

  return { cls, matchedProfiles, matchedInvestments, matchedScenarios };
}

/* ─── exported query helpers ─── */
export function isGiisnQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'giisn', 'graph intel investment', 'strategic network', 'graph strategy',
    'intel network', 'investment network', 'scenario network',
    'strategic coverage', 'network blind spot', 'graph blind',
  ].some(k => s.includes(k));
}

export function buildGiisnScript() {
  return (
    'Fetch /v1/graph/centrality, /entities/IntelProfile, /entities/Investment, and /v1/scenario/list. ' +
    'Keyword-match each graph centrality node (label/type/community) against ' +
    'intel profile names/categories/descriptions, investment names/types/sectors, ' +
    'and scenario names/descriptions/objectives. ' +
    'Classify each node as STRATEGIC (matches intel profile + investment + scenario — ' +
    'full strategic coverage: grounded in intelligence, wealth, and a playbook), ' +
    'NETWORKED (matches 2 of 3 sources — partially grounded with strategic potential), ' +
    'VISIBLE (matches 1 source only — some grounding but operationally isolated), ' +
    'or BLIND (no match to any source — blind-spot node with zero intel, wealth, or scenario grounding). ' +
    'Report the total BLIND count, identify which blind-spot nodes represent the highest ' +
    'strategic risk (e.g. high-centrality nodes, key network hubs, or critical infrastructure), ' +
    'and recommend which intel profiles should be linked to them, ' +
    'which investments should be associated, ' +
    'and which scenarios should incorporate them.'
  );
}

/* ─── component ─── */
export default function GraphIntelProfileInvestmentScenarioNetwork() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing]   = useState(false);
  const timerRef                    = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const [rGraph, rProf, rInv, rSc] = await Promise.all([
        fetch(`${API}/v1/graph/centrality`, { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/entities/IntelProfile`, { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/entities/Investment`,   { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/scenario/list`,      { headers: h }).then(r => r.ok ? r.json() : null),
      ]);

      const nodes       = normalizeNodes(rGraph);
      const profiles    = normalizeProfiles(rProf);
      const investments = normalizeInvestments(rInv);
      const scenarios   = normalizeScenarios(rSc);

      const classified = nodes.map(node => ({
        node,
        ...classify(node, profiles, investments, scenarios),
      }));

      setRows(classified);
    } catch (_) {
      // network error — leave existing rows
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:giisn-toggle', handler);
    return () => window.removeEventListener('jarvis:giisn-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { STRATEGIC: 0, NETWORKED: 0, VISIBLE: 0, BLIND: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return nodeLabel(r.node).toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const script = buildGiisnScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const txt = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(txt);
      if (txt) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ text: txt.slice(0, 400) }),
          });
        } catch (_) {}
      }
    } catch (_) {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const blindPulse = counts.BLIND > 0;

  const btnStyle = {
    position: 'fixed',
    bottom: 8,
    left: 177720,
    zIndex: 328,
    background: blindPulse ? 'rgba(245,158,11,0.18)' : 'rgba(30,41,59,0.85)',
    border: `1px solid ${blindPulse ? '#F59E0B' : 'rgba(100,116,139,0.5)'}`,
    color: blindPulse ? '#F59E0B' : '#94A3B8',
    padding: '3px 9px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
    borderRadius: 4,
    letterSpacing: '0.05em',
    animation: blindPulse ? 'jarvis-pulse-amber 1.6s infinite' : 'none',
  };

  const panelStyle = {
    position: 'fixed',
    bottom: 36,
    right: 18,
    width: 700,
    maxHeight: '78vh',
    overflowY: 'auto',
    background: 'rgba(10,14,26,0.97)',
    border: '1px solid rgba(245,158,11,0.35)',
    borderRadius: 8,
    zIndex: 3280,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#CBD5E1',
    boxShadow: '0 0 32px rgba(245,158,11,0.12)',
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(o => !o)} title="Graph × IntelProfile × Investment × Scenario Strategic Intelligence Network">
        ◈ GIISN{counts.BLIND > 0 ? ` [${counts.BLIND}]` : ''}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(245,158,11,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#F59E0B', fontWeight: 700, fontSize: 12 }}>
              ◈ GRAPH × INTEL PROFILE × INVESTMENT × SCENARIO
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {loading && <span style={{ color: '#64748B', fontSize: 10 }}>loading…</span>}
              <button onClick={load} style={{ background: 'none', border: '1px solid #334155', color: '#94A3B8', padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3 }}>↻</button>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px', borderBottom: '1px solid rgba(245,158,11,0.1)' }}>
            {[
              { label: 'GRAPH NODES', val: rows.length,         color: '#94A3B8' },
              { label: 'STRATEGIC',   val: counts.STRATEGIC,    color: CLS_COLOR.STRATEGIC },
              { label: 'NETWORKED',   val: counts.NETWORKED,    color: CLS_COLOR.NETWORKED },
              { label: 'VISIBLE',     val: counts.VISIBLE,      color: CLS_COLOR.VISIBLE },
              { label: 'BLIND',       val: counts.BLIND,        color: CLS_COLOR.BLIND },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 88, textAlign: 'center' }}>
                <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#64748B', fontSize: 9, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: 'flex', gap: 0, padding: '6px 14px 0', borderBottom: '1px solid rgba(245,158,11,0.1)', flexWrap: 'wrap', alignItems: 'center' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(245,158,11,0.18)' : 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid #F59E0B' : '2px solid transparent',
                color: tab === t ? '#F59E0B' : '#64748B',
                padding: '5px 12px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search graph nodes…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', color: '#CBD5E1', padding: '3px 8px', fontSize: 10, borderRadius: 3, fontFamily: 'monospace', width: 180 }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: '6px 0' }}>
            {visible.length === 0 && (
              <div style={{ color: '#475569', fontSize: 11, padding: '16px 14px', textAlign: 'center' }}>
                {loading ? 'Loading…' : 'No graph nodes match this filter.'}
              </div>
            )}
            {visible.map((item, idx) => {
              const { node, cls, matchedProfiles, matchedInvestments, matchedScenarios } = item;
              const isExpanded = expanded[idx];
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    <span style={{ color: CLS_COLOR[cls], fontSize: 9, fontWeight: 700, minWidth: 90, letterSpacing: '0.04em' }}>{cls}</span>
                    <span style={{ flex: 1, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nodeLabel(node)}</span>
                    {node?.centrality != null && (
                      <span style={{ color: '#64748B', fontSize: 9, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 2 }}>
                        {typeof node.centrality === 'number' ? node.centrality.toFixed(3) : node.centrality}
                      </span>
                    )}
                    {node?.type && (
                      <span style={{ color: '#475569', fontSize: 9, background: 'rgba(255,255,255,0.03)', padding: '1px 5px', borderRadius: 2 }}>{node.type}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 9 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px 14px 10px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* intel profiles */}
                      {matchedProfiles.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>INTEL PROFILES ({matchedProfiles.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedProfiles.slice(0, 6).map((p, i) => (
                              <span key={i} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {p?.name || p?.full_name || p?.id || '—'} · {p?.category || p?.type || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* investments */}
                      {matchedInvestments.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>INVESTMENTS ({matchedInvestments.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedInvestments.slice(0, 6).map((inv, i) => (
                              <span key={i} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {inv?.name || inv?.title || inv?.id || '—'} · {inv?.type || inv?.asset_class || '?'}{inv?.value != null ? ` · ${inv.value}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* scenarios */}
                      {matchedScenarios.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>SCENARIOS ({matchedScenarios.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedScenarios.slice(0, 6).map((sc, i) => (
                              <span key={i} style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', color: '#A78BFA', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {sc?.name || sc?.title || sc?.id || '—'} · {sc?.status || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {matchedProfiles.length === 0 && matchedInvestments.length === 0 && matchedScenarios.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No source matches — strategic blind spot.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS footer */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(245,158,11,0.2)' }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.2)',
                border: '1px solid #F59E0B', color: '#F59E0B',
                padding: '5px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
                borderRadius: 4, fontFamily: 'monospace',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS BLIND GRAPH NODES'}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5,
                background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '8px 10px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
