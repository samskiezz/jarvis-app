/**
 * F443 — Task × Graph Communities Intelligence Bridge (TGCIB)
 *
 * Answers: "Which tasks are represented inside a graph community cluster —
 * and which tasks are completely isolated from the influence graph?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Task              → task backlog
 *   GET /v1/graph/communities       → graph cluster partition
 *
 * Classification:
 *   CLUSTERED  — task name/description matches ≥1 graph cluster member ID
 *   ISOLATED   — no cluster match (task has no graph footprint)
 *
 * Stat tiles:  tasks / clusters / clustered / isolated
 * Amber badge: isolated count on button
 * Expand row:  matched clusters with member count + relevance bar (max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ TGCIB  at left:7680 bottom:18, zIndex:68
 * Event:   jarvis:tgcib-toggle
 * Voice:   "task community / graph task community / tgcib / clustered tasks /
 *           isolated tasks / task cluster / task graph community / task graph bridge"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

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

const FILTERS = ['ALL', 'CLUSTERED', 'ISOLATED'];
const CLASS_COLOR = { CLUSTERED: GR, ISOLATED: AM };
const CLASS_LABEL = { CLUSTERED: 'CLUSTERED', ISOLATED: 'ISOLATED' };

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const TGCIB_RE =
  /\b(task[._-]?community|graph[._-]?task[._-]?community|tgcib|clustered[._-]?tasks|isolated[._-]?tasks|task[._-]?cluster|task[._-]?graph[._-]?community|task[._-]?graph[._-]?bridge)\b/i;

export function isTgcibQuery(t) {
  return TGCIB_RE.test(t || '');
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function keywords(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function relevanceScore(taskKw, clusterText) {
  const ck = keywords(clusterText);
  return taskKw.filter(w => ck.includes(w)).length;
}

async function fetchJson(path) {
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}

async function loadAll() {
  const [tasksRaw, commRaw] = await Promise.all([
    fetchJson('/entities/Task'),
    fetchJson('/v1/graph/communities'),
  ]);

  const tasks = Array.isArray(tasksRaw)
    ? tasksRaw
    : Array.isArray(tasksRaw?.items)
      ? tasksRaw.items
      : Array.isArray(tasksRaw?.data)
        ? tasksRaw.data
        : [];

  // communities may be { partition: [...] } or an array directly
  const clusters = Array.isArray(commRaw)
    ? commRaw
    : Array.isArray(commRaw?.partition)
      ? commRaw.partition
      : Array.isArray(commRaw?.communities)
        ? commRaw.communities
        : Array.isArray(commRaw?.data)
          ? commRaw.data
          : [];

  // For each cluster, build a string of all member node IDs + cluster metadata
  const enrichedClusters = clusters.map((c, i) => {
    const members = Array.isArray(c.members) ? c.members : Array.isArray(c.nodes) ? c.nodes : [];
    const memberStr = members.join(' ');
    return {
      id: c.id ?? c.cluster_id ?? `cluster-${i}`,
      memberCount: members.length,
      members,
      text: `${c.id ?? ''} ${c.label ?? ''} ${memberStr}`,
    };
  });

  const rows = tasks.map(t => {
    const taskKw = keywords(`${t.name ?? ''} ${t.title ?? ''} ${t.description ?? ''} ${(t.tags ?? []).join(' ')}`);
    const matched = enrichedClusters
      .map(c => ({ ...c, score: relevanceScore(taskKw, c.text) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const cls = matched.length > 0 ? 'CLUSTERED' : 'ISOLATED';
    return {
      id: t.id ?? t._id ?? t.name,
      name: t.name ?? t.title ?? 'Unnamed Task',
      status: t.status ?? 'unknown',
      priority: t.priority ?? '',
      description: t.description ?? '',
      cls,
      matched,
    };
  });

  return { rows, clusterCount: enrichedClusters.length };
}

export async function buildTgcibScript() {
  try {
    const { rows, clusterCount } = await loadAll();
    const clustered = rows.filter(r => r.cls === 'CLUSTERED').length;
    const isolated  = rows.filter(r => r.cls === 'ISOLATED').length;
    const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Task × Graph Community Bridge (TGCIB) analysis: ${rows.length} tasks assessed against ${clusterCount} graph communities. Clustered: ${clustered}, Isolated: ${isolated}. Top isolated tasks: ${rows.filter(r => r.cls === 'ISOLATED').slice(0, 3).map(r => r.name).join(', ')}. Provide a 2-sentence operational brief on task-graph alignment and which gaps need attention.`,
      }),
    });
    const j = await r.json();
    return j?.response ?? j?.message ?? `TGCIB: ${clustered}/${rows.length} tasks are graph-clustered; ${isolated} are isolated. Review isolated tasks for graph coverage gaps.`;
  } catch {
    return 'TGCIB: Unable to generate assessment — check endpoint connectivity.';
  }
}

// ─── component ───────────────────────────────────────────────────────────────
export default function TaskGraphCommunityBridge() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [rows, setRows]       = useState([]);
  const [clusterCount, setClusterCount] = useState(0);
  const [filter, setFilter]   = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await loadAll();
      setRows(result.rows);
      setClusterCount(result.clusterCount);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:tgcib-toggle', handler);
    return () => window.removeEventListener('jarvis:tgcib-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setAssessment('');
    const script = await buildTgcibScript();
    setAssessment(script);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    setAssessing(false);
  }, []);

  if (!open) {
    const isolated = rows.filter(r => r.cls === 'ISOLATED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 7680, bottom: 18, zIndex: 68,
          background: BG, border: `1px solid ${BD}`, color: AM,
          fontFamily: MONO, fontSize: 10, padding: '3px 7px',
          borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        }}
        title="Task × Graph Communities Bridge (TGCIB)"
      >
        ◈ TGCIB
        {isolated > 0 && (
          <span style={{
            background: AM, color: '#000', borderRadius: 10,
            padding: '0 5px', fontSize: 9, fontWeight: 700,
          }}>{isolated}</span>
        )}
      </button>
    );
  }

  // apply filter + search
  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
    }
    return true;
  });

  const clustered = rows.filter(r => r.cls === 'CLUSTERED').length;
  const isolated  = rows.filter(r => r.cls === 'ISOLATED').length;

  const STAT_W = { minWidth: 80, textAlign: 'center', padding: '6px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 4, border: `1px solid ${BD}` };
  const TAB_S = (active) => ({
    padding: '3px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 10, fontFamily: MONO,
    border: `1px solid ${active ? CY : BD}`, color: active ? CY : MU,
    background: active ? 'rgba(6,182,212,0.08)' : 'transparent',
  });

  return (
    <div style={{
      position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      width: 640, maxHeight: '72vh', zIndex: 68,
      background: BG, border: `1px solid ${BD}`, borderRadius: 8,
      fontFamily: MONO, color: '#e2e8f0', display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${BD}`, gap: 8 }}>
        <span style={{ color: CY, fontSize: 12, fontWeight: 700, flex: 1 }}>◈ TASK × GRAPH COMMUNITY BRIDGE</span>
        <button onClick={load} disabled={loading} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 11 }}>⟳</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'TASKS', value: rows.length, color: CY },
          { label: 'CLUSTERS', value: clusterCount, color: MU },
          { label: 'CLUSTERED', value: clustered, color: GR },
          { label: 'ISOLATED', value: isolated, color: AM },
        ].map(s => (
          <div key={s.label} style={STAT_W}>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{loading ? '…' : s.value}</div>
            <div style={{ fontSize: 9, color: MU }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* proportional coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 14px 6px' }}>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${(clustered / rows.length) * 100}%`, background: GR }} />
            <div style={{ width: `${(isolated / rows.length) * 100}%`, background: AM }} />
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 9, color: MU, marginTop: 3 }}>
            <span style={{ color: GR }}>■ CLUSTERED</span>
            <span style={{ color: AM }}>■ ISOLATED</span>
          </div>
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 5, padding: '0 14px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={TAB_S(filter === f)}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            marginLeft: 'auto', padding: '3px 8px', borderRadius: 4, fontSize: 10,
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, color: '#e2e8f0',
            fontFamily: MONO, width: 140,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 8px' }}>
        {error && <div style={{ color: RD, fontSize: 11, padding: 8 }}>Error: {error}</div>}
        {loading && rows.length === 0 && <div style={{ color: MU, fontSize: 11, padding: 8 }}>Loading…</div>}
        {visible.map(r => (
          <div key={r.id} style={{ marginBottom: 4 }}>
            <div
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                background: 'rgba(255,255,255,0.03)', borderRadius: 4, cursor: 'pointer',
                border: `1px solid ${expanded === r.id ? CLASS_COLOR[r.cls] : BD}`,
              }}
            >
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 3,
                background: CLASS_COLOR[r.cls] + '22', color: CLASS_COLOR[r.cls], fontWeight: 700,
              }}>{CLASS_LABEL[r.cls]}</span>
              {r.priority && (
                <span style={{ fontSize: 9, color: MU, padding: '1px 4px', border: `1px solid ${BD}`, borderRadius: 2 }}>
                  {r.priority.toUpperCase()}
                </span>
              )}
              <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
              </span>
              <span style={{ fontSize: 9, color: MU }}>{r.matched.length} clusters</span>
              <span style={{ fontSize: 10, color: MU }}>{expanded === r.id ? '▴' : '▾'}</span>
            </div>

            {expanded === r.id && (
              <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: '0 0 4px 4px', marginTop: -1 }}>
                {r.description && (
                  <p style={{ fontSize: 10, color: MU, marginBottom: 8, lineHeight: 1.5 }}>{r.description.slice(0, 140)}{r.description.length > 140 ? '…' : ''}</p>
                )}
                {r.matched.length === 0 ? (
                  <div style={{ fontSize: 10, color: AM }}>No graph community clusters matched this task.</div>
                ) : (
                  r.matched.map(c => (
                    <div key={c.id} style={{ marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 9, color: CY, padding: '1px 4px', border: `1px solid ${CY}44`, borderRadius: 2 }}>
                          CLUSTER
                        </span>
                        <span style={{ fontSize: 10, flex: 1 }}>{c.id}</span>
                        <span style={{ fontSize: 9, color: MU }}>{c.memberCount} members</span>
                        <span style={{ fontSize: 9, color: GR }}>score {c.score}</span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${Math.min(100, c.score * 20)}%`, background: GR, borderRadius: 2 }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && !loading && (
          <div style={{ color: MU, fontSize: 11, padding: 8, textAlign: 'center' }}>No tasks match current filter.</div>
        )}
      </div>

      {/* assess */}
      <div style={{ padding: '8px 14px', borderTop: `1px solid ${BD}` }}>
        {assessment && (
          <p style={{ fontSize: 10, color: CY, marginBottom: 6, lineHeight: 1.5 }}>{assessment}</p>
        )}
        <button
          onClick={assess}
          disabled={assessing || rows.length === 0}
          style={{
            padding: '4px 12px', borderRadius: 4, cursor: assessing ? 'wait' : 'pointer',
            background: assessing ? 'transparent' : 'rgba(6,182,212,0.12)',
            border: `1px solid ${CY}`, color: CY, fontSize: 10, fontFamily: MONO,
          }}
        >
          {assessing ? '…' : '▶ ASSESS'}
        </button>
      </div>
    </div>
  );
}
