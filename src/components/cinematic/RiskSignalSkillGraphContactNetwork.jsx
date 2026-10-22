/**
 * RiskSignalSkillGraphContactNetwork — F110
 *
 * Fetches /entities/RiskSignal + /v1/aip/skill + /v1/graph/centrality + /entities/Contact.
 *
 * Keyword-matches each risk signal (title/type/description) against
 * skill names/descriptions, graph node labels/types, and contact names/orgs to classify:
 *
 *   COVERED  — signal matches skill AND graph AND contact
 *              (fully defended: capability, traceability, and ownership in place)
 *   CAPABLE  — signal matches skill + at least one of graph or contact
 *              (partially defended — capability exists but full network not established)
 *   TRACED   — signal matches graph or contact but NOT skill
 *              (visible but no response capability — network without execution)
 *   EXPOSED  — no match to any source
 *              (full defense blind spot — no capability, no trace, no owner)
 *
 * Toggle: ◈ TRCNET button (fixed, bottom strip) left:109960, zIndex:207
 * Stat tiles: signals / skills / graph nodes / contacts / covered / capable / traced / exposed
 * Red pulse on EXPOSED count (full defense blind spots).
 * Expandable rows: matched skills with score badge +
 *                  matched graph nodes with centrality score badge +
 *                  matched contacts with role/org.
 * Filter tabs: ALL / COVERED / CAPABLE / TRACED / EXPOSED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "trcnet"/"threat response"/"response network"/"defense coverage"/"threat capability"
 *        "threat network"/"response capability"/"risk response"/"threat defense"
 *        "exposed threats"/"skill gap"/"response gap"/"defense blind spot"/"threat coverage"
 *        "capability network"/"threat response network"/"risk skill coverage"
 * Event: jarvis:trcnet-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'CAPABLE', 'TRACED', 'EXPOSED'];

const CLS_COLOR = {
  COVERED:  '#22C55E',
  CAPABLE:  '#3B82F6',
  TRACED:   '#F97316',
  EXPOSED:  '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

export function isTrcnetQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'trcnet', 'threat response', 'response network', 'defense coverage', 'threat capability',
    'threat network', 'response capability', 'risk response', 'threat defense',
    'exposed threats', 'skill gap', 'response gap', 'defense blind spot', 'threat coverage',
    'capability network', 'threat response network', 'risk skill coverage',
  ].some(kw => s.includes(kw));
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function classify(signal, skills, graphNodes, contacts) {
  const toks = tokens(`${signal.title || ''} ${signal.type || ''} ${signal.description || ''}`);
  const mSkills   = skills.filter(s => overlaps(toks, `${s.name || ''} ${s.description || ''} ${s.category || ''}`));
  const mNodes    = graphNodes.filter(n => overlaps(toks, `${n.label || ''} ${n.type || ''}`));
  const mContacts = contacts.filter(c => overlaps(toks, `${c.name || ''} ${c.organization || ''} ${c.role || ''}`));

  let cls;
  if (mSkills.length && mNodes.length && mContacts.length) cls = 'COVERED';
  else if (mSkills.length && (mNodes.length || mContacts.length)) cls = 'CAPABLE';
  else if (mNodes.length || mContacts.length) cls = 'TRACED';
  else cls = 'EXPOSED';

  return { signal, cls, mSkills, mNodes, mContacts };
}

export default function RiskSignalSkillGraphContactNetwork() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [sigRaw, skillRaw, graphRaw, contRaw] = await Promise.all([
        fetcher('/entities/RiskSignal'),
        fetcher('/v1/aip/skill'),
        fetcher('/v1/graph/centrality'),
        fetcher('/entities/Contact'),
      ]);

      const signals   = normalizeArray(sigRaw,   ['riskSignals', 'signals', 'data', 'items', 'results']);
      const skills    = normalizeArray(skillRaw,  ['skills', 'data', 'items', 'results']);
      const graphNodes = normalizeArray(graphRaw, ['nodes', 'centrality', 'data', 'items', 'results']);
      const contacts  = normalizeArray(contRaw,   ['contacts', 'data', 'items', 'results']);

      setRows(signals.map(s => classify(s, skills, graphNodes, contacts)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:trcnet-toggle', handler);
    return () => window.removeEventListener('jarvis:trcnet-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    COVERED:  rows.filter(r => r.cls === 'COVERED').length,
    CAPABLE:  rows.filter(r => r.cls === 'CAPABLE').length,
    TRACED:   rows.filter(r => r.cls === 'TRACED').length,
    EXPOSED:  rows.filter(r => r.cls === 'EXPOSED').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.signal.title || '').toLowerCase().includes(s) ||
             (r.signal.type || '').toLowerCase().includes(s) ||
             (r.signal.description || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Risk Signals: ${rows.length}. Covered: ${counts.COVERED}. Capable: ${counts.CAPABLE}. Traced: ${counts.TRACED}. Exposed: ${counts.EXPOSED}.`;
    const prompt = `JARVIS threat response capability network audit: ${summary}. Identify the most dangerous exposed threats with zero skill coverage, no graph trace, and no contact owner. Provide 2-sentence advisory on response capability gaps.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || JSON.stringify(d);
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch (_) {}
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 109960, zIndex: 207,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ TRCNET</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 207, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ TRCNET</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>RiskSignal × Skill × Graph × Contact — Threat Response Capability Network</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #EF444455', color: '#EF4444', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'SIGNALS',  val: rows.length,        color: '#94a3b8' },
          { label: 'COVERED',  val: counts.COVERED,     color: CLS_COLOR.COVERED },
          { label: 'CAPABLE',  val: counts.CAPABLE,     color: CLS_COLOR.CAPABLE },
          { label: 'TRACED',   val: counts.TRACED,      color: CLS_COLOR.TRACED },
          { label: 'EXPOSED',  val: counts.EXPOSED,     color: CLS_COLOR.EXPOSED, pulse: counts.EXPOSED > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'trcnet-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid #EF444444', borderRadius: 5, fontSize: 11, color: '#fca5a5', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#EF444422' : 'none',
            border: `1px solid ${tab === t ? '#EF4444' : '#1e293b'}`,
            color: tab === t ? '#EF4444' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search signals…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 180 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLS_COLOR[r.cls], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.signal.title || r.signal.id || '(unnamed)'}
                </span>
                {r.signal.type && (
                  <span style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.signal.type}
                  </span>
                )}
                {r.signal.severity && (
                  <span style={{ background: '#1c0707', border: '1px solid #7c2d12', color: '#fca5a5', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.signal.severity}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.signal.description && (
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.signal.description}</div>
                  )}
                  {r.mSkills.length > 0 && (
                    <div>
                      <div style={{ color: '#3b82f6', fontSize: 10, marginBottom: 3 }}>SKILLS ({r.mSkills.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSkills.slice(0, 8).map((sk, k) => (
                          <span key={k} style={{ background: '#071428', border: '1px solid #1e3a8a', color: '#93c5fd', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {sk.name || sk.id}
                            {sk.score != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> {Number(sk.score).toFixed(1)}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({r.mNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mNodes.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#1a0e2e', border: '1px solid #4c1d95', color: '#c4b5fd', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.id}
                            {n.centrality != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> c:{Number(n.centrality).toFixed(2)}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#34d399', fontSize: 10, marginBottom: 3 }}>CONTACTS ({r.mContacts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mContacts.slice(0, 8).map((c, k) => (
                          <span key={k} style={{ background: '#071a12', border: '1px solid #065f46', color: '#6ee7b7', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {c.name || c.id}
                            {(c.role || c.organization) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> {[c.role, c.organization].filter(Boolean).join(' · ')}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSkills.length === 0 && r.mNodes.length === 0 && r.mContacts.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No skill, graph, or contact match — full defense blind spot.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes trcnet-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
