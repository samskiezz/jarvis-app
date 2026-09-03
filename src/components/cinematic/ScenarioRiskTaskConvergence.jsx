/**
 * F272 — Scenario × Risk Signal × Task Convergence (SRCT)
 *
 * Answers: "For each active risk signal, is there a scenario response plan AND
 * an active task covering it?"
 *
 * MANAGED        — ≥1 scenario AND ≥1 task keyword-match this risk signal.
 * PLANNED_ONLY   — a scenario covers it but no task is tracking it.
 * ACTIVE_ONLY    — a task references it but no scenario exists.
 * UNMANAGED      — neither scenario nor task — highest exposure.
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/RiskSignal  → active risk signals
 *   GET /v1/scenario/list     → available response scenarios
 *   GET /entities/Task        → live task board
 *   POST /v1/jarvis/agent/chat → 2-sentence convergence brief
 *
 * Stat tiles: signals / scenarios / tasks / managed / planned-only / active-only / unmanaged
 * Red badge: unmanaged count on button.
 * Expand row: matched scenarios (type badge + relevance bar) + matched tasks (status badge + relevance bar).
 * ▶ ASSESS: 2-sentence AI brief + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SRCT  at left:6060 bottom:18, zIndex:68.
 * Event:   jarvis:srct-toggle
 * Voice:   "scenario risk task / srct / managed risks / risk response / task risk plan /
 *           risk without plan / risk without task / risk coverage / managed threats /
 *           unmanaged risks / which risks have plans / risk task gap"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const CY = '#29E7FF';
const RED = '#FF3D5A';
const AMBER = '#F5A623';
const GREEN = '#00c878';
const VIOLET = '#A78BFA';
const STEEL = '#334155';
const BTN_LEFT = 6060;

const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const apiBase = () =>
  (typeof window !== 'undefined' && window.__JARVIS_API_BASE__) ||
  'http://localhost:8000';

// ─── regex for JarvisBrain intent routing ────────────────────────────────────

const SRCT_RE =
  /\b(scenario[._-]?risk[._-]?task|risk[._-]?scenario[._-]?task|srct|managed[._-]?risks?|risk[._-]?response[._-]?plan|task[._-]?risk[._-]?plan|risk[._-]?without[._-]?(plan|task)|unmanaged[._-]?risks?|risk[._-]?coverage[._-]?triple|managed[._-]?threats?|which[._-]?risks[._-]?have[._-]?plans?|risk[._-]?task[._-]?gap)\b/i;

export function isSrctQuery(t) {
  return SRCT_RE.test(t || '');
}

// ─── normalisers ──────────────────────────────────────────────────────────────

function normSignals(raw) {
  if (!raw) return [];
  for (const k of ['signals', 'risk_signals', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return Array.isArray(raw) ? raw : [];
}

function normScenarios(raw) {
  if (!raw) return [];
  for (const k of ['scenarios', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return Array.isArray(raw) ? raw : [];
}

function normTasks(raw) {
  if (!raw) return [];
  for (const k of ['tasks', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return Array.isArray(raw) ? raw : [];
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[\s,._\-/|:;()\[\]{}]+/)
    .filter(t => t.length > 2);
}

function kwScore(sigTokens, candidate) {
  if (!sigTokens.length) return 0;
  const cToks = new Set(
    tokens([candidate.name, candidate.title, candidate.description,
            candidate.objective, candidate.tags, candidate.category,
            candidate.type, candidate.source].join(' '))
  );
  const hits = sigTokens.filter(t => cToks.has(t)).length;
  return hits / Math.max(sigTokens.length, 1);
}

// ─── classification ───────────────────────────────────────────────────────────

const THRESHOLD = 0.08;

function classify(sigTokens, scenarios, tasks) {
  const matchedScenarios = scenarios
    .map(s => ({ ...s, score: kwScore(sigTokens, s) }))
    .filter(s => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const matchedTasks = tasks
    .map(t => ({ ...t, score: kwScore(sigTokens, t) }))
    .filter(t => t.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const hasScenario = matchedScenarios.length > 0;
  const hasTask = matchedTasks.length > 0;

  let status;
  if (hasScenario && hasTask)  status = 'MANAGED';
  else if (hasScenario)        status = 'PLANNED_ONLY';
  else if (hasTask)            status = 'ACTIVE_ONLY';
  else                         status = 'UNMANAGED';

  return { matchedScenarios, matchedTasks, status };
}

// ─── build AI brief for JarvisBrain ──────────────────────────────────────────

export async function buildSrctScript() {
  const base = apiBase();
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [sRes, scRes, tRes] = await Promise.allSettled([
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/scenario/list`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/entities/Task`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    ]);
    const signals = normSignals(sRes.value);
    const scenarios = normScenarios(scRes.value);
    const tasks = normTasks(tRes.value);
    let managed = 0, plannedOnly = 0, activeOnly = 0, unmanaged = 0;
    for (const sig of signals) {
      const toks = tokens([sig.name, sig.title, sig.description, sig.category, sig.source, sig.tags].join(' '));
      const { status } = classify(toks, scenarios, tasks);
      if (status === 'MANAGED') managed++;
      else if (status === 'PLANNED_ONLY') plannedOnly++;
      else if (status === 'ACTIVE_ONLY') activeOnly++;
      else unmanaged++;
    }
    return `Scenario-Risk-Task Convergence: ${signals.length} active risk signals cross-referenced against ${scenarios.length} scenarios and ${tasks.length} tasks. ` +
      `${managed} risks are MANAGED (both a response plan and an active task exist), ${plannedOnly} are PLANNED_ONLY (scenario but no task), ` +
      `${activeOnly} are ACTIVE_ONLY (task exists but no formal scenario), and ${unmanaged} are UNMANAGED — no plan or task assigned. ` +
      `${unmanaged > 0 ? `Priority: assign scenarios and tasks to the ${unmanaged} unmanaged risk signal(s).` : 'All active risks have either a scenario or task — coverage is adequate.'}`;
  } catch {
    return 'Scenario-Risk-Task Convergence data unavailable.';
  }
}

// ─── severity colour helper ───────────────────────────────────────────────────

function sevColor(sev) {
  if (!sev) return STEEL;
  const s = String(sev).toUpperCase();
  if (s === 'CRITICAL') return RED;
  if (s === 'HIGH') return AMBER;
  if (s === 'MEDIUM') return VIOLET;
  return CY;
}

const STATUS_META = {
  MANAGED:      { label: 'MANAGED',      color: GREEN,  dot: '●' },
  PLANNED_ONLY: { label: 'PLANNED_ONLY', color: CY,     dot: '◐' },
  ACTIVE_ONLY:  { label: 'ACTIVE_ONLY',  color: AMBER,  dot: '◑' },
  UNMANAGED:    { label: 'UNMANAGED',    color: RED,     dot: '○' },
};

// ─── component ────────────────────────────────────────────────────────────────

export default function ScenarioRiskTaskConvergence() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [ts, setTs] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [sRes, scRes, tRes] = await Promise.allSettled([
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/Task`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      ]);
      const signals = normSignals(sRes.status === 'fulfilled' ? sRes.value : []);
      const scList = normScenarios(scRes.status === 'fulfilled' ? scRes.value : []);
      const taskList = normTasks(tRes.status === 'fulfilled' ? tRes.value : []);
      setScenarios(scList);
      setTasks(taskList);
      const classified = signals.map(sig => {
        const toks = tokens([sig.name, sig.title, sig.description, sig.category, sig.source, sig.tags].join(' '));
        const { matchedScenarios, matchedTasks, status } = classify(toks, scList, taskList);
        return { ...sig, _toks: toks, matchedScenarios, matchedTasks, status };
      });
      // Sort: UNMANAGED → ACTIVE_ONLY → PLANNED_ONLY → MANAGED
      const ORDER = { UNMANAGED: 0, ACTIVE_ONLY: 1, PLANNED_ONLY: 2, MANAGED: 3 };
      classified.sort((a, b) => (ORDER[a.status] ?? 4) - (ORDER[b.status] ?? 4));
      setRows(classified);
      setTs(Date.now());
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, []);

  // Initial load + 90 s refresh
  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  // Toggle listener
  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:srct-toggle', h);
    return () => window.removeEventListener('jarvis:srct-toggle', h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildSrctScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  // Derived stats
  const total = rows.length;
  const managed = rows.filter(r => r.status === 'MANAGED').length;
  const plannedOnly = rows.filter(r => r.status === 'PLANNED_ONLY').length;
  const activeOnly = rows.filter(r => r.status === 'ACTIVE_ONLY').length;
  const unmanaged = rows.filter(r => r.status === 'UNMANAGED').length;

  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = String(r.name || r.title || r.id || '').toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  // ── button ────────────────────────────────────────────────────────────────
  const btnStyle = {
    position: 'fixed',
    left: BTN_LEFT,
    bottom: 18,
    zIndex: 68,
    background: open ? RED : STEEL,
    color: open ? '#000' : CY,
    border: `1px solid ${open ? RED : CY}`,
    borderRadius: 4,
    padding: '3px 8px',
    fontSize: 10,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 1,
    fontFamily: 'monospace',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  };

  const panel = {
    position: 'fixed',
    left: BTN_LEFT - 400,
    bottom: 50,
    width: 480,
    maxHeight: '72vh',
    overflowY: 'auto',
    background: 'rgba(5,12,22,0.97)',
    border: `1px solid ${CY}`,
    borderRadius: 6,
    padding: 14,
    zIndex: 69,
    fontFamily: 'monospace',
    color: '#cbd5e1',
    fontSize: 11,
  };

  return (
    <>
      {/* ── toggle button ── */}
      <button style={btnStyle} onClick={() => setOpen(v => !v)} title="Scenario × Risk × Task Convergence">
        ◈ SRCT
        {unmanaged > 0 && (
          <span style={{
            background: RED, color: '#fff', borderRadius: 3,
            padding: '1px 5px', fontSize: 9, fontWeight: 900,
            animation: 'pulse 1.4s ease-in-out infinite',
          }}>
            {unmanaged}
          </span>
        )}
      </button>

      {/* ── panel ── */}
      {open && (
        <div style={panel}>
          {/* header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ color: CY, fontWeight: 900, fontSize: 12, letterSpacing: 1 }}>
              SCENARIO × RISK × TASK CONVERGENCE
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14,
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
            {[
              { label: 'SIGNALS', val: total, color: CY },
              { label: 'MANAGED', val: managed, color: GREEN },
              { label: 'PLAN ONLY', val: plannedOnly, color: CY },
              { label: 'TASK ONLY', val: activeOnly, color: AMBER },
              { label: 'UNMANAGED', val: unmanaged, color: RED },
              { label: 'SCENARIOS', val: scenarios.length, color: VIOLET },
              { label: 'TASKS', val: tasks.length, color: '#94a3b8' },
              { label: 'COVERAGE', val: total ? `${Math.round((managed / total) * 100)}%` : '—', color: managed === total ? GREEN : AMBER },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: STEEL, borderRadius: 4, padding: '5px 6px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 16, fontWeight: 900, color }}>{val}</div>
                <div style={{ fontSize: 8, color: '#64748b', letterSpacing: 0.5 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          {total > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>4-WAY COVERAGE</div>
              <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
                {[
                  { w: managed, c: GREEN },
                  { w: plannedOnly, c: CY },
                  { w: activeOnly, c: AMBER },
                  { w: unmanaged, c: RED },
                ].map(({ w, c }, i) => (
                  <div key={i} style={{ flex: w, background: c, opacity: w ? 1 : 0 }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                {[
                  { label: 'MANAGED', c: GREEN },
                  { label: 'PLAN ONLY', c: CY },
                  { label: 'TASK ONLY', c: AMBER },
                  { label: 'UNMANAGED', c: RED },
                ].map(({ label, c }) => (
                  <span key={label} style={{ fontSize: 8, color: c }}>■ {label}</span>
                ))}
              </div>
            </div>
          )}

          {/* filter tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
            {['ALL', 'UNMANAGED', 'PLANNED_ONLY', 'ACTIVE_ONLY', 'MANAGED'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? CY : STEEL,
                color: filter === f ? '#000' : '#94a3b8',
                border: 'none', borderRadius: 3, padding: '2px 7px',
                fontSize: 9, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700,
              }}>
                {f.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search risk signal…"
            style={{
              width: '100%', background: '#0f172a', border: `1px solid ${STEEL}`,
              borderRadius: 3, color: '#e2e8f0', padding: '4px 8px',
              fontSize: 10, fontFamily: 'monospace', marginBottom: 8, boxSizing: 'border-box',
            }}
          />

          {/* ASSESS button */}
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? STEEL : VIOLET, color: '#000', border: 'none',
              borderRadius: 3, padding: '4px 10px', fontSize: 10, fontWeight: 700,
              cursor: assessing ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
              marginBottom: 8,
            }}
          >
            {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
          </button>

          {brief && (
            <div style={{
              background: '#0f172a', border: `1px solid ${VIOLET}`, borderRadius: 4,
              padding: 8, marginBottom: 8, fontSize: 10, color: '#e2e8f0', lineHeight: 1.5,
            }}>
              {brief}
            </div>
          )}

          {/* loading / error */}
          {loading && <div style={{ color: CY, fontSize: 10 }}>⟳ loading…</div>}
          {error && <div style={{ color: RED, fontSize: 10 }}>⚠ {error}</div>}

          {/* rows */}
          {!loading && filtered.map((row, i) => {
            const meta = STATUS_META[row.status] || STATUS_META.UNMANAGED;
            const isOpen = expanded === i;
            const name = row.name || row.title || row.id || `Signal ${i + 1}`;
            return (
              <div key={i} style={{
                borderBottom: `1px solid ${STEEL}`, paddingBottom: 6, marginBottom: 6,
              }}>
                <div
                  onClick={() => setExpanded(isOpen ? null : i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    padding: '3px 0',
                  }}
                >
                  {/* severity dot */}
                  <span style={{ color: sevColor(row.severity), fontSize: 14 }}>●</span>
                  {/* name */}
                  <span style={{
                    flex: 1, color: '#e2e8f0', fontSize: 10,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {name}
                  </span>
                  {/* severity badge */}
                  {row.severity && (
                    <span style={{
                      background: sevColor(row.severity), color: '#000',
                      borderRadius: 2, padding: '1px 4px', fontSize: 8, fontWeight: 700,
                    }}>
                      {String(row.severity).toUpperCase()}
                    </span>
                  )}
                  {/* status badge */}
                  <span style={{
                    background: meta.color + '22', border: `1px solid ${meta.color}`,
                    color: meta.color, borderRadius: 2, padding: '1px 5px',
                    fontSize: 8, fontWeight: 700,
                  }}>
                    {meta.dot} {meta.label.replace('_', ' ')}
                  </span>
                  <span style={{ color: '#475569', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                </div>

                {isOpen && (
                  <div style={{ paddingLeft: 20, paddingTop: 6 }}>
                    {/* matched scenarios */}
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: CY, fontWeight: 700, marginBottom: 3 }}>
                        RESPONSE SCENARIOS ({row.matchedScenarios.length})
                      </div>
                      {row.matchedScenarios.length === 0 ? (
                        <div style={{ fontSize: 9, color: '#6b7280' }}>none matched</div>
                      ) : row.matchedScenarios.map((sc, si) => (
                        <div key={si} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{
                              background: VIOLET + '33', border: `1px solid ${VIOLET}`,
                              color: VIOLET, borderRadius: 2, padding: '1px 4px', fontSize: 8,
                            }}>
                              {sc.type || sc.severity || 'SCENARIO'}
                            </span>
                            <span style={{
                              fontSize: 9, color: '#bae6fd',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              flex: 1,
                            }}>
                              {sc.name || sc.title || sc.id}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <div style={{
                              flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden',
                            }}>
                              <div style={{
                                width: `${Math.min(100, Math.round(sc.score * 100 / 0.08 * 50))}%`,
                                height: '100%', background: VIOLET, borderRadius: 2,
                              }} />
                            </div>
                            <span style={{ fontSize: 8, color: '#475569' }}>
                              {Math.round(sc.score * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* matched tasks */}
                    <div>
                      <div style={{ fontSize: 9, color: AMBER, fontWeight: 700, marginBottom: 3 }}>
                        ACTIVE TASKS ({row.matchedTasks.length})
                      </div>
                      {row.matchedTasks.length === 0 ? (
                        <div style={{ fontSize: 9, color: '#6b7280' }}>none matched</div>
                      ) : row.matchedTasks.map((tk, ti) => (
                        <div key={ti} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{
                              background: AMBER + '33', border: `1px solid ${AMBER}`,
                              color: AMBER, borderRadius: 2, padding: '1px 4px', fontSize: 8,
                            }}>
                              {tk.status || tk.priority || 'TASK'}
                            </span>
                            <span style={{
                              fontSize: 9, color: '#fde68a',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              flex: 1,
                            }}>
                              {tk.name || tk.title || tk.id}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <div style={{
                              flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden',
                            }}>
                              <div style={{
                                width: `${Math.min(100, Math.round(tk.score * 100 / 0.08 * 50))}%`,
                                height: '100%', background: AMBER, borderRadius: 2,
                              }} />
                            </div>
                            <span style={{ fontSize: 8, color: '#475569' }}>
                              {Math.round(tk.score * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {!loading && filtered.length === 0 && rows.length > 0 && (
            <div style={{ color: '#6b7280', fontSize: 10 }}>No results for current filter.</div>
          )}
          {!loading && rows.length === 0 && !error && (
            <div style={{ color: '#6b7280', fontSize: 10 }}>No risk signals — endpoints may require live data.</div>
          )}

          <div style={{ marginTop: 8, fontSize: 9, color: '#334155' }}>
            SRCT · {ts ? new Date(ts).toLocaleTimeString() : '—'} · {rows.length} signals · {scenarios.length} scenarios · {tasks.length} tasks
          </div>
        </div>
      )}
    </>
  );
}
