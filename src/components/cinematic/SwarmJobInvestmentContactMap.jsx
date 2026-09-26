/**
 * F126 — SwarmJob × Investment × Contact Operational Finance Coverage (SVINMAP)
 *
 * Parallel-fetches:
 *   /entities/SwarmJob    → live automation jobs
 *   /entities/Investment  → portfolio assets
 *   /entities/Contact     → key personnel
 *
 * Keyword-correlates each swarm job against investments AND contacts to classify:
 *   FULLY_COORDINATED — matched both an investment AND a contact
 *   INVESTMENT_LINKED  — matched investment only
 *   CONTACT_ASSIGNED   — matched contact only
 *   UNCOORDINATED      — no matches (operational gap)
 *
 * Amber badge on UNCOORDINATED count.
 * ▶ ASSESS COORDINATION → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:svinmap-toggle event.
 * Voice: "svinmap / swarm investment / swarm finance / coordinated swarm /
 *         uncoordinated swarm / swarm investment coverage".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_013_480;
const Z_INDEX  = 188;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const SVINMAP_RE =
  /\b(svinmap|swarm[\s-]investment|swarm[\s-]finance|coordinated[\s-]swarm|uncoordinated[\s-]swarm|swarm[\s-]investment[\s-]coverage)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const GO     = "#F59E0B";
const OR     = "#F97316";
const AM     = "#F59E0B";
const GR     = "#22C55E";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isSvimapQuery(text) {
  return SVINMAP_RE.test(text || "");
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
  return [j.name, j.description, j.type, j.status, j.target,
          ...(Array.isArray(j.tags) ? j.tags : []),
  ].filter(Boolean).join(" ");
}

function investText(i) {
  return [i.name, i.type, i.sector, i.description, i.ticker, i.asset_class,
          ...(Array.isArray(i.tags) ? i.tags : []),
  ].filter(Boolean).join(" ");
}

function contactText(c) {
  return [c.name, c.role, c.org, c.organisation, c.email, c.department,
          ...(Array.isArray(c.tags) ? c.tags : []),
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

function classify(invMatches, conMatches) {
  const hasInv = invMatches.length > 0;
  const hasCon = conMatches.length > 0;
  if (hasInv && hasCon) return "FULLY_COORDINATED";
  if (hasInv)           return "INVESTMENT_LINKED";
  if (hasCon)           return "CONTACT_ASSIGNED";
  return "UNCOORDINATED";
}

const CLASS_COLOR = {
  FULLY_COORDINATED: GR,
  INVESTMENT_LINKED: GO,
  CONTACT_ASSIGNED:  OR,
  UNCOORDINATED:     AM,
};

const CLASS_LABEL = {
  FULLY_COORDINATED: "FULLY COORDINATED",
  INVESTMENT_LINKED: "INVESTMENT LINKED",
  CONTACT_ASSIGNED:  "CONTACT ASSIGNED",
  UNCOORDINATED:     "UNCOORDINATED",
};

// ── async script for JarvisBrain ──────────────────────────────────────────────
export async function buildSvimapScript() {
  const base = apiBase();
  const [jobRes, invRes, conRes] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/Investment`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/Contact`).then(r => r.json()).catch(() => ({})),
  ]);
  const jobs        = norm(jobRes, ["swarm_jobs","swarmJobs","jobs","items","data","results"]);
  const investments = norm(invRes, ["investments","items","data","results"]);
  const contacts    = norm(conRes, ["contacts","items","data","results"]);

  let fully = 0, invOnly = 0, conOnly = 0, uncoordinated = 0;
  for (const job of jobs) {
    const jt = jobText(job);
    const im = investments.filter(i => overlap(jt, investText(i)) > 0);
    const cm = contacts.filter(c => overlap(jt, contactText(c)) > 0);
    const cls = classify(im, cm);
    if (cls === "FULLY_COORDINATED")  fully++;
    else if (cls === "INVESTMENT_LINKED") invOnly++;
    else if (cls === "CONTACT_ASSIGNED")  conOnly++;
    else uncoordinated++;
  }
  const total  = jobs.length;
  const covPct = total ? Math.round(((fully + invOnly + conOnly) / total) * 100) : 0;
  return `SVINMAP Operational Finance Coverage online, sir. Cross-referencing ${total} swarm jobs against ${investments.length} investments and ${contacts.length} contacts: ${fully} fully coordinated, ${invOnly} investment-linked, ${conOnly} contact-assigned, ${uncoordinated} uncoordinated. Coordination coverage at ${covPct} percent.`;
}

// ── component ────────────────────────────────────────────────────────────────
export default function SwarmJobInvestmentContactMap() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [items,     setItems]     = useState([]);
  const [stats,     setStats]     = useState({
    total:0, fully:0, invOnly:0, conOnly:0, uncoordinated:0,
    jobCount:0, invCount:0, conCount:0,
  });
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const [jobRes, invRes, conRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/entities/Investment`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/entities/Contact`).then(r => r.json()).catch(() => ({})),
      ]);
      const jobs        = norm(jobRes, ["swarm_jobs","swarmJobs","jobs","items","data","results"]);
      const investments = norm(invRes, ["investments","items","data","results"]);
      const contacts    = norm(conRes, ["contacts","items","data","results"]);

      const classified = jobs.map(job => {
        const jt = jobText(job);
        const invMatches = investments
          .filter(i => overlap(jt, investText(i)) > 0)
          .map(i => ({ ...i, _rel: overlap(jt, investText(i)) }))
          .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const conMatches = contacts
          .filter(c => overlap(jt, contactText(c)) > 0)
          .map(c => ({ ...c, _rel: overlap(jt, contactText(c)) }))
          .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const cls = classify(invMatches, conMatches);
        return { job, invMatches, conMatches, cls };
      });

      let fully = 0, invOnly = 0, conOnly = 0, uncoordinated = 0;
      classified.forEach(({ cls }) => {
        if (cls === "FULLY_COORDINATED")   fully++;
        else if (cls === "INVESTMENT_LINKED") invOnly++;
        else if (cls === "CONTACT_ASSIGNED")  conOnly++;
        else uncoordinated++;
      });

      setItems(classified);
      setStats({
        total: classified.length, fully, invOnly, conOnly, uncoordinated,
        jobCount: jobs.length, invCount: investments.length, conCount: contacts.length,
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
    window.addEventListener("jarvis:svinmap-toggle", handler);
    return () => window.removeEventListener("jarvis:svinmap-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const { total, fully, invOnly, conOnly, uncoordinated } = stats;
      const prompt = `SVINMAP analysis: ${total} swarm jobs cross-referenced against live investments and contacts. Fully coordinated: ${fully}, investment-linked: ${invOnly}, contact-assigned: ${conOnly}, uncoordinated: ${uncoordinated}. In exactly 2 sentences, assess the operational finance coordination of these swarm jobs and recommend which uncoordinated jobs need immediate investment or contact assignment.`;
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

  const TABS = ["ALL","FULLY_COORDINATED","INVESTMENT_LINKED","CONTACT_ASSIGNED","UNCOORDINATED"];

  const visible = items.filter(({ job, cls }) => {
    if (tab !== "ALL" && cls !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return jobText(job).toLowerCase().includes(s);
  });

  const { total, fully, invOnly, conOnly, uncoordinated, invCount, conCount } = stats;
  const covPct = total ? Math.round(((fully + invOnly + conOnly) / total) * 100) : 0;

  return (
    <>
      {/* ── toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="SwarmJob × Investment × Contact Operational Finance Coverage (SVINMAP)"
        style={{
          position:"fixed", left:BTN_LEFT, bottom:8, zIndex:Z_INDEX,
          fontFamily:FONT, fontSize:10, padding:"4px 9px", cursor:"pointer",
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border:`1px solid ${CY}44`, borderRadius:5,
          boxShadow:`0 0 12px ${CY}${open?"88":"22"}`,
        }}
      >
        ◈ SVINMAP
        {uncoordinated > 0 && (
          <span style={{
            marginLeft:5, background:AM, color:"#000",
            borderRadius:9, padding:"1px 5px", fontSize:9, fontWeight:700,
          }}>{uncoordinated}</span>
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
            <span style={{color:CY,fontSize:12,fontWeight:700,letterSpacing:2}}>◈ SVINMAP</span>
            <span style={{color:DIM,fontSize:10,flex:1}}>
              SwarmJob × Investment × Contact Operational Finance Coverage
            </span>
            <button onClick={() => setOpen(false)} style={{
              background:"none",border:"none",color:DIM,cursor:"pointer",fontSize:16,lineHeight:1,padding:0
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
            {[
              ["SWARM JOBS",   total,          CY],
              ["INVESTMENTS",  invCount,        GO],
              ["CONTACTS",     conCount,        OR],
              ["FULLY COORD.", fully,           GR],
              ["INV. LINKED",  invOnly,         GO],
              ["CONTACT ASGD", conOnly,         OR],
              ["UNCOORD.",     uncoordinated,   AM],
              ["COVERAGE",     `${covPct}%`,    covPct >= 70 ? GR : covPct >= 40 ? AM : "#EF4444"],
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
              placeholder="search jobs…"
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
            {assessing ? "▷ assessing…" : "▶ ASSESS COORDINATION"}
          </button>
          {brief && (
            <div style={{
              fontSize:11, color:"#DCEBF5", background:"rgba(0,207,255,0.06)",
              border:`1px solid ${CY}22`, borderRadius:6, padding:"8px 12px", marginBottom:10, lineHeight:1.6,
            }}>{brief}</div>
          )}

          {/* status */}
          {loading && <div style={{color:DIM,fontSize:11,marginBottom:8}}>loading swarm jobs…</div>}
          {error   && <div style={{color:"#EF4444",fontSize:11,marginBottom:8}}>{error}</div>}

          {/* job rows */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {visible.map(({ job, invMatches, conMatches, cls }, idx) => {
              const id = job.id || job._id || idx;
              const isExp = expanded[id];
              const clsColor = CLASS_COLOR[cls];
              const clsLabel = CLASS_LABEL[cls];
              const label = job.name || job.title || `SwarmJob ${idx+1}`;
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
                    {job.status && (
                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${CY}22`,color:CY}}>
                        {String(job.status).toUpperCase()}
                      </span>
                    )}
                    <span style={{fontSize:9,color:DIM}}>
                      inv:{invMatches.length} con:{conMatches.length}
                    </span>
                    <span style={{color:DIM,fontSize:11}}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
                      {/* investment matches */}
                      <div style={{flex:"1 1 45%",minWidth:200}}>
                        <div style={{fontSize:9,color:GO,marginBottom:4,fontWeight:700}}>INVESTMENTS ({invMatches.length})</div>
                        {invMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no investment match</div>
                          : invMatches.map((inv,i) => {
                              const maxRel = invMatches[0]._rel || 1;
                              const pct = Math.round((inv._rel / maxRel) * 100);
                              return (
                                <div key={inv.id||i} style={{
                                  background:`rgba(245,158,11,0.06)`, border:`1px solid ${GO}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span>{inv.name || inv.ticker || `Investment ${i+1}`}</span>
                                    {inv.type && (
                                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${GO}22`,color:GO}}>
                                        {String(inv.type).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${pct}%`,background:GO,borderRadius:2}} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>
                      {/* contact matches */}
                      <div style={{flex:"1 1 45%",minWidth:200}}>
                        <div style={{fontSize:9,color:OR,marginBottom:4,fontWeight:700}}>CONTACTS ({conMatches.length})</div>
                        {conMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no contact match</div>
                          : conMatches.map((c,i) => {
                              const maxRel = conMatches[0]._rel || 1;
                              const pct = Math.round((c._rel / maxRel) * 100);
                              return (
                                <div key={c.id||i} style={{
                                  background:`rgba(249,115,22,0.06)`, border:`1px solid ${OR}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span>{c.name || `Contact ${i+1}`}</span>
                                    {c.role && (
                                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${OR}22`,color:OR}}>
                                        {String(c.role).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${pct}%`,background:OR,borderRadius:2}} />
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
                {items.length === 0 ? "No swarm job data available." : "No results match filter."}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
