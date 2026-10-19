/**
 * KnowledgeGraphContactDepthMap — F58
 *
 * Fetches /knowledge/ + /v1/graph/centrality + /entities/Contact
 * Cross-references each knowledge article against graph centrality nodes AND contacts:
 *   ANCHORED — matched both a graph node AND a contact (fully grounded knowledge)
 *   TRACED   — matched a graph node only (node-referenced but no human contact linkage)
 *   LINKED   — matched a contact only (person-referenced but no graph topology linkage)
 *   ORPHAN   — no match in either (isolated knowledge with no structural grounding)
 *
 * Toggle: ◈ KGCDEP button (fixed, bottom strip) left:80840, zIndex:155
 * Stat tiles: articles / nodes / contacts / anchored / traced / linked / orphan
 * Amber pulse on ORPHAN count (isolated articles with no structural grounding).
 * Expandable rows: matched graph nodes with centrality score badge + matched contacts with role/org.
 * Filter tabs: ALL / ANCHORED / TRACED / LINKED / ORPHAN + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "knowledge depth"/"knowledge graph contact"/"kgcdep"/"orphan knowledge"/
 *        "knowledge grounding"/"knowledge anchored"/"knowledge map"/"intel depth"/
 *        "knowledge coverage map"/"ungrounded knowledge"/"knowledge linkage"
 * Event: jarvis:kgcdep-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ANCHORED', 'TRACED', 'LINKED', 'ORPHAN'];

const CLS_COLOR = {
  ANCHORED: '#00E5A0',
  TRACED:   '#29E7FF',
  LINKED:   '#A78BFA',
  ORPHAN:   '#FFB800',
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

function classify(articleToks, nodes, contacts) {
  const matchedNodes = nodes.filter(n =>
    overlaps(articleToks, [
      n.id, n.label, n.name, n.type, n.category, n.domain,
      n.description, n.tags, n.entity,
    ].join(' '))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(articleToks, [
      c.name, c.full_name, c.display_name, c.email, c.role,
      c.org, c.organisation, c.company, c.domain, c.tags,
      c.description, c.notes,
    ].join(' '))
  );
  const hasNode    = matchedNodes.length > 0;
  const hasContact = matchedContacts.length > 0;
  const cls = hasNode && hasContact ? 'ANCHORED'
            : hasNode               ? 'TRACED'
            : hasContact            ? 'LINKED'
            : 'ORPHAN';
  return {
    cls,
    matchedNodes:    matchedNodes.slice(0, 4),
    matchedContacts: matchedContacts.slice(0, 4),
  };
}

export function isKgcdepQuery(q) {
  return /\b(kgcdep|knowledge.depth|knowledge.graph.contact|orphan.knowledge|knowledge.grounding|knowledge.anchored|knowledge.map|intel.depth|knowledge.coverage.map|ungrounded.knowledge|knowledge.linkage)\b/i.test(q);
}
export function buildKgcdepScript() {
  return 'Opening Knowledge × Graph × Contact Intelligence Depth Map. Cross-referencing knowledge articles against graph topology nodes and contacts to surface anchored vs orphan knowledge.';
}

export default function KnowledgeGraphContactDepthMap() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [nodeCount, setNodeCount]     = useState(0);
  const [contactCount, setContactCount] = useState(0);
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
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [kRes, gRes, cRes] = await Promise.all([
        fetch(`${API}/knowledge/`,              { headers: h }),
        fetch(`${API}/v1/graph/centrality`,     { headers: h }),
        fetch(`${API}/entities/Contact`,        { headers: h }),
      ]);
      const [kRaw, gRaw, cRaw] = await Promise.all([
        kRes.ok ? kRes.json() : {},
        gRes.ok ? gRes.json() : {},
        cRes.ok ? cRes.json() : {},
      ]);
      const articles = normalizeArray(kRaw, ['articles', 'items', 'data', 'results', 'knowledge']);
      const nodes    = normalizeArray(gRaw, ['nodes', 'items', 'data', 'results', 'entities']);
      const contacts = normalizeArray(cRaw, ['contacts', 'items', 'data', 'results']);
      setNodeCount(nodes.length);
      setContactCount(contacts.length);
      const built = articles.map(a => {
        const label = a.title || a.name || a.id || 'Article';
        const toks  = tokens([
          a.title, a.name, a.summary, a.description, a.content,
          a.tags, a.category, a.domain, a.topic, a.subject,
        ].join(' '));
        const { cls, matchedNodes, matchedContacts } = classify(toks, nodes, contacts);
        return {
          _id:       a.id || a._id || label,
          _label:    label,
          _cls:      cls,
          _nodes:    matchedNodes,
          _contacts: matchedContacts,
          _category: a.category || a.domain || a.type || '',
        };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:kgcdep-toggle', toggle);
    return () => window.removeEventListener('jarvis:kgcdep-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setAssessment('');
    const orphanCount = rows.filter(r => r._cls === 'ORPHAN').length;
    const prompt = `Knowledge × Graph × Contact Depth Map: ${rows.length} articles cross-referenced against ${nodeCount} graph nodes and ${contactCount} contacts. ANCHORED:${rows.filter(r=>r._cls==='ANCHORED').length} TRACED:${rows.filter(r=>r._cls==='TRACED').length} LINKED:${rows.filter(r=>r._cls==='LINKED').length} ORPHAN:${orphanCount}. Provide a 2-sentence strategic assessment of knowledge grounding depth and which orphan articles represent the highest intelligence blind spots.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(answer);
      if (answer) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: answer }),
          });
        } catch {}
      }
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    ANCHORED: rows.filter(r => r._cls === 'ANCHORED').length,
    TRACED:   rows.filter(r => r._cls === 'TRACED').length,
    LINKED:   rows.filter(r => r._cls === 'LINKED').length,
    ORPHAN:   rows.filter(r => r._cls === 'ORPHAN').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search && !JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Knowledge × Graph × Contact Intelligence Depth Map"
        style={{
          position: 'fixed', bottom: 8, left: 80840, zIndex: 155,
          background: 'rgba(5,8,13,0.82)', border: '1px solid #29E7FF55',
          color: '#29E7FF', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >◈ KGCDEP</button>
    );
  }

  return (
    <>
      {/* backdrop */}
      <div onClick={() => setOpen(false)} style={{
        position: 'fixed', inset: 0, zIndex: 154, background: 'rgba(0,0,0,0.45)',
      }} />

      {/* panel */}
      <div style={{
        position: 'fixed', bottom: 38, left: '50%', transform: 'translateX(-50%)',
        width: 'min(820px,96vw)', maxHeight: '72vh',
        background: 'rgba(5,8,13,0.97)', border: '1px solid #29E7FF33',
        borderRadius: 8, zIndex: 155, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', overflow: 'hidden',
        boxShadow: '0 0 60px rgba(41,231,255,0.08)',
      }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #222' }}>
          <span style={{ color: '#29E7FF', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
            ◈ KNOWLEDGE × GRAPH × CONTACT — INTELLIGENCE DEPTH MAP
          </span>
          {loading && <span style={{ color: '#666', fontSize: 9 }}>loading…</span>}
          {error   && <span style={{ color: '#FF4444', fontSize: 9 }}>{error}</span>}
          <button onClick={() => setOpen(false)} style={{
            marginLeft: 'auto', background: 'none', border: 'none', color: '#666',
            fontSize: 14, cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'ARTICLES',  val: rows.length,       color: '#29E7FF' },
            { label: 'NODES',     val: nodeCount,          color: '#29E7FF' },
            { label: 'CONTACTS',  val: contactCount,       color: '#29E7FF' },
            { label: 'ANCHORED',  val: counts.ANCHORED,    color: '#00E5A0' },
            { label: 'TRACED',    val: counts.TRACED,      color: '#29E7FF' },
            { label: 'LINKED',    val: counts.LINKED,      color: '#A78BFA' },
            {
              label: 'ORPHAN', val: counts.ORPHAN, color: '#FFB800',
              pulse: counts.ORPHAN > 0,
            },
          ].map(({ label, val, color, pulse }) => (
            <div key={label} style={{
              background: 'rgba(41,231,255,0.04)', border: `1px solid ${color}22`,
              borderRadius: 4, padding: '4px 10px', minWidth: 64, textAlign: 'center',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color,
                animation: pulse ? 'kgcdep-pulse 1.6s ease-in-out infinite' : 'none' }}>{val}</div>
              <div style={{ fontSize: 8, color: '#555', letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* tabs + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderBottom: '1px solid #1a1a1a' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? 'rgba(41,231,255,0.12)' : 'none',
              border: tab === t ? '1px solid #29E7FF55' : '1px solid transparent',
              color: tab === t ? '#29E7FF' : '#555', fontSize: 9, padding: '2px 8px',
              borderRadius: 3, cursor: 'pointer', letterSpacing: 1,
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="filter…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid #333',
              color: '#aaa', fontSize: 10, padding: '2px 8px', borderRadius: 3,
              outline: 'none', width: 140,
            }}
          />
        </div>

        {/* rows */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#444', fontSize: 11, padding: 20, textAlign: 'center' }}>no articles match</div>
          )}
          {visible.map(row => {
            const isExp = expanded === row._id;
            return (
              <div key={row._id} style={{ borderBottom: '1px solid #111' }}>
                <div
                  onClick={() => setExpanded(isExp ? null : row._id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', cursor: 'pointer' }}
                >
                  <span style={{
                    fontSize: 9, padding: '2px 7px', borderRadius: 10,
                    background: `${CLS_COLOR[row._cls]}11`, border: `1px solid ${CLS_COLOR[row._cls]}44`,
                    color: CLS_COLOR[row._cls], minWidth: 58, textAlign: 'center', letterSpacing: 1,
                  }}>{row._cls}</span>
                  <span style={{ color: '#ccc', fontSize: 11 }}>{row._label}</span>
                  {row._category && <span style={{ color: '#555', fontSize: 9 }}>{row._category}</span>}
                  <span style={{ marginLeft: 'auto', color: '#333', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 10px 38px', background: 'rgba(255,255,255,0.01)' }}>
                    {row._nodes.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: '#555', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED GRAPH NODES</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row._nodes.map((n, i) => {
                            const score = n.centrality_score ?? n.score ?? n.weight ?? '';
                            return (
                              <span key={i} style={{
                                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                                background: 'rgba(41,231,255,0.08)', border: '1px solid #29E7FF33',
                                color: '#29E7FF',
                              }}>
                                {n.label || n.name || n.id || 'Node'}
                                {score !== '' && (
                                  <span style={{ marginLeft: 4, color: '#29E7FF88' }}>
                                    {typeof score === 'number' ? score.toFixed(3) : score}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {row._contacts.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ color: '#555', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED CONTACTS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row._contacts.map((c, i) => {
                            const role = c.role || c.title || '';
                            const org  = c.org || c.organisation || c.company || '';
                            return (
                              <span key={i} style={{
                                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                                background: 'rgba(167,139,250,0.08)', border: '1px solid #A78BFA33',
                                color: '#A78BFA',
                              }}>
                                {c.name || c.full_name || c.display_name || c.email || 'Contact'}
                                {role && <span style={{ marginLeft: 4, color: '#A78BFA88' }}>{role}</span>}
                                {org  && <span style={{ marginLeft: 4, color: '#A78BFA66' }}>@ {org}</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {row._nodes.length === 0 && row._contacts.length === 0 && (
                      <div style={{ color: '#FFB800', fontSize: 10 }}>
                        ⚠ No graph node or contact linkage — this article is structurally orphaned.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* assess footer */}
        <div style={{ borderTop: '1px solid #222', padding: '8px 14px' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(41,231,255,0.05)' : 'rgba(41,231,255,0.10)',
              border: '1px solid #29E7FF55', color: '#29E7FF',
              fontSize: 10, padding: '4px 14px', borderRadius: 3,
              cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS KNOWLEDGE DEPTH'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(41,231,255,0.03)',
              border: '1px solid #29E7FF22', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes kgcdep-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </>
  );
}
