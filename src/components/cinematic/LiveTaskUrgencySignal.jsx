/**
 * F186 — Live Intel × Task Urgency Signal (LITASK)
 *
 * Parallel-fetches /functions/getLiveIntel (earthquakes + crypto + FX) and
 * /entities/Task, then keyword-correlates each task (title, notes, tags, status)
 * against live world events to surface:
 *
 *   SIGNALLED   — at least one live world event keyword-matches this task,
 *                 indicating a real-world trigger that elevates its urgency
 *   UNSIGNALLED — no live-world correlation; task has no current world-event backing
 *
 * Stat tiles: tasks / live events / signalled / unsignalled
 * Filter tabs: ALL | SIGNALLED | UNSIGNALLED + text search
 * Expand task → matched live events with event-type badge + relevance score.
 * Lime badge on signalled count (urgency, not danger — lime not red).
 * ▶ ASSESS: 2-sentence urgency brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ LITASK  at bottom:8 left:65720, zIndex:127.
 * Event:   jarvis:litask-toggle
 * Voice:   "live task / world task / litask / task signal / urgent tasks /
 *           live task trigger / task urgency / world event task"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 65720;
const POLL_MS  = 60_000;
const LIME     = "#84CC16";
const GREEN    = "#34D399";
const SLATE    = "#6E8AA0";
const CYAN     = "#29E7FF";
const VIOLET   = "#A78BFA";
const RED      = "#FF4444";
const AMBER    = "#F59E0B";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const LITASK_RE =
  /\b(live\s+task[s]?|world\s+task[s]?|litask|task\s+signal[s]?|urgent\s+task[s]?|live\s+task\s+trigger[s]?|task\s+urgency|world\s+event\s+task[s]?|real[\s-]?world\s+task[s]?|task\s+world|event[\s-]?task[s]?|which\s+task[s]?\s+(are|have)\s+(live|urgent|signalled?|triggered?))\b/i;

export function isLitaskQuery(q) { return LITASK_RE.test(q); }

export async function buildLitaskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [intelRes, taskRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/entities/Task`,          { headers: hdr }),
    ]);
    const events = normaliseEvents(await intelRes.json());
    const tasks  = normaliseTasks(await taskRes.json());

    const signalled = tasks.filter(
      (t) => events.some((e) => relevance(t, e) > 0)
    ).length;
    const unsignalled = tasks.length - signalled;

    const topSignalled = tasks.find(
      (t) => events.some((e) => relevance(t, e) > 0)
    );

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS live intel task urgency signal analysis: ${tasks.length} tasks cross-referenced ` +
          `against ${events.length} live world events (earthquakes, crypto movements, FX). ` +
          `${signalled} tasks have real-world signal backing and may require elevated urgency; ` +
          `${unsignalled} tasks have no current live-world correlation. ` +
          `${topSignalled ? `First signalled task: "${topSignalled.title}" (${topSignalled.status || "pending"}). ` : ""}` +
          `Provide a 2-sentence urgency brief — formal British butler tone, first person, ` +
          `highlight which tasks the operator should prioritise given current world conditions.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Live task urgency signal analysis complete, sir.").trim();
  } catch {
    return "Live task urgency signal assessment unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseEvents(raw) {
  const quakes = Array.isArray(raw?.earthquakes) ? raw.earthquakes : [];
  const crypto = Array.isArray(raw?.crypto)      ? raw.crypto      : [];
  const fx     = Array.isArray(raw?.fx)          ? raw.fx          :
                 Array.isArray(raw?.forex)        ? raw.forex       : [];

  const out = [];

  quakes.forEach((q, i) => {
    const mag   = q.magnitude ?? q.mag ?? q.properties?.mag ?? "";
    const place = q.place ?? q.location ?? q.properties?.place ?? "";
    const title = q.title ?? q.properties?.title ?? `M${mag} ${place}`;
    out.push({
      id:   `quake-${i}`,
      type: "SEISMIC",
      title: String(title).slice(0, 120),
      body:  `earthquake seismic magnitude:${mag} region:${place} geological disaster`.slice(0, 200),
      col:  RED,
    });
  });

  crypto.forEach((c, i) => {
    const sym    = c.symbol ?? c.name ?? `CRYPTO${i}`;
    const change = c.change_24h ?? c.change ?? c.pct_change ?? "";
    out.push({
      id:   `crypto-${i}`,
      type: "CRYPTO",
      title: `${sym} ${change ? (Number(change) >= 0 ? "+" : "") + Number(change).toFixed(2) + "%" : ""}`.trim(),
      body:  `crypto cryptocurrency ${sym} digital-asset blockchain market finance trading`.slice(0, 200),
      col:  CYAN,
    });
  });

  fx.forEach((f, i) => {
    const pair = f.pair ?? f.symbol ?? f.name ?? `FX${i}`;
    const rate = f.rate ?? f.price ?? f.value ?? "";
    out.push({
      id:   `fx-${i}`,
      type: "FX",
      title: `${pair}${rate ? " @ " + Number(rate).toFixed(4) : ""}`,
      body:  `currency forex exchange-rate ${pair} financial market trade`.slice(0, 200),
      col:  VIOLET,
    });
  });

  return out;
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)       ? raw
    : Array.isArray(raw?.tasks)        ? raw.tasks
    : Array.isArray(raw?.data)         ? raw.data
    : Array.isArray(raw?.results)      ? raw.results
    : Array.isArray(raw?.items)        ? raw.items
    : [];
  return arr.map((t, i) => ({
    id:     t.id     || t.task_id     || String(i),
    title:  t.title  || t.name        || t.label     || `Task ${i + 1}`,
    status: t.status || t.state       || "pending",
    tags:   Array.isArray(t.tags) ? t.tags.join(" ") : (t.tags || ""),
    notes:  (t.notes || t.description || t.details   || "").toString().slice(0, 300),
    priority: t.priority || t.urgency || "",
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"'%+]+/)
    .filter((w) => w.length >= 3);
}

function relevance(task, event) {
  const tw = keywords(`${task.title} ${task.notes} ${task.tags} ${task.status}`);
  const ew = keywords(`${event.title} ${event.body}`);
  return tw.filter((w) => ew.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(tasks, events) {
  return tasks.map((t) => {
    const matched = events
      .map((e) => ({ ...e, score: relevance(t, e) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...t, events: matched, signalled: matched.length > 0 };
  });
}

function statusColor(status) {
  const lc = String(status || "").toLowerCase();
  if (lc === "done" || lc === "complete" || lc === "completed") return GREEN;
  if (lc === "in_progress" || lc === "active" || lc === "running") return CYAN;
  if (lc === "blocked" || lc === "failed")                          return RED;
  if (lc === "pending" || lc === "waiting")                         return AMBER;
  return SLATE;
}

function eventTypeColor(type) {
  if (type === "SEISMIC") return RED;
  if (type === "CRYPTO")  return CYAN;
  if (type === "FX")      return VIOLET;
  return SLATE;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "SIGNALLED", "UNSIGNALLED"];

export default function LiveTaskUrgencySignal() {
  const [open,       setOpen]      = useState(false);
  const [tasks,      setTasks]     = useState([]);
  const [events,     setEvents]    = useState([]);
  const [loading,    setLoading]   = useState(false);
  const [filter,     setFilter]    = useState("ALL");
  const [search,     setSearch]    = useState("");
  const [expanded,   setExpanded]  = useState(null);
  const [assessing,  setAssessing] = useState(false);
  const [lastFetch,  setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [intelRes, taskRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/entities/Task`,          { headers: hdr }),
      ]);
      setEvents(normaliseEvents(await intelRes.json()));
      setTasks(normaliseTasks(await taskRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:litask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:litask-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildLitaskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked      = buildLinked(tasks, events);
  const signalled   = linked.filter((t) => t.signalled).length;
  const unsignalled = linked.length - signalled;

  const displayed = linked.filter((t) => {
    if (filter === "SIGNALLED"   && !t.signalled) return false;
    if (filter === "UNSIGNALLED" && t.signalled)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.notes.toLowerCase().includes(q) ||
      t.status.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Live Intel × Task Urgency Signal (LITASK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 127,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${LIME}55`,
          color: LIME, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {signalled > 0
          ? <><span style={{ background: LIME, color: "#000", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{signalled}</span>◈ LITASK</>
          : "◈ LITASK"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 127,
      width: 500, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${LIME}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${LIME}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${LIME}33` }}>
        <span style={{ color: LIME, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ LITASK</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>LIVE INTEL × TASK URGENCY SIGNAL</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: LIME, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${LIME}22` }}>
        {[
          { label: "TASKS",       value: linked.length, col: SLATE },
          { label: "LIVE EVENTS", value: events.length, col: CYAN  },
          { label: "SIGNALLED",   value: signalled,     col: LIME  },
          { label: "UNSIGNALLED", value: unsignalled,   col: AMBER },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${LIME}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${LIME}22` : "none",
            border: `1px solid ${filter === t ? LIME : SLATE}`,
            color: filter === t ? LIME : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${LIME}`,
          color: LIME, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* task list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No tasks match the current filter.
          </div>
        )}
        {displayed.map((t) => {
          const isExp = expanded === t.id;
          const col   = t.signalled ? LIME : SLATE;
          const badge = t.signalled ? "SIGNALLED" : "UNSIGNALLED";
          return (
            <div key={t.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${LIME}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${t.signalled ? `${LIME}44` : "#6E8AA022"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col, flexShrink: 0,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{t.title}</span>
                {t.status && (
                  <span style={{
                    fontSize: 8, padding: "1px 5px", borderRadius: 4,
                    background: `${statusColor(t.status)}22`, color: statusColor(t.status),
                    letterSpacing: 1,
                  }}>
                    {String(t.status).toUpperCase().replace(/_/g, " ").slice(0, 12)}
                  </span>
                )}
                {t.signalled && (
                  <span style={{ fontSize: 8, color: LIME }}>{t.events.length} event{t.events.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${LIME}22` }}>
                  {t.notes && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {t.notes.slice(0, 120)}
                    </div>
                  )}
                  {t.events.length === 0 ? (
                    <div style={{ fontSize: 9, color: SLATE }}>
                      No live world events correlate with this task right now.
                    </div>
                  ) : (
                    t.events.map((e) => (
                      <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${eventTypeColor(e.type)}22`, color: eventTypeColor(e.type),
                          letterSpacing: 1, flexShrink: 0,
                        }}>
                          {e.type}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{e.title}</span>
                        <span style={{ fontSize: 8, color: LIME }}>rel:{e.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
