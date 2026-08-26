/**
 * F192 — Ops Alert × Task Response Tracker (OPSTASK)
 *
 * Parallel-fetches /v1/ops/alerts + /entities/Task, then keyword-correlates
 * each active ops alert (name/severity/service/description/tags) against
 * the task backlog (title/notes/tags/status) to surface:
 *   TASKED   — at least one task aligns with this alert (response underway)
 *   UNTASKED — no task coverage (alert has no actionable response assigned)
 *
 * Stat tiles: alerts / tasks / tasked / untasked
 * Filter tabs: ALL | TASKED | UNTASKED
 * Expand any alert → matched tasks with status chip + relevance score.
 * Red badge on untasked count.
 * ▶ ASSESS: 2-sentence ops-alert task coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ OPSTASK  at bottom:8 left:69080, zIndex:133.
 * Event:   jarvis:opstask-toggle
 * Voice:   "ops alert task / alert task / opstask / alert response /
 *           unresponded alerts / tasked alerts / alert coverage /
 *           which alerts have tasks / ops task response"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 69080;
const POLL_MS  = 60_000;
const RED      = "#F87171";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

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

const OPSTASK_RE =
  /\b(ops\s+alert\s+task|alert\s+task|opstask|alert\s+response\s+task|unresponded\s+alert|tasked\s+alert|alert\s+coverage|which\s+alerts?\s+(have|lack)\s+task|ops\s+task\s+response|alert\s+action\s+plan|task\s+response\s+coverage)\b/i;

export function isOpstaskQuery(q) { return OPSTASK_RE.test(q); }

export async function buildOpstaskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [alertRes, taskRes] = await Promise.all([
      fetch(`${base}/v1/ops/alerts`,  { headers: hdr }),
      fetch(`${base}/entities/Task`,  { headers: hdr }),
    ]);
    const alerts = normaliseAlerts(await alertRes.json());
    const tasks  = normaliseTasks(await taskRes.json());

    const tasked   = alerts.filter((al) => tasks.some((t) => relevance(al, t) > 0)).length;
    const untasked = alerts.length - tasked;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS ops alert × task coverage: ${alerts.length} active operational alerts, ` +
          `${tasks.length} tasks in backlog, ${tasked} alerts have matching response tasks, ` +
          `${untasked} alerts have no task coverage — response gap. ` +
          `Give a 2-sentence ops-alert task response coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Ops alert task response coverage analysis complete, sir.").trim();
  } catch {
    return "Ops alert task response analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseAlerts(raw) {
  const arr = Array.isArray(raw)         ? raw
    : Array.isArray(raw?.alerts)        ? raw.alerts
    : Array.isArray(raw?.data)          ? raw.data
    : Array.isArray(raw?.results)       ? raw.results
    : Array.isArray(raw?.items)         ? raw.items
    : [];
  return arr.map((a, i) => ({
    id:          a.id          || a.alert_id  || String(i),
    name:        a.name        || a.title     || a.message || a.summary || `Alert ${i + 1}`,
    severity:    a.severity    || a.level     || a.priority || "",
    service:     a.service     || a.source    || a.component || a.system || "",
    status:      a.status      || a.state     || "",
    tags:        Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
    description: (a.description || a.details || a.body || "").toString().slice(0, 300),
  }));
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)         ? raw
    : Array.isArray(raw?.tasks)         ? raw.tasks
    : Array.isArray(raw?.data)          ? raw.data
    : Array.isArray(raw?.items)         ? raw.items
    : Array.isArray(raw?.results)       ? raw.results
    : [];
  return arr.map((t, i) => ({
    id:     t.id     || String(i),
    title:  t.title  || t.name   || `Task ${i + 1}`,
    status: t.status || t.state  || "",
    tags:   Array.isArray(t.tags) ? t.tags.join(" ") : (t.tags || ""),
    notes:  (t.notes || t.description || t.details || t.body || "").toString().slice(0, 300),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(alert, task) {
  const aw = keywords(`${alert.name} ${alert.service} ${alert.description} ${alert.tags} ${alert.severity}`.slice(0, 400));
  const tw = keywords(`${task.title} ${task.notes.slice(0, 400)} ${task.tags} ${task.status}`);
  return aw.filter((w) => tw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildLinked(alerts, tasks) {
  return alerts.map((al) => {
    const matched = tasks
      .map((t) => ({ ...t, score: relevance(al, t) }))
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...al, tasks: matched, tasked: matched.length > 0 };
  });
}

function severityColor(sev) {
  const s = String(sev || "").toLowerCase();
  if (s.includes("crit") || s === "p1") return RED;
  if (s.includes("high") || s === "p2") return "#FB923C";
  if (s.includes("med")  || s === "p3") return "#FACC15";
  if (s.includes("low")  || s === "p4") return "#4ADE80";
  return "#94A3B8";
}

function statusColor(st) {
  const s = String(st || "").toLowerCase();
  if (s.includes("done") || s.includes("complet")) return "#4ADE80";
  if (s.includes("prog") || s.includes("active"))  return C.blue;
  if (s.includes("block") || s.includes("hold"))   return RED;
  return "#94A3B8";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "TASKED", "UNTASKED"];

export default function OpsAlertTaskCoverage() {
  const [open,      setOpen]      = useState(false);
  const [alerts,    setAlerts]    = useState([]);
  const [tasks,     setTasks]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [alertRes, taskRes] = await Promise.all([
        fetch(`${base}/v1/ops/alerts`, { headers: hdr }),
        fetch(`${base}/entities/Task`, { headers: hdr }),
      ]);
      setAlerts(normaliseAlerts(await alertRes.json()));
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
    window.addEventListener("jarvis:opstask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:opstask-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isOpstaskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked   = buildLinked(alerts, tasks);
  const tasked   = linked.filter((al) => al.tasked).length;
  const untasked = linked.filter((al) => !al.tasked).length;

  const visible = linked
    .filter((al) => {
      if (filter === "TASKED")   return al.tasked;
      if (filter === "UNTASKED") return !al.tasked;
      return true;
    })
    .filter((al) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return al.name.toLowerCase().includes(q) || al.service.toLowerCase().includes(q) || al.description.toLowerCase().includes(q);
    });

  async function assess() {
    setAssessing(true);
    const text = await buildOpstaskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Ops Alert × Task Response Tracker (◈ OPSTASK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 133,
          background: open ? `${RED}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? RED : S.border}`,
          borderRadius: S.radius, color: open ? RED : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${RED}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ OPSTASK{untasked > 0 && (
          <span style={{
            marginLeft: 4,
            background: RED,
            color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{untasked}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 133,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${RED}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "70vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: RED, letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              OPS ALERT — TASK RESPONSE TRACKER
            </span>
            <button
              onClick={assess}
              disabled={assessing || alerts.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || alerts.length === 0) ? 0.4 : 1,
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
              { label: "ALERTS",   val: alerts.length, color: RED       },
              { label: "TASKS",    val: tasks.length,  color: C.neon    },
              { label: "TASKED",   val: tasked,         color: "#4ADE80" },
              { label: "UNTASKED", val: untasked,       color: RED       },
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
          <div style={{ display: "flex", gap: 4, padding: "0 12px 4px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1,
                background: filter === t ? `${RED}22` : "transparent",
                border: `1px solid ${filter === t ? RED : S.border}`,
                color: filter === t ? RED : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search alerts…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${S.border}`, borderRadius: S.radius,
                color: S.textHi, fontFamily: S.mono, fontSize: "9px",
                padding: "3px 7px", outline: "none",
              }}
            />
          </div>

          {/* Alert list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && alerts.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No alerts match.</div>
            ) : visible.map((al) => (
              <div key={al.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === al.id ? null : al.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${al.tasked ? "#4ADE80" : RED}`,
                  }}
                >
                  <span style={{ color: al.tasked ? "#4ADE80" : RED, fontSize: 10, width: 10 }}>
                    {al.tasked ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {al.name}
                  </span>
                  {al.severity && (
                    <span style={{
                      fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                      background: `${severityColor(al.severity)}22`,
                      color: severityColor(al.severity),
                      border: `1px solid ${severityColor(al.severity)}44`,
                      whiteSpace: "nowrap",
                    }}>
                      {String(al.severity).toUpperCase().slice(0, 8)}
                    </span>
                  )}
                  <span style={{
                    fontSize: "9px", whiteSpace: "nowrap",
                    color: al.tasked ? "#4ADE80" : RED,
                    minWidth: 72, textAlign: "right",
                  }}>
                    {al.tasked ? `${al.tasks.length} TASK${al.tasks.length !== 1 ? "S" : ""}` : "UNTASKED"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === al.id ? "▴" : "▾"}</span>
                </div>

                {expanded === al.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {al.service && (
                      <div style={{ color: S.text, fontSize: "8px", marginBottom: 3 }}>
                        SERVICE: <span style={{ color: S.textHi }}>{al.service}</span>
                      </div>
                    )}
                    {al.description && (
                      <div style={{ color: S.text, fontSize: "8px", marginBottom: 4, lineHeight: 1.4 }}>
                        {al.description.slice(0, 120)}{al.description.length > 120 ? "…" : ""}
                      </div>
                    )}
                    {al.tasked ? al.tasks.map((t) => (
                      <div key={t.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        {t.status && (
                          <span style={{
                            fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                            background: `${statusColor(t.status)}22`,
                            color: statusColor(t.status),
                            border: `1px solid ${statusColor(t.status)}44`,
                            whiteSpace: "nowrap",
                          }}>
                            {String(t.status).toUpperCase().slice(0, 10)}
                          </span>
                        )}
                        <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.title}
                        </span>
                        <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                          rel:{t.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: RED, fontSize: "9px", padding: "2px 0" }}>
                        No response tasks found for this alert.
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
            /v1/ops/alerts · /entities/Task · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
