/**
 * F125 — Cinematic Scene × Task × Report Operational Reality Check (SCTROC)
 *
 * Parallel-fetches:
 *   /v1/cinematic/scene/01..10  → all 10 cinematic scenes (anchors, titles, descriptions)
 *   /entities/Task              → live mission tasks
 *   /v1/reports                 → intelligence reports
 *
 * Keyword-correlates each scene's anchor/description text against tasks AND reports to classify:
 *   FULLY_GROUNDED — matched both a task AND a report (scene reflects real ops + documented intel)
 *   TASK_ACTIVE    — matched tasks only (scene active in ops, not yet reported)
 *   REPORT_BACKED  — matched reports only (scene documented, no live task)
 *   SPECULATIVE    — no matches (scene not grounded in real operational data)
 *
 * Amber badge on SPECULATIVE count.
 * ▶ ASSESS GROUNDING → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:sctroc-toggle event.
 * Voice: "sctroc / scene reality check / speculative scenes / cinematic tasks /
 *         scene grounding / scene report".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_012_920;
const Z_INDEX  = 187;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const SCTROC_RE =
  /\b(sctroc|scene[\s-]reality[\s-]check|speculative[\s-]scenes?|cinematic[\s-]tasks?|scene[\s-]grounding|scene[\s-]report)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const BL     = "#3B82F6";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const PR     = "#A78BFA";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isSctrocQuery(text) {
  return SCTROC_RE.test(text || "");
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

function sceneText(s) {
  const anchors = Array.isArray(s.anchors)
    ? s.anchors.map(a => [a.label, a.description, a.value].filter(Boolean).join(" ")).join(" ")
    : "";
  return [s.title, s.description, s.subtitle, s.theme, anchors,
          ...(Array.isArray(s.tags) ? s.tags : []),
  ].filter(Boolean).join(" ");
}

function taskText(t) {
  return [t.title, t.name, t.description, t.priority, t.status, t.category,
          ...(Array.isArray(t.tags) ? t.tags : []),
  ].filter(Boolean).join(" ");
}

function reportText(r) {
  return [r.title, r.description, r.summary, r.type, r.author,
          ...(Array.isArray(r.tags) ? r.tags : []),
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

function classify(taskMatches, reportMatches) {
  const hasTask   = taskMatches.length > 0;
  const hasReport = reportMatches.length > 0;
  if (hasTask && hasReport) return "FULLY_GROUNDED";
  if (hasTask)              return "TASK_ACTIVE";
  if (hasReport)            return "REPORT_BACKED";
  return "SPECULATIVE";
}

const CLASS_COLOR = {
  FULLY_GROUNDED: GR,
  TASK_ACTIVE:    CY,
  REPORT_BACKED:  PR,
  SPECULATIVE:    AM,
};

const CLASS_LABEL = {
  FULLY_GROUNDED: "FULLY GROUNDED",
  TASK_ACTIVE:    "TASK ACTIVE",
  REPORT_BACKED:  "REPORT BACKED",
  SPECULATIVE:    "SPECULATIVE",
};

async function fetchAllScenes(base) {
  const ids = ["01","02","03","04","05","06","07","08","09","10"];
  const results = await Promise.all(
    ids.map(id =>
      fetch(`${base}/v1/cinematic/scene/${id}`)
        .then(r => r.json())
        .catch(() => null)
    )
  );
  return results.filter(Boolean).map((s, i) => ({ ...s, _sceneId: ids[i] }));
}

// ── async script for JarvisBrain ──────────────────────────────────────────────
export async function buildSctrocScript() {
  const base = apiBase();
  const [scenes, taskRes, reportRes] = await Promise.all([
    fetchAllScenes(base),
    fetch(`${base}/entities/Task`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/v1/reports`).then(r => r.json()).catch(() => ({})),
  ]);
  const tasks   = norm(taskRes,   ["tasks","items","data","results"]);
  const reports = norm(reportRes, ["reports","items","data","results"]);

  let fully = 0, taskOnly = 0, reportOnly = 0, speculative = 0;
  for (const scene of scenes) {
    const st = sceneText(scene);
    const tm = tasks.filter(t => overlap(st, taskText(t)) > 0);
    const rm = reports.filter(r => overlap(st, reportText(r)) > 0);
    const cls = classify(tm, rm);
    if (cls === "FULLY_GROUNDED")  fully++;
    else if (cls === "TASK_ACTIVE")   taskOnly++;
    else if (cls === "REPORT_BACKED") reportOnly++;
    else speculative++;
  }
  const total  = scenes.length;
  const covPct = total ? Math.round(((fully + taskOnly + reportOnly) / total) * 100) : 0;
  return `SCTROC Cinematic Scene Reality Check online, sir. Cross-referencing ${total} cinematic scenes against ${tasks.length} tasks and ${reports.length} intelligence reports: ${fully} fully grounded, ${taskOnly} task-active, ${reportOnly} report-backed, ${speculative} speculative. Operational grounding at ${covPct} percent.`;
}

// ── component ────────────────────────────────────────────────────────────────
export default function SceneTaskReportGrounding() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [items,     setItems]     = useState([]);
  const [stats,     setStats]     = useState({
    total:0, fully:0, taskOnly:0, reportOnly:0, speculative:0,
    taskCount:0, reportCount:0,
  });
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const [scenes, taskRes, reportRes] = await Promise.all([
        fetchAllScenes(base),
        fetch(`${base}/entities/Task`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/v1/reports`).then(r => r.json()).catch(() => ({})),
      ]);
      const tasks   = norm(taskRes,   ["tasks","items","data","results"]);
      const reports = norm(reportRes, ["reports","items","data","results"]);

      const classified = scenes.map(scene => {
        const st = sceneText(scene);
        const taskMatches = tasks
          .filter(t => overlap(st, taskText(t)) > 0)
          .map(t => ({ ...t, _rel: overlap(st, taskText(t)) }))
          .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const reportMatches = reports
          .filter(r => overlap(st, reportText(r)) > 0)
          .map(r => ({ ...r, _rel: overlap(st, reportText(r)) }))
          .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const cls = classify(taskMatches, reportMatches);
        return { scene, taskMatches, reportMatches, cls };
      });

      let fully = 0, taskOnly = 0, reportOnly = 0, speculative = 0;
      classified.forEach(({ cls }) => {
        if (cls === "FULLY_GROUNDED")   fully++;
        else if (cls === "TASK_ACTIVE")    taskOnly++;
        else if (cls === "REPORT_BACKED")  reportOnly++;
        else speculative++;
      });

      setItems(classified);
      setStats({
        total: classified.length, fully, taskOnly, reportOnly, speculative,
        taskCount: tasks.length, reportCount: reports.length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:sctroc-toggle", handler);
    return () => window.removeEventListener("jarvis:sctroc-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const { total, fully, taskOnly, reportOnly, speculative } = stats;
      const prompt = `SCTROC analysis: ${total} cinematic JARVIS scenes cross-referenced against live tasks and intelligence reports. Fully grounded: ${fully}, task-active: ${taskOnly}, report-backed: ${reportOnly}, speculative: ${speculative}. In exactly 2 sentences, assess the operational reality of the scene coverage and recommend which speculative scenes need immediate grounding in real tasks or reports.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type":"application/json", Authorization:`Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "").trim();
      setBrief(text);
      if (text) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type":"application/json", Authorization:`Bearer ${API_KEY}` },
          body: JSON.stringify({ text }),
        }).then(async res => {
          const blob = await res.blob();
          const url  = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => URL.revokeObjectURL(url);
          audio.play();
        }).catch(() => {});
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [assessing, stats]);

  const TABS = ["ALL","FULLY_GROUNDED","TASK_ACTIVE","REPORT_BACKED","SPECULATIVE"];

  const visible = items.filter(({ scene, cls }) => {
    if (tab !== "ALL" && cls !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return sceneText(scene).toLowerCase().includes(s);
  });

  const { total, fully, taskOnly, reportOnly, speculative, taskCount, reportCount } = stats;
  const covPct = total ? Math.round(((fully + taskOnly + reportOnly) / total) * 100) : 0;

  return (
    <>
      {/* ── toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Cinematic Scene × Task × Report Reality Check (SCTROC)"
        style={{
          position:"fixed", left:BTN_LEFT, bottom:8, zIndex:Z_INDEX,
          fontFamily:FONT, fontSize:10, padding:"4px 9px", cursor:"pointer",
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border:`1px solid ${CY}44`, borderRadius:5,
          boxShadow:`0 0 12px ${CY}${open?"88":"22"}`,
        }}
      >
        ◈ SCTROC
        {speculative > 0 && (
          <span style={{
            marginLeft:5, background:AM, color:"#000",
            borderRadius:9, padding:"1px 5px", fontSize:9, fontWeight:700,
          }}>{speculative}</span>
        )}
      </button>

      {/* ── panel ─────────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position:"fixed", left:20, bottom:50, zIndex:Z_INDEX+1,
          width:"min(780px,92vw)", maxHeight:"76vh", overflowY:"auto",
          background:BG, border:`1px solid ${BORDER}`,
          borderRadius:12, padding:"14px 16px",
          fontFamily:FONT, color:"#DCEBF5",
          boxShadow:`0 0 60px ${CY}18`,
        }}>
          {/* header */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
            <span style={{color:CY,fontSize:12,fontWeight:700,letterSpacing:2}}>◈ SCTROC</span>
            <span style={{color:DIM,fontSize:10,flex:1}}>
              Cinematic Scene × Task × Report Operational Reality Check
            </span>
            <button onClick={() => setOpen(false)} style={{
              background:"none",border:"none",color:DIM,cursor:"pointer",fontSize:16,lineHeight:1,padding:0
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
            {[
              ["SCENES",        total,       CY],
              ["TASKS",         taskCount,   CY],
              ["REPORTS",       reportCount, PR],
              ["FULLY GRND.",   fully,       GR],
              ["TASK ACTIVE",   taskOnly,    CY],
              ["REPORT BKCD",   reportOnly,  PR],
              ["SPECULATIVE",   speculative, AM],
              ["GROUNDING",     `${covPct}%`, covPct >= 70 ? GR : covPct >= 40 ? AM : "#EF4444"],
            ].map(([label,val,col]) => (
              <div key={label} style={{
                background:"rgba(0,207,255,0.05)",border:`1px solid ${col}33`,
                borderRadius:6,padding:"6px 10px",minWidth:72,textAlign:"center",
              }}>
                <div style={{color:col,fontSize:14,fontWeight:700}}>{val}</div>
                <div style={{color:DIM,fontSize:9,marginTop:2}}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{height:4,background:"rgba(255,255,255,0.08)",borderRadius:2,marginBottom:12,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${covPct}%`,background:`linear-gradient(90deg,${CY},${GR})`,borderRadius:2,transition:"width .4s"}} />
          </div>

          {/* filter tabs */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontFamily:FONT, fontSize:9, padding:"3px 8px", borderRadius:4, cursor:"pointer",
                background: tab===t ? CY : "rgba(0,207,255,0.08)",
                color: tab===t ? "#04060A" : CY,
                border:`1px solid ${CY}${tab===t?"":"33"}`,
              }}>{t.replace(/_/g," ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search scenes…"
              style={{
                marginLeft:"auto", fontFamily:FONT, fontSize:10, padding:"3px 8px",
                background:"rgba(0,207,255,0.06)", border:`1px solid ${CY}33`,
                borderRadius:4, color:CY, outline:"none", width:150,
              }}
            />
          </div>

          {/* assess button */}
          <button onClick={assess} disabled={assessing || loading} style={{
            fontFamily:FONT, fontSize:10, padding:"5px 14px", marginBottom:10,
            background: assessing ? "rgba(0,207,255,0.15)" : "rgba(0,207,255,0.1)",
            border:`1px solid ${CY}44`, borderRadius:5, color:CY, cursor:"pointer",
          }}>
            {assessing ? "▷ assessing…" : "▶ ASSESS GROUNDING"}
          </button>
          {brief && (
            <div style={{
              fontSize:11, color:"#DCEBF5", background:"rgba(0,207,255,0.06)",
              border:`1px solid ${CY}22`, borderRadius:6, padding:"8px 12px", marginBottom:10, lineHeight:1.6,
            }}>{brief}</div>
          )}

          {/* status */}
          {loading && <div style={{color:DIM,fontSize:11,marginBottom:8}}>loading scenes…</div>}
          {error   && <div style={{color:"#EF4444",fontSize:11,marginBottom:8}}>{error}</div>}

          {/* scene rows */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {visible.map(({ scene, taskMatches, reportMatches, cls }, idx) => {
              const id = scene._sceneId || scene.id || idx;
              const isExp = expanded[id];
              const clsColor = CLASS_COLOR[cls];
              const clsLabel = CLASS_LABEL[cls];
              const label = scene.title || scene.subtitle || `Scene ${id}`;
              return (
                <div key={id} style={{
                  background:"rgba(0,207,255,0.04)", border:`1px solid ${clsColor}22`,
                  borderRadius:7, padding:"8px 10px",
                }}>
                  <div
                    style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}
                    onClick={() => setExpanded(e => ({...e,[id]:!e[id]}))}
                  >
                    <span style={{
                      fontSize:9, padding:"1px 5px", borderRadius:3,
                      background:`${CY}22`, color:CY, fontWeight:700, minWidth:22, textAlign:"center",
                    }}>
                      {scene._sceneId || id}
                    </span>
                    <span style={{
                      fontSize:9, padding:"2px 6px", borderRadius:4,
                      background:`${clsColor}22`, color:clsColor, fontWeight:700,
                    }}>{clsLabel}</span>
                    <span style={{fontSize:11,flex:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                      {label}
                    </span>
                    <span style={{fontSize:9,color:DIM}}>
                      tasks:{taskMatches.length} reports:{reportMatches.length}
                    </span>
                    <span style={{color:DIM,fontSize:11}}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
                      {/* task matches */}
                      <div style={{flex:"1 1 45%",minWidth:200}}>
                        <div style={{fontSize:9,color:CY,marginBottom:4,fontWeight:700}}>TASKS ({taskMatches.length})</div>
                        {taskMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no task match</div>
                          : taskMatches.map((t,i) => {
                              const maxRel = taskMatches[0]._rel || 1;
                              const pct = Math.round((t._rel / maxRel) * 100);
                              return (
                                <div key={t.id||i} style={{
                                  background:"rgba(0,207,255,0.06)", border:`1px solid ${CY}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span>{t.title || t.name || `Task ${i+1}`}</span>
                                    {t.priority && (
                                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${CY}22`,color:CY}}>
                                        {String(t.priority).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${pct}%`,background:CY,borderRadius:2}} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>
                      {/* report matches */}
                      <div style={{flex:"1 1 45%",minWidth:200}}>
                        <div style={{fontSize:9,color:PR,marginBottom:4,fontWeight:700}}>REPORTS ({reportMatches.length})</div>
                        {reportMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no report match</div>
                          : reportMatches.map((r,i) => {
                              const maxRel = reportMatches[0]._rel || 1;
                              const pct = Math.round((r._rel / maxRel) * 100);
                              return (
                                <div key={r.id||i} style={{
                                  background:"rgba(167,139,250,0.06)", border:`1px solid ${PR}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span>{r.title || `Report ${i+1}`}</span>
                                    {r.type && (
                                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${PR}22`,color:PR}}>
                                        {String(r.type).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${pct}%`,background:PR,borderRadius:2}} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && !loading && (
              <div style={{color:DIM,fontSize:11,textAlign:"center",padding:"20px 0"}}>
                {items.length === 0 ? "No scene data available." : "No results match filter."}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
