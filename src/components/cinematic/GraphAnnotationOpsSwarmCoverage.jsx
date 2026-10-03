/**
 * F124 — Graph Annotation × Ops Event × SwarmJob Operational Annotation Coverage (GAOSCOV)
 *
 * Parallel-fetches:
 *   /v1/graph/annotations  → graph annotation records
 *   /v1/ops/events         → live operational events
 *   /entities/SwarmJob     → active swarm job operations
 *
 * Keyword-correlates each graph annotation against ops events AND swarm jobs to classify:
 *   FULLY_OPERATIONAL — matched both (annotation grounded in live ops + swarm coverage)
 *   OPS_LINKED        — matched ops events only (no swarm backing)
 *   SWARM_ACTIVE      — matched swarm jobs only (not yet in live ops feed)
 *   DORMANT           — no matches (annotation unlinked from current operations)
 *
 * Amber badge on DORMANT count.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:gaoscov-toggle event.
 * Voice: "gaoscov / graph annotation ops / annotation coverage /
 *         annotation swarm / operational annotation / dormant annotation".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_012_360;
const Z_INDEX  = 186;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const GAOSCOV_RE =
  /\b(gaoscov|graph[\s-]annotation[\s-]ops|annotation[\s-]coverage|annotation[\s-]swarm|operational[\s-]annotation|dormant[\s-]annotation)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const BL     = "#3B82F6";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isGaoscovQuery(text) {
  return GAOSCOV_RE.test(text || "");
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

function annotationText(a) {
  return [a.text, a.label, a.note, a.description, a.entity, a.node_id,
          ...(Array.isArray(a.tags) ? a.tags : []),
  ].filter(Boolean).join(" ");
}

function opsText(e) {
  return [e.title, e.description, e.type, e.category, e.location,
          ...(Array.isArray(e.tags) ? e.tags : []),
  ].filter(Boolean).join(" ");
}

function swarmText(j) {
  return [j.name, j.description, j.type, j.status, j.objective,
          ...(Array.isArray(j.tags) ? j.tags : []),
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

function classify(ann, opsMatches, swarmMatches) {
  const hasOps   = opsMatches.length > 0;
  const hasSwarm = swarmMatches.length > 0;
  if (hasOps && hasSwarm) return "FULLY_OPERATIONAL";
  if (hasOps)             return "OPS_LINKED";
  if (hasSwarm)           return "SWARM_ACTIVE";
  return "DORMANT";
}

const CLASS_COLOR = {
  FULLY_OPERATIONAL: GR,
  OPS_LINKED:        BL,
  SWARM_ACTIVE:      CY,
  DORMANT:           AM,
};

const CLASS_LABEL = {
  FULLY_OPERATIONAL: "FULLY OPERATIONAL",
  OPS_LINKED:        "OPS LINKED",
  SWARM_ACTIVE:      "SWARM ACTIVE",
  DORMANT:           "DORMANT",
};

// ── async script for JarvisBrain ──────────────────────────────────────────────
export async function buildGaoscovScript() {
  const base = apiBase();
  const [annRes, opsRes, swRes] = await Promise.all([
    fetch(`${base}/v1/graph/annotations`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/v1/ops/events`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/SwarmJob`).then(r => r.json()).catch(() => ({})),
  ]);
  const annotations = norm(annRes, ["annotations","items","data","results"]);
  const ops         = norm(opsRes,  ["events","items","data","results"]);
  const swarmJobs   = norm(swRes,   ["swarm_jobs","swarmjobs","items","data","results"]);

  let fully = 0, opsOnly = 0, swarmOnly = 0, dormant = 0;
  for (const ann of annotations) {
    const at = annotationText(ann);
    const opsMatches   = ops.filter(e => overlap(at, opsText(e))   > 0);
    const swarmMatches = swarmJobs.filter(j => overlap(at, swarmText(j)) > 0);
    const cls = classify(ann, opsMatches, swarmMatches);
    if (cls === "FULLY_OPERATIONAL") fully++;
    else if (cls === "OPS_LINKED")   opsOnly++;
    else if (cls === "SWARM_ACTIVE") swarmOnly++;
    else dormant++;
  }
  const total = annotations.length;
  const covPct = total ? Math.round(((fully + opsOnly + swarmOnly) / total) * 100) : 0;
  return `GAOSCOV Operational Annotation Coverage online, sir. Cross-referencing ${total} graph annotations against ${ops.length} operational events and ${swarmJobs.length} swarm jobs: ${fully} fully operational, ${opsOnly} ops-linked, ${swarmOnly} swarm-active, ${dormant} dormant. Coverage at ${covPct} percent.`;
}

// ── component ────────────────────────────────────────────────────────────────
export default function GraphAnnotationOpsSwarmCoverage() {
  const [open,    setOpen]    = useState(false);
  const [tab,     setTab]     = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [items,   setItems]   = useState([]);
  const [stats,   setStats]   = useState({ total:0, fully:0, opsOnly:0, swarmOnly:0, dormant:0, opsCount:0, swarmCount:0 });
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief,    setBrief]    = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const [annRes, opsRes, swRes] = await Promise.all([
        fetch(`${base}/v1/graph/annotations`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/v1/ops/events`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/entities/SwarmJob`).then(r => r.json()).catch(() => ({})),
      ]);
      const annotations = norm(annRes, ["annotations","items","data","results"]);
      const ops         = norm(opsRes,  ["events","items","data","results"]);
      const swarmJobs   = norm(swRes,   ["swarm_jobs","swarmjobs","items","data","results"]);

      const classified = annotations.map(ann => {
        const at = annotationText(ann);
        const opsMatches   = ops.filter(e => overlap(at, opsText(e))   > 0)
                               .map(e => ({ ...e, _rel: overlap(at, opsText(e)) }))
                               .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const swarmMatches = swarmJobs.filter(j => overlap(at, swarmText(j)) > 0)
                               .map(j => ({ ...j, _rel: overlap(at, swarmText(j)) }))
                               .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const cls = classify(ann, opsMatches, swarmMatches);
        return { ann, opsMatches, swarmMatches, cls };
      });

      let fully = 0, opsOnly = 0, swarmOnly = 0, dormant = 0;
      classified.forEach(({ cls }) => {
        if (cls === "FULLY_OPERATIONAL") fully++;
        else if (cls === "OPS_LINKED")   opsOnly++;
        else if (cls === "SWARM_ACTIVE") swarmOnly++;
        else dormant++;
      });

      setItems(classified);
      setStats({ total: classified.length, fully, opsOnly, swarmOnly, dormant,
                 opsCount: ops.length, swarmCount: swarmJobs.length });
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
    window.addEventListener("jarvis:gaoscov-toggle", handler);
    return () => window.removeEventListener("jarvis:gaoscov-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const { total, fully, opsOnly, swarmOnly, dormant } = stats;
      const prompt = `GAOSCOV analysis: ${total} graph annotations cross-referenced against ops events and swarm jobs. Fully operational: ${fully}, ops-linked: ${opsOnly}, swarm-active: ${swarmOnly}, dormant: ${dormant}. In exactly 2 sentences, assess the operational annotation coverage gap and recommend priority action.`;
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
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => URL.revokeObjectURL(url);
          audio.play();
        }).catch(() => {});
      }
    } catch (e) {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [assessing, stats]);

  const TABS = ["ALL","FULLY_OPERATIONAL","OPS_LINKED","SWARM_ACTIVE","DORMANT"];

  const visible = items.filter(({ ann, cls }) => {
    if (tab !== "ALL" && cls !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return annotationText(ann).toLowerCase().includes(s);
  });

  const { total, fully, opsOnly, swarmOnly, dormant, opsCount, swarmCount } = stats;
  const covPct = total ? Math.round(((fully + opsOnly + swarmOnly) / total) * 100) : 0;

  return (
    <>
      {/* ── toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Graph Annotation × Ops × Swarm Coverage (GAOSCOV)"
        style={{
          position:"fixed", left:BTN_LEFT, bottom:8, zIndex:Z_INDEX,
          fontFamily:FONT, fontSize:10, padding:"4px 9px", cursor:"pointer",
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border:`1px solid ${CY}44`, borderRadius:5,
          boxShadow:`0 0 12px ${CY}${open?"88":"22"}`,
        }}
      >
        ◈ GAOSCOV
        {dormant > 0 && (
          <span style={{
            marginLeft:5, background:AM, color:"#000",
            borderRadius:9, padding:"1px 5px", fontSize:9, fontWeight:700,
          }}>{dormant}</span>
        )}
      </button>

      {/* ── panel ─────────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position:"fixed", left:20, bottom:50, zIndex:Z_INDEX+1,
          width:"min(760px,92vw)", maxHeight:"76vh", overflowY:"auto",
          background:BG, border:`1px solid ${BORDER}`,
          borderRadius:12, padding:"14px 16px",
          fontFamily:FONT, color:"#DCEBF5",
          boxShadow:`0 0 60px ${CY}18`,
        }}>
          {/* header */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
            <span style={{color:CY,fontSize:12,fontWeight:700,letterSpacing:2}}>◈ GAOSCOV</span>
            <span style={{color:DIM,fontSize:10,flex:1}}>
              Graph Annotation × Ops Event × SwarmJob Operational Annotation Coverage
            </span>
            <button onClick={() => setOpen(false)} style={{
              background:"none",border:"none",color:DIM,cursor:"pointer",fontSize:16,lineHeight:1,padding:0
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
            {[
              ["ANNOTATIONS", total,    CY],
              ["OPS EVENTS",  opsCount, BL],
              ["SWARM JOBS",  swarmCount, "#22C55E"],
              ["FULLY OPS",   fully,    GR],
              ["OPS LINKED",  opsOnly,  BL],
              ["SWARM ACT.",  swarmOnly,CY],
              ["DORMANT",     dormant,  AM],
              ["COVERAGE",    `${covPct}%`, covPct >= 70 ? GR : covPct >= 40 ? AM : "#EF4444"],
            ].map(([label,val,col]) => (
              <div key={label} style={{
                background:"rgba(0,207,255,0.05)",border:`1px solid ${col}33`,
                borderRadius:6,padding:"6px 10px",minWidth:70,textAlign:"center",
              }}>
                <div style={{color:col,fontSize:14,fontWeight:700}}>{val}</div>
                <div style={{color:DIM,fontSize:9,marginTop:2}}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{height:4,background:"rgba(255,255,255,0.08)",borderRadius:2,marginBottom:12,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${covPct}%`,background:`linear-gradient(90deg,${BL},${GR})`,borderRadius:2,transition:"width .4s"}} />
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
              placeholder="search annotations…"
              style={{
                marginLeft:"auto", fontFamily:FONT, fontSize:10, padding:"3px 8px",
                background:"rgba(0,207,255,0.06)", border:`1px solid ${CY}33`,
                borderRadius:4, color:CY, outline:"none", width:160,
              }}
            />
          </div>

          {/* assess button */}
          <button onClick={assess} disabled={assessing || loading} style={{
            fontFamily:FONT, fontSize:10, padding:"5px 14px", marginBottom:10,
            background: assessing ? "rgba(0,207,255,0.15)" : "rgba(0,207,255,0.1)",
            border:`1px solid ${CY}44`, borderRadius:5, color:CY, cursor:"pointer",
          }}>
            {assessing ? "▷ assessing…" : "▶ ASSESS COVERAGE"}
          </button>
          {brief && (
            <div style={{
              fontSize:11, color:"#DCEBF5", background:"rgba(0,207,255,0.06)",
              border:`1px solid ${CY}22`, borderRadius:6, padding:"8px 12px", marginBottom:10, lineHeight:1.6,
            }}>{brief}</div>
          )}

          {/* status */}
          {loading && <div style={{color:DIM,fontSize:11,marginBottom:8}}>loading…</div>}
          {error   && <div style={{color:"#EF4444",fontSize:11,marginBottom:8}}>{error}</div>}

          {/* annotation rows */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {visible.slice(0,80).map(({ ann, opsMatches, swarmMatches, cls }, idx) => {
              const id = ann.id || ann.node_id || idx;
              const isExp = expanded[id];
              const clsColor = CLASS_COLOR[cls];
              const clsLabel = CLASS_LABEL[cls];
              const label = ann.text || ann.label || ann.note || ann.entity || `Annotation ${idx+1}`;
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
                      fontSize:9, padding:"2px 6px", borderRadius:4,
                      background:`${clsColor}22`, color:clsColor, fontWeight:700,
                    }}>{clsLabel}</span>
                    <span style={{fontSize:11,flex:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                      {label}
                    </span>
                    <span style={{fontSize:9,color:DIM}}>
                      ops:{opsMatches.length} swarm:{swarmMatches.length}
                    </span>
                    <span style={{color:DIM,fontSize:11}}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
                      {/* ops matches */}
                      <div style={{flex:"1 1 45%",minWidth:200}}>
                        <div style={{fontSize:9,color:BL,marginBottom:4,fontWeight:700}}>OPS EVENTS ({opsMatches.length})</div>
                        {opsMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no ops event match</div>
                          : opsMatches.map((e,i) => {
                              const maxRel = opsMatches[0]._rel || 1;
                              const pct = Math.round((e._rel / maxRel) * 100);
                              return (
                                <div key={e.id||i} style={{
                                  background:"rgba(59,130,246,0.08)", border:`1px solid ${BL}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2}}>
                                    {e.title || e.name || `Event ${i+1}`}
                                  </div>
                                  <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${pct}%`,background:BL,borderRadius:2}} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>
                      {/* swarm matches */}
                      <div style={{flex:"1 1 45%",minWidth:200}}>
                        <div style={{fontSize:9,color:CY,marginBottom:4,fontWeight:700}}>SWARM JOBS ({swarmMatches.length})</div>
                        {swarmMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no swarm job match</div>
                          : swarmMatches.map((j,i) => {
                              const maxRel = swarmMatches[0]._rel || 1;
                              const pct = Math.round((j._rel / maxRel) * 100);
                              return (
                                <div key={j.id||i} style={{
                                  background:"rgba(0,207,255,0.06)", border:`1px solid ${CY}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span>{j.name || `Job ${i+1}`}</span>
                                    {j.status && (
                                      <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:`${CY}22`,color:CY}}>
                                        {String(j.status).toUpperCase()}
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
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && !loading && (
              <div style={{color:DIM,fontSize:11,textAlign:"center",padding:"20px 0"}}>
                {items.length === 0 ? "No annotation data available." : "No results match filter."}
              </div>
            )}
            {visible.length > 80 && (
              <div style={{color:DIM,fontSize:10,textAlign:"center"}}>
                showing 80 of {visible.length} — refine search to narrow
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
