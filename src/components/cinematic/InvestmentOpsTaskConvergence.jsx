/**
 * F288 — Investment × Ops Events × Task Convergence (IOTC)
 *
 * Parallel-fetches /entities/Investment + /v1/ops/events + /entities/Task every 90 s.
 * Keyword-correlates each investment against ops events AND active tasks:
 *
 *  MONITORED  — matches both an ops event and a task
 *  OPS_ONLY   — matches an ops event only
 *  TASK_ONLY  — matches a task only
 *  DARK       — no ops or task coverage (unmonitored investment)
 *
 * Stat tiles: investments / monitored / ops-only / task-only / dark
 * Amber badge on dark count.
 * Filter tabs: ALL / MONITORED / OPS_ONLY / TASK_ONLY / DARK + text search.
 * Expand investment → matched ops events + matched tasks with relevance bars.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IOTC  at left:7020 bottom:18, zIndex:68.
 * Event:   jarvis:iotc-toggle
 * Voice:   "investment ops task / iotc / unmonitored investments / investment task ops /
 *           investment coverage / ops investment task / dark investments / investment monitoring /
 *           investment ops coverage / portfolio monitoring"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const PURPLE = "#9D6FFF";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 7020;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseInvestments(raw) {
  return normaliseArray(raw).map((inv, i) => ({
    id:          String(inv.id ?? inv.investment_id ?? i),
    name:        inv.name ?? inv.title ?? inv.asset ?? `Investment ${i + 1}`,
    description: inv.description ?? inv.summary ?? inv.notes ?? "",
    category:    inv.category ?? inv.type ?? inv.asset_class ?? inv.sector ?? "",
    tags:        Array.isArray(inv.tags) ? inv.tags : [],
    ticker:      inv.ticker ?? inv.symbol ?? "",
    region:      inv.region ?? inv.country ?? "",
  }));
}

function normaliseOpsEvents(raw) {
  return normaliseArray(raw).map((ev, i) => ({
    id:          String(ev.id ?? ev.event_id ?? i),
    name:        ev.title ?? ev.name ?? ev.message ?? `Event ${i + 1}`,
    description: ev.description ?? ev.details ?? ev.body ?? "",
    severity:    ev.severity ?? ev.level ?? ev.priority ?? "INFO",
    service:     ev.service ?? ev.source ?? ev.origin ?? "",
    tags:        Array.isArray(ev.tags) ? ev.tags : [],
  }));
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t, i) => ({
    id:          String(t.id ?? t.task_id ?? i),
    name:        t.title ?? t.name ?? t.summary ?? `Task ${i + 1}`,
    description: t.description ?? t.body ?? t.notes ?? "",
    status:      t.status ?? t.state ?? "OPEN",
    priority:    t.priority ?? t.urgency ?? "MEDIUM",
    tags:        Array.isArray(t.tags) ? t.tags : [],
  }));
}

function tokens(str) {
  return String(str ?? "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreMatch(invTokens, targetText) {
  const tgtTokens = tokens(targetText);
  let hits = 0;
  for (const t of invTokens) {
    if (tgtTokens.some(tt => tt.includes(t) || t.includes(tt))) hits++;
  }
  return hits;
}

function correlate(investments, opsEvents, tasks) {
  return investments.map(inv => {
    const iToks = tokens(
      `${inv.name} ${inv.description} ${inv.category} ${inv.ticker} ${inv.region} ${inv.tags.join(" ")}`
    );

    const matchedOps = opsEvents
      .map(ev => ({
        ...ev,
        score: scoreMatch(iToks, `${ev.name} ${ev.description} ${ev.service} ${ev.tags.join(" ")}`),
      }))
      .filter(ev => ev.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const matchedTasks = tasks
      .map(t => ({
        ...t,
        score: scoreMatch(iToks, `${t.name} ${t.description} ${t.tags.join(" ")}`),
      }))
      .filter(t => t.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const hasOps  = matchedOps.length > 0;
    const hasTask = matchedTasks.length > 0;

    let classification;
    if (hasOps && hasTask)  classification = "MONITORED";
    else if (hasOps)        classification = "OPS_ONLY";
    else if (hasTask)       classification = "TASK_ONLY";
    else                    classification = "DARK";

    return { inv, matchedOps, matchedTasks, classification };
  });
}

function classColour(cls) {
  if (cls === "MONITORED") return GREEN;
  if (cls === "OPS_ONLY")  return CY;
  if (cls === "TASK_ONLY") return PURPLE;
  return AMBER;
}

function sevColour(sev) {
  const s = String(sev ?? "").toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return AMBER;
  if (s === "ERROR")    return RED;
  if (s === "WARNING")  return AMBER;
  return MUTED;
}

function priColour(pri) {
  const p = String(pri ?? "").toUpperCase();
  if (p === "HIGH" || p === "CRITICAL") return AMBER;
  if (p === "LOW")  return MUTED;
  return CY;
}

const TABS = ["ALL", "MONITORED", "OPS_ONLY", "TASK_ONLY", "DARK"];

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isIotcQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes("iotc") ||
    s.includes("investment ops task") ||
    s.includes("unmonitored investments") ||
    s.includes("investment task ops") ||
    s.includes("investment coverage") ||
    s.includes("ops investment task") ||
    s.includes("dark investments") ||
    s.includes("investment monitoring") ||
    s.includes("investment ops coverage") ||
    s.includes("portfolio monitoring") ||
    (s.includes("investment") && s.includes("ops") && s.includes("task"))
  );
}

export async function buildIotcScript() {
  try {
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [iRaw, oRaw, tRaw] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/ops/events`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/entities/Task`, { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]);
    const investments = normaliseInvestments(iRaw);
    const opsEvents   = normaliseOpsEvents(oRaw);
    const tasks       = normaliseTasks(tRaw);
    const results     = correlate(investments, opsEvents, tasks);
    const dark        = results.filter(r => r.classification === "DARK").length;
    const monitored   = results.filter(r => r.classification === "MONITORED").length;
    return `JARVIS Investment × Ops × Task Convergence: ${investments.length} investments correlated against ${opsEvents.length} ops events and ${tasks.length} tasks. ${monitored} investments are fully monitored; ${dark} investments are DARK with no ops or task coverage.`;
  } catch {
    return "IOTC: unable to fetch investment, ops, or task data at this time.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function InvestmentOpsTaskConvergence() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [results,   setResults]   = useState([]);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [brief,     setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [iRaw, oRaw, tRaw] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/ops/events`, { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/Task`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      ]);
      const investments = normaliseInvestments(iRaw);
      const opsEvents   = normaliseOpsEvents(oRaw);
      const tasks       = normaliseTasks(tRaw);
      setResults(correlate(investments, opsEvents, tasks));
    } catch (e) {
      console.error("IOTC load error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => { if (!v) { load(); } return !v; });
    window.addEventListener("jarvis:iotc-toggle", handler);
    return () => window.removeEventListener("jarvis:iotc-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const base   = apiBase();
      const script = await buildIotcScript();
      const resp   = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: `You are JARVIS. In exactly 2 sentences, assess this intelligence: ${script}` }),
      });
      const data = await resp.json();
      const text = data?.response ?? data?.message ?? data?.content ?? script;
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, []);

  const total    = results.length;
  const monitored = results.filter(r => r.classification === "MONITORED").length;
  const opsOnly  = results.filter(r => r.classification === "OPS_ONLY").length;
  const taskOnly = results.filter(r => r.classification === "TASK_ONLY").length;
  const dark     = results.filter(r => r.classification === "DARK").length;

  const filtered = results.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.inv.name.toLowerCase().includes(q) &&
          !r.inv.category.toLowerCase().includes(q) &&
          !r.inv.ticker.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (!open) {
    return (
      <>
        {dark > 0 && (
          <div style={{
            position:       "fixed",
            left:           BTN_LEFT + 26,
            bottom:         28,
            zIndex:         69,
            background:     AMBER,
            color:          "#000",
            borderRadius:   "50%",
            width:          14,
            height:         14,
            fontSize:       8,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            fontWeight:     700,
            fontFamily:     MONO,
            animation:      "iotc-pulse 2s ease-in-out infinite",
            pointerEvents:  "none",
          }}>
            {dark > 9 ? "9+" : dark}
          </div>
        )}
        <button
          onClick={() => { setOpen(true); load(); }}
          title="Investment × Ops Events × Task Convergence (IOTC)"
          style={{
            position:       "fixed",
            left:           BTN_LEFT,
            bottom:         18,
            zIndex:         68,
            background:     "rgba(5,8,13,0.82)",
            border:         `1px solid ${AMBER}55`,
            color:          AMBER,
            padding:        "3px 7px",
            borderRadius:   4,
            cursor:         "pointer",
            fontSize:       9,
            fontFamily:     MONO,
            letterSpacing:  0.5,
            backdropFilter: "blur(4px)",
          }}
        >
          ◈ IOTC
        </button>
        <style>{`@keyframes iotc-pulse{0%,100%{opacity:0.9}50%{opacity:0.3}}`}</style>
      </>
    );
  }

  return (
    <>
      <div style={{
        position:   "fixed",
        left:       BTN_LEFT - 280,
        bottom:     50,
        zIndex:     500,
        width:      420,
        maxHeight:  520,
        overflowY:  "auto",
        background: "rgba(4,8,14,0.96)",
        border:     `1px solid ${AMBER}66`,
        borderRadius: 6,
        fontFamily: MONO,
        fontSize:   10,
        color:      "#C8E0F0",
      }}>
        {/* header */}
        <div style={{ display:"flex", alignItems:"center", padding:"6px 10px", borderBottom:`1px solid ${AMBER}33`, gap:6 }}>
          <span style={{ color: AMBER, fontWeight:700, fontSize:11 }}>◈ INVESTMENT × OPS × TASK</span>
          <span style={{ color: MUTED, fontSize:9, marginLeft:"auto" }}>{total} investments</span>
          <button
            onClick={assess}
            disabled={assessing}
            style={{ background:"transparent", border:`1px solid ${CY}55`, color: CY, padding:"1px 6px", borderRadius:3, cursor:"pointer", fontSize:9 }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{ background:"transparent", border:"none", color: MUTED, cursor:"pointer", fontSize:13, lineHeight:1 }}
          >
            ×
          </button>
        </div>

        {/* stat tiles */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:4, padding:"6px 10px" }}>
          {[
            { label:"INVESTMENTS", val: total,     col: CY     },
            { label:"MONITORED",   val: monitored, col: GREEN  },
            { label:"OPS ONLY",    val: opsOnly,   col: CY     },
            { label:"TASK ONLY",   val: taskOnly,  col: PURPLE },
            { label:"DARK",        val: dark,      col: AMBER  },
          ].map(({ label, val, col }) => (
            <div key={label} style={{ background:"#0C1820", border:`1px solid ${col}33`, borderRadius:4, padding:"4px 0", textAlign:"center" }}>
              <div style={{ color: col, fontWeight:700, fontSize:12 }}>{val}</div>
              <div style={{ color: MUTED, fontSize:7 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* brief */}
        {brief && (
          <div style={{ margin:"0 10px 6px", padding:"5px 8px", background:"#0a1520", border:`1px solid ${CY}33`, borderRadius:4, fontSize:9, color: CY, lineHeight:1.5 }}>
            {brief}
          </div>
        )}

        {/* filter tabs */}
        <div style={{ display:"flex", gap:3, padding:"0 10px 6px", flexWrap:"wrap" }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              style={{
                background:   filter === t ? `${classColour(t)}22` : "transparent",
                border:       `1px solid ${filter === t ? classColour(t) : MUTED + "44"}`,
                color:        filter === t ? classColour(t) : MUTED,
                padding:      "1px 6px",
                borderRadius: 3,
                cursor:       "pointer",
                fontSize:     8,
                fontFamily:   MONO,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* search */}
        <div style={{ padding:"0 10px 6px" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search investments…"
            style={{
              width:        "100%",
              background:   "#0C1820",
              border:       `1px solid ${MUTED}44`,
              color:        "#C8E0F0",
              padding:      "3px 6px",
              borderRadius: 3,
              fontSize:     9,
              fontFamily:   MONO,
              boxSizing:    "border-box",
            }}
          />
        </div>

        {/* rows */}
        {loading && !results.length && (
          <div style={{ padding:"10px", color: MUTED, textAlign:"center" }}>loading…</div>
        )}
        {filtered.map(({ inv, matchedOps, matchedTasks, classification }) => {
          const isExp = expanded === inv.id;
          const col   = classColour(classification);
          return (
            <div
              key={inv.id}
              style={{ borderBottom:`1px solid #1A2A3A`, padding:"4px 10px", cursor:"pointer" }}
              onClick={() => setExpanded(isExp ? null : inv.id)}
            >
              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                <span style={{
                  fontSize:    7,
                  padding:     "0 4px",
                  border:      `1px solid ${col}55`,
                  color:       col,
                  borderRadius: 2,
                  minWidth:    62,
                  textAlign:   "center",
                  flexShrink:  0,
                }}>
                  {classification.replace(/_/g, " ")}
                </span>
                {inv.ticker && (
                  <span style={{ color: MUTED, fontSize:7, flexShrink:0 }}>{inv.ticker}</span>
                )}
                <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontSize:9 }}>
                  {inv.name}
                </span>
              </div>

              {isExp && (
                <div style={{ marginTop:6, paddingLeft:4 }}>
                  {/* ops events */}
                  {matchedOps.length > 0 && (
                    <>
                      <div style={{ color: CY, fontSize:8, marginBottom:3 }}>OPS EVENTS ({matchedOps.length})</div>
                      {matchedOps.map(ev => (
                        <div key={ev.id} style={{ marginBottom:4 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                            <span style={{ fontSize:7, padding:"0 3px", border:`1px solid ${sevColour(ev.severity)}44`, color: sevColour(ev.severity), borderRadius:2 }}>
                              {ev.severity}
                            </span>
                            <span style={{ fontSize:8, color:"#90B8D0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ev.name}</span>
                          </div>
                          <div style={{ height:3, background:"#1A2A3A", borderRadius:2, marginTop:2 }}>
                            <div style={{ width:`${Math.min(100, ev.score * 10)}%`, height:"100%", background: CY, borderRadius:2 }} />
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {/* tasks */}
                  {matchedTasks.length > 0 && (
                    <>
                      <div style={{ color: PURPLE, fontSize:8, marginBottom:3, marginTop: matchedOps.length > 0 ? 6 : 0 }}>
                        TASKS ({matchedTasks.length})
                      </div>
                      {matchedTasks.map(t => (
                        <div key={t.id} style={{ marginBottom:4 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                            <span style={{ fontSize:7, padding:"0 3px", border:`1px solid ${priColour(t.priority)}44`, color: priColour(t.priority), borderRadius:2 }}>
                              {t.priority}
                            </span>
                            <span style={{ fontSize:7, padding:"0 3px", border:`1px solid ${MUTED}44`, color: MUTED, borderRadius:2 }}>
                              {t.status}
                            </span>
                            <span style={{ fontSize:8, color:"#90B8D0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.name}</span>
                          </div>
                          <div style={{ height:3, background:"#1A2A3A", borderRadius:2, marginTop:2 }}>
                            <div style={{ width:`${Math.min(100, t.score * 10)}%`, height:"100%", background: PURPLE, borderRadius:2 }} />
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {matchedOps.length === 0 && matchedTasks.length === 0 && (
                    <div style={{ color: AMBER, fontSize:8 }}>No ops or task coverage — investment is DARK.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!loading && filtered.length === 0 && (
          <div style={{ padding:"10px", color: MUTED, textAlign:"center" }}>no results</div>
        )}

        {/* footer */}
        <div style={{ padding:"4px 10px", borderTop:`1px solid ${AMBER}22`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ color: MUTED, fontSize:8 }}>auto-refresh 90 s</span>
          <button
            onClick={load}
            disabled={loading}
            style={{ background:"transparent", border:`1px solid ${AMBER}33`, color: AMBER, padding:"1px 6px", borderRadius:3, cursor: loading ? "default":"pointer", fontSize:7, fontFamily: MONO }}
          >
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes iotc-pulse {
          0%, 100% { opacity: 0.8; }
          50%       { opacity: 0.2; }
        }
      `}</style>
    </>
  );
}
