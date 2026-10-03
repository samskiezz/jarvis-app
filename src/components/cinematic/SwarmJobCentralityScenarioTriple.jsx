import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SJGCSC_RE = /\b(sjgcsc|swarm\s+job\s+centrality\s+scenario|swarm\s+centrality\s+scenario|swarm\s+graph\s+scenario|swarm\s+node\s+scenario|centrality\s+swarm\s+scenario|unplanned\s+swarm|swarm\s+scenario\s+centrality|swarm\s+graph\s+centrality|swarm\s+job\s+graph\s+centrality|swarm\s+job\s+scenario\s+centrality)\b/i;
const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fToks = tok(fieldText);
  const fSet = new Set(fToks);
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseSwarmJobs(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.swarm_jobs) ? raw.swarm_jobs
    : Array.isArray(raw.jobs) ? raw.jobs
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((j, i) => ({
    id: j.id || j._id || `sj-${i}`,
    label: j.name || j.title || j.job_type || j.type || `SwarmJob ${i + 1}`,
    kind: j.kind || j.type || j.job_type || '',
    status: j.status || j.state || '',
    objective: j.objective || j.description || j.summary || '',
    tags: Array.isArray(j.tags) ? j.tags.join(' ') : String(j.tags || ''),
    _searchText: [j.name, j.title, j.type, j.kind, j.job_type, j.objective, j.description, j.summary, j.tags].filter(Boolean).join(' '),
  }));
}

function normaliseCentrality(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.nodes) ? raw.nodes
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((n, i) => ({
    id: n.id || n._id || `node-${i}`,
    label: n.label || n.name || n.title || `Node ${i + 1}`,
    type: n.type || n.kind || n.category || '',
    score: n.centrality_score || n.score || n.weight || 0,
    description: n.description || n.summary || '',
    tags: Array.isArray(n.tags) ? n.tags.join(' ') : String(n.tags || ''),
    _searchText: [n.label, n.name, n.title, n.type, n.kind, n.category, n.description, n.summary, n.tags].filter(Boolean).join(' '),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.scenarios) ? raw.scenarios
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((s, i) => ({
    id: s.id || s._id || `sc-${i}`,
    label: s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    category: s.category || s.type || s.kind || '',
    status: s.status || s.state || '',
    description: s.description || s.summary || s.objective || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    _searchText: [s.name, s.title, s.category, s.type, s.kind, s.status, s.description, s.summary, s.objective, s.tags].filter(Boolean).join(' '),
  }));
}

function correlate(swarmJobs, nodes, scenarios) {
  return swarmJobs.map(sj => {
    const toks = tok(sj._searchText);
    const matchedNodes = nodes
      .map(n => ({ ...n, score: matchScore(toks, n._searchText) }))
      .filter(n => n.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedScenarios = scenarios
      .map(s => ({ ...s, score: matchScore(toks, s._searchText) }))
      .filter(s => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasNode = matchedNodes.length > 0;
    const hasSc = matchedScenarios.length > 0;
    const coverage =
      hasNode && hasSc ? 'FULLY_PLANNED' :
      hasNode ? 'CENTRALITY_MAPPED' :
      hasSc ? 'SCENARIO_LINKED' :
      'UNPLANNED';
    return { ...sj, matchedNodes, matchedScenarios, coverage };
  });
}

export function isSjgcscQuery(t) {
  return SJGCSC_RE.test(t || '');
}

export async function buildSjgcscScript() {
  try {
    const [sjRes, nRes, scRes] = await Promise.all([
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
    ]);
    const swarmJobs = normaliseSwarmJobs(sjRes);
    const nodes = normaliseCentrality(nRes);
    const scenarios = normaliseScenarios(scRes);
    const correlated = correlate(swarmJobs, nodes, scenarios);
    const fullyPlanned = correlated.filter(s => s.coverage === 'FULLY_PLANNED').length;
    const unplanned = correlated.filter(s => s.coverage === 'UNPLANNED').length;
    return `SJGCSC analysis: ${swarmJobs.length} swarm jobs cross-referenced against ${nodes.length} high-influence graph centrality nodes and ${scenarios.length} scenario plans. ${fullyPlanned} swarm jobs are FULLY PLANNED with both network centrality context and scenario coverage. ${unplanned} swarm jobs are UNPLANNED — no centrality node or scenario coverage — these automation jobs lack both graph intelligence backing and response planning, representing a critical operational coordination gap.`;
  } catch {
    return 'SJGCSC data unavailable — check /entities/SwarmJob, /v1/graph/centrality, and /v1/scenario/list endpoints.';
  }
}

const LM = '#84CC16';
const CY = '#29E7FF';
const VL = '#8B5CF6';
const GR = '#555';

const FILTER_TABS = ['ALL', 'FULLY PLANNED', 'CENTRALITY MAPPED', 'SCENARIO LINKED', 'UNPLANNED'];
const COV_MAP = {
  'FULLY PLANNED': 'FULLY_PLANNED',
  'CENTRALITY MAPPED': 'CENTRALITY_MAPPED',
  'SCENARIO LINKED': 'SCENARIO_LINKED',
  'UNPLANNED': 'UNPLANNED',
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ height: 3, background: '#1A2535', borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: 3, width: `${Math.min(100, Math.round(score * 100))}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  );
}

function Badge({ label, color }) {
  if (!label) return null;
  return (
    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${color}22`, color, border: `1px solid ${color}55`, letterSpacing: 1, marginLeft: 4 }}>
      {String(label).toUpperCase().slice(0, 14)}
    </span>
  );
}

export default function SwarmJobCentralityScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sjRes, nRes, scRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
      ]);
      const swarmJobs = normaliseSwarmJobs(sjRes);
      const nodes = normaliseCentrality(nRes);
      const scenarios = normaliseScenarios(scRes);
      setData(correlate(swarmJobs, nodes, scenarios));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener('jarvis:sjgcsc-toggle', toggle);
    return () => window.removeEventListener('jarvis:sjgcsc-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = data.filter(sj => {
    if (filter !== 'ALL' && sj.coverage !== COV_MAP[filter]) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!sj.label.toLowerCase().includes(q) && !sj._searchText.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    fullyPlanned: data.filter(s => s.coverage === 'FULLY_PLANNED').length,
    centralityMapped: data.filter(s => s.coverage === 'CENTRALITY_MAPPED').length,
    scenarioLinked: data.filter(s => s.coverage === 'SCENARIO_LINKED').length,
    unplanned: data.filter(s => s.coverage === 'UNPLANNED').length,
  };

  const totalNodes = [...new Set(data.flatMap(s => s.matchedNodes.map(n => n.id)))].length;
  const totalScenarios = [...new Set(data.flatMap(s => s.matchedScenarios.map(sc => sc.id)))].length;

  const assess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const script = await buildSjgcscScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch { setAssessText('Assessment unavailable.'); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="SwarmJob × Graph Centrality × Scenario Triple Coverage"
        style={{
          position: 'fixed', left: 829680, bottom: 8, zIndex: 510,
          background: 'rgba(5,8,13,0.82)', border: `1px solid ${LM}55`,
          color: LM, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1.5, padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
          backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
        }}>
        ◈ SJGCSC
        {counts.unplanned > 0 && (
          <span style={{ marginLeft: 5, background: GR, color: '#DCEBF5', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.unplanned}
          </span>
        )}
        {counts.fullyPlanned > 0 && (
          <span style={{ marginLeft: 3, background: LM, color: '#04060A', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.fullyPlanned}
          </span>
        )}
      </button>
    );
  }

  const covColor = c =>
    c === 'FULLY_PLANNED' ? LM :
    c === 'CENTRALITY_MAPPED' ? CY :
    c === 'SCENARIO_LINKED' ? VL : GR;

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, zIndex: 510, width: 'min(820px,95vw)',
      maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column',
      background: 'rgba(5,10,18,0.97)', border: `1px solid ${LM}44`,
      borderRadius: 10, fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden',
      boxShadow: `0 0 40px ${LM}22`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${LM}33`, flexShrink: 0 }}>
        <span style={{ color: LM, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ SJGCSC</span>
        <span style={{ color: '#6E8AA0', fontSize: 9 }}>SwarmJob × Graph Centrality × Scenario</span>
        {loading && <span style={{ color: LM, fontSize: 8, animation: 'sjgcsc_pulse 1s infinite' }}>LOADING…</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={assess} disabled={assessing} style={{
            background: `${LM}22`, border: `1px solid ${LM}55`, color: LM,
            fontSize: 9, padding: '3px 8px', borderRadius: 3, cursor: assessing ? 'default' : 'pointer', letterSpacing: 1,
          }}>{assessing ? 'ASSESSING…' : 'ASSESS'}</button>
          <button onClick={() => setOpen(false)} style={{
            background: 'transparent', border: `1px solid #2A3A50`, color: '#6E8AA0',
            fontSize: 9, padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
          }}>✕</button>
        </div>
      </div>

      {/* Assess output */}
      {assessText && (
        <div style={{ padding: '6px 14px', background: `${LM}11`, borderBottom: `1px solid ${LM}22`, color: '#DCEBF5', fontSize: 9, lineHeight: 1.5, flexShrink: 0 }}>
          {assessText}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: `1px solid ${LM}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'SWARM JOBS', val: data.length, color: '#DCEBF5' },
          { label: 'CENTRALITY NODES', val: totalNodes, color: CY },
          { label: 'SCENARIOS', val: totalScenarios, color: VL },
          { label: 'FULLY PLANNED', val: counts.fullyPlanned, color: LM },
          { label: 'CENT. MAPPED', val: counts.centralityMapped, color: CY },
          { label: 'SCEN. LINKED', val: counts.scenarioLinked, color: VL },
          { label: 'UNPLANNED', val: counts.unplanned, color: GR },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '4px 10px', minWidth: 70, textAlign: 'center' }}>
            <div style={{ color: s.color, fontSize: 13, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#4A5A70', fontSize: 8, letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {data.length > 0 && (
        <div style={{ margin: '6px 14px', height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', flexShrink: 0 }}>
          {[
            { n: counts.fullyPlanned, c: LM },
            { n: counts.centralityMapped, c: CY },
            { n: counts.scenarioLinked, c: VL },
            { n: counts.unplanned, c: '#1E1E2A' },
          ].map((seg, i) => (
            <div key={i} style={{ flex: seg.n, background: seg.c, minWidth: seg.n ? 2 : 0, transition: 'flex 0.4s' }} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: `1px solid ${LM}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${LM}33` : 'transparent',
            border: `1px solid ${filter === f ? LM : '#2A3A50'}`,
            color: filter === f ? LM : '#6E8AA0', fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="search swarm jobs…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: `1px solid #2A3A50`, color: '#DCEBF5', fontSize: 9, padding: '2px 8px', borderRadius: 3, outline: 'none', width: 140 }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
        {visible.length === 0 && (
          <div style={{ color: '#6E8AA0', fontSize: 10, textAlign: 'center', padding: 24 }}>
            {loading ? 'Loading…' : 'No swarm jobs match filter.'}
          </div>
        )}
        {visible.map(sj => {
          const isExp = expanded === sj.id;
          const cc = covColor(sj.coverage);
          return (
            <div key={sj.id} style={{ marginBottom: 4, borderRadius: 5, border: `1px solid ${cc}33`, background: `${cc}07`, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : sj.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cc, flexShrink: 0 }} />
                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sj.label}</span>
                {sj.kind && <Badge label={sj.kind} color={LM} />}
                {sj.status && <Badge label={sj.status} color='#6E8AA0' />}
                <Badge label={`${sj.matchedNodes.length}N / ${sj.matchedScenarios.length}SC`} color={cc} />
                <span style={{ fontSize: 8, color: cc, letterSpacing: 1, marginLeft: 4 }}>{sj.coverage.replace(/_/g, ' ')}</span>
                <span style={{ color: '#6E8AA0', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${cc}22` }}>
                  {sj.objective && (
                    <div style={{ color: '#6E8AA0', fontSize: 9, marginBottom: 8, lineHeight: 1.4 }}>{sj.objective.slice(0, 160)}{sj.objective.length > 160 ? '…' : ''}</div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {/* Left: centrality nodes */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>CENTRALITY NODES ({sj.matchedNodes.length})</div>
                      {sj.matchedNodes.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no centrality node match</div>
                        : sj.matchedNodes.slice(0, 5).map(n => (
                          <div key={n.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
                              {n.type && <Badge label={n.type} color={CY} />}
                            </div>
                            <ScoreBar score={n.score} color={CY} />
                          </div>
                        ))}
                    </div>
                    {/* Right: scenarios */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: VL, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>SCENARIOS ({sj.matchedScenarios.length})</div>
                      {sj.matchedScenarios.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no scenario match</div>
                        : sj.matchedScenarios.slice(0, 5).map(s => (
                          <div key={s.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                              {s.category && <Badge label={s.category} color={VL} />}
                              {s.status && <Badge label={s.status} color='#6E8AA0' />}
                            </div>
                            <ScoreBar score={s.score} color={VL} />
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes sjgcsc_pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
