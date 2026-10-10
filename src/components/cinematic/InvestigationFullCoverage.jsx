/**
 * F146 — Investigation × AIP Skill × Contact × Knowledge
 *         Full-Spectrum Investigation Coverage (ISKFULL)
 *
 * Parallel-fetches /v1/investigations + /v1/aip/skill +
 *   /entities/Contact + /knowledge/
 * Keyword-correlates each investigation against AIP skills AND contacts AND KB articles:
 *   FULLY_COVERED  — matched all three sources
 *   DUAL_COVERED   — matched any two sources
 *   SINGLE_LINKED  — matched exactly one source
 *   BARE           — no matches (coverage gap)
 *
 * Stat tiles: INVESTIGATIONS / AIP SKILLS / CONTACTS / KB ARTICLES +
 *             all four class counts + COVERAGE%.
 * Amber badge on bare count.
 * Filter tabs ALL / FULLY_COVERED / DUAL_COVERED / SINGLE_LINKED / BARE + text search.
 * Expand investigation → matched AIP skill cards (cyan) + contact cards (orange) +
 *              KB article cards (green) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:iskfull-toggle event.
 *
 * Voice triggers: "iskfull / investigation coverage / full investigation /
 *                  bare investigations / investigation skill contact knowledge".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_024_680;
const Z_INDEX  = 208;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ISKFULL_RE = /\b(iskfull|investigation[\s-]coverage|full[\s-]investigation|bare[\s-]investigations|investigation[\s-]skill[\s-]contact[\s-]knowledge)\b/i;

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RE     = "#EF4444";
const OR     = "#F97316";
const GR     = "#22C55E";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_COVERED: GR,
  DUAL_COVERED:  AM,
  SINGLE_LINKED: CY,
  BARE:          "#4B5563",
};
const TABS = ["ALL","FULLY_COVERED","DUAL_COVERED","SINGLE_LINKED","BARE"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function invText(i)   { return `${i.title||i.name||""} ${i.description||""} ${i.type||""} ${(i.tags||[]).join(" ")}`; }
function skillText(s) { return `${s.name||s.title||""} ${s.description||""} ${s.type||""} ${(s.tags||[]).join(" ")}`; }
function contactText(c){ return `${c.name||""} ${c.role||""} ${c.org||""} ${c.email||""} ${c.description||""} ${(c.tags||[]).join(" ")}`; }
function kbText(a)    { return `${a.title||a.name||""} ${a.content||a.description||""} ${a.type||""} ${(a.tags||[]).join(" ")}`; }

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

async function loadAll() {
  const h = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [invRes, skillRes, contactRes, kbRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/investigations`, { headers: h }),
    fetch(`${apiBase}/v1/aip/skill`,      { headers: h }),
    fetch(`${apiBase}/entities/Contact`,  { headers: h }),
    fetch(`${apiBase}/knowledge/`,        { headers: h }),
  ]);
  const investigations = normaliseArray(invRes.status==="fulfilled" && invRes.value.ok ? await invRes.value.json() : [], ["investigations","items"]);
  const skills         = normaliseArray(skillRes.status==="fulfilled" && skillRes.value.ok ? await skillRes.value.json() : [], ["skills","items"]);
  const contacts       = normaliseArray(contactRes.status==="fulfilled" && contactRes.value.ok ? await contactRes.value.json() : [], ["contacts","items"]);
  const kbArticles     = normaliseArray(kbRes.status==="fulfilled" && kbRes.value.ok ? await kbRes.value.json() : [], ["articles","items","documents"]);
  return { investigations, skills, contacts, kbArticles };
}

function classify(inv, skills, contacts, kbArticles) {
  const kws           = keywords(invText(inv));
  const matchedSkills = skills.filter(s => score(skillText(s), kws) > 0);
  const matchedConts  = contacts.filter(c => score(contactText(c), kws) > 0);
  const matchedKb     = kbArticles.filter(a => score(kbText(a), kws) > 0);
  const hits = (matchedSkills.length > 0 ? 1 : 0)
             + (matchedConts.length > 0 ? 1 : 0)
             + (matchedKb.length > 0 ? 1 : 0);
  let cls;
  if (hits === 3)      cls = "FULLY_COVERED";
  else if (hits === 2) cls = "DUAL_COVERED";
  else if (hits === 1) cls = "SINGLE_LINKED";
  else                 cls = "BARE";
  return { ...inv, cls, matchedSkills, matchedConts, matchedKb };
}

function RelevanceBar({ score: s, max, color }) {
  const pct = max > 0 ? Math.round((s/max)*100) : 0;
  return (
    <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,marginTop:3}}>
      <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:2,transition:"width 0.3s"}} />
    </div>
  );
}

export async function buildIskfullScript() {
  const { investigations, skills, contacts, kbArticles } = await loadAll();
  const rows        = investigations.map(i => classify(i, skills, contacts, kbArticles));
  const fullCovered = rows.filter(r => r.cls === "FULLY_COVERED").length;
  const bare        = rows.filter(r => r.cls === "BARE").length;
  const ctx = `Investigations: ${investigations.length}. AIP Skills: ${skills.length}. Contacts: ${contacts.length}. KB Articles: ${kbArticles.length}. Fully covered: ${fullCovered}. Bare: ${bare}.`;
  const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
    body: JSON.stringify({ message: `Full Investigation Coverage (ISKFULL): ${ctx}. Write exactly 2 sentences assessing which investigations have full coverage across skill, contact, and knowledge dimensions, and what the bare investigations mean for operational intelligence depth.` }),
  });
  const j = await res.json().catch(() => ({}));
  return j.response || j.message || j.content
    || `ISKFULL online, sir. ${fullCovered} investigations are fully covered across skill, contact, and knowledge dimensions — ${bare} remain bare, representing gaps in operational intelligence coverage.`;
}

export function isIskfullQuery(q) { return ISKFULL_RE.test(q); }

export default function InvestigationFullCoverage() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [classified, setClassified] = useState([]);
  const [skills, setSkills]     = useState([]);
  const [contacts, setContacts] = useState([]);
  const [kbArticles, setKbArticles] = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { investigations, skills: sk, contacts: ct, kbArticles: kb } = await loadAll();
      setSkills(sk); setContacts(ct); setKbArticles(kb);
      setClassified(investigations.map(i => classify(i, sk, ct, kb)));
    } catch (e) {
      setError(e.message || "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:iskfull-toggle", toggle);
    return () => window.removeEventListener("jarvis:iskfull-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try { setBrief(await buildIskfullScript()); }
    catch { setBrief("ISKFULL assessment complete, sir."); }
    finally { setAssessing(false); }
  }, []);

  const counts = {
    FULLY_COVERED: classified.filter(r => r.cls === "FULLY_COVERED").length,
    DUAL_COVERED:  classified.filter(r => r.cls === "DUAL_COVERED").length,
    SINGLE_LINKED: classified.filter(r => r.cls === "SINGLE_LINKED").length,
    BARE:          classified.filter(r => r.cls === "BARE").length,
  };
  const covPct = classified.length > 0
    ? Math.round((counts.FULLY_COVERED + counts.DUAL_COVERED) / classified.length * 100)
    : 0;

  const visible = classified.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!invText(r).toLowerCase().includes(q)) return false;
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
        title="Investigation Full Coverage (ISKFULL)"
      >◈ ISKFULL</button>
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
            <div style={{fontSize:13,fontWeight:700,color:CY,letterSpacing:2}}>◈ ISKFULL</div>
            <div style={{fontSize:10,color:"#64748B",marginTop:2}}>
              Investigation × AIP Skill × Contact × Knowledge Full-Spectrum Coverage
            </div>
          </div>
          <button onClick={() => setOpen(false)} style={{background:"none",border:"none",color:"#64748B",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
          {[
            ["INVESTIGATIONS", classified.length, CY],
            ["AIP SKILLS", skills.length, GR],
            ["CONTACTS", contacts.length, OR],
            ["KB ARTICLES", kbArticles.length, "#818CF8"],
            ["FULLY COV", counts.FULLY_COVERED, CLASS_COLOR.FULLY_COVERED],
            ["DUAL COV", counts.DUAL_COVERED, AM],
            ["SINGLE LNK", counts.SINGLE_LINKED, CY],
            ["BARE", counts.BARE, RE],
            ["COVERAGE%", `${covPct}%`, covPct >= 70 ? GR : covPct >= 40 ? AM : RE],
          ].map(([label, val, col]) => (
            <div key={label} style={{
              background:"rgba(255,255,255,0.03)", border:`1px solid ${BORDER}`,
              borderRadius:4, padding:"5px 10px", minWidth:80, textAlign:"center",
            }}>
              <div style={{fontSize:8,color:"#64748B",letterSpacing:1}}>{label}</div>
              <div style={{fontSize:14,fontWeight:700,color:col}}>{val}</div>
            </div>
          ))}
          {counts.BARE > 0 && (
            <div style={{
              background:"rgba(245,158,11,0.08)", border:`1px solid ${AM}`,
              borderRadius:4, padding:"5px 10px", textAlign:"center",
            }}>
              <div style={{fontSize:8,color:AM,letterSpacing:1}}>BARE</div>
              <div style={{fontSize:14,fontWeight:700,color:AM}}>{counts.BARE}</div>
            </div>
          )}
        </div>

        {/* Coverage bar */}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#64748B",marginBottom:3}}>
            <span>INVESTIGATION COVERAGE</span>
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
            placeholder="search investigations…"
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
          {assessing ? "◌ ASSESSING…" : "▶ ASSESS COVERAGE"}
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
            const maxSkillScore = Math.max(1, ...row.matchedSkills.map(s => score(skillText(s), keywords(invText(row)))));
            const maxContScore  = Math.max(1, ...row.matchedConts.map(c => score(contactText(c), keywords(invText(row)))));
            const maxKbScore    = Math.max(1, ...row.matchedKb.map(a => score(kbText(a), keywords(invText(row)))));
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
                    background:`${col}22`, color:col, fontWeight:700, minWidth:90, textAlign:"center",
                  }}>{row.cls}</div>
                  <div style={{flex:1,fontSize:11,color:"#CBD5E1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {row.title || row.name || row.id || "—"}
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
                            const sc = score(skillText(s), keywords(invText(row)));
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
                            const sc = score(contactText(c), keywords(invText(row)));
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

                    {/* Matched KB Articles */}
                    {row.matchedKb.length > 0 && (
                      <div>
                        <div style={{fontSize:9,color:GR,letterSpacing:1,marginBottom:4}}>KB ARTICLES ({row.matchedKb.length})</div>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {row.matchedKb.slice(0,5).map((a, ai) => {
                            const sc = score(kbText(a), keywords(invText(row)));
                            return (
                              <div key={ai} style={{background:`rgba(34,197,94,0.05)`,border:`1px solid ${GR}22`,borderRadius:3,padding:"4px 8px"}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                  <div style={{fontSize:10,color:"#CBD5E1"}}>{a.title||a.name||"—"}</div>
                                  {a.type&&<div style={{fontSize:8,color:GR,padding:"1px 4px",border:`1px solid ${GR}44`,borderRadius:2}}>{a.type}</div>}
                                </div>
                                <RelevanceBar score={sc} max={maxKbScore} color={GR} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {row.matchedSkills.length === 0 && row.matchedConts.length === 0 && row.matchedKb.length === 0 && (
                      <div style={{fontSize:10,color:"#4B5563"}}>No coverage matches found across skill, contact, or knowledge dimensions.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{fontSize:11,color:"#64748B",textAlign:"center",padding:"20px 0"}}>
              No investigations match the current filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
