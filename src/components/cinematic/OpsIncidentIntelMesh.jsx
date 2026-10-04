/**
 * F128 — Ops Event × Graph Centrality × Knowledge × Contact
 *         Incident Intelligence Mesh (OINCM)
 *
 * Parallel-fetches:
 *   /v1/ops/events         → live operational events
 *   /v1/graph/centrality   → high-influence graph nodes
 *   /knowledge/            → knowledge-base articles
 *   /entities/Contact      → known contacts
 *
 * Keyword-correlates each ops event against graph nodes, KB articles,
 * AND contacts to classify:
 *   FULLY_MESHED — all three sources match (max intelligence coverage)
 *   INTEL_LINKED — any two of the three sources match
 *   PARTIAL      — exactly one source matches
 *   ISOLATED     — no matches (intelligence gap)
 *
 * Amber badge on isolated count.
 * ▶ ASSESS MESH → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:oincm-toggle event.
 * Voice: "oincm / ops incident mesh / incident intelligence /
 *         isolated events / event intelligence coverage / ops knowledge mesh".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_014_600;
const Z_INDEX  = 190;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const OINCM_RE =
  /\b(oincm|ops[\s-]incident[\s-]mesh|incident[\s-]intelligence|isolated[\s-]events?|event[\s-]intelligence[\s-]coverage|ops[\s-]knowledge[\s-]mesh)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const RE     = "#EF4444";
const AM     = "#F59E0B";
const OR     = "#F97316";
const GR     = "#22C55E";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isOincmQuery(text) {
  return OINCM_RE.test(text || "");
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

function eventText(e) {
  return [
    e.title, e.name, e.description, e.type, e.category,
    e.location, e.region, e.source,
    ...(Array.isArray(e.tags) ? e.tags : []),
  ].filter(Boolean).join(" ");
}

function nodeText(n) {
  return [
    n.id, n.name, n.label, n.type, n.description,
    ...(Array.isArray(n.tags) ? n.tags : []),
  ].filter(Boolean).join(" ");
}

function kbText(a) {
  return [
    a.title, a.content, a.summary, a.category,
    ...(Array.isArray(a.tags) ? a.tags : []),
  ].filter(Boolean).join(" ");
}

function contactText(c) {
  return [
    c.name, c.role, c.org, c.organisation, c.email,
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

function classify(nodeMatches, kbMatches, contactMatches) {
  const sources = [
    nodeMatches.length > 0,
    kbMatches.length > 0,
    contactMatches.length > 0,
  ].filter(Boolean).length;
  if (sources === 3) return "FULLY_MESHED";
  if (sources === 2) return "INTEL_LINKED";
  if (sources === 1) return "PARTIAL";
  return "ISOLATED";
}

const CLASS_COLOR = {
  FULLY_MESHED: CY,
  INTEL_LINKED: GR,
  PARTIAL:      AM,
  ISOLATED:     DIM,
};

const CLASS_LABEL = {
  FULLY_MESHED: "FULLY MESHED",
  INTEL_LINKED: "INTEL LINKED",
  PARTIAL:      "PARTIAL",
  ISOLATED:     "ISOLATED",
};

// ── async script for JarvisBrain ──────────────────────────────────────────────
export async function buildOincmScript() {
  const base = apiBase();
  const [evRes, ndRes, kbRes, ctRes] = await Promise.all([
    fetch(`${base}/v1/ops/events`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/v1/graph/centrality`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/knowledge/`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/Contact`).then(r => r.json()).catch(() => ({})),
  ]);
  const events   = norm(evRes, ["events","ops_events","items","data","results"]);
  const nodes    = norm(ndRes, ["nodes","centrality","items","data","results"]);
  const articles = norm(kbRes, ["articles","knowledge","items","data","results"]);
  const contacts = norm(ctRes, ["contacts","items","data","results"]);

  let meshed = 0, linked = 0, partial = 0, isolated = 0;
  for (const ev of events) {
    const et = eventText(ev);
    const nm = nodes.filter(n => overlap(et, nodeText(n)) > 0);
    const km = articles.filter(a => overlap(et, kbText(a)) > 0);
    const cm = contacts.filter(c => overlap(et, contactText(c)) > 0);
    const cls = classify(nm, km, cm);
    if (cls === "FULLY_MESHED")  meshed++;
    else if (cls === "INTEL_LINKED") linked++;
    else if (cls === "PARTIAL")      partial++;
    else isolated++;
  }
  const total  = events.length;
  const covPct = total ? Math.round(((meshed + linked + partial) / total) * 100) : 0;
  return `OINCM Incident Intelligence Mesh online, sir. Cross-referencing ${total} ops events against ${nodes.length} graph centrality nodes, ${articles.length} KB articles, and ${contacts.length} contacts: ${meshed} fully-meshed, ${linked} intel-linked, ${partial} partial, ${isolated} isolated. Event intelligence coverage at ${covPct} percent.`;
}

// ── component ────────────────────────────────────────────────────────────────
export default function OpsIncidentIntelMesh() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [items,     setItems]     = useState([]);
  const [stats,     setStats]     = useState({
    total:0, meshed:0, linked:0, partial:0, isolated:0,
    evCount:0, nodeCount:0, kbCount:0, contactCount:0,
  });
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const [evRes, ndRes, kbRes, ctRes] = await Promise.all([
        fetch(`${base}/v1/ops/events`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/v1/graph/centrality`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/knowledge/`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/entities/Contact`).then(r => r.json()).catch(() => ({})),
      ]);
      const events   = norm(evRes, ["events","ops_events","items","data","results"]);
      const nodes    = norm(ndRes, ["nodes","centrality","items","data","results"]);
      const articles = norm(kbRes, ["articles","knowledge","items","data","results"]);
      const contacts = norm(ctRes, ["contacts","items","data","results"]);

      const classified = events.map(ev => {
        const et = eventText(ev);
        const nodeMatches = nodes
          .filter(n => overlap(et, nodeText(n)) > 0)
          .map(n => ({ ...n, _rel: overlap(et, nodeText(n)) }))
          .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const kbMatches = articles
          .filter(a => overlap(et, kbText(a)) > 0)
          .map(a => ({ ...a, _rel: overlap(et, kbText(a)) }))
          .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const contactMatches = contacts
          .filter(c => overlap(et, contactText(c)) > 0)
          .map(c => ({ ...c, _rel: overlap(et, contactText(c)) }))
          .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const cls = classify(nodeMatches, kbMatches, contactMatches);
        return { ev, nodeMatches, kbMatches, contactMatches, cls };
      });

      let meshed = 0, linked = 0, partial = 0, isolated = 0;
      classified.forEach(({ cls }) => {
        if (cls === "FULLY_MESHED")  meshed++;
        else if (cls === "INTEL_LINKED") linked++;
        else if (cls === "PARTIAL")      partial++;
        else isolated++;
      });

      setItems(classified);
      setStats({
        total: classified.length, meshed, linked, partial, isolated,
        evCount: events.length, nodeCount: nodes.length,
        kbCount: articles.length, contactCount: contacts.length,
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
    window.addEventListener("jarvis:oincm-toggle", handler);
    return () => window.removeEventListener("jarvis:oincm-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const { total, meshed, linked, partial, isolated } = stats;
      const prompt = `OINCM Incident Intelligence Mesh: ${total} ops events cross-referenced against graph centrality nodes, KB articles, and contacts. Fully-meshed (all three): ${meshed}, intel-linked (two): ${linked}, partial (one): ${partial}, isolated (none): ${isolated}. In exactly 2 sentences, assess the overall incident intelligence coverage and identify which isolated events represent the most critical blind spots requiring immediate intelligence enrichment.`;
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

  const TABS = ["ALL","FULLY_MESHED","INTEL_LINKED","PARTIAL","ISOLATED"];

  const visible = items.filter(({ ev, cls }) => {
    if (tab !== "ALL" && cls !== tab) return false;
    if (!search) return true;
    return eventText(ev).toLowerCase().includes(search.toLowerCase());
  });

  const { total, meshed, linked, partial, isolated, nodeCount, kbCount, contactCount } = stats;
  const covPct = total ? Math.round(((meshed + linked + partial) / total) * 100) : 0;

  return (
    <>
      {/* ── toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Ops Event × Graph Centrality × Knowledge × Contact Incident Intelligence Mesh (OINCM)"
        style={{
          position:"fixed", left:BTN_LEFT, bottom:8, zIndex:Z_INDEX,
          fontFamily:FONT, fontSize:10, padding:"4px 9px", cursor:"pointer",
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border:`1px solid ${CY}44`, borderRadius:5,
          boxShadow:`0 0 12px ${CY}${open?"88":"22"}`,
        }}
      >
        ◈ OINCM
        {isolated > 0 && (
          <span style={{
            marginLeft:5, background:AM, color:"#04060A",
            borderRadius:9, padding:"1px 5px", fontSize:9, fontWeight:700,
          }}>{isolated}</span>
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
            <span style={{color:CY,fontSize:12,fontWeight:700,letterSpacing:2}}>◈ OINCM</span>
            <span style={{color:DIM,fontSize:10,flex:1}}>
              Ops Event × Graph Centrality × Knowledge × Contact — Incident Intelligence Mesh
            </span>
            <button onClick={() => setOpen(false)} style={{
              background:"none",border:"none",color:DIM,cursor:"pointer",fontSize:16,lineHeight:1,padding:0
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
            {[
              ["OPS EVENTS",     total,        CY],
              ["GRAPH NODES",    nodeCount,    CY],
              ["KB ARTICLES",    kbCount,      GR],
              ["CONTACTS",       contactCount, OR],
              ["FULLY MESHED",   meshed,       CY],
              ["INTEL LINKED",   linked,       GR],
              ["PARTIAL",        partial,      AM],
              ["ISOLATED",       isolated,     DIM],
              ["COVERAGE",       `${covPct}%`, covPct >= 70 ? GR : covPct >= 40 ? AM : RE],
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
            <div style={{
              height:"100%", width:`${covPct}%`,
              background:`linear-gradient(90deg,${CY},${GR},${AM})`,
              borderRadius:2, transition:"width .4s",
            }} />
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
              placeholder="search events…"
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
            {assessing ? "▷ assessing…" : "▶ ASSESS MESH"}
          </button>
          {brief && (
            <div style={{
              fontSize:11, color:"#DCEBF5", background:"rgba(0,207,255,0.06)",
              border:`1px solid ${CY}22`, borderRadius:6, padding:"8px 12px", marginBottom:10, lineHeight:1.6,
            }}>{brief}</div>
          )}

          {/* status */}
          {loading && <div style={{color:DIM,fontSize:11,marginBottom:8}}>loading incident data…</div>}
          {error   && <div style={{color:RE,fontSize:11,marginBottom:8}}>{error}</div>}

          {/* event rows */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {visible.map(({ ev, nodeMatches, kbMatches, contactMatches, cls }, idx) => {
              const id    = ev.id || ev._id || idx;
              const isExp = expanded[id];
              const clsCol = CLASS_COLOR[cls];
              const clsLbl = CLASS_LABEL[cls];
              const label  = ev.title || ev.name || `Event ${idx+1}`;
              return (
                <div key={id} style={{
                  background:"rgba(0,207,255,0.04)",
                  border:`1px solid ${clsCol}${cls==="FULLY_MESHED"?"55":"22"}`,
                  borderRadius:7, padding:"8px 10px",
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
                    {ev.type && (
                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${CY}22`,color:CY}}>
                        {String(ev.type).toUpperCase()}
                      </span>
                    )}
                    <span style={{fontSize:9,color:DIM}}>
                      n:{nodeMatches.length} k:{kbMatches.length} c:{contactMatches.length}
                    </span>
                    <span style={{color:DIM,fontSize:11}}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
                      {/* graph node matches */}
                      <div style={{flex:"1 1 30%",minWidth:180}}>
                        <div style={{fontSize:9,color:CY,marginBottom:4,fontWeight:700}}>GRAPH NODES ({nodeMatches.length})</div>
                        {nodeMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no node match</div>
                          : nodeMatches.map((n,i) => {
                              const maxRel = nodeMatches[0]._rel || 1;
                              const pct = Math.round((n._rel / maxRel) * 100);
                              return (
                                <div key={n.id||i} style={{
                                  background:"rgba(0,207,255,0.06)", border:`1px solid ${CY}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span style={{overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",maxWidth:130}}>
                                      {n.name || n.id || n.label || `Node ${i+1}`}
                                    </span>
                                    {(n.centrality_score !== undefined) && (
                                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${CY}22`,color:CY}}>
                                        {Number(n.centrality_score).toFixed(2)}
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
                                  background:"rgba(34,197,94,0.06)", border:`1px solid ${GR}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span style={{overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",maxWidth:130}}>
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

                      {/* contact matches */}
                      <div style={{flex:"1 1 30%",minWidth:180}}>
                        <div style={{fontSize:9,color:OR,marginBottom:4,fontWeight:700}}>CONTACTS ({contactMatches.length})</div>
                        {contactMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no contact match</div>
                          : contactMatches.map((c,i) => {
                              const maxRel = contactMatches[0]._rel || 1;
                              const pct = Math.round((c._rel / maxRel) * 100);
                              return (
                                <div key={c.id||i} style={{
                                  background:"rgba(249,115,22,0.06)", border:`1px solid ${OR}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span style={{overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",maxWidth:130}}>
                                      {c.name || `Contact ${i+1}`}
                                    </span>
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
                {items.length === 0 ? "No ops events available." : "No results match filter."}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
