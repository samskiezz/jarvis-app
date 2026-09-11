/**
 * F289 — IntelProfile × Scenario × Task Intelligence Triple (IPST)
 *
 * Parallel-fetches /entities/IntelProfile + /v1/scenario/list + /entities/Task every 90 s.
 * Keyword-correlates each intel profile against response scenarios AND active tasks:
 *
 *  FULLY_MANAGED  — matches both a scenario and a task
 *  SCENARIO_ONLY  — matches a scenario only
 *  TASK_ONLY      — matches a task only
 *  DARK           — no scenario or task coverage (unmanaged intel profile)
 *
 * Stat tiles: profiles / fully-managed / scenario-only / task-only / dark
 * Amber badge on dark count.
 * Filter tabs: ALL / FULLY_MANAGED / SCENARIO_ONLY / TASK_ONLY / DARK + text search.
 * Expand profile → matched scenarios + matched tasks with relevance bars.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IPST  at left:7080 bottom:18, zIndex:68.
 * Event:   jarvis:ipst-toggle
 * Voice:   "intel scenario task / ipst / managed intel / intel without task /
 *           intel without scenario / dark intel profile / intel profile mesh /
 *           unmanaged intel / intel profile coverage / profile task scenario"
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

const BTN_LEFT   = 7080;
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

function normaliseProfiles(raw) {
  return normaliseArray(raw).map((p, i) => ({
    id:           String(p.id ?? p.profile_id ?? i),
    name:         p.name ?? p.subject ?? p.title ?? `Profile ${i + 1}`,
    description:  p.description ?? p.summary ?? p.bio ?? "",
    role:         p.role ?? p.position ?? p.occupation ?? "",
    organization: p.organization ?? p.org ?? p.company ?? "",
    aliases:      Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases ?? ""),
    tags:         Array.isArray(p.tags) ? p.tags : [],
  }));
}

function normaliseScenarios(raw) {
  return normaliseArray(raw).map((s, i) => ({
    id:          String(s.id ?? s.scenario_id ?? i),
    name:        s.name ?? s.title ?? s.label ?? `Scenario ${i + 1}`,
    description: s.description ?? s.summary ?? s.objective ?? "",
    type:        s.type ?? s.category ?? s.kind ?? "",
    status:      s.status ?? s.state ?? "",
    tags:        Array.isArray(s.tags) ? s.tags : [],
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

function scoreMatch(profileTokens, targetText) {
  const tgtTokens = tokens(targetText);
  let hits = 0;
  for (const t of profileTokens) {
    if (tgtTokens.some(tt => tt.includes(t) || t.includes(tt))) hits++;
  }
  return hits;
}

function correlate(profiles, scenarios, tasks) {
  return profiles.map(p => {
    const pTokens = tokens(
      [p.name, p.description, p.role, p.organization, p.aliases, ...p.tags].join(" ")
    );

    const matchedScenarios = scenarios
      .map(s => {
        const score = scoreMatch(pTokens, [s.name, s.description, ...s.tags].join(" "));
        return { ...s, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const matchedTasks = tasks
      .map(t => {
        const score = scoreMatch(pTokens, [t.name, t.description, ...t.tags].join(" "));
        return { ...t, score };
      })
      .filter(t => t.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const hasScen = matchedScenarios.length > 0;
    const hasTask = matchedTasks.length > 0;

    const classification =
      hasScen && hasTask ? "FULLY_MANAGED"  :
      hasScen             ? "SCENARIO_ONLY"  :
      hasTask             ? "TASK_ONLY"      :
                            "DARK";

    return { profile: p, matchedScenarios, matchedTasks, classification };
  });
}

// ─── intent helpers (exported for JarvisBrain) ───────────────────────────────

export function isIpstQuery(q) {
  const lower = String(q ?? "").toLowerCase();
  return (
    lower.includes("ipst") ||
    (lower.includes("intel") && lower.includes("scenario") && lower.includes("task")) ||
    lower.includes("managed intel") ||
    lower.includes("intel without task") ||
    lower.includes("intel without scenario") ||
    lower.includes("dark intel profile") ||
    lower.includes("intel profile mesh") ||
    lower.includes("unmanaged intel") ||
    lower.includes("intel profile coverage") ||
    lower.includes("profile task scenario")
  );
}

export async function buildIpstScript() {
  try {
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [pRaw, sRaw, tRaw] = await Promise.all([
      fetch(`${apiBase}/entities/IntelProfile`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${apiBase}/v1/scenario/list`,      { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${apiBase}/entities/Task`,         { headers }).then(r => r.ok ? r.json() : []),
    ]);
    const profiles  = normaliseProfiles(pRaw);
    const scenarios = normaliseScenarios(sRaw);
    const tasks     = normaliseTasks(tRaw);
    const results   = correlate(profiles, scenarios, tasks);
    const dark      = results.filter(r => r.classification === "FULLY_MANAGED").length;
    const darkC     = results.filter(r => r.classification === "DARK").length;
    return `Intel Profile × Scenario × Task Mesh: ${profiles.length} profiles assessed — ` +
           `${dark} fully managed (both scenario and task), ${darkC} DARK with no coverage. ` +
           `Open IPST panel for the full breakdown.`;
  } catch {
    return "Intel profile scenario task mesh unavailable. Open IPST panel to investigate.";
  }
}

// ─── colour helpers ───────────────────────────────────────────────────────────

const TABS = ["ALL", "FULLY_MANAGED", "SCENARIO_ONLY", "TASK_ONLY", "DARK"];

function classColour(cls) {
  if (cls === "FULLY_MANAGED")  return GREEN;
  if (cls === "SCENARIO_ONLY")  return CY;
  if (cls === "TASK_ONLY")      return PURPLE;
  return AMBER;
}

function priColour(p) {
  const lp = String(p ?? "").toUpperCase();
  if (lp === "CRITICAL" || lp === "HIGH")   return RED;
  if (lp === "MEDIUM")                      return AMBER;
  return GREEN;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function IntelProfileScenarioTaskMesh() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [results,   setResults]   = useState([]);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [brief,     setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [pRaw, sRaw, tRaw] = await Promise.all([
        fetch(`${apiBase}/entities/IntelProfile`, { headers }).then(r => r.ok ? r.json() : []),
        fetch(`${apiBase}/v1/scenario/list`,      { headers }).then(r => r.ok ? r.json() : []),
        fetch(`${apiBase}/entities/Task`,         { headers }).then(r => r.ok ? r.json() : []),
      ]);
      const profiles  = normaliseProfiles(pRaw);
      const scenarios = normaliseScenarios(sRaw);
      const tasks     = normaliseTasks(tRaw);
      setResults(correlate(profiles, scenarios, tasks));
    } catch {
      // silent — show stale data
    } finally {
      setLoading(false);
    }
  }, []);

  // auto-refresh
  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  // toggle event
  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:ipst-toggle", handler);
    return () => window.removeEventListener("jarvis:ipst-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const headers = {
        Authorization:  `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      };
      const context = results.slice(0, 12).map(r =>
        `${r.profile.name} [${r.classification}]`
      ).join(", ");
      const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers,
        body: JSON.stringify({
          message: `Assess this intel profile × scenario × task coverage snapshot in 2 sentences: ${context}`,
        }),
      });
      if (res.ok) {
        const data  = await res.json();
        const text  = data.response ?? data.message ?? data.text ?? "";
        setBrief(text);
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, [results]);

  // derived counts
  const total      = results.length;
  const fullyMgd   = results.filter(r => r.classification === "FULLY_MANAGED").length;
  const scnOnly    = results.filter(r => r.classification === "SCENARIO_ONLY").length;
  const taskOnly   = results.filter(r => r.classification === "TASK_ONLY").length;
  const dark       = results.filter(r => r.classification === "DARK").length;

  const filtered = results.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        r.profile.name.toLowerCase().includes(s) ||
        r.profile.organization.toLowerCase().includes(s) ||
        r.profile.role.toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Intel Profile × Scenario × Task Mesh (IPST)"
        style={{
          position:    "fixed",
          left:        BTN_LEFT,
          bottom:      18,
          zIndex:      68,
          background:  open ? `${AMBER}22` : "rgba(10,20,30,0.85)",
          border:      `1px solid ${open ? AMBER : AMBER + "55"}`,
          color:       AMBER,
          padding:     "3px 8px",
          borderRadius: 4,
          cursor:      "pointer",
          fontSize:    9,
          fontFamily:  MONO,
          display:     "flex",
          alignItems:  "center",
          gap:         4,
          whiteSpace:  "nowrap",
        }}
      >
        ◈ IPST
        {dark > 0 && (
          <span style={{
            background:   AMBER,
            color:        "#000",
            borderRadius: "50%",
            width:        14,
            height:       14,
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
            fontSize:     7,
            fontWeight:   700,
          }}>
            {dark > 99 ? "99+" : dark}
          </span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div
          style={{
            position:    "fixed",
            left:        BTN_LEFT,
            bottom:      44,
            width:       420,
            maxHeight:   520,
            overflowY:   "auto",
            zIndex:      68,
            background:  "rgba(8,16,26,0.97)",
            border:      `1px solid ${AMBER}55`,
            borderRadius: 6,
            fontFamily:  MONO,
            fontSize:    10,
            color:       "#C8E0F0",
          }}
        >
          {/* header */}
          <div style={{ display:"flex", alignItems:"center", padding:"6px 10px", borderBottom:`1px solid ${AMBER}33`, gap:6 }}>
            <span style={{ color: AMBER, fontWeight:700, fontSize:11 }}>◈ INTEL PROFILE × SCENARIO × TASK</span>
            <span style={{ color: MUTED, fontSize:9, marginLeft:"auto" }}>{total} profiles</span>
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
              { label:"PROFILES",   val: total,    col: CY     },
              { label:"FULLY MGD",  val: fullyMgd, col: GREEN  },
              { label:"SCEN ONLY",  val: scnOnly,  col: CY     },
              { label:"TASK ONLY",  val: taskOnly, col: PURPLE },
              { label:"DARK",       val: dark,     col: AMBER  },
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
                {t.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          {/* search */}
          <div style={{ padding:"0 10px 6px" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search profiles…"
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
          {filtered.map(({ profile: p, matchedScenarios, matchedTasks, classification }) => {
            const isExp = expanded === p.id;
            const col   = classColour(classification);
            return (
              <div
                key={p.id}
                style={{ borderBottom:`1px solid #1A2A3A`, padding:"4px 10px", cursor:"pointer" }}
                onClick={() => setExpanded(isExp ? null : p.id)}
              >
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{
                    fontSize:    7,
                    padding:     "0 4px",
                    border:      `1px solid ${col}55`,
                    color:       col,
                    borderRadius: 2,
                    minWidth:    74,
                    textAlign:   "center",
                    flexShrink:  0,
                  }}>
                    {classification.replace(/_/g, " ")}
                  </span>
                  {p.role && (
                    <span style={{ color: MUTED, fontSize:7, flexShrink:0, maxWidth:70, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.role}</span>
                  )}
                  <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontSize:9 }}>
                    {p.name}
                  </span>
                </div>

                {isExp && (
                  <div style={{ marginTop:6, paddingLeft:4 }}>
                    {/* scenarios */}
                    {matchedScenarios.length > 0 && (
                      <>
                        <div style={{ color: CY, fontSize:8, marginBottom:3 }}>SCENARIOS ({matchedScenarios.length})</div>
                        {matchedScenarios.map(s => (
                          <div key={s.id} style={{ marginBottom:4 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                              {s.type && (
                                <span style={{ fontSize:7, padding:"0 3px", border:`1px solid ${CY}44`, color: CY, borderRadius:2 }}>
                                  {s.type}
                                </span>
                              )}
                              <span style={{ fontSize:8, color:"#90B8D0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.name}</span>
                            </div>
                            <div style={{ height:3, background:"#1A2A3A", borderRadius:2, marginTop:2 }}>
                              <div style={{ width:`${Math.min(100, s.score * 10)}%`, height:"100%", background: CY, borderRadius:2 }} />
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                    {/* tasks */}
                    {matchedTasks.length > 0 && (
                      <>
                        <div style={{ color: PURPLE, fontSize:8, marginBottom:3, marginTop: matchedScenarios.length > 0 ? 6 : 0 }}>
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
                    {matchedScenarios.length === 0 && matchedTasks.length === 0 && (
                      <div style={{ color: AMBER, fontSize:8 }}>No scenario or task coverage — profile is DARK.</div>
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
      )}

      <style>{`
        @keyframes ipst-pulse {
          0%, 100% { opacity: 0.8; }
          50%       { opacity: 0.2; }
        }
      `}</style>
    </>
  );
}
