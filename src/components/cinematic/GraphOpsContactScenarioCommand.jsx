/**
 * GraphOpsContactScenarioCommand — F252
 *
 * Fetches /v1/graph/centrality + /v1/ops/alerts +
 *         /entities/Contact     + /v1/scenario/list
 *
 * Keyword-matches each graph node (label/type/description)
 * against ops alerts, contacts, and scenarios to classify:
 *
 *   COMMANDING — matches all 3 sources
 *   ACTIVE     — matches 2 of 3 sources
 *   PARTIAL    — matches exactly 1 source
 *   DARK       — no match to any source
 *               (blind-spot nodes with no ops alert, no contact owner, no scenario backing)
 *
 * Toggle: ◈ GOACMD button (fixed, bottom strip) left:188920, zIndex:348
 * Stat tiles: nodes / alerts / contacts / scenarios /
 *             commanding / active / partial / dark
 * Red pulse on DARK count (ungrounded graph nodes).
 * Expandable rows: matched ops alerts with severity badge +
 *                  matched contacts with role/org +
 *                  matched scenarios with status badge.
 * Filter tabs: ALL / COMMANDING / ACTIVE / PARTIAL / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "goacmd"/"graph ops action"/"graph command"/"action command"/
 *        "ops action graph"/"graph operational command"/"graph alert contact"/
 *        "dark graph nodes"/"blind graph"
 * Event: jarvis:goacmd-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDING', 'ACTIVE', 'PARTIAL', 'DARK'];

const CLS_COLOR = {
  COMMANDING: '#22C55E',
  ACTIVE:     '#38BDF8',
  PARTIAL:    '#F59E0B',
  DARK:       '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeNodes(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.nodes))     return raw.nodes;
  if (Array.isArray(raw?.entities))  return raw.entities;
  if (Array.isArray(raw?.data))      return raw.data;
  if (Array.isArray(raw?.results))   return raw.results;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.alerts))   return raw.alerts;
  if (Array.isArray(raw?.data))     return raw.data;
  if (Array.isArray(raw?.results))  return raw.results;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.contacts))   return raw.contacts;
  if (Array.isArray(raw?.data))       return raw.data;
  if (Array.isArray(raw?.results))    return raw.results;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.scenarios))   return raw.scenarios;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function nodeText(n) {
  return [n.label, n.name, n.type, n.description, n.category, n.id]
    .filter(Boolean).join(' ');
}

function classifyNode(nodeToks, alerts, contacts, scenarios) {
  const matchedAlerts = alerts.filter(a => {
    const t = [a.title, a.message, a.description, a.type, a.severity, a.source].filter(Boolean).join(' ');
    return overlaps(nodeToks, t);
  });
  const matchedContacts = contacts.filter(c => {
    const t = [c.name, c.role, c.organisation, c.org, c.email, c.tags, c.category].filter(Boolean).join(' ');
    return overlaps(nodeToks, t);
  });
  const matchedScenarios = scenarios.filter(s => {
    const t = [s.name, s.title, s.description, s.objective, s.phase, s.status, s.tags].filter(Boolean).join(' ');
    return overlaps(nodeToks, t);
  });
  const hits = (matchedAlerts.length > 0 ? 1 : 0)
             + (matchedContacts.length > 0 ? 1 : 0)
             + (matchedScenarios.length > 0 ? 1 : 0);
  const cls = hits === 3 ? 'COMMANDING' : hits === 2 ? 'ACTIVE' : hits === 1 ? 'PARTIAL' : 'DARK';
  return { cls, matchedAlerts, matchedContacts, matchedScenarios };
}

export function isGoacmdQuery(q) {
  const s = q.toLowerCase();
  return s.includes('goacmd')
      || s.includes('graph ops action')
      || s.includes('graph command')
      || s.includes('action command')
      || s.includes('ops action graph')
      || s.includes('graph operational command')
      || s.includes('graph alert contact')
      || s.includes('dark graph nodes')
      || s.includes('blind graph');
}

export function buildGoacmdScript(rows) {
  const dark = rows.filter(r => r.cls === 'DARK');
  const commanding = rows.filter(r => r.cls === 'COMMANDING');
  return `Graph × Ops Alert × Contact × Scenario Intelligence Action Command (◈ GOACMD):
Total graph nodes analysed: ${rows.length}.
Commanding (all 3 sources): ${commanding.length}.
Active (2 sources): ${rows.filter(r => r.cls === 'ACTIVE').length}.
Partial (1 source): ${rows.filter(r => r.cls === 'PARTIAL').length}.
DARK (no grounding): ${dark.length}${dark.length ? ' — ' + dark.slice(0, 3).map(r => r.label).join(', ') : ''}.
Identify root cause for each DARK node. Propose ops alert monitoring, contact ownership assignments, and scenario playbook linkages. Return findings, evidence, and next action.`;
}

export default function GraphOpsContactScenarioCommand() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [stats, setStats]       = useState({ nodes: 0, alerts: 0, contacts: 0, scenarios: 0 });
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [gr, al, co, sc] = await Promise.all([
        fetch(`${API}/v1/graph/centrality`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/ops/alerts`,       { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Contact`,    { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/scenario/list`,    { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const nodes     = normalizeNodes(gr);
      const alerts    = normalizeAlerts(al);
      const contacts  = normalizeContacts(co);
      const scenarios = normalizeScenarios(sc);

      const classified = nodes.map(n => {
        const toks = tokens(nodeText(n));
        const { cls, matchedAlerts, matchedContacts, matchedScenarios } = classifyNode(toks, alerts, contacts, scenarios);
        return {
          id: n.id || n._id || n.label || n.name,
          label: n.label || n.name || n.id || 'Unknown',
          type: n.type || n.node_type || '',
          score: n.centrality_score != null ? n.centrality_score : (n.score != null ? n.score : null),
          cls,
          matchedAlerts,
          matchedContacts,
          matchedScenarios,
        };
      });

      setRows(classified);
      setStats({ nodes: nodes.length, alerts: alerts.length, contacts: contacts.length, scenarios: scenarios.length });
    } catch (e) {
      setError(e.message || 'Load error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:goacmd-toggle', toggle);
    return () => window.removeEventListener('jarvis:goacmd-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const assess = async () => {
    setAssessing(true);
    setAssessText('');
    const script = buildGoacmdScript(rows);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.answer || JSON.stringify(d);
      setAssessText(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch (_) {}
    } catch (e) {
      setAssessText('Assessment error: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  const visible = rows
    .filter(r => tab === 'ALL' || r.cls === tab)
    .filter(r => !search || r.label.toLowerCase().includes(search.toLowerCase()));

  const counts = { COMMANDING: 0, ACTIVE: 0, PARTIAL: 0, DARK: 0 };
  rows.forEach(r => counts[r.cls]++);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 188920, zIndex: 348,
          background: '#0a0a1a', border: '1px solid #334155',
          color: '#94a3b8', fontSize: 9, padding: '2px 6px',
          cursor: 'pointer', borderRadius: 3, whiteSpace: 'nowrap',
        }}
        title="Graph × Ops Alert × Contact × Scenario Intelligence Action Command"
      >
        ◈ GOACMD
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9200,
      background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #1e293b' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#38BDF8', letterSpacing: 1 }}>
          ◈ GOACMD — Graph Intelligence Action Command
        </span>
        <span style={{ fontSize: 10, color: '#64748b' }}>
          Graph × Ops Alert × Contact × Scenario
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={loading}
            style={{ fontSize: 10, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '2px 8px', cursor: 'pointer', borderRadius: 3 }}>
            {loading ? '...' : '↻'}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ fontSize: 10, background: '#1e293b', border: '1px solid #334155', color: '#ef4444', padding: '2px 8px', cursor: 'pointer', borderRadius: 3 }}>
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexWrap: 'wrap' }}>
        {[
          { label: 'NODES',      val: stats.nodes,     col: '#38BDF8' },
          { label: 'ALERTS',     val: stats.alerts,    col: '#F59E0B' },
          { label: 'CONTACTS',   val: stats.contacts,  col: '#818CF8' },
          { label: 'SCENARIOS',  val: stats.scenarios, col: '#34D399' },
          { label: 'COMMANDING', val: counts.COMMANDING, col: '#22C55E' },
          { label: 'ACTIVE',     val: counts.ACTIVE,     col: '#38BDF8' },
          { label: 'PARTIAL',    val: counts.PARTIAL,    col: '#F59E0B' },
          {
            label: 'DARK', val: counts.DARK, col: '#EF4444',
            pulse: counts.DARK > 0,
          },
        ].map(t => (
          <div key={t.label} style={{
            background: '#0f172a', border: `1px solid ${t.col}33`,
            borderRadius: 4, padding: '4px 10px', textAlign: 'center', minWidth: 70,
            boxShadow: t.pulse ? `0 0 8px ${t.col}88` : 'none',
            animation: t.pulse ? 'goacmd-pulse 1.5s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.col }}>{t.val}</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 16px', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              fontSize: 9, padding: '2px 8px', cursor: 'pointer', borderRadius: 3,
              background: tab === t ? '#1e3a5f' : '#0f172a',
              border: `1px solid ${tab === t ? '#38BDF8' : '#1e293b'}`,
              color: tab === t ? '#38BDF8' : '#64748b',
            }}>
            {t}{t !== 'ALL' ? ` (${counts[t] ?? 0})` : ` (${rows.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="filter nodes…"
          style={{
            marginLeft: 'auto', fontSize: 10, background: '#0f172a',
            border: '1px solid #1e293b', color: '#94a3b8',
            padding: '2px 8px', borderRadius: 3, width: 160,
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 10, color: '#ef4444', padding: '2px 16px' }}>{error}</div>
      )}

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ fontSize: 11, color: '#475569', padding: '20px 0', textAlign: 'center' }}>
            {rows.length === 0 ? 'No graph nodes returned.' : 'No items match current filter.'}
          </div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ borderBottom: '1px solid #0f172a', marginBottom: 2 }}>
            <div
              onClick={() => toggleRow(row.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 0', cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 9, color: CLS_COLOR[row.cls], fontWeight: 700, minWidth: 78 }}>
                {row.cls}
              </span>
              <span style={{ fontSize: 11, color: '#e2e8f0', flex: 1 }}>{row.label}</span>
              {row.type && (
                <span style={{ fontSize: 8, color: '#64748b', background: '#1e293b', padding: '1px 4px', borderRadius: 2 }}>
                  {row.type}
                </span>
              )}
              {row.score != null && (
                <span style={{ fontSize: 8, color: '#38BDF8', background: '#0c1a2e', border: '1px solid #1e3a5f', padding: '1px 4px', borderRadius: 2 }}>
                  {typeof row.score === 'number' ? row.score.toFixed(3) : row.score}
                </span>
              )}
              <span style={{ fontSize: 9, color: '#475569' }}>{expanded[row.id] ? '▲' : '▼'}</span>
            </div>

            {expanded[row.id] && (
              <div style={{ paddingLeft: 12, paddingBottom: 6, fontSize: 10, color: '#64748b' }}>
                {/* Ops alerts */}
                {row.matchedAlerts.length > 0 ? (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#F59E0B', fontWeight: 700 }}>OPS ALERTS: </span>
                    {row.matchedAlerts.slice(0, 4).map(a => (
                      <span key={a.id || a.title} style={{ marginRight: 6 }}>
                        {a.title || a.message || a.id}
                        <span style={{ fontSize: 8, color: '#92400E', background: '#451a03', borderRadius: 2, padding: '0 3px', marginLeft: 2 }}>
                          {a.severity || a.level || '–'}
                        </span>
                      </span>
                    ))}
                    {row.matchedAlerts.length > 4 && <span style={{ color: '#475569' }}>+{row.matchedAlerts.length - 4} more</span>}
                  </div>
                ) : (
                  <div style={{ color: '#374151', marginBottom: 4 }}>No alert match.</div>
                )}

                {/* Contacts */}
                {row.matchedContacts.length > 0 ? (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#818CF8', fontWeight: 700 }}>CONTACTS: </span>
                    {row.matchedContacts.slice(0, 4).map(c => (
                      <span key={c.id || c.name} style={{ marginRight: 6 }}>
                        {c.name || c.id}
                        <span style={{ fontSize: 8, color: '#4338CA', background: '#1e1b4b', borderRadius: 2, padding: '0 3px', marginLeft: 2 }}>
                          {c.role || c.organisation || c.org || '–'}
                        </span>
                      </span>
                    ))}
                    {row.matchedContacts.length > 4 && <span style={{ color: '#475569' }}>+{row.matchedContacts.length - 4} more</span>}
                  </div>
                ) : (
                  <div style={{ color: '#374151', marginBottom: 4 }}>No contact match.</div>
                )}

                {/* Scenarios */}
                {row.matchedScenarios.length > 0 ? (
                  <div>
                    <span style={{ color: '#34D399', fontWeight: 700 }}>SCENARIOS: </span>
                    {row.matchedScenarios.slice(0, 4).map(s => (
                      <span key={s.id || s.name} style={{ marginRight: 6 }}>
                        {s.name || s.title || s.id}
                        <span style={{ fontSize: 8, color: '#065F46', background: '#022c22', borderRadius: 2, padding: '0 3px', marginLeft: 2 }}>
                          {s.status || s.phase || '–'}
                        </span>
                      </span>
                    ))}
                    {row.matchedScenarios.length > 4 && <span style={{ color: '#475569' }}>+{row.matchedScenarios.length - 4} more</span>}
                  </div>
                ) : (
                  <div style={{ color: '#374151' }}>No scenario match.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Assess */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid #1e293b' }}>
        <button
          onClick={assess}
          disabled={assessing || rows.length === 0}
          style={{
            fontSize: 10, padding: '4px 14px', cursor: 'pointer',
            background: '#0c4a6e', border: '1px solid #38BDF8',
            color: '#38BDF8', borderRadius: 3, fontWeight: 700,
          }}
        >
          {assessing ? 'Assessing…' : '⟐ ASSESS'}
        </button>
        {assessText && (
          <div style={{
            marginTop: 6, fontSize: 10, color: '#94a3b8',
            background: '#0f172a', border: '1px solid #1e293b',
            borderRadius: 3, padding: 8, maxHeight: 120, overflowY: 'auto',
          }}>
            {assessText}
          </div>
        )}
      </div>

      <style>{`
        @keyframes goacmd-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
