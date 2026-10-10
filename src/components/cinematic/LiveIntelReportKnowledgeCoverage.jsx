/**
 * F270 — Live Intel × Report × Knowledge Coverage (LIRKC)
 *
 * Answers: "For each live world event (seismic/crypto/FX), does JARVIS have a
 * matching report AND a knowledge-base article to contextualise it?"
 *
 * FULL_COVERAGE  — both a report AND a KB article cover this event.
 * REPORTED_ONLY  — a report exists but no KB article backs it.
 * KB_ONLY        — a KB article exists but no report was filed.
 * BLIND          — neither report nor KB article — documentation gap.
 *
 * Data sources (confirmed real endpoints):
 *   GET /functions/getLiveIntel  → live seismic / crypto / FX events
 *   GET /v1/reports              → report catalog
 *   GET /knowledge/              → knowledge-base articles
 *
 * Stat tiles:  live events / reports / KB articles / blind
 * Amber badge: blind count on button.
 * Expand row:  matched reports with type badge + relevance bar
 *              + matched KB articles with topic badge + relevance bar.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ LIRKC  at left:5940 bottom:18, zIndex:68.
 * Event:   jarvis:lirkc-toggle
 * Voice:   "live intel report knowledge / lirkc / live event documentation /
 *           world event coverage / live knowledge report / event doc gap /
 *           world event knowledge gap / live intel coverage"
 * Refresh: 5 min auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const LIRKC_RE =
  /\b(live[._-]?intel[._-]?report[._-]?knowledge|live[._-]?knowledge[._-]?report|lirkc|live[._-]?event[._-]?doc(?:umentation)?|world[._-]?event[._-]?coverage|world[._-]?event[._-]?knowledge[._-]?gap|live[._-]?intel[._-]?coverage|intel[._-]?report[._-]?knowledge|event[._-]?doc(?:umentation)?[._-]?gap)\b/i;

export function isLirkcQuery(t) {
  return LIRKC_RE.test(t || '');
}

// ─── normalise helpers ────────────────────────────────────────────────────────

function normReports(raw) {
  if (!raw) return [];
  for (const k of ['reports', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normKb(raw) {
  if (!raw) return [];
  for (const k of ['articles', 'items', 'results', 'data', 'knowledge']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normLiveIntel(raw) {
  if (!raw) return [];
  const events = [];
  const d = raw?.data ?? raw;
  if (Array.isArray(d?.earthquakes)) {
    d.earthquakes.slice(0, 15).forEach(q => events.push({
      id: `eq-${q.id || q.place}`,
      type: 'SEISMIC',
      title: q.place || q.title || 'Earthquake',
      detail: `M${q.magnitude ?? '?'} ${q.place ?? ''}`,
      tokens: ['earthquake', 'seismic', 'quake',
        ...(q.place ?? '').toLowerCase().split(/\s+/),
        ...(q.region ?? '').toLowerCase().split(/\s+/)].filter(t => t.length > 2),
    }));
  }
  if (Array.isArray(d?.crypto)) {
    d.crypto.slice(0, 10).forEach(c => events.push({
      id: `cr-${c.symbol || c.name}`,
      type: 'CRYPTO',
      title: `${c.symbol ?? c.name} ${c.change_pct >= 0 ? '+' : ''}${(c.change_pct ?? 0).toFixed(1)}%`,
      detail: `$${(c.price ?? 0).toLocaleString()}`,
      tokens: ['crypto', 'cryptocurrency', 'bitcoin', 'blockchain',
        (c.symbol ?? '').toLowerCase(),
        (c.name ?? '').toLowerCase()].filter(t => t.length > 2),
    }));
  }
  if (Array.isArray(d?.forex)) {
    d.forex.slice(0, 8).forEach(f => events.push({
      id: `fx-${f.pair || f.symbol}`,
      type: 'FX',
      title: `${f.pair ?? f.symbol} ${f.change_pct >= 0 ? '+' : ''}${(f.change_pct ?? 0).toFixed(2)}%`,
      detail: String(f.rate ?? ''),
      tokens: ['forex', 'fx', 'currency', 'exchange',
        ...(f.pair ?? '').toLowerCase().split('/'),
        ...(f.symbol ?? '').toLowerCase().split('/')].filter(t => t.length > 1),
    }));
  }
  return events;
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[\s,._\-/|:;()\[\]]+/)
    .filter(t => t.length > 2);
}

function reportTokens(r) {
  return tokens(
    [r.title, r.name, r.type, r.category, r.description, r.summary,
     ...(Array.isArray(r.tags) ? r.tags : [])].join(' ')
  );
}

function kbTokens(a) {
  return tokens(
    [a.title, a.topic, a.summary, a.content, a.category,
     ...(Array.isArray(a.tags) ? a.tags : [])].join(' ')
  );
}

function score(aToks, bToks) {
  if (!aToks.length || !bToks.length) return 0;
  const a = new Set(aToks);
  const b = new Set(bToks);
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  return hits / Math.max(a.size, b.size);
}

// ─── enrich ──────────────────────────────────────────────────────────────────

function enrich(events, reports, kb) {
  const THRESHOLD = 0.06;
  return events.map(ev => {
    const et = ev.tokens;
    const rMatches = reports
      .map(r => ({ r, score: score(et, reportTokens(r)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const kMatches = kb
      .map(a => ({ a, score: score(et, kbTokens(a)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const hasR = rMatches.length > 0;
    const hasK = kMatches.length > 0;
    const _class = hasR && hasK
      ? 'FULL_COVERAGE'
      : hasR
      ? 'REPORTED_ONLY'
      : hasK
      ? 'KB_ONLY'
      : 'BLIND';
    return { ...ev, _class, _rMatches: rMatches, _kMatches: kMatches };
  });
}

// ─── exported script builder ─────────────────────────────────────────────────

export async function buildLirkcScript() {
  const [liR, rpR, kbR] = await Promise.allSettled([
    fetch(`${API}/functions/getLiveIntel`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/reports`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/knowledge/`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const events  = normLiveIntel(liR.status === 'fulfilled' ? liR.value : {});
  const reports = normReports(rpR.status === 'fulfilled' ? rpR.value : []);
  const kb      = normKb(kbR.status === 'fulfilled' ? kbR.value : []);
  const enriched = enrich(events, reports, kb);
  const blind  = enriched.filter(r => r._class === 'BLIND').length;
  const full   = enriched.filter(r => r._class === 'FULL_COVERAGE').length;
  const blindList = enriched.filter(r => r._class === 'BLIND').slice(0, 3).map(r => r.title).join(', ');
  return (
    `Live Intel × Report × Knowledge: ${events.length} live events, ${reports.length} reports, ${kb.length} KB articles. ` +
    `${full} events have FULL_COVERAGE (report + KB); ${blind} are BLIND — no report filed and no knowledge-base coverage (documentation gap). ` +
    `Top blind events: ${blindList || 'none'}.`
  );
}

// ─── UI constants ─────────────────────────────────────────────────────────────

const CY  = '#29E7FF';
const AMB = '#FFD700';
const GRN = '#00E5A0';
const RED = '#FF4D6D';
const PRP = '#B485FF';

const TYPE_COL = { SEISMIC: RED, CRYPTO: GRN, FX: CY };

const CLASS_COL = {
  FULL_COVERAGE:  GRN,
  REPORTED_ONLY:  CY,
  KB_ONLY:        PRP,
  BLIND:          AMB,
};

const FILTER_TABS = ['ALL', 'FULL_COVERAGE', 'REPORTED_ONLY', 'KB_ONLY', 'BLIND'];

const BASE = {
  position: 'fixed',
  fontFamily: "'Share Tech Mono', 'Courier New', monospace",
  fontSize: 11,
  color: CY,
  zIndex: 68,
};

// ─── component ────────────────────────────────────────────────────────────────

export default function LiveIntelReportKnowledgeCoverage() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [stats, setStats]       = useState({ events: 0, reports: 0, kb: 0, blind: 0 });
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [liR, rpR, kbR] = await Promise.allSettled([
        fetch(`${API}/functions/getLiveIntel`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/v1/reports`,             { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/knowledge/`,             { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const events  = normLiveIntel(liR.status === 'fulfilled' ? liR.value : {});
      const reports = normReports(rpR.status === 'fulfilled' ? rpR.value : []);
      const kb      = normKb(kbR.status === 'fulfilled' ? kbR.value : []);
      const enriched = enrich(events, reports, kb);
      setRows(enriched);
      setStats({
        events:  events.length,
        reports: reports.length,
        kb:      kb.length,
        blind:   enriched.filter(r => r._class === 'BLIND').length,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:lirkc-toggle', handler);
    return () => window.removeEventListener('jarvis:lirkc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 300_000); // 5 min
    return () => clearInterval(id);
  }, [open, load]);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.title || '').toLowerCase().includes(q) || r.type.toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildLirkcScript();
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `You are JARVIS. Summarise in 2 sentences: ${script}` }),
      });
      const j = res.ok ? await res.json() : {};
      const brief = j.response || j.message || j.content || script;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: brief } }));
    } finally {
      setAssessing(false);
    }
  }

  const blindCount = stats.blind;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Live Intel × Report × Knowledge Coverage (LIRKC)"
        style={{
          ...BASE,
          left: 5940, bottom: 18,
          background: 'rgba(0,0,0,0.7)',
          border: `1px solid ${blindCount > 0 ? AMB : CY}`,
          borderRadius: 4, padding: '3px 7px', cursor: 'pointer',
          color: blindCount > 0 ? AMB : CY,
        }}
      >
        ◈ LIRKC
        {blindCount > 0 && (
          <span style={{
            marginLeft: 5, background: AMB, color: '#000',
            borderRadius: 3, padding: '0 4px', fontSize: 10,
          }}>
            {blindCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      ...BASE,
      left: 5940, bottom: 55, width: 540, maxHeight: 580,
      background: 'rgba(0,6,16,0.97)', border: `1px solid ${AMB}`,
      borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid rgba(255,215,0,0.2)`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ color: AMB, fontWeight: 700, flex: 1 }}>
          ◈ LIVE INTEL × REPORT × KNOWLEDGE (LIRKC)
        </span>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: 'none', border: `1px solid ${CY}`, color: CY,
            borderRadius: 3, padding: '2px 7px', cursor: 'pointer', fontSize: 10,
          }}
        >
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      {/* stat tiles */}
      <div style={{
        display: 'flex', gap: 6, padding: '8px 12px',
        borderBottom: `1px solid rgba(255,215,0,0.1)`,
      }}>
        {[
          { label: 'LIVE EVENTS', val: stats.events,  col: CY  },
          { label: 'REPORTS',     val: stats.reports,  col: GRN },
          { label: 'KB ARTICLES', val: stats.kb,       col: PRP },
          { label: 'BLIND',       val: stats.blind,    col: AMB },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            flex: 1, textAlign: 'center',
            background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '4px 2px',
          }}>
            <div style={{ fontSize: 16, color: col, fontWeight: 700 }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* proportional coverage bar */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', height: 6, margin: '4px 12px' }}>
          {FILTER_TABS.slice(1).map(cls => {
            const cnt = rows.filter(r => r._class === cls).length;
            const pct = (cnt / rows.length) * 100;
            return pct > 0 ? (
              <div
                key={cls}
                title={`${cls}: ${cnt}`}
                style={{ width: `${pct}%`, background: CLASS_COL[cls], transition: 'width 0.4s' }}
              />
            ) : null;
          })}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px 0', flexWrap: 'wrap' }}>
        {FILTER_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? (CLASS_COL[t] || CY) : 'none',
            border: `1px solid ${CLASS_COL[t] || CY}`,
            color: tab === t ? '#000' : (CLASS_COL[t] || CY),
            borderRadius: 3, padding: '2px 7px', cursor: 'pointer', fontSize: 10,
          }}>
            {t.replace(/_/g, ' ')}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid #333`, color: CY,
            borderRadius: 3, padding: '2px 6px', fontSize: 10, width: 110,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px 10px' }}>
        {loading && !rows.length && (
          <div style={{ color: '#555', textAlign: 'center', padding: 20 }}>loading…</div>
        )}
        {!loading && !visible.length && (
          <div style={{ color: '#555', textAlign: 'center', padding: 20 }}>no results</div>
        )}
        {visible.map(ev => {
          const isExp = expanded[ev.id];
          const col   = CLASS_COL[ev._class];
          const tyCol = TYPE_COL[ev.type] || CY;
          return (
            <div key={ev.id} style={{
              marginBottom: 6,
              border: `1px solid rgba(255,255,255,0.07)`,
              borderRadius: 5, overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [ev.id]: !e[ev.id] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 8px', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <span style={{
                  background: tyCol, color: '#000', borderRadius: 2,
                  padding: '0 4px', fontSize: 9, minWidth: 44, textAlign: 'center',
                }}>
                  {ev.type}
                </span>
                <span style={{ color: col, fontSize: 10, minWidth: 90, fontWeight: 700 }}>
                  {ev._class.replace(/_/g, ' ')}
                </span>
                <span style={{
                  flex: 1, color: '#ccc',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {ev.title}
                </span>
                <span style={{ color: '#555', fontSize: 10 }}>
                  {ev._rMatches.length}rp / {ev._kMatches.length}kb {isExp ? '▲' : '▼'}
                </span>
              </div>

              {isExp && (
                <div style={{
                  padding: '6px 10px',
                  background: 'rgba(0,0,0,0.4)',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {ev.detail && (
                    <div style={{ color: '#888', fontSize: 10, marginBottom: 6 }}>{ev.detail}</div>
                  )}

                  {/* matched reports */}
                  {ev._rMatches.length > 0 ? (
                    <>
                      <div style={{ color: GRN, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED REPORTS
                      </div>
                      {ev._rMatches.map(({ r, score: s }) => (
                        <div key={r.id || r.title} style={{
                          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
                        }}>
                          <span style={{
                            background: GRN, color: '#000', borderRadius: 2,
                            padding: '0 4px', fontSize: 9, minWidth: 60, textAlign: 'center',
                          }}>
                            {(r.type || r.category || 'REPORT').toUpperCase().slice(0, 10)}
                          </span>
                          <span style={{
                            flex: 1, color: '#aaa', fontSize: 10,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {r.title || r.name || r.id}
                          </span>
                          <div style={{ width: 50, height: 4, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(s * 100)}%`, height: '100%', background: GRN }} />
                          </div>
                          <span style={{ color: '#666', fontSize: 9, minWidth: 28, textAlign: 'right' }}>
                            {(s * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ color: '#555', fontSize: 10, marginBottom: 4 }}>no matching reports</div>
                  )}

                  {/* matched KB articles */}
                  {ev._kMatches.length > 0 ? (
                    <>
                      <div style={{ color: PRP, fontSize: 9, letterSpacing: 1, marginTop: 6, marginBottom: 4 }}>
                        MATCHED KB ARTICLES
                      </div>
                      {ev._kMatches.map(({ a, score: s }) => (
                        <div key={a.id || a.title} style={{
                          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
                        }}>
                          <span style={{
                            background: PRP, color: '#000', borderRadius: 2,
                            padding: '0 4px', fontSize: 9, minWidth: 60, textAlign: 'center',
                          }}>
                            {(a.topic || a.category || 'KB').toUpperCase().slice(0, 10)}
                          </span>
                          <span style={{
                            flex: 1, color: '#aaa', fontSize: 10,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {a.title || a.name || a.id}
                          </span>
                          <div style={{ width: 50, height: 4, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(s * 100)}%`, height: '100%', background: PRP }} />
                          </div>
                          <span style={{ color: '#666', fontSize: 9, minWidth: 28, textAlign: 'right' }}>
                            {(s * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ color: '#555', fontSize: 10, marginTop: 4 }}>no matching KB articles</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
