/**
 * DatasetBrainTaskScenarioContactAuthorityNetwork — F134
 *
 * 5-source intelligence authority network.
 * Fetches /v1/datasets + /v1/cinematic/brain + /entities/Task
 *         + /v1/scenario/list + /entities/Contact
 *
 * Keyword-matches each dataset against brain node labels, task names,
 * scenario titles, and contact names/roles to classify operational authority:
 *
 *   AUTHORITATIVE — matches all 4 other sources
 *                   (dataset fully anchored in the intelligence fabric)
 *   GROUNDED      — matches 2–3 other sources
 *                   (dataset with partial operational grounding)
 *   ACTIVE        — matches exactly 1 other source
 *                   (weakly linked dataset — minimal operational footprint)
 *   SHADOW        — no match to any source
 *                   (operational dead weight — no brain model, no task,
 *                    no scenario, no contact owner)
 *
 * Toggle: ◈ DBTSCN button (fixed, bottom strip) left:123400, zIndex:231
 * Stat tiles: datasets / brain / tasks / scenarios / contacts /
 *             authoritative / grounded / active / shadow
 * Amber pulse on SHADOW count (unanchored datasets with zero operational authority).
 * Expandable rows: matched brain nodes with centrality score badge +
 *                  matched tasks with status badge +
 *                  matched scenarios with status badge +
 *                  matched contacts with role/org.
 * Filter tabs: ALL / AUTHORITATIVE / GROUNDED / ACTIVE / SHADOW + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "dbtscn"/"dataset authority"/"dataset brain task"/"dataset intelligence authority"
 *        "shadow datasets"/"authority network"/"dataset network"/"operational dataset authority"
 *        "dataset brain"/"dataset task scenario"/"dataset contact authority"/"dataset operational"
 *        "dataset grounding"/"dataset authority audit"/"intelligence authority network"
 *        "unanchored datasets"/"dataset blind spot"/"authority map"/"dataset authority map"
 * Event: jarvis:dbtscn-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'AUTHORITATIVE', 'GROUNDED', 'ACTIVE', 'SHADOW'];

const CLS_COLOR = {
  AUTHORITATIVE: '#22C55E',
  GROUNDED:      '#3B82F6',
  ACTIVE:        '#F59E0B',
  SHADOW:        '#F59E0B',
};

export function isDbtscnQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'dbtscn', 'dataset authority', 'dataset brain task', 'dataset intelligence authority',
    'shadow datasets', 'authority network', 'dataset network', 'operational dataset authority',
    'dataset brain', 'dataset task scenario', 'dataset contact authority', 'dataset operational',
    'dataset grounding', 'dataset authority audit', 'intelligence authority network',
    'unanchored datasets', 'dataset blind spot', 'authority map', 'dataset authority map',
    'dataset brain task scenario contact', 'dataset 5 source', 'dataset five source',
    'dataset full authority', 'dataset coverage network', 'dataset anchoring',
  ].some(kw => s.includes(kw));
}

export function buildDbtscnScript(q) {
  return `JARVIS dataset intelligence authority network audit triggered by: "${q}". Fetch /v1/datasets + /v1/cinematic/brain + /entities/Task + /v1/scenario/list + /entities/Contact. Classify each dataset as AUTHORITATIVE/GROUNDED/ACTIVE/SHADOW. Report the SHADOW count and the top 3 unanchored datasets with zero operational authority.`;
}

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

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function datasetLabel(d) {
  return d.name || d.title || d.dataset_name || d.id || 'Unknown';
}

function datasetTokens(d) {
  return tokens(
    `${d.name || ''} ${d.title || ''} ${d.dataset_name || ''} ${d.description || ''} ${d.category || ''} ${d.type || ''} ${d.source || ''} ${d.tags ? (Array.isArray(d.tags) ? d.tags.join(' ') : d.tags) : ''} ${d.domain || ''} ${d.owner || ''}`
  );
}

function classifyDataset(d, brainNodes, tasks, scenarios, contacts) {
  const toks = datasetTokens(d);

  const mBrainNodes = brainNodes.filter(g =>
    overlaps(toks, `${g.label || ''} ${g.name || ''} ${g.id || ''} ${g.type || ''} ${g.category || ''} ${g.description || ''}`)
  );
  const mTasks = tasks.filter(t =>
    overlaps(toks, `${t.title || ''} ${t.name || ''} ${t.description || ''} ${t.type || ''} ${t.category || ''} ${t.tags ? (Array.isArray(t.tags) ? t.tags.join(' ') : t.tags) : ''} ${t.assignee || ''} ${t.status || ''}`)
  );
  const mScenarios = scenarios.filter(sc =>
    overlaps(toks, `${sc.title || ''} ${sc.name || ''} ${sc.description || ''} ${sc.type || ''} ${sc.category || ''} ${sc.tags ? (Array.isArray(sc.tags) ? sc.tags.join(' ') : sc.tags) : ''} ${sc.status || ''}`)
  );
  const mContacts = contacts.filter(c =>
    overlaps(toks, `${c.name || ''} ${c.title || ''} ${c.full_name || ''} ${c.role || ''} ${c.org || ''} ${c.organization || ''} ${c.department || ''} ${c.email || ''} ${c.description || ''} ${c.tags ? (Array.isArray(c.tags) ? c.tags.join(' ') : c.tags) : ''} ${c.category || ''}`)
  );

  const sourceCount = [mBrainNodes.length > 0, mTasks.length > 0, mScenarios.length > 0, mContacts.length > 0].filter(Boolean).length;

  let cls;
  if (sourceCount >= 4)       cls = 'AUTHORITATIVE';
  else if (sourceCount >= 2)  cls = 'GROUNDED';
  else if (sourceCount >= 1)  cls = 'ACTIVE';
  else                        cls = 'SHADOW';

  return { d, cls, mBrainNodes, mTasks, mScenarios, mContacts };
}

export default function DatasetBrainTaskScenarioContactAuthorityNetwork() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [rows,       setRows]       = useState([]);
  const [err,        setErr]        = useState(null);
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const brainCount    = rows.reduce((n, r) => n + r.mBrainNodes.length, 0);
  const taskCount     = rows.reduce((n, r) => n + r.mTasks.length,     0);
  const scenarioCount = rows.reduce((n, r) => n + r.mScenarios.length, 0);
  const contactCount  = rows.reduce((n, r) => n + r.mContacts.length,  0);

  const counts = {
    AUTHORITATIVE: rows.filter(r => r.cls === 'AUTHORITATIVE').length,
    GROUNDED:      rows.filter(r => r.cls === 'GROUNDED').length,
    ACTIVE:        rows.filter(r => r.cls === 'ACTIVE').length,
    SHADOW:        rows.filter(r => r.cls === 'SHADOW').length,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [datasetRaw, brainRaw, taskRaw, scenarioRaw, contactRaw] = await Promise.all([
        fetcher('/v1/datasets'),
        fetcher('/v1/cinematic/brain'),
        fetcher('/entities/Task'),
        fetcher('/v1/scenario/list'),
        fetcher('/entities/Contact'),
      ]);

      const datasets   = normalizeArray(datasetRaw,  ['datasets', 'data', 'items', 'results']);
      const brainNodes = normalizeArray(brainRaw,    ['nodes', 'entities', 'data', 'items', 'results']);
      const tasks      = normalizeArray(taskRaw,     ['tasks', 'data', 'items', 'results']);
      const scenarios  = normalizeArray(scenarioRaw, ['scenarios', 'data', 'items', 'results']);
      const contacts   = normalizeArray(contactRaw,  ['contacts', 'data', 'items', 'results']);

      setRows(datasets.map(d => classifyDataset(d, brainNodes, tasks, scenarios, contacts)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:dbtscn-toggle', handler);
    return () => window.removeEventListener('jarvis:dbtscn-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return datasetLabel(r.d).toLowerCase().includes(s) ||
             (r.d.category || r.d.type || r.d.domain || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Datasets: ${rows.length}. Authoritative: ${counts.AUTHORITATIVE}. Grounded: ${counts.GROUNDED}. Active: ${counts.ACTIVE}. Shadow: ${counts.SHADOW}.`;
    const prompt = `JARVIS dataset intelligence authority network audit: ${summary}. Identify the most critical SHADOW datasets — unanchored datasets with no brain model grounding, no task, no runnable scenario, and no contact owner — representing full operational dead weight. Provide a 2-sentence advisory on the top shadow datasets and priority actions to integrate them into the intelligence fabric across brain models, task assignments, scenario scripts, and contact ownership.`;
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
          position: 'fixed', bottom: 8, left: 123400, zIndex: 231,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #F59E0B55',
          color: '#F59E0B', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ DBTSCN</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 231, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #F59E0B33', flexShrink: 0 }}>
        <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ DBTSCN</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Dataset × Brain × Task × Scenario × Contact — Intelligence Authority Network (5-source)</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #F59E0B55', color: '#F59E0B', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'DATASETS',      val: rows.length,            color: '#94a3b8' },
          { label: 'BRAIN',         val: brainCount,             color: '#A78BFA' },
          { label: 'TASKS',         val: taskCount,              color: '#3B82F6' },
          { label: 'SCENARIOS',     val: scenarioCount,          color: '#22D3EE' },
          { label: 'CONTACTS',      val: contactCount,           color: '#34D399' },
          { label: 'AUTHORITATIVE', val: counts.AUTHORITATIVE,   color: CLS_COLOR.AUTHORITATIVE },
          { label: 'GROUNDED',      val: counts.GROUNDED,        color: CLS_COLOR.GROUNDED },
          { label: 'ACTIVE',        val: counts.ACTIVE,          color: CLS_COLOR.ACTIVE },
          { label: 'SHADOW',        val: counts.SHADOW,          color: '#F59E0B', pulse: counts.SHADOW > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 88, textAlign: 'center',
            animation: pulse ? 'dbtscn-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B44', borderRadius: 5, fontSize: 11, color: '#fde68a', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#F59E0B22' : 'none',
            border: `1px solid ${tab === t ? '#F59E0B' : '#1e293b'}`,
            color: tab === t ? '#F59E0B' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search datasets…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 200 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          const dotColor = CLS_COLOR[r.cls];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${dotColor}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {datasetLabel(r.d)}
                </span>
                {(r.d.row_count !== undefined || r.d.rows !== undefined || r.d.count !== undefined) && (
                  <span style={{ background: '#010a1a', border: '1px solid #1e3a5f', color: '#3B82F6', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {(r.d.row_count ?? r.d.rows ?? r.d.count).toLocaleString()} rows
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: dotColor, letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${dotColor}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mBrainNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({r.mBrainNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mBrainNodes.slice(0, 8).map((g, k) => (
                          <span key={k} style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#A78BFA', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {g.label || g.name || g.id}
                            {(g.score !== undefined || g.centrality !== undefined) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(g.score ?? g.centrality ?? '').toString().slice(0, 5)}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mTasks.length > 0 && (
                    <div>
                      <div style={{ color: '#3B82F6', fontSize: 10, marginBottom: 3 }}>TASKS ({r.mTasks.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mTasks.slice(0, 8).map((t, k) => (
                          <span key={k} style={{ background: '#010815', border: '1px solid #1e3a5f', color: '#3B82F6', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {t.title || t.name || t.id}
                            {(t.status || t.state) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{t.status || t.state}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mScenarios.length > 0 && (
                    <div>
                      <div style={{ color: '#22D3EE', fontSize: 10, marginBottom: 3 }}>SCENARIOS ({r.mScenarios.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mScenarios.slice(0, 8).map((sc, k) => (
                          <span key={k} style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {sc.title || sc.name || sc.id}
                            {(sc.status || sc.state) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{sc.status || sc.state}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#34D399', fontSize: 10, marginBottom: 3 }}>CONTACTS ({r.mContacts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mContacts.slice(0, 8).map((c, k) => (
                          <span key={k} style={{ background: '#031010', border: '1px solid #065f46', color: '#34D399', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {c.name || c.title || c.full_name || c.id}
                            {(c.role || c.org || c.organization) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{c.role || c.org || c.organization}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mBrainNodes.length === 0 && r.mTasks.length === 0 && r.mScenarios.length === 0 && r.mContacts.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No brain model grounding, no task assignment, no runnable scenario, no contact owner — operational dead weight with zero intelligence authority.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes dbtscn-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
