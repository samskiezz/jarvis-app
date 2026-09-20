import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const KLIANN_RE = /\b(kliann|knowledge\s+live\s+annotation|kb\s+live\s+annotation|knowledge\s+annotation\s+live|knowledge\s+world\s+annotation|live\s+knowledge\s+annotation|knowledge\s+annotation\s+world|wired\s+knowledge|dormant\s+knowledge\s+live|knowledge\s+live\s+world\s+annotation|kb\s+annotation\s+live|knowledge\s+intel\s+annotation|live\s+kb\s+annotation)\b/i;

export function isKliannQuery(t) {
  return KLIANN_RE.test(t || '');
}

export async function buildKliannScript() {
  try {
    const [kbRes, liRes, annRes] = await Promise.all([
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
    ]);
    const items = normaliseKnowledge(kbRes);
    const liveEvents = normaliseLiveIntel(liRes);
    const annotations = normaliseAnnotations(annRes);
    const classified = items.map(k => classifyKnowledge(k, liveEvents, annotations));
    const fullyWired = classified.filter(k => k.state === 'FULLY_WIRED').length;
    const dormant = classified.filter(k => k.state === 'DORMANT').length;
    return `KLIANN analysis: ${items.length} knowledge articles cross-referenced against ${liveEvents.length} live world events and ${annotations.length} graph annotations. ${fullyWired} articles are FULLY WIRED with both live world event context and graph annotation backing. ${dormant} articles are DORMANT — no live intel or annotation coverage — representing knowledge isolation gaps with no current world event or graph-level backing.`;
  } catch {
    return 'KLIANN data unavailable — check /knowledge/, /functions/getLiveIntel, and /v1/graph/annotations endpoints.';
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

function normaliseKnowledge(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.articles) ? raw.articles
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : Array.isArray(raw.knowledge) ? raw.knowledge
    : [];
  return arr.map((k, i) => ({
    id: k.id || k._id || `kb-${i}`,
    label: k.title || k.name || k.subject || `Article ${i + 1}`,
    category: k.category || k.type || k.kind || '',
    summary: k.summary || k.description || k.content || k.excerpt || '',
    tags: Array.isArray(k.tags) ? k.tags.join(' ') : String(k.tags || ''),
    _searchText: [k.title, k.name, k.subject, k.category, k.type, k.kind, k.summary, k.description, k.content, k.excerpt, k.source, k.tags].filter(Boolean).join(' '),
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

function classifyKnowledge(item, liveEvents, annotations) {
  const toks = tok(item._searchText);
  const liveMatches = liveEvents
    .map(e => ({ ...e, score: Math.max(matchScore(toks, e._searchText), matchScore(tok(e._searchText), item._searchText)) }))
    .filter(e => e.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const annMatches = annotations
    .map(a => ({ ...a, score: Math.max(matchScore(toks, a._searchText), matchScore(tok(a._searchText), item._searchText)) }))
    .filter(a => a.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasLive = liveMatches.length > 0;
  const hasAnn = annMatches.length > 0;
  let state;
  if (hasLive && hasAnn) state = 'FULLY_WIRED';
  else if (hasLive) state = 'WORLD_TRIGGERED';
  else if (hasAnn) state = 'GRAPH_TAGGED';
  else state = 'DORMANT';
  return { ...item, state, liveMatches, annMatches };
}

const STATE_LABELS = {
  FULLY_WIRED: 'FULLY WIRED',
  WORLD_TRIGGERED: 'WORLD-TRIGGERED',
  GRAPH_TAGGED: 'GRAPH-TAGGED',
  DORMANT: 'DORMANT',
};

const TYPE_COLORS = { SEISMIC: '#ef4444', CRYPTO: '#f59e0b', FX: '#10b981', INTEL: '#6366f1' };

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function KnowledgeLiveAnnotationTriple() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
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
      const [kbRes, liRes, annRes] = await Promise.all([
        fetch(`${API}/knowledge/`, { headers }),
        fetch(`${API}/functions/getLiveIntel`, { headers }),
        fetch(`${API}/v1/graph/annotations`, { headers }),
      ]);
      const [kbJson, liJson, annJson] = await Promise.all([kbRes.json(), liRes.json(), annRes.json()]);
      const kb = normaliseKnowledge(kbJson);
      const li = normaliseLiveIntel(liJson);
      const ann = normaliseAnnotations(annJson);
      setItems(kb);
      setLiveEvents(li);
      setAnnotations(ann);
      setClassified(kb.map(k => classifyKnowledge(k, li, ann)));
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
    window.addEventListener('jarvis:kliann-toggle', handler);
    return () => window.removeEventListener('jarvis:kliann-toggle', handler);
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
      if (KLIANN_RE.test(q)) { setOpen(true); }
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_WIRED: classified.filter(k => k.state === 'FULLY_WIRED').length,
    WORLD_TRIGGERED: classified.filter(k => k.state === 'WORLD_TRIGGERED').length,
    GRAPH_TAGGED: classified.filter(k => k.state === 'GRAPH_TAGGED').length,
    DORMANT: classified.filter(k => k.state === 'DORMANT').length,
  };

  const visible = classified.filter(k => {
    if (filter !== 'ALL' && k.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return k._searchText.toLowerCase().includes(q) || k.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `KLIANN Knowledge × Live Intel × Graph Annotation Triple Coverage: ${items.length} knowledge articles cross-referenced against ${liveEvents.length} live world events and ${annotations.length} graph annotations. Coverage: FULLY WIRED=${counts.FULLY_WIRED}, WORLD-TRIGGERED=${counts.WORLD_TRIGGERED}, GRAPH-TAGGED=${counts.GRAPH_TAGGED}, DORMANT=${counts.DORMANT}. In 2 sentences, assess knowledge base live-world coverage and identify the most critical dormant articles requiring immediate live intel or graph annotation to restore operational intelligence currency.`;
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

  const wiredPct = classified.length ? Math.round((counts.FULLY_WIRED / classified.length) * 100) : 0;
  const worldPct = classified.length ? Math.round((counts.WORLD_TRIGGERED / classified.length) * 100) : 0;
  const tagPct = classified.length ? Math.round((counts.GRAPH_TAGGED / classified.length) * 100) : 0;
  const dormPct = classified.length ? Math.round((counts.DORMANT / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 839200, bottom: 8, zIndex: 527,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #0f4c75',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(15,76,117,0.4)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 13 }}>◈ KLIANN</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Knowledge × Live Intel × Graph Annotation Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#4ade80', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'KB ARTICLES', val: items.length, color: '#4ade80' },
          { label: 'LIVE EVENTS', val: liveEvents.length, color: '#fb923c' },
          { label: 'ANNOTATIONS', val: annotations.length, color: '#818cf8' },
          { label: 'FULLY WIRED', val: counts.FULLY_WIRED, color: '#4ade80', badge: counts.FULLY_WIRED > 0 },
          { label: 'WORLD-TRIG', val: counts.WORLD_TRIGGERED, color: '#fb923c' },
          { label: 'GRAPH-TAGGED', val: counts.GRAPH_TAGGED, color: '#818cf8' },
          { label: 'DORMANT', val: counts.DORMANT, color: '#6b7280', badge: counts.DORMANT > 0 },
          { label: 'COVERAGE', val: `${wiredPct}%`, color: '#22d3ee' },
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
          <span style={{ marginLeft: 'auto', color: '#4ade80' }}>{wiredPct}% fully wired</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {wiredPct > 0 && <div style={{ width: `${wiredPct}%`, background: '#4ade80' }} />}
          {worldPct > 0 && <div style={{ width: `${worldPct}%`, background: '#fb923c' }} />}
          {tagPct > 0 && <div style={{ width: `${tagPct}%`, background: '#818cf8' }} />}
          {dormPct > 0 && <div style={{ width: `${dormPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#4ade80' }}>● FULLY WIRED</span>
          <span style={{ color: '#fb923c' }}>● WORLD-TRIGGERED</span>
          <span style={{ color: '#818cf8' }}>● GRAPH-TAGGED</span>
          <span style={{ color: '#374151' }}>● DORMANT</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_WIRED', 'WORLD_TRIGGERED', 'GRAPH_TAGGED', 'DORMANT'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#0c3852' : '#0f172a',
            border: `1px solid ${filter === f ? '#4ade80' : '#1e293b'}`,
            color: filter === f ? '#86efac' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search knowledge…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No knowledge articles match current filter.</div>
        )}
        {visible.map(k => {
          const stateColor = k.state === 'FULLY_WIRED' ? '#4ade80' : k.state === 'WORLD_TRIGGERED' ? '#fb923c' : k.state === 'GRAPH_TAGGED' ? '#818cf8' : '#6b7280';
          const isExp = expanded === k.id;
          return (
            <div key={k.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#0f4c75' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : k.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 130 }}>{STATE_LABELS[k.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{k.label}</span>
                {k.category && <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{k.category}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  {k.summary && <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, marginTop: 6 }}>{k.summary.slice(0, 160)}{k.summary.length > 160 ? '…' : ''}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Live Intel pane */}
                    <div>
                      <div style={{ color: '#fb923c', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>LIVE INTEL ({k.liveMatches.length})</div>
                      {k.liveMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No live intel coverage</div>
                        : k.liveMatches.slice(0, 6).map(e => (
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
                      <div style={{ color: '#818cf8', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>GRAPH ANNOTATIONS ({k.annMatches.length})</div>
                      {k.annMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No annotation coverage</div>
                        : k.annMatches.slice(0, 6).map(a => (
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
            background: assessing ? '#1e293b' : '#0c3852', border: '1px solid #4ade80',
            color: assessing ? '#475569' : '#86efac', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
