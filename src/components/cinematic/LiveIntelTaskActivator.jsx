/**
 * F35 — Live Intel × Task Activator (LITA)
 *
 * Parallel-fetches /functions/getLiveIntel (earthquakes + crypto + FX) and
 * /entities/Task, then keyword-correlates each task (title, description,
 * tags, priority) against live world events to surface:
 *
 *   TRIGGERED — at least one live world event keyword-matches this task
 *   DORMANT   — no current world event activates this task
 *
 * Stat tiles: tasks / live events / triggered / dormant
 * Filter tabs: ALL | TRIGGERED | DORMANT + text search
 * Expand any task → matched live events with type badge (SEISMIC/CRYPTO/FX)
 *   + relevance score bar.
 * Red badge on triggered count (tasks that need immediate attention).
 * ▶ ASSESS: 2-sentence activation brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ LITA  at bottom:8 left:530240, zIndex:130.
 * Event:   jarvis:lita-toggle
 * Voice:   "live intel task / world task / task trigger / lita /
 *           triggered tasks / world activated task / current task activation"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 530240;
const POLL_MS  = 60_000;
const RED      = "#FF4444";
const GREEN    = "#34D399";
const CYAN     = "#29E7FF";
const VIOLET   = "#A78BFA";
const AMBER    = "#F59E0B";
const SLATE    = "#6E8AA0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const LITA_RE =
  /\b(live\s+intel\s+task[s]?|world\s+task[s]?|task\s+trigger[s]?|lita|triggered\s+task[s]?|world[\s-]?activated\s+task[s]?|current\s+task\s+activation[s]?|real[\s-]?time\s+task[s]?|world\s+event\s+task[s]?|tasks?\s+triggered\s+by\s+(live|world|real))\b/i;

export function isLitaQuery(q) { return LITA_RE.test(q); }

export async function buildLitaScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [intelRes, taskRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/entities/Task`,          { headers: hdr }),
    ]);
    const events   = normaliseEvents(await intelRes.json());
    const tasks    = normaliseTasks(await taskRes.json());

    const triggered = tasks.filter(
      (t) => events.some((e) => relevance(t, e) > 0)
    ).length;
    const dormant = tasks.length - triggered;

    const seismic = events.filter((e) => e.type === "SEISMIC").length;
    const crypto  = events.filter((e) => e.type === "CRYPTO").length;
    const fx      = events.filter((e) => e.type === "FX").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS live-intel task activation analysis: ${tasks.length} operational tasks ` +
          `cross-referenced against ${events.length} live world events ` +
          `(${seismic} seismic, ${crypto} crypto, ${fx} FX). ` +
          `${triggered} tasks are activated by current world state; ` +
          `${dormant} tasks have no live world event alignment. ` +
          `Provide a 2-sentence task activation brief — formal British butler tone, ` +
          `first person, highlight which task domains are currently world-activated.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Live-intel task activation analysis complete, sir.").trim();
  } catch {
    return "Live intel task activation assessment unavailable at this time, sir.";
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
      id:    `quake-${i}`,
      type:  "SEISMIC",
      title: String(title).slice(0, 120),
      body:  `magnitude:${mag} region:${place} earthquake seismic disaster emergency relief geopolitical`.slice(0, 300),
      col:   RED,
    });
  });

  crypto.forEach((c, i) => {
    const sym    = c.symbol ?? c.name ?? `CRYPTO${i}`;
    const change = c.change_24h ?? c.change ?? c.pct_change ?? "";
    out.push({
      id:    `crypto-${i}`,
      type:  "CRYPTO",
      title: `${sym}${change ? " " + (Number(change) >= 0 ? "+" : "") + Number(change).toFixed(2) + "%" : ""}`.trim(),
      body:  `asset:${sym} cryptocurrency blockchain digital-asset defi token trading investment market finance`.slice(0, 300),
      col:   CYAN,
    });
  });

  fx.forEach((f, i) => {
    const pair = f.pair ?? f.symbol ?? f.name ?? `FX${i}`;
    const rate = f.rate ?? f.price ?? f.value ?? "";
    out.push({
      id:    `fx-${i}`,
      type:  "FX",
      title: `${pair}${rate ? " @ " + Number(rate).toFixed(4) : ""}`,
      body:  `currency:${pair} forex exchange-rate international trade monetary FX market`.slice(0, 300),
      col:   VIOLET,
    });
  });

  return out;
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.tasks)                ? raw.tasks
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((t, i) => ({
    id:       t.id          || t.task_id  || String(i),
    title:    t.title       || t.name     || t.label       || `Task ${i + 1}`,
    status:   t.status      || t.state    || "pending",
    priority: t.priority    || t.urgency  || "medium",
    tags:     Array.isArray(t.tags) ? t.tags.join(" ") : (t.tags || ""),
    desc:     (t.description || t.summary || t.notes || "").toString().slice(0, 300),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"'%+]+/)
    .filter((w) => w.length >= 3);
}

function relevance(task, event) {
  const tw = keywords(`${task.title} ${task.tags} ${task.desc} ${task.priority}`);
  const ew = keywords(`${event.title} ${event.body}`);
  return tw.filter((w) => ew.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(tasks, events) {
  return tasks.map((t) => {
    const matched = events
      .map((e) => ({ ...e, score: relevance(t, e) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...t, events: matched, triggered: matched.length > 0 };
  });
}

function priorityColor(p) {
  const lc = String(p || "").toLowerCase();
  if (lc === "critical" || lc === "urgent") return RED;
  if (lc === "high")                         return "#FF8C42";
  if (lc === "medium")                       return AMBER;
  if (lc === "low")                          return GREEN;
  return SLATE;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "TRIGGERED", "DORMANT"];

export default function LiveIntelTaskActivator() {
  const [open,     setOpen]     = useState(false);
  const [tasks,    setTasks]    = useState([]);
  const [events,   setEvents]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
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
      if (intelRes.ok) setEvents(normaliseEvents(await intelRes.json()));
      if (taskRes.ok)  setTasks(normaliseTasks(await taskRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:lita-toggle", handler);
    return () => window.removeEventListener("jarvis:lita-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const linked = buildLinked(tasks, events);
  const triggered = linked.filter((t) => t.triggered);
  const dormant   = linked.filter((t) => !t.triggered);

  const visible = linked
    .filter((t) => {
      if (filter === "TRIGGERED") return t.triggered;
      if (filter === "DORMANT")   return !t.triggered;
      return true;
    })
    .filter((t) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.desc.toLowerCase().includes(q) ||
        t.tags.toLowerCase().includes(q)
      );
    });

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildLitaScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 130,
          background: triggered.length > 0
            ? "rgba(255,68,68,0.18)"
            : "rgba(41,231,255,0.10)",
          border: `1px solid ${triggered.length > 0 ? RED : CYAN}`,
          color: triggered.length > 0 ? RED : CYAN,
          fontSize: 10,
          padding: "3px 8px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.06em",
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
        title="Live Intel × Task Activator"
      >
        ◈ LITA
        {triggered.length > 0 && (
          <span
            style={{
              marginLeft: 5,
              background: RED,
              color: "#fff",
              borderRadius: 9,
              padding: "0 5px",
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            {triggered.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 36,
        left: Math.min(BTN_LEFT, window.innerWidth - 560),
        width: 530,
        maxHeight: "78vh",
        overflowY: "auto",
        background: "rgba(8,14,24,0.97)",
        border: `1px solid ${triggered.length > 0 ? RED : CYAN}`,
        borderRadius: 10,
        zIndex: 9000,
        padding: "14px 16px",
        fontFamily: "monospace",
        color: CYAN,
        boxShadow: "0 0 32px rgba(41,231,255,0.12)",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em" }}>
          ◈ LIVE INTEL × TASK ACTIVATOR
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing || tasks.length === 0}
            style={{
              background: "rgba(41,231,255,0.12)",
              border: `1px solid ${CYAN}`,
              color: CYAN,
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "transparent",
              border: "none",
              color: SLATE,
              fontSize: 14,
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* stat tiles */}
      {(() => {
        const tiles = [
          { label: "TASKS",     value: linked.length,     col: CYAN   },
          { label: "LIVE EVENTS", value: events.length,   col: SLATE  },
          { label: "TRIGGERED", value: triggered.length,  col: triggered.length > 0 ? RED : GREEN },
          { label: "DORMANT",   value: dormant.length,    col: SLATE  },
        ];
        return (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {tiles.map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 6,
                  padding: "6px 8px",
                  textAlign: "center",
                  border: `1px solid rgba(255,255,255,0.07)`,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700, color: t.col }}>{t.value}</div>
                <div style={{ fontSize: 9, color: SLATE, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* last fetch */}
      {lastFetch && (
        <div style={{ fontSize: 9, color: SLATE, marginBottom: 8 }}>
          Last updated: {lastFetch.toLocaleTimeString()} · auto-refresh 60 s
        </div>
      )}

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? "rgba(41,231,255,0.15)" : "transparent",
              border: `1px solid ${filter === t ? CYAN : "rgba(255,255,255,0.1)"}`,
              color: filter === t ? CYAN : SLATE,
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            marginLeft: "auto",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: CYAN,
            fontSize: 10,
            padding: "3px 8px",
            borderRadius: 4,
            fontFamily: "monospace",
            outline: "none",
            width: 130,
          }}
        />
      </div>

      {/* event legend */}
      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
        {[["SEISMIC", RED], ["CRYPTO", CYAN], ["FX", VIOLET]].map(([label, col]) => (
          <span key={label} style={{ fontSize: 9, color: col }}>
            ■ {label} ({events.filter((e) => e.type === label).length})
          </span>
        ))}
      </div>

      {/* loading */}
      {loading && <div style={{ fontSize: 11, color: SLATE, marginBottom: 8 }}>Loading…</div>}

      {/* task list */}
      {!loading && visible.length === 0 && (
        <div style={{ fontSize: 11, color: SLATE }}>No tasks match the current filter.</div>
      )}

      {visible.map((task) => (
        <div
          key={task.id}
          style={{
            marginBottom: 6,
            background: task.triggered
              ? "rgba(255,68,68,0.07)"
              : "rgba(255,255,255,0.03)",
            border: `1px solid ${task.triggered ? "rgba(255,68,68,0.3)" : "rgba(255,255,255,0.07)"}`,
            borderRadius: 6,
            padding: "7px 10px",
          }}
        >
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }}
            onClick={() => setExpanded(expanded === task.id ? null : task.id)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: task.triggered ? RED : CYAN, wordBreak: "break-word" }}>
                {task.title}
              </span>
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 9,
                  padding: "1px 5px",
                  borderRadius: 3,
                  background: `${priorityColor(task.priority)}22`,
                  color: priorityColor(task.priority),
                  border: `1px solid ${priorityColor(task.priority)}44`,
                  verticalAlign: "middle",
                }}
              >
                {(task.priority || "MEDIUM").toUpperCase()}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
              <span
                style={{
                  fontSize: 9,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: task.triggered ? `${RED}22` : `${GREEN}22`,
                  color: task.triggered ? RED : GREEN,
                  border: `1px solid ${task.triggered ? `${RED}44` : `${GREEN}44`}`,
                  fontWeight: 700,
                }}
              >
                {task.triggered ? `TRIGGERED (${task.events.length})` : "DORMANT"}
              </span>
              <span style={{ fontSize: 10, color: SLATE }}>{expanded === task.id ? "▲" : "▼"}</span>
            </div>
          </div>

          {expanded === task.id && (
            <div style={{ marginTop: 8 }}>
              {task.desc && (
                <div style={{ fontSize: 10, color: SLATE, marginBottom: 6, lineHeight: 1.4 }}>
                  {task.desc.slice(0, 200)}
                </div>
              )}
              {task.triggered ? (
                task.events.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 6px",
                      marginBottom: 3,
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: 4,
                      border: `1px solid ${ev.col}22`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 8,
                        padding: "1px 4px",
                        borderRadius: 2,
                        background: `${ev.col}22`,
                        color: ev.col,
                        border: `1px solid ${ev.col}44`,
                        flexShrink: 0,
                      }}
                    >
                      {ev.type}
                    </span>
                    <span style={{ fontSize: 10, color: "#c0d4e4", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.title}
                    </span>
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 3 }}>
                      <div
                        style={{
                          width: Math.min(ev.score * 14, 60),
                          height: 4,
                          background: ev.col,
                          borderRadius: 2,
                          opacity: 0.7,
                        }}
                      />
                      <span style={{ fontSize: 9, color: SLATE }}>{ev.score}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 10, color: SLATE }}>
                  No live world events currently align with this task.
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
