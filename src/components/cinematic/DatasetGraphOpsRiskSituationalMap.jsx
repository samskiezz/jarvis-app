/**
 * F147 — Dataset × Graph Community × Ops Event × RiskSignal
 *         Situational Intelligence Map (DGORSIM)
 *
 * Parallel-fetches /v1/datasets + /v1/graph/communities +
 *   /v1/ops/events + /entities/RiskSignal
 * Keyword-correlates each dataset against community clusters AND
 *   ops events AND risk signals:
 *   FULLY_GROUNDED  — matched all three sources
 *   DUAL_LINKED     — matched any two sources
 *   SINGLE_LINKED   — matched exactly one source
 *   ORPHANED        — no matches (situational gap)
 *
 * Stat tiles: DATASETS / COMMUNITIES / OPS EVENTS / RISK SIGNALS +
 *             all four class counts + COVERAGE%.
 * Amber badge on orphaned count.
 * Filter tabs ALL / FULLY_GROUNDED / DUAL_LINKED / SINGLE_LINKED / ORPHANED + text search.
 * Expand dataset → matched community cards (purple) + ops event cards (blue) +
 *              risk signal cards (red, severity badge) with relevance bars.
 * ▶ ASSESS SITUATION → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:dgorsim-toggle event.
 *
 * Voice triggers: "dgorsim / dataset situation / situational dataset /
 *                  orphaned dataset situation / dataset threat context".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_025_240;
const Z_INDEX  = 209;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const DGORSIM_RE = /\b(dgorsim|dataset[\s-]situation|situational[\s-]dataset|orphaned[\s-]dataset[\s-]situation|dataset[\s-]threat[\s-]context)\b/i;

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RE     = "#EF4444";
const PU     = "#A855F7";
const BL     = "#3B82F6";
const GR     = "#22C55E";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const SEVERITY_COLOR = { CRITICAL: RE, HIGH: "#F97316", MEDIUM: AM, LOW: CY };
const CLASS_COLOR = {
  FULLY_GROUNDED: GR,
  DUAL_LINKED:    AM,
  SINGLE_LINKED:  CY,
  ORPHANED:       "#4B5563",
};
const TABS = ["ALL","FULLY_GROUNDED","DUAL_LINKED","SINGLE_LINKED","ORPHANED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function datasetText(d) {
  return `${d.name||d.title||""} ${d.description||""} ${d.type||""} ${(d.tags||[]).join(" ")}`;
}
function communityText(c) {
  return `${c.name||c.label||c.id||""} ${c.description||""} ${(c.members||[]).join(" ")} ${(c.tags||[]).join(" ")}`;
}
function opsText(e) {
  return `${e.title||e.name||e.event||""} ${e.description||""} ${e.type||""} ${e.location||""} ${(e.tags||[]).join(" ")}`;
}
function riskText(r) {
  return `${r.title||r.name||""} ${r.description||""} ${r.source||""} ${(r.tags||[]).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

async function loadAll() {
  const h = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [dsRes, commRes, opsRes, riskRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/datasets`,               { headers: h }),
    fetch(`${apiBase}/v1/graph/communities`,       { headers: h }),
    fetch(`${apiBase}/v1/ops/events`,              { headers: h }),
    fetch(`${apiBase}/entities/RiskSignal`,        { headers: h }),
  ]);
  const datasets     = normaliseArray(dsRes.status==="fulfilled"   && dsRes.value.ok   ? await dsRes.value.json()   : [], ["datasets","items"]);
  const communities  = normaliseArray(commRes.status==="fulfilled" && commRes.value.ok ? await commRes.value.json() : [], ["communities","clusters","items"]);
  const opsEvents    = normaliseArray(opsRes.status==="fulfilled"  && opsRes.value.ok  ? await opsRes.value.json()  : [], ["events","ops_events","items"]);
  const riskSignals  = normaliseArray(riskRes.status==="fulfilled" && riskRes.value.ok ? await riskRes.value.json() : [], ["signals","risk_signals","items"]);
  return { datasets, communities, opsEvents, riskSignals };
}

function classify(dataset, communities, opsEvents, riskSignals) {
  const kws             = keywords(datasetText(dataset));
  const matchedComms    = communities.filter(c => score(communityText(c), kws) > 0);
  const matchedOps      = opsEvents.filter(e => score(opsText(e), kws) > 0);
  const matchedRisk     = riskSignals.filter(r => score(riskText(r), kws) > 0);
  const hits = (matchedComms.length > 0 ? 1 : 0)
             + (matchedOps.length > 0 ? 1 : 0)
             + (matchedRisk.length > 0 ? 1 : 0);
  let cls;
  if (hits === 3)      cls = "FULLY_GROUNDED";
  else if (hits === 2) cls = "DUAL_LINKED";
  else if (hits === 1) cls = "SINGLE_LINKED";
  else                 cls = "ORPHANED";
  return { ...dataset, cls, matchedComms, matchedOps, matchedRisk };
}

function RelevanceBar({ score: s, max, color }) {
  const pct = max > 0 ? Math.round((s/max)*100) : 0;
  return (
    <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,marginTop:3}}>
      <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:2,transition:"width 0.3s"}} />
    </div>
  );
}

export async function buildDgorsimScript() {
  const { datasets, communities, opsEvents, riskSignals } = await loadAll();
  const rows     = datasets.map(d => classify(d, communities, opsEvents, riskSignals));
  const grounded = rows.filter(r => r.cls === "FULLY_GROUNDED").length;
  const orphaned = rows.filter(r => r.cls === "ORPHANED").length;
  const ctx = `Datasets: ${datasets.length}. Graph communities: ${communities.length}. Ops events: ${opsEvents.length}. Risk signals: ${riskSignals.length}. Fully grounded: ${grounded}. Orphaned: ${orphaned}.`;
  const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
    body: JSON.stringify({ message: `Dataset Situational Intelligence Map (DGORSIM): ${ctx}. Write exactly 2 sentences assessing which datasets are grounded in real situational context across communities, operations, and risk signals, and what the orphaned datasets mean for intelligence coverage.` }),
  });
  const j = await res.json().catch(() => ({}));
  return j.response || j.message || j.content
    || `DGORSIM online, sir. ${grounded} datasets are fully grounded across community, operational, and risk dimensions — ${orphaned} remain orphaned, representing blind spots in situational intelligence coverage.`;
}

export function isDgorsimQuery(q) { return DGORSIM_RE.test(q); }

export default function DatasetGraphOpsRiskSituationalMap() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [classified, setClassified] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [opsEvents, setOpsEvents]   = useState([]);
  const [riskSignals, setRiskSignals] = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [brief, setBrief]           = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { datasets, communities: co, opsEvents: oe, riskSignals: rs } = await loadAll();
      setCommunities(co); setOpsEvents(oe); setRiskSignals(rs);
      setClassified(datasets.map(d => classify(d, co, oe, rs)));
    } catch (e) {
      setError(e.message || "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:dgorsim-toggle", toggle);
    return () => window.removeEventListener("jarvis:dgorsim-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try { setBrief(await buildDgorsimScript()); }
    catch { setBrief("DGORSIM assessment complete, sir."); }
    finally { setAssessing(false); }
  }, []);

  const counts = {
    FULLY_GROUNDED: classified.filter(r => r.cls === "FULLY_GROUNDED").length,
    DUAL_LINKED:    classified.filter(r => r.cls === "DUAL_LINKED").length,
    SINGLE_LINKED:  classified.filter(r => r.cls === "SINGLE_LINKED").length,
    ORPHANED:       classified.filter(r => r.cls === "ORPHANED").length,
  };
  const covPct = classified.length > 0
    ? Math.round((counts.FULLY_GROUNDED + counts.DUAL_LINKED) / classified.length * 100)
    : 0;

  const visible = classified.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!datasetText(r).toLowerCase().includes(q)) return false;
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
        title="Dataset Situational Intelligence Map (DGORSIM)"
      >◈ DGORSIM</button>
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
            <div style={{fontSize:13,fontWeight:700,color:CY,letterSpacing:2}}>◈ DGORSIM</div>
            <div style={{fontSize:10,color:"#64748B",marginTop:2}}>
              Dataset × Graph Community × Ops Event × RiskSignal Situational Intelligence Map
            </div>
          </div>
          <button onClick={() => setOpen(false)} style={{background:"none",border:"none",color:"#64748B",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
          {[
            ["DATASETS",    classified.length,    CY],
            ["COMMUNITIES", communities.length,   PU],
            ["OPS EVENTS",  opsEvents.length,     BL],
            ["RISK SIGS",   riskSignals.length,   RE],
            ["FULLY GND",   counts.FULLY_GROUNDED, CLASS_COLOR.FULLY_GROUNDED],
            ["DUAL LNK",    counts.DUAL_LINKED,   AM],
            ["SINGLE LNK",  counts.SINGLE_LINKED, CY],
            ["ORPHANED",    counts.ORPHANED,       RE],
            ["COVERAGE%",   `${covPct}%`,         covPct >= 70 ? GR : covPct >= 40 ? AM : RE],
          ].map(([label, val, col]) => (
            <div key={label} style={{
              background:"rgba(255,255,255,0.03)", border:`1px solid ${BORDER}`,
              borderRadius:4, padding:"5px 10px", minWidth:80, textAlign:"center",
            }}>
              <div style={{fontSize:8,color:"#64748B",letterSpacing:1}}>{label}</div>
              <div style={{fontSize:14,fontWeight:700,color:col}}>{val}</div>
            </div>
          ))}
          {counts.ORPHANED > 0 && (
            <div style={{
              background:"rgba(245,158,11,0.08)", border:`1px solid ${AM}`,
              borderRadius:4, padding:"5px 10px", textAlign:"center",
            }}>
              <div style={{fontSize:8,color:AM,letterSpacing:1}}>ORPHANED</div>
              <div style={{fontSize:14,fontWeight:700,color:AM}}>{counts.ORPHANED}</div>
            </div>
          )}
        </div>

        {/* Coverage bar */}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#64748B",marginBottom:3}}>
            <span>SITUATIONAL COVERAGE</span>
            <span style={{color: covPct>=70?GR:covPct>=40?AM:RE}}>{covPct}%</span>
          </div>
          <div style={{height:4,background:"rgba(255,255,255,0.06)",borderRadius:2}}>
            <div style={{
              height:"100%",
              width:`${covPct}%`,
              background: covPct>=70?GR:covPct>=40?AM:RE,
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
            placeholder="search datasets…"
            style={{
              background:"rgba(255,255,255,0.04)", border:`1px solid ${BORDER}`,
              color:"#E2E8F0", fontFamily:FONT, fontSize:10, padding:"3px 8px",
              borderRadius:3, outline:"none", width:160,
            }}
          />
        </div>

        {/* Assess button */}
        <button onClick={assess} disabled={assessing} style={{
          background:"rgba(0,207,255,0.08)", border:`1px solid ${CY}`,
          color:CY, fontFamily:FONT, fontSize:10, padding:"4px 14px",
          borderRadius:3, cursor:"pointer", marginBottom:14,
        }}>
          {assessing ? "◌ ASSESSING…" : "▶ ASSESS SITUATION"}
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
            const maxCommScore = Math.max(1, ...row.matchedComms.map(c => score(communityText(c), keywords(datasetText(row)))));
            const maxOpsScore  = Math.max(1, ...row.matchedOps.map(e => score(opsText(e), keywords(datasetText(row)))));
            const maxRiskScore = Math.max(1, ...row.matchedRisk.map(r => score(riskText(r), keywords(datasetText(row)))));
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
                    background:`${col}22`, color:col, fontWeight:700, minWidth:100, textAlign:"center",
                  }}>{row.cls}</div>
                  <div style={{flex:1,fontSize:11,color:"#CBD5E1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {row.name || row.title || row.id || "—"}
                  </div>
                  {row.type && (
                    <div style={{fontSize:9,color:"#64748B",padding:"1px 6px",border:`1px solid ${BORDER}`,borderRadius:2}}>{row.type}</div>
                  )}
                  <div style={{fontSize:10,color:"#64748B"}}>{isExp?"▲":"▼"}</div>
                </div>

                {isExp && (
                  <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                    {/* Matched Communities */}
                    {row.matchedComms.length > 0 && (
                      <div>
                        <div style={{fontSize:9,color:PU,letterSpacing:1,marginBottom:4}}>GRAPH COMMUNITIES ({row.matchedComms.length})</div>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {row.matchedComms.slice(0,5).map((c, ci) => {
                            const sc = score(communityText(c), keywords(datasetText(row)));
                            return (
                              <div key={ci} style={{background:`rgba(168,85,247,0.05)`,border:`1px solid ${PU}22`,borderRadius:3,padding:"4px 8px"}}>
                                <div style={{fontSize:10,color:"#CBD5E1"}}>{c.name||c.label||c.id||"—"}</div>
                                <RelevanceBar score={sc} max={maxCommScore} color={PU} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Matched Ops Events */}
                    {row.matchedOps.length > 0 && (
                      <div>
                        <div style={{fontSize:9,color:BL,letterSpacing:1,marginBottom:4}}>OPS EVENTS ({row.matchedOps.length})</div>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {row.matchedOps.slice(0,5).map((e, ei) => {
                            const sc = score(opsText(e), keywords(datasetText(row)));
                            return (
                              <div key={ei} style={{background:`rgba(59,130,246,0.05)`,border:`1px solid ${BL}22`,borderRadius:3,padding:"4px 8px"}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                  <div style={{fontSize:10,color:"#CBD5E1"}}>{e.title||e.name||e.event||"—"}</div>
                                  {e.type&&<div style={{fontSize:8,color:BL,padding:"1px 4px",border:`1px solid ${BL}44`,borderRadius:2}}>{e.type}</div>}
                                </div>
                                <RelevanceBar score={sc} max={maxOpsScore} color={BL} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Matched Risk Signals */}
                    {row.matchedRisk.length > 0 && (
                      <div>
                        <div style={{fontSize:9,color:RE,letterSpacing:1,marginBottom:4}}>RISK SIGNALS ({row.matchedRisk.length})</div>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {row.matchedRisk.slice(0,5).map((r, ri) => {
                            const sc = score(riskText(r), keywords(datasetText(row)));
                            const sevCol = SEVERITY_COLOR[r.severity] || AM;
                            return (
                              <div key={ri} style={{background:`rgba(239,68,68,0.05)`,border:`1px solid ${RE}22`,borderRadius:3,padding:"4px 8px"}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                  <div style={{fontSize:10,color:"#CBD5E1"}}>{r.title||r.name||"—"}</div>
                                  {r.severity&&<div style={{fontSize:8,color:sevCol,padding:"1px 4px",border:`1px solid ${sevCol}44`,borderRadius:2}}>{r.severity}</div>}
                                </div>
                                <RelevanceBar score={sc} max={maxRiskScore} color={RE} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {row.matchedComms.length === 0 && row.matchedOps.length === 0 && row.matchedRisk.length === 0 && (
                      <div style={{fontSize:10,color:"#4B5563"}}>No situational context found across community, ops, or risk dimensions.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{fontSize:11,color:"#64748B",textAlign:"center",padding:"20px 0"}}>
              No datasets match the current filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
