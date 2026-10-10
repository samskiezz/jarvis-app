/**
 * F278 — Investment × Knowledge × Scenario Intelligence Mesh (IKSM)
 *
 * Answers: "For each investment, is there a matching KB article AND a response
 * scenario?  FULLY_COVERED (both), KB_ONLY, SCENARIO_ONLY, or DARK (neither)?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Investment   → portfolio investments
 *   GET /knowledge/            → KB articles
 *   GET /v1/scenario/list      → response / action scenarios
 *
 * Classification:
 *   FULLY_COVERED   — investment has BOTH a matched KB article AND a matched scenario
 *   KB_ONLY         — KB article matched, no scenario
 *   SCENARIO_ONLY   — scenario matched, no KB article
 *   DARK            — neither (no knowledge, no playbook — highest exposure gap)
 *
 * Stat tiles:  investments / KB articles / scenarios / dark
 * Amber badge: dark count on button
 * Expand row:  matched KB articles (max 5) + matched scenarios (max 5) with relevance bars
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ IKSM  at left:6420 bottom:18, zIndex:68
 * Event:   jarvis:iksm-toggle
 * Voice:   "investment knowledge scenario / iksm / dark investments / investment playbook /
 *           portfolio knowledge / investment scenario / portfolio gap / portfolio coverage /
 *           which investments have knowledge / investment kb / investment coverage"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

// ─── palette ─────────────────────────────────────────────────────────────────
const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const AM   = '#F59E0B';
const CY   = '#06B6D4';
const VI   = '#A78BFA';
const GR   = '#10B981';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS     = ['ALL', 'FULLY_COVERED', 'KB_ONLY', 'SCENARIO_ONLY', 'DARK'];
const CLASS_COLOR = {
  FULLY_COVERED  : GR,
  KB_ONLY        : CY,
  SCENARIO_ONLY  : VI,
  DARK           : AM,
};

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const IKSM_RE =
  /\b(invest(?:ment)?[._-]?knowledge[._-]?scenario|invest(?:ment)?[._-]?kb|invest(?:ment)?[._-]?scenario|iksm|dark[._-]?invest(?:ment)?s?|portfolio[._-]?(?:knowledge|scenario|gap|coverage|kb|playbook)|invest(?:ment)?[._-]?(?:coverage|playbook)|which[._-]?invest(?:ment)?s?[._-]?have[._-]?knowledge)\b/i;

export function isIksmQuery(t) {
  return IKSM_RE.test(t || '');
}

export async function buildIksmScript() {
  const [invR, kbR, scR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/knowledge/`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const investments = normInvestments(invR.status === 'fulfilled' ? invR.value : []);
  const articles    = normKb(kbR.status          === 'fulfilled' ? kbR.value  : []);
  const scenarios   = normScenarios(scR.status   === 'fulfilled' ? scR.value  : []);
  const enriched    = enrich(investments, articles, scenarios);
  const dark        = enriched.filter(r => r._class === 'DARK').length;
  const full        = enriched.filter(r => r._class === 'FULLY_COVERED').length;
  return (
    `Investment × Knowledge × Scenario Mesh: ${investments.length} investments, ` +
    `${articles.length} KB articles, ${scenarios.length} scenarios. ` +
    `${full} investments are fully covered (KB article + scenario match); ` +
    `${dark} are DARK (no knowledge, no playbook — portfolio intelligence gap). ` +
    `Dark investments: ${enriched.filter(r => r._class === 'DARK').slice(0, 3)
      .map(r => r.name || r.title || '?').join(', ') || 'none'}.`
  );
}

// ─── normalise ───────────────────────────────────────────────────────────────
function normInvestments(raw) {
  if (!raw) return [];
  for (const k of ['investments', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normKb(raw) {
  if (!raw) return [];
  for (const k of ['articles', 'knowledge', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normScenarios(raw) {
  if (!raw) return [];
  for (const k of ['scenarios', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

// ─── keyword scoring ─────────────────────────────────────────────────────────
function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[\s,;|/\-_().[\]]+/)
    .filter(t => t.length > 2);
}

function overlap(aStr, bStr) {
  const a = new Set(tokens(aStr));
  const b = tokens(bStr);
  if (!a.size || !b.length) return 0;
  return b.filter(t => a.has(t)).length / Math.max(a.size, b.length);
}

function invText(inv) {
  return [inv.name, inv.title, inv.description, inv.sector, inv.type, inv.category,
    inv.ticker, inv.currency, inv.tags, inv.notes].join(' ');
}

function kbText(art) {
  return [art.title, art.topic, art.summary, art.content, art.category,
    art.tags, art.author].join(' ');
}

function scText(sc) {
  return [sc.name, sc.title, sc.description, sc.type, sc.category, sc.tags,
    sc.objective, sc.trigger].join(' ');
}

// ─── classify ────────────────────────────────────────────────────────────────
function enrich(investments, articles, scenarios) {
  return investments.map(inv => {
    const it = invText(inv);
    const kbMatches = articles
      .map(a => ({ ...a, _score: overlap(it, kbText(a)) }))
      .filter(a => a._score > 0.02)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const scMatches = scenarios
      .map(s => ({ ...s, _score: overlap(it, scText(s)) }))
      .filter(s => s._score > 0.02)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    let _class = 'DARK';
    if (kbMatches.length && scMatches.length) _class = 'FULLY_COVERED';
    else if (kbMatches.length)                _class = 'KB_ONLY';
    else if (scMatches.length)                _class = 'SCENARIO_ONLY';
    return { ...inv, _kbMatches: kbMatches, _scMatches: scMatches, _class };
  });
}

// ─── component ───────────────────────────────────────────────────────────────
export default function InvestmentKnowledgeScenarioMesh() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [filter,   setFilter]   = useState('ALL');
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [invR, kbR, scR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
      ]);
      const investments = normInvestments(invR.status === 'fulfilled' ? invR.value : []);
      const articles    = normKb(kbR.status          === 'fulfilled' ? kbR.value  : []);
      const scenarios   = normScenarios(scR.status   === 'fulfilled' ? scR.value  : []);
      setRows(enrich(investments, articles, scenarios));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // toggle listener
  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:iksm-toggle', handler);
    return () => window.removeEventListener('jarvis:iksm-toggle', handler);
  }, []);

  // auto-refresh
  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildIksmScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Briefly assess this data in 2 sentences: ${script}` }),
      }).then(r => r.json());
      const brief = r?.response || r?.message || r?.content || script;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: brief } }));
    } catch {
      const fallback = await buildIksmScript();
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: fallback } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r._class !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(r.name || r.title || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const dark     = rows.filter(r => r._class === 'DARK').length;
  const full     = rows.filter(r => r._class === 'FULLY_COVERED').length;
  const kbOnly   = rows.filter(r => r._class === 'KB_ONLY').length;
  const scOnly   = rows.filter(r => r._class === 'SCENARIO_ONLY').length;

  // ── button ───────────────────────────────────────────────────────────────
  const btn = (
    <button
      onClick={() => setOpen(v => !v)}
      title="Investment × Knowledge × Scenario Mesh (IKSM)"
      style={{
        position: 'fixed', left: 6420, bottom: 18, zIndex: 68,
        background: open ? 'rgba(245,158,11,0.20)' : 'rgba(10,12,20,0.85)',
        border: `1px solid ${open ? AM : BD}`,
        borderRadius: 6, color: open ? AM : MU,
        fontFamily: MONO, fontSize: 11, fontWeight: 700,
        padding: '4px 9px', cursor: 'pointer', whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', gap: 5,
      }}
    >
      ◈ IKSM
      {dark > 0 && (
        <span style={{
          background: AM, color: '#000', borderRadius: 10,
          padding: '1px 5px', fontSize: 10,
        }}>{dark}</span>
      )}
    </button>
  );

  if (!open) return btn;

  // ── panel ────────────────────────────────────────────────────────────────
  return (
    <>
      {btn}
      <div style={{
        position: 'fixed', left: 6320, bottom: 60, zIndex: 69,
        width: 680, maxHeight: '75vh',
        background: BG, border: `1px solid ${BD}`,
        borderRadius: 10, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        fontFamily: MONO, fontSize: 12, color: '#E2E8F0',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        {/* header */}
        <div style={{
          padding: '10px 14px', borderBottom: `1px solid ${BD}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: AM, fontWeight: 700, fontSize: 13 }}>
            INVESTMENT × KNOWLEDGE × SCENARIO MESH
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={assess}
              disabled={assessing || loading}
              style={{
                background: 'rgba(245,158,11,0.15)', border: `1px solid ${AM}`,
                borderRadius: 4, color: AM, fontFamily: MONO,
                fontSize: 10, padding: '2px 8px', cursor: 'pointer',
              }}
            >
              {assessing ? '…' : '▶ ASSESS'}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none', border: 'none', color: MU,
                cursor: 'pointer', fontSize: 16, lineHeight: 1,
              }}
            >×</button>
          </div>
        </div>

        {/* stat tiles */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
          gap: 1, background: BD, borderBottom: `1px solid ${BD}`,
        }}>
          {[
            ['INVESTMENTS', rows.length, '#E2E8F0'],
            ['KB ARTICLES', null, CY],
            ['SCENARIOS',   null, VI],
            ['DARK',        dark, AM],
          ].map(([label, val, color]) => (
            <div key={label} style={{
              background: BG, padding: '8px 12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{val ?? '—'}</div>
              <div style={{ fontSize: 9, color: MU, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* coverage bar */}
        {rows.length > 0 && (
          <div style={{ padding: '6px 14px', borderBottom: `1px solid ${BD}` }}>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
              {[
                [full,   GR],
                [kbOnly, CY],
                [scOnly, VI],
                [dark,   AM],
              ].map(([count, color], i) => (
                <div key={i} style={{
                  flex: count, background: color,
                  opacity: count === 0 ? 0 : 1,
                  transition: 'flex 0.4s',
                }} />
              ))}
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 9, color: MU, marginTop: 3,
            }}>
              <span style={{ color: GR }}>FULL:{full}</span>
              <span style={{ color: CY }}>KB:{kbOnly}</span>
              <span style={{ color: VI }}>SC:{scOnly}</span>
              <span style={{ color: AM }}>DARK:{dark}</span>
            </div>
          </div>
        )}

        {/* filter tabs */}
        <div style={{
          display: 'flex', gap: 4, padding: '6px 14px',
          borderBottom: `1px solid ${BD}`,
        }}>
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? 'rgba(245,158,11,0.20)' : 'none',
                border: `1px solid ${filter === f ? AM : BD}`,
                borderRadius: 4, color: filter === f ? AM : MU,
                fontFamily: MONO, fontSize: 9, padding: '2px 7px',
                cursor: 'pointer',
              }}
            >
              {f}
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${BD}`, borderRadius: 4, color: '#E2E8F0',
              fontFamily: MONO, fontSize: 10, padding: '2px 8px', width: 140,
              outline: 'none',
            }}
          />
        </div>

        {/* rows */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: MU }}>Loading…</div>
          )}
          {error && (
            <div style={{ padding: 12, color: '#F87171', fontSize: 11 }}>Error: {error}</div>
          )}
          {!loading && !error && visible.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: MU, fontSize: 11 }}>
              No investments match filter.
            </div>
          )}
          {visible.map((row, i) => {
            const isExp = expanded === i;
            const color = CLASS_COLOR[row._class] || MU;
            const label = row.name || row.title || row.ticker || `inv-${i}`;
            return (
              <div
                key={i}
                style={{ borderBottom: `1px solid ${BD}` }}
              >
                <div
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    padding: '8px 14px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: isExp ? 'rgba(255,255,255,0.03)' : 'none',
                  }}
                >
                  <span style={{
                    fontSize: 9, fontWeight: 700, color,
                    border: `1px solid ${color}`, borderRadius: 3,
                    padding: '1px 5px', whiteSpace: 'nowrap',
                  }}>{row._class}</span>
                  <span style={{ flex: 1, fontSize: 11 }}>{label}</span>
                  {row.sector && (
                    <span style={{ fontSize: 9, color: MU }}>{row.sector}</span>
                  )}
                  <span style={{ color: MU, fontSize: 13 }}>{isExp ? '▲' : '▼'}</span>
                </div>

                {isExp && (
                  <div style={{ padding: '4px 20px 12px' }}>
                    {/* KB matches */}
                    {row._kbMatches.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 9, color: CY, marginBottom: 4 }}>
                          KB ARTICLES ({row._kbMatches.length})
                        </div>
                        {row._kbMatches.map((a, j) => (
                          <div key={j} style={{ marginBottom: 4 }}>
                            <div style={{
                              display: 'flex', justifyContent: 'space-between',
                              fontSize: 10,
                            }}>
                              <span>{a.title || a.topic || `article-${j}`}</span>
                              <span style={{ color: CY }}>
                                {(a._score * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div style={{
                              height: 3, background: 'rgba(6,182,212,0.15)',
                              borderRadius: 2, marginTop: 2,
                            }}>
                              <div style={{
                                height: '100%', borderRadius: 2,
                                background: CY,
                                width: `${Math.min(100, a._score * 100 * 4)}%`,
                              }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Scenario matches */}
                    {row._scMatches.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: VI, marginBottom: 4 }}>
                          SCENARIOS ({row._scMatches.length})
                        </div>
                        {row._scMatches.map((s, j) => (
                          <div key={j} style={{ marginBottom: 4 }}>
                            <div style={{
                              display: 'flex', justifyContent: 'space-between',
                              fontSize: 10,
                            }}>
                              <span>{s.name || s.title || `scenario-${j}`}</span>
                              <span style={{ color: VI }}>
                                {(s._score * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div style={{
                              height: 3, background: 'rgba(167,139,250,0.15)',
                              borderRadius: 2, marginTop: 2,
                            }}>
                              <div style={{
                                height: '100%', borderRadius: 2,
                                background: VI,
                                width: `${Math.min(100, s._score * 100 * 4)}%`,
                              }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {row._kbMatches.length === 0 && row._scMatches.length === 0 && (
                      <div style={{ fontSize: 10, color: AM }}>
                        No knowledge or scenario coverage found.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* footer */}
        <div style={{
          padding: '6px 14px', borderTop: `1px solid ${BD}`,
          fontSize: 9, color: MU, display: 'flex', justifyContent: 'space-between',
        }}>
          <span>90 s auto-refresh</span>
          <span>{rows.length} investments</span>
        </div>
      </div>
    </>
  );
}
