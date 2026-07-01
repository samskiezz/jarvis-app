/**
 * F78 — Ops-Event-to-Task Correlator
 *
 * Parallel-fetches /v1/ops/events + /entities/Task, then keyword-correlates
 * each ops event (title / description / severity / type) against every task
 * (title / description / priority) to surface:
 *   LINKED  — event has at least one matching task (incident-response coverage)
 *   UNLINKED — event has no task backing (operational gap)
 *
 * Stat tiles: events / tasks / linked / unlinked.
 * Filter tabs: ALL | LINKED | UNLINKED.
 * Expand any event → matched tasks with priority + status + relevance score.
 * ▶ ASSESS: 2-sentence AI incident-coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ OETASK  at bottom:8 left:19420, zIndex 69.
 * Voice:   "ops event task / event task coverage / ops coverage / oetask"
 * Event:   jarvis:oetask-toggle
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 19420;
const POLL_MS  = 60_000;

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

// ── exported intent helpers ──────────────────────────────────────────────────

const OETASK_RE =
  /\b(ops?\s+event\s+task|event\s+task\s+cov|ops?\s+task\s+cor|ops?\s+coverage|which\s+(events?|ops?)\s+(have|has)\s+(tasks?)|event\s+to\s+task|oetask)\b/i;

export function isOetaskQuery(q) { return OETASK_RE.test(q); }

export async function buildOetaskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [evRes, tkRes] = await Promise.all([
      fetch(`${base}/v1/ops/events`, { headers: hdr }),
      fetch(`${base}/entities/Task`,  { headers: hdr }),
    ]);
    const evRaw = await evRes.json();
    const tkRaw = await tkRes.json();
    const events = normaliseEvents(evRaw);
    const tasks  = normaliseTasks(tkRaw);

    const linked   = events.filter((ev) => tasks.some((t) => relevance(ev, t) > 0)).length;
    const unlinked = events.length - linked;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS ops-event-to-task coverage: ${events.length} ops events, ` +
          `${tasks.length} tasks, ${linked} events with task backing, ` +
          `${unlinked} events with no task coverage (operational gaps). ` +
          `Give a 2-sentence incident-coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Ops event task coverage analysis complete, sir.").trim();
  } catch {
    return "Ops event task correlation unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseEvents(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.events)             ? raw.events
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((e, i) => ({
    id:          e.id           || String(i),
    title:       e.title        || e.name         || e.event_type  || `Event ${i + 1}`,
    description: e.description  || e.message      || e.details     || "",
    severity:    (e.severity    || e.level         || "INFO").toUpperCase(),
    type:        e.type         || e.category      || e.event_type  || "",
    ts:          e.timestamp    || e.created_at    || e.ts          || "",
  }));
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.tasks)              ? raw.tasks
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((t, i) => ({
    id:          t.id           || String(i),
    title:       t.title        || t.name          || `Task ${i + 1}`,
    description: t.description  || t.details       || "",
    priority:    (t.priority    || "NORMAL").toUpperCase(),
    status:      (t.status      || "UNKNOWN").toUpperCase(),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(event, task) {
  const ew = keywords(`${event.title} ${event.description} ${event.type}`);
  const tw = keywords(`${task.title} ${task.description}`);
  return ew.filter((w) => tw.some((t) => t.includes(w) || w.includes(t))).length;
}

function buildCorrelated(events, tasks) {
  return events.map((ev) => {
    const matched = tasks
      .map((t) => ({ ...t, score: relevance(ev, t) }))
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...ev, tasks: matched, linked: matched.length > 0 };
  });
}

const SEV_COLOR = { CRITICAL: "#FF4444", HIGH: "#FF8800", WARNING: "#FFCC00", INFO: "#29E7FF", LOW: "#4ADE80" };

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "LINKED", "UNLINKED"];

export default function OpsEventTaskCorrelator() {
  const [open,      setOpen]      = useState(false);
  const [events,    setEvents]    = useState([]);
  const [tasks,     setTasks]     = useState([]);
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
      const [evRes, tkRes] = await Promise.all([
        fetch(`${base}/v1/ops/events`, { headers: hdr }),
        fetch(`${base}/entities/Task`,  { headers: hdr }),
      ]);
      const evRaw = await evRes.json();
      const tkRaw = await tkRes.json();
      setEvents(normaliseEvents(evRaw));
      setTasks(normaliseTasks(tkRaw));
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
    window.addEventListener("jarvis:oetask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:oetask-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isOetaskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(events, tasks);
  const linked     = correlated.filter((ev) => ev.linked).length;
  const unlinked   = correlated.filter((ev) => !ev.linked).length;

  const critUnlinked = correlated.filter(
    (ev) => !ev.linked && (ev.severity === "CRITICAL" || ev.severity === "HIGH")
  ).length;

  const visible = correlated.filter((ev) => {
    if (filter === "LINKED")   return ev.linked;
    if (filter === "UNLINKED") return !ev.linked;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildOetaskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Ops-Event-to-Task Correlator (◈ OETASK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(41,231,255,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ OETASK{critUnlinked > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF4444", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{critUnlinked}</span>
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
              OPS EVENT → TASK CORRELATOR
            </span>
            <button
              onClick={assess}
              disabled={assessing || events.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || events.length === 0) ? 0.4 : 1,
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
              { label: "EVENTS",   val: events.length, color: C.neon    },
              { label: "TASKS",    val: tasks.length,  color: C.blue    },
              { label: "LINKED",   val: linked,         color: "#4ADE80" },
              { label: "UNLINKED", val: unlinked,       color: "#FF8800" },
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

          {/* Event list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && events.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No events match.</div>
            ) : visible.map((ev) => {
              const sevColor = SEV_COLOR[ev.severity] || C.neon;
              return (
                <div key={ev.id} style={{ marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                      background: "rgba(0,0,0,0.25)",
                      borderLeft: `3px solid ${ev.linked ? "#4ADE80" : "#FF8800"}`,
                    }}
                  >
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 3,
                      background: `${sevColor}22`, color: sevColor,
                      border: `1px solid ${sevColor}44`, whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {ev.severity}
                    </span>
                    <span style={{
                      flex: 1, color: S.textHi, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: S.fs.xs,
                    }}>
                      {ev.title}
                    </span>
                    <span style={{
                      color: ev.linked ? "#4ADE80" : "#FF8800",
                      fontSize: "9px", minWidth: 52, textAlign: "right", whiteSpace: "nowrap",
                    }}>
                      {ev.linked ? `${ev.tasks.length} TASK${ev.tasks.length !== 1 ? "S" : ""}` : "UNLINKED"}
                    </span>
                    <span style={{ color: S.text, fontSize: 9 }}>
                      {expanded === ev.id ? "▴" : "▾"}
                    </span>
                  </div>

                  {expanded === ev.id && (
                    <div style={{
                      margin: "2px 0 2px 18px",
                      background: "rgba(0,0,0,0.18)", borderRadius: 4,
                      padding: "5px 8px",
                    }}>
                      {ev.linked ? ev.tasks.map((t) => (
                        <div key={t.id} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                        }}>
                          <span style={{
                            fontSize: "8px", padding: "1px 3px", borderRadius: 3,
                            background: "rgba(41,231,255,0.1)", color: C.blue,
                            border: `1px solid ${C.blue}33`, whiteSpace: "nowrap",
                          }}>
                            {t.priority}
                          </span>
                          <span style={{
                            flex: 1, color: S.textHi, fontSize: "9px",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {t.title}
                          </span>
                          <span style={{
                            color: S.text, fontSize: "8px",
                            whiteSpace: "nowrap",
                          }}>
                            {t.status}
                          </span>
                          <span style={{ color: C.neon, fontSize: "9px", whiteSpace: "nowrap" }}>
                            rel:{t.score}
                          </span>
                        </div>
                      )) : (
                        <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                          No matching tasks found — consider creating an incident-response task.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /v1/ops/events · /entities/Task · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
