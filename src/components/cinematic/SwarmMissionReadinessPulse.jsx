/**
 * F153 — SwarmJob × Knowledge × Task × IntelProfile Mission Readiness Pulse (SKTIMP)
 *
 * Answers: "Which swarm jobs are fully mission-ready (backed by KB articles,
 *           active tasks, AND monitored threat actors), and which are dark?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/SwarmJob        → running / queued swarm jobs
 *   GET /knowledge/               → knowledge-base articles
 *   GET /entities/Task            → active mission tasks
 *   GET /entities/IntelProfile    → known threat-actor intel profiles
 *
 * Classification per swarm job (keyword correlation):
 *   FULLY_READY   — matched KB article + task + intel profile (all three)
 *   DUAL_READY    — matched any two sources
 *   SINGLE_LINKED — matched one source
 *   DARK          — matched none
 *
 * Stat tiles: SWARM JOBS / KB ARTICLES / TASKS / INTEL PROFILES + four class counts + READINESS%
 * ▶ ASSESS: 2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ SKTIMP  at left:1028040 bottom:8, zIndex:214.
 * Event:   jarvis:sktimp-toggle
 * Voice:   "sktimp / swarm readiness / mission readiness pulse / dark swarm /
 *           swarm mission ready / swarm knowledge task / swarm intel readiness"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3B6B";
const PURPLE = "#9B59B6";
const TEAL   = "#1abc9c";
const ORANGE = "#e67e22";
const MUTED  = "#6E8AA0";
const BG     = "rgba(4,7,14,0.96)";
const MONO   = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1028040;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of ["items","results","data","records","swarm_jobs","tasks","profiles","articles","knowledge"]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function words(item) {
  const str = [
    item.name, item.description, item.title, item.type, item.status,
    item.job_type, item.category, item.org, item.role, item.aliases,
    item.content, item.summary, item.tags,
  ].filter(Boolean).join(" ").toLowerCase();
  return str.split(/\W+/).filter(s => s.length > 2);
}

function overlap(a, b) {
  const setA = new Set(words(a));
  const bW = words(b);
  let hits = 0;
  for (const w of bW) if (setA.has(w)) hits++;
  return hits;
}

function relevancePct(hits, maxHits) {
  if (!maxHits) return 0;
  return Math.min(100, Math.round((hits / maxHits) * 100));
}

// ─── query / script exports ───────────────────────────────────────────────────

const SKTIMP_RE =
  /\b(sktimp|swarm\s*readiness|mission\s*readiness\s*pulse|dark\s*swarm|swarm\s*mission\s*ready|swarm\s*knowledge\s*task|swarm\s*intel\s*readiness)\b/i;

export function isSktimpQuery(q) {
  return SKTIMP_RE.test(q);
}

export async function buildSktimpScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  const [sjR, kbR, tkR, ipR] = await Promise.allSettled([
    fetch(`${base}/entities/SwarmJob`,     { headers: h }).then(r => r.json()),
    fetch(`${base}/knowledge/`,            { headers: h }).then(r => r.json()),
    fetch(`${base}/entities/Task`,         { headers: h }).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.json()),
  ]);
  const jobs     = normArr(sjR.status === "fulfilled" ? sjR.value : []);
  const kb       = normArr(kbR.status === "fulfilled" ? kbR.value : []);
  const tasks    = normArr(tkR.status === "fulfilled" ? tkR.value : []);
  const profiles = normArr(ipR.status === "fulfilled" ? ipR.value : []);

  let fully = 0, dual = 0, single = 0, dark = 0;
  for (const job of jobs) {
    const hasKb   = kb.some(a  => overlap(job, a)   > 0);
    const hasTask = tasks.some(t => overlap(job, t)  > 0);
    const hasIp   = profiles.some(p => overlap(job, p) > 0);
    const cnt = [hasKb, hasTask, hasIp].filter(Boolean).length;
    if (cnt === 3) fully++;
    else if (cnt === 2) dual++;
    else if (cnt === 1) single++;
    else dark++;
  }
  const pct = jobs.length ? Math.round(((fully + dual + single) / jobs.length) * 100) : 0;

  const summary = `${jobs.length} swarm jobs analysed: ${fully} fully ready, ${dual} dual-linked, ${single} single-linked, ${dark} dark (no backing). Mission readiness ${pct}%.`;
  try {
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: `SWARM MISSION READINESS PULSE — Context: ${summary}. In exactly 2 sentences, identify the most critical readiness gap and the single highest-priority action required.` }),
    });
    const d = await r.json();
    return (d.answer || summary).replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    return summary;
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function SwarmMissionReadinessPulse() {
  const [open, setOpen]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs]   = useState([]);
  const [kb, setKb]       = useState([]);
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [tab, setTab]     = useState("ALL");
  const [search, setSearch] = useState("");
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const timer = useRef(null);

  // classify
  const classified = jobs.map(job => {
    const kbMatches   = kb.filter(a  => overlap(job, a)   > 0).sort((a,b)=>overlap(job,b)-overlap(job,a)).slice(0,4);
    const taskMatches = tasks.filter(t => overlap(job, t)  > 0).sort((a,b)=>overlap(job,b)-overlap(job,a)).slice(0,4);
    const ipMatches   = profiles.filter(p => overlap(job, p) > 0).sort((a,b)=>overlap(job,b)-overlap(job,a)).slice(0,4);
    const cnt = [kbMatches.length, taskMatches.length, ipMatches.length].filter(c=>c>0).length;
    const cls = cnt === 3 ? "FULLY_READY" : cnt === 2 ? "DUAL_READY" : cnt === 1 ? "SINGLE_LINKED" : "DARK";
    return { job, kbMatches, taskMatches, ipMatches, cls };
  });

  const totFully  = classified.filter(c=>c.cls==="FULLY_READY").length;
  const totDual   = classified.filter(c=>c.cls==="DUAL_READY").length;
  const totSingle = classified.filter(c=>c.cls==="SINGLE_LINKED").length;
  const totDark   = classified.filter(c=>c.cls==="DARK").length;
  const readPct   = jobs.length ? Math.round(((totFully+totDual+totSingle)/jobs.length)*100) : 0;

  const TAB_MAP = { ALL: ()=>true, FULLY_READY: c=>c.cls==="FULLY_READY", DUAL_READY: c=>c.cls==="DUAL_READY", SINGLE_LINKED: c=>c.cls==="SINGLE_LINKED", DARK: c=>c.cls==="DARK" };
  const visible = classified.filter(TAB_MAP[tab]||TAB_MAP.ALL).filter(({job})=>{
    if (!search) return true;
    return (job.name||job.title||job.description||"").toLowerCase().includes(search.toLowerCase());
  });

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    const [sjR, kbR, tkR, ipR] = await Promise.allSettled([
      fetch(`${base}/entities/SwarmJob`,     { headers: h }).then(r=>r.json()),
      fetch(`${base}/knowledge/`,            { headers: h }).then(r=>r.json()),
      fetch(`${base}/entities/Task`,         { headers: h }).then(r=>r.json()),
      fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r=>r.json()),
    ]);
    setJobs    (normArr(sjR.status==="fulfilled" ? sjR.value : []));
    setKb      (normArr(kbR.status==="fulfilled" ? kbR.value : []));
    setTasks   (normArr(tkR.status==="fulfilled" ? tkR.value : []));
    setProfiles(normArr(ipR.status==="fulfilled" ? ipR.value : []));
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:sktimp-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sktimp-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setBrief("");
    try {
      const script = await buildSktimpScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { setBrief("Assessment unavailable."); }
    setAssessing(false);
  };

  const clsColor = (cls) => ({ FULLY_READY:"#00c878", DUAL_READY:CY, SINGLE_LINKED:AMBER, DARK:RED })[cls] || MUTED;

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Swarm Mission Readiness Pulse (SKTIMP)"
        style={{
          position:"fixed", left:BTN_LEFT, bottom:8, zIndex:214,
          padding:"4px 10px", borderRadius:6, border:`1px solid ${AMBER}`,
          background: open?"rgba(245,166,35,0.18)":"rgba(4,7,14,0.72)",
          color:AMBER, fontSize:10, letterSpacing:1.2, cursor:"pointer",
          fontFamily:MONO, backdropFilter:"blur(4px)",
          boxShadow: totDark > 0 ? `0 0 14px ${RED}66` : "none",
        }}
      >
        ◈ SKTIMP
        {totDark > 0 && (
          <span style={{ marginLeft:5, background:AMBER, color:"#04060A", borderRadius:9, padding:"1px 5px", fontSize:9, fontWeight:700 }}>
            {totDark}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position:"fixed", left:"50%", top:"50%", transform:"translate(-50%,-50%)",
          zIndex:10000, width:"min(860px,94vw)", maxHeight:"82vh", overflow:"hidden",
          background:BG, border:`1px solid ${AMBER}55`, borderRadius:14,
          backdropFilter:"blur(14px)", boxShadow:`0 0 60px ${AMBER}22`,
          fontFamily:MONO, color:"#DCEBF5", display:"flex", flexDirection:"column",
        }}>

          {/* header */}
          <div style={{ padding:"12px 16px 8px", borderBottom:`1px solid ${AMBER}33`, flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ color:AMBER, fontSize:11, letterSpacing:2, fontWeight:700 }}>
                ◈ SWARM MISSION READINESS PULSE
              </span>
              <button onClick={()=>setOpen(false)} style={{ background:"none", border:"none", color:MUTED, cursor:"pointer", fontSize:16 }}>✕</button>
            </div>
            <p style={{ margin:"4px 0 0", fontSize:9, color:MUTED, letterSpacing:1 }}>
              SwarmJob × Knowledge × Task × IntelProfile — mission-readiness classification
            </p>
          </div>

          {/* stat tiles */}
          <div style={{ display:"flex", gap:8, padding:"10px 16px 6px", flexShrink:0, flexWrap:"wrap" }}>
            {[
              ["SWARM JOBS", jobs.length, CY],
              ["KB ARTICLES", kb.length, GREEN],
              ["TASKS", tasks.length, TEAL],
              ["INTEL PROFS", profiles.length, ORANGE],
              ["FULLY READY", totFully, GREEN],
              ["DUAL READY", totDual, CY],
              ["SINGLE LNK", totSingle, AMBER],
              ["DARK", totDark, RED],
            ].map(([lbl, val, col]) => (
              <div key={lbl} style={{ background:"rgba(255,255,255,0.04)", borderRadius:8, padding:"6px 10px", minWidth:72, textAlign:"center" }}>
                <div style={{ color:col, fontSize:16, fontWeight:700 }}>{val}</div>
                <div style={{ color:MUTED, fontSize:8, letterSpacing:1.2, marginTop:2 }}>{lbl}</div>
              </div>
            ))}
            <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:8, padding:"6px 10px", minWidth:80, textAlign:"center" }}>
              <div style={{ color:readPct>=70?GREEN:readPct>=40?AMBER:RED, fontSize:16, fontWeight:700 }}>{readPct}%</div>
              <div style={{ color:MUTED, fontSize:8, letterSpacing:1.2, marginTop:2 }}>READINESS</div>
            </div>
          </div>

          {/* coverage bar */}
          <div style={{ padding:"0 16px 8px", flexShrink:0 }}>
            <div style={{ height:4, borderRadius:2, background:"rgba(255,255,255,0.06)" }}>
              <div style={{ height:"100%", borderRadius:2, width:`${readPct}%`, background:`linear-gradient(90deg,${RED},${AMBER},${GREEN})`, transition:"width 0.5s" }} />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:MUTED, marginTop:2 }}>
              <span>0%</span><span>READINESS COVERAGE</span><span>100%</span>
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display:"flex", gap:4, padding:"0 16px 8px", flexShrink:0, flexWrap:"wrap" }}>
            {["ALL","FULLY_READY","DUAL_READY","SINGLE_LINKED","DARK"].map(t => (
              <button key={t} onClick={()=>setTab(t)} style={{
                padding:"3px 10px", borderRadius:12, fontSize:9, letterSpacing:1, cursor:"pointer",
                border:`1px solid ${tab===t?AMBER:AMBER+"44"}`,
                background: tab===t?"rgba(245,166,35,0.2)":"transparent",
                color: tab===t?AMBER:MUTED,
              }}>{t.replace(/_/g," ")}</button>
            ))}
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="search jobs…" style={{
              marginLeft:"auto", background:"rgba(255,255,255,0.04)", border:`1px solid ${AMBER}33`,
              borderRadius:8, padding:"3px 10px", color:"#DCEBF5", fontSize:10, fontFamily:MONO,
              outline:"none", minWidth:140,
            }} />
          </div>

          {/* job list */}
          <div style={{ overflowY:"auto", flex:1, padding:"0 16px 8px" }}>
            {loading && <div style={{ color:MUTED, fontSize:10, padding:12 }}>◌ loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color:MUTED, fontSize:10, padding:12 }}>No swarm jobs match current filter.</div>
            )}
            {visible.map(({ job, kbMatches, taskMatches, ipMatches, cls }, i) => {
              const label = job.name || job.title || job.job_type || `Job-${i}`;
              const isExp = expanded === i;
              const col   = clsColor(cls);
              const maxHitsKb   = Math.max(1, ...kbMatches.map(a=>overlap(job,a)));
              const maxHitsTsk  = Math.max(1, ...taskMatches.map(t=>overlap(job,t)));
              const maxHitsIp   = Math.max(1, ...ipMatches.map(p=>overlap(job,p)));
              return (
                <div key={i} style={{ marginBottom:6, borderRadius:8, border:`1px solid ${col}33`, overflow:"hidden" }}>
                  <div
                    onClick={()=>setExpanded(isExp?null:i)}
                    style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 12px", cursor:"pointer", background:"rgba(255,255,255,0.02)" }}
                  >
                    <span style={{ color:col, fontSize:9, fontWeight:700, minWidth:84, letterSpacing:1 }}>{cls.replace(/_/g," ")}</span>
                    <span style={{ flex:1, fontSize:11, color:"#DCEBF5", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{label}</span>
                    {job.status && <span style={{ color:MUTED, fontSize:9 }}>{job.status}</span>}
                    <span style={{ color:MUTED, fontSize:11 }}>{isExp?"▲":"▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding:"8px 12px 10px", background:"rgba(0,0,0,0.25)" }}>
                      {job.description && <p style={{ color:MUTED, fontSize:10, margin:"0 0 8px" }}>{job.description}</p>}

                      {/* KB matches */}
                      {kbMatches.length > 0 && (
                        <div style={{ marginBottom:8 }}>
                          <div style={{ color:GREEN, fontSize:9, letterSpacing:1, marginBottom:4 }}>◈ KB ARTICLES ({kbMatches.length})</div>
                          {kbMatches.map((a,j) => {
                            const hits = overlap(job, a);
                            const pct  = relevancePct(hits, maxHitsKb);
                            return (
                              <div key={j} style={{ marginBottom:4 }}>
                                <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"#DCEBF5" }}>
                                  <span>{a.title||a.name||`Article ${j+1}`}</span>
                                  <span style={{ color:GREEN }}>{pct}%</span>
                                </div>
                                <div style={{ height:2, borderRadius:1, background:"rgba(255,255,255,0.06)", marginTop:2 }}>
                                  <div style={{ height:"100%", borderRadius:1, width:`${pct}%`, background:GREEN }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Task matches */}
                      {taskMatches.length > 0 && (
                        <div style={{ marginBottom:8 }}>
                          <div style={{ color:TEAL, fontSize:9, letterSpacing:1, marginBottom:4 }}>◈ TASKS ({taskMatches.length})</div>
                          {taskMatches.map((t,j) => {
                            const hits = overlap(job, t);
                            const pct  = relevancePct(hits, maxHitsTsk);
                            return (
                              <div key={j} style={{ marginBottom:4 }}>
                                <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"#DCEBF5" }}>
                                  <span>{t.name||t.title||`Task ${j+1}`}</span>
                                  <span style={{ color:TEAL }}>{pct}%</span>
                                </div>
                                <div style={{ height:2, borderRadius:1, background:"rgba(255,255,255,0.06)", marginTop:2 }}>
                                  <div style={{ height:"100%", borderRadius:1, width:`${pct}%`, background:TEAL }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* IntelProfile matches */}
                      {ipMatches.length > 0 && (
                        <div style={{ marginBottom:4 }}>
                          <div style={{ color:ORANGE, fontSize:9, letterSpacing:1, marginBottom:4 }}>◈ INTEL PROFILES ({ipMatches.length})</div>
                          {ipMatches.map((p,j) => {
                            const hits = overlap(job, p);
                            const pct  = relevancePct(hits, maxHitsIp);
                            return (
                              <div key={j} style={{ marginBottom:4 }}>
                                <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"#DCEBF5" }}>
                                  <span>{p.name||p.title||`Actor ${j+1}`}</span>
                                  {p.role && <span style={{ color:ORANGE, fontSize:8 }}>{p.role}</span>}
                                  <span style={{ color:ORANGE }}>{pct}%</span>
                                </div>
                                <div style={{ height:2, borderRadius:1, background:"rgba(255,255,255,0.06)", marginTop:2 }}>
                                  <div style={{ height:"100%", borderRadius:1, width:`${pct}%`, background:ORANGE }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {kbMatches.length===0 && taskMatches.length===0 && ipMatches.length===0 && (
                        <div style={{ color:RED, fontSize:10 }}>◌ No KB articles, tasks, or intel profiles matched. Mission is DARK.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess footer */}
          <div style={{ padding:"8px 16px", borderTop:`1px solid ${AMBER}33`, flexShrink:0 }}>
            <button onClick={assess} disabled={assessing||loading} style={{
              padding:"5px 14px", borderRadius:8, border:`1px solid ${AMBER}`,
              background: assessing?"rgba(245,166,35,0.3)":"transparent",
              color:AMBER, fontSize:10, letterSpacing:1, cursor:"pointer", fontFamily:MONO,
            }}>
              {assessing ? "◌ assessing…" : "▶ ASSESS READINESS"}
            </button>
            {brief && (
              <div style={{ marginTop:8, fontSize:10, color:"#DCEBF5", lineHeight:1.6, borderLeft:`2px solid ${AMBER}`, paddingLeft:10 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
