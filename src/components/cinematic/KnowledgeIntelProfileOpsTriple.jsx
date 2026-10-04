import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const KIPOE_RE = /\b(kipoe|knowledge[\s_-]*intel(?:[\s_-]*profile)?[\s_-]*ops|kb[\s_-]*intel[\s_-]*ops|knowledge[\s_-]*ops[\s_-]*intel|intel[\s_-]*ops[\s_-]*knowledge|knowledge[\s_-]*profile[\s_-]*ops|knowledge[\s_-]*intel[\s_-]*event|kb[\s_-]*profile[\s_-]*ops|dormant[\s_-]*knowledge[\s_-]*intel|activated[\s_-]*knowledge[\s_-]*profile|knowledge[\s_-]*intel[\s_-]*ops[\s_-]*event|ops[\s_-]*knowledge[\s_-]*intel|intel[\s_-]*knowledge[\s_-]*ops)\b/i;
const THRESHOLD = 0.07;

export function isKipoeQuery(t) { return KIPOE_RE.test(t || ''); }

export async function buildKipoeScript() {
  try {
    const [kbRes, intelRes, opsRes] = await Promise.all([
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const articles = normaliseKb(kbRes);
    const intels   = normaliseIntels(intelRes);
    const ops      = normaliseOps(opsRes);
    const classified = articles.map(a => classifyArticle(a, intels, ops));
    const activated   = classified.filter(a => a.state === 'FULLY_ACTIVATED').length;
    const intelPrimed = classified.filter(a => a.state === 'INTEL_PRIMED').length;
    const opsTrigged  = classified.filter(a => a.state === 'OPS_TRIGGERED').length;
    const dormant     = classified.filter(a => a.state === 'DORMANT').length;
    const total       = classified.length;
    return `KIPOE Coverage: ${total} KB articles analysed. ` +
      `Fully activated (intel+ops): ${activated}. ` +
      `Intel-primed only: ${intelPrimed}. ` +
      `Ops-triggered only: ${opsTrigged}. ` +
      `Dormant (no intel or ops coverage): ${dormant}. ` +
      `Activation ratio: ${total ? Math.round((activated / total) * 100) : 0}%.`;
  } catch {
    return 'KIPOE: unable to build coverage script — check endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  let hits = 0;
  for (const t of toks) { if (ft.some(f => f.includes(t) || t.includes(f))) hits++; }
  return hits / toks.length;
}

function normaliseKb(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.articles || raw?.knowledge || raw?.data || raw?.items || []);
  return arr.map((a, i) => ({
    id:       a.id || a._id || `kb-${i}`,
    title:    a.title || a.name || a.label || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    summary:  a.summary || a.description || a.content || a.excerpt || '',
    source:   a.source || '',
    tags:     Array.isArray(a.tags) ? a.tags : [],
  }));
}

function normaliseIntels(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.intelProfiles || raw?.intel_profiles || raw?.data || raw?.items || []);
  return arr.map((p, i) => ({
    id:       p.id || p._id || `intel-${i}`,
    name:     p.name || p.title || p.subject || p.label || `IntelProfile ${i + 1}`,
    category: p.category || p.type || p.kind || '',
    summary:  p.summary || p.description || p.notes || p.content || '',
    tags:     Array.isArray(p.tags) ? p.tags : [],
  }));
}

function normaliseOps(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.events || raw?.ops || raw?.data || raw?.items || []);
  return arr.map((e, i) => ({
    id:       e.id || e._id || `ops-${i}`,
    name:     e.name || e.title || e.label || e.event_type || `OpsEvent ${i + 1}`,
    severity: e.severity || e.priority || e.level || '',
    type:     e.type || e.event_type || e.kind || '',
    summary:  e.summary || e.description || e.notes || '',
    tags:     Array.isArray(e.tags) ? e.tags : [],
  }));
}

function articleTokens(a) {
  return tok([a.title, a.category, a.summary, a.source, ...a.tags].join(' '));
}

function classifyArticle(article, intels, ops) {
  const atoks = articleTokens(article);

  const matchedIntels = intels
    .map(p => ({
      ...p,
      score: Math.max(
        matchScore(atoks, [p.name, p.category, p.summary, ...p.tags].join(' ')),
        matchScore(tok(p.name), article.title),
      ),
    }))
    .filter(p => p.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const matchedOps = ops
    .map(e => ({
      ...e,
      score: Math.max(
        matchScore(atoks, [e.name, e.type, e.summary, ...e.tags].join(' ')),
        matchScore(tok(e.name), article.title),
      ),
    }))
    .filter(e => e.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const hasIntel = matchedIntels.length > 0;
  const hasOps   = matchedOps.length > 0;
  const state =
    hasIntel && hasOps ? 'FULLY_ACTIVATED' :
    hasIntel            ? 'INTEL_PRIMED' :
    hasOps              ? 'OPS_TRIGGERED' :
                          'DORMANT';

  return { ...article, state, matchedIntels, matchedOps };
}

const STATE_COLOR = {
  FULLY_ACTIVATED: '#ffb300',
  INTEL_PRIMED:    '#00e5ff',
  OPS_TRIGGERED:   '#ff6d00',
  DORMANT:         '#546e7a',
};
const STATE_LABEL = {
  FULLY_ACTIVATED: 'FULLY ACTIVATED',
  INTEL_PRIMED:    'INTEL PRIMED',
  OPS_TRIGGERED:   'OPS TRIGGERED',
  DORMANT:         'DORMANT',
};

export default function KnowledgeIntelProfileOpsTriple() {
  const [open, setOpen]         = useState(false);
  const [articles, setArticles] = useState([]);
  const [filter, setFilter]     = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(null);
  const [brief, setBrief]       = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kbRes, intelRes, opsRes] = await Promise.all([
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
      ]);
      const ks = normaliseKb(kbRes);
      const is = normaliseIntels(intelRes);
      const os = normaliseOps(opsRes);
      setArticles(ks.map(a => classifyArticle(a, is, os)));
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:kipoe-toggle', toggle);
    return () => window.removeEventListener('jarvis:kipoe-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(load, 90_000);
    return () => clearInterval(t);
  }, [open, load]);

  const assess = useCallback(async (article) => {
    if (assessing === article.id) return;
    setAssessing(article.id);
    try {
      const prompt =
        `Knowledge article "${article.title}" (category: ${article.category || 'unclassified'}) ` +
        `has coverage state ${article.state} — ` +
        `matched intel profiles: ${article.matchedIntels.map(p => p.name).join(', ') || 'none'}; ` +
        `matched ops events: ${article.matchedOps.map(e => e.name).join(', ') || 'none'}. ` +
        `In 2 sentences, assess this knowledge article's operational intelligence activation posture and recommend next action.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.response || data.reply || data.message || data.content || '';
        setBrief(b => ({ ...b, [article.id]: text }));
        if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      }
    } catch { /* silent */ }
    finally { setAssessing(null); }
  }, [assessing]);

  if (!open) return null;

  const activated   = articles.filter(a => a.state === 'FULLY_ACTIVATED').length;
  const intelPrimed = articles.filter(a => a.state === 'INTEL_PRIMED').length;
  const opsTrigged  = articles.filter(a => a.state === 'OPS_TRIGGERED').length;
  const dormant     = articles.filter(a => a.state === 'DORMANT').length;
  const total       = articles.length;
  const activePct   = total ? Math.round((activated / total) * 100) : 0;

  const filtered = articles.filter(a => {
    if (filter !== 'ALL' && a.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.title.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div style={{
      position: 'fixed', left: 869440, bottom: 8, zIndex: 561,
      background: 'rgba(0,10,20,0.97)', border: '1px solid rgba(255,179,0,0.25)',
      borderRadius: 10, width: 620, maxHeight: '88vh',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: 'monospace', color: '#cdd9e5', fontSize: 12,
      boxShadow: '0 0 32px rgba(255,179,0,0.12)',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid rgba(255,179,0,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255,179,0,0.05)',
      }}>
        <span style={{ color: '#ffb300', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
          ◈ KIPOE — KNOWLEDGE × INTEL × OPS EVENT
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            background: 'rgba(255,179,0,0.15)', color: '#ffb300',
            borderRadius: 4, padding: '1px 6px', fontSize: 11,
          }}>
            ACTIVATED: {activated}
          </span>
          <span style={{
            background: 'rgba(84,110,122,0.2)', color: '#90a4ae',
            borderRadius: 4, padding: '1px 6px', fontSize: 11,
          }}>
            DORMANT: {dormant}
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#546e7a',
            cursor: 'pointer', fontSize: 16, lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid rgba(255,179,0,0.1)' }}>
        {[
          { label: 'kb articles',    val: total,        color: '#cdd9e5' },
          { label: 'activated',      val: activated,    color: '#ffb300' },
          { label: 'intel primed',   val: intelPrimed,  color: '#00e5ff' },
          { label: 'ops triggered',  val: opsTrigged,   color: '#ff6d00' },
          { label: 'dormant',        val: dormant,      color: '#546e7a' },
          { label: 'active %',       val: `${activePct}%`, color: activePct >= 50 ? '#69f0ae' : activePct >= 25 ? '#ffb300' : '#ef5350' },
        ].map(t => (
          <div key={t.label} style={{
            flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 5,
            padding: '5px 4px', textAlign: 'center',
          }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#546e7a', fontSize: 9, marginTop: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,179,0,0.08)' }}>
        <div style={{ height: 6, borderRadius: 3, background: '#1a2a35', overflow: 'hidden', display: 'flex' }}>
          {[
            { pct: total ? (activated   / total) * 100 : 0, color: '#ffb300' },
            { pct: total ? (intelPrimed / total) * 100 : 0, color: '#00e5ff' },
            { pct: total ? (opsTrigged  / total) * 100 : 0, color: '#ff6d00' },
            { pct: total ? (dormant     / total) * 100 : 0, color: '#37474f' },
          ].map((seg, i) => (
            <div key={i} style={{ width: `${seg.pct}%`, background: seg.color, transition: 'width 0.5s' }} />
          ))}
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 12px', alignItems: 'center', borderBottom: '1px solid rgba(255,179,0,0.08)' }}>
        {['ALL', 'FULLY_ACTIVATED', 'INTEL_PRIMED', 'OPS_TRIGGERED', 'DORMANT'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(255,179,0,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${filter === f ? 'rgba(255,179,0,0.5)' : 'rgba(255,255,255,0.08)'}`,
            color: filter === f ? '#ffb300' : '#78909c',
            borderRadius: 4, padding: '2px 7px', fontSize: 10, cursor: 'pointer',
          }}>
            {f === 'ALL' ? 'ALL' : STATE_LABEL[f]}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search articles…"
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,179,0,0.15)',
            borderRadius: 4, color: '#cdd9e5', padding: '3px 8px', fontSize: 11, outline: 'none',
          }}
        />
        <button onClick={load} disabled={loading} style={{
          background: 'rgba(255,179,0,0.1)', border: '1px solid rgba(255,179,0,0.3)',
          color: '#ffb300', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
        }}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Article list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading && !articles.length ? (
          <div style={{ color: '#546e7a', textAlign: 'center', padding: 24 }}>loading KB articles…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: '#546e7a', textAlign: 'center', padding: 24 }}>no articles match</div>
        ) : filtered.map(a => {
          const isExp = expanded === a.id;
          const stateColor = STATE_COLOR[a.state];
          return (
            <div key={a.id} style={{
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              background: isExp ? 'rgba(255,179,0,0.04)' : 'transparent',
            }}>
              {/* Row */}
              <div
                onClick={() => setExpanded(isExp ? null : a.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px', cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: stateColor, flexShrink: 0,
                  boxShadow: a.state === 'FULLY_ACTIVATED' ? `0 0 6px ${stateColor}` : 'none',
                }} />
                <span style={{ flex: 1, color: '#cdd9e5', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.title}
                </span>
                {a.category && (
                  <span style={{ color: '#78909c', fontSize: 10, whiteSpace: 'nowrap', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.category}
                  </span>
                )}
                <span style={{
                  background: `${stateColor}22`, color: stateColor,
                  borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}>
                  {STATE_LABEL[a.state]}
                </span>
                <span style={{ color: '#546e7a', fontSize: 14 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded detail */}
              {isExp && (
                <div style={{ padding: '0 12px 12px', display: 'flex', gap: 12 }}>
                  {/* Intel profiles */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#00e5ff', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      INTEL PROFILES ({a.matchedIntels.length})
                    </div>
                    {a.matchedIntels.length === 0 ? (
                      <div style={{ color: '#37474f', fontSize: 10 }}>no intel matches</div>
                    ) : a.matchedIntels.slice(0, 4).map(p => (
                      <div key={p.id} style={{ marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ color: '#00e5ff', fontSize: 9, background: 'rgba(0,229,255,0.12)', borderRadius: 2, padding: '0 3px' }}>
                            {p.category || 'profile'}
                          </span>
                          <span style={{ color: '#b0bec5', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: '#1a2a35', marginTop: 2 }}>
                          <div style={{ height: '100%', width: `${Math.round(p.score * 100)}%`, background: '#00e5ff', borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Ops events */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#ff6d00', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      OPS EVENTS ({a.matchedOps.length})
                    </div>
                    {a.matchedOps.length === 0 ? (
                      <div style={{ color: '#37474f', fontSize: 10 }}>no ops event matches</div>
                    ) : a.matchedOps.slice(0, 4).map(e => (
                      <div key={e.id} style={{ marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ color: '#ff6d00', fontSize: 9, background: 'rgba(255,109,0,0.12)', borderRadius: 2, padding: '0 3px' }}>
                            {e.severity || e.type || 'event'}
                          </span>
                          <span style={{ color: '#b0bec5', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.name}
                          </span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: '#1a2a35', marginTop: 2 }}>
                          <div style={{ height: '100%', width: `${Math.round(e.score * 100)}%`, background: '#ff6d00', borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ASSESS button */}
              {isExp && (
                <div style={{ padding: '0 12px 10px' }}>
                  <button
                    onClick={() => assess(a)}
                    disabled={assessing === a.id}
                    style={{
                      background: 'rgba(255,179,0,0.1)', border: '1px solid rgba(255,179,0,0.3)',
                      color: '#ffb300', borderRadius: 4, padding: '3px 10px', fontSize: 10,
                      cursor: assessing === a.id ? 'wait' : 'pointer',
                    }}
                  >
                    {assessing === a.id ? 'ASSESSING…' : 'ASSESS'}
                  </button>
                  {brief[a.id] && (
                    <div style={{
                      marginTop: 6, color: '#90a4ae', fontSize: 10, lineHeight: 1.5,
                      background: 'rgba(255,179,0,0.04)', borderRadius: 4, padding: '5px 8px',
                      borderLeft: '2px solid rgba(255,179,0,0.3)',
                    }}>
                      {brief[a.id]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '5px 12px', borderTop: '1px solid rgba(255,179,0,0.1)',
        color: '#37474f', fontSize: 9, textAlign: 'right',
      }}>
        /knowledge/ × /entities/IntelProfile × /v1/ops/events · 90s refresh · {filtered.length}/{total} shown
      </div>
    </div>
  );
}
