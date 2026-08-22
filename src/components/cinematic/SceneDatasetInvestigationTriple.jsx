import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCENE_IDS = [
  '01_command_atrium',
  '02_intelligence_nexus',
  '03_threat_theatre',
  '04_mission_forge',
  '05_signals_bridge',
  '06_synthetic_oracle',
  '07_sovereign_archive',
  '08_field_operations',
  '09_crisis_calculus',
  '10_sentinel_watch',
];

const SDSITRI_RE = /\b(sdsitri|scene\s+dataset\s+invest|scene\s+data\s+invest|scene\s+dataset\s+investigation|cinematic\s+dataset\s+invest|scene\s+data\s+case|dark\s+scene\s+data|tracked\s+scene|scene\s+investigation\s+dataset|fully\s+tracked\s+scene|scene\s+data\s+coverage)\b/i;
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

function normaliseScenes(rawArr) {
  return rawArr
    .map((raw, i) => {
      if (!raw) return null;
      const id = raw?.id || raw?.scene_id || SCENE_IDS[i] || `scene-${i}`;
      const label = raw?.name || raw?.title || id.replace(/_/g, ' ').replace(/^\d+\s+/, '');
      const description = raw?.description || raw?.summary || '';
      const anchors = Array.isArray(raw?.anchors)
        ? raw.anchors.map(a => typeof a === 'string' ? a : (a?.label || a?.text || '')).join(' ')
        : String(raw?.anchors || '');
      const tags = Array.isArray(raw?.tags) ? raw.tags.join(' ') : String(raw?.tags || '');
      return {
        id,
        label,
        description,
        anchors,
        tags,
        _searchText: [label, description, anchors, tags].filter(Boolean).join(' '),
      };
    })
    .filter(Boolean);
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
    label: d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    kind: d.kind || d.type || d.category || '',
    description: d.description || d.summary || '',
    tags: Array.isArray(d.tags) ? d.tags.join(' ') : String(d.tags || ''),
    source: d.source || '',
    _searchText: [d.name, d.title, d.dataset_name, d.kind, d.type, d.category, d.description, d.summary, d.tags, d.source].filter(Boolean).join(' '),
  }));
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.investigations) ? raw.investigations
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id: inv.id || inv._id || `inv-${i}`,
    label: inv.name || inv.title || inv.case_name || `Investigation ${i + 1}`,
    kind: inv.kind || inv.type || inv.category || '',
    status: inv.status || inv.state || '',
    description: inv.description || inv.summary || '',
    tags: Array.isArray(inv.tags) ? inv.tags.join(' ') : String(inv.tags || ''),
    _searchText: [inv.name, inv.title, inv.case_name, inv.kind, inv.type, inv.category, inv.status, inv.state, inv.description, inv.summary, inv.tags].filter(Boolean).join(' '),
  }));
}

function correlate(scenes, datasets, investigations) {
  return scenes.map(scene => {
    const sToks = tok(scene._searchText);
    const matchedDatasets = datasets
      .map(d => ({ ...d, score: matchScore(sToks, d._searchText) }))
      .filter(d => d.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedInvestigations = investigations
      .map(inv => ({ ...inv, score: matchScore(sToks, inv._searchText) }))
      .filter(inv => inv.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasDs = matchedDatasets.length > 0;
    const hasInv = matchedInvestigations.length > 0;
    let coverage;
    if (hasDs && hasInv) coverage = 'FULLY_TRACKED';
    else if (hasDs) coverage = 'DATA_BACKED';
    else if (hasInv) coverage = 'CASE_LINKED';
    else coverage = 'DARK';
    return { ...scene, matchedDatasets, matchedInvestigations, coverage };
  });
}

export function isSdsitriQuery(t) {
  return SDSITRI_RE.test(t || '');
}

export async function buildSdsitriScript() {
  try {
    const [sceneResults, dsR, invR] = await Promise.all([
      Promise.allSettled(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))),
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : null),
    ]);
    const rawScenes = sceneResults.map(r => r.status === 'fulfilled' ? r.value : null);
    const rows = correlate(normaliseScenes(rawScenes), normaliseDatasets(dsR), normaliseInvestigations(invR));
    const fullyTracked = rows.filter(r => r.coverage === 'FULLY_TRACKED').length;
    const dark = rows.filter(r => r.coverage === 'DARK').length;
    return `SDSITRI coverage: ${rows.length} cinematic scenes assessed against datasets and investigations — ${fullyTracked} fully tracked (both empirical data and active case coverage), ${dark} dark (no dataset or investigation backing — operational blind spot). ${dark > 0 ? `${dark} scene${dark > 1 ? 's have' : ' has'} no dataset or investigation coverage — intelligence integration review recommended.` : 'All scenes have either dataset or investigation backing at this time.'}`;
  } catch {
    return 'SDSITRI: scene dataset investigation coverage data unavailable.';
  }
}

const TABS = ['ALL', 'FULLY TRACKED', 'DATA-BACKED', 'CASE-LINKED', 'DARK'];
const TAB_KEY = {
  'ALL': null,
  'FULLY TRACKED': 'FULLY_TRACKED',
  'DATA-BACKED': 'DATA_BACKED',
  'CASE-LINKED': 'CASE_LINKED',
  'DARK': 'DARK',
};

const COVER_COLOR = {
  FULLY_TRACKED: '#06b6d4',
  DATA_BACKED: '#10b981',
  CASE_LINKED: '#a78bfa',
  DARK: '#6b7280',
};

const LABEL_MAP = {
  FULLY_TRACKED: 'FULLY TRACKED',
  DATA_BACKED: 'DATA-BACKED',
  CASE_LINKED: 'CASE-LINKED',
  DARK: 'DARK',
};

const STATUS_COLOR = { open: '#22c55e', active: '#22c55e', closed: '#ef4444', pending: '#eab308', review: '#f97316' };

export default function SceneDatasetInvestigationTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [counts, setCounts] = useState({ total: 0, datasets: 0, investigations: 0, fullyTracked: 0, dataBacked: 0, caseLinked: 0, dark: 0 });
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sceneResults, dsR, invR] = await Promise.all([
        Promise.allSettled(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : Promise.reject(`scene/${id} ${r.status}`)))),
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : Promise.reject(`datasets ${r.status}`)),
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : Promise.reject(`investigations ${r.status}`)),
      ]);
      const rawScenes = sceneResults.map(r => r.status === 'fulfilled' ? r.value : null);
      const datasets = normaliseDatasets(dsR);
      const investigations = normaliseInvestigations(invR);
      const correlated = correlate(normaliseScenes(rawScenes), datasets, investigations);
      setRows(correlated);
      setCounts({
        total: correlated.length,
        datasets: datasets.length,
        investigations: investigations.length,
        fullyTracked: correlated.filter(r => r.coverage === 'FULLY_TRACKED').length,
        dataBacked: correlated.filter(r => r.coverage === 'DATA_BACKED').length,
        caseLinked: correlated.filter(r => r.coverage === 'CASE_LINKED').length,
        dark: correlated.filter(r => r.coverage === 'DARK').length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) setOpen(e.detail.open);
      else setOpen(v => !v);
    };
    window.addEventListener('jarvis:sdsitri-toggle', handler);
    return () => window.removeEventListener('jarvis:sdsitri-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const tabKey = TAB_KEY[tab];
    if (tabKey && r.coverage !== tabKey) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        r.label.toLowerCase().includes(s) ||
        r.description.toLowerCase().includes(s) ||
        r.anchors.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const total = counts.total || 1;
  const barTracked = (counts.fullyTracked / total * 100).toFixed(1);
  const barData = (counts.dataBacked / total * 100).toFixed(1);
  const barCase = (counts.caseLinked / total * 100).toFixed(1);
  const barDark = (counts.dark / total * 100).toFixed(1);

  async function assess(row) {
    setAssessing(row.id);
    try {
      const prompt = `Analyse cinematic scene "${row.label}" for dataset and investigation coverage. Coverage state: ${LABEL_MAP[row.coverage]}. Matched datasets: ${row.matchedDatasets.map(d => d.label).join(', ') || 'none'}. Matched investigations: ${row.matchedInvestigations.map(inv => inv.label).join(', ') || 'none'}. ${row.coverage === 'FULLY_TRACKED' ? 'This scene has both empirical data backing and an active investigation — assess coverage completeness.' : row.coverage === 'DARK' ? 'This scene has no dataset or investigation coverage — assess the intelligence blind spot and recommend action.' : row.coverage === 'DATA_BACKED' ? 'This scene has data coverage but no active investigation — assess the case gap.' : 'This scene has an active investigation but no dataset backing — assess the data evidence gap.'} Respond in exactly 2 sentences.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.__JARVIS_KEY__ || 'dev-key'}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'Assessment unavailable.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      await fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {
      /* silent */
    } finally {
      setAssessing(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 825200, bottom: 8, zIndex: 502,
          background: 'rgba(14,20,28,0.82)', border: '1px solid #374151',
          borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
          fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(6px)',
        }}
        title="Scene × Dataset × Investigation Triple Coverage (SDSITRI)"
      >
        ◈ SDSITRI
        {counts.fullyTracked > 0 && (
          <span style={{
            background: '#06b6d4', color: '#0f172a', borderRadius: 8,
            fontSize: 10, padding: '0 5px', fontWeight: 700, lineHeight: '16px',
          }}>{counts.fullyTracked}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)',
      width: 900, maxHeight: '78vh', zIndex: 502,
      background: 'rgba(10,14,20,0.97)', border: '1px solid #1e293b',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#06b6d4', fontWeight: 700, fontSize: 13 }}>◈ SDSITRI</span>
        <span style={{ color: '#64748b', fontSize: 11, flex: 1 }}>Scene × Dataset × Investigation Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 10 }}>LOADING…</span>}
        <button onClick={load} style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: '#64748b', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'SCENES', val: counts.total, color: '#94a3b8' },
          { label: 'DATASETS', val: counts.datasets, color: '#10b981' },
          { label: 'INVESTIGATIONS', val: counts.investigations, color: '#a78bfa' },
          { label: 'FULLY TRACKED', val: counts.fullyTracked, color: '#06b6d4' },
          { label: 'DATA-BACKED', val: counts.dataBacked, color: '#10b981' },
          { label: 'CASE-LINKED', val: counts.caseLinked, color: '#a78bfa' },
          { label: 'DARK', val: counts.dark, color: '#6b7280' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(30,41,59,0.6)', borderRadius: 6, padding: '4px 10px',
            border: `1px solid ${s.color}33`,
          }}>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ margin: '0 14px 8px', height: 6, borderRadius: 3, background: '#1e293b', display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: `${barTracked}%`, background: '#06b6d4', transition: 'width 0.4s' }} />
        <div style={{ width: `${barData}%`, background: '#10b981', transition: 'width 0.4s' }} />
        <div style={{ width: `${barCase}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
        <div style={{ width: `${barDark}%`, background: '#6b7280', transition: 'width 0.4s' }} />
      </div>

      {error && (
        <div style={{ margin: '0 14px 6px', color: '#ef4444', fontSize: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 4, padding: '4px 8px' }}>
          {error}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(6,182,212,0.15)' : 'rgba(30,41,59,0.4)',
            border: `1px solid ${tab === t ? '#06b6d4' : '#374151'}`,
            borderRadius: 4, color: tab === t ? '#06b6d4' : '#64748b',
            fontSize: 10, padding: '2px 8px', cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scenes…"
          style={{
            marginLeft: 'auto', background: 'rgba(30,41,59,0.6)', border: '1px solid #374151',
            borderRadius: 4, color: '#cbd5e1', fontSize: 10, padding: '2px 8px', width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 24 }}>No scenes match current filter.</div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                background: 'rgba(30,41,59,0.5)', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${COVER_COLOR[row.coverage]}33`,
              }}
            >
              <span style={{ color: COVER_COLOR[row.coverage], fontSize: 10, fontWeight: 700, minWidth: 120 }}>
                {LABEL_MAP[row.coverage]}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1 }}>{row.label}</span>
              <span style={{ color: '#64748b', fontSize: 9 }}>
                {row.matchedDatasets.length}ds {row.matchedInvestigations.length}inv
              </span>
              <span style={{ color: '#64748b', fontSize: 11 }}>{expanded === row.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.id && (
              <div style={{ padding: '8px 8px 4px', background: 'rgba(15,23,42,0.6)', borderRadius: '0 0 6px 6px', border: '1px solid #1e293b', borderTop: 'none' }}>
                {row.description && (
                  <div style={{ color: '#64748b', fontSize: 10, marginBottom: 8 }}>{row.description.slice(0, 120)}{row.description.length > 120 ? '…' : ''}</div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Datasets */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#10b981', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>DATASETS ({row.matchedDatasets.length})</div>
                    {row.matchedDatasets.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched datasets.</div>
                      : row.matchedDatasets.slice(0, 5).map(d => (
                        <div key={d.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(d.score * 400, 100)}%`, height: '100%', background: '#10b981' }} />
                            </div>
                            {d.kind && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(16,185,129,0.1)', borderRadius: 3, padding: '1px 4px' }}>{d.kind.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{d.label}</div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Investigations */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>INVESTIGATIONS ({row.matchedInvestigations.length})</div>
                    {row.matchedInvestigations.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched investigations.</div>
                      : row.matchedInvestigations.slice(0, 5).map(inv => (
                        <div key={inv.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(inv.score * 400, 100)}%`, height: '100%', background: '#a78bfa' }} />
                            </div>
                            {inv.status && (
                              <span style={{
                                color: STATUS_COLOR[inv.status?.toLowerCase()] || '#94a3b8',
                                fontSize: 9, background: 'rgba(167,139,250,0.1)', borderRadius: 3, padding: '1px 4px', fontWeight: 700,
                              }}>{inv.status.toUpperCase()}</span>
                            )}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{inv.label}</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                <button
                  onClick={() => assess(row)}
                  disabled={assessing === row.id}
                  style={{
                    marginTop: 8, background: 'rgba(6,182,212,0.1)', border: '1px solid #06b6d444',
                    borderRadius: 4, color: '#06b6d4', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
                    opacity: assessing === row.id ? 0.5 : 1,
                  }}
                >
                  {assessing === row.id ? 'ASSESSING…' : '⬡ ASSESS'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
