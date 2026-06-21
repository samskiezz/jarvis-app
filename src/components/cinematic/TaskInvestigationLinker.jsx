/**
 * F68 — Task-Investigation Linker
 *
 * Parallel-fetches /entities/Task + /v1/investigations, then
 * keyword-correlates each open investigation against the task catalog to
 * surface whether a case has TASK BACKING (at least one task references
 * it) or is TASKLESS (no task match found).
 *
 * Stat tiles: tasks / investigations / backed / taskless.
 * Filter tabs: ALL | BACKED | TASKLESS.
 * Expand any investigation → matched tasks with relevance score + status.
 * ▶ ASSESS: sends a 2-sentence AI gap-analysis brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ TINVL  at bottom:8 left:8916, zIndex 68.
 * Voice:   "task investigation / case task gap / tinvl / tasks in cases"
 * Event:   jarvis:tinvl-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 8916;
const POLL_MS  = 90_000;

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

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

const TINVL_RE =
  /\b(task\s+invest(?:igation)?|case\s+task(?:\s+gap)?|invest(?:igation)?\s+task|tasks?\s+in\s+cases?|tinvl)\b/i;

export function isTinvlQuery(q) { return TINVL_RE.test(q); }

export async function buildTinvlScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [tRes, iRes] = await Promise.all([
      fetch(`${base}/entities/Task`,        { headers: hdr }),
      fetch(`${base}/v1/investigations`,    { headers: hdr }),
    ]);
    const tRaw = await tRes.json();
    const iRaw = await iRes.json();
    const tasks = normaliseTasks(tRaw);
    const invs  = normaliseInvestigations(iRaw);

    const backed   = invs.filter((inv) => tasks.some((t) => relevance(inv, t) > 0)).length;
    const taskless = invs.length - backed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS task-investigation coverage: ${tasks.length} tasks, ` +
          `${invs.length} investigations, ${backed} task-backed, ${taskless} taskless. ` +
          `Give a 2-sentence operational-gap brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Task-investigation analysis complete, sir.").trim();
  } catch {
    return "Task-investigation analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.tasks)           ? raw.tasks
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((t, i) => ({
    id:     t.id          || String(i),
    title:  t.title       || t.name  || t.task_name   || `Task ${i + 1}`,
    desc:   (t.description || t.summary || t.tags || "").toString(),
    status: (t.status     || "").toLowerCase(),
  }));
}

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw)                   ? raw
    : Array.isArray(raw?.data)                     ? raw.data
    : Array.isArray(raw?.investigations)            ? raw.investigations
    : Array.isArray(raw?.items)                    ? raw.items
    : Array.isArray(raw?.results)                  ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:       inv.id              || String(i),
    title:    inv.title           || inv.name   || inv.case_name    || `Investigation ${i + 1}`,
    desc:     (inv.description    || inv.summary || inv.notes || "").toString(),
    status:   (inv.status         || "").toLowerCase(),
    priority: (inv.priority       || "").toLowerCase(),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@]+/)
    .filter((w) => w.length >= 3);
}

function relevance(inv, task) {
  const iw = keywords(`${inv.title} ${inv.desc}`);
  const tw = keywords(`${task.title} ${task.desc}`);
  return iw.filter((w) => tw.some((t) => t.includes(w) || w.includes(t))).length;
}

function buildCorrelated(invs, tasks) {
  return invs.map((inv) => {
    const matched = tasks
      .map((t) => ({ ...t, score: relevance(inv, t) }))
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, tasks: matched, backed: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "BACKED", "TASKLESS"];

const STATUS_COLOR = {
  in_progress: "#29E7FF",
  pending:     "#F59E0B",
  blocked:     "#EF4444",
  completed:   "#4ADE80",
};

export default function TaskInvestigationLinker() {
  const [open,      setOpen]      = useState(false);
  const [tasks,     setTasks]     = useState([]);
  const [invs,      setInvs]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [tRes, iRes] = await Promise.all([
        fetch(`${base}/entities/Task`,      { headers: hdr }),
        fetch(`${base}/v1/investigations`,  { headers: hdr }),
      ]);
      setTasks(normaliseTasks(await tRes.json()));
      setInvs(normaliseInvestigations(await iRes.json()));
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
    window.addEventListener("jarvis:tinvl-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tinvl-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isTinvlQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(invs, tasks);
  const backed     = correlated.filter((inv) => inv.backed).length;
  const taskless   = correlated.filter((inv) => !inv.backed).length;

  const visible = correlated.filter((inv) => {
    if (filter === "BACKED")   return inv.backed;
    if (filter === "TASKLESS") return !inv.backed;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildTinvlScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Task-Investigation Linker (◈ TINVL)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 68,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ TINVL{taskless > 0 && (
          <span style={{
            marginLeft: 4, background: "#F59E0B", color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{taskless}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 67,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
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
              TASK–INVESTIGATION LINKER
            </span>
            <button
              onClick={assess}
              disabled={assessing || invs.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || invs.length === 0) ? 0.4 : 1,
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
              { label: "TASKS",     val: tasks.length,  color: C.blue    },
              { label: "CASES",     val: invs.length,   color: C.neon    },
              { label: "BACKED",    val: backed,         color: "#4ADE80" },
              { label: "TASKLESS",  val: taskless,       color: "#F59E0B" },
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

          {/* Investigation list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && invs.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No investigations match.</div>
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
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.title}
                  </span>
                  {inv.priority && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${C.blue}22`, color: C.blue,
                      border: `1px solid ${C.blue}44`,
                    }}>
                      {inv.priority}
                    </span>
                  )}
                  <span style={{ color: inv.backed ? "#4ADE80" : "#F59E0B", fontSize: "9px", minWidth: 46, textAlign: "right" }}>
                    {inv.backed ? `${inv.tasks.length} TASK` : "NONE"}
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
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.title}
                        </span>
                        <span style={{
                          fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap",
                          color: STATUS_COLOR[t.status] || S.text,
                        }}>
                          rel:{t.score}{t.status ? ` · ${t.status}` : ""}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No matching tasks found for this investigation.
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
            /entities/Task · /v1/investigations · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
