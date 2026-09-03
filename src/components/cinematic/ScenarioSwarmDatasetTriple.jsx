import { useState, useEffect, useCallback } from 'react';

const API = '';

const SSJDTRI_RE = /\b(ssjdtri|scenario[._-]?swarm[._-]?dataset|scenario[._-]?swarm[._-]?data|swarm[._-]?dataset[._-]?scenario|scenario[._-]?automation[._-]?data|manual[._-]?scenario|automated[._-]?scenario|scenario[._-]?swarm[._-]?data|scenario[._-]?data[._-]?swarm|unautomated[._-]?scenario|scenario[._-]?automation)\b/i;

export function isSsjdtriQuery(t) {
  return SSJDTRI_RE.test(t || '');
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = ['scenarios', 'items', 'results', 'data', 'records', 'plans'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.name || s.title || s.label || `Scenario ${i + 1}`,
    status:   s.status || s.state || '',
    category: s.category || s.type || s.kind || '',
    desc:     String(s.description || s.summary || s.detail || '').slice(0, 200),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseSwarmJobs(raw) {
  if (!raw) return [];
  const arr = ['swarm_jobs', 'jobs', 'items', 'results', 'data', 'records', 'tasks'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((j, i) => ({
    id:     j.id || String(i),
    name:   j.name || j.title || j.label || `Job ${i + 1}`,
    type:   j.type || j.kind || j.category || '',
    status: j.status || j.state || '',
    domain: j.domain || j.area || '',
    desc:   String(j.description || j.summary || j.detail || '').slice(0, 200),
    tags:   Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
  }));
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = ['datasets', 'items', 'results', 'data', 'records', 'collections'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((d, i) => ({
    id:       d.id || String(i),
    name:     d.name || d.title || d.label || `Dataset ${i + 1}`,
    kind:     d.kind || d.type || d.category || '',
    rows:     d.rows || d.row_count || d.count || d.size || null,
    owner:    d.owner || d.author || '',
    desc:     String(d.description || d.summary || d.detail || '').slice(0, 200),
    tags:     Array.isArray(d.tags) ? d.tags.join(' ') : (d.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(scenToks, other) {
  const otherToks = [
    ...tokens(other.name || ''),
    ...tokens(other.type || other.kind || other.category || ''),
    ...tokens(other.domain || other.area || ''),
    ...tokens(other.status || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.tags || ''),
    ...tokens(other.owner || ''),
  ].filter(Boolean);
  if (!scenToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (scenToks.has(t)) hits++;
  return hits / Math.max(scenToks.size, otherToks.length);
}

function correlate(scenarios, swarmJobs, datasets) {
  return scenarios.map(scen => {
    const toks = new Set([
      ...tokens(scen.name),
      ...tokens(scen.category),
      ...tokens(scen.desc),
      ...tokens(scen.tags),
    ].filter(Boolean));

    const matchedSwarm = swarmJobs
      .map(j => ({ ...j, _score: matchScore(toks, j) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedDatasets = datasets
      .map(d => ({ ...d, _score: matchScore(toks, d) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasSwarm   = matchedSwarm.length > 0;
    const hasDataset = matchedDatasets.length > 0;

    let coverage;
    if (hasSwarm && hasDataset)  coverage = 'FULLY AUTOMATED';
    else if (hasSwarm)           coverage = 'SWARM-ONLY';
    else if (hasDataset)         coverage = 'DATA-BACKED';
    else                         coverage = 'MANUAL';

    return { ...scen, _swarm: matchedSwarm, _datasets: matchedDatasets, _coverage: coverage };
  });
}

export async function buildSsjdtriScript() {
  const [sR, jR, dR] = await Promise.allSettled([
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${API}/v1/datasets`).then(r => r.json()),
  ]);
  const scenarios  = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
  const swarmJobs  = normaliseSwarmJobs(jR.status === 'fulfilled' ? jR.value : []);
  const datasets   = normaliseDatasets(dR.status === 'fulfilled' ? dR.value : []);
  const enriched   = correlate(scenarios, swarmJobs, datasets);
  const fa  = enriched.filter(e => e._coverage === 'FULLY AUTOMATED').length;
  const so  = enriched.filter(e => e._coverage === 'SWARM-ONLY').length;
  const db  = enriched.filter(e => e._coverage === 'DATA-BACKED').length;
  const man = enriched.filter(e => e._coverage === 'MANUAL').length;
  return (
    `Scenario × SwarmJob × Dataset Triple Coverage: ${scenarios.length} scenarios cross-referenced against ` +
    `${swarmJobs.length} swarm jobs and ${datasets.length} datasets. ` +
    `${fa} FULLY AUTOMATED (swarm automation + dataset backing); ` +
    `${so} SWARM-ONLY (automation found, no dataset); ` +
    `${db} DATA-BACKED (dataset found, no swarm automation); ` +
    `${man} MANUAL (no swarm job or dataset — scenario with no automation or data support). ` +
    `Most critical manual scenarios: ${enriched.filter(e => e._coverage === 'MANUAL').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const LM = '#84CC16';
const AM = '#F59E0B';
const CY = '#00CFFF';
const GR = '#22C55E';

const COVERAGE_COLOR = {
  'FULLY AUTOMATED': GR,
  'SWARM-ONLY':      LM,
  'DATA-BACKED':     AM,
  'MANUAL':          '#555',
};

const chip = (label, color = CY) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a1a2a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY AUTOMATED', 'SWARM-ONLY', 'DATA-BACKED', 'MANUAL'];

export default function ScenarioSwarmDatasetTriple() {
  const [open, setOpen]             = useState(false);
  const [scenarios, setScenarios]   = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]               = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [sR, jR, dR] = await Promise.allSettled([
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${API}/v1/datasets`).then(r => r.json()),
      ]);
      const raw_s = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
      const raw_j = normaliseSwarmJobs(jR.status === 'fulfilled' ? jR.value : []);
      const raw_d = normaliseDatasets(dR.status === 'fulfilled' ? dR.value : []);
      setScenarios(correlate(raw_s, raw_j, raw_d));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ssjdtri-toggle', toggle);
    return () => window.removeEventListener('jarvis:ssjdtri-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildSsjdtriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Scenario automation and data coverage brief: ${brief}. Give a 2-sentence assessment of scenario readiness across swarm automation and dataset backing.` }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const manCount = scenarios.filter(s => s._coverage === 'MANUAL').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × SwarmJob × Dataset Triple Coverage (SSJDTRI)"
        style={{
          position: 'fixed', left: 733920, bottom: 8, zIndex: 339,
          background: manCount > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${manCount > 0 ? AM : CY + '44'}`,
          color: manCount > 0 ? AM : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ SSJDTRI{manCount > 0 ? ` ⚠${manCount}` : ''}
      </button>
    );
  }

  const fa  = scenarios.filter(s => s._coverage === 'FULLY AUTOMATED').length;
  const so  = scenarios.filter(s => s._coverage === 'SWARM-ONLY').length;
  const db  = scenarios.filter(s => s._coverage === 'DATA-BACKED').length;
  const man = scenarios.filter(s => s._coverage === 'MANUAL').length;

  const visible = scenarios.filter(s =>
    (tab === 'ALL' || s._coverage === tab) &&
    (!search || s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase()) ||
      s.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ SCENARIO × SWARM × DATASET TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>SSJDTRI</span>
        {man > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {man} MANUAL</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['SCENARIOS',        scenarios.length, CY],
          ['FULLY AUTOMATED',  fa,               GR],
          ['SWARM-ONLY',       so,               LM],
          ['DATA-BACKED',      db,               AM],
          ['MANUAL',           man,              '#555'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {scenarios.length > 0 && [
            [fa, GR], [so, LM], [db, AM], [man, '#444']
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${scenarios.filter(s => s._coverage === t).length})` : ''}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search scenarios…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: AM, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No scenarios match filter.</div>}
        {visible.map(scen => {
          const color = COVERAGE_COLOR[scen._coverage] || CY;
          const isExp = expanded === scen.id;
          return (
            <div key={scen.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : scen.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scen.name}</span>
                {scen.category && chip(scen.category, '#888')}
                {scen.status && chip(scen.status, scen.status?.toLowerCase?.().includes('active') ? GR : '#888')}
                {chip(scen._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: LM, marginBottom: 4, fontWeight: 600 }}>SWARM JOBS ({scen._swarm.length})</div>
                    {scen._swarm.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No swarm job alignment</div>
                      : scen._swarm.map(j => (
                        <div key={j.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</span>
                            {j.type && chip(j.type, '#888')}
                            {j.status && chip(j.status, j.status?.toLowerCase?.().includes('run') ? GR : '#888')}
                          </div>
                          <ScoreBar score={j._score} color={LM} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>DATASETS ({scen._datasets.length})</div>
                    {scen._datasets.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No dataset alignment</div>
                      : scen._datasets.map(d => (
                        <div key={d.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                            {d.kind && chip(d.kind, '#888')}
                            {d.rows != null && chip(`${d.rows} rows`, AM)}
                          </div>
                          <ScoreBar score={d._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: CY, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#F59E0B22', border: `1px solid ${AM}55`, color: AM, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
