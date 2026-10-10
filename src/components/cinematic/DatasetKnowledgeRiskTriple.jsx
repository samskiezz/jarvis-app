import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const DKRSTRI_RE = /\b(dkrstri|dataset\s+knowledge\s+risk|dataset\s+risk\s+knowledge|dataset\s+kb\s+risk|kb\s+risk\s+dataset|knowledge\s+risk\s+dataset|data\s+knowledge\s+risk|dataset\s+risk\s+signal\s+knowledge|flagged\s+dataset|dark\s+dataset|dataset\s+threat\s+knowledge|dataset\s+intel\s+risk|data\s+risk\s+knowledge|risky\s+dataset\s+kb|knowledge\s+backed\s+risk\s+dataset)\b/i;

export function isDkrstriQuery(t) { return DKRSTRI_RE.test(t || ''); }

export async function buildDkrstriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [dsR, kbR, rsR] = await Promise.allSettled([
    fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
  ]);
  const dsRaw = dsR.value ?? {};
  const datasets = Array.isArray(dsRaw) ? dsRaw : (dsRaw.datasets ?? dsRaw.data ?? dsRaw.results ?? []);
  const kbRaw = kbR.value ?? {};
  const articles = Array.isArray(kbRaw) ? kbRaw : (kbRaw.articles ?? kbRaw.items ?? kbRaw.data ?? kbRaw.results ?? []);
  const rsRaw = rsR.value ?? {};
  const risks = Array.isArray(rsRaw) ? rsRaw : (rsRaw.risks ?? rsRaw.data ?? rsRaw.results ?? []);

  const kbText = articles.map(a =>
    `${a.title ?? a.name ?? ''} ${a.summary ?? a.description ?? ''} ${a.category ?? ''} ${(a.tags ?? []).join(' ')}`.toLowerCase()
  ).join(' ');
  const riskText = risks.map(r =>
    `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.category ?? ''} ${r.source ?? ''}`.toLowerCase()
  ).join(' ');

  let flagged = 0, kbBacked = 0, riskExposed = 0, dark = 0;
  for (const ds of datasets) {
    const text = `${ds.name ?? ds.id ?? ''} ${ds.description ?? ''} ${ds.kind ?? ds.type ?? ''} ${(ds.tags ?? []).join(' ')}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const hasKb = tokens.some(tok => kbText.includes(tok));
    const hasRisk = tokens.some(tok => riskText.includes(tok));
    if (hasKb && hasRisk) flagged++;
    else if (hasKb) kbBacked++;
    else if (hasRisk) riskExposed++;
    else dark++;
  }
  return `DKRSTRI Dataset × Knowledge × Risk Signal: ${datasets.length} datasets assessed against ` +
    `${articles.length} KB articles and ${risks.length} risk signals. ` +
    `FLAGGED: ${flagged} (KB coverage + risk signal — data source with threat context and documented knowledge). ` +
    `KB-BACKED: ${kbBacked} (knowledge article found, no risk flag). ` +
    `RISK-EXPOSED: ${riskExposed} (risk signal overlap, no KB backing). ` +
    `DARK: ${dark} (no knowledge or risk coverage — intelligence blind spot).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  FLAGGED: '#ef4444',
  'KB-BACKED': '#60a5fa',
  'RISK-EXPOSED': '#f97316',
  DARK: '#6b7280',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreArticles(dataset, articles) {
  const text = `${dataset.name ?? dataset.id ?? ''} ${dataset.description ?? ''} ${dataset.kind ?? dataset.type ?? ''} ${(dataset.tags ?? []).join(' ')}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const a of articles) {
    const aText = `${a.title ?? a.name ?? ''} ${a.summary ?? a.description ?? ''} ${a.category ?? ''} ${(a.tags ?? []).join(' ')}`.toLowerCase();
    const hits = tokens.filter(tok => aText.includes(tok));
    if (hits.length > 0) matched.push({ item: a, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function scoreRiskSignals(dataset, risks) {
  const text = `${dataset.name ?? dataset.id ?? ''} ${dataset.description ?? ''} ${dataset.kind ?? dataset.type ?? ''} ${(dataset.tags ?? []).join(' ')}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const r of risks) {
    const rText = `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.category ?? ''} ${r.source ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => rText.includes(tok));
    if (hits.length > 0) matched.push({ item: r, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(dataset, articles, risks) {
  const text = `${dataset.name ?? dataset.id ?? ''} ${dataset.description ?? ''} ${dataset.kind ?? dataset.type ?? ''} ${(dataset.tags ?? []).join(' ')}`.toLowerCase();
  const tokens = tokenize(text);
  const kbText = articles.map(a => `${a.title ?? a.name ?? ''} ${a.summary ?? a.description ?? ''} ${a.category ?? ''} ${(a.tags ?? []).join(' ')}`.toLowerCase()).join(' ');
  const riskText = risks.map(r => `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.category ?? ''} ${r.source ?? ''}`.toLowerCase()).join(' ');
  const hasKb = tokens.some(tok => kbText.includes(tok));
  const hasRisk = tokens.some(tok => riskText.includes(tok));
  if (hasKb && hasRisk) return 'FLAGGED';
  if (hasKb) return 'KB-BACKED';
  if (hasRisk) return 'RISK-EXPOSED';
  return 'DARK';
}

export default function DatasetKnowledgeRiskTriple() {
  const [open, setOpen] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [articles, setArticles] = useState([]);
  const [risks, setRisks] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [dsR, kbR, rsR] = await Promise.allSettled([
        fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
      ]);
      const dsRaw = dsR.value ?? {};
      const dss = Array.isArray(dsRaw) ? dsRaw : (dsRaw.datasets ?? dsRaw.data ?? dsRaw.results ?? []);
      const kbRaw = kbR.value ?? {};
      const arts = Array.isArray(kbRaw) ? kbRaw : (kbRaw.articles ?? kbRaw.items ?? kbRaw.data ?? kbRaw.results ?? []);
      const rsRaw = rsR.value ?? {};
      const rks = Array.isArray(rsRaw) ? rsRaw : (rsRaw.risks ?? rsRaw.data ?? rsRaw.results ?? []);
      setDatasets(dss);
      setArticles(arts);
      setRisks(rks);
      setRows(dss.map(ds => ({
        ds,
        state: correlate(ds, arts, rks),
        leftMatched: scoreArticles(ds, arts),
        rightMatched: scoreRiskSignals(ds, rks),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:dkrstri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:dkrstri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const flaggedCount = rows.filter(r => r.state === 'FLAGGED').length;
  const kbBackedCount = rows.filter(r => r.state === 'KB-BACKED').length;
  const riskExposedCount = rows.filter(r => r.state === 'RISK-EXPOSED').length;
  const darkCount = rows.filter(r => r.state === 'DARK').length;

  const visible = rows.filter(row => {
    if (filter !== 'ALL' && row.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const text = `${row.ds.name ?? row.ds.id ?? ''} ${row.ds.description ?? ''} ${row.ds.kind ?? row.ds.type ?? ''}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.ds.name ?? row.ds.id ?? 'dataset';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const kbNames = row.leftMatched.slice(0, 2).map(m => m.item.title ?? m.item.name ?? m.item.id ?? '?').join(', ');
      const riskNames = row.rightMatched.slice(0, 2).map(m => m.item.title ?? m.item.name ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FLAGGED'
        ? `has KB coverage (${kbNames || 'found'}) AND active risk signals (${riskNames || 'found'}) — flagged data source with threat context`
        : row.state === 'KB-BACKED'
          ? `has KB article backing (${kbNames || 'found'}) but no active risk signals`
          : row.state === 'RISK-EXPOSED'
            ? `has active risk signal overlap (${riskNames || 'found'}) but no KB backing`
            : 'has no KB coverage or active risk signal alignment — dark dataset';
      const prompt = `Dataset "${id}" ${stateDesc}. In exactly 2 sentences, assess the intelligence and threat coverage status of this data source.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const brief = data.response ?? data.message ?? data.content ?? data.text ?? '';
      if (brief) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: brief } }));
    } catch (_) {}
    setAssessing(null);
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', left: 792160, bottom: 8, zIndex: 443,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(239,68,68,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#ef4444', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ DKRSTRI — DATASET × KNOWLEDGE × RISK SIGNAL</span>
        {flaggedCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{flaggedCount} FLAGGED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Datasets', val: datasets.length },
          { label: 'KB Articles', val: articles.length },
          { label: 'Risk Signals', val: risks.length },
          { label: 'Flagged', val: flaggedCount, color: '#ef4444' },
          { label: 'KB-Backed', val: kbBackedCount, color: '#60a5fa' },
          { label: 'Risk-Exposed', val: riskExposedCount, color: '#f97316' },
          { label: 'Dark', val: darkCount, color: '#6b7280' },
        ].map(t => (
          <div key={t.label} style={TILE}>
            <div style={LABEL}>{t.label}</div>
            <div style={{ ...VAL, color: t.color ?? '#e2e8f0' }}>{loading ? '…' : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ height: '100%', width: `${Math.round((flaggedCount / rows.length) * 100)}%`, background: '#ef4444', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((kbBackedCount / rows.length) * 100)}%`, background: '#60a5fa', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((riskExposedCount / rows.length) * 100)}%`, background: '#f97316', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((darkCount / rows.length) * 100) : 0}% dark · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FLAGGED', 'KB-BACKED', 'RISK-EXPOSED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#4ade80') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'DARK' ? '#fff' : f === 'FLAGGED' ? '#fff' : '#000') : '#aaa',
            cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search datasets…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no datasets match</div>
        )}
        {visible.map((row, i) => {
          const id = row.ds.name ?? row.ds.id ?? `dataset-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {(row.ds.kind ?? row.ds.type) && (
                  <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(148,163,184,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.ds.kind ?? row.ds.type}</span>
                )}
                {row.ds.rows != null && (
                  <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.ds.rows.toLocaleString()} rows</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, color: '#ef4444', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Left pane: KB Articles */}
                    <div>
                      <div style={{ fontSize: 10, color: '#60a5fa', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>KB ARTICLES ({row.leftMatched.length})</div>
                      {row.leftMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no KB article matches</div>
                      ) : row.leftMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.title ?? m.item.name ?? m.item.id ?? `article-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#93c5fd' }}>{n}</span>
                              {m.item.category && (
                                <span style={{ fontSize: 9, color: '#60a5fa', background: 'rgba(96,165,250,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.category}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#60a5fa', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#60a5fa', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right pane: Risk Signals */}
                    <div>
                      <div style={{ fontSize: 10, color: '#f87171', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>RISK SIGNALS ({row.rightMatched.length})</div>
                      {row.rightMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no risk signal matches</div>
                      ) : row.rightMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.title ?? m.item.name ?? m.item.id ?? `risk-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#fca5a5' }}>{n}</span>
                              {m.item.severity && (
                                <span style={{ fontSize: 9, color: '#ef4444', background: 'rgba(239,68,68,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.severity}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#f87171', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#ef4444', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
