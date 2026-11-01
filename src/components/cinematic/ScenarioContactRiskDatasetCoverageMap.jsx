/**
 * ScenarioContactRiskDatasetCoverageMap — F255
 *
 * Fetches /v1/scenario/list         (scenarios)
 *         /entities/Contact
 *         /entities/RiskSignal
 *         /v1/datasets
 *
 * Keyword-matches each scenario against contacts, risk signals,
 * and datasets to classify:
 *
 *   SECURED  — matches all 3 sources
 *   STAFFED  — matches 2 of 3 sources
 *   SIGNALED — matches exactly 1 source
 *   EXPOSED  — no match to any source
 *              (fully unexecutable scenarios with no contact owner,
 *               no risk signal, no dataset backing)
 *
 * Toggle: ◈ SCRMAP button (fixed, bottom strip) left:190600, zIndex:351
 * Stat tiles: scenarios / contacts / risk signals / datasets /
 *             secured / staffed / signaled / exposed
 * Red pulse on EXPOSED count (strategic blind spots).
 * Expandable rows: matched contacts with role/org +
 *                  matched risk signals with severity badge +
 *                  matched datasets with row-count badge.
 * Filter tabs: ALL / SECURED / STAFFED / SIGNALED / EXPOSED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "scrmap"/"scenario contact risk"/"scenario coverage map"/
 *        "exposed scenarios"/"scenario blind spots"/"strategic coverage"/
 *        "scenario dataset coverage"/"scenario risk coverage"
 * Event: jarvis:scrmap-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

// API base resolved via apiBase()
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'SECURED', 'STAFFED', 'SIGNALED', 'EXPOSED'];

const CLS_COLOR = {
  SECURED:  '#22C55E',
  STAFFED:  '#F59E0B',
  SIGNALED: '#38BDF8',
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

function normalizeScenarios(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.scenarios))   return raw.scenarios;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.contacts))    return raw.contacts;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function normalizeRisks(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.risk_signals)) return raw.risk_signals;
  if (Array.isArray(raw?.signals))      return raw.signals;
  if (Array.isArray(raw?.data))         return raw.data;
  if (Array.isArray(raw?.results))      return raw.results;
  return [];
}

function normalizeDatasets(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.datasets))    return raw.datasets;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function scenarioText(s) {
  return [s.name, s.title, s.description, s.objective, s.type, s.phase, s.tags]
    .filter(Boolean).join(' ');
}

function classifyScenario(scenToks, contacts, risks, datasets) {
  const matchedContacts = contacts.filter(c => {
    const t = [c.name, c.full_name, c.role, c.organization, c.department, c.email, c.expertise].filter(Boolean).join(' ');
    return overlaps(scenToks, t);
  });
  const matchedRisks = risks.filter(r => {
    const t = [r.name, r.title, r.description, r.type, r.category, r.signal_type, r.severity].filter(Boolean).join(' ');
    return overlaps(scenToks, t);
  });
  const matchedDatasets = datasets.filter(d => {
    const t = [d.name, d.title, d.description, d.category, d.type, d.source, d.tags].filter(Boolean).join(' ');
    return overlaps(scenToks, t);
  });
  const hits = (matchedContacts.length > 0 ? 1 : 0)
             + (matchedRisks.length > 0 ? 1 : 0)
             + (matchedDatasets.length > 0 ? 1 : 0);
  const cls = hits === 3 ? 'SECURED'
            : hits === 2 ? 'STAFFED'
            : hits === 1 ? 'SIGNALED'
            : 'EXPOSED';
  return { cls, matchedContacts, matchedRisks, matchedDatasets };
}

export function isScrmapQuery(q) {
  const s = q.toLowerCase();
  return s.includes('scrmap')
      || s.includes('scenario contact risk')
      || s.includes('scenario coverage map')
      || s.includes('exposed scenarios')
      || s.includes('scenario blind spots')
      || s.includes('strategic coverage')
      || s.includes('scenario dataset coverage')
      || s.includes('scenario risk coverage');
}

export function buildScrmapScript(rows) {
  const exposed  = rows.filter(r => r.cls === 'EXPOSED');
  const secured  = rows.filter(r => r.cls === 'SECURED');
  return `Scenario × Contact × RiskSignal × Dataset Strategic Coverage Map (◈ SCRMAP):
Total scenarios analysed: ${rows.length}.
Secured (all 3 sources): ${secured.length}.
Staffed (2 sources): ${rows.filter(r => r.cls === 'STAFFED').length}.
Signaled (1 source): ${rows.filter(r => r.cls === 'SIGNALED').length}.
EXPOSED (no grounding — strategic blind spots): ${exposed.length}${exposed.length ? ' — ' + exposed.slice(0, 3).map(r => r.label).join(', ') : ''}.
Identify root cause for each EXPOSED scenario. Propose contact assignments, risk signal linkages, and dataset backing. Return findings, evidence, and next action.`;
}

export default function ScenarioContactRiskDatasetCoverageMap() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [stats, setStats]           = useState({ scenarios: 0, contacts: 0, risks: 0, datasets: 0 });
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [sc, co, ri, ds] = await Promise.all([
        fetch(`${apiBase()}/v1/scenario/list`,      { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${apiBase()}/entities/Contact`,      { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${apiBase()}/entities/RiskSignal`,   { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${apiBase()}/v1/datasets`,           { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const scenarios = normalizeScenarios(sc);
      const contacts  = normalizeContacts(co);
      const risks     = normalizeRisks(ri);
      const datasets  = normalizeDatasets(ds);

      const classified = scenarios.map(s => {
        const toks = tokens(scenarioText(s));
        const { cls, matchedContacts, matchedRisks, matchedDatasets } = classifyScenario(toks, contacts, risks, datasets);
        return {
          id:     s.id || s._id || s.name || s.title,
          label:  s.name || s.title || s.id || 'Untitled',
          status: s.status || s.phase || s.state || '',
          cls,
          matchedContacts,
          matchedRisks,
          matchedDatasets,
        };
      });

      setRows(classified);
      setStats({ scenarios: scenarios.length, contacts: contacts.length, risks: risks.length, datasets: datasets.length });
    } catch (e) {
      setError(e.message || 'Load error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:scrmap-toggle', toggle);
    return () => window.removeEventListener('jarvis:scrmap-toggle', toggle);
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
    const script = buildScrmapScript(rows);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.answer || JSON.stringify(d);
      setAssessText(text);
      try {
        await fetch(`${apiBase()}/v1/voice/tts`, {
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

  const counts = { SECURED: 0, STAFFED: 0, SIGNALED: 0, EXPOSED: 0 };
  rows.forEach(r => counts[r.cls]++);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 190600, zIndex: 351,
          background: '#0a0a1a', border: '1px solid #334155',
          color: '#94a3b8', fontSize: 9, padding: '2px 6px',
          cursor: 'pointer', borderRadius: 3, whiteSpace: 'nowrap',
        }}
        title="Scenario × Contact × RiskSignal × Dataset Strategic Coverage Map"
      >
        ◈ SCRMAP
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
          ◈ SCRMAP — Strategic Coverage Map
        </span>
        <span style={{ fontSize: 10, color: '#64748b' }}>
          Scenario × Contact × RiskSignal × Dataset
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
          { label: 'SCENARIOS', val: stats.scenarios, col: '#38BDF8' },
          { label: 'CONTACTS',  val: stats.contacts,  col: '#A78BFA' },
          { label: 'RISKS',     val: stats.risks,     col: '#EF4444' },
          { label: 'DATASETS',  val: stats.datasets,  col: '#F59E0B' },
          { label: 'SECURED',   val: counts.SECURED,  col: '#22C55E' },
          { label: 'STAFFED',   val: counts.STAFFED,  col: '#F59E0B' },
          { label: 'SIGNALED',  val: counts.SIGNALED, col: '#38BDF8' },
          {
            label: 'EXPOSED', val: counts.EXPOSED, col: '#EF4444',
            pulse: counts.EXPOSED > 0,
          },
        ].map(t => (
          <div key={t.label} style={{
            background: '#0f172a', border: `1px solid ${t.col}33`,
            borderRadius: 4, padding: '4px 10px', textAlign: 'center', minWidth: 70,
            boxShadow: t.pulse ? `0 0 8px ${t.col}88` : 'none',
            animation: t.pulse ? 'scrmap-pulse 1.5s ease-in-out infinite' : 'none',
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
          placeholder="filter scenarios…"
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
            {rows.length === 0 ? 'No scenarios returned.' : 'No items match current filter.'}
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
              <span style={{ fontSize: 9, color: CLS_COLOR[row.cls], fontWeight: 700, minWidth: 90 }}>
                {row.cls}
              </span>
              <span style={{ fontSize: 11, color: '#e2e8f0', flex: 1 }}>{row.label}</span>
              {row.status && (
                <span style={{ fontSize: 8, color: '#64748b', background: '#1e293b', padding: '1px 4px', borderRadius: 2 }}>
                  {row.status}
                </span>
              )}
              <span style={{ fontSize: 9, color: '#475569' }}>{expanded[row.id] ? '▲' : '▼'}</span>
            </div>

            {expanded[row.id] && (
              <div style={{ paddingLeft: 12, paddingBottom: 6, fontSize: 10, color: '#64748b' }}>
                {/* Contacts */}
                {row.matchedContacts.length > 0 ? (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#A78BFA', fontWeight: 700 }}>CONTACTS: </span>
                    {row.matchedContacts.slice(0, 4).map(c => (
                      <span key={c.id || c.name} style={{ marginRight: 6 }}>
                        {c.name || c.full_name || c.id}
                        {(c.role || c.organization) && (
                          <span style={{ fontSize: 8, color: '#5B21B6', background: '#1e1b4b', borderRadius: 2, padding: '0 3px', marginLeft: 2 }}>
                            {[c.role, c.organization].filter(Boolean).join(' / ')}
                          </span>
                        )}
                      </span>
                    ))}
                    {row.matchedContacts.length > 4 && <span style={{ color: '#475569' }}>+{row.matchedContacts.length - 4} more</span>}
                  </div>
                ) : (
                  <div style={{ color: '#374151', marginBottom: 4 }}>No contact match.</div>
                )}

                {/* Risk signals */}
                {row.matchedRisks.length > 0 ? (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ color: '#EF4444', fontWeight: 700 }}>RISK SIGNALS: </span>
                    {row.matchedRisks.slice(0, 4).map(r => (
                      <span key={r.id || r.name} style={{ marginRight: 6 }}>
                        {r.name || r.title || r.id}
                        <span style={{ fontSize: 8, color: '#991B1B', background: '#450a0a', borderRadius: 2, padding: '0 3px', marginLeft: 2 }}>
                          {r.severity || r.level || '–'}
                        </span>
                      </span>
                    ))}
                    {row.matchedRisks.length > 4 && <span style={{ color: '#475569' }}>+{row.matchedRisks.length - 4} more</span>}
                  </div>
                ) : (
                  <div style={{ color: '#374151', marginBottom: 4 }}>No risk signal match.</div>
                )}

                {/* Datasets */}
                {row.matchedDatasets.length > 0 ? (
                  <div>
                    <span style={{ color: '#F59E0B', fontWeight: 700 }}>DATASETS: </span>
                    {row.matchedDatasets.slice(0, 4).map(d => (
                      <span key={d.id || d.name} style={{ marginRight: 6 }}>
                        {d.name || d.title || d.id}
                        {d.row_count != null && (
                          <span style={{ fontSize: 8, color: '#92400E', background: '#451a03', borderRadius: 2, padding: '0 3px', marginLeft: 2 }}>
                            {d.row_count.toLocaleString()} rows
                          </span>
                        )}
                      </span>
                    ))}
                    {row.matchedDatasets.length > 4 && <span style={{ color: '#475569' }}>+{row.matchedDatasets.length - 4} more</span>}
                  </div>
                ) : (
                  <div style={{ color: '#374151' }}>No dataset match.</div>
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
        @keyframes scrmap-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
