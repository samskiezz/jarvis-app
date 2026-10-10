/**
 * F192 — OpsEvent × Task × AIP Skill — Operational Response Automation Readiness (ORAR)
 *
 * Parallel-fetches /v1/ops/events + /entities/Task + /v1/aip/skill every 90 s.
 * Keyword-correlates each ops event (by name/description/type/severity) against
 * the open task catalog AND the AIP skill catalog:
 *
 *   FULLY_AUTOMATED — backed by ≥1 task AND ≥1 skill (response fully covered)
 *   TASK_BACKED     — tasks linked, no skill automation
 *   SKILL_BACKED    — skill exists, no task assigned
 *   MANUAL          — neither tasks nor skills (pure manual response required)
 *
 * Stat tiles: events / tasks / skills / fully automated / manual
 * Filter tabs: ALL | FULLY_AUTOMATED | TASK_BACKED | SKILL_BACKED | MANUAL
 * Text search on event name/type/severity.
 * Expand row → matched tasks (amber bars) + matched skills (green bars).
 * Red badge + pulse on MANUAL count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence readiness brief + TTS.
 *
 * Toggle:  ◈ ORAR  at bottom:8 left:984560, zIndex:693.
 * Event:   jarvis:orar-toggle
 * Voice:   "orar / operational response automation / ops event task skill /
 *           manual ops event / unautomated event / response readiness /
 *           event automation coverage / ops readiness"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 984_560;
const POLL_MS  = 90_000;
const CY       = "#29E7FF";
const AMBER    = "#FFB020";
const RED      = "#FF4545";
const GREEN    = "#00FF88";
const MONO     = "'JetBrains Mono',monospace";

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const ORAR_RE =
  /\b(orar|operational\s+response\s+automation|ops\s+event\s+task\s+skill|manual\s+ops\s+event|unautomated\s+event|response\s+readiness|event\s+automation\s+coverage|ops\s+readiness)\b/i;

export function isOrarQuery(q) {
  return ORAR_RE.test(q || "");
}

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (v.events)   return v.events;
  if (v.tasks)    return v.tasks;
  if (v.skills)   return v.skills;
  if (v.items)    return v.items;
  if (v.data)     return Array.isArray(v.data) ? v.data : [];
  return [];
}

function keywords(obj) {
  if (!obj) return [];
  const raw = [
    obj.name, obj.title, obj.type, obj.severity, obj.description,
    obj.summary, obj.status, obj.id, obj.event_type,
  ].filter(Boolean).join(" ").toLowerCase();
  return raw.split(/[\s,;|_/-]+/).filter(w => w.length > 2);
}

function matchKws(kws, obj) {
  if (!kws.length) return false;
  const hay = [
    obj.name, obj.title, obj.type, obj.description, obj.summary,
    obj.tags, obj.status, obj.category, obj.skill_type, obj.objective,
  ].filter(Boolean).join(" ").toLowerCase();
  return kws.some(k => hay.includes(k));
}

export async function buildOrarScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [evr, taskr, skillr] = await Promise.allSettled([
      fetch(`${base}/v1/ops/events`,   { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/entities/Task`,   { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/aip/skill`,    { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const events = toArr(evr.value);
    const tasks  = toArr(taskr.value);
    const skills = toArr(skillr.value);
    let manual = 0;

    for (const ev of events) {
      const kws = keywords(ev);
      const hasTask  = tasks.some(t => matchKws(kws, t));
      const hasSkill = skills.some(s => matchKws(kws, s));
      if (!hasTask && !hasSkill) manual++;
    }

    return `ORAR analysis: ${events.length} ops event${events.length !== 1 ? "s" : ""} vs ` +
      `${tasks.length} tasks × ${skills.length} skills. ` +
      `${manual} event${manual !== 1 ? "s have" : " has"} no task or skill coverage — ` +
      `purely manual response required. Recommend creating response tasks and mapping automation skills.`;
  } catch (e) {
    return `ORAR error: ${e.message}`;
  }
}

// ── Classification helpers ────────────────────────────────────────────────────

const CLASS_COLOR = {
  FULLY_AUTOMATED: GREEN,
  TASK_BACKED:     AMBER,
  SKILL_BACKED:    CY,
  MANUAL:          RED,
};

function classify(ev, tasks, skills) {
  const kws = keywords(ev);
  const hasTask  = tasks.some(t => matchKws(kws, t));
  const hasSkill = skills.some(s => matchKws(kws, s));
  if (hasTask && hasSkill)  return "FULLY_AUTOMATED";
  if (hasTask && !hasSkill) return "TASK_BACKED";
  if (!hasTask && hasSkill) return "SKILL_BACKED";
  return "MANUAL";
}

function topMatches(kws, pool, n = 4) {
  return pool
    .map(obj => {
      const hay = [
        obj.name, obj.title, obj.type, obj.description, obj.summary,
        obj.tags, obj.status, obj.category, obj.skill_type, obj.objective,
      ].filter(Boolean).join(" ").toLowerCase();
      const score = kws.filter(k => hay.includes(k)).length;
      return { obj, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.obj);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OpsEventTaskSkillReadiness() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [events,    setEvents]    = useState([]);
  const [tasks,     setTasks]     = useState([]);
  const [skills,    setSkills]    = useState([]);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [assessTxt, setAssessTxt] = useState({});
  const [loading,   setLoading]   = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [er, tr, sr] = await Promise.allSettled([
        fetch(`${base}/v1/ops/events`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/Task`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/aip/skill`,  { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const evs  = toArr(er.value);
      const tsks = toArr(tr.value);
      const skls = toArr(sr.value);
      setEvents(evs); setTasks(tsks); setSkills(skls);
      setRows(evs.map(ev => ({
        ev,
        cls: classify(ev, tsks, skls),
        kws: keywords(ev),
      })));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => !o); if (!rows.length) load(); };
    window.addEventListener("jarvis:orar-toggle", onToggle);
    return () => window.removeEventListener("jarvis:orar-toggle", onToggle);
  }, [load, rows.length]);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const TABS = ["ALL", "FULLY_AUTOMATED", "TASK_BACKED", "SKILL_BACKED", "MANUAL"];
  const manualCount = rows.filter(r => r.cls === "MANUAL").length;

  const displayed = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const hay = [r.ev.name, r.ev.title, r.ev.type, r.ev.severity].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess(ev, kws) {
    const id = ev.id || ev.name;
    setAssessing(id);
    const base = apiBase();
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
    const matchedTasks  = topMatches(kws, tasks);
    const matchedSkills = topMatches(kws, skills);
    const prompt =
      `Ops event: "${ev.name || ev.title}" (severity: ${ev.severity || "unknown"}). ` +
      `Matched tasks: ${matchedTasks.map(t => t.name || t.title).join(", ") || "none"}. ` +
      `Matched skills: ${matchedSkills.map(s => s.name || s.title).join(", ") || "none"}. ` +
      `In 2 sentences, assess this event's operational response automation readiness.`;
    try {
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: h,
        body: JSON.stringify({ message: prompt }),
      });
      const d   = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
      setAssessTxt(prev => ({ ...prev, [id]: txt }));
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessTxt(prev => ({ ...prev, [id]: "Assessment unavailable." }));
    }
    setAssessing(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); if (!rows.length) load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 693,
          background: "rgba(5,8,14,0.82)", border: `1px solid ${manualCount > 0 ? RED : CY}55`,
          borderRadius: 6, color: manualCount > 0 ? RED : CY,
          fontSize: 10, fontFamily: MONO, letterSpacing: 2,
          padding: "3px 8px", cursor: "pointer",
          boxShadow: manualCount > 0 ? `0 0 12px ${RED}44` : "none",
          animation: manualCount > 0 ? "orar-pulse 2s ease-in-out infinite" : "none",
        }}
      >
        ◈ ORAR{manualCount > 0 ? ` [${manualCount}]` : ""}
        <style>{`@keyframes orar-pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 40, left: BTN_LEFT - 300, zIndex: 693,
      width: 660, maxHeight: "72vh",
      background: "rgba(5,9,16,0.97)", border: `1px solid ${CY}33`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 60px ${CY}14, 0 24px 48px rgba(0,0,0,0.85)`,
      fontFamily: MONO, display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 3, flex: 1 }}>OPERATIONAL RESPONSE AUTOMATION READINESS</span>
        {loading && <span style={{ color: "#4E6070", fontSize: 9 }}>refreshing…</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: "#4E6070",
          cursor: "pointer", fontSize: 14, padding: 0,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}11` }}>
        {[
          { label: "events",    val: events.length,                                        col: CY    },
          { label: "tasks",     val: tasks.length,                                         col: AMBER },
          { label: "skills",    val: skills.length,                                        col: GREEN },
          { label: "automated", val: rows.filter(r => r.cls === "FULLY_AUTOMATED").length, col: GREEN },
          { label: "manual",    val: manualCount,                                          col: RED   },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 6,
            padding: "5px 4px", textAlign: "center",
            border: `1px solid ${col}22`,
          }}>
            <div style={{ color: col, fontSize: 15, fontWeight: "bold" }}>{val}</div>
            <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>{label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${CY}11`, flexWrap: "wrap" }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setFilter(tab)} style={{
            background: filter === tab ? `${CY}18` : "transparent",
            border: `1px solid ${filter === tab ? CY : CY + "22"}`,
            borderRadius: 4, color: filter === tab ? CY : "#4E6070",
            fontSize: 9, letterSpacing: 1, padding: "2px 7px", cursor: "pointer",
          }}>{tab.replace("_", " ")}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search events…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.04)",
            border: `1px solid ${CY}22`, borderRadius: 4,
            color: "#DCEBF5", fontSize: 9, padding: "2px 7px",
            fontFamily: MONO, outline: "none",
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {displayed.length === 0 && (
          <div style={{ padding: "20px 14px", color: "#4E6070", fontSize: 11, textAlign: "center" }}>
            {loading ? "loading…" : "no events"}
          </div>
        )}
        {displayed.map(({ ev, cls, kws }) => {
          const id = ev.id || ev.name;
          const isExp = expanded === id;
          const matchedTasks  = topMatches(kws, tasks);
          const matchedSkills = topMatches(kws, skills);
          const col = CLASS_COLOR[cls] || CY;
          return (
            <div key={id} style={{ borderBottom: `1px solid ${CY}0F` }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 14px", cursor: "pointer",
                  background: isExp ? "rgba(41,231,255,0.05)" : "transparent",
                }}
              >
                <span style={{ color: col, fontSize: 9, letterSpacing: 1, flexShrink: 0, width: 130 }}>
                  {cls.replace(/_/g, " ")}
                </span>
                <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ev.name || ev.title || id}
                </span>
                <span style={{ color: "#4E6070", fontSize: 9, flexShrink: 0 }}>
                  {ev.severity || ev.type || ""}
                </span>
                <span style={{ color: "#2E4050", fontSize: 10, flexShrink: 0 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 14px 10px", background: "rgba(0,0,0,0.2)" }}>
                  {/* Tasks */}
                  <div style={{ fontSize: 9, color: "#4E6070", letterSpacing: 1, marginBottom: 4 }}>
                    TASKS ({matchedTasks.length})
                  </div>
                  {matchedTasks.length === 0
                    ? <div style={{ color: RED, fontSize: 10, marginBottom: 6 }}>no task coverage</div>
                    : matchedTasks.map((t, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <div style={{ height: 6, borderRadius: 3, background: AMBER, width: `${Math.max(20, 100 - i * 15)}%`, maxWidth: 180 }} />
                          <span style={{ color: "#9AB0BE", fontSize: 10 }}>{t.name || t.title}</span>
                          {t.status && <span style={{ color: "#4E6070", fontSize: 9 }}>{t.status}</span>}
                        </div>
                      ))
                  }

                  {/* Skills */}
                  <div style={{ fontSize: 9, color: "#4E6070", letterSpacing: 1, marginTop: 6, marginBottom: 4 }}>
                    SKILLS ({matchedSkills.length})
                  </div>
                  {matchedSkills.length === 0
                    ? <div style={{ color: RED, fontSize: 10, marginBottom: 6 }}>no skill automation</div>
                    : matchedSkills.map((s, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <div style={{ height: 6, borderRadius: 3, background: GREEN, width: `${Math.max(20, 100 - i * 15)}%`, maxWidth: 180 }} />
                          <span style={{ color: "#9AB0BE", fontSize: 10 }}>{s.name || s.title}</span>
                          {s.skill_type && <span style={{ color: "#4E6070", fontSize: 9 }}>{s.skill_type}</span>}
                        </div>
                      ))
                  }

                  {/* Assess button */}
                  <button
                    onClick={() => assess(ev, kws)}
                    disabled={assessing === id}
                    style={{
                      marginTop: 8, background: assessing === id ? "rgba(41,231,255,0.05)" : "rgba(41,231,255,0.1)",
                      border: `1px solid ${CY}44`, borderRadius: 4, color: CY,
                      fontSize: 9, letterSpacing: 1, padding: "3px 10px",
                      cursor: assessing === id ? "not-allowed" : "pointer", fontFamily: MONO,
                    }}
                  >
                    {assessing === id ? "assessing…" : "▶ ASSESS"}
                  </button>

                  {assessTxt[id] && (
                    <div style={{
                      marginTop: 6, padding: "6px 8px",
                      background: "rgba(41,231,255,0.05)", borderRadius: 4,
                      color: "#9AB0BE", fontSize: 10, lineHeight: 1.5,
                    }}>
                      {assessTxt[id]}
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
        padding: "5px 14px", borderTop: `1px solid ${CY}11`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#2E4050", fontSize: 8, letterSpacing: 1 }}>
          ORAR · /v1/ops/events × /entities/Task × /v1/aip/skill · 90s
        </span>
        <span style={{ color: manualCount > 0 ? RED : "#2E4050", fontSize: 8 }}>
          {manualCount} MANUAL
        </span>
      </div>
    </div>
  );
}
