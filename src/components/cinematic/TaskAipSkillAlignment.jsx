/**
 * F87 — Task × AIP Skill Alignment (TASA)
 *
 * Answers: "Which tasks have matching AIP skills, and which are unsupported?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Task   → active tasks (name/description/status/priority/tags)
 *   GET /v1/aip/skill    → registered AIP skills (name/description/category/tags)
 *
 * Each task's name/description/status/priority/tags is keyword-matched against
 * each skill's name/description/category/tags to produce:
 *   SKILLED   — at least one AIP skill matches this task
 *   UNSKILLED — no skill covers this task
 *
 * Stat tiles:  tasks / skills / skilled / unskilled
 * Amber badge: unskilled count on button.
 * Expand row:  matched skills with relevance score bar.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ TASA  at left:2700 bottom:18, zIndex:68.
 * Event:   jarvis:tasa-toggle
 * Voice:   "task skill / skill task / tasa / unskilled tasks / task skill coverage /
 *           task aip / which tasks have skills / unsupported tasks / task capability /
 *           aip task alignment / skill gap tasks"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 2700;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  return [];
}

function tokens(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function taskText(t) {
  return [
    t.name, t.title, t.description, t.summary,
    t.status, t.priority,
    Array.isArray(t.tags) ? t.tags.join(" ") : t.tags,
  ].join(" ");
}

function skillText(s) {
  return [
    s.name, s.title, s.description, s.category,
    Array.isArray(s.tags) ? s.tags.join(" ") : s.tags,
  ].join(" ");
}

function scoreMatch(task, skill) {
  const tTok = new Set(tokens(taskText(task)));
  const sTok = tokens(skillText(skill));
  if (!tTok.size || !sTok.length) return 0;
  const hits = sTok.filter(w => tTok.has(w)).length;
  return Math.round((hits / Math.max(tTok.size, sTok.length)) * 100);
}

function correlate(tasks, skills) {
  return tasks.map(task => {
    const matches = skills
      .map(skill => ({ skill, score: scoreMatch(task, skill) }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score);
    return {
      task,
      matches,
      status: matches.length > 0 ? "SKILLED" : "UNSKILLED",
    };
  });
}

// ─── exported brain helpers ───────────────────────────────────────────────────

export function isTasaQuery(q) {
  return /\b(task\s*skill|skill\s*task|tasa|unskilled\s*task|task\s*aip|task\s*capabilit|aip\s*task|task\s*skill\s*coverage|skill\s*gap\s*task|unsupported\s*task|task\s*alignment|skill\s*aligned\s*task)\b/i.test(q);
}

export async function buildTasaScript() {
  try {
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [tRaw, sRaw] = await Promise.all([
      fetch(`${base}/entities/Task`, { headers: hdrs }).then(r => r.json()),
      fetch(`${base}/v1/aip/skill`,  { headers: hdrs }).then(r => r.json()),
    ]);
    const tasks  = normArr(tRaw);
    const skills = normArr(sRaw);
    const rows   = correlate(tasks, skills);
    const skilled   = rows.filter(r => r.status === "SKILLED").length;
    const unskilled = rows.filter(r => r.status === "UNSKILLED").length;
    const pct = tasks.length ? Math.round((skilled / tasks.length) * 100) : 0;
    return `TASA: ${tasks.length} tasks × ${skills.length} AIP skills — ${skilled} SKILLED (${pct}%), ${unskilled} UNSKILLED. ${unskilled > 0 ? `${unskilled} task${unskilled > 1 ? "s" : ""} lack matching AIP skill coverage.` : "All tasks have skill coverage."}`;
  } catch {
    return "TASA: Unable to load task/skill data right now.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function TaskAipSkillAlignment() {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [rows,     setRows]     = useState([]);
  const [skills,   setSkills]   = useState([]);
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(false);
  const [brief,    setBrief]    = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [tRaw, sRaw] = await Promise.all([
        fetch(`${base}/entities/Task`, { headers: hdrs }).then(r => r.json()),
        fetch(`${base}/v1/aip/skill`,  { headers: hdrs }).then(r => r.json()),
      ]);
      const tasks  = normArr(tRaw);
      const skillArr = normArr(sRaw);
      setSkills(skillArr);
      setRows(correlate(tasks, skillArr));
    } catch {
      // silent — will retry on next interval
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:tasa-toggle", handler);
    return () => window.removeEventListener("jarvis:tasa-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const skilled   = rows.filter(r => r.status === "SKILLED").length;
      const unskilled = rows.filter(r => r.status === "UNSKILLED").length;
      const pct = rows.length ? Math.round((skilled / rows.length) * 100) : 0;
      const prompt = `TASA Analysis — ${rows.length} tasks × ${skills.length} AIP skills. SKILLED: ${skilled} (${pct}%), UNSKILLED: ${unskilled}. Provide a 2-sentence assessment of task-skill alignment and any capability gaps.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "").trim();
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Unable to assess at this time.");
    } finally {
      setAssessing(false);
    }
  }, [rows, skills]);

  const skilled   = rows.filter(r => r.status === "SKILLED").length;
  const unskilled = rows.filter(r => r.status === "UNSKILLED").length;

  const visible = rows.filter(r => {
    if (filter === "SKILLED"   && r.status !== "SKILLED")   return false;
    if (filter === "UNSKILLED" && r.status !== "UNSKILLED") return false;
    if (search) {
      const hay = taskText(r.task).toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const tile = (label, value, color) => (
    <div style={{ background: "rgba(41,231,255,0.04)", border: `1px solid ${color}33`, borderRadius: 6, padding: "8px 14px", minWidth: 90, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, color, fontFamily: MONO, fontWeight: 700 }}>{value}</div>
    </div>
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: open ? `${CY}22` : "rgba(4,7,14,0.85)",
          border: `1px solid ${open ? CY : "#1a3a4a"}`,
          color: open ? CY : MUTED, fontFamily: MONO, fontSize: 10,
          padding: "4px 9px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ TASA
        {unskilled > 0 && (
          <span style={{ background: AMBER, color: "#000", borderRadius: 10, padding: "0 5px", fontSize: 9, fontWeight: 700 }}>
            {unskilled}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", right: 18, top: 60, width: 560, maxHeight: "80vh",
          background: BG, border: `1px solid ${CY}44`, borderRadius: 10,
          zIndex: 9100, display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: `0 0 30px ${CY}22`,
        }}>
          {/* Header */}
          <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${CY}22`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: CY, fontFamily: MONO, fontSize: 13, fontWeight: 700 }}>◈ TASK × AIP SKILL ALIGNMENT</div>
              <div style={{ color: MUTED, fontFamily: MONO, fontSize: 10, marginTop: 2 }}>
                {loading ? "LOADING…" : `${rows.length} tasks · ${skills.length} skills · 90 s refresh`}
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 10, padding: "12px 18px", flexWrap: "wrap" }}>
            {tile("TASKS",    rows.length,  CY)}
            {tile("SKILLS",  skills.length, CY)}
            {tile("SKILLED",  skilled,       GREEN)}
            {tile("UNSKILLED",unskilled,     AMBER)}
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 6, padding: "0 18px 10px", flexWrap: "wrap" }}>
            {["ALL","SKILLED","UNSKILLED"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? `${CY}22` : "transparent",
                border: `1px solid ${filter === f ? CY : "#1a3a4a"}`,
                color: filter === f ? CY : MUTED, fontFamily: MONO, fontSize: 10,
                padding: "3px 10px", borderRadius: 4, cursor: "pointer",
              }}>{f}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{ marginLeft: "auto", background: "rgba(41,231,255,0.05)", border: `1px solid #1a3a4a`, color: CY, fontFamily: MONO, fontSize: 10, padding: "3px 8px", borderRadius: 4, width: 150 }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 18px 14px" }}>
            {visible.length === 0 && (
              <div style={{ color: MUTED, fontFamily: MONO, fontSize: 11, textAlign: "center", paddingTop: 24 }}>
                {loading ? "Fetching data…" : "No tasks match."}
              </div>
            )}
            {visible.map((row, i) => {
              const isExp = expanded === i;
              const statusColor = row.status === "SKILLED" ? GREEN : AMBER;
              return (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      background: "rgba(41,231,255,0.03)", border: `1px solid ${statusColor}33`,
                      borderRadius: 6, padding: "8px 12px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 10,
                    }}
                  >
                    <span style={{ color: statusColor, fontFamily: MONO, fontSize: 9, fontWeight: 700, minWidth: 72 }}>
                      {row.status}
                    </span>
                    <span style={{ color: "#c0d8e8", fontFamily: MONO, fontSize: 11, flex: 1 }}>
                      {row.task.name || row.task.title || `Task ${i + 1}`}
                    </span>
                    {row.task.priority && (
                      <span style={{ color: MUTED, fontFamily: MONO, fontSize: 9 }}>{row.task.priority}</span>
                    )}
                    <span style={{ color: row.matches.length > 0 ? GREEN : MUTED, fontFamily: MONO, fontSize: 10 }}>
                      {row.matches.length} skill{row.matches.length !== 1 ? "s" : ""}
                    </span>
                    <span style={{ color: MUTED, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${CY}22`, borderTop: "none", borderRadius: "0 0 6px 6px", padding: "10px 12px" }}>
                      {row.task.description && (
                        <div style={{ color: MUTED, fontFamily: MONO, fontSize: 10, marginBottom: 8 }}>
                          {row.task.description}
                        </div>
                      )}
                      {row.matches.length === 0 && (
                        <div style={{ color: AMBER, fontFamily: MONO, fontSize: 10 }}>No matching AIP skills found for this task.</div>
                      )}
                      {row.matches.map((m, j) => (
                        <div key={j} style={{ marginBottom: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ color: CY, fontFamily: MONO, fontSize: 10, fontWeight: 700 }}>
                              {m.skill.name || m.skill.title}
                            </span>
                            <span style={{ color: MUTED, fontFamily: MONO, fontSize: 9 }}>
                              {m.skill.category || ""} · {m.score}%
                            </span>
                          </div>
                          <div style={{ background: "#0a1a24", borderRadius: 2, height: 3, overflow: "hidden" }}>
                            <div style={{ width: `${m.score}%`, height: "100%", background: `linear-gradient(90deg,${CY},${GREEN})`, transition: "width 0.5s" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess */}
          <div style={{ padding: "10px 18px 14px", borderTop: `1px solid ${CY}22` }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${CY}18`, border: `1px solid ${CY}44`, color: CY,
                fontFamily: MONO, fontSize: 10, padding: "5px 14px", borderRadius: 4,
                cursor: assessing ? "wait" : "pointer", opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ color: "#c0d8e8", fontFamily: MONO, fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
