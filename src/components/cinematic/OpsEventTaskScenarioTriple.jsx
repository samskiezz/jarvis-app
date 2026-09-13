/**
 * F728 — Ops Events × Task × Scenario Triple Coverage Monitor (OETSCTRI)
 *
 * Parallel-fetches /v1/ops/events + /entities/Task + /v1/scenario/list,
 * then keyword-correlates each ops event against both tasks AND scenarios:
 *
 *   FULLY_PLANNED  — matched ≥1 task AND ≥1 scenario  (fully covered)
 *   TASKED_ONLY    — matched task, no scenario
 *   SCRIPTED_ONLY  — matched scenario, no task
 *   UNPLANNED      — no task, no scenario (operational blind spot)
 *
 * Stat tiles: EVENTS | FULLY_PLANNED | TASKED | SCRIPTED | UNPLANNED
 * Filter tabs: ALL | FULLY_PLANNED | TASKED_ONLY | SCRIPTED_ONLY | UNPLANNED + search
 * Expand event → matched tasks (priority badge) + matched scenarios (kind badge, hit count)
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence ops readiness brief + TTS
 *
 * Button: ◈ OETSCTRI  left:898660 bottom:8 zIndex:587
 * Event:  jarvis:oetsctri-toggle
 * Refresh: 90 s auto-poll
 * Voice:  "oetsctri / ops task scenario / ops triple coverage / unplanned ops /
 *          ops readiness triple / ops scenario coverage / fully planned events /
 *          JARVIS ops coverage"
 */

import { useCallback, useEffect, useRef, useState } from "react";

const CY = "#29E7FF";
const AM = "#FFB347";
const GN = "#39FF14";
const RD = "#FF4444";
const BTN_LEFT  = 898660;
const POLL_MS   = 90_000;
const API_KEY   = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  return env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8000";
}

function keywords(obj) {
  return [obj.title, obj.description, obj.type, obj.severity, obj.name, obj.kind, obj.priority, obj.status]
    .filter(Boolean).join(" ").toLowerCase();
}

function score(eventKw, thingKw) {
  const words = eventKw.split(/\s+/).filter((w) => w.length > 3);
  let hits = 0;
  for (const w of words) if (thingKw.includes(w)) hits++;
  return hits;
}

function classify(ev, tasks, scenarios) {
  const ekw = keywords(ev);
  const matchedTasks = tasks
    .map((t) => ({ ...t, hits: score(ekw, keywords(t)) }))
    .filter((t) => t.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5);
  const matchedScenarios = scenarios
    .map((s) => ({ ...s, hits: score(ekw, keywords(s)) }))
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5);
  const hasTasks = matchedTasks.length > 0;
  const hasScenarios = matchedScenarios.length > 0;
  const status =
    hasTasks && hasScenarios ? "FULLY_PLANNED" :
    hasTasks                 ? "TASKED_ONLY" :
    hasScenarios             ? "SCRIPTED_ONLY" :
                               "UNPLANNED";
  return { ...ev, status, matchedTasks, matchedScenarios };
}

async function fetchAll() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [evR, tskR, scnR] = await Promise.all([
    fetch(`${base}/v1/ops/events`, { headers }),
    fetch(`${base}/entities/Task`, { headers }),
    fetch(`${base}/v1/scenario/list`, { headers }),
  ]);
  const evData  = await evR.json().catch(() => ({}));
  const tskData = await tskR.json().catch(() => ({}));
  const scnData = await scnR.json().catch(() => ({}));
  const events    = (evData.events || evData.items || evData.data || []).slice(0, 200);
  const tasks     = (tskData.items || tskData.data || tskData.tasks || []).slice(0, 200);
  const scenarios = (scnData.scenarios || scnData.items || scnData.data || []).slice(0, 200);
  return { events, tasks, scenarios };
}

/* ── voice integration exports ── */

export function isOetsctriQuery(q) {
  const lq = q.toLowerCase();
  return (
    lq.includes("oetsctri") ||
    lq.includes("ops task scenario") ||
    lq.includes("ops triple coverage") ||
    lq.includes("unplanned ops") ||
    lq.includes("ops readiness triple") ||
    lq.includes("ops scenario coverage") ||
    lq.includes("fully planned events") ||
    (lq.includes("ops") && lq.includes("scenario") && lq.includes("coverage")) ||
    (lq.includes("ops") && lq.includes("triple"))
  );
}

export async function buildOetsctriScript() {
  try {
    const { events, tasks, scenarios } = await fetchAll();
    const classified = events.map((ev) => classify(ev, tasks, scenarios));
    const fp  = classified.filter((e) => e.status === "FULLY_PLANNED").length;
    const tk  = classified.filter((e) => e.status === "TASKED_ONLY").length;
    const sc  = classified.filter((e) => e.status === "SCRIPTED_ONLY").length;
    const up  = classified.filter((e) => e.status === "UNPLANNED").length;
    const pct = events.length ? Math.round((fp / events.length) * 100) : 0;
    return (
      `OETSCTRI ops readiness summary, sir: ${events.length} ops events cross-referenced against ` +
      `${tasks.length} tasks and ${scenarios.length} scenarios. ` +
      `${fp} events FULLY PLANNED, ${tk} TASKED ONLY, ${sc} SCRIPTED ONLY, ${up} UNPLANNED. ` +
      `Operational coverage ${pct}%. ` +
      (up > 0 ? `${up} event${up !== 1 ? "s" : ""} require immediate tasking and scenario coverage.` :
                "All events have task or scenario backing.")
    );
  } catch {
    return "OETSCTRI triple coverage check offline. Ops events, tasks, or scenarios endpoint unreachable.";
  }
}

/* ── component ── */

const TABS  = ["ALL", "FULLY_PLANNED", "TASKED_ONLY", "SCRIPTED_ONLY", "UNPLANNED"];
const TAB_COLORS = {
  ALL: CY, FULLY_PLANNED: GN, TASKED_ONLY: CY, SCRIPTED_ONLY: AM, UNPLANNED: RD,
};
const STATUS_COLORS = {
  FULLY_PLANNED: GN, TASKED_ONLY: CY, SCRIPTED_ONLY: AM, UNPLANNED: RD,
};

export default function OpsEventTaskScenarioTriple() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [totalTasks, setTotalTasks]     = useState(0);
  const [totalScenarios, setTotalScenarios] = useState(0);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { events, tasks, scenarios } = await fetchAll();
      setTotalTasks(tasks.length);
      setTotalScenarios(scenarios.length);
      setRows(events.map((ev) => classify(ev, tasks, scenarios)));
    } catch { /* silent — network down */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:oetsctri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:oetsctri-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fp  = rows.filter((r) => r.status === "FULLY_PLANNED").length;
  const tk  = rows.filter((r) => r.status === "TASKED_ONLY").length;
  const sc  = rows.filter((r) => r.status === "SCRIPTED_ONLY").length;
  const up  = rows.filter((r) => r.status === "UNPLANNED").length;

  const filtered = rows
    .filter((r) => tab === "ALL" || r.status === tab)
    .filter((r) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return keywords(r).includes(s);
    });

  async function assess() {
    setAssessing(true);
    try {
      const base = apiBase();
      const pct = rows.length ? Math.round((fp / rows.length) * 100) : 0;
      const prompt =
        `OETSCTRI: ${rows.length} ops events — ${fp} fully planned, ${tk} tasked-only, ` +
        `${sc} scripted-only, ${up} unplanned. Coverage ${pct}%. ` +
        `Worst unplanned: ${rows.filter((r) => r.status === "UNPLANNED").slice(0, 3).map((r) => r.title || r.type || "event").join(", ")}. ` +
        `Give a 2-sentence ops readiness assessment.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "Assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessment("Assessment endpoint unreachable.");
    }
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ops Events × Task × Scenario Triple (OETSCTRI)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 587,
          background: "rgba(0,4,10,0.85)", border: `1px solid ${up > 0 ? AM : CY}44`,
          borderRadius: 6, color: up > 0 ? AM : CY,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
        }}
      >
        ◈ OETSCTRI
        {up > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>{up}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 24, width: 620, maxHeight: "80vh",
      background: "rgba(2,8,16,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 14, zIndex: 9100, display: "flex", flexDirection: "column",
      fontFamily: "'JetBrains Mono', monospace", overflow: "hidden",
      boxShadow: `0 0 60px ${CY}18`,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
          ◈ OPS EVENTS × TASK × SCENARIO — OETSCTRI
          {loading && <span style={{ color: AM, marginLeft: 8 }}>⟳</span>}
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexShrink: 0 }}>
        {[
          { label: "EVENTS",        value: rows.length,  color: CY },
          { label: "FULLY PLANNED", value: fp,           color: GN },
          { label: "TASKED",        value: tk,           color: CY },
          { label: "SCRIPTED",      value: sc,           color: AM },
          { label: "UNPLANNED",     value: up,           color: RD },
        ].map((t) => (
          <div key={t.label} style={{
            flex: 1, background: "rgba(255,255,255,0.03)", border: `1px solid ${t.color}22`,
            borderRadius: 8, padding: "6px 4px", textAlign: "center",
          }}>
            <div style={{ color: t.color, fontSize: 16, fontWeight: 700 }}>{t.value}</div>
            <div style={{ color: "#4E6070", fontSize: 7, letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ padding: "0 16px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${TAB_COLORS[t]}22` : "transparent",
              border: `1px solid ${tab === t ? TAB_COLORS[t] : "#1a2a35"}`,
              borderRadius: 5, color: tab === t ? TAB_COLORS[t] : "#4E6070",
              fontSize: 8, letterSpacing: 1, padding: "3px 6px", cursor: "pointer",
            }}>{t.replace("_", " ")}</button>
          ))}
        </div>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ops events…"
          style={{
            width: "100%", background: "rgba(41,231,255,0.04)",
            border: `1px solid ${CY}22`, borderRadius: 6,
            color: "#DCEBF5", fontSize: 11, padding: "5px 10px",
            fontFamily: "inherit", outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 8px" }}>
        {filtered.length === 0 && (
          <div style={{ color: "#4E6070", fontSize: 11, textAlign: "center", padding: 24 }}>
            No ops events match this filter.
          </div>
        )}
        {filtered.map((ev, i) => {
          const isExp = expanded === i;
          const col   = STATUS_COLORS[ev.status] || CY;
          return (
            <div key={i} style={{
              borderLeft: `2px solid ${col}`,
              background: "rgba(255,255,255,0.02)", borderRadius: 6,
              marginBottom: 5, overflow: "hidden", cursor: "pointer",
            }} onClick={() => setExpanded(isExp ? null : i)}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
              }}>
                <span style={{
                  background: `${col}22`, color: col, border: `1px solid ${col}44`,
                  borderRadius: 4, padding: "1px 5px", fontSize: 8, letterSpacing: 1, flexShrink: 0,
                }}>{ev.status.replace("_", " ")}</span>
                {ev.severity && (
                  <span style={{ color: "#4E6070", fontSize: 8 }}>[{ev.severity}]</span>
                )}
                <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, minWidth: 0 }}>
                  {(ev.title || ev.type || ev.description || "Ops Event").slice(0, 60)}
                </span>
                <span style={{ color: "#2E4050", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 10px 10px", borderTop: `1px solid ${CY}11` }}>
                  {ev.description && (
                    <p style={{ color: "#7A95AB", fontSize: 10, margin: "6px 0" }}>{ev.description.slice(0, 200)}</p>
                  )}
                  {/* Matched tasks */}
                  <div style={{ marginTop: 6 }}>
                    <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                      MATCHED TASKS ({ev.matchedTasks.length})
                    </div>
                    {ev.matchedTasks.length === 0 && (
                      <div style={{ color: "#4E6070", fontSize: 9 }}>No task match</div>
                    )}
                    {ev.matchedTasks.map((t, j) => (
                      <div key={j} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${CY}11`,
                      }}>
                        {t.priority && (
                          <span style={{
                            background: `${CY}18`, color: CY, border: `1px solid ${CY}33`,
                            borderRadius: 3, padding: "0 4px", fontSize: 8,
                          }}>{t.priority}</span>
                        )}
                        <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                          {(t.title || t.name || "Task").slice(0, 50)}
                        </span>
                        <span style={{ color: AM, fontSize: 9 }}>{t.hits} hit{t.hits !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                  {/* Matched scenarios */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ color: AM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                      MATCHED SCENARIOS ({ev.matchedScenarios.length})
                    </div>
                    {ev.matchedScenarios.length === 0 && (
                      <div style={{ color: "#4E6070", fontSize: 9 }}>No scenario match</div>
                    )}
                    {ev.matchedScenarios.map((s, j) => (
                      <div key={j} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${AM}11`,
                      }}>
                        {s.kind && (
                          <span style={{
                            background: `${AM}18`, color: AM, border: `1px solid ${AM}33`,
                            borderRadius: 3, padding: "0 4px", fontSize: 8,
                          }}>{s.kind}</span>
                        )}
                        <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                          {(s.name || s.title || "Scenario").slice(0, 50)}
                        </span>
                        <span style={{ color: AM, fontSize: 9 }}>{s.hits} hit{s.hits !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment */}
      {assessment && (
        <div style={{
          margin: "0 16px 8px", padding: "8px 12px",
          background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}22`,
          borderRadius: 8, color: "#DCEBF5", fontSize: 11, lineHeight: 1.5,
        }}>
          {assessment}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: "flex", gap: 8, padding: "8px 16px",
        borderTop: `1px solid ${CY}1A`, flexShrink: 0,
      }}>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: assessing ? "rgba(41,231,255,0.04)" : `${CY}15`,
          border: `1px solid ${CY}44`, borderRadius: 6, color: CY,
          fontFamily: "inherit", fontSize: 10, letterSpacing: 1,
          padding: "5px 0", cursor: assessing ? "default" : "pointer",
        }}>
          {assessing ? "⟳ ASSESSING…" : "▶ ASSESS"}
        </button>
        <button onClick={load} style={{
          background: "rgba(255,255,255,0.03)", border: `1px solid ${CY}22`,
          borderRadius: 6, color: "#4E6070", fontFamily: "inherit",
          fontSize: 10, padding: "5px 10px", cursor: "pointer",
        }}>⟳ REFRESH</button>
        <span style={{ color: "#2E4050", fontSize: 9, alignSelf: "center", marginLeft: "auto" }}>
          {filtered.length} / {rows.length} events · {totalTasks} tasks · {totalScenarios} scenarios
        </span>
      </div>

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${CY}33; border-radius: 2px; }
      `}</style>
    </div>
  );
}
