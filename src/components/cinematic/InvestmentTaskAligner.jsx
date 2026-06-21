/**
 * F76 — Investment × Task Aligner
 *
 * Parallel-fetches /entities/Investment and /entities/Task, then
 * keyword-correlates each investment against the task catalog to surface
 * which investments have active operational support (BACKED) vs which are
 * running without task coverage (DARK).
 *
 * Stat tiles: investments / tasks / backed / dark.
 * Filter tabs: ALL | BACKED | DARK.
 * Expand any investment → matched tasks with relevance score + status badge.
 * ▶ ASSESS: 2-sentence AI investment-operations brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ INVTASK  at bottom:8 left:9748, zIndex 69.
 * Voice:   "investment task / task investment / portfolio task / invtask / which investments have tasks"
 * Event:   jarvis:invtask-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 9748;
const POLL_MS  = 90_000;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const INVTASK_RE =
  /\b(investment\s+task|task\s+investment|portfolio\s+task|invtask|which\s+investments?\s+have\s+tasks?|task[-\s]backed\s+investments?|investment\s+operations?\s+coverage)\b/i;

export function isInvtaskQuery(q) { return INVTASK_RE.test(q); }

export async function buildInvtaskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, taskRes] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers: hdr }),
      fetch(`${base}/entities/Task`,       { headers: hdr }),
    ]);
    const investments = normaliseInvestments(await invRes.json());
    const tasks       = normaliseTasks(await taskRes.json());

    const backed = investments.filter(
      (inv) => tasks.some((t) => relevance(inv, t) > 0)
    ).length;
    const dark = investments.length - backed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS investment-task alignment: ${investments.length} investments tracked, ` +
          `${tasks.length} active tasks in catalog, ${backed} investments have at least one ` +
          `keyword-matched task providing operational support, ${dark} investments are running ` +
          `without any task coverage — potential operational blind spots. ` +
          `Give a 2-sentence investment-operations alignment brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Investment-task alignment analysis complete, sir.").trim();
  } catch {
    return "Investment-task alignment analysis is unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw)                  ? raw
    : Array.isArray(raw?.data)                   ? raw.data
    : Array.isArray(raw?.investments)            ? raw.investments
    : Array.isArray(raw?.items)                  ? raw.items
    : Array.isArray(raw?.results)                ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:     inv.id          || String(i),
    name:   inv.name        || inv.title      || inv.asset    || `Investment ${i + 1}`,
    type:   (inv.type       || inv.asset_type || inv.category || "").toString(),
    status: (inv.status     || inv.state      || "").toLowerCase(),
    desc:   (inv.description || inv.notes     || inv.sector   || inv.tags || "").toString(),
    value:  inv.value != null ? Number(inv.value) : null,
  }));
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.tasks)              ? raw.tasks
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((t, i) => ({
    id:     t.id          || String(i),
    title:  t.title       || t.name     || t.task_name || `Task ${i + 1}`,
    status: (t.status     || t.state    || "").toLowerCase(),
    desc:   (t.description || t.summary || t.tags || "").toString(),
  }));
}

function invKeywords(inv) {
  return String(`${inv.name} ${inv.type} ${inv.desc}`)
    .toLowerCase()
    .split(/[\s_\-.,/|:@()"']+/)
    .filter((w) => w.length >= 3);
}

function taskKeywords(t) {
  return String(`${t.title} ${t.desc}`)
    .toLowerCase()
    .split(/[\s_\-.,/|:@()"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(inv, task) {
  const iw = invKeywords(inv);
  const tw = taskKeywords(task);
  return iw.filter((w) => tw.some((s) => s.includes(w) || w.includes(s))).length;
}

function buildLinked(investments, tasks) {
  return investments.map((inv) => {
    const matched = tasks
      .map((t) => ({ ...t, score: relevance(inv, t) }))
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, tasks: matched, backed: matched.length > 0 };
  }).sort((a, b) => (b.backed ? 1 : 0) - (a.backed ? 1 : 0) || b.tasks.length - a.tasks.length);
}

// ── colours ───────────────────────────────────────────────────────────────────

function statusColor(s) {
  if (s === "completed" || s === "done")       return "#4ADE80";
  if (s === "in_progress" || s === "active")   return C.neon;
  if (s === "pending" || s === "queued")       return "#F59E0B";
  if (s === "blocked" || s === "failed")       return "#EF4444";
  return S.text;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "BACKED", "DARK"];

export default function InvestmentTaskAligner() {
  const [open,        setOpen]        = useState(false);
  const [investments, setInvestments] = useState([]);
  const [tasks,       setTasks]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, taskRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: hdr }),
        fetch(`${base}/entities/Task`,       { headers: hdr }),
      ]);
      setInvestments(normaliseInvestments(await invRes.json()));
      setTasks(normaliseTasks(await taskRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:invtask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invtask-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isInvtaskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked    = buildLinked(investments, tasks);
  const backedCnt = linked.filter((inv) => inv.backed).length;
  const darkCnt   = linked.filter((inv) => !inv.backed).length;

  const visible = linked.filter((inv) => {
    if (filter === "BACKED") return inv.backed;
    if (filter === "DARK")   return !inv.backed;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildInvtaskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Investment × Task Aligner (◈ INVTASK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ INVTASK{darkCnt > 0 && (
          <span style={{
            marginLeft: 4, background: "#F59E0B", color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{darkCnt}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              INVESTMENTS × TASKS
            </span>
            <button
              onClick={assess}
              disabled={assessing || investments.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || investments.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "INV",    val: investments.length, color: C.blue    },
              { label: "TASKS",  val: tasks.length,       color: C.gold    },
              { label: "BACKED", val: backedCnt,          color: "#4ADE80" },
              { label: "DARK",   val: darkCnt,            color: "#F59E0B" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Investment list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && investments.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No investments match.</div>
            ) : visible.map((inv) => (
              <div key={inv.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${inv.backed ? "#4ADE80" : "#F59E0B"}`,
                  }}
                >
                  <span style={{ color: inv.backed ? "#4ADE80" : "#F59E0B", fontSize: 10, width: 10 }}>
                    {inv.backed ? "●" : "○"}
                  </span>
                  <span style={{
                    flex: 1, color: S.textHi,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontSize: "9px",
                  }}>
                    {inv.name}
                  </span>
                  {inv.type && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${C.blue}22`, color: C.blue,
                      border: `1px solid ${C.blue}44`,
                      whiteSpace: "nowrap",
                    }}>
                      {inv.type}
                    </span>
                  )}
                  <span style={{
                    color: inv.backed ? "#4ADE80" : "#F59E0B",
                    fontSize: "9px", minWidth: 46, textAlign: "right",
                  }}>
                    {inv.backed ? `${inv.tasks.length} TASK${inv.tasks.length !== 1 ? "S" : ""}` : "DARK"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === inv.id ? "▴" : "▾"}</span>
                </div>

                {expanded === inv.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {inv.backed ? inv.tasks.map((t) => (
                      <div key={t.id} style={{
                        padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                          <span style={{
                            color: S.textHi, fontSize: "9px", flex: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {t.title}
                          </span>
                          <span style={{
                            fontSize: "8px", marginLeft: 6, whiteSpace: "nowrap",
                            color: statusColor(t.status),
                          }}>
                            {t.status || "—"}
                          </span>
                        </div>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No tasks match this investment — running without operational task coverage.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /entities/Investment · /entities/Task · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
