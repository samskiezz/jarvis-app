/**
 * F72 — Dataset × Task Data Consumption (DTCON)
 *
 * Parallel-fetches /v1/datasets + /entities/Task, then keyword-correlates
 * each dataset in the catalog against open tasks to classify:
 *   CONSUMING — at least one task references this dataset's domain
 *   IDLE      — no task is consuming or referencing this dataset
 *
 * Stat tiles:  datasets / tasks / consuming / idle
 * Filter tabs: ALL | CONSUMING | IDLE
 * Text search: across dataset name / description.
 * Expand row → matched task cards with status badge + relevance score bar.
 * Amber badge on idle count.
 * ▶ ASSESS: 2-sentence data-utilisation brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ DTCON  at left:19640 bottom:18, zIndex:76.
 * Event:   jarvis:dtcon-toggle
 * Voice:   "dataset task" / "task data" / "dtcon"
 *          / "idle datasets" / "consuming datasets" / "data utilization"
 *          / "dataset utilisation" / "which datasets are used"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 19640;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d, i) => ({
    id:          String(d.id ?? d.dataset_id ?? i),
    name:        d.name ?? d.dataset_name ?? d.title ?? `Dataset ${i + 1}`,
    description: [d.description, d.category, d.type, d.tags, d.domain, d.source]
                   .filter(Boolean).join(" "),
    rows:        d.row_count ?? d.rows ?? d.count ?? null,
  }));
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t, i) => ({
    id:     String(t.id ?? t.task_id ?? i),
    name:   t.name ?? t.title ?? t.subject ?? `Task ${i + 1}`,
    status: t.status ?? t.state ?? "",
    body:   [t.description, t.details, t.notes, t.context, t.objective, t.data_sources]
              .filter(Boolean).join(" ").slice(0, 400),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, haystack) {
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const kw of keywords) if (h.includes(kw)) hits++;
  return hits;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [dRes, tRes] = await Promise.all([
    fetch(`${base}/v1/datasets`,     { headers: hdr }),
    fetch(`${base}/entities/Task`,   { headers: hdr }),
  ]);
  return {
    datasets: normaliseDatasets(await dRes.json()),
    tasks:    normaliseTasks(await tRes.json()),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(datasets, tasks) {
  return datasets.map(ds => {
    const kws = buildKeywords([ds.name, ds.description]);
    const matched = tasks
      .map(task => ({
        task,
        score: scoreMatch(kws, `${task.name} ${task.body}`),
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return {
      ...ds,
      matched,
      classification: matched.length > 0 ? "CONSUMING" : "IDLE",
    };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const DTCON_RE =
  /\b(dtcon|dataset[\s_-]?task[s]?|task[\s_-]?data(set[s]?)?|idle[\s_-]?dataset[s]?|consuming[\s_-]?dataset[s]?|data[\s_-]?utili[sz]ation|dataset[\s_-]?util|which[\s_-]?dataset[s]?[\s_-]?are[\s_-]?used|unused[\s_-]?dataset[s]?|data[\s_-]?consumption|dataset[\s_-]?usage)\b/i;

export function isDtconQuery(q) { return DTCON_RE.test(q); }

export async function buildDtconScript() {
  try {
    const { datasets, tasks } = await fetchAll();
    const rows      = correlate(datasets, tasks);
    const consuming = rows.filter(r => r.classification === "CONSUMING").length;
    const idle      = rows.filter(r => r.classification === "IDLE").length;
    const prompt =
      `Dataset data-consumption analysis: ${datasets.length} datasets in the catalog cross-referenced against ` +
      `${tasks.length} open tasks. ` +
      `${consuming} datasets are actively consumed — referenced by at least one task. ` +
      `${idle} datasets are idle — no task in the system references their domain. ` +
      `Provide a 2-sentence operational assessment and flag the most critical idle datasets that should be utilised.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    return (
      data.response ?? data.reply ?? data.message ??
      `${consuming} datasets consuming, ${idle} idle across ${tasks.length} tasks.`
    );
  } catch {
    return "Dataset task consumption data unavailable.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "CONSUMING", "IDLE"];

export default function DatasetTaskConsumption() {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState([]);
  const [taskCount,  setTaskCount]  = useState(0);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { datasets, tasks } = await fetchAll();
      setRows(correlate(datasets, tasks));
      setTaskCount(tasks.length);
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:dtcon-toggle", handler);
    return () => window.removeEventListener("jarvis:dtcon-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildDtconScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const consuming = rows.filter(r => r.classification === "CONSUMING").length;
  const idle      = rows.filter(r => r.classification === "IDLE").length;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
  });

  // ── toggle button ──────────────────────────────────────────────────────────
  const toggleBtn = (
    <button
      onClick={() => setOpen(v => !v)}
      title="Dataset × Task Data Consumption (DTCON)"
      style={{
        position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 76,
        background: open ? AMBER : "rgba(245,166,35,0.10)",
        border: `1px solid ${AMBER}`,
        color: open ? "#000" : AMBER,
        fontFamily: MONO, fontSize: 9, fontWeight: 700,
        padding: "3px 7px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        display: "flex", alignItems: "center", gap: 4,
      }}
    >
      ◈ DTCON
      {idle > 0 && (
        <span style={{
          background: AMBER, color: "#000", borderRadius: 8,
          fontSize: 8, padding: "1px 4px", fontWeight: 900,
        }}>{idle}</span>
      )}
    </button>
  );

  if (!open) return toggleBtn;

  // ── panel ─────────────────────────────────────────────────────────────────
  return (
    <>
      {toggleBtn}
      <div style={{
        position: "fixed", inset: 0, zIndex: 210,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: "min(860px,96vw)", maxHeight: "88vh",
          background: BG, border: `1px solid ${AMBER}33`,
          borderRadius: 8, display: "flex", flexDirection: "column",
          fontFamily: MONO, color: AMBER, overflow: "hidden",
        }}>
          {/* header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: `1px solid ${AMBER}22`,
            background: "rgba(245,166,35,0.04)",
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>
              ◈ DATASET × TASK DATA CONSUMPTION
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={assess} disabled={assessing} style={{
                background: "transparent", border: `1px solid ${AMBER}66`,
                color: AMBER, fontFamily: MONO, fontSize: 9, padding: "2px 8px",
                borderRadius: 3, cursor: "pointer",
              }}>
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button onClick={load} style={{
                background: "transparent", border: `1px solid ${AMBER}44`,
                color: AMBER, fontFamily: MONO, fontSize: 9, padding: "2px 6px",
                borderRadius: 3, cursor: "pointer",
              }}>↺</button>
              <button onClick={() => setOpen(false)} style={{
                background: "transparent", border: "none",
                color: MUTED, fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 1, background: `${AMBER}11`, margin: "10px 14px 6px",
            borderRadius: 4, overflow: "hidden",
          }}>
            {[
              { label: "DATASETS",   value: rows.length, color: AMBER  },
              { label: "TASKS",      value: taskCount,   color: CY     },
              { label: "CONSUMING",  value: consuming,   color: GREEN  },
              { label: "IDLE",       value: idle,        color: RED    },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "rgba(4,7,14,0.85)", padding: "8px 10px", textAlign: "center",
              }}>
                <div style={{ fontSize: 18, fontWeight: 900, color }}>{loading ? "…" : value}</div>
                <div style={{ fontSize: 8, color: MUTED, letterSpacing: 1.5 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter + search */}
          <div style={{ display: "flex", gap: 8, padding: "4px 14px 8px", alignItems: "center" }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background:   filter === f ? AMBER : "transparent",
                color:        filter === f ? "#000" : MUTED,
                border:       `1px solid ${filter === f ? AMBER : MUTED + "44"}`,
                fontFamily:   MONO, fontSize: 8, padding: "2px 8px",
                borderRadius: 3, cursor: "pointer", fontWeight: filter === f ? 700 : 400,
              }}>{f}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search datasets…"
              style={{
                flex: 1, background: "rgba(245,166,35,0.06)", border: `1px solid ${AMBER}33`,
                color: AMBER, fontFamily: MONO, fontSize: 9, padding: "3px 8px",
                borderRadius: 3, outline: "none",
              }}
            />
          </div>

          {/* error */}
          {error && (
            <div style={{ color: RED, fontSize: 9, padding: "4px 14px" }}>
              Error: {error}
            </div>
          )}

          {/* rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 14px" }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: MUTED, fontSize: 9, textAlign: "center", paddingTop: 24 }}>
                No datasets match current filter.
              </div>
            )}
            {visible.map(row => {
              const isExp   = expanded === row.id;
              const isIdle  = row.classification === "IDLE";
              const topScore = row.matched[0]?.score ?? 0;
              const barPct  = Math.min(100, topScore * 10);
              return (
                <div key={row.id} style={{
                  background:   isExp ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.02)",
                  border:       `1px solid ${isIdle ? RED + "44" : GREEN + "33"}`,
                  borderRadius: 4, marginBottom: 4, overflow: "hidden",
                }}>
                  {/* row header */}
                  <div
                    onClick={() => setExpanded(isExp ? null : row.id)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "7px 10px", cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: 1,
                        color:   isIdle ? RED : GREEN,
                        border:  `1px solid ${isIdle ? RED + "66" : GREEN + "66"}`,
                        padding: "1px 5px", borderRadius: 2, whiteSpace: "nowrap",
                      }}>
                        {row.classification}
                      </span>
                      <span style={{ fontSize: 9, color: AMBER, fontWeight: 600 }}>
                        {row.name}
                      </span>
                      {row.rows != null && (
                        <span style={{ fontSize: 7, color: MUTED }}>
                          [{row.rows.toLocaleString()} rows]
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {row.matched.length > 0 && (
                        <span style={{ fontSize: 8, color: CY }}>
                          {row.matched.length} task{row.matched.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      <div style={{ width: 60, height: 4, background: "rgba(245,166,35,0.1)", borderRadius: 2 }}>
                        <div style={{
                          width: `${barPct}%`, height: "100%",
                          background: isIdle ? RED : GREEN, borderRadius: 2,
                        }} />
                      </div>
                      <span style={{ color: MUTED, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* expanded detail */}
                  {isExp && (
                    <div style={{ padding: "0 10px 10px", borderTop: `1px solid ${AMBER}11` }}>
                      {row.description && (
                        <div style={{ fontSize: 8, color: MUTED, marginBottom: 8, marginTop: 6 }}>
                          {row.description.slice(0, 200)}
                        </div>
                      )}
                      {row.matched.length === 0 ? (
                        <div style={{
                          fontSize: 8, color: RED, padding: "6px 8px",
                          background: "rgba(255,59,107,0.06)", borderRadius: 3,
                        }}>
                          No tasks consume this dataset — it is idle and may be redundant or under-utilised.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {row.matched.map(({ task, score }) => {
                            const statusColor =
                              /done|complete|closed/i.test(task.status) ? GREEN :
                              /fail|block|critical/i.test(task.status) ? RED : CY;
                            return (
                              <div key={task.id} style={{
                                background: "rgba(245,166,35,0.04)", border: `1px solid ${AMBER}1a`,
                                borderRadius: 3, padding: "5px 8px",
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                              }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 8, color: AMBER, fontWeight: 600 }}>{task.name}</div>
                                  {task.status && (
                                    <span style={{
                                      fontSize: 7, color: statusColor,
                                      border: `1px solid ${statusColor}44`, borderRadius: 2,
                                      padding: "0 3px", marginTop: 2, display: "inline-block",
                                    }}>{task.status}</span>
                                  )}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                  <span style={{ fontSize: 7, color: GREEN }}>score {score}</span>
                                  <div style={{ width: 40, height: 3, background: "rgba(245,166,35,0.1)", borderRadius: 2 }}>
                                    <div style={{
                                      width: `${Math.min(100, score * 10)}%`, height: "100%",
                                      background: AMBER, borderRadius: 2,
                                    }} />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
