/**
 * F72 — Knowledge × Risk Signal Coverage (KBRISK)
 *
 * Parallel-fetches /knowledge/ KB articles + /entities/RiskSignal,
 * then keyword-correlates each KB article's text against active risk
 * signals to surface:
 *   RISK-TAGGED — at least one risk signal overlaps this article's domain
 *   CLEAR       — no active risk signal alignment (no monitored threat)
 *
 * Stat tiles: KB articles / risk signals / risk-tagged / clear
 * Filter tabs: ALL | RISK-TAGGED | CLEAR
 * Expand any article → matched risk signals with severity badge + relevance score.
 * Amber badge on RISK-TAGGED count.
 * ▶ ASSESS: 2-sentence knowledge-risk brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ KBRISK  at bottom:8 left:686880, zIndex:255.
 * Event:   jarvis:kbrisk-toggle
 * Voice:   "knowledge risk / risk knowledge / kbrisk / risk kb /
 *           knowledge risk signal / risk tagged knowledge / risky knowledge /
 *           kb risk signal / which kb articles have risk signals"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const POLL_MS = 90_000;
const AM = '#f59e0b';

const KBRISK_RE =
  /\b(knowledge[._-]?risk|risk[._-]?knowledge|kbrisk|risk[._-]?kb|kb[._-]?risk|knowledge[._-]?risk[._-]?signal|risk[._-]?tagged[._-]?knowledge|risky[._-]?knowledge|kb[._-]?risk[._-]?signal|which[._-]?kb[._-]?articles?[._-]?(have|match)[._-]?risk|knowledge[._-]?threat)\b/i;

export function isKbriskQuery(t) {
  return KBRISK_RE.test(t || '');
}

export async function buildKbriskScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [kbR, riskR] = await Promise.allSettled([
      fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
      fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
    ]);
    const articles = normaliseKB(kbR.status === 'fulfilled' ? kbR.value : []);
    const signals  = normaliseRisk(riskR.status === 'fulfilled' ? riskR.value : []);
    const enriched = correlate(articles, signals);
    const tagged   = enriched.filter(a => a._tagged).length;
    const clear    = enriched.length - tagged;
    const topTagged = enriched
      .filter(a => a._tagged)
      .slice(0, 4)
      .map(a => a.title || a.id)
      .join(', ') || 'none';
    return (
      `Knowledge × Risk Signal Coverage: ${articles.length} KB articles cross-matched against ` +
      `${signals.length} active risk signals. ${tagged} articles are RISK-TAGGED (threat signal overlap detected); ` +
      `${clear} articles are CLEAR (no active risk signal alignment). ` +
      `Risk-tagged articles include: ${topTagged}.`
    );
  } catch {
    return 'Knowledge × Risk Signal Coverage assessment unavailable at this time, sir.';
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseKB(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.articles)         ? raw.articles
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.data)             ? raw.data
    : [];
  return arr.map((a, i) => ({
    id:          a.id          || a.slug      || String(i),
    title:       a.title       || a.name      || a.label || `Article ${i + 1}`,
    category:    a.category    || a.type      || a.domain || '',
    summary:     (a.summary    || a.content   || a.body || a.abstract || a.description || '').toString().slice(0, 400),
    tags:        Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
    author:      a.author      || a.created_by || '',
  }));
}

function normaliseRisk(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.risk_signals)        ? raw.risk_signals
    : Array.isArray(raw?.signals)             ? raw.signals
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.results)             ? raw.results
    : Array.isArray(raw?.data)                ? raw.data
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || String(i),
    name:        s.name        || s.title     || s.label || `Signal ${i + 1}`,
    severity:    s.severity    || s.level     || s.priority || '',
    category:    s.category    || s.type      || s.sector || s.domain || '',
    description: (s.description || s.summary || s.details || s.body || '').toString().slice(0, 300),
    source:      s.source      || s.origin    || '',
    tags:        Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function articleTokens(article) {
  return new Set([
    ...tokens(article.title),
    ...tokens(article.category),
    ...tokens(article.summary),
    ...tokens(article.tags),
  ].filter(Boolean));
}

function matchScore(article, signal) {
  const aToks = articleTokens(article);
  const sToks = [
    ...tokens(signal.name),
    ...tokens(signal.category),
    ...tokens(signal.description),
    ...tokens(signal.source),
    ...tokens(signal.tags),
  ].filter(Boolean);
  if (!aToks.size || !sToks.length) return 0;
  let hits = 0;
  for (const t of sToks) if (aToks.has(t)) hits++;
  return hits / Math.max(aToks.size, sToks.length);
}

function correlate(articles, signals) {
  return articles.map(article => {
    const scored = signals
      .map(s => ({ ...s, _score: matchScore(article, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...article, _matches: scored, _tagged: scored.length > 0 };
  });
}

function severityColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical' || s === 'high')   return '#f87171';
  if (s === 'medium'   || s === 'moderate') return AM;
  if (s === 'low'      || s === 'info')   return '#22c55e';
  return '#64748b';
}

// ── styles ────────────────────────────────────────────────────────────────────

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW  = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ['ALL', 'RISK-TAGGED', 'CLEAR'];

export default function KnowledgeRiskSignalCoverage() {
  const [open,       setOpen]       = useState(false);
  const [articles,   setArticles]   = useState([]);
  const [signals,    setSignals]    = useState([]);
  const [enriched,   setEnriched]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState('');
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [kbR, riskR] = await Promise.allSettled([
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
      ]);
      const rawArticles = normaliseKB(kbR.status === 'fulfilled' ? kbR.value : []);
      const rawSignals  = normaliseRisk(riskR.status === 'fulfilled' ? riskR.value : []);
      setArticles(rawArticles);
      setSignals(rawSignals);
      setEnriched(correlate(rawArticles, rawSignals));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:kbrisk-toggle', h);
    return () => window.removeEventListener('jarvis:kbrisk-toggle', h);
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
    const tagged = enriched.filter(a => a._tagged).length;
    const clear  = enriched.filter(a => !a._tagged).length;
    const topTagged = enriched
      .filter(a => a._tagged)
      .flatMap(a => a._matches.slice(0, 2).map(s => s.name))
      .slice(0, 5)
      .join(', ') || 'none';
    const prompt =
      `Knowledge × Risk Signal Coverage: ${articles.length} KB articles cross-matched against ` +
      `${signals.length} active risk signals. ${tagged} articles are RISK-TAGGED (threat signal domain overlap); ` +
      `${clear} articles have no active risk signal alignment. ` +
      `Top risk signals detected in knowledge base: ${topTagged}. ` +
      `Give a 2-sentence knowledge-risk brief: which knowledge domains are risk-aligned, ` +
      `and what the overlap means for operational threat awareness.`;
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

  const taggedCount = enriched.filter(a => a._tagged).length;
  const badgeColor  = taggedCount > 0 ? AM : '#22c55e';

  const visible = enriched.filter(article => {
    const label = (article.title || article.id).toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'RISK-TAGGED') return article._tagged;
    if (tab === 'CLEAR')       return !article._tagged;
    return true;
  });

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Knowledge × Risk Signal Coverage"
        style={{
          position: 'fixed',
          left: 686880,
          bottom: 8,
          zIndex: 255,
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
          boxShadow: taggedCount > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        KBRISK
        {taggedCount > 0 && (
          <span style={{ background: badgeColor, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {taggedCount}
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
          zIndex: 9110,
          width: 'min(700px, 96vw)',
          maxHeight: '82vh',
          background: 'rgba(8,14,24,0.96)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 14,
          boxShadow: '0 0 60px rgba(245,158,11,0.12)',
          backdropFilter: 'blur(16px)',
          fontFamily: "'JetBrains Mono',monospace",
          color: '#e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: AM, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>◈ KNOWLEDGE × RISK SIGNAL COVERAGE</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b' }}>
              {loading ? 'loading…' : err ? '⚠ ' + err : `${articles.length} articles · ${signals.length} risk signals`}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
            {[
              { label: 'KB ARTICLES',  val: enriched.length,                         color: '#94a3b8' },
              { label: 'RISK SIGNALS', val: signals.length,                           color: '#94a3b8' },
              { label: 'RISK-TAGGED',  val: taggedCount,                              color: AM },
              { label: 'CLEAR',        val: enriched.length - taggedCount,            color: '#22c55e' },
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
              placeholder="search articles…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 7, color: '#e2e8f0', padding: '3px 10px', fontSize: 11, outline: 'none', width: 160,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#475569', fontSize: 12 }}>No results</div>
            )}
            {visible.map((article) => {
              const label  = article.title || article.id;
              const isExp  = expanded === article.id;
              const stClr  = article._tagged ? AM : '#22c55e';
              return (
                <div key={article.id}>
                  <div
                    onClick={() => setExpanded(isExp ? null : article.id)}
                    style={{ ...ROW, background: isExp ? 'rgba(245,158,11,0.05)' : undefined }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isExp ? 'rgba(245,158,11,0.05)' : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: stClr + '22', color: stClr }}>
                        {article._tagged ? 'RISK-TAGGED' : 'CLEAR'}
                      </span>
                      {article.category && (
                        <span style={{ ...PILL, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>{article.category}</span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{label}</span>
                      {article._matches?.length > 0 && (
                        <span style={{ fontSize: 10, color: '#64748b' }}>
                          {article._matches.length} signal{article._matches.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* expanded: matched risk signals */}
                  {isExp && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 24px 10px' }}>
                      {article._matches?.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#475569', padding: '6px 0' }}>No risk signal matches — knowledge domain is clear.</div>
                      ) : (
                        article._matches.map((sig) => (
                          <div key={sig.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ ...PILL, background: severityColor(sig.severity) + '22', color: severityColor(sig.severity) }}>
                              {sig.severity || 'UNKNOWN'}
                            </span>
                            {sig.category && (
                              <span style={{ ...PILL, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>{sig.category}</span>
                            )}
                            <span style={{ fontSize: 11, flex: 1 }}>{sig.name}</span>
                            <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                <div style={{ width: `${Math.min(100, sig._score * 300)}%`, height: '100%', background: AM, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 9, color: '#64748b', minWidth: 22 }}>{(sig._score * 100).toFixed(0)}%</span>
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
