/**
 * F283 — Live Intel × Graph Centrality Active Nodes Monitor (LIGCM)
 *
 * Answers: "Which of the most influential graph nodes are currently resonating
 * with live world events — and which are dormant?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /functions/getLiveIntel   → live seismic / crypto / FX events
 *   GET /v1/graph/centrality      → top-centrality graph node list
 *
 * Classification per node:
 *   ACTIVE  — ≥1 live event keyword-matches the node id / label / metadata
 *   DORMANT — no match in current live-intel snapshot
 *
 * Stat tiles:  nodes / live events / active / dormant
 * Amber badge: active count on button
 * Expand row:  matched live events with SEISMIC/CRYPTO/FX type badge + relevance bar (max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat +
 *             jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ LIGCM  at left:6720, bottom:18, zIndex:68
 * Event:   jarvis:ligcm-toggle
 * Voice:   "live intel graph / active nodes / graph pulse / ligcm /
 *           active centrality / live graph / graph live intel /
 *           world active nodes / centrality live / graph active"
 * Refresh: 60 s auto-poll.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

// ─── palette ─────────────────────────────────────────────────────────────────
const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const AM   = '#F59E0B';
const CY   = '#06B6D4';
const GR   = '#10B981';
const RD   = '#EF4444';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS = ['ALL', 'ACTIVE', 'DORMANT'];
const CLASS_COLOR = { ACTIVE: GR, DORMANT: MU };
const CLASS_LABEL = { ACTIVE: 'ACT', DORMANT: 'DRM' };
const EVENT_TYPE_COLOR = { SEISMIC: RD, CRYPTO: AM, FX: CY };

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const LIGCM_RE =
  /\b(live[._-]?intel[._-]?graph|active[._-]?nodes?|graph[._-]?pulse|ligcm|active[._-]?centralit(?:y|ies)|live[._-]?graph|graph[._-]?live[._-]?intel|world[._-]?active[._-]?nodes?|centralit(?:y|ies)[._-]?live|graph[._-]?active)\b/i;

export function isLigcmQuery(t) {
  return LIGCM_RE.test(t || '');
}

export async function buildLigcmScript() {
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [li, cr] = await Promise.all([
      fetch(`${API}/functions/getLiveIntel`, { headers: h }).then(r => r.ok ? r.json() : {}),
      fetch(`${API}/v1/graph/centrality`, { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const events = extractEvents(li);
    const nodes  = normNodes(cr);
    const active = nodes.filter(n => matchEvents(n, events).length > 0).length;
    return `Live-intel × graph centrality: ${nodes.length} top-influence nodes assessed against ${events.length} live world events. ${active} nodes are currently ACTIVE — resonating with live seismic, crypto, or FX signals — while ${nodes.length - active} remain dormant with no live-world activation. Priority attention should focus on ACTIVE high-centrality nodes as they sit at the intersection of graph influence and real-world momentum.`;
  } catch {
    return 'Live-intel × graph centrality data temporarily unavailable.';
  }
}

// ─── normalizers ─────────────────────────────────────────────────────────────
function extractEvents(raw) {
  const events = [];
  const eq = raw?.earthquakes ?? raw?.seismic ?? [];
  Array.isArray(eq) && eq.forEach(e => events.push({
    id: e.id ?? e.place ?? String(Math.random()),
    type: 'SEISMIC',
    label: [e.place, e.magnitude ? `M${e.magnitude}` : ''].filter(Boolean).join(' '),
    tokens: tokenize([e.place, e.region, e.country].join(' ')),
  }));
  const crypto = raw?.crypto ?? raw?.markets?.crypto ?? [];
  Array.isArray(crypto) && crypto.forEach(c => events.push({
    id: c.symbol ?? c.id ?? String(Math.random()),
    type: 'CRYPTO',
    label: [c.symbol, c.name].filter(Boolean).join(' '),
    tokens: tokenize([c.symbol, c.name].join(' ')),
  }));
  const fx = raw?.fx ?? raw?.markets?.fx ?? [];
  Array.isArray(fx) && fx.forEach(f => events.push({
    id: f.pair ?? f.symbol ?? String(Math.random()),
    type: 'FX',
    label: f.pair ?? f.symbol ?? 'FX',
    tokens: tokenize([f.pair, f.symbol, f.base, f.quote].join(' ')),
  }));
  return events;
}

function normNodes(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.nodes ?? raw?.data ?? raw?.results ?? raw?.centrality ?? []);
  return arr.slice(0, 60).map(n => ({
    id: n.id ?? n.node_id ?? String(Math.random()),
    label: n.label ?? n.name ?? n.id ?? '—',
    score: typeof n.centrality === 'number' ? n.centrality
         : typeof n.score === 'number'      ? n.score
         : typeof n.pagerank === 'number'   ? n.pagerank
         : 0,
    meta: [n.type, n.category, n.description].filter(Boolean).join(' '),
  }));
}

function tokenize(s) {
  return (s || '').toLowerCase().split(/[\s,._\-/\\]+/).filter(t => t.length > 2);
}

function matchEvents(node, events) {
  const nodeTokens = tokenize([node.id, node.label, node.meta].join(' '));
  const matched = [];
  for (const ev of events) {
    const overlap = ev.tokens.filter(t => nodeTokens.includes(t));
    if (overlap.length > 0) {
      matched.push({ ...ev, score: Math.min(1, overlap.length / Math.max(1, ev.tokens.length)) });
    }
  }
  return matched.sort((a, b) => b.score - a.score).slice(0, 5);
}

function classify(nodes, events) {
  return nodes.map(n => {
    const matches = matchEvents(n, events);
    return { ...n, classification: matches.length > 0 ? 'ACTIVE' : 'DORMANT', matches };
  });
}

// ─── component ───────────────────────────────────────────────────────────────
export default function LiveIntelGraphCentrality() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [evCount, setEvCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [filter, setFilter]   = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [briefText, setBriefText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [li, cr] = await Promise.all([
        fetch(`${API}/functions/getLiveIntel`, { headers: h }).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/v1/graph/centrality`, { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const events = extractEvents(li);
      const nodes  = normNodes(cr);
      setEvCount(events.length);
      setRows(classify(nodes, events));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = e => {
      setOpen(v => !v);
      if (e?.detail?.query) setSearch('');
    };
    window.addEventListener('jarvis:ligcm-toggle', handler);
    return () => window.removeEventListener('jarvis:ligcm-toggle', handler);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setBriefText('');
    const active  = rows.filter(r => r.classification === 'ACTIVE').length;
    const dormant = rows.filter(r => r.classification === 'DORMANT').length;
    const prompt  = `Live-intel × graph centrality: ${rows.length} top nodes assessed. ${active} ACTIVE (matching live world events), ${dormant} DORMANT. Top active nodes: ${rows.filter(r => r.classification === 'ACTIVE').slice(0, 3).map(r => r.label).join(', ')}. In 2 sentences, explain what the activation pattern means for operational intelligence priorities.`;
    try {
      const h = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const brief = d?.response ?? d?.reply ?? d?.message ?? d?.content ?? 'Assessment unavailable.';
      setBriefText(brief);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: brief } }));
    } catch {
      setBriefText('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const active  = rows.filter(r => r.classification === 'ACTIVE').length;
  const dormant = rows.filter(r => r.classification === 'DORMANT').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.classification !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.label.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
    }
    return true;
  });

  const TILE_STYLE = (accent) => ({
    flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${accent}33`,
    borderRadius: 4, padding: '8px 10px', textAlign: 'center',
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Live Intel × Graph Centrality Active Nodes (LIGCM)"
        style={{
          position: 'fixed', left: 6720, bottom: 18, zIndex: 68,
          background: active > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(10,12,20,0.92)',
          border: `1px solid ${active > 0 ? GR : BD}`,
          color: active > 0 ? GR : MU,
          fontFamily: MONO, fontSize: 9, padding: '4px 8px', borderRadius: 3, cursor: 'pointer',
          letterSpacing: 1,
        }}
      >
        ◈ LIGCM{active > 0 && (
          <span style={{ marginLeft: 5, background: GR, color: '#000', borderRadius: 2, padding: '1px 4px', fontSize: 8 }}>
            {active}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', left: 6720, bottom: 58, zIndex: 68,
      width: 420, maxHeight: '72vh',
      background: BG, border: `1px solid ${BD}`,
      borderRadius: 6, display: 'flex', flexDirection: 'column',
      fontFamily: MONO, fontSize: 10, color: '#CBD5E1',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: GR, fontSize: 11, fontWeight: 700, flex: 1, letterSpacing: 1 }}>
          ◈ LIVE INTEL × GRAPH CENTRALITY
        </span>
        {loading && <span style={{ color: MU, fontSize: 8 }}>◌ POLLING…</span>}
        <button onClick={load} style={{ background: 'none', border: 'none', color: CY, cursor: 'pointer', fontSize: 9 }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 11 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: `1px solid ${BD}` }}>
        {[
          { label: 'NODES', val: rows.length, accent: CY },
          { label: 'EVENTS', val: evCount, accent: MU },
          { label: 'ACTIVE', val: active, accent: GR },
          { label: 'DORMANT', val: dormant, accent: MU },
        ].map(t => (
          <div key={t.label} style={TILE_STYLE(t.accent)}>
            <div style={{ color: t.accent, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: MU, fontSize: 7, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: `1px solid ${BD}` }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(255,255,255,0.08)' : 'none',
            border: `1px solid ${filter === f ? BD : 'transparent'}`,
            color: filter === f ? '#E2E8F0' : MU, fontFamily: MONO,
            fontSize: 8, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search nodes…"
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${BD}`, borderRadius: 3, color: '#CBD5E1',
            fontFamily: MONO, fontSize: 8, padding: '2px 6px', width: 110,
          }}
        />
      </div>

      {/* Node list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visible.length === 0 ? (
          <div style={{ padding: 16, color: MU, textAlign: 'center', fontSize: 9 }}>
            {loading ? '◌ Loading…' : 'No nodes match current filter.'}
          </div>
        ) : visible.map(r => (
          <div key={r.id} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
            <div
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', cursor: 'pointer' }}
            >
              <span style={{
                background: `${CLASS_COLOR[r.classification]}22`,
                color: CLASS_COLOR[r.classification],
                border: `1px solid ${CLASS_COLOR[r.classification]}44`,
                borderRadius: 2, fontSize: 7, padding: '1px 4px', letterSpacing: 1, minWidth: 28, textAlign: 'center',
              }}>{CLASS_LABEL[r.classification]}</span>
              <span style={{ flex: 1, color: '#E2E8F0', fontSize: 9 }} title={r.id}>{r.label}</span>
              <span style={{ color: MU, fontSize: 8 }}>{(r.score * 100).toFixed(1)}%</span>
              {r.classification === 'ACTIVE' && (
                <span style={{ color: GR, fontSize: 8 }}>({r.matches.length})</span>
              )}
              <span style={{ color: MU, fontSize: 9 }}>{expanded === r.id ? '▲' : '▼'}</span>
            </div>
            {expanded === r.id && (
              <div style={{ padding: '4px 12px 8px 12px', background: 'rgba(255,255,255,0.02)' }}>
                {r.classification === 'DORMANT' ? (
                  <div style={{ color: MU, fontSize: 8, padding: '4px 0' }}>
                    No live events currently match this node's identifiers.
                  </div>
                ) : r.matches.map((m, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{
                      background: `${EVENT_TYPE_COLOR[m.type] ?? MU}22`,
                      color: EVENT_TYPE_COLOR[m.type] ?? MU,
                      border: `1px solid ${EVENT_TYPE_COLOR[m.type] ?? MU}44`,
                      borderRadius: 2, fontSize: 7, padding: '1px 4px', letterSpacing: 1, minWidth: 44, textAlign: 'center',
                    }}>{m.type}</span>
                    <span style={{ flex: 1, color: '#94A3B8', fontSize: 8 }}>{m.label}</span>
                    <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                      <div style={{ width: `${Math.round(m.score * 100)}%`, height: '100%', background: GR, borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Assess + brief */}
      <div style={{ borderTop: `1px solid ${BD}`, padding: '8px 12px' }}>
        <button
          onClick={assess}
          disabled={assessing || rows.length === 0}
          style={{
            width: '100%', background: assessing ? 'rgba(255,255,255,0.05)' : 'rgba(6,182,212,0.12)',
            border: `1px solid ${assessing ? BD : CY}44`,
            color: assessing ? MU : CY, fontFamily: MONO, fontSize: 8,
            padding: '5px 0', borderRadius: 3, cursor: assessing ? 'default' : 'pointer', letterSpacing: 1,
          }}
        >
          {assessing ? '◌ ASSESSING…' : '▶ ASSESS ACTIVATION PATTERN'}
        </button>
        {briefText && (
          <div style={{ marginTop: 6, color: '#94A3B8', fontSize: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {briefText}
          </div>
        )}
      </div>
    </div>
  );
}
