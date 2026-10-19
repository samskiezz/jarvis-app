/**
 * InvestmentContactKnowledgeMatrix — F41
 *
 * Fetches /entities/Investment + /entities/Contact + /knowledge/
 * Keyword-matches each investment against contacts AND knowledge items to classify:
 *   TRACKED    — matched both a contact AND a knowledge item (fully intelligence-backed)
 *   LINKED     — matched a contact only (people-tracked, no knowledge anchor)
 *   DOCUMENTED — matched a knowledge item only (documented, no contact link)
 *   ORPHAN     — no match in either (unlinked investment, intelligence blind spot)
 *
 * Toggle: ◈ ICINTEL button (fixed, bottom strip) left:71880, zIndex:139
 * Stat tiles: investments / contacts / knowledge items / tracked / linked / documented / orphan
 * Amber pulse on ORPHAN count.
 * Expandable rows: matched contacts + matched knowledge items.
 * Filter tabs: ALL / TRACKED / LINKED / DOCUMENTED / ORPHAN + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "investment knowledge"/"wealth intel"/"icintel"/"invest contact"/"wealth knowledge"/"wealth matrix"
 * Event: jarvis:icintel-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'TRACKED', 'LINKED', 'DOCUMENTED', 'ORPHAN'];

const CLS_COLOR = {
  TRACKED:    '#22c55e',
  LINKED:     '#29E7FF',
  DOCUMENTED: '#A78BFA',
  ORPHAN:     '#F59E0B',
};

const PULSE_CSS = `@keyframes icintel-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classify(invToks, contacts, knowledge) {
  const matchedContacts = contacts.filter(c =>
    overlaps(invToks, [c.name, c.description, c.organisation, c.role, c.tags, c.type, c.notes].join(' '))
  );
  const matchedKnowledge = knowledge.filter(k =>
    overlaps(invToks, [k.title, k.name, k.description, k.tags, k.category, k.summary, k.content].join(' '))
  );
  if (matchedContacts.length > 0 && matchedKnowledge.length > 0)
    return { cls: 'TRACKED', matchedContacts, matchedKnowledge };
  if (matchedContacts.length > 0)
    return { cls: 'LINKED', matchedContacts, matchedKnowledge: [] };
  if (matchedKnowledge.length > 0)
    return { cls: 'DOCUMENTED', matchedContacts: [], matchedKnowledge };
  return { cls: 'ORPHAN', matchedContacts: [], matchedKnowledge: [] };
}

export function isIcintelQuery(q) {
  return /\b(investment.know|wealth.intel|icintel|invest.contact|wealth.know|wealth.matrix|invest.matrix|contact.invest)\b/i.test(q);
}
export function buildIcintelScript() {
  return 'Opening Investment × Contact × Knowledge Wealth Intelligence Matrix. Cross-referencing all investments against contacts and knowledge items to identify orphan investments and intelligence coverage gaps.';
}

export default function InvestmentContactKnowledgeMatrix() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [contactCount, setContactCount]     = useState(0);
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const [tab, setTab]                 = useState('ALL');
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(false);
  const [assessment, setAssessment]   = useState('');
  const intervalRef                   = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [invRes, ctRes, knRes] = await Promise.all([
        fetch(`${API}/entities/Investment`, { headers: h }),
        fetch(`${API}/entities/Contact`,    { headers: h }),
        fetch(`${API}/knowledge/`,          { headers: h }),
      ]);
      const [invData, ctData, knData] = await Promise.all([
        invRes.ok ? invRes.json() : [],
        ctRes.ok  ? ctRes.json()  : [],
        knRes.ok  ? knRes.json()  : [],
      ]);
      const investments = Array.isArray(invData) ? invData : (invData?.items || invData?.data || invData?.results || []);
      const contacts    = Array.isArray(ctData)  ? ctData  : (ctData?.items  || ctData?.data  || ctData?.results  || []);
      const knowledge   = Array.isArray(knData)  ? knData  : (knData?.items  || knData?.data  || knData?.results  || []);

      setContactCount(contacts.length);
      setKnowledgeCount(knowledge.length);

      const built = investments.map(inv => {
        const toks = tokens([inv.name, inv.title, inv.description, inv.tags, inv.type, inv.sector, inv.ticker, inv.notes, inv.asset_class].join(' '));
        const { cls, matchedContacts, matchedKnowledge } = classify(toks, contacts, knowledge);
        return { ...inv, _cls: cls, _contacts: matchedContacts, _knowledge: matchedKnowledge };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:icintel-toggle', handler);
    return () => window.removeEventListener('jarvis:icintel-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true); setAssessment('');
    const counts = { TRACKED: 0, LINKED: 0, DOCUMENTED: 0, ORPHAN: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const prompt = `Investment intelligence coverage: ${rows.length} investments total — ${counts.TRACKED} fully tracked (contact+knowledge), ${counts.LINKED} contact-linked only, ${counts.DOCUMENTED} knowledge-documented only, ${counts.ORPHAN} orphan (no intelligence links). Assess coverage quality and identify the most critical orphan investments to address.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: text.slice(0, 400) } }));
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    }
    setAssessing(false);
  }, [rows, assessing]);

  const counts = { TRACKED: 0, LINKED: 0, DOCUMENTED: 0, ORPHAN: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.title, r.ticker, r.sector, r.type].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 71880, zIndex: 139,
          background: 'rgba(245,158,11,0.12)', border: '1px solid #F59E0B',
          color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ ICINTEL
      </button>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 560, maxHeight: '82vh',
        background: 'rgba(5,15,25,0.97)', border: '1px solid #1e3a4a',
        borderRadius: 6, zIndex: 9140, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', color: '#e2eaf0', overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid #1e3a4a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(245,158,11,0.06)',
        }}>
          <span style={{ fontSize: 11, color: '#F59E0B', letterSpacing: 2 }}>
            ◈ INVESTMENT × CONTACT × KNOWLEDGE — ICINTEL
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#6A8BA0', cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'INVESTMENTS', val: rows.length, color: '#29E7FF' },
            { label: 'CONTACTS',    val: contactCount,   color: '#29E7FF' },
            { label: 'KNOWLEDGE',   val: knowledgeCount,  color: '#29E7FF' },
            { label: 'TRACKED',     val: counts.TRACKED,    color: CLS_COLOR.TRACKED },
            { label: 'LINKED',      val: counts.LINKED,     color: CLS_COLOR.LINKED },
            { label: 'DOCUMENTED',  val: counts.DOCUMENTED, color: CLS_COLOR.DOCUMENTED },
            {
              label: 'ORPHAN', val: counts.ORPHAN, color: CLS_COLOR.ORPHAN,
              pulse: counts.ORPHAN > 0,
            },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}33`,
              borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center',
              animation: t.pulse ? 'icintel-pulse 2s ease-in-out infinite' : 'none',
            }}>
              <div style={{ fontSize: 15, color: t.color, fontWeight: 700 }}>{t.val}</div>
              <div style={{ fontSize: 8, color: '#6A8BA0', letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ padding: '4px 14px', borderBottom: '1px solid #1e3a4a', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLS_COLOR[t] || '#29E7FF'}22` : 'transparent',
              border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#2a4a5a'}`,
              color: tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#6A8BA0',
              padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 9, letterSpacing: 1,
            }}>{t}{t !== 'ALL' ? ` (${counts[t] ?? 0})` : ''}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search investments…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #2a4a5a',
              color: '#e2eaf0', padding: '2px 8px', borderRadius: 3, fontSize: 9, width: 140,
            }}
          />
        </div>

        {/* Status */}
        {loading && <div style={{ padding: '4px 14px', fontSize: 9, color: '#6A8BA0' }}>⟳ loading…</div>}
        {error   && <div style={{ padding: '4px 14px', fontSize: 9, color: '#ef4444' }}>⚠ {error}</div>}

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {visible.map((inv, i) => {
            const isExp = expanded === (inv.id || i);
            return (
              <div key={inv.id || i} style={{
                borderBottom: '1px solid #0e2233',
                background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent',
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (inv.id || i))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{
                    fontSize: 8, padding: '1px 6px', borderRadius: 10,
                    background: `${CLS_COLOR[inv._cls]}22`, color: CLS_COLOR[inv._cls],
                    border: `1px solid ${CLS_COLOR[inv._cls]}55`, letterSpacing: 1, minWidth: 78, textAlign: 'center',
                  }}>{inv._cls}</span>
                  <span style={{ fontSize: 10, flex: 1, color: '#c8d8e8' }}>
                    {inv.name || inv.title || inv.ticker || `Investment ${i + 1}`}
                  </span>
                  {inv.sector && <span style={{ fontSize: 8, color: '#4a7a9a' }}>{inv.sector}</span>}
                  {inv.ticker && <span style={{ fontSize: 8, color: '#6A8BA0' }}>{inv.ticker}</span>}
                  <span style={{ fontSize: 8, color: '#2a5a7a' }}>
                    {inv._contacts.length}C {inv._knowledge.length}K
                  </span>
                  <span style={{ fontSize: 9, color: '#2a5a7a' }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 8px 28px' }}>
                    {inv._contacts.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#29E7FF', letterSpacing: 1, marginBottom: 2 }}>LINKED CONTACTS</div>
                        {inv._contacts.slice(0, 5).map((c, ci) => (
                          <div key={ci} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {c.name || c.title || `Contact ${ci + 1}`}
                            {c.role && <span style={{ color: '#4a7a9a', marginLeft: 4 }}>{c.role}</span>}
                            {c.organisation && <span style={{ color: '#3a6a8a', marginLeft: 4 }}>{c.organisation}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {inv._knowledge.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#A78BFA', letterSpacing: 1, marginBottom: 2 }}>KNOWLEDGE ITEMS</div>
                        {inv._knowledge.slice(0, 5).map((k, ki) => (
                          <div key={ki} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {k.title || k.name || `Knowledge ${ki + 1}`}
                            {k.category && <span style={{ color: '#5a5a9a', marginLeft: 4 }}>{k.category}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {inv._contacts.length === 0 && inv._knowledge.length === 0 && (
                      <div style={{ color: '#6A8BA0', fontSize: 9 }}>⬡ No contact or knowledge link — orphan investment, intelligence blind spot.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid #1e3a4a' }}>
          <button
            onClick={assess} disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.15)',
              border: '1px solid #F59E0B', color: '#F59E0B',
              padding: '4px 14px', cursor: assessing ? 'default' : 'pointer',
              borderRadius: 3, fontSize: 10, letterSpacing: 1,
            }}
          >
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS WEALTH INTELLIGENCE GAPS'}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(245,158,11,0.07)', borderLeft: '2px solid #F59E0B', color: '#e2eaf0', fontSize: 10, lineHeight: 1.6 }}>
              {assessment}
            </div>
          )}
        </div>
      </div>

      {/* Collapsed toggle */}
      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 71880, zIndex: 9140,
          background: 'rgba(245,158,11,0.15)', border: '1px solid #F59E0B',
          color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ ICINTEL ✕
      </button>
    </>
  );
}
