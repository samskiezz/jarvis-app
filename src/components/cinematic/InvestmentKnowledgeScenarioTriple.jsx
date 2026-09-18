import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const INVKSC_RE = /\b(invksc|invest(?:ment)?\s+knowledge\s+scenario|invest(?:ment)?\s+kb\s+scenario|invest(?:ment)?\s+strategic|invest(?:ment)?\s+knowledge\s+plan|portfolio\s+scenario\s+knowledge|dark\s+invest(?:ment)?|invest(?:ment)?\s+kb\s+plan|invest(?:ment)?\s+scenario\s+knowledge|knowledge\s+scenario\s+invest(?:ment)?)\b/i;

const THRESHOLD = 0.08;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseInvestments(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.investments) ? data.investments
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(inv => ({
    id: inv.id || inv._id || String(Math.random()),
    name: inv.name || inv.title || inv.label || 'Unnamed Investment',
    description: inv.description || inv.desc || inv.summary || inv.notes || '',
    category: inv.category || inv.type || inv.asset_class || inv.sector || '',
    ticker: inv.ticker || inv.symbol || '',
    tags: Array.isArray(inv.tags) ? inv.tags.join(' ') : String(inv.tags || ''),
    raw: inv,
  }));
}

function normaliseKb(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.articles) ? data.articles
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.data) ? data.data
    : [];
  return arr.map(a => ({
    id: a.id || a._id || String(Math.random()),
    title: a.title || a.name || a.label || 'Untitled Article',
    category: a.category || a.type || a.kind || '',
    summary: a.summary || a.description || a.content || a.body || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : String(a.tags || ''),
    raw: a,
  }));
}

function normaliseScenarios(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.scenarios) ? data.scenarios
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(s => ({
    id: s.id || s._id || String(Math.random()),
    name: s.name || s.title || s.label || 'Unnamed Scenario',
    status: s.status || s.state || '',
    category: s.category || s.type || s.kind || '',
    description: s.description || s.summary || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    raw: s,
  }));
}

function correlate(investments, kbArticles, scenarios) {
  return investments.map(inv => {
    const toks = tok([inv.name, inv.description, inv.category, inv.ticker, inv.tags].join(' '));

    const matchedKb = kbArticles
      .map(a => {
        const score = Math.max(
          matchScore(toks, a.title),
          matchScore(toks, a.category),
          matchScore(toks, a.summary),
          matchScore(toks, a.tags),
        );
        return { ...a, score };
      })
      .filter(a => a.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedScenarios = scenarios
      .map(s => {
        const score = Math.max(
          matchScore(toks, s.name),
          matchScore(toks, s.category),
          matchScore(toks, s.description),
          matchScore(toks, s.tags),
        );
        return { ...s, score };
      })
      .filter(s => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasKb = matchedKb.length > 0;
    const hasScen = matchedScenarios.length > 0;

    let state;
    if (hasKb && hasScen) state = 'FULLY PLANNED';
    else if (hasKb) state = 'KB-ONLY';
    else if (hasScen) state = 'SCENARIO-ONLY';
    else state = 'DARK';

    return { inv, matchedKb, matchedScenarios, state };
  });
}

export function isInvkscQuery(t) {
  return INVKSC_RE.test(t || '');
}

export async function buildInvkscScript() {
  try {
    const [iRes, kRes, sRes] = await Promise.allSettled([
      fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : null),
    ]);
    const investments = normaliseInvestments(iRes.status === 'fulfilled' ? iRes.value : null);
    const kbArticles = normaliseKb(kRes.status === 'fulfilled' ? kRes.value : null);
    const scenarios = normaliseScenarios(sRes.status === 'fulfilled' ? sRes.value : null);
    const rows = correlate(investments, kbArticles, scenarios);
    const fully = rows.filter(r => r.state === 'FULLY PLANNED').length;
    const kbOnly = rows.filter(r => r.state === 'KB-ONLY').length;
    const scenOnly = rows.filter(r => r.state === 'SCENARIO-ONLY').length;
    const dark = rows.filter(r => r.state === 'DARK').length;
    return `INVKSC Investment×Knowledge×Scenario: ${rows.length} investments analysed. ` +
      `${fully} FULLY PLANNED (KB backing + scenario plan), ` +
      `${kbOnly} KB-ONLY (knowledge without scenario), ${scenOnly} SCENARIO-ONLY (plan without KB), ${dark} DARK. ` +
      (dark > 0 ? `${dark} investments have no knowledge base coverage or scenario plan — strategic gap.` :
        fully > 0 ? `Top planned: ${rows.find(r => r.state === 'FULLY PLANNED')?.inv.name || 'see panel'}.` :
        'No fully planned investments at this time.');
  } catch {
    return 'INVKSC: data fetch failed.';
  }
}

export default function InvestmentKnowledgeScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:invksc-toggle', handler);
    return () => window.removeEventListener('jarvis:invksc-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [iRes, kRes, sRes] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const investments = normaliseInvestments(iRes.status === 'fulfilled' ? iRes.value : null);
      const kbArticles = normaliseKb(kRes.status === 'fulfilled' ? kRes.value : null);
      const scenarios = normaliseScenarios(sRes.status === 'fulfilled' ? sRes.value : null);
      if (!investments.length && !kbArticles.length && !scenarios.length) {
        setErr('No data returned from Investment, Knowledge, or Scenario endpoints.');
      }
      setRows(correlate(investments, kbArticles, scenarios));
      setLastRefresh(new Date());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fully = rows.filter(r => r.state === 'FULLY PLANNED').length;
  const kbOnly = rows.filter(r => r.state === 'KB-ONLY').length;
  const scenOnly = rows.filter(r => r.state === 'SCENARIO-ONLY').length;
  const dark = rows.filter(r => r.state === 'DARK').length;

  const TABS = ['ALL', 'FULLY PLANNED', 'KB-ONLY', 'SCENARIO-ONLY', 'DARK'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.inv.name.toLowerCase().includes(q) ||
        r.inv.description.toLowerCase().includes(q) ||
        r.matchedKb.some(a => a.title.toLowerCase().includes(q)) ||
        r.matchedScenarios.some(s => s.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const coverageBarWidth = total > 0 ? {
    fully: (fully / total) * 100,
    kbOnly: (kbOnly / total) * 100,
    scenOnly: (scenOnly / total) * 100,
    dark: (dark / total) * 100,
  } : { fully: 0, kbOnly: 0, scenOnly: 0, dark: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Investment "${row.inv.name}" [${row.state}]: ` +
      `KB articles: ${row.matchedKb.map(a => a.title).join(', ') || 'none'}. ` +
      `Scenarios: ${row.matchedScenarios.map(s => s.name).join(', ') || 'none'}. ` +
      `Category: ${row.inv.category || 'unknown'}. Ticker: ${row.inv.ticker || 'n/a'}. ` +
      `Give a 2-sentence investment strategic knowledge and scenario coverage brief.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'No assessment returned.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, []);

  const STATE_COLOUR = {
    'FULLY PLANNED': '#00ff88',
    'KB-ONLY': '#a78bfa',
    'SCENARIO-ONLY': '#818cf8',
    'DARK': '#555',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 811200,
          bottom: 8,
          zIndex: 477,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #a78bfa44',
          color: '#a78bfa',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ INVKSC
        {dark > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#a78bfa',
            color: '#000',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {dark}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 16,
      width: 680,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #a78bfa55',
      borderRadius: 8,
      zIndex: 477,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #a78bfa22',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #a78bfa22',
        background: 'rgba(167,139,250,0.05)',
      }}>
        <span style={{ color: '#a78bfa', fontWeight: 700, letterSpacing: 1 }}>
          ◈ INVESTMENT × KNOWLEDGE × SCENARIO
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastRefresh && (
            <span style={{ color: '#555', fontSize: 10 }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: 'none',
              border: '1px solid #a78bfa44',
              color: '#a78bfa',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            {loading ? '…' : '↻'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #a78bfa11' }}>
        {[
          { label: 'FULLY PLANNED', val: fully, col: '#00ff88' },
          { label: 'KB-ONLY', val: kbOnly, col: '#a78bfa' },
          { label: 'SCENARIO-ONLY', val: scenOnly, col: '#818cf8' },
          { label: 'DARK', val: dark, col: '#555' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(167,139,250,0.04)',
            border: `1px solid ${s.col}33`,
            borderRadius: 4,
            padding: '6px 4px',
          }}>
            <div style={{ color: s.col, fontSize: 18, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#556', fontSize: 9, letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {total > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #a78bfa11' }}>
          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: '#0a0014' }}>
            <div style={{ width: `${coverageBarWidth.fully}%`, background: '#00ff88', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.kbOnly}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.scenOnly}%`, background: '#818cf8', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.dark}%`, background: '#333', transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 9, color: '#556' }}>
            <span style={{ color: '#00ff88' }}>■ PLANNED</span>
            <span style={{ color: '#a78bfa' }}>■ KB-ONLY</span>
            <span style={{ color: '#818cf8' }}>■ SCENARIO-ONLY</span>
            <span style={{ color: '#444' }}>■ DARK</span>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? '#a78bfa22' : 'none',
              border: `1px solid ${filter === t ? '#a78bfa' : '#a78bfa33'}`,
              color: filter === t ? '#a78bfa' : '#556',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              letterSpacing: 0.5,
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(167,139,250,0.05)',
            border: '1px solid #a78bfa33',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 11,
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ color: '#ff6666', padding: '4px 12px', fontSize: 11 }}>⚠ {err}</div>
      )}

      {/* Rows */}
      <div style={{ padding: '0 0 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#444', textAlign: 'center', padding: 24, fontSize: 12 }}>
            No matching investments.
          </div>
        )}
        {visible.map((row) => {
          const isExp = expanded === row.inv.id;
          const stateCol = STATE_COLOUR[row.state] || '#888';
          return (
            <div
              key={row.inv.id}
              style={{
                borderBottom: '1px solid #a78bfa0d',
                background: isExp ? 'rgba(167,139,250,0.03)' : 'transparent',
              }}
            >
              {/* Row header */}
              <div
                onClick={() => setExpanded(isExp ? null : row.inv.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: stateCol,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${stateCol}`,
                }} />
                <span style={{ flex: 1, fontWeight: 600, color: '#d0eeff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.inv.name}
                </span>
                <span style={{ color: stateCol, fontSize: 9, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                  {row.state}
                </span>
                {row.inv.ticker && (
                  <span style={{ color: '#a78bfa', fontSize: 9, marginLeft: 4 }}>
                    [{row.inv.ticker}]
                  </span>
                )}
                {row.inv.category && (
                  <span style={{ color: '#556', fontSize: 9, marginLeft: 4 }}>
                    {row.inv.category}
                  </span>
                )}
                <span style={{ color: '#a78bfa44', fontSize: 10, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded split pane */}
              {isExp && (
                <div style={{ padding: '0 12px 10px' }}>
                  {row.inv.description && (
                    <div style={{ color: '#667', fontSize: 11, marginBottom: 8 }}>
                      {row.inv.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* Left: matched KB articles */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#a78bfa', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        KB ARTICLES ({row.matchedKb.length})
                      </div>
                      {row.matchedKb.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No KB articles matched.</div>
                      )}
                      {row.matchedKb.slice(0, 5).map(a => (
                        <div key={a.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#c8e6ff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{a.title}</span>
                            <span style={{ color: '#a78bfa', fontSize: 10 }}>{(a.score * 100).toFixed(0)}%</span>
                          </div>
                          {a.category && (
                            <div style={{ color: '#556', fontSize: 10 }}>{a.category}</div>
                          )}
                          <div style={{ height: 3, background: '#0a0014', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(a.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #a78bfa, #6d28d9)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right: matched scenarios */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#818cf8', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        SCENARIOS ({row.matchedScenarios.length})
                      </div>
                      {row.matchedScenarios.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No scenarios matched.</div>
                      )}
                      {row.matchedScenarios.slice(0, 5).map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#c8deff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{s.name}</span>
                            <span style={{ color: '#818cf8', fontSize: 10 }}>{(s.score * 100).toFixed(0)}%</span>
                          </div>
                          {(s.category || s.status) && (
                            <div style={{ color: '#556', fontSize: 10 }}>
                              {s.category}{s.status ? ` · ${s.status}` : ''}
                            </div>
                          )}
                          <div style={{ height: 3, background: '#06060e', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(s.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #818cf8, #4f46e5)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ASSESS button */}
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      marginTop: 8,
                      background: 'rgba(167,139,250,0.08)',
                      border: '1px solid #a78bfa55',
                      color: '#a78bfa',
                      padding: '3px 14px',
                      borderRadius: 3,
                      cursor: assessing ? 'wait' : 'pointer',
                      fontSize: 11,
                      letterSpacing: 1,
                    }}
                  >
                    {assessing ? 'ASSESSING…' : 'ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
