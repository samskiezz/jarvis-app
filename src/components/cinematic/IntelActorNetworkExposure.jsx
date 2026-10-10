/**
 * F149 — IntelProfile × Graph Community × Report × Ops Event
 *         Actor Network Exposure Quadrant (ANEQUAD)
 *
 * Parallel-fetches /entities/IntelProfile + /v1/graph/communities +
 *   /v1/reports + /v1/ops/events
 * Keyword-correlates each threat actor profile against graph communities
 *   AND reports AND ops events:
 *   FULLY_EXPOSED  — matched all three sources
 *   DUAL_EXPOSED   — matched any two sources
 *   SINGLE_LINKED  — matched exactly one source
 *   CONTAINED      — no matches (actor not surfaced in network)
 *
 * Stat tiles: INTEL PROFILES / COMMUNITIES / REPORTS / OPS EVENTS +
 *             all four class counts + EXPOSURE%.
 * Red pulse badge on FULLY_EXPOSED count.
 * Filter tabs ALL / FULLY_EXPOSED / DUAL_EXPOSED / SINGLE_LINKED / CONTAINED + text search.
 * Expand actor → matched community cards (purple) + report cards (cyan, type badge) +
 *                ops event cards (blue) with relevance bars.
 * ▶ ASSESS EXPOSURE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:anequad-toggle event.
 *
 * Voice triggers: "anequad / actor network / intel network exposure /
 *                  exposed actor / network exposure quadrant / actor graph report".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_026_360;
const Z_INDEX  = 211;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ANEQUAD_RE = /\b(anequad|actor[\s-]network|intel[\s-]network[\s-]exposure|exposed[\s-]actor|network[\s-]exposure[\s-]quadrant|actor[\s-]graph[\s-]report)\b/i;

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RE     = "#EF4444";
const PU     = "#A855F7";
const BL     = "#3B82F6";
const GR     = "#22C55E";
const OR     = "#F97316";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_EXPOSED:  RE,
  DUAL_EXPOSED:   OR,
  SINGLE_LINKED:  CY,
  CONTAINED:      "#4B5563",
};
const TABS = ["ALL","FULLY_EXPOSED","DUAL_EXPOSED","SINGLE_LINKED","CONTAINED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}

function actorText(a) {
  return [a.name,a.aliases,a.org,a.role,a.tags,a.description].filter(Boolean).join(" ");
}
function communityText(c) {
  return [c.name,c.label,c.description,c.id].filter(Boolean).join(" ");
}
function reportText(r) {
  return [r.title,r.description,r.type,r.tags,r.author].filter(Boolean).join(" ");
}
function eventText(e) {
  return [e.title,e.description,e.type,e.source,e.tags].filter(Boolean).join(" ");
}

function classify(actor, communities, reports, events) {
  const kws = keywords(actorText(actor));
  if (kws.length === 0) return { cls: "CONTAINED", matchedComms: [], matchedReports: [], matchedEvents: [] };

  const matchedComms   = communities.filter(c => score(communityText(c), kws) > 0);
  const matchedReports = reports.filter(r => score(reportText(r), kws) > 0);
  const matchedEvents  = events.filter(e => score(eventText(e), kws) > 0);

  const hits = (matchedComms.length > 0 ? 1 : 0) +
               (matchedReports.length > 0 ? 1 : 0) +
               (matchedEvents.length > 0 ? 1 : 0);

  const cls = hits >= 3 ? "FULLY_EXPOSED"
            : hits === 2 ? "DUAL_EXPOSED"
            : hits === 1 ? "SINGLE_LINKED"
            : "CONTAINED";

  return { cls, matchedComms, matchedReports, matchedEvents };
}

function RelevanceBar({ score: s, max, color }) {
  const pct = max > 0 ? Math.round((s / max) * 100) : 0;
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
    </div>
  );
}

export async function buildAnequadScript() {
  const base = apiBase();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [apR, cmR, rpR, evR] = await Promise.all([
    fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/graph/communities`,  { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/reports`,            { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/ops/events`,         { headers }).then(r => r.json()).catch(() => []),
  ]);
  const actors     = Array.isArray(apR) ? apR : (apR?.items ?? apR?.data ?? []);
  const communities= Array.isArray(cmR) ? cmR : (cmR?.items ?? cmR?.data ?? []);
  const reports    = Array.isArray(rpR) ? rpR : (rpR?.items ?? rpR?.data ?? []);
  const events     = Array.isArray(evR) ? evR : (evR?.items ?? evR?.data ?? []);

  const classified = actors.map(a => ({ ...a, ...classify(a, communities, reports, events) }));
  const exposed    = classified.filter(a => a.cls === "FULLY_EXPOSED").length;
  const dual       = classified.filter(a => a.cls === "DUAL_EXPOSED").length;
  const single     = classified.filter(a => a.cls === "SINGLE_LINKED").length;
  const contained  = classified.filter(a => a.cls === "CONTAINED").length;
  const pct        = actors.length > 0 ? Math.round(((exposed + dual) / actors.length) * 100) : 0;

  const ctx = `ANEQUAD snapshot: ${actors.length} intel profiles across ${communities.length} network communities, ${reports.length} intelligence reports, and ${events.length} ops events. ` +
              `Classification: FULLY_EXPOSED=${exposed}, DUAL_EXPOSED=${dual}, SINGLE_LINKED=${single}, CONTAINED=${contained}. Exposure index ${pct}%.`;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: `${ctx} In 2 sentences: identify highest-exposure actors and assess network threat surface.` }),
  });
  const j = await r.json();
  return j?.response || j?.message || "ANEQUAD Actor Network Exposure Quadrant online, sir. Cross-referencing intel actor profiles across graph communities, intelligence reports, and ops events to surface fully-exposed threat actors now.";
}

export function isAnequadQuery(q) {
  return ANEQUAD_RE.test(q);
}

export default function IntelActorNetworkExposure() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [actors,    setActors]    = useState([]);
  const [communities, setCommunities] = useState([]);
  const [reports,   setReports]   = useState([]);
  const [events,    setEvents]    = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [brief,     setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const base = apiBase();
      const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const [apR, cmR, rpR, evR] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/graph/communities`,  { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/reports`,            { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/ops/events`,         { headers: h }).then(r => r.json()).catch(() => []),
      ]);
      const a = Array.isArray(apR) ? apR : (apR?.items ?? apR?.data ?? []);
      const c = Array.isArray(cmR) ? cmR : (cmR?.items ?? cmR?.data ?? []);
      const rp = Array.isArray(rpR) ? rpR : (rpR?.items ?? rpR?.data ?? []);
      const ev = Array.isArray(evR) ? evR : (evR?.items ?? evR?.data ?? []);
      setActors(a); setCommunities(c); setReports(rp); setEvents(ev);
      setClassified(a.map(x => ({ ...x, ...classify(x, c, rp, ev) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:anequad-toggle", toggle);
    return () => window.removeEventListener("jarvis:anequad-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    try { setBrief(await buildAnequadScript()); } catch { setBrief("Unable to fetch ANEQUAD brief."); }
    setAssessing(false);
  };

  const counts = {
    FULLY_EXPOSED: classified.filter(a => a.cls === "FULLY_EXPOSED").length,
    DUAL_EXPOSED:  classified.filter(a => a.cls === "DUAL_EXPOSED").length,
    SINGLE_LINKED: classified.filter(a => a.cls === "SINGLE_LINKED").length,
    CONTAINED:     classified.filter(a => a.cls === "CONTAINED").length,
  };
  const exposurePct = classified.length > 0
    ? Math.round(((counts.FULLY_EXPOSED + counts.DUAL_EXPOSED) / classified.length) * 100)
    : 0;

  const visible = classified.filter(a => {
    if (tab !== "ALL" && a.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return actorText(a).toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(v => { if (!v) load(); return !v; }); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: counts.FULLY_EXPOSED > 0 ? "rgba(239,68,68,0.12)" : "rgba(6,11,22,0.85)",
          border: `1px solid ${counts.FULLY_EXPOSED > 0 ? RE : "rgba(0,207,255,0.3)"}`,
          color: counts.FULLY_EXPOSED > 0 ? RE : CY, fontFamily: FONT,
          fontSize: 9, padding: "3px 8px", borderRadius: 3, cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ ANEQUAD{counts.FULLY_EXPOSED > 0 && (
          <span style={{
            marginLeft: 4, background: RE, color: "#fff",
            borderRadius: "50%", padding: "0 4px", fontSize: 8,
            animation: "pulse 1.5s infinite",
          }}>{counts.FULLY_EXPOSED}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT - 400, zIndex: Z_INDEX + 1,
          width: 540, maxHeight: "75vh", overflowY: "auto",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 6, padding: 16, fontFamily: FONT,
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: CY, letterSpacing: 2, fontWeight: 700 }}>
                ◈ ANEQUAD
              </div>
              <div style={{ fontSize: 9, color: "#64748B", marginTop: 2 }}>
                Actor Network Exposure Quadrant
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#64748B",
              cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {[
              ["ACTORS",       classified.length,       CY],
              ["COMMUNITIES",  communities.length,      PU],
              ["REPORTS",      reports.length,          BL],
              ["OPS EVENTS",   events.length,           AM],
              ["FULLY EXP",    counts.FULLY_EXPOSED,    RE],
              ["DUAL EXP",     counts.DUAL_EXPOSED,     OR],
              ["SINGLE LNK",   counts.SINGLE_LINKED,    CY],
              ["CONTAINED",    counts.CONTAINED,        GR],
              ["EXPOSURE%",    `${exposurePct}%`,       exposurePct >= 60 ? RE : exposurePct >= 30 ? AM : GR],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`,
                borderRadius: 4, padding: "5px 10px", minWidth: 80, textAlign: "center",
              }}>
                <div style={{ fontSize: 8, color: "#64748B", letterSpacing: 1 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
              </div>
            ))}
            {counts.FULLY_EXPOSED > 0 && (
              <div style={{
                background: "rgba(239,68,68,0.08)", border: `1px solid ${RE}`,
                borderRadius: 4, padding: "5px 10px", textAlign: "center",
                animation: "pulse 1.5s infinite",
              }}>
                <div style={{ fontSize: 8, color: RE, letterSpacing: 1 }}>FULLY EXPOSED</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: RE }}>{counts.FULLY_EXPOSED}</div>
              </div>
            )}
          </div>

          {/* Exposure bar */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#64748B", marginBottom: 3 }}>
              <span>NETWORK EXPOSURE INDEX</span>
              <span style={{ color: exposurePct >= 60 ? RE : exposurePct >= 30 ? AM : GR }}>{exposurePct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
              <div style={{
                height: "100%", width: `${exposurePct}%`,
                background: exposurePct >= 60 ? RE : exposurePct >= 30 ? AM : GR,
                borderRadius: 2, transition: "width 0.4s",
              }} />
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? "rgba(0,207,255,0.12)" : "transparent",
                border: `1px solid ${tab === t ? CY : BORDER}`,
                color: tab === t ? CY : "#64748B", fontFamily: FONT,
                fontSize: 9, padding: "3px 8px", borderRadius: 3, cursor: "pointer",
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search actors…"
              style={{
                background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
                color: "#E2E8F0", fontFamily: FONT, fontSize: 10, padding: "3px 8px",
                borderRadius: 3, outline: "none", width: 160,
              }}
            />
          </div>

          {/* Assess button */}
          <button onClick={assess} disabled={assessing} style={{
            background: "rgba(0,207,255,0.08)", border: `1px solid ${CY}`,
            color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 14px",
            borderRadius: 3, cursor: "pointer", marginBottom: 14,
          }}>
            {assessing ? "◌ ASSESSING…" : "▶ ASSESS EXPOSURE"}
          </button>
          {brief && (
            <div style={{
              background: "rgba(0,207,255,0.06)", border: `1px solid ${BORDER}`,
              borderRadius: 4, padding: "8px 12px", fontSize: 11, color: "#CBD5E1",
              lineHeight: 1.6, marginBottom: 14,
            }}>{brief}</div>
          )}

          {loading && <div style={{ color: "#64748B", fontSize: 11, marginBottom: 10 }}>◌ loading…</div>}
          {error && <div style={{ color: RE, fontSize: 11, marginBottom: 10 }}>⚠ {error}</div>}

          {/* Rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {visible.map((actor, i) => {
              const isExp = expanded === i;
              const col = CLASS_COLOR[actor.cls];
              const kws = keywords(actorText(actor));
              const maxCommScore   = Math.max(1, ...actor.matchedComms.map(c => score(communityText(c), kws)));
              const maxReportScore = Math.max(1, ...actor.matchedReports.map(r => score(reportText(r), kws)));
              const maxEventScore  = Math.max(1, ...actor.matchedEvents.map(e => score(eventText(e), kws)));
              return (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.02)", border: `1px solid ${col}22`,
                  borderRadius: 4, padding: "8px 10px",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                  >
                    <div style={{
                      fontSize: 9, padding: "1px 6px", borderRadius: 2,
                      background: `${col}22`, color: col, fontWeight: 700,
                      minWidth: 100, textAlign: "center",
                    }}>{actor.cls}</div>
                    <div style={{ flex: 1, fontSize: 11, color: "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {actor.name || actor.title || actor.id || "—"}
                    </div>
                    {actor.role && (
                      <div style={{ fontSize: 9, color: "#64748B", padding: "1px 6px", border: `1px solid ${BORDER}`, borderRadius: 2 }}>
                        {actor.role}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "#64748B" }}>{isExp ? "▲" : "▼"}</div>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* Matched Communities */}
                      {actor.matchedComms.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: PU, letterSpacing: 1, marginBottom: 4 }}>
                            GRAPH COMMUNITIES ({actor.matchedComms.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {actor.matchedComms.slice(0, 5).map((c, ci) => {
                              const sc = score(communityText(c), kws);
                              return (
                                <div key={ci} style={{ background: "rgba(168,85,247,0.05)", border: `1px solid ${PU}22`, borderRadius: 3, padding: "4px 8px" }}>
                                  <div style={{ fontSize: 10, color: "#CBD5E1" }}>{c.name || c.label || c.id || "—"}</div>
                                  <RelevanceBar score={sc} max={maxCommScore} color={PU} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Matched Reports */}
                      {actor.matchedReports.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: BL, letterSpacing: 1, marginBottom: 4 }}>
                            REPORTS ({actor.matchedReports.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {actor.matchedReports.slice(0, 5).map((r, ri) => {
                              const sc = score(reportText(r), kws);
                              return (
                                <div key={ri} style={{ background: "rgba(59,130,246,0.05)", border: `1px solid ${BL}22`, borderRadius: 3, padding: "4px 8px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ fontSize: 10, color: "#CBD5E1" }}>{r.title || r.name || "—"}</div>
                                    {r.type && <div style={{ fontSize: 8, color: BL, padding: "1px 4px", border: `1px solid ${BL}44`, borderRadius: 2 }}>{r.type}</div>}
                                  </div>
                                  <RelevanceBar score={sc} max={maxReportScore} color={BL} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Matched Ops Events */}
                      {actor.matchedEvents.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: AM, letterSpacing: 1, marginBottom: 4 }}>
                            OPS EVENTS ({actor.matchedEvents.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {actor.matchedEvents.slice(0, 5).map((e, ei) => {
                              const sc = score(eventText(e), kws);
                              return (
                                <div key={ei} style={{ background: "rgba(245,158,11,0.05)", border: `1px solid ${AM}22`, borderRadius: 3, padding: "4px 8px" }}>
                                  <div style={{ fontSize: 10, color: "#CBD5E1" }}>{e.title || e.name || e.type || "—"}</div>
                                  <RelevanceBar score={sc} max={maxEventScore} color={AM} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {actor.matchedComms.length === 0 && actor.matchedReports.length === 0 && actor.matchedEvents.length === 0 && (
                        <div style={{ fontSize: 10, color: "#4B5563" }}>
                          No network exposure found across communities, reports, or ops events.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && !loading && (
              <div style={{ fontSize: 11, color: "#64748B", textAlign: "center", padding: "20px 0" }}>
                No actors match the current filter.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
