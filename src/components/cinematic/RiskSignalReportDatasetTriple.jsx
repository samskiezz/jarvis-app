import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RRDS_RE = /\b(rrds|risk\s+report\s+dataset|risk\s+dataset\s+report|risk\s+evidence|evidenced\s+risk\w*|risk\s+data\s+report|report\s+dataset\s+risk|risk\s+backed\s+by\s+data|untracked\s+risk\w*|risk\s+without\s+data|risk\s+data\s+coverage|risk\s+report\s+data)\b/i;
const THRESHOLD = 0.07;

export function isRrdsQuery(t) {
  return RRDS_RE.test(t || '');
}

export async function buildRrdsScript() {
  try {
    const [riskRes, repRes, dsRes] = await Promise.all([
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
    ]);
    const signals = normaliseSignals(riskRes);
    const reports = normaliseReports(repRes);
    const datasets = normaliseDatasets(dsRes);
    const classified = signals.map(s => classifySignal(s, reports, datasets));
    const fullyEvidenced = classified.filter(s => s.state === 'FULLY_EVIDENCED').length;
    const untracked = classified.filter(s => s.state === 'UNTRACKED').length;
    return `RRDS analysis: ${signals.length} risk signals cross-referenced against ${reports.length} intelligence reports and ${datasets.length} datasets. ${fullyEvidenced} signals are FULLY EVIDENCED — both report documentation and dataset backing confirmed. ${untracked} signals are UNTRACKED — no report or dataset coverage detected, representing critical intelligence gaps requiring immediate documentation and data sourcing.`;
  } catch {
    return 'RRDS data unavailable — check /entities/RiskSignal, /v1/reports, and /v1/datasets endpoints.';
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

function normaliseSignals(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : Array.isArray(raw.signals) ? raw.signals
    : [];
  return arr.map((s, i) => ({
    id: s.id || s._id || `sig-${i}`,
    label: s.name || s.title || s.signal || `Risk Signal ${i + 1}`,
    severity: s.severity || s.level || s.priority || '',
    category: s.category || s.type || s.sector || '',
    _searchText: [s.name, s.title, s.signal, s.category, s.type, s.sector, s.source, s.description, s.tags, s.actor, s.region].filter(Boolean).join(' '),
  }));
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.reports) ? raw.reports
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((r, i) => ({
    id: r.id || r._id || `rep-${i}`,
    label: r.title || r.name || r.subject || `Report ${i + 1}`,
    type: r.type || r.kind || r.category || '',
    _searchText: [r.title, r.name, r.subject, r.summary, r.description, r.tags, r.category, r.type, r.content, r.author].filter(Boolean).join(' '),
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
    label: d.name || d.title || d.dataset || `Dataset ${i + 1}`,
    kind: d.type || d.kind || d.category || '',
    rows: d.row_count || d.rows || d.count || null,
    _searchText: [d.name, d.title, d.dataset, d.description, d.tags, d.type, d.kind, d.category, d.source].filter(Boolean).join(' '),
  }));
}

function classifySignal(signal, reports, datasets) {
  const toks = tok(signal._searchText);
  const reportMatches = reports
    .map(r => ({ ...r, score: Math.max(matchScore(toks, r._searchText), matchScore(tok(r._searchText), signal._searchText)) }))
    .filter(r => r.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const datasetMatches = datasets
    .map(d => ({ ...d, score: Math.max(matchScore(toks, d._searchText), matchScore(tok(d._searchText), signal._searchText)) }))
    .filter(d => d.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasReport = reportMatches.length > 0;
  const hasDataset = datasetMatches.length > 0;
  let state;
  if (hasReport && hasDataset) state = 'FULLY_EVIDENCED';
  else if (hasReport) state = 'REPORTED_ONLY';
  else if (hasDataset) state = 'DATA_BACKED';
  else state = 'UNTRACKED';
  return { ...signal, state, reportMatches, datasetMatches };
}

const STATE_LABELS = {
  FULLY_EVIDENCED: 'FULLY EVIDENCED',
  REPORTED_ONLY: 'REPORTED-ONLY',
  DATA_BACKED: 'DATA-BACKED',
  UNTRACKED: 'UNTRACKED',
};

const SEV_COLOR = { critical: '#f87171', high: '#fb923c', medium: '#fbbf24', low: '#4ade80', info: '#22d3ee' };

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function RiskSignalReportDatasetTriple() {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState([]);
  const [reports, setReports] = useState([]);
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
      const [riskRes, repRes, dsRes] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`, { headers }),
        fetch(`${API}/v1/reports`, { headers }),
        fetch(`${API}/v1/datasets`, { headers }),
      ]);
      const [riskJson, repJson, dsJson] = await Promise.all([riskRes.json(), repRes.json(), dsRes.json()]);
      const sigs = normaliseSignals(riskJson);
      const reps = normaliseReports(repJson);
      const dss = normaliseDatasets(dsJson);
      setSignals(sigs);
      setReports(reps);
      setDatasets(dss);
      setClassified(sigs.map(s => classifySignal(s, reps, dss)));
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
    window.addEventListener('jarvis:rrds-toggle', handler);
    return () => window.removeEventListener('jarvis:rrds-toggle', handler);
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
      if (RRDS_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_EVIDENCED: classified.filter(s => s.state === 'FULLY_EVIDENCED').length,
    REPORTED_ONLY: classified.filter(s => s.state === 'REPORTED_ONLY').length,
    DATA_BACKED: classified.filter(s => s.state === 'DATA_BACKED').length,
    UNTRACKED: classified.filter(s => s.state === 'UNTRACKED').length,
  };

  const visible = classified.filter(sig => {
    if (filter !== 'ALL' && sig.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return sig._searchText.toLowerCase().includes(q) || sig.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `RRDS RiskSignal × Report × Dataset Triple Coverage: ${signals.length} risk signals cross-referenced against ${reports.length} reports and ${datasets.length} datasets. Coverage: FULLY EVIDENCED=${counts.FULLY_EVIDENCED}, REPORTED-ONLY=${counts.REPORTED_ONLY}, DATA-BACKED=${counts.DATA_BACKED}, UNTRACKED=${counts.UNTRACKED}. In 2 sentences, assess risk signal evidence coverage gaps and identify the most critical untracked signals lacking both intelligence report documentation and dataset backing.`;
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

  const evidencedPct = classified.length ? Math.round((counts.FULLY_EVIDENCED / classified.length) * 100) : 0;
  const reportedPct = classified.length ? Math.round((counts.REPORTED_ONLY / classified.length) * 100) : 0;
  const dataPct = classified.length ? Math.round((counts.DATA_BACKED / classified.length) * 100) : 0;
  const untrackedPct = classified.length ? Math.round((counts.UNTRACKED / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 845920, bottom: 8, zIndex: 539,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #3b1414',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(95,30,30,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#f87171', fontWeight: 700, fontSize: 13 }}>◈ RRDS</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>RiskSignal × Report × Dataset Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#f87171', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'RISK SIGNALS', val: signals.length, color: '#e2e8f0' },
          { label: 'REPORTS', val: reports.length, color: '#f97316' },
          { label: 'DATASETS', val: datasets.length, color: '#34d399' },
          { label: 'FULLY EVIDENCED', val: counts.FULLY_EVIDENCED, color: '#34d399', badge: counts.FULLY_EVIDENCED > 0 },
          { label: 'REPORTED-ONLY', val: counts.REPORTED_ONLY, color: '#f97316' },
          { label: 'DATA-BACKED', val: counts.DATA_BACKED, color: '#22d3ee' },
          { label: 'UNTRACKED', val: counts.UNTRACKED, color: '#f87171', badge: counts.UNTRACKED > 0 },
          { label: 'EVIDENCED %', val: `${evidencedPct}%`, color: '#34d399' },
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
          <span>Risk Evidence Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#34d399' }}>{evidencedPct}% fully evidenced</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {evidencedPct > 0 && <div style={{ width: `${evidencedPct}%`, background: '#34d399' }} />}
          {reportedPct > 0 && <div style={{ width: `${reportedPct}%`, background: '#f97316' }} />}
          {dataPct > 0 && <div style={{ width: `${dataPct}%`, background: '#22d3ee' }} />}
          {untrackedPct > 0 && <div style={{ width: `${untrackedPct}%`, background: '#7f1d1d' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#34d399' }}>● FULLY EVIDENCED</span>
          <span style={{ color: '#f97316' }}>● REPORTED-ONLY</span>
          <span style={{ color: '#22d3ee' }}>● DATA-BACKED</span>
          <span style={{ color: '#f87171' }}>● UNTRACKED</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_EVIDENCED', 'REPORTED_ONLY', 'DATA_BACKED', 'UNTRACKED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#1a0a0a' : '#0f172a',
            border: `1px solid ${filter === f ? '#f87171' : '#1e293b'}`,
            color: filter === f ? '#fca5a5' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search risk signals…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No risk signals match current filter.</div>
        )}
        {visible.map(sig => {
          const stateColor = sig.state === 'FULLY_EVIDENCED' ? '#34d399' : sig.state === 'REPORTED_ONLY' ? '#f97316' : sig.state === 'DATA_BACKED' ? '#22d3ee' : '#f87171';
          const sevColor = SEV_COLOR[(sig.severity || '').toLowerCase()] || '#94a3b8';
          const isExp = expanded === sig.id;
          return (
            <div key={sig.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#3b1414' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : sig.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 160 }}>{STATE_LABELS[sig.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{sig.label}</span>
                {sig.severity && <span style={{ background: '#1e0a0a', color: sevColor, border: `1px solid ${sevColor}40`, borderRadius: 3, padding: '1px 6px', fontSize: 9, textTransform: 'uppercase' }}>{sig.severity}</span>}
                {sig.category && <span style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid #334155', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{sig.category.slice(0, 16)}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Reports pane */}
                    <div>
                      <div style={{ color: '#f97316', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>REPORTS ({sig.reportMatches.length})</div>
                      {sig.reportMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No intelligence report coverage</div>
                        : sig.reportMatches.slice(0, 6).map(r => (
                          <div key={r.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#fdba74', fontSize: 11 }}>{r.label.slice(0, 40)}{r.label.length > 40 ? '…' : ''}</span>
                              {r.type && <span style={{ background: '#1c0a00', color: '#f97316', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{r.type}</span>}
                            </div>
                            <ScoreBar score={r.score} color="#f97316" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Datasets pane */}
                    <div>
                      <div style={{ color: '#34d399', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>DATASETS ({sig.datasetMatches.length})</div>
                      {sig.datasetMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No dataset coverage</div>
                        : sig.datasetMatches.slice(0, 6).map(d => (
                          <div key={d.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#6ee7b7', fontSize: 11 }}>{d.label.slice(0, 40)}{d.label.length > 40 ? '…' : ''}</span>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {d.kind && <span style={{ background: '#022c22', color: '#34d399', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{d.kind}</span>}
                                {d.rows != null && <span style={{ background: '#0f172a', color: '#475569', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{d.rows.toLocaleString()} rows</span>}
                              </div>
                            </div>
                            <ScoreBar score={d.score} color="#34d399" />
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
            background: assessing ? '#1e293b' : '#1a0a0a', border: '1px solid #f87171',
            color: assessing ? '#475569' : '#fca5a5', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
