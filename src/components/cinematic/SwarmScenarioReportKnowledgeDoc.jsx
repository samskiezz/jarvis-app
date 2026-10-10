/**
 * F130 — SwarmJob × Scenario × Report × Knowledge
 *         Mission Documentation Coverage (SSRKMDOC)
 *
 * Parallel-fetches:
 *   /entities/SwarmJob    → live automation jobs
 *   /v1/scenario/list     → playbooks
 *   /v1/reports           → intelligence reports
 *   /knowledge/           → knowledge-base articles
 *
 * Keyword-correlates each swarm job against scenarios, reports,
 * AND KB articles to classify:
 *   FULLY_DOCUMENTED — all three sources match
 *   DUAL_BACKED      — any two of the three sources match
 *   SINGLE_BACKED    — exactly one source matches
 *   UNDOCUMENTED     — no matches (documentation gap)
 *
 * Amber badge on undocumented count.
 * ▶ ASSESS DOCUMENTATION → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:ssrkmdoc-toggle event.
 * Voice: "ssrkmdoc / swarm documentation / swarm scenario report /
 *         undocumented swarm / mission documentation / swarm knowledge coverage".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_015_720;
const Z_INDEX  = 192;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const SSRKMDOC_RE =
  /\b(ssrkmdoc|swarm[\s-]documentation|swarm[\s-]scenario[\s-]report|undocumented[\s-]swarm|mission[\s-]documentation|swarm[\s-]knowledge[\s-]coverage)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const AM     = "#F59E0B";
const GR     = "#22C55E";
const PU     = "#A855F7";
const TE     = "#14B8A6";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isSsrkmdocQuery(text) {
  return SSRKMDOC_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────
function tokens(str) {
  if (!str) return [];
  return String(str).toLowerCase().split(/\W+/).filter(t => t.length > 3);
}

function overlap(a, b) {
  const sa = new Set(tokens(a));
  return tokens(b).filter(t => sa.has(t)).length;
}

function jobText(j) {
  return [
    j.name, j.description, j.type, j.status, j.target, j.mission,
    ...(Array.isArray(j.tags) ? j.tags : []),
  ].filter(Boolean).join(" ");
}

function scenarioText(s) {
  return [
    s.name, s.title, s.description, s.type, s.category, s.objective,
    ...(Array.isArray(s.tags) ? s.tags : []),
  ].filter(Boolean).join(" ");
}

function reportText(r) {
  return [
    r.title, r.name, r.description, r.summary, r.type, r.author,
    ...(Array.isArray(r.tags) ? r.tags : []),
  ].filter(Boolean).join(" ");
}

function kbText(a) {
  return [
    a.title, a.content, a.summary, a.category,
    ...(Array.isArray(a.tags) ? a.tags : []),
  ].filter(Boolean).join(" ");
}

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of keys) {
      if (Array.isArray(raw[k])) return raw[k];
    }
  }
  return [];
}

function classify(scMatches, rpMatches, kbMatches) {
  const sources = [
    scMatches.length > 0,
    rpMatches.length > 0,
    kbMatches.length > 0,
  ].filter(Boolean).length;
  if (sources === 3) return "FULLY_DOCUMENTED";
  if (sources === 2) return "DUAL_BACKED";
  if (sources === 1) return "SINGLE_BACKED";
  return "UNDOCUMENTED";
}

const CLASS_COLOR = {
  FULLY_DOCUMENTED: CY,
  DUAL_BACKED:      GR,
  SINGLE_BACKED:    AM,
  UNDOCUMENTED:     DIM,
};

const CLASS_LABEL = {
  FULLY_DOCUMENTED: "FULLY DOCUMENTED",
  DUAL_BACKED:      "DUAL BACKED",
  SINGLE_BACKED:    "SINGLE BACKED",
  UNDOCUMENTED:     "UNDOCUMENTED",
};

// ── buildScript (called by JarvisBrain) ──────────────────────────────────────
export async function buildSsrkmdocScript() {
  const base = apiBase();
  const [sjRes, scRes, rpRes, kbRes] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/v1/scenario/list`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/v1/reports`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/knowledge/`).then(r => r.json()).catch(() => ({})),
  ]);
  const jobs      = norm(sjRes, ["jobs","swarm_jobs","items","data","results"]);
  const scenarios = norm(scRes, ["scenarios","items","data","results"]);
  const reports   = norm(rpRes, ["reports","items","data","results"]);
  const articles  = norm(kbRes, ["articles","knowledge","items","data","results"]);

  let full = 0, dual = 0, single = 0, undoc = 0;
  for (const job of jobs) {
    const jt = jobText(job);
    const sm = scenarios.filter(s => overlap(jt, scenarioText(s)) > 0);
    const rm = reports.filter(r => overlap(jt, reportText(r)) > 0);
    const km = articles.filter(k => overlap(jt, kbText(k)) > 0);
    const cls = classify(sm, rm, km);
    if (cls === "FULLY_DOCUMENTED")  full++;
    else if (cls === "DUAL_BACKED")  dual++;
    else if (cls === "SINGLE_BACKED") single++;
    else undoc++;
  }
  const total  = jobs.length;
  const covPct = total ? Math.round(((full + dual + single) / total) * 100) : 0;
  return `SSRKMDOC Mission Documentation Coverage online, sir. Cross-referencing ${total} swarm jobs against ${scenarios.length} scenarios, ${reports.length} reports, and ${articles.length} KB articles: ${full} fully-documented, ${dual} dual-backed, ${single} single-backed, ${undoc} undocumented. Mission documentation coverage at ${covPct} percent.`;
}

// ── component ────────────────────────────────────────────────────────────────
export default function SwarmScenarioReportKnowledgeDoc() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [items,     setItems]     = useState([]);
  const [stats,     setStats]     = useState({
    total:0, full:0, dual:0, single:0, undoc:0,
    scCount:0, rpCount:0, kbCount:0,
  });
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const [sjRes, scRes, rpRes, kbRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/v1/scenario/list`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/v1/reports`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/knowledge/`).then(r => r.json()).catch(() => ({})),
      ]);
      const jobs      = norm(sjRes, ["jobs","swarm_jobs","items","data","results"]);
      const scenarios = norm(scRes, ["scenarios","items","data","results"]);
      const reports   = norm(rpRes, ["reports","items","data","results"]);
      const articles  = norm(kbRes, ["articles","knowledge","items","data","results"]);

      let full = 0, dual = 0, single = 0, undoc = 0;
      const enriched = jobs.map(job => {
        const jt = jobText(job);
        const scMatches = scenarios.filter(s => overlap(jt, scenarioText(s)) > 0);
        const rpMatches = reports.filter(r => overlap(jt, reportText(r)) > 0);
        const kbMatches = articles.filter(k => overlap(jt, kbText(k)) > 0);
        const cls = classify(scMatches, rpMatches, kbMatches);
        if (cls === "FULLY_DOCUMENTED")  full++;
        else if (cls === "DUAL_BACKED")  dual++;
        else if (cls === "SINGLE_BACKED") single++;
        else undoc++;
        return { job, cls, scMatches, rpMatches, kbMatches };
      });

      setItems(enriched);
      setStats({
        total: jobs.length, full, dual, single, undoc,
        scCount: scenarios.length, rpCount: reports.length, kbCount: articles.length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) { load(); timerRef.current = setInterval(load, POLL_MS); }
    else       { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(p => !p);
    window.addEventListener("jarvis:ssrkmdoc-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ssrkmdoc-toggle", onToggle);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true); setBrief("");
    try {
      const script = await buildSsrkmdocScript();
      const base = apiBase();
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      }).then(r => r.json()).catch(() => ({}));
      const text = res.response || res.reply || res.message || res.content || script;
      setBrief(text);
      try {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type":"application/json", "Authorization":`Bearer ${API_KEY}` },
          body: JSON.stringify({ text }),
        });
      } catch {}
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const TABS = ["ALL","FULLY_DOCUMENTED","DUAL_BACKED","SINGLE_BACKED","UNDOCUMENTED"];
  const visible = items.filter(it => {
    if (tab !== "ALL" && it.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      const jt = jobText(it.job).toLowerCase();
      if (!jt.includes(q)) return false;
    }
    return true;
  });

  const badgeStyle = {
    position:"absolute", top:-6, right:-6,
    background: AM, color:"#000", borderRadius:9999,
    fontSize:9, fontWeight:700, fontFamily:FONT,
    padding:"1px 5px", lineHeight:1.4,
    display: stats.undoc > 0 ? "block" : "none",
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          position:"fixed", bottom:8, left:BTN_LEFT, zIndex:Z_INDEX,
          background: open ? CY : "rgba(0,207,255,0.12)",
          color: open ? "#000" : CY,
          border:`1px solid ${CY}`, borderRadius:4,
          padding:"3px 8px", fontSize:10, fontFamily:FONT,
          cursor:"pointer", whiteSpace:"nowrap",
        }}
      >
        <span style={{position:"relative", display:"inline-block"}}>
          ◈ SSRKMDOC
          <span style={badgeStyle}>{stats.undoc}</span>
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position:"fixed", bottom:38, right:8, zIndex:Z_INDEX+1,
          width:620, maxHeight:"80vh", overflow:"hidden",
          background:BG, border:`1px solid ${BORDER}`, borderRadius:8,
          fontFamily:FONT, display:"flex", flexDirection:"column",
        }}>
          {/* Header */}
          <div style={{
            padding:"10px 14px 8px", borderBottom:`1px solid ${BORDER}`,
            display:"flex", alignItems:"center", justifyContent:"space-between",
          }}>
            <span style={{color:CY, fontSize:11, fontWeight:700, letterSpacing:1}}>
              ◈ SSRKMDOC — MISSION DOCUMENTATION COVERAGE
            </span>
            <button onClick={() => setOpen(false)}
              style={{background:"none",border:"none",color:DIM,cursor:"pointer",fontSize:14}}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display:"grid", gridTemplateColumns:"repeat(7,1fr)",
            gap:4, padding:"8px 14px", borderBottom:`1px solid ${BORDER}`,
          }}>
            {[
              ["JOBS",       stats.total,     CY],
              ["SCENARIOS",  stats.scCount,   GR],
              ["REPORTS",    stats.rpCount,   PU],
              ["KB ARTS",    stats.kbCount,   TE],
              ["FULLY DOC.", stats.full,      CY],
              ["DUAL BACK.", stats.dual,      GR],
              ["UNDOC.",     stats.undoc,     AM],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background:"rgba(255,255,255,0.04)", borderRadius:4,
                padding:"5px 4px", textAlign:"center",
              }}>
                <div style={{color:col,fontSize:13,fontWeight:700}}>{val}</div>
                <div style={{color:DIM,fontSize:8,marginTop:2}}>{label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          {stats.total > 0 && (() => {
            const pct = Math.round(((stats.full + stats.dual + stats.single) / stats.total) * 100);
            return (
              <div style={{padding:"4px 14px", borderBottom:`1px solid ${BORDER}`}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:DIM,marginBottom:3}}>
                  <span>DOCUMENTATION COVERAGE</span><span style={{color:CY}}>{pct}%</span>
                </div>
                <div style={{height:4,background:"rgba(255,255,255,0.06)",borderRadius:2}}>
                  <div style={{height:"100%",width:`${pct}%`,background:pct>70?GR:pct>40?AM:"#EF4444",borderRadius:2,transition:"width 0.5s"}} />
                </div>
              </div>
            );
          })()}

          {/* Filter tabs + search */}
          <div style={{
            display:"flex", gap:4, padding:"6px 14px", borderBottom:`1px solid ${BORDER}`,
            flexWrap:"wrap", alignItems:"center",
          }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  background: tab===t ? "rgba(0,207,255,0.18)" : "none",
                  border:`1px solid ${tab===t ? CY : BORDER}`,
                  color: tab===t ? CY : DIM,
                  borderRadius:3, padding:"2px 7px", fontSize:9,
                  cursor:"pointer", fontFamily:FONT,
                }}
              >{CLASS_LABEL[t] || t}</button>
            ))}
            <input
              placeholder="search jobs…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{
                marginLeft:"auto", background:"rgba(255,255,255,0.05)",
                border:`1px solid ${BORDER}`, borderRadius:3,
                color:"#fff", fontSize:10, padding:"3px 8px",
                fontFamily:FONT, outline:"none", width:140,
              }}
            />
          </div>

          {/* Assess button */}
          <div style={{padding:"6px 14px", borderBottom:`1px solid ${BORDER}`}}>
            <button onClick={assess} disabled={assessing}
              style={{
                background: assessing ? "rgba(0,207,255,0.08)" : "rgba(0,207,255,0.14)",
                border:`1px solid ${CY}`, color:CY,
                borderRadius:4, padding:"4px 12px", fontSize:10,
                cursor: assessing ? "default" : "pointer", fontFamily:FONT,
              }}
            >{assessing ? "▶ ASSESSING…" : "▶ ASSESS DOCUMENTATION"}</button>
            {brief && (
              <div style={{
                marginTop:6, padding:"6px 10px",
                background:"rgba(0,207,255,0.06)",
                border:`1px solid ${BORDER}`, borderRadius:4,
                color:"#C9D9E8", fontSize:10, lineHeight:1.6,
              }}>{brief}</div>
            )}
          </div>

          {/* List */}
          <div style={{overflowY:"auto", flex:1, padding:"6px 14px"}}>
            {loading && <div style={{color:DIM,fontSize:10,textAlign:"center",padding:12}}>Loading…</div>}
            {error   && <div style={{color:"#EF4444",fontSize:10,padding:8}}>{error}</div>}
            {visible.map((it, idx) => {
              const key = it.job.id || it.job.name || idx;
              const exp = !!expanded[key];
              const col = CLASS_COLOR[it.cls];
              return (
                <div key={key} style={{
                  borderBottom:`1px solid ${BORDER}`, padding:"7px 0",
                }}>
                  <div
                    onClick={() => setExpanded(p => ({...p,[key]:!p[key]}))}
                    style={{
                      display:"flex", alignItems:"center", gap:8,
                      cursor:"pointer",
                    }}
                  >
                    <span style={{
                      color: col, fontSize:9, fontWeight:700,
                      background:`${col}22`, borderRadius:3,
                      padding:"1px 6px", whiteSpace:"nowrap",
                    }}>{CLASS_LABEL[it.cls]}</span>
                    <span style={{color:"#C9D9E8",fontSize:10,flex:1}}>
                      {it.job.name || it.job.id || "Unnamed Job"}
                    </span>
                    <span style={{color:DIM,fontSize:9}}>
                      SC:{it.scMatches.length} RP:{it.rpMatches.length} KB:{it.kbMatches.length}
                    </span>
                    <span style={{color:DIM,fontSize:10}}>{exp ? "▲" : "▼"}</span>
                  </div>

                  {exp && (
                    <div style={{marginTop:6,paddingLeft:8}}>
                      {it.scMatches.length > 0 && (
                        <div style={{marginBottom:6}}>
                          <div style={{color:GR,fontSize:9,fontWeight:700,marginBottom:3}}>
                            MATCHED SCENARIOS ({it.scMatches.length})
                          </div>
                          {it.scMatches.slice(0,5).map((s,i) => {
                            const sc = overlap(jobText(it.job), scenarioText(s));
                            return (
                              <div key={i} style={{
                                display:"flex",alignItems:"center",gap:8,marginBottom:3,
                              }}>
                                <span style={{color:"#C9D9E8",fontSize:9,flex:1}}>
                                  {s.name || s.title || "Scenario"}
                                </span>
                                <div style={{
                                  width:60, height:4,
                                  background:"rgba(255,255,255,0.08)", borderRadius:2,
                                }}>
                                  <div style={{
                                    height:"100%",borderRadius:2,background:GR,
                                    width:`${Math.min(100,sc*20)}%`,
                                  }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {it.rpMatches.length > 0 && (
                        <div style={{marginBottom:6}}>
                          <div style={{color:PU,fontSize:9,fontWeight:700,marginBottom:3}}>
                            MATCHED REPORTS ({it.rpMatches.length})
                          </div>
                          {it.rpMatches.slice(0,5).map((r,i) => {
                            const sc = overlap(jobText(it.job), reportText(r));
                            return (
                              <div key={i} style={{
                                display:"flex",alignItems:"center",gap:8,marginBottom:3,
                              }}>
                                <span style={{
                                  color:"#C9D9E8",fontSize:9,flex:1,
                                }}>{r.title || r.name || "Report"}</span>
                                <span style={{
                                  color:PU,fontSize:8,background:`${PU}22`,
                                  borderRadius:2,padding:"1px 4px",
                                }}>{r.type || "REPORT"}</span>
                                <div style={{
                                  width:60, height:4,
                                  background:"rgba(255,255,255,0.08)", borderRadius:2,
                                }}>
                                  <div style={{
                                    height:"100%",borderRadius:2,background:PU,
                                    width:`${Math.min(100,sc*20)}%`,
                                  }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {it.kbMatches.length > 0 && (
                        <div style={{marginBottom:6}}>
                          <div style={{color:TE,fontSize:9,fontWeight:700,marginBottom:3}}>
                            MATCHED KB ARTICLES ({it.kbMatches.length})
                          </div>
                          {it.kbMatches.slice(0,5).map((k,i) => {
                            const sc = overlap(jobText(it.job), kbText(k));
                            return (
                              <div key={i} style={{
                                display:"flex",alignItems:"center",gap:8,marginBottom:3,
                              }}>
                                <span style={{color:"#C9D9E8",fontSize:9,flex:1}}>
                                  {k.title || "KB Article"}
                                </span>
                                <div style={{
                                  width:60, height:4,
                                  background:"rgba(255,255,255,0.08)", borderRadius:2,
                                }}>
                                  <div style={{
                                    height:"100%",borderRadius:2,background:TE,
                                    width:`${Math.min(100,sc*20)}%`,
                                  }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && !loading && (
              <div style={{color:DIM,fontSize:11,textAlign:"center",padding:"20px 0"}}>
                {items.length === 0 ? "No swarm job data available." : "No results match filter."}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
