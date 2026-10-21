/**
 * RiskInvestmentWealthExposure — F100
 *
 * Fetches /entities/RiskSignal + /entities/Investment + /entities/Contact + /knowledge/.
 *
 * Keyword-matches each investment (name/type/asset_class/description) against
 * risk signal names/categories, contact names/roles/orgs, and knowledge article
 * titles/categories to classify:
 *
 *   DEFENDED  — investment matches a risk signal AND a contact AND a knowledge article
 *               (fully covered: threat-aware, human-owned, and documented)
 *   MONITORED — investment matches a risk signal + at least one of contact or knowledge
 *               (partially covered)
 *   LINKED    — investment matches a contact or knowledge article but NO risk signal
 *               (owned/documented but not threat-mapped)
 *   EXPOSED   — no match to any risk signal, contact, or knowledge article
 *               (wealth blind spot — fully unmonitored)
 *
 * Toggle: ◈ RIWEX button (fixed, bottom strip) left:104360, zIndex:197
 * Stat tiles: investments / signals / contacts / articles / defended / monitored / linked / exposed
 * Red pulse on EXPOSED count (wealth blind spots).
 * Expandable rows: matched risk signals with severity badge +
 *                  matched contacts with role/org +
 *                  matched knowledge articles with category badge.
 * Filter tabs: ALL / DEFENDED / MONITORED / LINKED / EXPOSED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "riwex"/"risk investment"/"wealth exposure"/"investment threat"
 *        "exposed investments"/"wealth threat"/"threat wealth coverage"
 *        "investment risk knowledge"/"wealth contact risk"/"investment threat exposure"
 *        "wealth defense gap"/"financial threat exposure"
 * Event: jarvis:riwex-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'DEFENDED', 'MONITORED', 'LINKED', 'EXPOSED'];

const CLS_COLOR = {
  DEFENDED:  '#22C55E',
  MONITORED: '#38BDF8',
  LINKED:    '#F97316',
  EXPOSED:   '#EF4444',
};

const SEV_COLOR = {
  critical: '#EF4444', high: '#F97316', medium: '#F59E0B',
  low: '#22C55E', info: '#38BDF8',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeInvestments(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.investments)) return raw.investments;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.entities))    return raw.entities;
  return [];
}

function normalizeRiskSignals(raw) {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.items))           return raw.items;
  if (Array.isArray(raw?.risk_signals))    return raw.risk_signals;
  if (Array.isArray(raw?.riskSignals))     return raw.riskSignals;
  if (Array.isArray(raw?.results))         return raw.results;
  if (Array.isArray(raw?.data))            return raw.data;
  if (Array.isArray(raw?.entities))        return raw.entities;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.contacts))   return raw.contacts;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  if (Array.isArray(raw?.entities))   return raw.entities;
  return [];
}

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.articles))    return raw.articles;
  if (Array.isArray(raw?.knowledge))   return raw.knowledge;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

export function isRiwexQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'riwex', 'risk investment', 'wealth exposure', 'investment threat',
    'exposed investments', 'wealth threat', 'threat wealth coverage',
    'investment risk knowledge', 'wealth contact risk', 'investment threat exposure',
    'wealth defense gap', 'financial threat exposure',
  ].some(k => s.includes(k));
}

export function buildRiwexScript() {
  return (
    'Fetch /entities/RiskSignal, /entities/Investment, /entities/Contact, and /knowledge/. ' +
    'Keyword-match each investment (name/type/asset_class/description) against risk signal names/categories, ' +
    'contact names/roles/orgs, and knowledge article titles/categories. ' +
    'Classify each investment as DEFENDED (matches risk signal + contact + knowledge), ' +
    'MONITORED (matches risk signal + at least one other), ' +
    'LINKED (matches contact or knowledge but no risk signal), ' +
    'or EXPOSED (no match to any source — wealth blind spot). ' +
    'Report total EXPOSED count, identify which exposed investments carry the highest financial risk ' +
    '(by type, value, or asset class), and recommend which risk signals should be mapped, ' +
    'which contacts should be assigned ownership, and which knowledge articles should be created ' +
    'to cover the wealth blind spots.'
  );
}

export default function RiskInvestmentWealthExposure() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const [counts, setCounts]         = useState({
    investments: 0, signals: 0, contacts: 0, articles: 0,
    defended: 0, monitored: 0, linked: 0, exposed: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [investmentsRaw, signalsRaw, contactsRaw, knowledgeRaw] = await Promise.all([
        fetch(`${API}/entities/Investment`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/RiskSignal`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Contact`,    { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/knowledge/`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const investments = normalizeInvestments(investmentsRaw);
      const signals     = normalizeRiskSignals(signalsRaw);
      const contacts    = normalizeContacts(contactsRaw);
      const articles    = normalizeKnowledge(knowledgeRaw);

      const built = investments.map((inv, idx) => {
        const invText = [
          inv.name, inv.type, inv.asset_class, inv.assetClass, inv.asset_type,
          inv.description, inv.ticker, inv.symbol, inv.sector, inv.industry,
          inv.category, inv.tags?.join?.(' '),
        ].filter(Boolean).join(' ');
        const iToks = tokens(invText);

        const matchedSignals = signals.filter(sig => {
          const s = [sig.name, sig.title, sig.description, sig.category, sig.type, sig.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(iToks, s);
        });

        const matchedContacts = contacts.filter(c => {
          const s = [c.name, c.role, c.title, c.org, c.organisation, c.organization, c.description]
            .filter(Boolean).join(' ');
          return overlaps(iToks, s);
        });

        const matchedArticles = articles.filter(art => {
          const s = [art.title, art.name, art.category, art.description, art.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(iToks, s);
        });

        const hasSig      = matchedSignals.length > 0;
        const hasContact  = matchedContacts.length > 0;
        const hasArticle  = matchedArticles.length > 0;

        let cls;
        if (hasSig && (hasContact || hasArticle)) {
          if (hasContact && hasArticle) cls = 'DEFENDED';
          else cls = 'MONITORED';
        } else if (!hasSig && (hasContact || hasArticle)) {
          cls = 'LINKED';
        } else {
          cls = 'EXPOSED';
        }

        return {
          id:              `inv-${idx}`,
          label:           inv.name || inv.ticker || `Investment ${idx + 1}`,
          type:            inv.type || inv.asset_class || inv.assetClass || '',
          value:           inv.value || inv.current_value || inv.amount || '',
          cls,
          matchedSignals,
          matchedContacts,
          matchedArticles,
        };
      });

      const defended  = built.filter(r => r.cls === 'DEFENDED').length;
      const monitored = built.filter(r => r.cls === 'MONITORED').length;
      const linked    = built.filter(r => r.cls === 'LINKED').length;
      const exposed   = built.filter(r => r.cls === 'EXPOSED').length;

      setRows(built);
      setCounts({
        investments: built.length,
        signals: signals.length,
        contacts: contacts.length,
        articles: articles.length,
        defended, monitored, linked, exposed,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:riwex-toggle', handler);
    return () => window.removeEventListener('jarvis:riwex-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: buildRiwexScript() }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt.slice(0, 300) } }));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const pulse = counts.exposed > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#EF4444' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s)
        || r.type.toLowerCase().includes(s)
        || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 104360, zIndex: 197,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #EF4444',
          color: '#EF4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ RIWEX{counts.exposed > 0 ? <span style={pulse}> {counts.exposed}</span> : null}
      </button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 720, maxHeight: '80vh',
        background: 'rgba(5,10,20,0.97)', border: '1px solid #EF4444',
        borderRadius: 8, zIndex: 9500, overflowY: 'auto', fontFamily: 'monospace',
        boxShadow: '0 0 32px rgba(239,68,68,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(239,68,68,0.07)',
        }}>
          <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 13 }}>
            ◈ RIWEX — Threat Wealth Exposure Matrix
          </span>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          {[
            ['Investments', counts.investments, '#94A3B8'],
            ['Signals',     counts.signals,     '#94A3B8'],
            ['Contacts',    counts.contacts,     '#94A3B8'],
            ['Articles',    counts.articles,     '#94A3B8'],
            ['Defended',    counts.defended,     CLS_COLOR.DEFENDED],
            ['Monitored',   counts.monitored,    CLS_COLOR.MONITORED],
            ['Linked',      counts.linked,       CLS_COLOR.LINKED],
            ['Exposed',     counts.exposed,      CLS_COLOR.EXPOSED],
          ].map(([lbl, val, clr]) => (
            <div key={lbl} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${clr}44`,
              borderRadius: 6, padding: '5px 10px', minWidth: 80, textAlign: 'center',
            }}>
              <div style={{ color: clr, fontSize: 18, fontWeight: 700,
                ...(lbl === 'Exposed' && val > 0 ? pulse : {}) }}>{val}</div>
              <div style={{ color: '#64748B', fontSize: 10 }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
              background: tab === t ? CLS_COLOR[t] || '#EF4444' : 'rgba(255,255,255,0.05)',
              color: tab === t ? '#000' : '#94A3B8', border: 'none', fontFamily: 'monospace',
            }}>{t}</button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{
              marginLeft: 'auto', padding: '3px 8px', fontSize: 11, borderRadius: 4,
              background: 'rgba(255,255,255,0.05)', border: '1px solid #334155',
              color: '#E2E8F0', fontFamily: 'monospace', width: 160,
            }} />
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          <button onClick={assess} disabled={assessing} style={{
            padding: '4px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
            background: assessing ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.15)',
            border: '1px solid #EF4444', color: '#EF4444', borderRadius: 4,
            fontFamily: 'monospace',
          }}>{assessing ? '⟳ Assessing…' : '▶ ASSESS'}</button>
          {assessment && (
            <div style={{ marginTop: 8, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5,
              background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 4,
              border: '1px solid rgba(239,68,68,0.2)', whiteSpace: 'pre-wrap',
            }}>{assessment}</div>
          )}
        </div>

        {/* Error / loading */}
        {error   && <div style={{ padding: '8px 14px', color: '#EF4444', fontSize: 11 }}>Error: {error}</div>}
        {loading && <div style={{ padding: '8px 14px', color: '#64748B', fontSize: 11 }}>Loading…</div>}

        {/* Rows */}
        <div style={{ padding: '8px 14px' }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#475569', fontSize: 12, padding: '12px 0' }}>No investments match this filter.</div>
          )}
          {visible.map(row => (
            <div key={row.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => toggleExpand(row.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 5, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${CLS_COLOR[row.cls]}33`,
                }}
              >
                <span style={{
                  padding: '1px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                  background: `${CLS_COLOR[row.cls]}22`, color: CLS_COLOR[row.cls],
                  whiteSpace: 'nowrap',
                }}>{row.cls}</span>
                <span style={{ color: '#E2E8F0', fontSize: 12, flex: 1 }}>{row.label}</span>
                {row.type && <span style={{ color: '#64748B', fontSize: 10 }}>{row.type}</span>}
                {row.value !== '' && row.value !== undefined && (
                  <span style={{ color: '#94A3B8', fontSize: 10 }}>{String(row.value)}</span>
                )}
                <span style={{ color: '#475569', fontSize: 11, marginLeft: 'auto' }}>
                  {expanded[row.id] ? '▲' : '▼'}
                </span>
              </div>

              {expanded[row.id] && (
                <div style={{
                  marginTop: 2, marginLeft: 12, padding: '8px 12px',
                  background: 'rgba(0,0,0,0.3)', borderRadius: 4,
                  border: '1px solid rgba(239,68,68,0.1)',
                }}>
                  {/* Risk Signals */}
                  {row.matchedSignals.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>RISK SIGNALS</div>
                      {row.matchedSignals.map((sig, i) => {
                        const sev = (sig.severity || sig.level || sig.priority || 'medium').toLowerCase();
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                              background: `${SEV_COLOR[sev] || '#94A3B8'}22`,
                              color: SEV_COLOR[sev] || '#94A3B8',
                            }}>{sev.toUpperCase()}</span>
                            <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                              {sig.name || sig.title || sig.description || 'Signal'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>CONTACTS</div>
                      {row.matchedContacts.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: '#CBD5E1', fontSize: 11 }}>{c.name || c.email || 'Contact'}</span>
                          {(c.role || c.title) && (
                            <span style={{ color: '#64748B', fontSize: 10 }}>
                              {c.role || c.title}
                            </span>
                          )}
                          {(c.org || c.organisation || c.organization) && (
                            <span style={{ color: '#475569', fontSize: 10 }}>
                              @ {c.org || c.organisation || c.organization}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Knowledge articles */}
                  {row.matchedArticles.length > 0 && (
                    <div>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>KNOWLEDGE</div>
                      {row.matchedArticles.map((art, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {(art.category || art.type) && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                              background: 'rgba(56,189,248,0.12)', color: '#38BDF8',
                            }}>{art.category || art.type}</span>
                          )}
                          <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                            {art.title || art.name || 'Article'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {row.matchedSignals.length === 0 && row.matchedContacts.length === 0 && row.matchedArticles.length === 0 && (
                    <div style={{ color: '#475569', fontSize: 11 }}>No matching signals, contacts, or knowledge articles found.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
