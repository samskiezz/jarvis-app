import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GADSJ_RE = /\b(gadsj|graph\s+annotation\s+dataset\s+swarm|annotation\s+dataset\s+swarm|annotation\s+swarm\s+dataset|annotation\s+data\s+automation|dark\s+annotation\s+data|annotation\s+swarm\s+job\s+dataset|powered\s+annotation|annotation\s+data\s+swarm|annotation\s+swarm\s+automation|graph\s+annot\s+swarm|annotation\s+swarm\s+data)\b/i;
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

function normaliseAnnotations(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.annotations) ? raw.annotations
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((a, i) => ({
    id: a.id || a._id || `ann-${i}`,
    label: a.name || a.title || a.text || a.actor || `Annotation ${i + 1}`,
    targetType: a.target_type || a.targetType || a.type || '',
    actor: a.actor || '',
    category: a.category || a.kind || '',
    description: a.description || a.text || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : String(a.tags || ''),
    _searchText: [a.name, a.title, a.text, a.actor, a.target_type, a.category, a.kind, a.description, a.tags].filter(Boolean).join(' '),
  }));
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.datasets) ? raw.datasets
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((d, i) => ({
    id: d.id || d._id || `ds-${i}`,
    label: d.name || d.title || `Dataset ${i + 1}`,
    kind: d.kind || d.type || d.category || '',
    rows: d.row_count || d.rows || d.count || 0,
    description: d.description || d.summary || '',
    tags: Array.isArray(d.tags) ? d.tags.join(' ') : String(d.tags || ''),
    _searchText: [d.name, d.title, d.kind, d.type, d.description, d.tags].filter(Boolean).join(' '),
  }));
}

function normaliseSwarmJobs(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.jobs) ? raw.jobs
    : Array.isArray(raw.swarm_jobs) ? raw.swarm_jobs
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((j, i) => ({
    id: j.id || j._id || `sj-${i}`,
    label: j.name || j.title || `SwarmJob ${i + 1}`,
    kind: j.kind || j.type || j.job_type || '',
    status: j.status || j.state || '',
    description: j.description || j.objective || j.summary || '',
    domain: j.domain || j.area || '',
    tags: Array.isArray(j.tags) ? j.tags.join(' ') : String(j.tags || ''),
    _searchText: [j.name, j.title, j.kind, j.type, j.description, j.objective, j.domain, j.tags].filter(Boolean).join(' '),
  }));
}

function correlate(annotations, datasets, swarmJobs) {
  return annotations.map(ann => {
    const aToks = tok(ann._searchText);
    const matchedDs = datasets
      .map(d => ({ ...d, score: matchScore(aToks, d._searchText) }))
      .filter(d => d.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedSj = swarmJobs
      .map(j => ({ ...j, score: matchScore(aToks, j._searchText) }))
      .filter(j => j.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasDs = matchedDs.length > 0;
    const hasSj = matchedSj.length > 0;
    let coverage;
    if (hasDs && hasSj) coverage = 'FULLY_POWERED';
    else if (hasDs) coverage = 'DATA_BACKED';
    else if (hasSj) coverage = 'SWARM_ACTIVE';
    else coverage = 'DARK';
    return { ...ann, matchedDs, matchedSj, coverage };
  });
}

export function isGadsjQuery(t) {
  return GADSJ_RE.test(t || '');
}

export async function buildGadsjScript() {
  try {
    const [annRes, dsRes, sjRes] = await Promise.all([
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
    ]);
    const annotations = normaliseAnnotations(annRes);
    const datasets = normaliseDatasets(dsRes);
    const swarmJobs = normaliseSwarmJobs(sjRes);
    const correlated = correlate(annotations, datasets, swarmJobs);
    const fullyPowered = correlated.filter(a => a.coverage === 'FULLY_POWERED').length;
    const dark = correlated.filter(a => a.coverage === 'DARK').length;
    return `GADSJ analysis: ${annotations.length} graph annotations cross-referenced against ${datasets.length} datasets and ${swarmJobs.length} swarm jobs. ${fullyPowered} annotations are FULLY POWERED — both empirical dataset backing and active swarm automation confirmed. ${dark} annotations are DARK with no dataset or swarm coverage — these represent automation and data grounding gaps requiring immediate dataset assignment and swarm deployment.`;
  } catch {
    return 'GADSJ data unavailable — check /v1/graph/annotations, /v1/datasets, and /entities/SwarmJob endpoints.';
  }
}

const VL = '#9B6DFF';
const EM = '#00D4A0';
const CY = '#29E7FF';
const GR = '#555';

const FILTER_TABS = ['ALL', 'FULLY POWERED', 'DATA-BACKED', 'SWARM-ACTIVE', 'DARK'];
const COV_MAP = {
  'FULLY POWERED': 'FULLY_POWERED',
  'DATA-BACKED': 'DATA_BACKED',
  'SWARM-ACTIVE': 'SWARM_ACTIVE',
  'DARK': 'DARK',
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

export default function GraphAnnotationDatasetSwarmTriple() {
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
      const [annRes, dsRes, sjRes] = await Promise.all([
        fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
      ]);
      const annotations = normaliseAnnotations(annRes);
      const datasets = normaliseDatasets(dsRes);
      const swarmJobs = normaliseSwarmJobs(sjRes);
      setData(correlate(annotations, datasets, swarmJobs));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener('jarvis:gadsj-toggle', toggle);
    return () => window.removeEventListener('jarvis:gadsj-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = data.filter(a => {
    if (filter !== 'ALL' && a.coverage !== COV_MAP[filter]) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.label.toLowerCase().includes(q) && !a._searchText.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    fullyPowered: data.filter(a => a.coverage === 'FULLY_POWERED').length,
    dataBacked: data.filter(a => a.coverage === 'DATA_BACKED').length,
    swarmActive: data.filter(a => a.coverage === 'SWARM_ACTIVE').length,
    dark: data.filter(a => a.coverage === 'DARK').length,
  };

  const totalDs = [...new Set(data.flatMap(a => a.matchedDs.map(d => d.id)))].length;
  const totalSj = [...new Set(data.flatMap(a => a.matchedSj.map(j => j.id)))].length;

  const assess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const script = await buildGadsjScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch { setAssessText('Assessment unavailable.'); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Annotation × Dataset × SwarmJob Triple Coverage"
        style={{
          position: 'fixed', left: 828560, bottom: 8, zIndex: 508,
          background: 'rgba(5,8,13,0.82)', border: `1px solid ${VL}55`,
          color: VL, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1.5, padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
          backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
        }}>
        ◈ GADSJ
        {counts.dark > 0 && (
          <span style={{ marginLeft: 5, background: GR, color: '#DCEBF5', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.dark}
          </span>
        )}
        {counts.fullyPowered > 0 && (
          <span style={{ marginLeft: 3, background: VL, color: '#04060A', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.fullyPowered}
          </span>
        )}
      </button>
    );
  }

  const covColor = c =>
    c === 'FULLY_POWERED' ? VL :
    c === 'DATA_BACKED' ? EM :
    c === 'SWARM_ACTIVE' ? CY : GR;

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, zIndex: 508, width: 'min(820px,95vw)',
      maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column',
      background: 'rgba(5,10,18,0.97)', border: `1px solid ${VL}44`,
      borderRadius: 10, fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden',
      boxShadow: `0 0 60px ${VL}22`,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${VL}33`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ color: VL, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ GADSJ</span>
        <span style={{ color: '#6E8AA0', fontSize: 10, flex: 1 }}>Graph Annotation × Dataset × SwarmJob Triple Coverage</span>
        {loading && <span style={{ color: VL, fontSize: 9, animation: 'gadsj_pulse 1s infinite' }}>◌ LOADING</span>}
        <button onClick={assess} disabled={assessing} style={{ background: `${VL}22`, border: `1px solid ${VL}55`, color: VL, fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#6E8AA0', fontSize: 14, cursor: 'pointer', padding: '0 4px' }}>✕</button>
      </div>

      {assessText && (
        <div style={{ padding: '8px 14px', background: `${VL}11`, borderBottom: `1px solid ${VL}22`, fontSize: 10, color: '#DCEBF5', lineHeight: 1.5 }}>
          {assessText}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${VL}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'ANNOTATIONS', val: data.length, color: '#6E8AA0' },
          { label: 'DATASETS', val: totalDs, color: EM },
          { label: 'SWARM JOBS', val: totalSj, color: CY },
          { label: 'POWERED', val: counts.fullyPowered, color: VL },
          { label: 'DATA-BACKED', val: counts.dataBacked, color: EM },
          { label: 'SWARM-ACTIVE', val: counts.swarmActive, color: CY },
          { label: 'DARK', val: counts.dark, color: GR },
        ].map(s => (
          <div key={s.label} style={{ background: `${s.color}11`, border: `1px solid ${s.color}33`, borderRadius: 4, padding: '4px 8px', textAlign: 'center', minWidth: 64 }}>
            <div style={{ color: s.color, fontSize: 14, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#6E8AA0', fontSize: 8, letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {data.length > 0 && (
        <div style={{ margin: '6px 14px', height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', flexShrink: 0 }}>
          {[
            { n: counts.fullyPowered, c: VL },
            { n: counts.dataBacked, c: EM },
            { n: counts.swarmActive, c: CY },
            { n: counts.dark, c: '#1E1E2A' },
          ].map((seg, i) => (
            <div key={i} style={{ flex: seg.n, background: seg.c, minWidth: seg.n ? 2 : 0, transition: 'flex 0.4s' }} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: `1px solid ${VL}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${VL}33` : 'transparent',
            border: `1px solid ${filter === f ? VL : '#2A3A50'}`,
            color: filter === f ? VL : '#6E8AA0', fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="search annotations…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: `1px solid #2A3A50`, color: '#DCEBF5', fontSize: 9, padding: '2px 8px', borderRadius: 3, outline: 'none', width: 140 }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
        {visible.length === 0 && (
          <div style={{ color: '#6E8AA0', fontSize: 10, textAlign: 'center', padding: 24 }}>
            {loading ? 'Loading…' : 'No annotations match filter.'}
          </div>
        )}
        {visible.map(ann => {
          const isExp = expanded === ann.id;
          const cc = covColor(ann.coverage);
          return (
            <div key={ann.id} style={{ marginBottom: 4, borderRadius: 5, border: `1px solid ${cc}33`, background: `${cc}07`, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : ann.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cc, flexShrink: 0 }} />
                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ann.label}</span>
                {ann.targetType && <Badge label={ann.targetType} color={VL} />}
                <Badge label={`${ann.matchedDs.length}D / ${ann.matchedSj.length}SJ`} color={cc} />
                <span style={{ fontSize: 8, color: cc, letterSpacing: 1, marginLeft: 4 }}>{ann.coverage.replace(/_/g, ' ')}</span>
                <span style={{ color: '#6E8AA0', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${cc}22` }}>
                  {ann.description && (
                    <div style={{ color: '#6E8AA0', fontSize: 9, marginBottom: 8, lineHeight: 1.4 }}>{ann.description.slice(0, 160)}{ann.description.length > 160 ? '…' : ''}</div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {/* Left: datasets */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: EM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>DATASETS ({ann.matchedDs.length})</div>
                      {ann.matchedDs.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no dataset match</div>
                        : ann.matchedDs.slice(0, 5).map(d => (
                          <div key={d.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
                              {d.kind && <Badge label={d.kind} color={EM} />}
                              {d.rows > 0 && <span style={{ fontSize: 8, color: '#6E8AA0' }}>{d.rows.toLocaleString()}r</span>}
                            </div>
                            <ScoreBar score={d.score} color={EM} />
                          </div>
                        ))}
                    </div>
                    {/* Right: swarm jobs */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>SWARM JOBS ({ann.matchedSj.length})</div>
                      {ann.matchedSj.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no swarm match</div>
                        : ann.matchedSj.slice(0, 5).map(j => (
                          <div key={j.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.label}</span>
                              {j.kind && <Badge label={j.kind} color={CY} />}
                              {j.status && <Badge label={j.status} color='#6E8AA0' />}
                            </div>
                            <ScoreBar score={j.score} color={CY} />
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
      <style>{`@keyframes gadsj_pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
