import { useState, useEffect, useCallback } from 'react';

const API = '';
const ERCN_RE = /\b(entity[._-]?resol|duplicate[._-]?entit|master[._-]?data|ercn|entity[._-]?dedup|duplicate[._-]?record|merge[._-]?entit|resolve[._-]?duplic|golden[._-]?record|canonical[._-]?entit|find[._-]?duplic|entity[._-]?merge)\b/i;

export function isErcnQuery(t) {
  return ERCN_RE.test(t || '');
}

export async function buildErcnScript() {
  try {
    const d = await fetch(`${API}/v1/jarvis/er/stats`).then(r => r.json());
    const pending = d.pending ?? 0;
    const merged = d.merged ?? 0;
    return (
      `Entity Resolution: ${pending} pair${pending !== 1 ? 's' : ''} pending adjudication, ` +
      `${merged} pair${merged !== 1 ? 's' : ''} merged to date. ` +
      (pending > 0 ? `${pending} resolution${pending !== 1 ? 's' : ''} require operator review.` : 'Queue is clear.')
    );
  } catch {
    return 'Entity Resolution: unable to reach ER service.';
  }
}

const PANEL_W = 580;
const PANEL_H = 600;
const ACCENT = '#A78BFA';
const BUTTON_LEFT = 488640;

function ScoreBar({ score, color = ACCENT }) {
  const pct = Math.min(100, Math.max(0, (score ?? 0) * 100));
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', width: '100%' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
  );
}

export default function EntityResolutionConsole() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('QUEUE');
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [actionResult, setActionResult] = useState({});

  // FIND tab
  const [findType, setFindType] = useState('');
  const [findThreshold, setFindThreshold] = useState(0.6);
  const [findLoading, setFindLoading] = useState(false);
  const [findResults, setFindResults] = useState(null);

  // GOLDEN tab
  const [goldenId, setGoldenId] = useState('');
  const [goldenLoading, setGoldenLoading] = useState(false);
  const [goldenData, setGoldenData] = useState(null);
  const [unmergeLoading, setUnmergeLoading] = useState({});
  const [unmergeResult, setUnmergeResult] = useState({});

  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');

  const loadStats = useCallback(async () => {
    try {
      const d = await fetch(`${API}/v1/jarvis/er/stats`).then(r => r.json());
      setStats(d);
    } catch {
      setStats(null);
    }
  }, []);

  const loadQueue = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await fetch(`${API}/v1/jarvis/er/queue?status=pending&limit=100`).then(r => r.json());
      setQueue(Array.isArray(d.queue) ? d.queue : []);
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadStats();
    loadQueue();
    const id = setInterval(() => { loadStats(); loadQueue(); }, 90000);
    return () => clearInterval(id);
  }, [open, loadStats, loadQueue]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:ercn-toggle', h);
    return () => window.removeEventListener('jarvis:ercn-toggle', h);
  }, []);

  async function doResolve(pairKey, aId, bId, merge) {
    setActionLoading(s => ({ ...s, [pairKey]: true }));
    try {
      const r = await fetch(`${API}/v1/jarvis/er/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ a_id: aId, b_id: bId, merge, role: 'operator', actor: 'ui' }),
      });
      const d = await r.json();
      setActionResult(s => ({ ...s, [pairKey]: merge ? `Merged → ${d.canonical_id || ''}` : 'Rejected' }));
      await loadStats();
      await loadQueue();
    } catch (e) {
      setActionResult(s => ({ ...s, [pairKey]: `Error: ${e.message}` }));
    }
    setActionLoading(s => ({ ...s, [pairKey]: false }));
  }

  async function doFindDuplicates() {
    if (!findType.trim()) return;
    setFindLoading(true); setFindResults(null);
    try {
      const r = await fetch(`${API}/v1/jarvis/er/find-duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ object_type: findType.trim(), threshold: findThreshold }),
      });
      const d = await r.json();
      setFindResults(Array.isArray(d.candidates) ? d.candidates : d.pairs || []);
    } catch (e) {
      setFindResults({ error: e.message });
    }
    setFindLoading(false);
  }

  async function doGolden() {
    if (!goldenId.trim()) return;
    setGoldenLoading(true); setGoldenData(null);
    try {
      const d = await fetch(`${API}/v1/jarvis/er/golden/${encodeURIComponent(goldenId.trim())}`).then(r => r.json());
      setGoldenData(d);
    } catch (e) {
      setGoldenData({ error: e.message });
    }
    setGoldenLoading(false);
  }

  async function doUnmerge(canonicalId, mergedId) {
    const key = `${canonicalId}:${mergedId}`;
    setUnmergeLoading(s => ({ ...s, [key]: true }));
    try {
      const r = await fetch(`${API}/v1/jarvis/er/unmerge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ canonical_id: canonicalId, merged_id: mergedId, role: 'operator', actor: 'ui' }),
      });
      const d = await r.json();
      setUnmergeResult(s => ({ ...s, [key]: d.unmerged ? 'Unmerged ✓' : JSON.stringify(d).slice(0, 80) }));
      await doGolden();
    } catch (e) {
      setUnmergeResult(s => ({ ...s, [key]: `Error: ${e.message}` }));
    }
    setUnmergeLoading(s => ({ ...s, [key]: false }));
  }

  async function doAssess() {
    setAssessing(true); setAssessText('');
    try {
      const script = await buildErcnScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: `Provide a 2-sentence data quality assessment: ${script}` }),
      });
      const d = await r.json();
      const text = (d.answer || script).slice(0, 280);
      setAssessText(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessText(`ER: ${e.message}`);
    }
    setAssessing(false);
  }

  const pending = stats?.pending ?? 0;
  const merged = stats?.merged ?? 0;

  const badge = pending > 0
    ? { bg: '#451A03', color: '#FCD34D', text: String(pending) }
    : { bg: '#064E3B', color: '#34D399', text: merged > 0 ? `${merged}` : '0' };

  const filtered = queue.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (p.a_id || '').toLowerCase().includes(q) ||
      (p.b_id || '').toLowerCase().includes(q) ||
      (p.object_type || '').toLowerCase().includes(q) ||
      (p.reason || '').toLowerCase().includes(q)
    );
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Entity Resolution Console"
        style={{
          position: 'fixed', left: BUTTON_LEFT, bottom: 8, zIndex: 200,
          background: open ? ACCENT : 'rgba(10,14,20,0.82)',
          border: `1px solid ${ACCENT}55`, color: open ? '#04060A' : ACCENT,
          borderRadius: 6, padding: '3px 7px', fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: open ? `0 0 18px ${ACCENT}88` : 'none',
        }}
      >
        ⊟ ERCN
        <span style={{
          marginLeft: 5, background: badge.bg, color: badge.color,
          borderRadius: 8, padding: '1px 5px', fontSize: 9,
        }}>{badge.text}</span>
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: BUTTON_LEFT, bottom: 36, zIndex: 200,
          width: PANEL_W, height: PANEL_H,
          background: 'rgba(6,10,16,0.97)', border: `1px solid ${ACCENT}44`,
          borderRadius: 12, display: 'flex', flexDirection: 'column',
          fontFamily: "'JetBrains Mono',monospace", color: '#CBD5E1',
          boxShadow: `0 0 60px ${ACCENT}18`, backdropFilter: 'blur(12px)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${ACCENT}22`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: ACCENT, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>ENTITY RESOLUTION</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748B' }}>MASTER DATA</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${ACCENT}11` }}>
            {[
              { label: 'PENDING', val: pending },
              { label: 'MERGED', val: merged },
              { label: 'QUEUE', val: queue.length },
              { label: 'TYPES', val: [...new Set(queue.map(p => p.object_type).filter(Boolean))].length || '—' },
            ].map(({ label, val }) => (
              <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '5px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#64748B', letterSpacing: 1 }}>{label}</div>
                <div style={{ fontSize: 14, color: ACCENT, fontWeight: 700 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: `1px solid ${ACCENT}22` }}>
            {['QUEUE', 'FIND', 'GOLDEN'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '3px 10px', borderRadius: 5, fontSize: 10, letterSpacing: 1, cursor: 'pointer',
                border: `1px solid ${tab === t ? ACCENT : ACCENT + '33'}`,
                background: tab === t ? `${ACCENT}22` : 'transparent',
                color: tab === t ? ACCENT : '#64748B',
              }}>{t}</button>
            ))}
            {tab === 'QUEUE' && (
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="search queue…"
                style={{
                  marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: `1px solid ${ACCENT}33`,
                  borderRadius: 5, padding: '3px 8px', fontSize: 10, color: '#CBD5E1', outline: 'none', width: 160,
                }}
              />
            )}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
            {loading && tab === 'QUEUE' && <div style={{ color: '#64748B', fontSize: 11, padding: 12 }}>Loading…</div>}
            {err && tab === 'QUEUE' && <div style={{ color: '#F43F5E', fontSize: 11, padding: 12 }}>Error: {err}</div>}

            {/* QUEUE tab */}
            {tab === 'QUEUE' && !loading && (
              <>
                {filtered.length === 0 && (
                  <div style={{ color: '#64748B', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
                    {queue.length === 0 ? 'No pending pairs in the adjudication queue.' : 'No matches.'}
                  </div>
                )}
                {filtered.map(pair => {
                  const key = `${pair.a_id}:${pair.b_id}`;
                  const isExp = expanded === key;
                  const score = pair.score ?? pair.similarity ?? null;
                  const result = actionResult[key];
                  return (
                    <div key={key} style={{ marginBottom: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 7, overflow: 'hidden', border: `1px solid ${ACCENT}18` }}>
                      <div
                        onClick={() => setExpanded(isExp ? null : key)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
                      >
                        <span style={{ color: ACCENT, fontSize: 10 }}>{isExp ? '▼' : '▶'}</span>
                        <span style={{ fontSize: 10, color: '#94A3B8', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 5px' }}>
                          {pair.object_type || 'unknown'}
                        </span>
                        <span style={{ fontSize: 11, color: '#E2E8F0', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pair.a_id} ↔ {pair.b_id}
                        </span>
                        {score !== null && (
                          <span style={{ fontSize: 10, color: ACCENT, background: `${ACCENT}22`, borderRadius: 8, padding: '1px 6px' }}>
                            {(score * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      {isExp && (
                        <div style={{ padding: '8px 12px 10px', borderTop: `1px solid ${ACCENT}18` }}>
                          {score !== null && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontSize: 9, color: '#64748B' }}>SIMILARITY SCORE</span>
                                <span style={{ fontSize: 10, color: ACCENT }}>{score.toFixed(4)}</span>
                              </div>
                              <ScoreBar score={score} />
                            </div>
                          )}
                          {pair.reason && (
                            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 8, fontStyle: 'italic' }}>{pair.reason}</div>
                          )}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button
                              onClick={() => doResolve(key, pair.a_id, pair.b_id, true)}
                              disabled={!!actionLoading[key] || !!result}
                              style={{
                                background: '#064E3B', border: '1px solid #34D39955', color: '#34D399',
                                borderRadius: 5, padding: '3px 10px', fontSize: 10, cursor: 'pointer', letterSpacing: 1,
                                opacity: (actionLoading[key] || result) ? 0.5 : 1,
                              }}
                            >
                              {actionLoading[key] ? '…' : '✓ MERGE'}
                            </button>
                            <button
                              onClick={() => doResolve(key, pair.a_id, pair.b_id, false)}
                              disabled={!!actionLoading[key] || !!result}
                              style={{
                                background: 'rgba(244,63,94,0.12)', border: '1px solid #F43F5E55', color: '#F43F5E',
                                borderRadius: 5, padding: '3px 10px', fontSize: 10, cursor: 'pointer', letterSpacing: 1,
                                opacity: (actionLoading[key] || result) ? 0.5 : 1,
                              }}
                            >
                              ✗ REJECT
                            </button>
                            {result && (
                              <span style={{ fontSize: 10, color: '#94A3B8' }}>{result}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* FIND tab */}
            {tab === 'FIND' && (
              <div style={{ padding: '6px 0' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <input
                    value={findType}
                    onChange={e => setFindType(e.target.value)}
                    placeholder="object type (e.g. Contact)"
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.05)', border: `1px solid ${ACCENT}33`,
                      borderRadius: 5, padding: '4px 8px', fontSize: 10, color: '#CBD5E1', outline: 'none',
                    }}
                  />
                  <button
                    onClick={doFindDuplicates}
                    disabled={findLoading || !findType.trim()}
                    style={{
                      background: `${ACCENT}22`, border: `1px solid ${ACCENT}55`, color: ACCENT,
                      borderRadius: 5, padding: '4px 12px', fontSize: 10, cursor: 'pointer', letterSpacing: 1,
                      opacity: (findLoading || !findType.trim()) ? 0.5 : 1,
                    }}
                  >
                    {findLoading ? '…' : '▶ FIND'}
                  </button>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 9, color: '#64748B' }}>THRESHOLD</span>
                    <span style={{ fontSize: 10, color: ACCENT }}>{findThreshold.toFixed(2)}</span>
                  </div>
                  <input
                    type="range" min="0.1" max="1.0" step="0.05"
                    value={findThreshold}
                    onChange={e => setFindThreshold(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: ACCENT }}
                  />
                </div>
                {findResults && !findResults.error && (
                  <>
                    <div style={{ fontSize: 10, color: '#64748B', marginBottom: 6 }}>
                      {findResults.length} candidate pair{findResults.length !== 1 ? 's' : ''} found
                    </div>
                    {findResults.length === 0 && (
                      <div style={{ fontSize: 11, color: '#64748B', padding: '10px 0' }}>No duplicate candidates above threshold.</div>
                    )}
                    {findResults.map((c, i) => {
                      const sc = c.score ?? c.similarity ?? null;
                      return (
                        <div key={i} style={{ marginBottom: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 7, padding: '7px 10px', border: `1px solid ${ACCENT}18` }}>
                          <div style={{ display: 'flex', gap: 8, marginBottom: sc !== null ? 5 : 0, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: '#E2E8F0', flex: 1, minWidth: 0 }}>{c.a_id} ↔ {c.b_id}</span>
                            {sc !== null && (
                              <span style={{ fontSize: 10, color: ACCENT, background: `${ACCENT}22`, borderRadius: 8, padding: '1px 6px' }}>
                                {(sc * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>
                          {sc !== null && <ScoreBar score={sc} />}
                        </div>
                      );
                    })}
                  </>
                )}
                {findResults?.error && (
                  <div style={{ color: '#F43F5E', fontSize: 11 }}>Error: {findResults.error}</div>
                )}
              </div>
            )}

            {/* GOLDEN tab */}
            {tab === 'GOLDEN' && (
              <div style={{ padding: '6px 0' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <input
                    value={goldenId}
                    onChange={e => setGoldenId(e.target.value)}
                    placeholder="object id…"
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.05)', border: `1px solid ${ACCENT}33`,
                      borderRadius: 5, padding: '4px 8px', fontSize: 10, color: '#CBD5E1', outline: 'none',
                    }}
                    onKeyDown={e => e.key === 'Enter' && doGolden()}
                  />
                  <button
                    onClick={doGolden}
                    disabled={goldenLoading || !goldenId.trim()}
                    style={{
                      background: `${ACCENT}22`, border: `1px solid ${ACCENT}55`, color: ACCENT,
                      borderRadius: 5, padding: '4px 12px', fontSize: 10, cursor: 'pointer', letterSpacing: 1,
                      opacity: (goldenLoading || !goldenId.trim()) ? 0.5 : 1,
                    }}
                  >
                    {goldenLoading ? '…' : '▶ LOOKUP'}
                  </button>
                </div>
                {goldenData && !goldenData.error && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 7, padding: '10px 12px', border: `1px solid ${ACCENT}18` }}>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontSize: 9, color: '#64748B', letterSpacing: 1 }}>CANONICAL ID</span>
                      <div style={{ fontSize: 12, color: ACCENT, fontWeight: 700, marginTop: 2 }}>{goldenData.canonical_id || goldenId}</div>
                    </div>
                    {goldenData.object_type && (
                      <div style={{ marginBottom: 8 }}>
                        <span style={{ fontSize: 9, color: '#64748B' }}>TYPE </span>
                        <span style={{ fontSize: 10, color: '#94A3B8', background: 'rgba(255,255,255,0.07)', borderRadius: 4, padding: '1px 5px' }}>
                          {goldenData.object_type}
                        </span>
                      </div>
                    )}
                    {Array.isArray(goldenData.merged_ids) && goldenData.merged_ids.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: '#64748B', letterSpacing: 1, marginBottom: 5 }}>
                          MERGED IDS ({goldenData.merged_ids.length})
                        </div>
                        {goldenData.merged_ids.map(mid => {
                          const uk = `${goldenData.canonical_id}:${mid}`;
                          return (
                            <div key={mid} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5, padding: '4px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 5 }}>
                              <span style={{ fontSize: 10, color: '#94A3B8', flex: 1 }}>{mid}</span>
                              <button
                                onClick={() => doUnmerge(goldenData.canonical_id, mid)}
                                disabled={!!unmergeLoading[uk]}
                                style={{
                                  background: 'rgba(244,63,94,0.1)', border: '1px solid #F43F5E44', color: '#F43F5E',
                                  borderRadius: 4, padding: '2px 8px', fontSize: 9, cursor: 'pointer', letterSpacing: 1,
                                  opacity: unmergeLoading[uk] ? 0.5 : 1,
                                }}
                              >
                                {unmergeLoading[uk] ? '…' : '↩ UNMERGE'}
                              </button>
                              {unmergeResult[uk] && (
                                <span style={{ fontSize: 9, color: '#94A3B8' }}>{unmergeResult[uk]}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {Array.isArray(goldenData.merged_ids) && goldenData.merged_ids.length === 0 && (
                      <div style={{ fontSize: 10, color: '#64748B' }}>No merged IDs — this is a standalone record.</div>
                    )}
                    {goldenData.props && Object.keys(goldenData.props).length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 9, color: '#64748B', letterSpacing: 1, marginBottom: 4 }}>PROPS</div>
                        {Object.entries(goldenData.props).slice(0, 8).map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', gap: 6, fontSize: 10, marginBottom: 2 }}>
                            <span style={{ color: '#64748B', minWidth: 80 }}>{k}</span>
                            <span style={{ color: '#94A3B8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 80)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {goldenData?.error && (
                  <div style={{ color: '#F43F5E', fontSize: 11 }}>Error: {goldenData.error}</div>
                )}
                {!goldenData && (
                  <div style={{ fontSize: 11, color: '#64748B', padding: '10px 0' }}>
                    Enter an object ID to view its golden (canonical) record and any merged IDs.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '8px 14px', borderTop: `1px solid ${ACCENT}18`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={doAssess}
              disabled={assessing}
              style={{
                background: `${ACCENT}22`, border: `1px solid ${ACCENT}55`, color: ACCENT,
                borderRadius: 5, padding: '4px 12px', fontSize: 10, cursor: 'pointer', letterSpacing: 1,
                opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? '…' : '▶ ASSESS'}
            </button>
            {assessText && (
              <span style={{ fontSize: 10, color: '#94A3B8', flex: 1, lineHeight: 1.4 }}>{assessText}</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
