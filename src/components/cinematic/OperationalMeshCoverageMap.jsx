/**
 * F226 — Task × Graph Community × SwarmJob Operational Mesh Coverage Map (OMCMAP)
 *
 * Parallel-fetches /entities/Task + /v1/graph/communities + /entities/SwarmJob
 * and keyword-correlates each task against graph community clusters AND swarm jobs:
 *
 *   FULLY_MESHED     — matched community + swarm job (full operational mesh)
 *   COMMUNITY_BACKED — matched community only (networked, no automation)
 *   SWARM_DRIVEN     — matched swarm job only (automated, no community linkage)
 *   ISOLATED         — no matches in either source (operational mesh gap)
 *
 * Stat tiles: TASKS / COMMUNITIES / SWARM JOBS + four class counts + MESH%.
 * Amber badge on ISOLATED count.
 * Filter tabs ALL / FULLY_MESHED / COMMUNITY_BACKED / SWARM_DRIVEN / ISOLATED + text search.
 * Expand task → matched community cards (blue, member-count badge) + swarm job cards
 *   (purple, status badge) with relevance bars.
 * ▶ ASSESS MESH COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:omcmap-toggle event.
 *
 * Voice triggers:
 *   "omcmap / task mesh / operational mesh / isolated tasks /
 *    task community swarm / task network coverage"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_068_920;
const Z_INDEX  = 287;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const OMCMAP_RE = /\b(omcmap|task[\s-]mesh|operational[\s-]mesh|isolated[\s-]tasks|task[\s-]community[\s-]swarm|task[\s-]network[\s-]coverage)\b/i;

export function isOmcmapQuery(q = "") { return OMCMAP_RE.test(q); }

export async function buildOmcmapScript() {
  const base = apiBase();
  const [tR, cR, sR] = await Promise.allSettled([
    fetch(`${base}/entities/Task`).then(r => r.json()),
    fetch(`${base}/v1/graph/communities`).then(r => r.json()),
    fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
  ]);
  const tasks       = tR.status === "fulfilled" ? (tR.value?.items || tR.value || []) : [];
  const communities = cR.status === "fulfilled" ? (cR.value?.items || cR.value?.communities || cR.value || []) : [];
  const swarmJobs   = sR.status === "fulfilled" ? (sR.value?.items || sR.value || []) : [];

  let fullyMeshed = 0, isolated = 0;
  for (const task of tasks) {
    const kws    = keywords(taskText(task));
    const hasCom = communities.some(c => scoreText(communityText(c), kws) > 0);
    const hasSwm = swarmJobs.some(s => scoreText(swarmText(s), kws) > 0);
    if (hasCom && hasSwm) fullyMeshed++;
    else if (!hasCom && !hasSwm) isolated++;
  }
  const total    = tasks.length;
  const meshPct  = total ? Math.round((fullyMeshed / total) * 100) : 0;
  return `OMCMAP Operational Mesh Coverage Map online, sir. I have cross-referenced ${total} active tasks against ${communities.length} graph community clusters and ${swarmJobs.length} swarm jobs. ${fullyMeshed} tasks are fully meshed with both community network linkage and automated swarm job coverage, representing ${meshPct}% operational mesh readiness. ${isolated} tasks are completely isolated with no community or swarm linkage, representing critical operational gaps where neither network intelligence nor automation is backing the mission, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const BL   = "#3B82F6";
const MG   = "#A855F7";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_MESHED:     GR,
  COMMUNITY_BACKED: BL,
  SWARM_DRIVEN:     MG,
  ISOLATED:         AM,
};

const TABS = ["ALL", "FULLY_MESHED", "COMMUNITY_BACKED", "SWARM_DRIVEN", "ISOLATED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function taskText(t) {
  return [t.title, t.name, t.description, t.type, t.status, t.priority, t.tags, t.summary].filter(Boolean).join(" ");
}
function communityText(c) {
  return [c.name, c.label, c.description, c.tags, c.summary, c.members, c.type].filter(Boolean).join(" ");
}
function swarmText(s) {
  return [s.name, s.title, s.description, s.type, s.status, s.tags, s.objective, s.job_type].filter(Boolean).join(" ");
}

function classify(task, communities, swarmJobs) {
  const kws = keywords(taskText(task));
  const matchedCom = communities
    .map(c => ({ ...c, _score: scoreText(communityText(c), kws) }))
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const matchedSwm = swarmJobs
    .map(s => ({ ...s, _score: scoreText(swarmText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);

  const hasCom = matchedCom.length > 0;
  const hasSwm = matchedSwm.length > 0;

  let cls;
  if (hasCom && hasSwm)       cls = "FULLY_MESHED";
  else if (hasCom && !hasSwm) cls = "COMMUNITY_BACKED";
  else if (!hasCom && hasSwm) cls = "SWARM_DRIVEN";
  else                        cls = "ISOLATED";

  return { ...task, _cls: cls, _com: matchedCom, _swm: matchedSwm };
}

function smallBtn(col) {
  return {
    fontFamily: FONT, fontSize: 10, background: "transparent",
    border: `1px solid ${col}55`, color: col, padding: "2px 7px",
    borderRadius: 3, cursor: "pointer",
  };
}

function RelevanceBar({ score, max, col }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#1A2A3A", borderRadius: 2, marginTop: 3, width: "100%" }}>
      <div style={{ height: 3, width: pct + "%", background: col, borderRadius: 2, transition: "width 0.4s" }} />
    </div>
  );
}

export default function OperationalMeshCoverageMap() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tasks, setTasks]           = useState([]);
  const [communities, setCommunities] = useState([]);
  const [swarmJobs, setSwarmJobs]   = useState([]);
  const [classified, setClass]      = useState([]);
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
      const [tR, cR, sR] = await Promise.allSettled([
        fetch(`${base}/entities/Task`).then(r => r.json()),
        fetch(`${base}/v1/graph/communities`).then(r => r.json()),
        fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
      ]);
      const ts = tR.status === "fulfilled" ? (tR.value?.items || tR.value || []) : [];
      const cs = cR.status === "fulfilled" ? (cR.value?.items || cR.value?.communities || cR.value || []) : [];
      const ss = sR.status === "fulfilled" ? (sR.value?.items || sR.value || []) : [];
      setTasks(ts);
      setCommunities(cs);
      setSwarmJobs(ss);
      setClass(ts.map(t => classify(t, cs, ss)));
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
    window.addEventListener("jarvis:omcmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:omcmap-toggle", onToggle);
  }, []);

  const fullyMeshed     = classified.filter(c => c._cls === "FULLY_MESHED").length;
  const communityBacked = classified.filter(c => c._cls === "COMMUNITY_BACKED").length;
  const swarmDriven     = classified.filter(c => c._cls === "SWARM_DRIVEN").length;
  const isolated        = classified.filter(c => c._cls === "ISOLATED").length;
  const total           = classified.length;
  const meshPct         = total ? Math.round((fullyMeshed / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || taskText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `OMCMAP: ${total} tasks — FULLY_MESHED: ${fullyMeshed}, COMMUNITY_BACKED: ${communityBacked}, SWARM_DRIVEN: ${swarmDriven}, ISOLATED: ${isolated} (${meshPct}% mesh). Communities: ${communities.length}. Swarm jobs: ${swarmJobs.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `OMCMAP operational mesh assessment. Context: ${ctx}. Provide a 2-sentence brief identifying which isolated tasks represent the most critical operational gaps and what community network or swarm automation should be established to close the mesh coverage deficit. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
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
        title="Task × Graph Community × SwarmJob Operational Mesh Coverage Map (OMCMAP)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${CY}55`,
          color: CY, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {isolated > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {isolated}
          </span>
        )}
        ◈ OMCMAP
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
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ OMCMAP</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Task × Graph Community × SwarmJob — Operational Mesh Coverage Map
        </span>
        {loading && <span style={{ color: CY, fontSize: 10 }}>◌ loading…</span>}
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
          ["TASKS",            total,          CY],
          ["COMMUNITIES",      communities.length, BL],
          ["SWARM JOBS",       swarmJobs.length, MG],
          ["FULLY MESHED",     fullyMeshed,    GR],
          ["COMMUNITY BACKED", communityBacked, BL],
          ["SWARM DRIVEN",     swarmDriven,    MG],
          ["ISOLATED",         isolated,       AM],
          ["MESH%",            meshPct + "%",  meshPct >= 70 ? GR : meshPct >= 40 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 85, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#4A6A80", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Mesh coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#4A6A80", letterSpacing: 1, marginBottom: 3 }}>
          OPERATIONAL MESH COVERAGE — {meshPct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: meshPct + "%",
            background: meshPct >= 70 ? GR : meshPct >= 40 ? AM : RD,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(CY), fontSize: 11, padding: "4px 12px",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS MESH COVERAGE"}
        </button>
        {brief && (
          <div style={{ color: "#DCEBF5", fontSize: 11, lineHeight: 1.5, flex: 1, minWidth: 200 }}>
            {brief}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            ...smallBtn(tab === t ? CY : "#4A6A80"),
            background: tab === t ? CY + "22" : "transparent",
          }}>
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 180,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} tasks
        </span>
      </div>

      {/* Tasks list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading tasks…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((task, i) => {
            const col    = CLASS_COLOR[task._cls] || "#6E8AA0";
            const isExp  = expanded === i;
            const maxCom = task._com[0]?._score || 1;
            const maxSwm = task._swm[0]?._score || 1;
            return (
              <div key={i} style={{
                border: `1px solid ${col}33`, borderRadius: 5,
                background: "rgba(0,207,255,0.02)", overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
                >
                  <span style={{
                    fontSize: 9, letterSpacing: 1, color: col,
                    border: `1px solid ${col}55`, borderRadius: 3, padding: "1px 5px",
                    whiteSpace: "nowrap",
                  }}>
                    {task._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {task.title || task.name || `Task ${i + 1}`}
                  </span>
                  {task.priority && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{task.priority}</span>
                  )}
                  {task.status && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{task.status}</span>
                  )}
                  <span style={{ color: "#4A6A80", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {(task.description || task.summary) && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>
                        {task.description || task.summary}
                      </div>
                    )}

                    {/* Matched communities */}
                    {task._com.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: BL, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED COMMUNITIES ({task._com.length})
                        </div>
                        {task._com.map((c, ci) => (
                          <div key={ci} style={{
                            background: BL + "11", border: `1px solid ${BL}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: BL, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.name || c.label || `Community ${ci + 1}`}
                              </span>
                              {(c.members !== undefined) && (
                                <span style={{ fontSize: 8, color: BL, border: `1px solid ${BL}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {c.members} members
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={c._score} max={maxCom} col={BL} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched swarm jobs */}
                    {task._swm.length > 0 && (
                      <div>
                        <div style={{ color: MG, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED SWARM JOBS ({task._swm.length})
                        </div>
                        {task._swm.map((s, si) => (
                          <div key={si} style={{
                            background: MG + "11", border: `1px solid ${MG}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: MG, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.name || s.title || `Swarm Job ${si + 1}`}
                              </span>
                              {s.status && (
                                <span style={{ fontSize: 8, color: MG, border: `1px solid ${MG}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {s.status}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={s._score} max={maxSwm} col={MG} />
                          </div>
                        ))}
                      </div>
                    )}

                    {task._cls === "ISOLATED" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching community clusters or swarm jobs found. This task has no network intelligence or automation backing — an operational mesh gap requiring immediate attention.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ color: "#4A6A80", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
              No tasks match current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
