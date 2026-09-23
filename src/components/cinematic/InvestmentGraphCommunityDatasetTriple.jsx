import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IGCDS_RE = /\b(igcds|investment\s+graph\s+community\s+dataset|investment\s+community\s+dataset|portfolio\s+graph\s+community|portfolio\s+community\s+dataset|community\s+backed\s+investment|charted\s+investment|investment\s+graph\s+community|investment\s+community\s+data|uncharted\s+investment|investment\s+data\s+community)\b/i;
const THRESHOLD = 0.07;

export function isIgcdsQuery(t) {
  return IGCDS_RE.test(t || '');
}

export async function buildIgcdsScript() {
  try {
    const [invRes, commRes, dsRes] = await Promise.all([
      fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
    ]);
    const investments = normaliseInvestments(invRes);
    const communities = normaliseCommunities(commRes);
    const datasets = normaliseDatasets(dsRes);
    const classified = investments.map(inv => classifyInvestment(inv, communities, datasets));
    const fullyCharted = classified.filter(i => i.state === 'FULLY_CHARTED').length;
    const uncharted = classified.filter(i => i.state === 'UNCHARTED').length;
    return `IGCDS analysis: ${investments.length} investments cross-referenced against ${communities.length} graph network communities and ${datasets.length} datasets. ${fullyCharted} investments are FULLY CHARTED — both network community context and dataset backing confirmed. ${uncharted} investments are UNCHARTED — no network community or dataset coverage detected, representing portfolio intelligence gaps requiring immediate community mapping or data source onboarding.`;
  } catch {
    return 'IGCDS data unavailable — check /entities/Investment, /v1/graph/communities, and /v1/datasets endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fSet = new Set(tok(fieldText));
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id: inv.id || inv._id || `inv-${i}`,
    label: inv.name || inv.title || inv.company || `Investment ${i + 1}`,
    sector: inv.sector || inv.industry || inv.category || '',
    ticker: inv.ticker || inv.symbol || '',
    status: inv.status || inv.stage || '',
    _searchText: [inv.name, inv.title, inv.company, inv.sector, inv.industry, inv.ticker, inv.symbol, inv.notes, inv.description, inv.tags].filter(Boolean).join(' '),
  }));
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.communities) ? raw.communities
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `com-${i}`,
    label: c.name || c.label || c.title || `Community ${i + 1}`,
    type: c.type || c.category || c.kind || '',
    _searchText: [c.name, c.label, c.title, c.type, c.category, c.description, c.tags, c.summary].filter(Boolean).join(' '),
  }));
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : Array.isArray(raw.datasets) ? raw.datasets
    : [];
  return arr.map((d, i) => ({
    id: d.id || d._id || `ds-${i}`,
    label: d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    kind: d.kind || d.type || d.category || '',
    rows: d.row_count || d.rows || d.count || null,
    _searchText: [d.name, d.title, d.dataset_name, d.kind, d.type, d.category, d.description, d.tags].filter(Boolean).join(' '),
  }));
}

function classifyInvestment(inv, communities, datasets) {
  const toks = tok(inv._searchText);
  const commMatches = communities
    .map(c => ({ ...c, score: Math.max(matchScore(toks, c._searchText), matchScore(tok(c._searchText), inv._searchText)) }))
    .filter(c => c.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const dsMatches = datasets
    .map(d => ({ ...d, score: Math.max(matchScore(toks, d._searchText), matchScore(tok(d._searchText), inv._searchText)) }))
    .filter(d => d.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasCom = commMatches.length > 0;
  const hasDs = dsMatches.length > 0;
  let state;
  if (hasCom && hasDs) state = 'FULLY_CHARTED';
  else if (hasCom) state = 'COMMUNITY_MAPPED';
  else if (hasDs) state = 'DATA_BACKED';
  else state = 'UNCHARTED';
  return { ...inv, state, commMatches, dsMatches };
}

const STATE_LABELS = {
  FULLY_CHARTED: 'FULLY CHARTED',
  COMMUNITY_MAPPED: 'COMMUNITY-MAPPED',
  DATA_BACKED: 'DATA-BACKED',
  UNCHARTED: 'UNCHARTED',
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function InvestmentGraphCommunityDatasetTriple() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [datasets, setDatasets] = useState([]);
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
      const [invRes, commRes, dsRes] = await Promise.all([
        fetch(`${API}/entities/Investment`, { headers }),
        fetch(`${API}/v1/graph/communities`, { headers }),
        fetch(`${API}/v1/datasets`, { headers }),
      ]);
      const [invJson, commJson, dsJson] = await Promise.all([invRes.json(), commRes.json(), dsRes.json()]);
      const invs = normaliseInvestments(invJson);
      const coms = normaliseCommunities(commJson);
      const dss = normaliseDatasets(dsJson);
      setInvestments(invs);
      setCommunities(coms);
      setDatasets(dss);
      setClassified(invs.map(inv => classifyInvestment(inv, coms, dss)));
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
    window.addEventListener('jarvis:igcds-toggle', handler);
    return () => window.removeEventListener('jarvis:igcds-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (IGCDS_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_CHARTED: classified.filter(i => i.state === 'FULLY_CHARTED').length,
    COMMUNITY_MAPPED: classified.filter(i => i.state === 'COMMUNITY_MAPPED').length,
    DATA_BACKED: classified.filter(i => i.state === 'DATA_BACKED').length,
    UNCHARTED: classified.filter(i => i.state === 'UNCHARTED').length,
  };

  const visible = classified.filter(inv => {
    if (filter !== 'ALL' && inv.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return inv._searchText.toLowerCase().includes(q) || inv.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `IGCDS Investment × Graph Community × Dataset Triple Coverage: ${investments.length} investments cross-referenced against ${communities.length} graph network communities and ${datasets.length} datasets. Coverage: FULLY CHARTED=${counts.FULLY_CHARTED}, COMMUNITY-MAPPED=${counts.COMMUNITY_MAPPED}, DATA-BACKED=${counts.DATA_BACKED}, UNCHARTED=${counts.UNCHARTED}. In 2 sentences, assess portfolio network and data intelligence coverage and identify the most critical uncharted investments that lack both network community context and dataset backing.`;
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

  const chartedPct = classified.length ? Math.round((counts.FULLY_CHARTED / classified.length) * 100) : 0;
  const comPct = classified.length ? Math.round((counts.COMMUNITY_MAPPED / classified.length) * 100) : 0;
  const dsPct = classified.length ? Math.round((counts.DATA_BACKED / classified.length) * 100) : 0;
  const unchartedPct = classified.length ? Math.round((counts.UNCHARTED / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 844240, bottom: 8, zIndex: 536,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #1e3a5f',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(30,58,95,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13 }}>◈ IGCDS</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Investment × Graph Community × Dataset Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#38bdf8', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'INVESTMENTS', val: investments.length, color: '#e2e8f0' },
          { label: 'COMMUNITIES', val: communities.length, color: '#34d399' },
          { label: 'DATASETS', val: datasets.length, color: '#818cf8' },
          { label: 'FULLY CHARTED', val: counts.FULLY_CHARTED, color: '#38bdf8', badge: counts.FULLY_CHARTED > 0 },
          { label: 'COMM-MAPPED', val: counts.COMMUNITY_MAPPED, color: '#34d399' },
          { label: 'DATA-BACKED', val: counts.DATA_BACKED, color: '#818cf8' },
          { label: 'UNCHARTED', val: counts.UNCHARTED, color: '#6b7280', badge: counts.UNCHARTED > 0 },
          { label: 'CHARTED %', val: `${chartedPct}%`, color: '#38bdf8' },
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
          <span style={{ marginLeft: 'auto', color: '#38bdf8' }}>{chartedPct}% fully charted</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {chartedPct > 0 && <div style={{ width: `${chartedPct}%`, background: '#38bdf8' }} />}
          {comPct > 0 && <div style={{ width: `${comPct}%`, background: '#34d399' }} />}
          {dsPct > 0 && <div style={{ width: `${dsPct}%`, background: '#818cf8' }} />}
          {unchartedPct > 0 && <div style={{ width: `${unchartedPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#38bdf8' }}>● FULLY CHARTED</span>
          <span style={{ color: '#34d399' }}>● COMMUNITY-MAPPED</span>
          <span style={{ color: '#818cf8' }}>● DATA-BACKED</span>
          <span style={{ color: '#374151' }}>● UNCHARTED</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_CHARTED', 'COMMUNITY_MAPPED', 'DATA_BACKED', 'UNCHARTED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#0c1e3a' : '#0f172a',
            border: `1px solid ${filter === f ? '#38bdf8' : '#1e293b'}`,
            color: filter === f ? '#7dd3fc' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No investments match current filter.</div>
        )}
        {visible.map(inv => {
          const stateColor = inv.state === 'FULLY_CHARTED' ? '#38bdf8' : inv.state === 'COMMUNITY_MAPPED' ? '#34d399' : inv.state === 'DATA_BACKED' ? '#818cf8' : '#6b7280';
          const isExp = expanded === inv.id;
          return (
            <div key={inv.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#1e3a5f' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : inv.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 180 }}>{STATE_LABELS[inv.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{inv.label}</span>
                {inv.sector && <span style={{ background: '#0f172a', color: '#fbbf24', border: '1px solid #451a03', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{inv.sector}</span>}
                {inv.ticker && <span style={{ background: '#0f172a', color: '#22d3ee', border: '1px solid #164e63', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{inv.ticker}</span>}
                {inv.status && <span style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid #334155', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{inv.status}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Graph Communities pane */}
                    <div>
                      <div style={{ color: '#34d399', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>GRAPH COMMUNITIES ({inv.commMatches.length})</div>
                      {inv.commMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No network community coverage</div>
                        : inv.commMatches.slice(0, 6).map(c => (
                          <div key={c.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#6ee7b7', fontSize: 11 }}>{c.label.slice(0, 42)}{c.label.length > 42 ? '…' : ''}</span>
                              {c.type && <span style={{ background: '#022c22', color: '#34d399', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{c.type}</span>}
                            </div>
                            <ScoreBar score={c.score} color="#34d399" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Datasets pane */}
                    <div>
                      <div style={{ color: '#818cf8', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>DATASETS ({inv.dsMatches.length})</div>
                      {inv.dsMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No dataset coverage</div>
                        : inv.dsMatches.slice(0, 6).map(d => (
                          <div key={d.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#a5b4fc', fontSize: 11 }}>{d.label.slice(0, 36)}{d.label.length > 36 ? '…' : ''}</span>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                {d.kind && <span style={{ background: '#1e1b4b', color: '#818cf8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{d.kind}</span>}
                                {d.rows != null && <span style={{ color: '#475569', fontSize: 9 }}>{d.rows.toLocaleString()}r</span>}
                              </div>
                            </div>
                            <ScoreBar score={d.score} color="#818cf8" />
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
            background: assessing ? '#1e293b' : '#0c1e3a', border: '1px solid #38bdf8',
            color: assessing ? '#475569' : '#7dd3fc', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
