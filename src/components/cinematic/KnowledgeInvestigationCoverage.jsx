/**
 * F78 — Knowledge × Investigation Coverage (KBINV)
 *
 * Parallel-fetches /knowledge/ + /v1/investigations, then keyword-correlates
 * each open investigation against KB articles to surface:
 *   INFORMED — at least one KB article covers this investigation's domain
 *   BLIND    — no knowledge base backing for this case (intelligence gap)
 *
 * Stat tiles: investigations / KB articles / informed / blind
 * Filter tabs: ALL | INFORMED | BLIND + text search
 * Expand any case → matched KB articles with category badge + relevance score.
 * Amber badge on BLIND count.
 * ▶ ASSESS: 2-sentence investigation-knowledge coverage brief via
 *   /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ KBINV  at bottom:8 left:689680, zIndex:260.
 * Event:   jarvis:kbinv-toggle
 * Voice:   "knowledge invest / invest knowledge / kbinv / investigation kb /
 *           uninformed case / investigation knowledge gap / kb investigation /
 *           case knowledge / case kb / blind investigation"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API     = '';
const POLL_MS = 90_000;
const AM      = '#f59e0b'; // amber

const KBINV_RE =
  /\b(knowledge[._-]?invest(?:igation)?s?|invest(?:igation)?[._-]?knowledge|kbinv|investigation[._-]?kb|uninformed[._-]?cases?|investigation[._-]?knowledge[._-]?gap|kb[._-]?investigations?|case[._-]?knowledge|case[._-]?kb|blind[._-]?investigations?)\b/i;

export function isKbinvQuery(t) {
  return KBINV_RE.test(t || '');
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normaliseInvestigations(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'investigations', 'cases', 'records', 'entities']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseArticles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['articles', 'knowledge', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function invTokens(inv) {
  return new Set([
    ...tok(inv.title),
    ...tok(inv.name),
    ...tok(inv.description),
    ...tok(inv.subject),
    ...tok(inv.kind),
    ...tok(inv.type),
    ...tok(inv.tags),
    ...tok(inv.category),
    ...tok(inv.status),
  ].filter(Boolean));
}

function artTokens(art) {
  return [
    ...tok(art.title),
    ...tok(art.name),
    ...tok(art.summary),
    ...tok(art.description),
    ...tok(art.category),
    ...tok(art.type),
    ...tok(art.tags),
    ...tok(art.content),
  ].filter(Boolean);
}

function matchScore(inv, article) {
  const iToks = invTokens(inv);
  if (!iToks.size) return 0;
  const aToks = artTokens(article);
  let hits = 0;
  for (const t of aToks) if (iToks.has(t)) hits++;
  return hits / Math.max(iToks.size, aToks.length, 1);
}

function correlate(investigations, articles) {
  return investigations.map(inv => {
    const scored = articles
      .map(art => ({ art, score: matchScore(inv, art) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...inv, _matches: scored, _informed: scored.length > 0 };
  });
}

// ── voice script ──────────────────────────────────────────────────────────────

export async function buildKbinvScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [invR, kbR] = await Promise.allSettled([
      fetch(`${API}/v1/investigations`, { headers: hdr }).then(r => r.json()),
      fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
    ]);
    const investigations = normaliseInvestigations(invR.status === 'fulfilled' ? invR.value : []);
    const articles       = normaliseArticles(kbR.status === 'fulfilled' ? kbR.value : []);
    const enriched       = correlate(investigations, articles);
    const informed = enriched.filter(c => c._informed).length;
    const blind    = enriched.filter(c => !c._informed).length;
    const topBlind = enriched
      .filter(c => !c._informed)
      .slice(0, 3)
      .map(c => c.title || c.name || '?')
      .join(', ') || 'none';
    return (
      `Knowledge × Investigation Coverage: ${investigations.length} open investigations cross-matched against ` +
      `${articles.length} knowledge base articles. ${informed} cases are INFORMED (KB article backing found); ` +
      `${blind} cases are BLIND (no knowledge base coverage — intelligence gap). ` +
      `Uninformed cases: ${topBlind}.`
    );
  } catch {
    return 'Knowledge × Investigation Coverage assessment unavailable at this time, sir.';
  }
}

// ── styles ────────────────────────────────────────────────────────────────────
const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW  = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

const TABS = ['ALL', 'INFORMED', 'BLIND'];

// ── component ─────────────────────────────────────────────────────────────────
export default function KnowledgeInvestigationCoverage() {
  const [open,          setOpen]          = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [articles,      setArticles]      = useState([]);
  const [enriched,      setEnriched]      = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [err,           setErr]           = useState('');
  const [tab,           setTab]           = useState('ALL');
  const [search,        setSearch]        = useState('');
  const [expanded,      setExpanded]      = useState(null);
  const [assessing,     setAssessing]     = useState(false);
  const [assessment,    setAssessment]    = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [invR, kbR] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
      ]);
      const invs  = normaliseInvestigations(invR.status === 'fulfilled' ? invR.value : []);
      const arts  = normaliseArticles(kbR.status === 'fulfilled' ? kbR.value : []);
      setInvestigations(invs);
      setArticles(arts);
      setEnriched(correlate(invs, arts));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:kbinv-toggle', h);
    return () => window.removeEventListener('jarvis:kbinv-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const informed = enriched.filter(c => c._informed).length;
    const blind    = enriched.filter(c => !c._informed).length;
    const prompt =
      `Knowledge × Investigation Coverage: ${investigations.length} open investigations cross-matched against ` +
      `${articles.length} knowledge base articles. ${informed} cases are INFORMED (KB backing found); ` +
      `${blind} are BLIND (no knowledge base coverage — intelligence gap). ` +
      `Uninformed cases: ${enriched.filter(c => !c._informed).slice(0, 4).map(c => c.title || c.name || '?').join(', ') || 'none'}. ` +
      `Provide a 2-sentence investigation-knowledge coverage assessment: which investigative domains ` +
      `have strong KB backing, and which uninformed cases represent the biggest intelligence gaps.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.answer || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const blindCount  = enriched.filter(c => !c._informed).length;
  const badgeColor  = blindCount > 0 ? AM : '#22c55e';

  const getId = (inv) => inv.id || inv._id || inv.case_id || inv.title || String(Math.random());

  const visible = enriched.filter(inv => {
    const q = search.toLowerCase();
    if (q && !(inv.title || inv.name || '').toLowerCase().includes(q)) return false;
    if (tab === 'INFORMED') return inv._informed;
    if (tab === 'BLIND')    return !inv._informed;
    return true;
  });

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Knowledge × Investigation Coverage"
        style={{
          position: 'fixed',
          left: 689680,
          bottom: 8,
          zIndex: 260,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: '#e2e8f0',
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          letterSpacing: 1,
        }}
      >
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: badgeColor,
          boxShadow: blindCount > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        KBINV
        {blindCount > 0 && (
          <span style={{ background: badgeColor, color: '#000', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {blindCount}
          </span>
        )}
      </button>

      {/* ── panel ── */}
      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9105,
          width: 'min(700px, 96vw)',
          maxHeight: '82vh',
          background: 'rgba(8,14,24,0.96)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 14,
          boxShadow: '0 0 60px rgba(245,158,11,0.10)',
          backdropFilter: 'blur(16px)',
          fontFamily: "'JetBrains Mono',monospace",
          color: '#e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: AM, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>◈ KNOWLEDGE × INVESTIGATION COVERAGE</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b' }}>
              {loading ? 'loading…' : err ? '⚠ ' + err : `${enriched.length} cases · ${articles.length} KB articles`}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
            {[
              { label: 'INVESTIGATIONS', val: enriched.length,                         color: '#94a3b8' },
              { label: 'KB ARTICLES',    val: articles.length,                         color: '#94a3b8' },
              { label: 'INFORMED',       val: enriched.filter(c => c._informed).length, color: '#22c55e' },
              { label: 'BLIND',          val: blindCount,                               color: AM },
            ].map(t => (
              <div key={t.label} style={TILE}>
                <div style={{ fontSize: 20, fontWeight: 700, color: t.color }}>{t.val}</div>
                <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: tab === t ? AM : 'rgba(255,255,255,0.06)',
                color: tab === t ? '#000' : '#94a3b8',
                border: 'none',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search cases…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 7, color: '#e2e8f0', padding: '3px 10px', fontSize: 11, outline: 'none', width: 170,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#475569', fontSize: 12 }}>No results</div>
            )}
            {visible.map(inv => {
              const id    = getId(inv);
              const isExp = expanded === id;
              const stClr = inv._informed ? '#22c55e' : AM;
              return (
                <div key={id}>
                  <div
                    onClick={() => setExpanded(isExp ? null : id)}
                    style={{ ...ROW, background: isExp ? 'rgba(245,158,11,0.05)' : undefined }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isExp ? 'rgba(245,158,11,0.05)' : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: stClr + '22', color: stClr }}>
                        {inv._informed ? 'INFORMED' : 'BLIND'}
                      </span>
                      {(inv.kind || inv.type) && (
                        <span style={{ ...PILL, background: 'rgba(245,158,11,0.12)', color: AM }}>
                          {inv.kind || inv.type}
                        </span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.title || inv.name || id}
                      </span>
                      {inv._matches?.length > 0 && (
                        <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>
                          {inv._matches.length} article{inv._matches.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* expanded: matched KB articles */}
                  {isExp && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 24px 10px' }}>
                      {inv._matches?.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#475569', padding: '6px 0' }}>
                          No knowledge base articles cover this investigation — intelligence gap.
                        </div>
                      ) : (
                        inv._matches.map(({ art, score }, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            {(art.category || art.type) && (
                              <span style={{ ...PILL, background: 'rgba(245,158,11,0.15)', color: AM, flexShrink: 0 }}>
                                {art.category || art.type}
                              </span>
                            )}
                            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {art.title || art.name || '(untitled)'}
                            </span>
                            <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                <div style={{ width: `${Math.min(100, score * 300)}%`, height: '100%', background: AM, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 9, color: '#64748b', minWidth: 22 }}>{(score * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess + assessment */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={assess}
              disabled={assessing || enriched.length === 0}
              style={{
                padding: '5px 16px', borderRadius: 8, border: `1px solid ${AM}44`,
                background: assessing ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.08)',
                color: AM, cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1,
              }}
            >
              {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
            </button>
            {assessment && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#cbd5e1', lineHeight: 1.6, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px' }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
