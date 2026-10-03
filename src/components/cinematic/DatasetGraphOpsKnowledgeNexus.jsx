/**
 * F129 — Dataset × Graph Annotation × Ops Event × Knowledge
 *         Intelligence Grounding Nexus (DGOKGND)
 *
 * Parallel-fetches:
 *   /v1/datasets            → JARVIS data sources
 *   /v1/graph/annotations   → graph annotation layer
 *   /v1/ops/events          → live operational events
 *   /knowledge/             → knowledge-base articles
 *
 * Keyword-correlates each dataset against graph annotations,
 * ops events, AND KB articles to classify:
 *   FULLY_GROUNDED — all three sources match (max intelligence grounding)
 *   DUAL_LINKED    — any two of the three sources match
 *   SINGLE_LINKED  — exactly one source matches
 *   UNGROUNDED     — no matches (grounding gap)
 *
 * Amber badge on ungrounded count.
 * ▶ ASSESS GROUNDING → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:dgokgnd-toggle event.
 * Voice: "dgokgnd / dataset grounding nexus / grounded dataset /
 *         ungrounded dataset / dataset annotation / dataset ops knowledge".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_015_160;
const Z_INDEX  = 191;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const DGOKGND_RE =
  /\b(dgokgnd|dataset[\s-]grounding[\s-]nexus|grounded[\s-]datasets?|ungrounded[\s-]datasets?|dataset[\s-]annotation|dataset[\s-]ops[\s-]knowledge)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const RE     = "#EF4444";
const AM     = "#F59E0B";
const OR     = "#F97316";
const GR     = "#22C55E";
const PU     = "#A855F7";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isDgokgndQuery(text) {
  return DGOKGND_RE.test(text || "");
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

function datasetText(d) {
  return [
    d.name, d.title, d.description, d.type, d.category, d.source,
    ...(Array.isArray(d.tags) ? d.tags : []),
  ].filter(Boolean).join(" ");
}

function annotationText(a) {
  return [
    a.id, a.name, a.label, a.text, a.content, a.type, a.description,
    a.entity_id, a.entity_name,
    ...(Array.isArray(a.tags) ? a.tags : []),
  ].filter(Boolean).join(" ");
}

function eventText(e) {
  return [
    e.title, e.name, e.description, e.type, e.category,
    e.location, e.region, e.source,
    ...(Array.isArray(e.tags) ? e.tags : []),
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

function classify(annMatches, evMatches, kbMatches) {
  const sources = [
    annMatches.length > 0,
    evMatches.length > 0,
    kbMatches.length > 0,
  ].filter(Boolean).length;
  if (sources === 3) return "FULLY_GROUNDED";
  if (sources === 2) return "DUAL_LINKED";
  if (sources === 1) return "SINGLE_LINKED";
  return "UNGROUNDED";
}

const CLASS_COLOR = {
  FULLY_GROUNDED: CY,
  DUAL_LINKED:    GR,
  SINGLE_LINKED:  AM,
  UNGROUNDED:     DIM,
};

const CLASS_LABEL = {
  FULLY_GROUNDED: "FULLY GROUNDED",
  DUAL_LINKED:    "DUAL LINKED",
  SINGLE_LINKED:  "SINGLE LINKED",
  UNGROUNDED:     "UNGROUNDED",
};

// ── async script for JarvisBrain ──────────────────────────────────────────────
export async function buildDgokgndScript() {
  const base = apiBase();
  const [dsRes, anRes, evRes, kbRes] = await Promise.all([
    fetch(`${base}/v1/datasets`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/v1/graph/annotations`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/v1/ops/events`).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/knowledge/`).then(r => r.json()).catch(() => ({})),
  ]);
  const datasets     = norm(dsRes, ["datasets","items","data","results"]);
  const annotations  = norm(anRes, ["annotations","items","data","results"]);
  const events       = norm(evRes, ["events","ops_events","items","data","results"]);
  const articles     = norm(kbRes, ["articles","knowledge","items","data","results"]);

  let grounded = 0, dual = 0, single = 0, ungrounded = 0;
  for (const ds of datasets) {
    const dt = datasetText(ds);
    const am = annotations.filter(a => overlap(dt, annotationText(a)) > 0);
    const em = events.filter(e => overlap(dt, eventText(e)) > 0);
    const km = articles.filter(k => overlap(dt, kbText(k)) > 0);
    const cls = classify(am, em, km);
    if (cls === "FULLY_GROUNDED")  grounded++;
    else if (cls === "DUAL_LINKED")  dual++;
    else if (cls === "SINGLE_LINKED") single++;
    else ungrounded++;
  }
  const total  = datasets.length;
  const covPct = total ? Math.round(((grounded + dual + single) / total) * 100) : 0;
  return `DGOKGND Intelligence Grounding Nexus online, sir. Cross-referencing ${total} datasets against ${annotations.length} graph annotations, ${events.length} ops events, and ${articles.length} KB articles: ${grounded} fully-grounded, ${dual} dual-linked, ${single} single-linked, ${ungrounded} ungrounded. Dataset intelligence grounding at ${covPct} percent.`;
}

// ── component ────────────────────────────────────────────────────────────────
export default function DatasetGraphOpsKnowledgeNexus() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [items,     setItems]     = useState([]);
  const [stats,     setStats]     = useState({
    total:0, grounded:0, dual:0, single:0, ungrounded:0,
    dsCount:0, annCount:0, evCount:0, kbCount:0,
  });
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const [dsRes, anRes, evRes, kbRes] = await Promise.all([
        fetch(`${base}/v1/datasets`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/v1/graph/annotations`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/v1/ops/events`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/knowledge/`).then(r => r.json()).catch(() => ({})),
      ]);
      const datasets    = norm(dsRes, ["datasets","items","data","results"]);
      const annotations = norm(anRes, ["annotations","items","data","results"]);
      const events      = norm(evRes, ["events","ops_events","items","data","results"]);
      const articles    = norm(kbRes, ["articles","knowledge","items","data","results"]);

      const classified = datasets.map(ds => {
        const dt = datasetText(ds);
        const annMatches = annotations
          .filter(a => overlap(dt, annotationText(a)) > 0)
          .map(a => ({ ...a, _rel: overlap(dt, annotationText(a)) }))
          .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const evMatches = events
          .filter(e => overlap(dt, eventText(e)) > 0)
          .map(e => ({ ...e, _rel: overlap(dt, eventText(e)) }))
          .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const kbMatches = articles
          .filter(k => overlap(dt, kbText(k)) > 0)
          .map(k => ({ ...k, _rel: overlap(dt, kbText(k)) }))
          .sort((a,b) => b._rel - a._rel).slice(0, 5);
        const cls = classify(annMatches, evMatches, kbMatches);
        return { ds, annMatches, evMatches, kbMatches, cls };
      });

      let grounded = 0, dual = 0, single = 0, ungrounded = 0;
      classified.forEach(({ cls }) => {
        if (cls === "FULLY_GROUNDED")  grounded++;
        else if (cls === "DUAL_LINKED")  dual++;
        else if (cls === "SINGLE_LINKED") single++;
        else ungrounded++;
      });

      setItems(classified);
      setStats({
        total: classified.length, grounded, dual, single, ungrounded,
        dsCount: datasets.length, annCount: annotations.length,
        evCount: events.length, kbCount: articles.length,
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
    window.addEventListener("jarvis:dgokgnd-toggle", handler);
    return () => window.removeEventListener("jarvis:dgokgnd-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const { total, grounded, dual, single, ungrounded } = stats;
      const prompt = `DGOKGND Dataset Intelligence Grounding Nexus: ${total} datasets cross-referenced against graph annotations, ops events, and KB articles. Fully-grounded (all three): ${grounded}, dual-linked (two): ${dual}, single-linked (one): ${single}, ungrounded (none): ${ungrounded}. In exactly 2 sentences, assess the overall dataset intelligence grounding coverage and identify which ungrounded datasets represent the most critical gaps requiring annotation or knowledge base enrichment.`;
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

  const TABS = ["ALL","FULLY_GROUNDED","DUAL_LINKED","SINGLE_LINKED","UNGROUNDED"];

  const visible = items.filter(({ ds, cls }) => {
    if (tab !== "ALL" && cls !== tab) return false;
    if (!search) return true;
    return datasetText(ds).toLowerCase().includes(search.toLowerCase());
  });

  const { total, grounded, dual, single, ungrounded, annCount, evCount, kbCount } = stats;
  const covPct = total ? Math.round(((grounded + dual + single) / total) * 100) : 0;

  return (
    <>
      {/* ── toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Dataset × Graph Annotation × Ops Event × Knowledge Intelligence Grounding Nexus (DGOKGND)"
        style={{
          position:"fixed", left:BTN_LEFT, bottom:8, zIndex:Z_INDEX,
          fontFamily:FONT, fontSize:10, padding:"4px 9px", cursor:"pointer",
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border:`1px solid ${CY}44`, borderRadius:5,
          boxShadow:`0 0 12px ${CY}${open?"88":"22"}`,
        }}
      >
        ◈ DGOKGND
        {ungrounded > 0 && (
          <span style={{
            marginLeft:5, background:AM, color:"#04060A",
            borderRadius:9, padding:"1px 5px", fontSize:9, fontWeight:700,
          }}>{ungrounded}</span>
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
            <span style={{color:CY,fontSize:12,fontWeight:700,letterSpacing:2}}>◈ DGOKGND</span>
            <span style={{color:DIM,fontSize:10,flex:1}}>
              Dataset × Graph Annotation × Ops Event × Knowledge — Intelligence Grounding Nexus
            </span>
            <button onClick={() => setOpen(false)} style={{
              background:"none",border:"none",color:DIM,cursor:"pointer",fontSize:16,lineHeight:1,padding:0
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
            {[
              ["DATASETS",        total,      CY],
              ["ANNOTATIONS",     annCount,   PU],
              ["OPS EVENTS",      evCount,    OR],
              ["KB ARTICLES",     kbCount,    GR],
              ["FULLY GROUNDED",  grounded,   CY],
              ["DUAL LINKED",     dual,       GR],
              ["SINGLE LINKED",   single,     AM],
              ["UNGROUNDED",      ungrounded, DIM],
              ["GROUNDING",       `${covPct}%`, covPct >= 70 ? GR : covPct >= 40 ? AM : RE],
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
              placeholder="search datasets…"
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
          {loading && <div style={{color:DIM,fontSize:11,marginBottom:8}}>loading dataset intelligence data…</div>}
          {error   && <div style={{color:RE,fontSize:11,marginBottom:8}}>{error}</div>}

          {/* dataset rows */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {visible.map(({ ds, annMatches, evMatches, kbMatches, cls }, idx) => {
              const id    = ds.id || ds._id || idx;
              const isExp = expanded[id];
              const clsCol = CLASS_COLOR[cls];
              const clsLbl = CLASS_LABEL[cls];
              const label  = ds.name || ds.title || `Dataset ${idx+1}`;
              return (
                <div key={id} style={{
                  background:"rgba(0,207,255,0.04)",
                  border:`1px solid ${clsCol}${cls==="FULLY_GROUNDED"?"55":"22"}`,
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
                    {ds.type && (
                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${CY}22`,color:CY}}>
                        {String(ds.type).toUpperCase()}
                      </span>
                    )}
                    <span style={{fontSize:9,color:DIM}}>
                      a:{annMatches.length} e:{evMatches.length} k:{kbMatches.length}
                    </span>
                    <span style={{color:DIM,fontSize:11}}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
                      {/* annotation matches */}
                      <div style={{flex:"1 1 30%",minWidth:180}}>
                        <div style={{fontSize:9,color:PU,marginBottom:4,fontWeight:700}}>ANNOTATIONS ({annMatches.length})</div>
                        {annMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no annotation match</div>
                          : annMatches.map((a,i) => {
                              const maxRel = annMatches[0]._rel || 1;
                              const pct = Math.round((a._rel / maxRel) * 100);
                              return (
                                <div key={a.id||i} style={{
                                  background:"rgba(168,85,247,0.06)", border:`1px solid ${PU}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span style={{overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",maxWidth:130}}>
                                      {a.name || a.label || a.text || `Annotation ${i+1}`}
                                    </span>
                                    {a.type && (
                                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${PU}22`,color:PU}}>
                                        {String(a.type).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${pct}%`,background:PU,borderRadius:2}} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>

                      {/* ops event matches */}
                      <div style={{flex:"1 1 30%",minWidth:180}}>
                        <div style={{fontSize:9,color:OR,marginBottom:4,fontWeight:700}}>OPS EVENTS ({evMatches.length})</div>
                        {evMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no ops event match</div>
                          : evMatches.map((e,i) => {
                              const maxRel = evMatches[0]._rel || 1;
                              const pct = Math.round((e._rel / maxRel) * 100);
                              return (
                                <div key={e.id||i} style={{
                                  background:"rgba(249,115,22,0.06)", border:`1px solid ${OR}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span style={{overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",maxWidth:130}}>
                                      {e.title || e.name || `Event ${i+1}`}
                                    </span>
                                    {e.type && (
                                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${OR}22`,color:OR}}>
                                        {String(e.type).toUpperCase()}
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

                      {/* KB article matches */}
                      <div style={{flex:"1 1 30%",minWidth:180}}>
                        <div style={{fontSize:9,color:GR,marginBottom:4,fontWeight:700}}>KB ARTICLES ({kbMatches.length})</div>
                        {kbMatches.length === 0
                          ? <div style={{fontSize:9,color:DIM}}>no KB match</div>
                          : kbMatches.map((k,i) => {
                              const maxRel = kbMatches[0]._rel || 1;
                              const pct = Math.round((k._rel / maxRel) * 100);
                              return (
                                <div key={k.id||i} style={{
                                  background:"rgba(34,197,94,0.06)", border:`1px solid ${GR}22`,
                                  borderRadius:5, padding:"5px 8px", marginBottom:4,
                                }}>
                                  <div style={{fontSize:10,color:"#DCEBF5",marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                                    <span style={{overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",maxWidth:130}}>
                                      {k.title || `Article ${i+1}`}
                                    </span>
                                    {k.category && (
                                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:`${GR}22`,color:GR}}>
                                        {String(k.category).toUpperCase()}
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
                {items.length === 0 ? "No datasets available." : "No results match filter."}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
