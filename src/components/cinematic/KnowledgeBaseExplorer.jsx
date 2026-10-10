/**
 * F41 Knowledge Base Explorer
 * Endpoint: /knowledge/ → paginated article browser with search/filter/expand/summarise.
 * Toggle:   ⬡ KBE button (BTN_LEFT = 992860, bottom 8, zIndex 115)
 *           + jarvis:kbe-toggle event (voice dispatch from JarvisBrain)
 * Voice:    "knowledge base" / "knowledge" / "search knowledge" / "kbe" / "show knowledge"
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const CY = '#29E7FF';
const BTN_LEFT = 992860;
const POLL_MS = 90000;

const KBE_RE = /\b(kbe|knowledge[\s_-]*base[\s_-]*explorer?|knowledge[\s_-]*base|show[\s_-]*knowledge|search[\s_-]*knowledge|open[\s_-]*knowledge|knowledge[\s_-]*articles?|knowledge[\s_-]*browser|knowledge[\s_-]*catalog|kb[\s_-]*explorer?|jarvis[\s_-]*knowledge|knowledge[\s_-]*search|browse[\s_-]*knowledge|knowledge[\s_-]*docs?|knowledge[\s_-]*library|knowledge[\s_-]*hub)\b/i;

export function isKbeQuery(t) { return KBE_RE.test(t || ''); }

export async function buildKbeScript() {
  try {
    const raw = await fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []);
    const articles = normaliseArticles(raw);
    if (!articles.length) return 'Knowledge base is empty or unreachable — no articles found at /knowledge/ endpoint.';
    const cats = [...new Set(articles.map(a => a.category).filter(Boolean))];
    return `JARVIS Knowledge Base: ${articles.length} article${articles.length === 1 ? '' : 's'} available across ${cats.length || 'multiple'} categor${cats.length === 1 ? 'y' : 'ies'}${cats.length ? ` — ${cats.slice(0, 3).join(', ')}${cats.length > 3 ? ' and more' : ''}` : ''}. Panel open for search and review, sir.`;
  } catch {
    return 'Knowledge base explorer is standing by, sir — unable to reach /knowledge/ endpoint at this moment.';
  }
}

function normaliseArticles(raw) {
  if (!raw) return [];
  const arr = ['articles', 'knowledge', 'items', 'results', 'data', 'records', 'documents'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((a, i) => ({
    id: a.id || String(i),
    title: a.title || a.name || a.subject || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    summary: String(a.summary || a.description || a.body || a.content || '').slice(0, 400),
    fullBody: String(a.content || a.body || a.summary || a.description || ''),
    tags: Array.isArray(a.tags) ? a.tags.join(', ') : (a.tags || ''),
    updated: a.updated_at || a.created_at || a.timestamp || '',
  }));
}

export default function KnowledgeBaseExplorer() {
  const [open, setOpen] = useState(false);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [expanded, setExpanded] = useState(null);
  const [summarising, setSummarising] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []);
      setArticles(normaliseArticles(raw));
    } catch { /* silently ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:kbe-toggle', handler);
    return () => window.removeEventListener('jarvis:kbe-toggle', handler);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const categories = ['ALL', ...new Set(articles.map(a => a.category).filter(Boolean))];

  const visible = articles.filter(a => {
    const matchCat = catFilter === 'ALL' || a.category === catFilter;
    const q = query.trim().toLowerCase();
    const matchQ = !q || a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q) || a.tags.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  async function summarise(article) {
    setSummarising(true);
    setSummaryText('');
    try {
      const prompt = `Summarise this knowledge base article for an operator in 3 sentences. Title: "${article.title}". Content: "${article.fullBody.slice(0, 800)}". Be direct and highlight operational relevance. British-butler tone.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (r.ok) {
        const j = await r.json();
        const txt = (j.answer || j.response || j.message || j.content || '').trim();
        setSummaryText(txt);
        window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
      }
    } catch { /* silently ignore */ }
    setSummarising(false);
  }

  return (
    <>
      {/* Bottom-bar toggle pill */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 115,
          background: open ? CY : 'rgba(0,0,0,0.55)',
          color: open ? '#000' : CY,
          border: `1px solid ${CY}`,
          borderRadius: 4,
          padding: '3px 8px',
          fontSize: 10,
          fontFamily: 'monospace',
          cursor: 'pointer',
          letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >
        ⬡ KBE
        {articles.length > 0 && (
          <span style={{ marginLeft: 4, background: CY + '33', color: CY, borderRadius: 3, padding: '0 4px', fontWeight: 700, fontSize: 9 }}>
            {articles.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed',
          right: 16,
          bottom: 40,
          width: 440,
          maxHeight: '74vh',
          background: 'rgba(0,8,20,0.97)',
          border: `1px solid ${CY}44`,
          borderRadius: 8,
          zIndex: 9100,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'monospace',
          boxShadow: `0 0 32px ${CY}14`,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px', borderBottom: `1px solid ${CY}22` }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 12 }}>⬡ KNOWLEDGE BASE — {articles.length} articles</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 15 }}>✕</button>
          </div>

          {/* Search bar */}
          <div style={{ padding: '8px 12px 4px' }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search articles…"
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${CY}33`,
                borderRadius: 4,
                color: '#e2e8f0',
                fontFamily: 'monospace',
                fontSize: 11,
                padding: '5px 8px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {/* Category filter */}
          {categories.length > 1 && (
            <div style={{ display: 'flex', gap: 4, padding: '4px 12px 6px', flexWrap: 'wrap' }}>
              {categories.slice(0, 8).map(c => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  style={{
                    background: catFilter === c ? CY : 'rgba(255,255,255,0.04)',
                    color: catFilter === c ? '#000' : CY,
                    border: `1px solid ${CY}44`,
                    borderRadius: 3,
                    padding: '2px 7px',
                    fontSize: 9,
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    letterSpacing: 0.5,
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Article list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
            {loading && !articles.length ? (
              <div style={{ color: '#475569', fontSize: 11, padding: '16px 0', textAlign: 'center' }}>Loading knowledge base…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: '#475569', fontSize: 11, padding: '16px 0', textAlign: 'center' }}>
                {articles.length === 0 ? 'No articles available — check /knowledge/ endpoint.' : 'No articles match your search.'}
              </div>
            ) : (
              visible.map(article => {
                const isExp = expanded === article.id;
                return (
                  <div
                    key={article.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      padding: '8px 0',
                    }}
                  >
                    {/* Article header row */}
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer', gap: 8 }}
                      onClick={() => { setExpanded(isExp ? null : article.id); setSummaryText(''); }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 600, lineHeight: 1.3 }}>{article.title}</div>
                        {article.category && (
                          <span style={{ fontSize: 9, color: CY, background: CY + '18', borderRadius: 3, padding: '1px 5px', marginTop: 3, display: 'inline-block' }}>
                            {article.category}
                          </span>
                        )}
                      </div>
                      <span style={{ color: '#475569', fontSize: 12, flexShrink: 0, marginTop: 1 }}>{isExp ? '▲' : '▼'}</span>
                    </div>

                    {/* Expanded detail */}
                    {isExp && (
                      <div style={{ marginTop: 8 }}>
                        {article.summary ? (
                          <div style={{ color: '#94a3b8', fontSize: 10, lineHeight: 1.5, marginBottom: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {article.summary}
                          </div>
                        ) : null}
                        {article.tags && (
                          <div style={{ color: '#475569', fontSize: 9, marginBottom: 6 }}>Tags: {article.tags}</div>
                        )}
                        {article.updated && (
                          <div style={{ color: '#334155', fontSize: 9, marginBottom: 6 }}>Updated: {article.updated}</div>
                        )}

                        {/* Summarise button */}
                        <button
                          onClick={() => summarise(article)}
                          disabled={summarising}
                          style={{
                            background: summarising ? '#1e293b' : 'rgba(41,231,255,0.12)',
                            color: summarising ? '#475569' : CY,
                            border: `1px solid ${CY}44`,
                            borderRadius: 4,
                            padding: '4px 10px',
                            fontSize: 10,
                            fontFamily: 'monospace',
                            cursor: summarising ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {summarising ? '▶ Summarising…' : '▶ SUMMARISE'}
                        </button>

                        {/* Summary output */}
                        {summaryText && expanded === article.id && (
                          <div style={{
                            marginTop: 8,
                            background: 'rgba(41,231,255,0.05)',
                            border: `1px solid ${CY}22`,
                            borderRadius: 4,
                            padding: '6px 8px',
                            color: '#cbd5e1',
                            fontSize: 10,
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                          }}>
                            {summaryText}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer: article count */}
          <div style={{ padding: '6px 12px', borderTop: `1px solid ${CY}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#475569', fontSize: 9 }}>
              {visible.length} of {articles.length} articles{catFilter !== 'ALL' ? ` · ${catFilter}` : ''}
              {query ? ` · "${query}"` : ''}
            </span>
            <button
              onClick={load}
              disabled={loading}
              style={{ background: 'none', border: `1px solid ${CY}33`, color: loading ? '#334155' : '#475569', borderRadius: 3, padding: '2px 7px', fontSize: 9, fontFamily: 'monospace', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Loading…' : '↺ Refresh'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
