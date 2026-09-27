/**
 * F145 — SwarmJob × AIP Skill × Contact × Dataset
 *         Operational Capacity Map (SOCDMAP)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/aip/skill +
 *   /entities/Contact + /v1/datasets
 * Keyword-correlates each swarm job against AIP skills AND contacts AND datasets:
 *   FULLY_STAFFED  — matched all three sources
 *   DUAL_STAFFED   — matched any two sources
 *   SINGLE_LINKED  — matched exactly one source
 *   UNSUPPORTED    — no matches (capacity gap)
 *
 * Stat tiles: SWARM JOBS / AIP SKILLS / CONTACTS / DATASETS +
 *             all four class counts + CAPACITY%.
 * Amber badge on unsupported count.
 * Filter tabs ALL / FULLY_STAFFED / DUAL_STAFFED / SINGLE_LINKED / UNSUPPORTED + text search.
 * Expand job → matched AIP skill cards (cyan) + contact cards (orange) +
 *              dataset cards (purple) with relevance bars.
 * ▶ ASSESS CAPACITY → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:socdmap-toggle event.
 *
 * Voice triggers: "socdmap / swarm capacity / swarm staffed /
 *                  unsupported swarm / swarm ops capacity / skill contact dataset swarm".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_024_120;
const Z_INDEX  = 207;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const SOCDMAP_RE = /\b(socdmap|swarm[\s-]capacity|swarm[\s-]staffed|unsupported[\s-]swarm|swarm[\s-]ops[\s-]capacity|skill[\s-]contact[\s-]dataset[\s-]swarm)\b/i;

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RE     = "#EF4444";
const OR     = "#F97316";
const PU     = "#A855F7";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_STAFFED: "#22C55E",
  DUAL_STAFFED:  AM,
  SINGLE_LINKED: CY,
  UNSUPPORTED:   "#4B5563",
};
const TABS = ["ALL","FULLY_STAFFED","DUAL_STAFFED","SINGLE_LINKED","UNSUPPORTED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function jobText(j)  { return `${j.name||""} ${j.description||""} ${j.type||""} ${j.status||""} ${(j.tags||[]).join(" ")}`; }
function skillText(s){ return `${s.name||s.title||""} ${s.description||""} ${s.type||""} ${(s.tags||[]).join(" ")}`; }
function contactText(c){ return `${c.name||""} ${c.role||""} ${c.org||""} ${c.email||""} ${c.description||""} ${(c.tags||[]).join(" ")}`; }
function datasetText(d){ return `${d.name||d.title||""} ${d.description||""} ${d.type||""} ${(d.tags||[]).join(" ")}`; }

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

async function loadAll() {
  const h = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [jobRes, skillRes, contactRes, datasetRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/SwarmJob`,  { headers: h }),
    fetch(`${apiBase}/v1/aip/skill`,       { headers: h }),
    fetch(`${apiBase}/entities/Contact`,   { headers: h }),
    fetch(`${apiBase}/v1/datasets`,        { headers: h }),
  ]);
  const jobs     = normaliseArray(jobRes.status==="fulfilled" && jobRes.value.ok ? await jobRes.value.json() : [], ["jobs","items"]);
  const skills   = normaliseArray(skillRes.status==="fulfilled" && skillRes.value.ok ? await skillRes.value.json() : [], ["skills","items"]);
  const contacts = normaliseArray(contactRes.status==="fulfilled" && contactRes.value.ok ? await contactRes.value.json() : [], ["contacts","items"]);
  const datasets = normaliseArray(datasetRes.status==="fulfilled" && datasetRes.value.ok ? await datasetRes.value.json() : [], ["datasets","items"]);
  return { jobs, skills, contacts, datasets };
}

function classify(job, skills, contacts, datasets) {
  const kws           = keywords(jobText(job));
  const matchedSkills = skills.filter(s => score(skillText(s), kws) > 0);
  const matchedConts  = contacts.filter(c => score(contactText(c), kws) > 0);
  const matchedData   = datasets.filter(d => score(datasetText(d), kws) > 0);
  const hits = (matchedSkills.length > 0 ? 1 : 0)
             + (matchedConts.length > 0 ? 1 : 0)
             + (matchedData.length > 0 ? 1 : 0);
  let cls;
  if (hits === 3)      cls = "FULLY_STAFFED";
  else if (hits === 2) cls = "DUAL_STAFFED";
  else if (hits === 1) cls = "SINGLE_LINKED";
  else                 cls = "UNSUPPORTED";
  return { ...job, cls, matchedSkills, matchedConts, matchedData };
}

function RelevanceBar({ score: s, max, color }) {
  const pct = max > 0 ? Math.round((s/max)*100) : 0;
  return (
    <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,marginTop:3}}>
      <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:2,transition:"width 0.3s"}} />
    </div>
  );
}

export async function buildSocdmapScript() {
  const { jobs, skills, contacts, datasets } = await loadAll();
  const rows        = jobs.map(j => classify(j, skills, contacts, datasets));
  const fullStaffed = rows.filter(r => r.cls === "FULLY_STAFFED").length;
  const unsupported = rows.filter(r => r.cls === "UNSUPPORTED").length;
  const ctx = `SwarmJobs: ${jobs.length}. AIP Skills: ${skills.length}. Contacts: ${contacts.length}. Datasets: ${datasets.length}. Fully staffed: ${fullStaffed}. Unsupported: ${unsupported}.`;
  const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
    body: JSON.stringify({ message: `Operational Capacity Map (SOCDMAP): ${ctx}. Write exactly 2 sentences assessing which swarm jobs have full staffing across skill, contact, and dataset dimensions, and what the unsupported swarm jobs mean for operational capacity.` }),
  });
  const j = await res.json().catch(() => ({}));
  return j.response || j.message || j.content
    || `SOCDMAP online, sir. ${fullStaffed} swarm jobs are fully staffed across skill, contact, and dataset dimensions — ${unsupported} remain unsupported, representing an operational capacity gap.`;
}

export function isSocdmapQuery(q) { return SOCDMAP_RE.test(q); }

export default function SwarmOpsCapacityMap() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [classified, setClassified] = useState([]);
  const [skills, setSkills]     = useState([]);
  const [contacts, setContacts] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { jobs, skills: sk, contacts: ct, datasets: ds } = await loadAll();
      setSkills(sk); setContacts(ct); setDatasets(ds);
      setClassified(jobs.map(j => classify(j, sk, ct, ds)));
    } catch (e) {
      setError(e.message || "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:socdmap-toggle", toggle);
    return () => window.removeEventListener("jarvis:socdmap-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try { setBrief(await buildSocdmapScript()); }
    catch { setBrief("SOCDMAP assessment complete, sir."); }
    finally { setAssessing(false); }
  }, []);

  const counts = {
    FULLY_STAFFED: classified.filter(r => r.cls === "FULLY_STAFFED").length,
    DUAL_STAFFED:  classified.filter(r => r.cls === "DUAL_STAFFED").length,
    SINGLE_LINKED: classified.filter(r => r.cls === "SINGLE_LINKED").length,
    UNSUPPORTED:   classified.filter(r => r.cls === "UNSUPPORTED").length,
  };
  const capPct = classified.length > 0
    ? Math.round((counts.FULLY_STAFFED + counts.DUAL_STAFFED) / classified.length * 100)
    : 0;

  const visible = classified.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!jobText(r).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position:"fixed", bottom:8, left:BTN_LEFT, zIndex:Z_INDEX,
          background:"rgba(6,11,22,0.92)", border:`1px solid ${AM}`,
          color:AM, fontFamily:FONT, fontSize:10, padding:"3px 8px",
          borderRadius:3, cursor:"pointer", letterSpacing:1,
        }}
        title="Swarm Ops Capacity Map (SOCDMAP)"
      >◈ SOCDMAP</button>
    );
  }

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:Z_INDEX+1,
      background:"rgba(0,0,0,0.82)", display:"flex",
      alignItems:"center", justifyContent:"center",
    }}>
      <div style={{
        width:"min(98vw,940px)", maxHeight:"88vh", overflowY:"auto",
        background:BG, border:`1px solid ${BORDER}`, borderRadius:8,
        padding:"20px 22px", fontFamily:FONT, color:"#E2E8F0",
      }}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:CY,letterSpacing:2}}>◈ SOCDMAP</div>
            <div style={{fontSize:10,color:"#64748B",marginTop:2}}>
              SwarmJob × AIP Skill × Contact × Dataset Operational Capacity Map
            </div>
          </div>
          <button onClick={() => setOpen(false)} style={{background:"none",border:"none",color:"#64748B",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
          {[
            ["SWARM JOBS", classified.length, CY],
            ["AIP SKILLS", skills.length, "#22C55E"],
            ["CONTACTS", contacts.length, OR],
            ["DATASETS", datasets.length, PU],
            ["FULLY STFD", counts.FULLY_STAFFED, CLASS_COLOR.FULLY_STAFFED],
            ["DUAL STFD", counts.DUAL_STAFFED, AM],
            ["SINGLE LNK", counts.SINGLE_LINKED, CY],
            ["UNSUPPORTED", counts.UNSUPPORTED, "#EF4444"],
            ["CAPACITY%", `${capPct}%`, capPct >= 70 ? "#22C55E" : capPct >= 40 ? AM : RE],
          ].map(([label, val, col]) => (
            <div key={label} style={{
              background:"rgba(255,255,255,0.03)", border:`1px solid ${BORDER}`,
              borderRadius:4, padding:"5px 10px", minWidth:80, textAlign:"center",
            }}>
              <div style={{fontSize:8,color:"#64748B",letterSpacing:1}}>{label}</div>
              <div style={{fontSize:14,fontWeight:700,color:col}}>{val}</div>
            </div>
          ))}
          {counts.UNSUPPORTED > 0 && (
            <div style={{
              background:"rgba(245,158,11,0.08)", border:`1px solid ${AM}`,
              borderRadius:4, padding:"5px 10px", textAlign:"center",
            }}>
              <div style={{fontSize:8,color:AM,letterSpacing:1}}>UNSUPPORTED</div>
              <div style={{fontSize:14,fontWeight:700,color:AM}}>{counts.UNSUPPORTED}</div>
            </div>
          )}
        </div>

        {/* Coverage bar */}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#64748B",marginBottom:3}}>
            <span>CAPACITY COVERAGE</span>
            <span style={{color: capPct>=70?"#22C55E":capPct>=40?AM:RE}}>{capPct}%</span>
          </div>
          <div style={{height:4,background:"rgba(255,255,255,0.06)",borderRadius:2}}>
            <div style={{
              height:"100%",
              width:`${capPct}%`,
              background: capPct>=70?"#22C55E":capPct>=40?AM:RE,
              borderRadius:2, transition:"width 0.4s",
            }} />
          </div>
        </div>

        {/* Filters */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab===t ? "rgba(0,207,255,0.12)" : "transparent",
              border: `1px solid ${tab===t?CY:BORDER}`,
              color: tab===t?CY:"#64748B", fontFamily:FONT,
              fontSize:9, padding:"3px 8px", borderRadius:3, cursor:"pointer",
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search jobs…"
            style={{
              background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}`,
              color:"#E2E8F0", fontFamily:FONT, fontSize:10, padding:"3px 8px",
              borderRadius:3, outline:"none", width:130,
            }}
          />
        </div>

        {/* Assess button */}
        <button onClick={assess} disabled={assessing} style={{
          background:"rgba(0,207,255,0.08)", border:`1px solid ${CY}`,
          color:CY, fontFamily:FONT, fontSize:10, padding:"4px 14px",
          borderRadius:3, cursor:"pointer", marginBottom:14,
        }}>
          {assessing ? "◌ ASSESSING…" : "▶ ASSESS CAPACITY"}
        </button>
        {brief && (
          <div style={{
            background:"rgba(0,207,255,0.06)", border:`1px solid ${BORDER}`,
            borderRadius:4, padding:"8px 12px", fontSize:11, color:"#CBD5E1",
            lineHeight:1.6, marginBottom:14,
          }}>{brief}</div>
        )}

        {loading && <div style={{color:"#64748B",fontSize:11,marginBottom:10}}>◌ loading…</div>}
        {error && <div style={{color:RE,fontSize:11,marginBottom:10}}>⚠ {error}</div>}

        {/* Rows */}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {visible.map((row, i) => {
            const isExp = expanded === i;
            const col = CLASS_COLOR[row.cls];
            const maxSkillScore = Math.max(1, ...row.matchedSkills.map(s => score(skillText(s), keywords(jobText(row)))));
            const maxContScore  = Math.max(1, ...row.matchedConts.map(c => score(contactText(c), keywords(jobText(row)))));
            const maxDataScore  = Math.max(1, ...row.matchedData.map(d => score(datasetText(d), keywords(jobText(row)))));
            return (
              <div key={i} style={{
                background:"rgba(255,255,255,0.02)", border:`1px solid ${col}22`,
                borderRadius:4, padding:"8px 10px",
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}
                >
                  <div style={{
                    fontSize:9, padding:"1px 6px", borderRadius:2,
                    background:`${col}22`, color:col, fontWeight:700, minWidth:82, textAlign:"center",
                  }}>{row.cls}</div>
                  <div style={{flex:1,fontSize:11,color:"#CBD5E1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {row.name || row.id || "—"}
                  </div>
                  {row.type && (
                    <div style={{fontSize:9,color:"#64748B",padding:"1px 6px",border:`1px solid ${BORDER}`,borderRadius:2}}>{row.type}</div>
                  )}
                  <div style={{fontSize:10,color:"#64748B"}}>{isExp?"▲":"▼"}</div>
                </div>

                {isExp && (
                  <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                    {/* Matched AIP Skills */}
                    {row.matchedSkills.length > 0 && (
                      <div>
                        <div style={{fontSize:9,color:CY,letterSpacing:1,marginBottom:4}}>AIP SKILLS ({row.matchedSkills.length})</div>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {row.matchedSkills.slice(0,5).map((s, si) => {
                            const sc = score(skillText(s), keywords(jobText(row)));
                            return (
                              <div key={si} style={{background:"rgba(0,207,255,0.05)",border:`1px solid ${CY}22`,borderRadius:3,padding:"4px 8px"}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                  <div style={{fontSize:10,color:"#CBD5E1"}}>{s.name||s.title||"—"}</div>
                                  {s.type&&<div style={{fontSize:8,color:CY,padding:"1px 4px",border:`1px solid ${CY}44`,borderRadius:2}}>{s.type}</div>}
                                </div>
                                <RelevanceBar score={sc} max={maxSkillScore} color={CY} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Matched Contacts */}
                    {row.matchedConts.length > 0 && (
                      <div>
                        <div style={{fontSize:9,color:OR,letterSpacing:1,marginBottom:4}}>CONTACTS ({row.matchedConts.length})</div>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {row.matchedConts.slice(0,5).map((c, ci) => {
                            const sc = score(contactText(c), keywords(jobText(row)));
                            return (
                              <div key={ci} style={{background:`rgba(249,115,22,0.05)`,border:`1px solid ${OR}22`,borderRadius:3,padding:"4px 8px"}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                  <div style={{fontSize:10,color:"#CBD5E1"}}>{c.name||"—"}</div>
                                  {c.role&&<div style={{fontSize:8,color:OR,padding:"1px 4px",border:`1px solid ${OR}44`,borderRadius:2}}>{c.role}</div>}
                                </div>
                                <RelevanceBar score={sc} max={maxContScore} color={OR} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Matched Datasets */}
                    {row.matchedData.length > 0 && (
                      <div>
                        <div style={{fontSize:9,color:PU,letterSpacing:1,marginBottom:4}}>DATASETS ({row.matchedData.length})</div>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {row.matchedData.slice(0,5).map((d, di) => {
                            const sc = score(datasetText(d), keywords(jobText(row)));
                            return (
                              <div key={di} style={{background:`rgba(168,85,247,0.05)`,border:`1px solid ${PU}22`,borderRadius:3,padding:"4px 8px"}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                  <div style={{fontSize:10,color:"#CBD5E1"}}>{d.name||d.title||"—"}</div>
                                  {d.type&&<div style={{fontSize:8,color:PU,padding:"1px 4px",border:`1px solid ${PU}44`,borderRadius:2}}>{d.type}</div>}
                                </div>
                                <RelevanceBar score={sc} max={maxDataScore} color={PU} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {row.matchedSkills.length === 0 && row.matchedConts.length === 0 && row.matchedData.length === 0 && (
                      <div style={{fontSize:10,color:"#4B5563"}}>No capacity matches found across skill, contact, or dataset dimensions.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{fontSize:11,color:"#64748B",textAlign:"center",padding:"20px 0"}}>
              No swarm jobs match the current filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
