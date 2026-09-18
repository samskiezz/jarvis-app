/**
 * F54 — Task × Investigation Alignment (TINA)
 *
 * Parallel-fetches /entities/Task + /v1/investigations
 * then keyword-correlates each task against open investigations to classify:
 *   ALIGNED  — task keywords match at least one open investigation
 *   ORPHAN   — no investigation coverage (gap)
 *
 * Stat tiles:  tasks / investigations / aligned / orphan
 * Filter tabs: ALL | ALIGNED | ORPHAN
 * Text search: across task title / description.
 * Expand row → matched investigation cards with relevance score.
 * Red badge on orphan count.
 * ▶ ASSESS: 2-sentence task-alignment brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ TINA  at left:1080 bottom:18, zIndex:68.
 * Event:   jarvis:tina-toggle
 * Voice:   "task alignment" / "orphan tasks" / "tina" / "task investigation"
 *          / "unaligned tasks" / "task coverage" / "task mission gap"
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

const BTN_LEFT   = 1080;
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

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t, i) => ({
    id:          String(t.id ?? t.task_id ?? i),
    title:       t.title ?? t.name ?? t.subject ?? `Task ${i + 1}`,
    description: [t.description, t.objective, t.status, t.priority, t.type, t.tags]
                   .filter(Boolean).join(" "),
    status:      t.status ?? "unknown",
    priority:    t.priority ?? "",
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv, i) => ({
    id:          String(inv.id ?? inv.investigation_id ?? i),
    title:       inv.title ?? inv.name ?? inv.subject ?? `Investigation ${i + 1}`,
    description: [inv.description, inv.subject, inv.kind, inv.type, inv.status]
                   .filter(Boolean).join(" "),
    status:      inv.status ?? "open",
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
  const [tRes, iRes] = await Promise.all([
    fetch(`${base}/entities/Task`,        { headers: hdr }),
    fetch(`${base}/v1/investigations`,    { headers: hdr }),
  ]);
  return {
    tasks:          normaliseTasks(await tRes.json()),
    investigations: normaliseInvestigations(await iRes.json()),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(tasks, investigations) {
  return tasks.map(task => {
    const kws = buildKeywords([task.title, task.description]);
    const matched = investigations
      .map(inv => ({ inv, score: scoreMatch(kws, `${inv.title} ${inv.description}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...task, matched, classification: matched.length > 0 ? "ALIGNED" : "ORPHAN" };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const TINA_RE =
  /\b(tina|task[\s_-]?(alignment|investigation|mission\s+gap|coverage|orphan)|orphan[\s_-]?task[s]?|unaligned[\s_-]?task[s]?|task[\s_-]?mission[\s_-]?gap|task[\s_-]?case[\s_-]?(link|match|gap)|which[\s_-]?task[s]?[\s_-]?(have|match|align)|task[\s_-]?(coverage|link|blind))\b/i;

export function isTinaQuery(q) { return TINA_RE.test(q); }

export async function buildTinaScript() {
  try {
    const { tasks, investigations } = await fetchAll();
    const rows    = correlate(tasks, investigations);
    const aligned = rows.filter(r => r.classification === "ALIGNED").length;
    const orphan  = rows.filter(r => r.classification === "ORPHAN").length;
    const prompt  = (
      `Task investigation alignment: ${tasks.length} tasks cross-referenced against ` +
      `${investigations.length} open investigations. ` +
      `${aligned} tasks are aligned to active cases; ${orphan} are orphan tasks with no investigative coverage. ` +
      `Provide a 2-sentence operational assessment and flag the highest-risk orphan tasks.`
    );
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    return data.response ?? data.reply ?? data.message ?? `${aligned} tasks aligned, ${orphan} orphaned across ${investigations.length} investigations.`;
  } catch {
    return "Task investigation alignment data unavailable.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "ALIGNED", "ORPHAN"];

export default function TaskInvestigationAlignment() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [invCount,  setInvCount]  = useState(0);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { tasks, investigations } = await fetchAll();
      setRows(correlate(tasks, investigations));
      setInvCount(investigations.length);
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

  // listen for jarvis:tina-toggle event
  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:tina-toggle", handler);
    return () => window.removeEventListener("jarvis:tina-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildTinaScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const aligned = rows.filter(r => r.classification === "ALIGNED").length;
  const orphan  = rows.filter(r => r.classification === "ORPHAN").length;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
  });

  // ── toggle button ──────────────────────────────────────────────────────────
  const toggleBtn = (
    <button
      onClick={() => setOpen(v => !v)}
      title="Task × Investigation Alignment (TINA)"
      style={{
        position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
        background: open ? CY : "rgba(41,231,255,0.10)",
        border: `1px solid ${CY}`,
        color: open ? "#000" : CY,
        fontFamily: MONO, fontSize: 9, fontWeight: 700,
        padding: "3px 7px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        display: "flex", alignItems: "center", gap: 4,
      }}
    >
      ◈ TINA
      {orphan > 0 && (
        <span style={{
          background: RED, color: "#fff", borderRadius: 8,
          fontSize: 8, padding: "1px 4px", fontWeight: 900,
        }}>{orphan}</span>
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
          background: BG, border: `1px solid ${CY}33`,
          borderRadius: 8, display: "flex", flexDirection: "column",
          fontFamily: MONO, color: CY, overflow: "hidden",
        }}>
          {/* header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            background: "rgba(41,231,255,0.04)",
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>
              ◈ TASK × INVESTIGATION ALIGNMENT
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={assess} disabled={assessing} style={{
                background: "transparent", border: `1px solid ${CY}66`,
                color: CY, fontFamily: MONO, fontSize: 9, padding: "2px 8px",
                borderRadius: 3, cursor: "pointer",
              }}>
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button onClick={load} style={{
                background: "transparent", border: `1px solid ${CY}44`,
                color: CY, fontFamily: MONO, fontSize: 9, padding: "2px 6px",
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
            gap: 1, background: `${CY}11`, margin: "10px 14px 6px",
            borderRadius: 4, overflow: "hidden",
          }}>
            {[
              { label: "TASKS",   value: rows.length,  color: CY    },
              { label: "INV",     value: invCount,     color: AMBER  },
              { label: "ALIGNED", value: aligned,      color: GREEN  },
              { label: "ORPHAN",  value: orphan,       color: RED    },
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
                background:   filter === f ? CY : "transparent",
                color:        filter === f ? "#000" : MUTED,
                border:       `1px solid ${filter === f ? CY : MUTED + "44"}`,
                fontFamily:   MONO, fontSize: 8, padding: "2px 8px",
                borderRadius: 3, cursor: "pointer", fontWeight: filter === f ? 700 : 400,
              }}>{f}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                flex: 1, background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
                color: CY, fontFamily: MONO, fontSize: 9, padding: "3px 8px",
                borderRadius: 3, outline: "none",
              }}
            />
          </div>

          {/* error / loading */}
          {error && (
            <div style={{ color: RED, fontSize: 9, padding: "4px 14px" }}>
              Error: {error}
            </div>
          )}

          {/* rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 14px" }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: MUTED, fontSize: 9, textAlign: "center", paddingTop: 24 }}>
                No tasks match current filter.
              </div>
            )}
            {visible.map(row => {
              const isExp  = expanded === row.id;
              const isOrph = row.classification === "ORPHAN";
              const barPct = row.matched.length
                ? Math.min(100, (row.matched[0]?.score ?? 0) * 10)
                : 0;
              return (
                <div key={row.id} style={{
                  background:    isExp ? "rgba(41,231,255,0.06)" : "rgba(41,231,255,0.02)",
                  border:        `1px solid ${isOrph ? RED + "44" : CY + "22"}`,
                  borderRadius:  4, marginBottom: 4, overflow: "hidden",
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
                        color:    isOrph ? RED : GREEN,
                        border:   `1px solid ${isOrph ? RED + "66" : GREEN + "66"}`,
                        padding:  "1px 5px", borderRadius: 2, whiteSpace: "nowrap",
                      }}>
                        {row.classification}
                      </span>
                      <span style={{ fontSize: 9, color: CY, fontWeight: 600 }}>
                        {row.title}
                      </span>
                      {row.status && (
                        <span style={{ fontSize: 7, color: MUTED }}>
                          [{row.status}]
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {row.matched.length > 0 && (
                        <span style={{ fontSize: 8, color: AMBER }}>
                          {row.matched.length} inv
                        </span>
                      )}
                      {/* relevance bar */}
                      <div style={{ width: 60, height: 4, background: "rgba(41,231,255,0.1)", borderRadius: 2 }}>
                        <div style={{
                          width: `${barPct}%`, height: "100%",
                          background: isOrph ? RED : GREEN, borderRadius: 2,
                        }} />
                      </div>
                      <span style={{ color: MUTED, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* expanded detail */}
                  {isExp && (
                    <div style={{ padding: "0 10px 10px", borderTop: `1px solid ${CY}11` }}>
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
                          No matching investigations — this task is an orphan.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {row.matched.map(({ inv, score }) => (
                            <div key={inv.id} style={{
                              background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}1a`,
                              borderRadius: 3, padding: "5px 8px",
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                            }}>
                              <div>
                                <div style={{ fontSize: 8, color: CY, fontWeight: 600 }}>{inv.title}</div>
                                {inv.status && (
                                  <div style={{ fontSize: 7, color: MUTED, marginTop: 1 }}>[{inv.status}]</div>
                                )}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 7, color: AMBER }}>score {score}</span>
                                <div style={{ width: 40, height: 3, background: "rgba(41,231,255,0.1)", borderRadius: 2 }}>
                                  <div style={{
                                    width: `${Math.min(100, score * 10)}%`, height: "100%",
                                    background: CY, borderRadius: 2,
                                  }} />
                                </div>
                              </div>
                            </div>
                          ))}
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
