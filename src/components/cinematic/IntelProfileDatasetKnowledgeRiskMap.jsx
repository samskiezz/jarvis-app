/**
 * IntelProfileDatasetKnowledgeRiskMap — F122
 *
 * Fetches /entities/IntelProfile + /v1/datasets + /knowledge/ + /entities/RiskSignal.
 *
 * Keyword-matches each intel profile (name/category/description/tags) against
 * datasets, knowledge articles, and risk signals to classify:
 *
 *   EVIDENCED — profile matches dataset AND knowledge AND risk signal
 *               (fully grounded: data source, documented, threat-linked)
 *   SOURCED   — profile matches dataset but missing knowledge or risk signal
 *               (data-linked but undocumented or unthreated)
 *   KNOWN     — profile matches knowledge or risk signal but no dataset
 *               (documented but no data grounding)
 *   DARK      — no match to any source
 *               (intelligence dead-end — blind asset with no data, no docs, no threat signal)
 *
 * Toggle: ◈ IDKRMAP button (fixed, bottom strip) left:116680, zIndex:219
 * Stat tiles: profiles / datasets / knowledge / risk signals / evidenced / sourced / known / dark
 * Red pulse on DARK count (blind intelligence assets).
 * Expandable rows: matched datasets with row-count badge +
 *                  matched knowledge articles with category badge +
 *                  matched risk signals with severity badge.
 * Filter tabs: ALL / EVIDENCED / SOURCED / KNOWN / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "idkrmap"/"intel evidence depth"/"intel profile depth"/"intelligence depth map"
 *        "dark intel"/"blind intel"/"intel profile evidence"/"intel data depth"
 *        "profile evidence"/"intel knowledge"/"profile risk"/"intelligence coverage"
 *        "intel asset"/"blind profile"/"intelligence grounding"/"intel dark"
 * Event: jarvis:idkrmap-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'EVIDENCED', 'SOURCED', 'KNOWN', 'DARK'];

const CLS_COLOR = {
  EVIDENCED: '#22C55E',
  SOURCED:   '#3B82F6',
  KNOWN:     '#F97316',
  DARK:      '#EF4444',
};

export function isIdkrmapQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'idkrmap', 'intel evidence depth', 'intel profile depth', 'intelligence depth map',
    'dark intel', 'blind intel', 'intel profile evidence', 'intel data depth',
    'profile evidence', 'intel knowledge', 'profile risk', 'intelligence coverage',
    'intel asset', 'blind profile', 'intelligence grounding', 'intel dark',
    'intel dataset knowledge', 'profile risk signal', 'intel evidence',
  ].some(kw => s.includes(kw));
}

export function buildIdkrmapScript(q) {
  return `JARVIS intel profile evidence depth audit triggered by: "${q}". Fetch /entities/IntelProfile + /v1/datasets + /knowledge/ + /entities/RiskSignal. Classify each intel profile as EVIDENCED/SOURCED/KNOWN/DARK. Report the dark count and top 3 blind intelligence assets with no data source, no knowledge article, and no risk signal.`;
}

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function profileLabel(p) {
  return p.name || p.title || p.alias || p.id || 'Unknown';
}

function profileTokens(p) {
  return tokens(
    `${p.name || ''} ${p.title || ''} ${p.alias || ''} ${p.description || ''} ${p.category || ''} ${p.type || ''} ${p.source || ''} ${p.tags ? (Array.isArray(p.tags) ? p.tags.join(' ') : p.tags) : ''}`
  );
}

function classifyProfile(profile, datasets, knowledge, riskSignals) {
  const toks = profileTokens(profile);

  const mDatasets = datasets.filter(d =>
    overlaps(toks, `${d.name || ''} ${d.title || ''} ${d.description || ''} ${d.category || ''} ${d.type || ''} ${d.source || ''} ${d.tags ? (Array.isArray(d.tags) ? d.tags.join(' ') : d.tags) : ''}`)
  );
  const mKnowledge = knowledge.filter(k =>
    overlaps(toks, `${k.title || ''} ${k.name || ''} ${k.content || ''} ${k.summary || ''} ${k.category || ''} ${k.tags ? (Array.isArray(k.tags) ? k.tags.join(' ') : k.tags) : ''}`)
  );
  const mRiskSignals = riskSignals.filter(r =>
    overlaps(toks, `${r.name || ''} ${r.title || ''} ${r.description || ''} ${r.type || ''} ${r.category || ''} ${r.source || ''} ${r.tags ? (Array.isArray(r.tags) ? r.tags.join(' ') : r.tags) : ''}`)
  );

  const hasDataset    = mDatasets.length > 0;
  const hasKnowledge  = mKnowledge.length > 0;
  const hasRisk       = mRiskSignals.length > 0;

  let cls;
  if (hasDataset && hasKnowledge && hasRisk)          cls = 'EVIDENCED';
  else if (hasDataset)                                 cls = 'SOURCED';
  else if (hasKnowledge || hasRisk)                    cls = 'KNOWN';
  else                                                 cls = 'DARK';

  return { profile, cls, mDatasets, mKnowledge, mRiskSignals };
}

export default function IntelProfileDatasetKnowledgeRiskMap() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [rows,       setRows]       = useState([]);
  const [err,        setErr]        = useState(null);
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [profilesRaw, datasetsRaw, knowledgeRaw, riskRaw] = await Promise.all([
        fetcher('/entities/IntelProfile'),
        fetcher('/v1/datasets'),
        fetcher('/knowledge/'),
        fetcher('/entities/RiskSignal'),
      ]);

      const profiles    = normalizeArray(profilesRaw, ['intel_profiles', 'profiles', 'data', 'items', 'results']);
      const datasets    = normalizeArray(datasetsRaw, ['datasets', 'data', 'items', 'results']);
      const knowledge   = normalizeArray(knowledgeRaw, ['articles', 'knowledge', 'data', 'items', 'results']);
      const riskSignals = normalizeArray(riskRaw, ['risk_signals', 'signals', 'data', 'items', 'results']);

      setRows(profiles.map(p => classifyProfile(p, datasets, knowledge, riskSignals)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:idkrmap-toggle', handler);
    return () => window.removeEventListener('jarvis:idkrmap-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    EVIDENCED: rows.filter(r => r.cls === 'EVIDENCED').length,
    SOURCED:   rows.filter(r => r.cls === 'SOURCED').length,
    KNOWN:     rows.filter(r => r.cls === 'KNOWN').length,
    DARK:      rows.filter(r => r.cls === 'DARK').length,
  };

  const datasetCount   = rows.reduce((n, r) => n + r.mDatasets.length,   0);
  const knowledgeCount = rows.reduce((n, r) => n + r.mKnowledge.length,  0);
  const riskCount      = rows.reduce((n, r) => n + r.mRiskSignals.length, 0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return profileLabel(r.profile).toLowerCase().includes(s) ||
             (r.profile.category || r.profile.type || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Intel Profiles: ${rows.length}. Evidenced: ${counts.EVIDENCED}. Sourced: ${counts.SOURCED}. Known: ${counts.KNOWN}. Dark: ${counts.DARK}.`;
    const prompt = `JARVIS intel profile evidence depth audit: ${summary}. Identify the most critical DARK intel profiles — those with no dataset source, no knowledge article, and no risk signal — blind intelligence assets with zero grounding. Provide a 2-sentence advisory on the highest-risk ungrounded profiles and priority actions to close intelligence evidence gaps.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || JSON.stringify(d);
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch (_) {}
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 116680, zIndex: 219,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ IDKRMAP</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 219, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ IDKRMAP</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>IntelProfile × Dataset × Knowledge × RiskSignal — Intelligence Evidence Depth Map</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #EF444455', color: '#EF4444', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'PROFILES',  val: rows.length,         color: '#94a3b8' },
          { label: 'DATASETS',  val: datasetCount,         color: '#3B82F6' },
          { label: 'KNOWLEDGE', val: knowledgeCount,       color: '#F59E0B' },
          { label: 'RISK SIGS', val: riskCount,            color: '#f87171' },
          { label: 'EVIDENCED', val: counts.EVIDENCED,    color: CLS_COLOR.EVIDENCED },
          { label: 'SOURCED',   val: counts.SOURCED,      color: CLS_COLOR.SOURCED },
          { label: 'KNOWN',     val: counts.KNOWN,        color: CLS_COLOR.KNOWN },
          { label: 'DARK',      val: counts.DARK,         color: CLS_COLOR.DARK, pulse: counts.DARK > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'idkrmap-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid #EF444444', borderRadius: 5, fontSize: 11, color: '#fca5a5', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#EF444422' : 'none',
            border: `1px solid ${tab === t ? '#EF4444' : '#1e293b'}`,
            color: tab === t ? '#EF4444' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 180 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLS_COLOR[r.cls], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profileLabel(r.profile)}
                </span>
                {(r.profile.category || r.profile.type) && (
                  <span style={{ background: '#100820', border: '1px solid #3b0764', color: '#c4b5fd', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.profile.category || r.profile.type}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mDatasets.length > 0 && (
                    <div>
                      <div style={{ color: '#3B82F6', fontSize: 10, marginBottom: 3 }}>DATASETS ({r.mDatasets.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mDatasets.slice(0, 8).map((d, k) => (
                          <span key={k} style={{ background: '#060f20', border: '1px solid #1e3a5f', color: '#3B82F6', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {d.name || d.title || d.id}
                            {d.row_count != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{d.row_count}r]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mKnowledge.length > 0 && (
                    <div>
                      <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 3 }}>KNOWLEDGE ({r.mKnowledge.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mKnowledge.slice(0, 8).map((k, ki) => (
                          <span key={ki} style={{ background: '#150f00', border: '1px solid #78350f', color: '#F59E0B', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {k.title || k.name || k.id}
                            {k.category && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{k.category}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mRiskSignals.length > 0 && (
                    <div>
                      <div style={{ color: '#f87171', fontSize: 10, marginBottom: 3 }}>RISK SIGNALS ({r.mRiskSignals.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mRiskSignals.slice(0, 8).map((s, k) => (
                          <span key={k} style={{ background: '#200a0a', border: '1px solid #7f1d1d', color: '#f87171', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {s.name || s.title || s.id}
                            {s.severity && <span style={{ color: '#94a3b8', fontSize: 9 }}> [sev:{s.severity}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mDatasets.length === 0 && r.mKnowledge.length === 0 && r.mRiskSignals.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No dataset, knowledge, or risk signal match — blind intelligence asset with no data source, no documentation, and no threat signal.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes idkrmap-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
