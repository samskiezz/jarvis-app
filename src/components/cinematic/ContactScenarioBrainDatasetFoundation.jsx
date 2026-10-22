/**
 * ContactScenarioBrainDatasetFoundation — F119
 *
 * Fetches /entities/Contact + /v1/scenario/list + /v1/cinematic/brain + /v1/datasets.
 *
 * Keyword-matches each contact (name/role/org/dept/tags) against
 * scenario names/descriptions, brain node labels/types, and dataset names/descriptions
 * to classify:
 *
 *   ANCHORED — contact matches scenario AND brain AND dataset
 *              (fully grounded: operational mission presence across all three dimensions)
 *   SCENED   — contact matches 2 of the 3 sources
 *              (partial grounding — missing one mission layer)
 *   MODELED  — contact matches only 1 of the 3 sources
 *              (thin presence — referenced but not integrated)
 *   GHOST    — no match to any source
 *              (operational blind spot — contact with no scenario, no brain model, no dataset link)
 *
 * Toggle: ◈ CSBFND button (fixed, bottom strip) left:115000, zIndex:216
 * Stat tiles: contacts / scenarios / brain nodes / datasets / anchored / scened / modeled / ghost
 * Amber pulse on GHOST count (operational blind spots).
 * Expandable rows: matched scenarios with status badge +
 *                  matched brain nodes with centrality score badge +
 *                  matched datasets with row-count badge.
 * Filter tabs: ALL / ANCHORED / SCENED / MODELED / GHOST + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "csbfnd"/"contact scenario brain"/"contact mission foundation"/"contact brain dataset"
 *        "ghost contact"/"contact blind spot"/"contact grounding"/"contact intelligence foundation"
 *        "contact scene foundation"/"mission foundation"/"contact dataset scenario"
 *        "contact brain scenario"/"contact anchored"/"anchored contact"/"contact ghost"
 * Event: jarvis:csbfnd-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ANCHORED', 'SCENED', 'MODELED', 'GHOST'];

const CLS_COLOR = {
  ANCHORED: '#22C55E',
  SCENED:   '#3B82F6',
  MODELED:  '#F97316',
  GHOST:    '#F59E0B',
};

export function isCsbfndQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'csbfnd', 'contact scenario brain', 'contact mission foundation',
    'contact brain dataset', 'ghost contact', 'contact blind spot',
    'contact grounding', 'contact intelligence foundation',
    'contact scene foundation', 'mission foundation', 'contact dataset scenario',
    'contact brain scenario', 'contact anchored', 'anchored contact', 'contact ghost',
  ].some(kw => s.includes(kw));
}

export function buildCsbfndScript(q) {
  return `JARVIS contact mission intelligence foundation audit triggered by: "${q}". Fetch /entities/Contact + /v1/scenario/list + /v1/cinematic/brain + /v1/datasets. Classify each contact as ANCHORED/SCENED/MODELED/GHOST. Report the ghost count and top 3 operational blind spots.`;
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

function contactLabel(c) {
  return c.name || c.full_name || c.email || c.id || 'Unknown';
}

function contactTokens(c) {
  return tokens(
    `${c.name || ''} ${c.full_name || ''} ${c.role || ''} ${c.org || ''} ${c.organisation || ''} ${c.department || ''} ${c.dept || ''} ${(c.tags || []).join(' ')} ${c.bio || ''} ${c.description || ''}`
  );
}

function classifyContact(contact, scenarios, brainNodes, datasets) {
  const toks = contactTokens(contact);

  const mScenarios = scenarios.filter(s =>
    overlaps(toks, `${s.name || ''} ${s.title || ''} ${s.description || ''} ${s.category || ''} ${s.type || ''} ${s.objective || ''}`)
  );
  const mNodes = brainNodes.filter(n =>
    overlaps(toks, `${n.label || ''} ${n.name || ''} ${n.id || ''} ${n.type || ''} ${n.category || ''}`)
  );
  const mDatasets = datasets.filter(d =>
    overlaps(toks, `${d.name || ''} ${d.title || ''} ${d.description || ''} ${d.category || ''} ${d.type || ''} ${d.source || ''}`)
  );

  const matchCount =
    (mScenarios.length > 0 ? 1 : 0) +
    (mNodes.length > 0 ? 1 : 0) +
    (mDatasets.length > 0 ? 1 : 0);

  let cls;
  if (matchCount === 3) cls = 'ANCHORED';
  else if (matchCount === 2) cls = 'SCENED';
  else if (matchCount === 1) cls = 'MODELED';
  else cls = 'GHOST';

  return { contact, cls, mScenarios, mNodes, mDatasets };
}

export default function ContactScenarioBrainDatasetFoundation() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [contactsRaw, scenariosRaw, brainRaw, datasetsRaw] = await Promise.all([
        fetcher('/entities/Contact'),
        fetcher('/v1/scenario/list'),
        fetcher('/v1/cinematic/brain'),
        fetcher('/v1/datasets'),
      ]);

      const contacts   = normalizeArray(contactsRaw,  ['contacts', 'data', 'items', 'results']);
      const scenarios  = normalizeArray(scenariosRaw, ['scenarios', 'data', 'items', 'results']);
      const brainNodes = normalizeArray(
        brainRaw,
        ['nodes', 'centrality', 'data', 'items', 'results']
      );
      const datasets   = normalizeArray(datasetsRaw,  ['datasets', 'data', 'items', 'results']);

      setRows(contacts.map(c => classifyContact(c, scenarios, brainNodes, datasets)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:csbfnd-toggle', handler);
    return () => window.removeEventListener('jarvis:csbfnd-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    ANCHORED: rows.filter(r => r.cls === 'ANCHORED').length,
    SCENED:   rows.filter(r => r.cls === 'SCENED').length,
    MODELED:  rows.filter(r => r.cls === 'MODELED').length,
    GHOST:    rows.filter(r => r.cls === 'GHOST').length,
  };

  const scenarioCount = rows.reduce((n, r) => n + r.mScenarios.length, 0);
  const nodeCount     = rows.reduce((n, r) => n + r.mNodes.length,     0);
  const datasetCount  = rows.reduce((n, r) => n + r.mDatasets.length,  0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return contactLabel(r.contact).toLowerCase().includes(s) ||
             (r.contact.role || r.contact.org || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Contacts: ${rows.length}. Anchored: ${counts.ANCHORED}. Scened: ${counts.SCENED}. Modeled: ${counts.MODELED}. Ghost: ${counts.GHOST}.`;
    const prompt = `JARVIS contact mission intelligence foundation audit: ${summary}. Identify the most critical ghost contacts — those with no scenario, no brain model, and no dataset grounding — operational blind spots in the mission network. Provide a 2-sentence advisory on the deepest coverage gaps and priority actions to integrate isolated contacts into the intelligence foundation.`;
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
          position: 'fixed', bottom: 8, left: 115000, zIndex: 216,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #F59E0B55',
          color: '#F59E0B', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ CSBFND</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 216, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #F59E0B33', flexShrink: 0 }}>
        <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ CSBFND</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Contact × Scenario × Brain × Dataset — Mission Intelligence Foundation</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #F59E0B55', color: '#F59E0B', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'CONTACTS',  val: rows.length,       color: '#94a3b8' },
          { label: 'SCENARIOS', val: scenarioCount,     color: '#818cf8' },
          { label: 'BRAIN NODES',val: nodeCount,        color: '#a78bfa' },
          { label: 'DATASETS',  val: datasetCount,      color: '#fbbf24' },
          { label: 'ANCHORED',  val: counts.ANCHORED,   color: CLS_COLOR.ANCHORED },
          { label: 'SCENED',    val: counts.SCENED,     color: CLS_COLOR.SCENED },
          { label: 'MODELED',   val: counts.MODELED,    color: CLS_COLOR.MODELED },
          { label: 'GHOST',     val: counts.GHOST,      color: CLS_COLOR.GHOST, pulse: counts.GHOST > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'csbfnd-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B44', borderRadius: 5, fontSize: 11, color: '#fde68a', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#F59E0B22' : 'none',
            border: `1px solid ${tab === t ? '#F59E0B' : '#1e293b'}`,
            color: tab === t ? '#F59E0B' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 180 }}
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
                  {contactLabel(r.contact)}
                </span>
                {(r.contact.role || r.contact.org) && (
                  <span style={{ background: '#071420', border: '1px solid #0e4d6b', color: '#7dd3fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.contact.role}{r.contact.role && r.contact.org ? ' · ' : ''}{r.contact.org}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mScenarios.length > 0 && (
                    <div>
                      <div style={{ color: '#818cf8', fontSize: 10, marginBottom: 3 }}>SCENARIOS ({r.mScenarios.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mScenarios.slice(0, 8).map((s, k) => (
                          <span key={k} style={{ background: '#0c0e20', border: '1px solid #312e81', color: '#818cf8', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {s.name || s.title || s.id}
                            {s.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{s.status}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({r.mNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mNodes.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#0e0720', border: '1px solid #4c1d95', color: '#a78bfa', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {n.centrality != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(+n.centrality).toFixed(3)}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mDatasets.length > 0 && (
                    <div>
                      <div style={{ color: '#fbbf24', fontSize: 10, marginBottom: 3 }}>DATASETS ({r.mDatasets.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mDatasets.slice(0, 8).map((d, k) => (
                          <span key={k} style={{ background: '#1a1000', border: '1px solid #78350f', color: '#fbbf24', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {d.name || d.title || d.id}
                            {d.row_count != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{d.row_count.toLocaleString()} rows]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mScenarios.length === 0 && r.mNodes.length === 0 && r.mDatasets.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No scenario, brain, or dataset match — operational blind spot with zero mission grounding.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes csbfnd-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
