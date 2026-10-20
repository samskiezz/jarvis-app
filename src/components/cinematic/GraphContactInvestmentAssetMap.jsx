/**
 * GraphContactInvestmentAssetMap — F64
 *
 * Fetches /v1/graph/centrality + /entities/Contact + /entities/Investment
 * Keyword-matches each graph node against contacts AND investments to classify:
 *   STRATEGIC — node matched both a contact AND an investment (fully mapped)
 *   CONNECTED  — node matched a contact only (people-linked, no investment trail)
 *   FUNDED     — node matched an investment only (asset-linked, no contact)
 *   SHADOW     — no contact or investment match (blind-spot node)
 *
 * Toggle: ◈ GCISAM button (fixed, bottom strip) left:84200, zIndex:161
 * Stat tiles: nodes / contacts / investments / strategic / connected / funded / shadow
 * Red pulse on SHADOW count.
 * Expandable rows: matched contacts with role/org + matched investments with type/value.
 * Filter tabs: ALL / STRATEGIC / CONNECTED / FUNDED / SHADOW + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "gcisam"/"graph contact investment"/"strategic asset map"/"strategic assets"/
 *        "asset map"/"connected assets"/"shadow nodes"/"graph investment"/
 *        "graph contact"/"asset coverage"
 * Event: jarvis:gcisam-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'STRATEGIC', 'CONNECTED', 'FUNDED', 'SHADOW'];

const CLS_COLOR = {
  STRATEGIC: '#00FF88',
  CONNECTED: '#38BDF8',
  FUNDED:    '#A78BFA',
  SHADOW:    '#FF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

function classify(nodeToks, contacts, investments) {
  const matchedContacts = contacts.filter(c =>
    overlaps(nodeToks, [
      c.id, c.name, c.title, c.role, c.org, c.organisation,
      c.organization, c.department, c.tags, c.domain, c.type,
    ].join(' '))
  );
  const matchedInvestments = investments.filter(inv =>
    overlaps(nodeToks, [
      inv.id, inv.name, inv.title, inv.type, inv.category,
      inv.asset, inv.ticker, inv.description, inv.tags, inv.sector,
    ].join(' '))
  );
  const hasContact    = matchedContacts.length > 0;
  const hasInvestment = matchedInvestments.length > 0;
  const cls = hasContact && hasInvestment ? 'STRATEGIC'
            : hasContact                  ? 'CONNECTED'
            : hasInvestment               ? 'FUNDED'
            : 'SHADOW';
  return {
    cls,
    matchedContacts:    matchedContacts.slice(0, 4),
    matchedInvestments: matchedInvestments.slice(0, 4),
  };
}

export function isGcisamQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('gcisam') ||
    s.includes('graph contact investment') ||
    s.includes('strategic asset map') ||
    s.includes('strategic assets') ||
    s.includes('asset map') ||
    s.includes('connected assets') ||
    s.includes('shadow nodes') ||
    s.includes('graph investment') ||
    s.includes('graph contact') ||
    s.includes('asset coverage')
  );
}

export default function GraphContactInvestmentAssetMap() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [rows, setRows]             = useState([]);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gphRes, cntRes, invRes] = await Promise.all([
        fetch(`${API}/v1/graph/centrality`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/entities/Contact`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [gphRaw, cntRaw, invRaw] = await Promise.all([
        gphRes.ok ? gphRes.json() : {},
        cntRes.ok ? cntRes.json() : {},
        invRes.ok ? invRes.json() : {},
      ]);

      const nodes       = normalizeArray(gphRaw, ['nodes', 'entities', 'items', 'data', 'results', 'centrality']);
      const contacts    = normalizeArray(cntRaw, ['contacts', 'items', 'data', 'results', 'entities']);
      const investments = normalizeArray(invRaw, ['investments', 'items', 'data', 'results', 'entities']);

      const classified = nodes.map(node => {
        const label = [
          node.id, node.name, node.label, node.type, node.category,
          node.description, node.tags, node.domain, node.entity,
        ].join(' ');
        const toks = tokens(label);
        const { cls, matchedContacts, matchedInvestments } = classify(toks, contacts, investments);
        return { ...node, cls, matchedContacts, matchedInvestments, _label: label };
      });

      setRows(classified);
    } catch (_) {
      /* network error — leave existing rows */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:gcisam-toggle', handler);
    return () => window.removeEventListener('jarvis:gcisam-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setAssessment('');
    const shadowCount    = rows.filter(r => r.cls === 'SHADOW').length;
    const strategicCount = rows.filter(r => r.cls === 'STRATEGIC').length;
    const prompt = `Jarvis, I have ${rows.length} graph nodes. ${shadowCount} are SHADOW (no contact or investment link — blind spots). ${strategicCount} are STRATEGIC (both contact and investment mapped). Provide a 2-sentence operational advisory on improving strategic asset coverage and reducing shadow blind spots in the graph.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = r.ok ? await r.json() : {};
      const text = data.response || data.message || data.answer || data.content || '';
      setAssessment(text);
      if (text) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({ text, voice: 'ash' }),
          });
        } catch (_) { /* TTS is best-effort */ }
      }
    } catch (_) { /* assessment failed */ } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const counts = {
    total:      rows.length,
    strategic:  rows.filter(r => r.cls === 'STRATEGIC').length,
    connected:  rows.filter(r => r.cls === 'CONNECTED').length,
    funded:     rows.filter(r => r.cls === 'FUNDED').length,
    shadow:     rows.filter(r => r.cls === 'SHADOW').length,
  };

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || (r._label || '').toLowerCase().includes(search.toLowerCase()))
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 84200, zIndex: 161,
          background: 'rgba(255,68,68,0.08)', border: '1px solid #FF444444',
          color: '#FF4444', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
        title="Graph × Contact × Investment Strategic Asset Map"
      >◈ GCISAM</button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 52, right: 14, zIndex: 161,
        width: 560, maxHeight: '78vh',
        background: 'rgba(8,10,18,0.97)', border: '1px solid #FF444433',
        borderRadius: 6, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', fontSize: 11, color: '#ccc',
        boxShadow: '0 0 32px rgba(255,68,68,0.08)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 12px', borderBottom: '1px solid #FF444422',
          background: 'rgba(255,68,68,0.04)',
        }}>
          <span style={{ color: '#FF4444', fontWeight: 700, letterSpacing: 1, fontSize: 10 }}>
            ◈ GCISAM — GRAPH STRATEGIC ASSET MAP
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {loading && <span style={{ color: '#FF444477', fontSize: 9 }}>LOADING…</span>}
            <button onClick={load} title="Refresh"
              style={{ background: 'none', border: 'none', color: '#FF444466', cursor: 'pointer', fontSize: 12, padding: 0 }}>↻</button>
            <button onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap' }}>
          {[
            ['TOTAL',     counts.total,     '#888'],
            ['STRATEGIC', counts.strategic, '#00FF88'],
            ['CONNECTED', counts.connected, '#38BDF8'],
            ['FUNDED',    counts.funded,    '#A78BFA'],
            ['SHADOW',    counts.shadow,    '#FF4444', true],
          ].map(([label, val, color, pulse]) => (
            <div key={label} style={{
              background: `rgba(${
                color === '#00FF88' ? '0,255,136'
                : color === '#38BDF8' ? '56,189,248'
                : color === '#A78BFA' ? '167,139,250'
                : color === '#FF4444' ? '255,68,68'
                : '136,136,136'
              },0.07)`,
              border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 72,
            }}>
              <span style={{
                fontSize: 16, fontWeight: 700, color,
                animation: pulse && val > 0 ? 'gcisam-pulse 1.8s ease-in-out infinite' : 'none',
              }}>{val}</span>
              <span style={{ fontSize: 8, color: `${color}99`, letterSpacing: 1 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? 'rgba(255,68,68,0.15)' : 'none',
                border: `1px solid ${tab === t ? '#FF4444' : '#FF444433'}`,
                color: tab === t ? '#FF4444' : '#888',
                fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                fontFamily: 'monospace', letterSpacing: 1,
              }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,68,68,0.04)',
              border: '1px solid #FF444433', borderRadius: 3, color: '#ccc',
              fontSize: 9, padding: '2px 8px', fontFamily: 'monospace', outline: 'none', width: 110,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#555', textAlign: 'center', padding: 20, fontSize: 10 }}>
              {rows.length === 0 ? 'No graph nodes loaded.' : 'No matches.'}
            </div>
          )}
          {visible.map((node, idx) => {
            const id = node.id || node.name || node.label || String(idx);
            const isExp = !!expanded[id];
            const color = CLS_COLOR[node.cls] || '#888';
            return (
              <div key={id} style={{
                marginBottom: 4,
                background: `rgba(${
                  color === '#00FF88' ? '0,255,136'
                  : color === '#38BDF8' ? '56,189,248'
                  : color === '#A78BFA' ? '167,139,250'
                  : '255,68,68'
                },0.03)`,
                border: `1px solid ${color}22`, borderRadius: 4,
              }}>
                <div
                  onClick={() => setExpanded(e => ({ ...e, [id]: !e[id] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer' }}
                >
                  <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1, minWidth: 80 }}>{node.cls}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ccc' }}>
                    {node.name || node.label || node.entity || id}
                  </span>
                  {node.score !== undefined && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 2,
                      background: 'rgba(255,255,255,0.06)', color: '#aaa', letterSpacing: 1,
                    }}>{Number(node.score).toFixed(3)}</span>
                  )}
                  <span style={{ color: '#555', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 8px 8px', borderTop: `1px solid ${color}11` }}>
                    {node.type && (
                      <div style={{ fontSize: 9, color: '#888', marginBottom: 6 }}>
                        type: <span style={{ color: '#aaa' }}>{node.type}</span>
                      </div>
                    )}
                    {/* Matched Contacts */}
                    {node.matchedContacts.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 8, color: '#38BDF899', marginBottom: 3, letterSpacing: 1 }}>MATCHED CONTACTS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {node.matchedContacts.map((c, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(56,189,248,0.10)', border: '1px solid #38BDF833', color: '#38BDF8',
                            }}>
                              {c.name || c.title || c.id}
                              {(c.role || c.org || c.organisation) && (
                                <span style={{ color: '#38BDF877', marginLeft: 4 }}>
                                  {[c.role, c.org || c.organisation].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Matched Investments */}
                    {node.matchedInvestments.length > 0 && (
                      <div>
                        <div style={{ fontSize: 8, color: '#A78BFA99', marginBottom: 3, letterSpacing: 1 }}>MATCHED INVESTMENTS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {node.matchedInvestments.map((inv, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(167,139,250,0.10)', border: '1px solid #A78BFA33', color: '#A78BFA',
                            }}>
                              {inv.name || inv.title || inv.asset || inv.id}
                              {(inv.type || inv.value) && (
                                <span style={{ color: '#A78BFA77', marginLeft: 4 }}>
                                  {[inv.type, inv.value !== undefined ? `${inv.value}` : null].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {node.matchedContacts.length === 0 && node.matchedInvestments.length === 0 && (
                      <div style={{ fontSize: 9, color: '#FF444466' }}>No matching contacts or investments found.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Assess */}
        <div style={{ padding: '6px 12px 10px', borderTop: '1px solid #FF444411' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,68,68,0.05)' : 'rgba(255,68,68,0.10)',
              border: '1px solid #FF444455', color: '#FF4444',
              fontSize: 10, padding: '4px 14px', borderRadius: 3,
              cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS STRATEGIC ASSET COVERAGE'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(255,68,68,0.03)',
              border: '1px solid #FF444422', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>

      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 84200, zIndex: 161,
          background: 'rgba(255,68,68,0.15)', border: '1px solid #FF4444',
          color: '#FF4444', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >◈ GCISAM ✕</button>

      <style>{`
        @keyframes gcisam-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </>
  );
}
