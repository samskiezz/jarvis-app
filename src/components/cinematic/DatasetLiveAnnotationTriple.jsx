import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const DLGANN_RE = /\b(dlgann|dataset\s+live\s+annotation|dataset\s+annotation\s+live|dataset\s+world\s+annotation|live\s+annotation\s+dataset|data\s+live\s+annotation|dataset\s+intel\s+annotation|annotation\s+dataset\s+live|live\s+dataset\s+annotation|world\s+dataset\s+annotation|dataset\s+graph\s+annotation\s+live|dark\s+dataset\s+annotation|armed\s+dataset\s+annotation|dataset\s+annotation\s+world|dataset\s+live\s+world)\b/i;

export function isDlgannQuery(t) {
  return DLGANN_RE.test(t || '');
}

export async function buildDlgannScript() {
  try {
    const [dsRes, liRes, annRes] = await Promise.all([
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
    ]);
    const datasets = normaliseDatasets(dsRes);
    const liveEvents = normaliseLiveIntel(liRes);
    const annotations = normaliseAnnotations(annRes);
    const classified = datasets.map(d => classifyDataset(d, liveEvents, annotations));
    const fullyArmed = classified.filter(d => d.state === 'FULLY_ARMED').length;
    const dark = classified.filter(d => d.state === 'DARK').length;
    return `DLGANN analysis: ${datasets.length} datasets cross-referenced against ${liveEvents.length} live world events and ${annotations.length} graph annotations. ${fullyArmed} datasets are FULLY ARMED with both live world event context and graph annotation backing. ${dark} datasets are DARK — no live intel or annotation coverage — representing intelligence blind spots with no operational or graph-level backing.`;
  } catch {
    return 'DLGANN data unavailable — check /v1/datasets, /functions/getLiveIntel, and /v1/graph/annotations endpoints.';
  }
}

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
    description: d.description || d.summary || d.details || '',
    source: d.source || d.provider || d.origin || '',
    tags: Array.isArray(d.tags) ? d.tags.join(' ') : String(d.tags || ''),
    _searchText: [d.name, d.title, d.dataset_name, d.kind, d.type, d.category, d.description, d.summary, d.source, d.provider, d.tags].filter(Boolean).join(' '),
  }));
}

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.events) ? raw.events
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.intel) ? raw.intel
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((e, i) => {
    const type = e.type || e.category || (e.mag !== undefined ? 'SEISMIC' : e.symbol ? 'CRYPTO' : e.pair ? 'FX' : 'INTEL');
    const label = e.place || e.location || e.symbol || e.pair || e.name || e.title || `Event ${i + 1}`;
    const searchText = [e.place, e.location, e.symbol, e.pair, e.name, e.title, e.type, e.category, e.description].filter(Boolean).join(' ');
    return { id: e.id || e._id || `li-${i}`, label, type, magnitude: e.mag, _searchText: searchText };
  });
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
    label: a.text || a.label || a.name || a.content || `Annotation ${i + 1}`,
    targetType: a.target_type || a.targetType || a.type || a.category || '',
    actor: a.actor || a.author || a.created_by || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : String(a.tags || ''),
    _searchText: [a.text, a.label, a.name, a.content, a.target_type, a.targetType, a.type, a.category, a.actor, a.author, a.tags].filter(Boolean).join(' '),
  }));
}

function classifyDataset(dataset, liveEvents, annotations) {
  const toks = tok(dataset._searchText);
  const liveMatches = liveEvents
    .map(e => ({ ...e, score: Math.max(matchScore(toks, e._searchText), matchScore(tok(e._searchText), dataset._searchText)) }))
    .filter(e => e.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const annMatches = annotations
    .map(a => ({ ...a, score: Math.max(matchScore(toks, a._searchText), matchScore(tok(a._searchText), dataset._searchText)) }))
    .filter(a => a.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasLive = liveMatches.length > 0;
  const hasAnn = annMatches.length > 0;
  let state;
  if (hasLive && hasAnn) state = 'FULLY_ARMED';
  else if (hasLive) state = 'WORLD_TRIGGERED';
  else if (hasAnn) state = 'GRAPH_TAGGED';
  else state = 'DARK';
  return { ...dataset, state, liveMatches, annMatches };
}

const STATE_LABELS = {
  FULLY_ARMED: 'FULLY ARMED',
  WORLD_TRIGGERED: 'WORLD-TRIGGERED',
  GRAPH_TAGGED: 'GRAPH-TAGGED',
  DARK: 'DARK',
};

const TYPE_COLORS = { SEISMIC: '#ef4444', CRYPTO: '#f59e0b', FX: '#10b981', INTEL: '#6366f1' };

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function DatasetLiveAnnotationTriple() {
  const [open, setOpen] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      const [dsRes, liRes, annRes] = await Promise.all([
        fetch(`${API}/v1/datasets`, { headers }),
        fetch(`${API}/functions/getLiveIntel`, { headers }),
        fetch(`${API}/v1/graph/annotations`, { headers }),
      ]);
      const [dsJson, liJson, annJson] = await Promise.all([dsRes.json(), liRes.json(), annRes.json()]);
      const ds = normaliseDatasets(dsJson);
      const li = normaliseLiveIntel(liJson);
      const ann = normaliseAnnotations(annJson);
      setDatasets(ds);
      setLiveEvents(li);
      setAnnotations(ann);
      setClassified(ds.map(d => classifyDataset(d, li, ann)));
    } catch (e) {
      setError('Fetch failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:dlgann-toggle', handler);
    return () => window.removeEventListener('jarvis:dlgann-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (DLGANN_RE.test(q)) { setOpen(true); }
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_ARMED: classified.filter(d => d.state === 'FULLY_ARMED').length,
    WORLD_TRIGGERED: classified.filter(d => d.state === 'WORLD_TRIGGERED').length,
    GRAPH_TAGGED: classified.filter(d => d.state === 'GRAPH_TAGGED').length,
    DARK: classified.filter(d => d.state === 'DARK').length,
  };

  const visible = classified.filter(d => {
    if (filter !== 'ALL' && d.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return d._searchText.toLowerCase().includes(q) || d.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `DLGANN Dataset × Live Intel × Graph Annotation Triple Coverage: ${datasets.length} datasets cross-referenced against ${liveEvents.length} live world events and ${annotations.length} graph annotations. Coverage: FULLY ARMED=${counts.FULLY_ARMED}, WORLD-TRIGGERED=${counts.WORLD_TRIGGERED}, GRAPH-TAGGED=${counts.GRAPH_TAGGED}, DARK=${counts.DARK}. In 2 sentences, assess dataset operational coverage and identify the most critical blind spots requiring immediate live intel correlation or graph annotation.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const armedPct = classified.length ? Math.round((counts.FULLY_ARMED / classified.length) * 100) : 0;
  const worldPct = classified.length ? Math.round((counts.WORLD_TRIGGERED / classified.length) * 100) : 0;
  const tagPct = classified.length ? Math.round((counts.GRAPH_TAGGED / classified.length) * 100) : 0;
  const darkPct = classified.length ? Math.round((counts.DARK / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 838080, bottom: 8, zIndex: 525,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #0f4c75',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(15,76,117,0.4)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 13 }}>◈ DLGANN</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Dataset × Live Intel × Graph Annotation Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#22d3ee', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'DATASETS', val: datasets.length, color: '#22d3ee' },
          { label: 'LIVE EVENTS', val: liveEvents.length, color: '#fb923c' },
          { label: 'ANNOTATIONS', val: annotations.length, color: '#818cf8' },
          { label: 'FULLY ARMED', val: counts.FULLY_ARMED, color: '#22d3ee', badge: counts.FULLY_ARMED > 0 },
          { label: 'WORLD-TRIG', val: counts.WORLD_TRIGGERED, color: '#fb923c' },
          { label: 'GRAPH-TAGGED', val: counts.GRAPH_TAGGED, color: '#818cf8' },
          { label: 'DARK', val: counts.DARK, color: '#6b7280', badge: counts.DARK > 0 },
          { label: 'COVERAGE', val: `${armedPct}%`, color: '#4ade80' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
          <span>Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#22d3ee' }}>{armedPct}% fully armed</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {armedPct > 0 && <div style={{ width: `${armedPct}%`, background: '#22d3ee' }} />}
          {worldPct > 0 && <div style={{ width: `${worldPct}%`, background: '#fb923c' }} />}
          {tagPct > 0 && <div style={{ width: `${tagPct}%`, background: '#818cf8' }} />}
          {darkPct > 0 && <div style={{ width: `${darkPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#22d3ee' }}>● FULLY ARMED</span>
          <span style={{ color: '#fb923c' }}>● WORLD-TRIGGERED</span>
          <span style={{ color: '#818cf8' }}>● GRAPH-TAGGED</span>
          <span style={{ color: '#374151' }}>● DARK</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_ARMED', 'WORLD_TRIGGERED', 'GRAPH_TAGGED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#0c3852' : '#0f172a',
            border: `1px solid ${filter === f ? '#22d3ee' : '#1e293b'}`,
            color: filter === f ? '#67e8f9' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search datasets…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No datasets match current filter.</div>
        )}
        {visible.map(d => {
          const stateColor = d.state === 'FULLY_ARMED' ? '#22d3ee' : d.state === 'WORLD_TRIGGERED' ? '#fb923c' : d.state === 'GRAPH_TAGGED' ? '#818cf8' : '#6b7280';
          const isExp = expanded === d.id;
          return (
            <div key={d.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#0f4c75' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : d.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 130 }}>{STATE_LABELS[d.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{d.label}</span>
                {d.kind && <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{d.kind}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  {d.source && <div style={{ fontSize: 10, color: '#64748b', margin: '6px 0' }}>Source: <span style={{ color: '#94a3b8' }}>{d.source}</span></div>}
                  {d.description && <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>{d.description.slice(0, 140)}{d.description.length > 140 ? '…' : ''}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Live Intel pane */}
                    <div>
                      <div style={{ color: '#fb923c', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>LIVE INTEL ({d.liveMatches.length})</div>
                      {d.liveMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No live intel coverage</div>
                        : d.liveMatches.slice(0, 6).map(e => (
                          <div key={e.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#fdba74', fontSize: 11 }}>{e.label}</span>
                              <span style={{ background: '#431407', color: TYPE_COLORS[e.type] || '#fb923c', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{e.type}</span>
                            </div>
                            <ScoreBar score={e.score} color="#fb923c" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Graph Annotations pane */}
                    <div>
                      <div style={{ color: '#818cf8', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>GRAPH ANNOTATIONS ({d.annMatches.length})</div>
                      {d.annMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No annotation coverage</div>
                        : d.annMatches.slice(0, 6).map(a => (
                          <div key={a.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#a5b4fc', fontSize: 11 }}>{a.label.slice(0, 50)}{a.label.length > 50 ? '…' : ''}</span>
                              {a.targetType && <span style={{ background: '#1e1b4b', color: '#818cf8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{a.targetType}</span>}
                            </div>
                            <ScoreBar score={a.score} color="#818cf8" />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        {assessment && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessment}</div>}
        <button
          onClick={assess}
          disabled={assessing || classified.length === 0}
          style={{
            background: assessing ? '#1e293b' : '#0c3852', border: '1px solid #22d3ee',
            color: assessing ? '#475569' : '#67e8f9', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
