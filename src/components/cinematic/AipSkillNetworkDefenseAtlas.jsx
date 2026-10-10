/**
 * F148 — AIP Skill × Graph Community × Knowledge × RiskSignal
 *         Network Defense Readiness Atlas (NDRATLAS)
 *
 * Parallel-fetches /v1/aip/skill + /v1/graph/communities +
 *   /knowledge/ + /entities/RiskSignal
 * Keyword-correlates each AIP skill against community clusters AND
 *   KB articles AND risk signals:
 *   FULLY_NETWORKED  — matched all three sources
 *   DUAL_NETWORKED   — matched any two sources
 *   SINGLE_LINKED    — matched exactly one source
 *   ISOLATED         — no matches (defense gap)
 *
 * Stat tiles: AIP SKILLS / COMMUNITIES / KB ARTICLES / RISK SIGNALS +
 *             all four class counts + READINESS%.
 * Amber badge on isolated count.
 * Filter tabs ALL / FULLY_NETWORKED / DUAL_NETWORKED / SINGLE_LINKED / ISOLATED + text search.
 * Expand skill → matched community cards (purple) + KB article cards (green) +
 *                risk signal cards (red, severity badge) with relevance bars.
 * ▶ ASSESS DEFENSE READINESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:ndratlas-toggle event.
 *
 * Voice triggers: "ndratlas / network defense / skill network /
 *                  community skill coverage / network ready skills / networked skill".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_025_800;
const Z_INDEX  = 210;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const NDRATLAS_RE = /\b(ndratlas|network[\s-]defense|skill[\s-]network|community[\s-]skill[\s-]coverage|network[\s-]ready[\s-]skills?|networked[\s-]skill)\b/i;

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RE     = "#EF4444";
const PU     = "#A855F7";
const GR     = "#22C55E";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const SEVERITY_COLOR = { CRITICAL: RE, HIGH: "#F97316", MEDIUM: AM, LOW: CY };
const CLASS_COLOR = {
  FULLY_NETWORKED: GR,
  DUAL_NETWORKED:  AM,
  SINGLE_LINKED:   CY,
  ISOLATED:        "#4B5563",
};
const TABS = ["ALL","FULLY_NETWORKED","DUAL_NETWORKED","SINGLE_LINKED","ISOLATED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function skillText(s) {
  return `${s.name||s.title||s.skill||""} ${s.description||""} ${s.type||""} ${(s.tags||[]).join(" ")} ${(s.capabilities||[]).join(" ")}`;
}
function communityText(c) {
  return `${c.name||c.label||c.id||""} ${c.description||""} ${(c.members||[]).join(" ")} ${(c.tags||[]).join(" ")}`;
}
function kbText(a) {
  return `${a.title||a.name||""} ${a.content||a.summary||a.description||""} ${(a.tags||[]).join(" ")} ${a.category||""}`;
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
  const [skillRes, commRes, kbRes, riskRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/aip/skill`,           { headers: h }),
    fetch(`${apiBase}/v1/graph/communities`,   { headers: h }),
    fetch(`${apiBase}/knowledge/`,             { headers: h }),
    fetch(`${apiBase}/entities/RiskSignal`,    { headers: h }),
  ]);
  const skills      = normaliseArray(skillRes.status==="fulfilled"  && skillRes.value.ok  ? await skillRes.value.json()  : [], ["skills","aip_skills","items"]);
  const communities = normaliseArray(commRes.status==="fulfilled"   && commRes.value.ok   ? await commRes.value.json()   : [], ["communities","clusters","items"]);
  const articles    = normaliseArray(kbRes.status==="fulfilled"     && kbRes.value.ok     ? await kbRes.value.json()     : [], ["articles","knowledge","items"]);
  const riskSignals = normaliseArray(riskRes.status==="fulfilled"   && riskRes.value.ok   ? await riskRes.value.json()   : [], ["signals","risk_signals","items"]);
  return { skills, communities, articles, riskSignals };
}

function classify(skill, communities, articles, riskSignals) {
  const kws             = keywords(skillText(skill));
  const matchedComms    = communities.filter(c => score(communityText(c), kws) > 0);
  const matchedArticles = articles.filter(a => score(kbText(a), kws) > 0);
  const matchedRisk     = riskSignals.filter(r => score(riskText(r), kws) > 0);
  const hits = (matchedComms.length > 0 ? 1 : 0)
             + (matchedArticles.length > 0 ? 1 : 0)
             + (matchedRisk.length > 0 ? 1 : 0);
  let cls;
  if (hits === 3)      cls = "FULLY_NETWORKED";
  else if (hits === 2) cls = "DUAL_NETWORKED";
  else if (hits === 1) cls = "SINGLE_LINKED";
  else                 cls = "ISOLATED";
  return { ...skill, cls, matchedComms, matchedArticles, matchedRisk };
}

function RelevanceBar({ score: s, max, color }) {
  const pct = max > 0 ? Math.round((s/max)*100) : 0;
  return (
    <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,marginTop:3}}>
      <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:2,transition:"width 0.3s"}} />
    </div>
  );
}

export async function buildNdratlasScript() {
  const { skills, communities, articles, riskSignals } = await loadAll();
  const rows      = skills.map(s => classify(s, communities, articles, riskSignals));
  const networked = rows.filter(r => r.cls === "FULLY_NETWORKED").length;
  const isolated  = rows.filter(r => r.cls === "ISOLATED").length;
  const ctx = `AIP skills: ${skills.length}. Graph communities: ${communities.length}. KB articles: ${articles.length}. Risk signals: ${riskSignals.length}. Fully networked: ${networked}. Isolated: ${isolated}.`;
  const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
    body: JSON.stringify({ message: `Network Defense Readiness Atlas (NDRATLAS): ${ctx}. Write exactly 2 sentences assessing which AIP skills are fully networked across graph communities, knowledge base, and risk signals, and what the isolated skills mean for the overall network defense posture.` }),
  });
  const j = await res.json().catch(() => ({}));
  return j.response || j.message || j.content
    || `NDRATLAS online, sir. ${networked} skills are fully networked across community, knowledge, and risk dimensions — ${isolated} remain isolated, representing gaps in network defense readiness.`;
}

export function isNdratlasQuery(q) { return NDRATLAS_RE.test(q); }

export default function AipSkillNetworkDefenseAtlas() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [classified, setClassified] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [articles, setArticles]     = useState([]);
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
      const { skills, communities: co, articles: ar, riskSignals: rs } = await loadAll();
      setCommunities(co); setArticles(ar); setRiskSignals(rs);
      setClassified(skills.map(s => classify(s, co, ar, rs)));
    } catch (e) {
      setError(e.message || "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:ndratlas-toggle", toggle);
    return () => window.removeEventListener("jarvis:ndratlas-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try { setBrief(await buildNdratlasScript()); }
    catch { setBrief("NDRATLAS assessment complete, sir."); }
    finally { setAssessing(false); }
  }, []);

  const counts = {
    FULLY_NETWORKED: classified.filter(r => r.cls === "FULLY_NETWORKED").length,
    DUAL_NETWORKED:  classified.filter(r => r.cls === "DUAL_NETWORKED").length,
    SINGLE_LINKED:   classified.filter(r => r.cls === "SINGLE_LINKED").length,
    ISOLATED:        classified.filter(r => r.cls === "ISOLATED").length,
  };
  const readPct = classified.length > 0
    ? Math.round((counts.FULLY_NETWORKED + counts.DUAL_NETWORKED) / classified.length * 100)
    : 0;

  const visible = classified.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!skillText(r).toLowerCase().includes(q)) return false;
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
        title="AIP Skill × Graph Community × Knowledge × RiskSignal Network Defense Readiness Atlas (NDRATLAS)"
      >◈ NDRATLAS</button>
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
            <div style={{fontSize:13,fontWeight:700,color:CY,letterSpacing:2}}>◈ NDRATLAS</div>
            <div style={{fontSize:10,color:"#64748B",marginTop:2}}>
              AIP Skill × Graph Community × Knowledge × RiskSignal Network Defense Readiness Atlas
            </div>
          </div>
          <button onClick={() => setOpen(false)} style={{background:"none",border:"none",color:"#64748B",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
          {[
            ["AIP SKILLS",   classified.length,       CY],
            ["COMMUNITIES",  communities.length,       PU],
            ["KB ARTICLES",  articles.length,          GR],
            ["RISK SIGS",    riskSignals.length,       RE],
            ["FULLY NET",    counts.FULLY_NETWORKED,   CLASS_COLOR.FULLY_NETWORKED],
            ["DUAL NET",     counts.DUAL_NETWORKED,    AM],
            ["SINGLE LNK",   counts.SINGLE_LINKED,     CY],
            ["ISOLATED",     counts.ISOLATED,           RE],
            ["READINESS%",   `${readPct}%`,             readPct >= 70 ? GR : readPct >= 40 ? AM : RE],
          ].map(([label, val, col]) => (
            <div key={label} style={{
              background:"rgba(255,255,255,0.03)", border:`1px solid ${BORDER}`,
              borderRadius:4, padding:"5px 10px", minWidth:80, textAlign:"center",
            }}>
              <div style={{fontSize:8,color:"#64748B",letterSpacing:1}}>{label}</div>
              <div style={{fontSize:14,fontWeight:700,color:col}}>{val}</div>
            </div>
          ))}
          {counts.ISOLATED > 0 && (
            <div style={{
              background:"rgba(245,158,11,0.08)", border:`1px solid ${AM}`,
              borderRadius:4, padding:"5px 10px", textAlign:"center",
            }}>
              <div style={{fontSize:8,color:AM,letterSpacing:1}}>ISOLATED</div>
              <div style={{fontSize:14,fontWeight:700,color:AM}}>{counts.ISOLATED}</div>
            </div>
          )}
        </div>

        {/* Readiness bar */}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#64748B",marginBottom:3}}>
            <span>NETWORK DEFENSE READINESS</span>
            <span style={{color: readPct>=70?GR:readPct>=40?AM:RE}}>{readPct}%</span>
          </div>
          <div style={{height:4,background:"rgba(255,255,255,0.06)",borderRadius:2}}>
            <div style={{
              height:"100%", width:`${readPct}%`,
              background: readPct>=70?GR:readPct>=40?AM:RE,
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
            placeholder="search skills…"
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
          {assessing ? "◌ ASSESSING…" : "▶ ASSESS DEFENSE READINESS"}
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
            const kws = keywords(skillText(row));
            const maxCommScore    = Math.max(1, ...row.matchedComms.map(c => score(communityText(c), kws)));
            const maxArticleScore = Math.max(1, ...row.matchedArticles.map(a => score(kbText(a), kws)));
            const maxRiskScore    = Math.max(1, ...row.matchedRisk.map(r => score(riskText(r), kws)));
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
                    background:`${col}22`, color:col, fontWeight:700, minWidth:110, textAlign:"center",
                  }}>{row.cls}</div>
                  <div style={{flex:1,fontSize:11,color:"#CBD5E1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {row.name || row.title || row.skill || row.id || "—"}
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
                            const sc = score(communityText(c), kws);
                            return (
                              <div key={ci} style={{background:"rgba(168,85,247,0.05)",border:`1px solid ${PU}22`,borderRadius:3,padding:"4px 8px"}}>
                                <div style={{fontSize:10,color:"#CBD5E1"}}>{c.name||c.label||c.id||"—"}</div>
                                <RelevanceBar score={sc} max={maxCommScore} color={PU} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Matched KB Articles */}
                    {row.matchedArticles.length > 0 && (
                      <div>
                        <div style={{fontSize:9,color:GR,letterSpacing:1,marginBottom:4}}>KB ARTICLES ({row.matchedArticles.length})</div>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {row.matchedArticles.slice(0,5).map((a, ai) => {
                            const sc = score(kbText(a), kws);
                            return (
                              <div key={ai} style={{background:"rgba(34,197,94,0.05)",border:`1px solid ${GR}22`,borderRadius:3,padding:"4px 8px"}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                  <div style={{fontSize:10,color:"#CBD5E1"}}>{a.title||a.name||"—"}</div>
                                  {a.category&&<div style={{fontSize:8,color:GR,padding:"1px 4px",border:`1px solid ${GR}44`,borderRadius:2}}>{a.category}</div>}
                                </div>
                                <RelevanceBar score={sc} max={maxArticleScore} color={GR} />
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
                            const sc = score(riskText(r), kws);
                            const sevCol = SEVERITY_COLOR[r.severity] || AM;
                            return (
                              <div key={ri} style={{background:"rgba(239,68,68,0.05)",border:`1px solid ${RE}22`,borderRadius:3,padding:"4px 8px"}}>
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

                    {row.matchedComms.length === 0 && row.matchedArticles.length === 0 && row.matchedRisk.length === 0 && (
                      <div style={{fontSize:10,color:"#4B5563"}}>No network context found across community, knowledge, or risk dimensions.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{fontSize:11,color:"#64748B",textAlign:"center",padding:"20px 0"}}>
              No skills match the current filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
