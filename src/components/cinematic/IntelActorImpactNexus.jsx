/**
 * F127 — IntelProfile × Task × Investment × Knowledge Actor Impact Nexus (AIKIN)
 *
 * Parallel-fetches:
 *   /entities/IntelProfile  → threat actor profiles
 *   /entities/Task          → active tasks
 *   /entities/Investment    → portfolio assets
 *   /knowledge/             → knowledge-base articles
 *
 * Keyword-correlates each threat actor profile against tasks, investments,
 * AND KB articles to classify:
 *   FULL_IMPACT  — matched tasks + investments + KB (maximum exposure)
 *   HIGH_IMPACT  — matched any two of the three
 *   TRACKED      — matched exactly one source
 *   UNTRACKED    — no matches (intelligence gap)
 *
 * Red pulse + badge on FULL_IMPACT count.
 * ▶ ASSESS IMPACT → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:aikin-toggle event.
 * Voice: "aikin / actor impact / intel actor impact / threat actor nexus /
 *         full impact actor / untracked actors / actor exposure nexus".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_014_040;
const Z_INDEX  = 189;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const AIKIN_RE =
  /\b(aikin|actor[\s-]impact|intel[\s-]actor[\s-]impact|threat[\s-]actor[\s-]nexus|full[\s-]impact[\s-]actor|untracked[\s-]actors|actor[\s-]exposure[\s-]nexus)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const RE     = "#EF4444";
const AM     = "#F59E0B";
const OR     = "#F97316";
const GR     = "#22C55E";
const PU     = "#A78BFA";
const TE     = "#2DD4BF";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isAikinQuery(text) {
  return AIKIN_RE.test(text || "");
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

function profileText(p) {
  return [
    p.name, p.aliases, p.org, p.organisation, p.role,
    p.description, p.country, p.sector,
    ...(Array.isArray(p.tags) ? p.tags : []),
    ...(Array.isArray(p.aliases) ? p.aliases : []),
  ].filter(Boolean).join(" ");
}

function taskText(t) {
  return [t.name, t.title, t.description, t.type, t.status, t.assigned_to,
          ...(Array.isArray(t.tags) ? t.tags : []),
  ].filter(Boolean).join(" ");
}

function investText(i) {
  return [i.name, i.type, i.sector, i.description, i.ticker, i.asset_class,
          ...(Array.isArray(i.tags) ? i.tags : []),
  ].filter(Boolean).join(" ");
}

function kbText(a) {
  return [a.title, a.content, a.summary, a.category,
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

function classify(taskMatches, invMatches, kbMatches) {
  const sources = [taskMatches.length > 0, invMatches.length > 0, kbMatches.length > 0]
    .filter(Boolean).length;
  if (sources === 3) return "FULL_IMPACT";
  if (sources === 2) return "HIGH_IMPACT";
  if (sources === 1) return "TRACKED";
  return "UNTRACKED";
}

const CLASS_COLOR = {
  FULL_IMPACT: RE,
  HIGH_IMPACT: OR,
  TRACKED:     AM,
  UNTRACKED:   DIM,
};

const CLASS_LABEL = {
  FULL_IMPACT: "FULL IMPACT",
  HIGH_IMPACT: "HIGH IMPACT",
  TRACKED:     "TRACKED",
  UNTRACKED:   "UNTRACKED",
};

// ── async script for JarvisBrain ──────────────────────────────────────────────
export async function buildAikinScript() {
  const base = apiBase();
  const [profRes, taskRes, invRes, kbRes] = await Promise.all([
    fetch(`${base}/entities/IntelProfile`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/Task`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/Investment`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/knowledge/`).then(r => r.json()).catch(() => ({})),
  ]);
  const profiles     = norm(profRes, ["intel_profiles","intelProfiles","profiles","items","data","results"]);
  const tasks        = norm(taskRes, ["tasks","items","data","results"]);
  const investments  = norm(invRes,  ["investments","items","data","results"]);
  const articles     = norm(kbRes,   ["articles","knowledge","items","data","results"]);

  let full = 0, high = 0, tracked = 0, untracked = 0;
  for (const prof of profiles) {
    const pt = profileText(prof);
    const tm = tasks.filter(t => overlap(pt, taskText(t)) > 0);
    const im = investments.filter(i => overlap(pt, investText(i)) > 0);
    const km = articles.filter(a => overlap(pt, kbText(a)) > 0);
    const cls = classify(tm, im, km);
    if (cls === "FULL_IMPACT")  full++;
    else if (cls === "HIGH_IMPACT") high++;
    else if (cls === "TRACKED")     tracked++;
    else untracked++;
  }
  const total  = profiles.length;
  const covPct = total ? Math.round(((full + high + tracked) / total) * 100) : 0;
  return `AIKIN Actor Impact Nexus online, sir. Cross-referencing ${total} threat actor profiles against ${tasks.length} tasks, ${investments.length} investments, and ${articles.length} KB articles: ${full} full-impact actors, ${high} high-impact, ${tracked} tracked, ${untracked} untracked. Actor coverage at ${covPct} percent.`;
}

// ── component ────────────────────────────────────────────────────────────────
export default function IntelActorImpactNexus() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [items,     setItems]     = useState([]);
  const [stats,     setStats]     = useState({
    total:0, full:0, high:0, tracked:0, untracked:0,
    profCount:0, taskCount:0, invCount:0, kbCount:0,
  });
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const [profRes, taskRes, invRes, kbRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/entities/Task`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/entities/Investment`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/knowledge/`).then(r => r.json()).catch(() => ({})),
      ]);
      const profiles    = norm(profRes, ["intel_profiles","intelProfiles","profiles","items","data","results"]);
      const tasks       = norm(taskRes, ["tasks","items","data","results"]);
      const investments = norm(invRes,  ["investments","items","data","results"]);
      const articles    = norm(kbRes,   ["articles","knowledge","items","data","results"]);

      const classified = profiles.map(prof => {
        const pt = profileText(prof);
        const taskMatches = tasks
          .filter(t => overlap(pt, taskText(t)) > 0)
          .map(t => ({ ...t, _rel: overlap(pt, taskText(t)) }))
          .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const invMatches = investments
          .filter(i => overlap(pt, investText(i)) > 0)
          .map(i => ({ ...i, _rel: overlap(pt, investText(i)) }))
          .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const kbMatches = articles
          .filter(a => overlap(pt, kbText(a)) > 0)
          .map(a => ({ ...a, _rel: overlap(pt, kbText(a)) }))
          .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const cls = classify(taskMatches, invMatches, kbMatches);
        return { prof, taskMatches, invMatches, kbMatches, cls };
      });

      let full = 0, high = 0, tracked = 0, untracked = 0;
      classified.forEach(({ cls }) => {
        if (cls === "FULL_IMPACT")  full++;
        else if (cls === "HIGH_IMPACT") high++;
        else if (cls === "TRACKED")     tracked++;
        else untracked++;
      });

      setItems(classified);
      setStats({
        total: classified.length, full, high, tracked, untracked,
        profCount: profiles.length, taskCount: tasks.length,
        invCount: investments.length, kbCount: articles.length,
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
    window.addEventListener("jarvis:aikin-toggle", handler);
    return () => window.removeEventListener("jarvis:aikin-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const { total, full, high, tracked, untracked } = stats;
      const prompt = `AIKIN Actor Impact Nexus: ${total} threat actor profiles cross-referenced against live tasks, investments, and KB articles. Full-impact (all three): ${full}, high-impact (two of three): ${high}, tracked (one): ${tracked}, untracked: ${untracked}. In exactly 2 sentences, assess the overall threat actor impact footprint and identify which untracked actors represent the most critical intelligence gaps requiring immediate attention.`;
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

  const TABS = ["ALL","FULL_IMPACT","HIGH_IMPACT","TRACKED","UNTRACKED"];

  const visible = items.filter(({ prof, cls }) => {
    if (tab !== "ALL" && cls !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return profileText(prof).toLowerCase().includes(s);
  });

  const { total, full, high, tracked, untracked, taskCount, invCount, kbCount } = stats;
  const covPct = total ? Math.round(((full + high + tracked) / total) * 100) : 0;

  return (
    <>
      {/* ── toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="IntelProfile × Task × Investment × Knowledge Actor Impact Nexus (AIKIN)"
        style={{
          position:"fixed", left:BTN_LEFT, bottom:8, zIndex:Z_INDEX,
          fontFamily:FONT, fontSize:10, padding:"4px 9px", cursor:"pointer",
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border:`1px solid ${CY}44`, borderRadius:5,
          boxShadow:`0 0 12px ${CY}${open?"88":"22"}`,
        }}
      >
        ◈ AIKIN
        {full > 0 && (
          <span style={{
            marginLeft:5, background:RE, color:"#fff",
            borderRadius:9, padding:"1px 5px", fontSize:9, fontWeight:700,
            animation:"aikinpulse 1.4s ease-in-out infinite",
          }}>{full}</span>
        )}
      </button>

      {/* ── panel ─────────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position:"fixed", left:20, bottom:50, zIndex:Z_INDEX+1,
          width:"min(820px,93vw)", maxHeight:"76vh", overflowY:"auto",
          background:BG, border:`1px solid ${BORDER}`,
          borderRadius:12, padding:"14px 16px",
          fontFamily:FONT, color:"#DCEBF5",
          boxShadow:`0 0 60px ${CY}18`,
        }}>
          {/* header */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
            <span style={{color:CY,fontSize:12,fontWeight:700,letterSpacing:2}}>◈ AIKIN</span>
            <span style={{color:DIM,fontSize:10,flex:1}}>
              IntelProfile × Task × Investment × Knowledge — Actor Impact Nexus
            </span>
            <button onClick={() => setOpen(false)} style={{
              background:"none",border:"none",color:DIM,cursor:"pointer",fontSize:16,lineHeight:1,padding:0
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
            {[
              ["ACTORS",      total,      CY],
              ["TASKS",       taskCount,  TE],
              ["INVESTMENTS", invCount,   AM],
              ["KB ARTICLES", kbCount,    GR],
              ["FULL IMPACT", full,       RE],
              ["HIGH IMPACT", high,       OR],
              ["TRACKED",     tracked,    AM],
              ["UNTRACKED",   untracked,  DIM],
              ["COVERAGE",    `${covPct}%`, covPct >= 70 ? GR : covPct >= 40 ? AM : RE],
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
            <div style={{height:"100%",width:`${covPct}%`,background:`linear-gradient(90deg,${RE},${OR},${AM})`,borderRadius:2,transition:"width .4s"}} />
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
              placeholder="search actors…"
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
            {assessing ? "▷ assessing…" : "▶ ASSESS IMPACT"}
          </button>
          {brief && (
            <div style={{
              fontSize:11, color:"#DCEBF5", background:"rgba(0,207,255,0.06)",
              border:`1px solid ${CY}22`, borderRadius:6, padding:"8px 12px", marginBottom:10, lineHeight:1.6,
            }}>{brief}</div>
          )}

          {/* status */}
          {loading && <div style={{color:DIM,fontSize:11,marginBottom:8}}>loading actor profiles…</div>}
          {error   && <div style={{color:RE,fontSize:11,marginBottom:8}}>{error}</div>}

          {/* actor rows */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {visible.map(({ prof, taskMatches, invMatches, kbMatches, cls }, idx) => {
              const id     = prof.id || prof._id || idx;
              const isExp  = expanded[id];
              const clsCol = CLASS_COLOR[cls];
              const clsLbl = CLASS_LABEL[cls];
              const label  = prof.name || `Actor ${idx+1}`;
              const isFullImpact = cls === "FULL_IMPACT";
              return (
                <div key={id} style={{
                  background:"rgba(0,207,255,0.04)",
                  border:`1px solid ${clsCol}${isFullImpact?"55":"22"}`,
                  borderRadius:7, padding:"8px 10px",
                  boxShadow: isFullImpact ? `0 0 14px ${RE}22` : "none",
                }}>
                  <div
                    style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}
                    onClick={() => setExpanded(e => ({...e,[id]:!e[id]}))}
                  >
                    <span style={{
                      fontSize:9, padding:"2px 6px", borderRadius:4,
                      background:`${clsCol}22`, color:clsCol, fontWeight:700,
                    }}>{clsLbl}</span>
                    <span style={{fontSize:11,flex:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                      {label}
                    </span>
                    {prof.role && (
                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${OR}22`,color:OR}}>
                        {String(prof.role).toUpperCase()}
                      </span>
                    )}
                    <span style={{fontSize:9,color:DIM}}>
                      t:{taskMatches.length} i:{invMatches.length} k:{kbMatches.length}
                    </span>
                    <span style={{color:DIM,fontSize:11}}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
                      {/* task matches */}
                      <div style={{flex:"1 1 30%",minWidth:180}}>
                        <div style={{fontSize:9,color:TE,marginBottom:4,fontWeight:700}}>TASKS ({taskMatches.length})</div>
                        {taskMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no task match</div>
                          : taskMatches.map((t,i) => {
                              const maxRel = taskMatches[0]._rel || 1;
                              const pct = Math.round((t._rel / maxRel) * 100);
                              return (
                                <div key={t.id||i} style={{
                                  background:`rgba(45,212,191,0.06)`, border:`1px solid ${TE}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span>{t.name || t.title || `Task ${i+1}`}</span>
                                    {t.status && (
                                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${TE}22`,color:TE}}>
                                        {String(t.status).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${pct}%`,background:TE,borderRadius:2}} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>

                      {/* investment matches */}
                      <div style={{flex:"1 1 30%",minWidth:180}}>
                        <div style={{fontSize:9,color:AM,marginBottom:4,fontWeight:700}}>INVESTMENTS ({invMatches.length})</div>
                        {invMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no investment match</div>
                          : invMatches.map((inv,i) => {
                              const maxRel = invMatches[0]._rel || 1;
                              const pct = Math.round((inv._rel / maxRel) * 100);
                              return (
                                <div key={inv.id||i} style={{
                                  background:`rgba(245,158,11,0.06)`, border:`1px solid ${AM}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span>{inv.name || inv.ticker || `Investment ${i+1}`}</span>
                                    {inv.type && (
                                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${AM}22`,color:AM}}>
                                        {String(inv.type).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${pct}%`,background:AM,borderRadius:2}} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>

                      {/* KB article matches */}
                      <div style={{flex:"1 1 30%",minWidth:180}}>
                        <div style={{fontSize:9,color:GR,marginBottom:4,fontWeight:700}}>KB ARTICLES ({kbMatches.length})</div>
                        {kbMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no KB match</div>
                          : kbMatches.map((a,i) => {
                              const maxRel = kbMatches[0]._rel || 1;
                              const pct = Math.round((a._rel / maxRel) * 100);
                              return (
                                <div key={a.id||i} style={{
                                  background:`rgba(34,197,94,0.06)`, border:`1px solid ${GR}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span style={{overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",maxWidth:140}}>
                                      {a.title || `Article ${i+1}`}
                                    </span>
                                    {a.category && (
                                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${GR}22`,color:GR}}>
                                        {String(a.category).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${pct}%`,background:GR,borderRadius:2}} />
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
                {items.length === 0 ? "No threat actor profiles available." : "No results match filter."}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes aikinpulse {
          0%,100% { transform:scale(1); opacity:1; }
          50%      { transform:scale(1.4); opacity:.6; }
        }
      `}</style>
    </>
  );
}
