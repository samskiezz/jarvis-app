/**
 * F193 — Contact × SwarmJob × Task Workforce Activity Matrix (WFACT)
 *
 * Parallel-fetches /entities/Contact + /entities/SwarmJob + /entities/Task
 * and keyword-correlates each contact against active swarm jobs AND tasks to
 * classify workforce engagement:
 *
 *   FULLY_ENGAGED  — matched tasks + swarm jobs (maximally active)
 *   TASK_ASSIGNED  — tasks present, no swarm automation link
 *   SWARM_RUNNING  — swarm jobs linked, no task assignment
 *   INACTIVE       — neither tasks nor swarm jobs (workforce gap)
 *
 * Stat tiles: CONTACTS / TASKS / SWARM JOBS + four class counts + ENGAGED%.
 * Amber badge on INACTIVE count.
 * Filter tabs ALL / FULLY_ENGAGED / TASK_ASSIGNED / SWARM_RUNNING / INACTIVE + text search.
 * Expand contact → matched task cards (cyan) + swarm job cards (purple) with relevance bars.
 * ▶ ASSESS WORKFORCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:wfact-toggle event.
 *
 * Voice triggers:
 *   "wfact / workforce activity / contact task / contact swarm /
 *    inactive contact / workforce matrix / personnel engagement / workforce gap"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_050_440;
const Z_INDEX  = 254;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const WFACT_RE = /\b(wfact|workforce[\s-]activity|contact[\s-]task|contact[\s-]swarm|inactive[\s-]contact|workforce[\s-]matrix|personnel[\s-]engagement|workforce[\s-]gap)\b/i;

export function isWfactQuery(q = "") { return WFACT_RE.test(q); }

export async function buildWfactScript() {
  const base = apiBase();
  const [contactRes, swarmRes, taskRes] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`).then(r => r.json()),
    fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${base}/entities/Task`).then(r => r.json()),
  ]);
  const contacts = contactRes.status === "fulfilled" ? (contactRes.value?.items || contactRes.value || []) : [];
  const jobs     = swarmRes.status   === "fulfilled" ? (swarmRes.value?.items   || swarmRes.value   || []) : [];
  const tasks    = taskRes.status    === "fulfilled" ? (taskRes.value?.items    || taskRes.value    || []) : [];

  let fullyEngaged = 0, inactive = 0;
  for (const c of contacts) {
    const kws = keywords(contactText(c));
    const hasTask  = tasks.some(t => scoreText(taskText(t),  kws) > 0);
    const hasSwarm = jobs.some(j  => scoreText(swarmText(j), kws) > 0);
    if (hasTask && hasSwarm)      fullyEngaged++;
    else if (!hasTask && !hasSwarm) inactive++;
  }
  const total       = contacts.length;
  const engagedPct  = total ? Math.round((fullyEngaged / total) * 100) : 0;
  return `WFACT Workforce Activity Matrix online, sir. I have cross-referenced ${total} contacts against ${tasks.length} active tasks and ${jobs.length} swarm jobs. ${fullyEngaged} personnel are fully engaged — carrying both task assignments and swarm automation links — representing ${engagedPct}% of the workforce. ${inactive} contacts are currently inactive with zero coverage. Recommend immediate task or swarm assignment to close the workforce gap, sir.`;
}

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const GR     = "#22C55E";
const PU     = "#A78BFA";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_ENGAGED: GR,
  TASK_ASSIGNED: CY,
  SWARM_RUNNING: PU,
  INACTIVE:      RD,
};

const TABS = ["ALL", "FULLY_ENGAGED", "TASK_ASSIGNED", "SWARM_RUNNING", "INACTIVE"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function contactText(c) {
  return [c.name, c.email, c.role, c.org, c.organisation, c.department, c.tags, c.notes, c.label].filter(Boolean).join(" ");
}
function taskText(t) {
  return [t.name, t.title, t.description, t.type, t.priority, t.tags, t.assignee, t.category].filter(Boolean).join(" ");
}
function swarmText(j) {
  return [j.name, j.title, j.description, j.type, j.status, j.tags, j.target, j.category, j.assigned_to].filter(Boolean).join(" ");
}

function classify(contact, tasks, jobs) {
  const kws = keywords(contactText(contact));
  const matchedTasks = tasks
    .map(t => ({ ...t, _score: scoreText(taskText(t), kws) }))
    .filter(t => t._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedJobs = jobs
    .map(j => ({ ...j, _score: scoreText(swarmText(j), kws) }))
    .filter(j => j._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasTask  = matchedTasks.length > 0;
  const hasSwarm = matchedJobs.length  > 0;
  let cls;
  if (hasTask && hasSwarm)   cls = "FULLY_ENGAGED";
  else if (hasTask)          cls = "TASK_ASSIGNED";
  else if (hasSwarm)         cls = "SWARM_RUNNING";
  else                       cls = "INACTIVE";
  return { ...contact, _cls: cls, _tasks: matchedTasks, _jobs: matchedJobs };
}

export default function WorkforceActivityMatrix() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [contacts, setContacts]     = useState([]);
  const [tasks, setTasks]           = useState([]);
  const [jobs, setJobs]             = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [brief, setBrief]           = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [contactRes, swarmRes, taskRes] = await Promise.allSettled([
        fetch(`${base}/entities/Contact`).then(r => r.json()),
        fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${base}/entities/Task`).then(r => r.json()),
      ]);
      const ctk = contactRes.status === "fulfilled" ? (contactRes.value?.items || contactRes.value || []) : [];
      const jb  = swarmRes.status   === "fulfilled" ? (swarmRes.value?.items   || swarmRes.value   || []) : [];
      const tk  = taskRes.status    === "fulfilled" ? (taskRes.value?.items    || taskRes.value    || []) : [];
      setContacts(ctk);
      setJobs(jb);
      setTasks(tk);
      setClassified(ctk.map(c => classify(c, tk, jb)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:wfact-toggle", onToggle);
    return () => window.removeEventListener("jarvis:wfact-toggle", onToggle);
  }, []);

  const fullyEngaged = classified.filter(c => c._cls === "FULLY_ENGAGED").length;
  const taskAssigned = classified.filter(c => c._cls === "TASK_ASSIGNED").length;
  const swarmRunning = classified.filter(c => c._cls === "SWARM_RUNNING").length;
  const inactive     = classified.filter(c => c._cls === "INACTIVE").length;
  const total        = classified.length;
  const engagedPct   = total ? Math.round((fullyEngaged / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || contactText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `WFACT: ${total} contacts — FULLY_ENGAGED: ${fullyEngaged}, TASK_ASSIGNED: ${taskAssigned}, SWARM_RUNNING: ${swarmRunning}, INACTIVE: ${inactive} (${engagedPct}% engaged). Tasks: ${tasks.length}. SwarmJobs: ${jobs.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `WFACT workforce activity assessment. Context: ${ctx}. Provide a 2-sentence operational brief about workforce engagement coverage and which inactive contacts represent the highest priority for task or swarm assignment. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Workforce assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      const tts = await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      });
      if (tts.ok) {
        const blob = await tts.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief("Assessment unavailable: " + e.message);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Workforce Activity Matrix (WFACT)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {inactive > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {inactive}
          </span>
        )}
        ◈ WFACT
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: Z_INDEX,
      background: BG, fontFamily: FONT, overflowY: "auto", padding: "18px 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ WFACT</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Contact × SwarmJob × Task Workforce Activity Matrix
        </span>
        {loading && <span style={{ color: AM, fontSize: 10 }}>◌ loading…</span>}
        <button onClick={load} style={smallBtn(CY)} title="Refresh">↺</button>
        <button onClick={() => setOpen(false)} style={smallBtn(RD)}>✕</button>
      </div>

      {error && (
        <div style={{ color: RD, fontSize: 11, marginBottom: 10, padding: "6px 10px", border: `1px solid ${RD}44`, borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          ["CONTACTS",      total,        CY],
          ["TASKS",         tasks.length, GR],
          ["SWARM JOBS",    jobs.length,  PU],
          ["FULLY ENGAGED", fullyEngaged, GR],
          ["TASK ASSIGNED", taskAssigned, CY],
          ["SWARM RUNNING", swarmRunning, PU],
          ["INACTIVE",      inactive,     RD],
          ["ENGAGED%",      engagedPct + "%", AM],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>WORKFORCE ENGAGEMENT COVERAGE</div>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", position: "relative", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${engagedPct}%`, background: GR, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        <div style={{ color: GR, fontSize: 9, marginTop: 2 }}>{engagedPct}% of contacts fully engaged</div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={assess} disabled={assessing} style={{
          fontFamily: FONT, fontSize: 10, letterSpacing: 1, cursor: assessing ? "not-allowed" : "pointer",
          background: assessing ? "rgba(0,207,255,0.1)" : "rgba(0,207,255,0.15)",
          border: `1px solid ${CY}66`, color: CY, padding: "4px 10px", borderRadius: 4,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS WORKFORCE"}
        </button>
      </div>
      {brief && (
        <div style={{ color: "#DCEBF5", fontSize: 12, lineHeight: 1.5, marginBottom: 12,
          padding: "8px 12px", background: "rgba(0,207,255,0.06)", borderRadius: 6,
          border: `1px solid ${CY}22` }}>
          {brief}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: FONT, fontSize: 9, letterSpacing: 1, padding: "3px 8px", borderRadius: 4,
            cursor: "pointer",
            background: tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.06)",
            border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.18)"}`,
            color: tab === t ? "#000" : (CLASS_COLOR[t] || CY),
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="search contacts…"
        style={{
          fontFamily: FONT, fontSize: 11, width: "100%", maxWidth: 340, marginBottom: 12,
          background: "rgba(0,207,255,0.04)", border: `1px solid ${BORDER}`,
          color: "#DCEBF5", borderRadius: 4, padding: "5px 10px", outline: "none",
        }}
      />

      {/* Contact list */}
      {visible.length === 0 && !loading && (
        <div style={{ color: "#6E8AA0", fontSize: 11 }}>No contacts match current filter.</div>
      )}
      {visible.map((c, i) => {
        const col = CLASS_COLOR[c._cls];
        const isExp = expanded === i;
        const name = c.name || c.email || c.label || `Contact ${i + 1}`;
        return (
          <div key={i} style={{
            marginBottom: 6, border: `1px solid ${col}33`, borderRadius: 6,
            background: "rgba(0,207,255,0.02)", overflow: "hidden",
          }}>
            <div
              onClick={() => setExpanded(isExp ? null : i)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
            >
              <span style={{ color: col, fontSize: 9, letterSpacing: 1, border: `1px solid ${col}55`,
                borderRadius: 3, padding: "1px 5px", minWidth: 90, textAlign: "center" }}>
                {c._cls.replace(/_/g, " ")}
              </span>
              <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{name}</span>
              {c.role && (
                <span style={{ color: AM, fontSize: 9, border: `1px solid ${AM}44`, borderRadius: 2, padding: "0 4px" }}>
                  {c.role}
                </span>
              )}
              {c._tasks.length > 0 && (
                <span style={{ color: CY, fontSize: 9 }}>⊕ {c._tasks.length} task{c._tasks.length !== 1 ? "s" : ""}</span>
              )}
              {c._jobs.length > 0 && (
                <span style={{ color: PU, fontSize: 9 }}>⟁ {c._jobs.length} job{c._jobs.length !== 1 ? "s" : ""}</span>
              )}
              <span style={{ color: col, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
            </div>

            {isExp && (
              <div style={{ padding: "0 10px 10px 10px", borderTop: `1px solid ${col}22` }}>
                {(c.email || c.org || c.organisation) && (
                  <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 6, marginBottom: 8 }}>
                    {[c.email, c.org || c.organisation].filter(Boolean).join(" · ")}
                  </div>
                )}

                {c._tasks.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED TASKS</div>
                    {c._tasks.map((t, j) => {
                      const maxScore = Math.max(...c._tasks.map(x => x._score), 1);
                      const bar = Math.round((t._score / maxScore) * 100);
                      return (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {t.name || t.title || "Task"}
                            </span>
                            {t.priority && (
                              <span style={{ color: AM, fontSize: 9, border: `1px solid ${AM}44`, borderRadius: 2, padding: "0 4px" }}>
                                {t.priority}
                              </span>
                            )}
                            {t.status && (
                              <span style={{ color: GR, fontSize: 9, border: `1px solid ${GR}44`, borderRadius: 2, padding: "0 4px" }}>
                                {t.status}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: CY, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {c._jobs.length > 0 && (
                  <div>
                    <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED SWARM JOBS</div>
                    {c._jobs.map((j, k) => {
                      const maxScore = Math.max(...c._jobs.map(x => x._score), 1);
                      const bar = Math.round((j._score / maxScore) * 100);
                      return (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {j.name || j.title || "SwarmJob"}
                            </span>
                            {j.status && (
                              <span style={{ color: GR, fontSize: 9, border: `1px solid ${GR}44`, borderRadius: 2, padding: "0 4px" }}>
                                {j.status}
                              </span>
                            )}
                            {j.type && (
                              <span style={{ color: CY, fontSize: 9, border: `1px solid ${CY}44`, borderRadius: 2, padding: "0 4px" }}>
                                {j.type}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: PU, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {c._tasks.length === 0 && c._jobs.length === 0 && (
                  <div style={{ color: RD, fontSize: 10, marginTop: 6 }}>
                    ◌ No task or swarm coverage — inactive workforce slot
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function smallBtn(color) {
  return {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10, cursor: "pointer",
    background: "transparent", border: `1px solid ${color}55`,
    color: color, padding: "2px 6px", borderRadius: 3,
  };
}
