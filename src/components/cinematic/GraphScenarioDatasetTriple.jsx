/**
 * F281 — Graph Centrality × Scenario × Dataset Triple (GCSD)
 *
 * Answers: "For each top-centrality graph node, do we have a scenario
 * response plan AND a dataset covering it — or are our most influential
 * nodes blind spots in both planning and data?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/graph/centrality   → top-centrality graph nodes
 *   GET /v1/scenario/list      → available response scenarios
 *   GET /v1/datasets           → dataset catalog
 *
 * Classification per node:
 *   FULL_COVERAGE   — ≥1 scenario match AND ≥1 dataset match
 *   SCENARIO_ONLY   — scenario match, no dataset
 *   DATA_ONLY       — dataset match, no scenario
 *   DARK            — no scenario, no dataset (highest blind-spot risk)
 *
 * Stat tiles:  nodes / scenarios / datasets / dark
 * Amber badge: dark count on button (most influential blind-spot nodes)
 * Expand row:  matched scenarios (type badge + score bar) +
 *              matched datasets (category badge + score bar)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat +
 *             jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ GCSD  at left:6600 bottom:18, zIndex:68
 * Event:   jarvis:gcsd-toggle
 * Voice:   "graph scenario dataset / gcsd / dark nodes / node coverage /
 *           scenario node / node dataset / graph node coverage /
 *           which nodes have scenarios / graph coverage triple /
 *           centrality scenario / centrality dataset"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

// ─── palette ─────────────────────────────────────────────────────────────────
const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const AM   = '#F59E0B';
const CY   = '#06B6D4';
const GR   = '#10B981';
const RD   = '#EF4444';
const PU   = '#A855F7';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS = ['ALL', 'FULL_COVERAGE', 'SCENARIO_ONLY', 'DATA_ONLY', 'DARK'];
const CLASS_COLOR = {
  FULL_COVERAGE:  GR,
  SCENARIO_ONLY:  CY,
  DATA_ONLY:      PU,
  DARK:           RD,
};
const CLASS_LABEL = {
  FULL_COVERAGE:  'FULL',
  SCENARIO_ONLY:  'SCN',
  DATA_ONLY:      'DATA',
  DARK:           'DARK',
};

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const GCSD_RE =
  /\b(graph[._-]?scenario[._-]?dataset|gcsd|dark[._-]?nodes?|node[._-]?coverage|scenario[._-]?node|node[._-]?dataset|graph[._-]?node[._-]?coverage|which[._-]?nodes?[._-]?have[._-]?scenarios?|graph[._-]?coverage[._-]?triple|centrality[._-]?scenario|centrality[._-]?dataset)\b/i;

export function isGcsdQuery(t) {
  return GCSD_RE.test(t || '');
}

// ─── normalizers ─────────────────────────────────────────────────────────────
function normNodes(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.nodes ?? raw?.centrality ?? raw?.data ?? raw?.items ?? []);
  return arr.map(n => ({
    id:         n.id ?? n._id ?? String(Math.random()),
    label:      n.label ?? n.name ?? n.id ?? '(node)',
    type:       n.type ?? n.category ?? '',
    centrality: Number(n.centrality ?? n.score ?? n.weight ?? 0),
    tags:       [n.id, n.label, n.name, n.type, n.category]
                 .filter(Boolean).join(' ').toLowerCase(),
  }));
}

function normScenarios(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.scenarios ?? raw?.items ?? raw?.data ?? []);
  return arr.map(s => ({
    id:   s.id ?? s._id ?? String(Math.random()),
    name: s.name ?? s.title ?? '(scenario)',
    type: s.type ?? s.category ?? '',
    tags: [s.name, s.title, s.description, s.type, s.tags]
           .flat().filter(Boolean).join(' ').toLowerCase(),
  }));
}

function normDatasets(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.datasets ?? raw?.items ?? raw?.data ?? []);
  return arr.map(d => ({
    id:       d.id ?? d._id ?? String(Math.random()),
    name:     d.name ?? d.title ?? '(dataset)',
    category: d.category ?? d.type ?? '',
    tags:     [d.name, d.title, d.description, d.category, d.tags]
               .flat().filter(Boolean).join(' ').toLowerCase(),
  }));
}

function keywords(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function relevance(nodeTags, targetTags) {
  const nk = keywords(nodeTags);
  const tk = keywords(targetTags);
  return nk.filter(w => tk.includes(w)).length;
}

function enrich(nodes, scenarios, datasets) {
  return nodes.map(n => {
    const matchedScn = scenarios
      .map(s => ({ ...s, _score: relevance(n.tags, s.tags) }))
      .filter(s => s._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const matchedDst = datasets
      .map(d => ({ ...d, _score: relevance(n.tags, d.tags) }))
      .filter(d => d._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const hasScn = matchedScn.length > 0;
    const hasDst = matchedDst.length > 0;
    const cls =
      hasScn && hasDst ? 'FULL_COVERAGE' :
      hasScn            ? 'SCENARIO_ONLY' :
      hasDst            ? 'DATA_ONLY'     : 'DARK';

    return { ...n, _scenarios: matchedScn, _datasets: matchedDst, _class: cls };
  });
}

export async function buildGcsdScript() {
  const [nodeR, scnR, dstR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);

  const nodes     = normNodes(nodeR.status     === 'fulfilled' ? nodeR.value     : []);
  const scenarios = normScenarios(scnR.status  === 'fulfilled' ? scnR.value      : []);
  const datasets  = normDatasets(dstR.status   === 'fulfilled' ? dstR.value      : []);
  const rows      = enrich(nodes, scenarios, datasets);

  const full = rows.filter(r => r._class === 'FULL_COVERAGE').length;
  const scn  = rows.filter(r => r._class === 'SCENARIO_ONLY').length;
  const dst  = rows.filter(r => r._class === 'DATA_ONLY').length;
  const dark = rows.filter(r => r._class === 'DARK').length;

  try {
    const body = {
      message:
        `Graph Centrality × Scenario × Dataset: ${nodes.length} top-centrality nodes analysed ` +
        `against ${scenarios.length} scenarios and ${datasets.length} datasets. ` +
        `Coverage: ${full} full, ${scn} scenario-only, ${dst} data-only, ${dark} DARK (no coverage). ` +
        `In 2 sentences, assess the intelligence coverage risk for the dark nodes and ` +
        `recommend the most urgent planning or data-acquisition action.`,
    };
    const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    return d.response ?? d.message ?? d.text ??
      `${dark} of ${nodes.length} influential graph nodes are blind spots — no scenario or dataset covers them.`;
  } catch {
    return `${nodes.length} nodes: ${full} fully covered, ${dark} dark — critical planning gaps.`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────
export default function GraphScenarioDatasetTriple() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [rows,      setRows]      = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [datasets,  setDatasets]  = useState([]);
  const [filter,    setFilter]    = useState('ALL');
  const [search,    setSearch]    = useState('');
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [nodeR, scnR, dstR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
      ]);
      const nodes     = normNodes(nodeR.status    === 'fulfilled' ? nodeR.value    : []);
      const scns      = normScenarios(scnR.status === 'fulfilled' ? scnR.value     : []);
      const dsts      = normDatasets(dstR.status  === 'fulfilled' ? dstR.value     : []);
      setScenarios(scns);
      setDatasets(dsts);
      setRows(enrich(nodes, scns, dsts));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:gcsd-toggle', onToggle);
    return () => window.removeEventListener('jarvis:gcsd-toggle', onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setBrief('');
    const script = await buildGcsdScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
  };

  const dark = rows.filter(r => r._class === 'DARK').length;
  const full = rows.filter(r => r._class === 'FULL_COVERAGE').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r._class !== filter) return false;
    if (search && !r.label.toLowerCase().includes(search.toLowerCase()) &&
        !r.type.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Centrality × Scenario × Dataset Triple (GCSD)"
        style={{
          position: 'fixed', left: 6600, bottom: 18, zIndex: 68,
          background: 'rgba(10,12,20,0.85)',
          border: `1px solid ${dark > 0 ? AM : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 6, color: '#CBD5E1', fontFamily: MONO, fontSize: 10,
          padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          transition: 'border-color .2s',
        }}
      >
        ◈ GCSD
        {dark > 0 && (
          <span style={{
            background: AM, color: '#000', borderRadius: 10,
            fontSize: 9, fontWeight: 700, padding: '1px 5px',
          }}>{dark}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      width: 680, maxHeight: '75vh', zIndex: 9000,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      fontFamily: MONO,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: AM, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
          ◈ GRAPH × SCENARIO × DATASET TRIPLE
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{ background: 'none', border: `1px solid ${AM}`, borderRadius: 4, color: AM, fontFamily: MONO, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>
            {assessing ? '…' : '▶ ASSESS'}
          </button>
          <button onClick={load} disabled={loading} style={{ background: 'none', border: `1px solid ${MU}`, borderRadius: 4, color: MU, fontFamily: MONO, fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>
            {loading ? '…' : '↺'}
          </button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, fontFamily: MONO, fontSize: 13, cursor: 'pointer' }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${BD}` }}>
        {[
          { label: 'NODES',     value: rows.length,     color: CY },
          { label: 'SCENARIOS', value: scenarios.length, color: '#94A3B8' },
          { label: 'DATASETS',  value: datasets.length,  color: PU },
          { label: 'DARK',      value: dark,             color: dark > 0 ? RD : MU },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ color, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: MU, fontSize: 9, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 14px 10px', borderBottom: `1px solid ${BD}` }}>
        <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
          {(['FULL_COVERAGE','SCENARIO_ONLY','DATA_ONLY','DARK']).map(cls => {
            const count = rows.filter(r => r._class === cls).length;
            const pct   = rows.length ? (count / rows.length) * 100 : 0;
            return pct > 0 ? (
              <div key={cls} title={`${cls}: ${count}`} style={{ width: `${pct}%`, background: CLASS_COLOR[cls], transition: 'width .4s' }} />
            ) : null;
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          {(['FULL_COVERAGE','SCENARIO_ONLY','DATA_ONLY','DARK']).map(cls => {
            const count = rows.filter(r => r._class === cls).length;
            return count > 0 ? (
              <span key={cls} style={{ color: CLASS_COLOR[cls], fontSize: 9 }}>
                {CLASS_LABEL[cls]}: {count}
              </span>
            ) : null;
          })}
        </div>
      </div>

      {/* Brief */}
      {brief && (
        <div style={{ padding: '8px 14px', background: 'rgba(245,158,11,0.07)', borderBottom: `1px solid ${BD}`, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5 }}>
          {brief}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '6px 14px', background: 'rgba(239,68,68,0.08)', color: RD, fontSize: 10 }}>{error}</div>
      )}

      {/* Filter + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: `1px solid ${BD}`, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? AM : 'none',
            border: `1px solid ${filter === f ? AM : BD}`,
            borderRadius: 4, color: filter === f ? '#000' : MU,
            fontFamily: MONO, fontSize: 9, padding: '2px 7px', cursor: 'pointer',
          }}>{f === 'FULL_COVERAGE' ? 'FULL' : f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, borderRadius: 4, color: '#CBD5E1', fontFamily: MONO, fontSize: 10, padding: '2px 8px', width: 110, outline: 'none' }}
        />
      </div>

      {/* Node rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 14px' }}>
        {loading && rows.length === 0 && (
          <div style={{ color: MU, fontSize: 11, textAlign: 'center', paddingTop: 20 }}>Loading…</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: MU, fontSize: 11, textAlign: 'center', paddingTop: 20 }}>No nodes match filter.</div>
        )}
        {visible.map(n => {
          const clsColor = CLASS_COLOR[n._class] ?? MU;
          const clsLabel = CLASS_LABEL[n._class] ?? n._class;
          const isEx = expanded[n.id];
          return (
            <div key={n.id} style={{ marginBottom: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: `1px solid ${BD}` }}>
              <div
                onClick={() => setExpanded(p => ({ ...p, [n.id]: !p[n.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                {n.type && (
                  <span style={{ background: 'rgba(100,116,139,0.2)', color: MU, border: `1px solid ${MU}`, borderRadius: 3, fontSize: 8, padding: '1px 5px' }}>{n.type}</span>
                )}
                <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
                <span style={{ color: MU, fontSize: 9 }}>c:{n.centrality.toFixed(3)}</span>
                <span style={{
                  background: clsColor + '22',
                  color: clsColor,
                  border: `1px solid ${clsColor}`,
                  borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 6px',
                }}>{clsLabel}</span>
                <span style={{ color: MU, fontSize: 10 }}>{isEx ? '▲' : '▼'}</span>
              </div>

              {isEx && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${BD}` }}>
                  {/* Scenarios */}
                  <div style={{ color: CY, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>
                    SCENARIOS ({n._scenarios.length})
                  </div>
                  {n._scenarios.length === 0 ? (
                    <div style={{ color: MU, fontSize: 10, marginBottom: 8 }}>No matching scenarios.</div>
                  ) : n._scenarios.map(s => {
                    const maxS = n._scenarios[0]?._score || 1;
                    return (
                      <div key={s.id} style={{ marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          {s.type && (
                            <span style={{ background: CY, color: '#000', borderRadius: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px' }}>{s.type}</span>
                          )}
                          <span style={{ color: '#CBD5E1', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                          <span style={{ color: CY, fontSize: 9 }}>score {s._score}</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${Math.round((s._score / maxS) * 100)}%`, background: CY, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}

                  {/* Datasets */}
                  <div style={{ color: PU, fontSize: 9, fontWeight: 700, marginBottom: 4, marginTop: 8 }}>
                    DATASETS ({n._datasets.length})
                  </div>
                  {n._datasets.length === 0 ? (
                    <div style={{ color: MU, fontSize: 10 }}>No matching datasets.</div>
                  ) : n._datasets.map(d => {
                    const maxD = n._datasets[0]?._score || 1;
                    return (
                      <div key={d.id} style={{ marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          {d.category && (
                            <span style={{ background: PU, color: '#fff', borderRadius: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px' }}>{d.category}</span>
                          )}
                          <span style={{ color: '#CBD5E1', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                          <span style={{ color: PU, fontSize: 9 }}>score {d._score}</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${Math.round((d._score / maxD) * 100)}%`, background: PU, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 14px', borderTop: `1px solid ${BD}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: MU, fontSize: 9 }}>90 s auto-refresh · {rows.length} nodes · {scenarios.length} scn · {datasets.length} dst</span>
        <span style={{ color: dark > 0 ? RD : GR, fontSize: 9, fontWeight: 700 }}>
          {dark > 0 ? `${dark} DARK` : full > 0 ? `${full} FULL COVERAGE` : 'NO DATA'}
        </span>
      </div>
    </div>
  );
}
