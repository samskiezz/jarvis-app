/**
 * F139 — Scenario × RiskSignal × SwarmJob × IntelProfile Threat Containment Index (STCIX)
 *
 * Parallel-fetches /v1/scenario/list + /entities/RiskSignal +
 *                  /entities/SwarmJob + /entities/IntelProfile
 * Keyword-correlates each scenario against risk signals, swarm jobs, and intel profiles:
 *   FULLY_CONTAINED   — matched all three sources
 *   DUAL_COVERED      — matched any two sources
 *   PARTIALLY_COVERED — matched exactly one source
 *   UNCONTAINED       — no matches (containment gap)
 *
 * Stat tiles: SCENARIOS / RISK SIGS / SWARM JOBS / INTEL PROFILES + all four class counts + COVERAGE%.
 * Red pulse badge on uncontained count.
 * Filter tabs ALL / FULLY_CONTAINED / DUAL_COVERED / PARTIALLY_COVERED / UNCONTAINED + text search.
 * Expand scenario → matched risk signal cards (red) + swarm job cards (cyan) +
 *                    intel profile cards (orange) with relevance bars.
 * ▶ ASSESS CONTAINMENT → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:stcix-toggle event.
 *
 * Voice triggers: "stcix / threat containment / scenario containment /
 *                  uncontained scenario / risk containment / containment index".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_020_760;
const Z_INDEX  = 201;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const STCIX_RE = /\b(stcix|threat[\s-]containment|scenario[\s-]containment|uncontained[\s-]scenario|risk[\s-]containment|containment[\s-]index)\b/i;

const CY     = "#00CFFF";
const OR     = "#F97316";
const AM     = "#F59E0B";
const RE     = "#EF4444";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_CONTAINED:   "#22C55E",
  DUAL_COVERED:      CY,
  PARTIALLY_COVERED: OR,
  UNCONTAINED:       RE,
};
const TABS = ["ALL", "FULLY_CONTAINED", "DUAL_COVERED", "PARTIALLY_COVERED", "UNCONTAINED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function scText(sc) { return `${sc.name || ""} ${sc.description || ""}`.toLowerCase(); }
function rsText(r)  { return `${r.title || r.name || ""} ${r.description || ""}`.toLowerCase(); }
function sjText(j)  { return `${j.name || j.title || ""} ${j.description || ""} ${j.type || ""} ${j.status || ""}`.toLowerCase(); }
function ipText(p)  { return `${p.name || ""} ${(p.aliases || []).join(" ")} ${p.org || ""} ${p.role || ""} ${(p.tags || []).join(" ")}`.toLowerCase(); }

async function loadAll() {
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [scRes, rsRes, sjRes, ipRes] = await Promise.all([
    fetch(`${apiBase}/v1/scenario/list`, { headers }),
    fetch(`${apiBase}/entities/RiskSignal`, { headers }),
    fetch(`${apiBase}/entities/SwarmJob`, { headers }),
    fetch(`${apiBase}/entities/IntelProfile`, { headers }),
  ]);
  const scJson = await scRes.json().catch(() => ({}));
  const rsJson = await rsRes.json().catch(() => ({}));
  const sjJson = await sjRes.json().catch(() => ({}));
  const ipJson = await ipRes.json().catch(() => ({}));
  const scenarios    = (Array.isArray(scJson) ? scJson : scJson.scenarios || scJson.data || scJson.items || []);
  const riskSignals  = (Array.isArray(rsJson) ? rsJson : rsJson.data || rsJson.items || []);
  const swarmJobs    = (Array.isArray(sjJson) ? sjJson : sjJson.data || sjJson.items || []);
  const intelProfiles= (Array.isArray(ipJson) ? ipJson : ipJson.data || ipJson.items || []);
  return { scenarios, riskSignals, swarmJobs, intelProfiles };
}

function correlate({ scenarios, riskSignals, swarmJobs, intelProfiles }) {
  return scenarios.map(sc => {
    const kws  = keywords(scText(sc));
    const matchedRisks  = riskSignals.filter(r  => score(rsText(r),  kws) > 0);
    const matchedSwarms = swarmJobs.filter(j    => score(sjText(j),  kws) > 0);
    const matchedActors = intelProfiles.filter(p => score(ipText(p), kws) > 0);
    const matched = (matchedRisks.length > 0 ? 1 : 0)
                  + (matchedSwarms.length > 0 ? 1 : 0)
                  + (matchedActors.length > 0 ? 1 : 0);
    const cls = matched === 3 ? "FULLY_CONTAINED"
              : matched === 2 ? "DUAL_COVERED"
              : matched === 1 ? "PARTIALLY_COVERED"
              : "UNCONTAINED";
    return { ...sc, cls, matchedRisks, matchedSwarms, matchedActors };
  });
}

function StatTile({ label, value, color }) {
  return (
    <div style={{ flex: "1 1 80px", background: "rgba(0,207,255,0.05)", border: `1px solid ${BORDER}`,
      borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || CY }}>{value}</div>
      <div style={{ fontSize: 9, color: "#5A7A9A", letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function RelevanceBar({ score: s, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((s / max) * 100)) : 0;
  return (
    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginTop: 3 }}>
      <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: color || CY, transition: "width 0.4s" }} />
    </div>
  );
}

export async function buildStcixScript() {
  const { scenarios, riskSignals, swarmJobs, intelProfiles } = await loadAll();
  const rows = correlate({ scenarios, riskSignals, swarmJobs, intelProfiles });
  const uncontained = rows.filter(r => r.cls === "UNCONTAINED").length;
  const fully = rows.filter(r => r.cls === "FULLY_CONTAINED").length;
  const ctx = `Scenarios: ${scenarios.length}. Risk signals: ${riskSignals.length}. Swarm jobs: ${swarmJobs.length}. Intel profiles: ${intelProfiles.length}. Fully contained: ${fully}. Uncontained: ${uncontained}.`;
  const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
    body: JSON.stringify({ message: `Threat Containment Index: ${ctx}. Write exactly 2 sentences assessing containment coverage and priority gaps.` }),
  });
  const j = await res.json().catch(() => ({}));
  return j.response || j.message || j.content || `STCIX online, sir. ${uncontained} scenarios lack full threat containment coverage — risk signals, swarm, and intel profiles assessed.`;
}

export function isStcixQuery(q) { return STCIX_RE.test(q); }

export default function ScenarioRiskSwarmContainment() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [counts, setCounts]     = useState({ sc: 0, rs: 0, sj: 0, ip: 0 });
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const [error, setError]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const { scenarios, riskSignals, swarmJobs, intelProfiles } = await loadAll();
      setCounts({ sc: scenarios.length, rs: riskSignals.length, sj: swarmJobs.length, ip: intelProfiles.length });
      setRows(correlate({ scenarios, riskSignals, swarmJobs, intelProfiles }));
    } catch (e) {
      setError("Load failed: " + (e.message || String(e)));
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:stcix-toggle", onToggle);
    return () => window.removeEventListener("jarvis:stcix-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try { setBrief(await buildStcixScript()); } catch { setBrief("STCIX assessment complete, sir."); }
    setAssessing(false);
  }, []);

  const classified = rows.filter(r => (tab === "ALL" || r.cls === tab)
    && (!search || (r.name || "").toLowerCase().includes(search.toLowerCase())
                || (r.description || "").toLowerCase().includes(search.toLowerCase())));

  const fully     = rows.filter(r => r.cls === "FULLY_CONTAINED").length;
  const dual      = rows.filter(r => r.cls === "DUAL_COVERED").length;
  const partial   = rows.filter(r => r.cls === "PARTIALLY_COVERED").length;
  const uncontained = rows.filter(r => r.cls === "UNCONTAINED").length;
  const coverage  = rows.length > 0 ? Math.round(((fully + dual * 0.5) / rows.length) * 100) : 0;

  const maxRs = Math.max(1, ...rows.map(r => r.matchedRisks?.length || 0));
  const maxSj = Math.max(1, ...rows.map(r => r.matchedSwarms?.length || 0));
  const maxIp = Math.max(1, ...rows.map(r => r.matchedActors?.length || 0));

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.90)", border: `1px solid ${uncontained > 0 ? RE : CY}66`,
          color: uncontained > 0 ? RE : CY, fontFamily: FONT, fontSize: 9, letterSpacing: 1.5,
          padding: "4px 8px", borderRadius: 5, cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: uncontained > 0 ? `0 0 10px ${RE}44` : "none" }}
        title="Scenario × RiskSignal × SwarmJob × IntelProfile Threat Containment Index"
      >
        {uncontained > 0 && (
          <span style={{ background: RE, color: "#fff", borderRadius: "50%", padding: "0 4px",
            marginRight: 4, fontSize: 8, animation: "stcixPulse 1s ease-in-out infinite" }}>
            {uncontained}
          </span>
        )}
        ◈ STCIX
      </button>

      {open && (
        <div style={{ position: "fixed", left: 40, top: 40, width: "min(720px,92vw)", maxHeight: "86vh",
          overflowY: "auto", background: BG, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: "16px 18px", zIndex: Z_INDEX + 1, fontFamily: FONT, color: "#DCEBF5",
          boxShadow: `0 0 40px ${CY}18` }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: CY, fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
              ◈ STCIX — THREAT CONTAINMENT INDEX
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none",
              color: "#5A7A9A", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>

          {error && <div style={{ color: RE, fontSize: 11, marginBottom: 8 }}>{error}</div>}

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <StatTile label="SCENARIOS"    value={counts.sc} />
            <StatTile label="RISK SIGS"    value={counts.rs} color={RE} />
            <StatTile label="SWARM JOBS"   value={counts.sj} color={CY} />
            <StatTile label="INTEL PROF"   value={counts.ip} color={OR} />
            <StatTile label="FULLY CONT."  value={fully}     color="#22C55E" />
            <StatTile label="DUAL COVED"   value={dual}      color={CY} />
            <StatTile label="PARTIAL"      value={partial}   color={OR} />
            <StatTile label="UNCONTAINED"  value={uncontained} color={RE} />
            <StatTile label="COVERAGE%"    value={`${coverage}%`} color={coverage >= 70 ? "#22C55E" : coverage >= 40 ? AM : RE} />
          </div>

          {/* Coverage bar */}
          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.07)", marginBottom: 12 }}>
            <div style={{ height: "100%", borderRadius: 3, width: `${coverage}%`,
              background: coverage >= 70 ? "#22C55E" : coverage >= 40 ? AM : RE, transition: "width 0.5s" }} />
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                  background: tab === t ? CLASS_COLOR[t] || CY : "rgba(0,207,255,0.07)",
                  color: tab === t ? "#04060A" : "#8AAEC8",
                  border: `1px solid ${tab === t ? CLASS_COLOR[t] || CY : BORDER}` }}>
                {t.replace(/_/g, " ")}
              </button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search scenarios…"
              style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 4,
                background: "rgba(0,207,255,0.06)", border: `1px solid ${BORDER}`,
                color: "#DCEBF5", outline: "none", width: 160 }}
            />
          </div>

          {/* Row list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {classified.slice(0, 80).map((sc, i) => (
              <div key={sc.id || sc.name || i}
                style={{ border: `1px solid ${CLASS_COLOR[sc.cls]}33`, borderRadius: 7,
                  background: "rgba(0,207,255,0.03)", padding: "7px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                  onClick={() => setExpanded(expanded === i ? null : i)}>
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3,
                    background: `${CLASS_COLOR[sc.cls]}22`, color: CLASS_COLOR[sc.cls],
                    border: `1px solid ${CLASS_COLOR[sc.cls]}55`, whiteSpace: "nowrap" }}>
                    {sc.cls.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 11, flex: 1 }}>{sc.name || sc.id || "Unnamed"}</span>
                  <span style={{ fontSize: 9, color: "#5A7A9A" }}>
                    R:{sc.matchedRisks.length} S:{sc.matchedSwarms.length} I:{sc.matchedActors.length}
                  </span>
                  <span style={{ fontSize: 10, color: "#5A7A9A" }}>{expanded === i ? "▲" : "▼"}</span>
                </div>

                {expanded === i && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {sc.matchedRisks.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: RE, marginBottom: 3, letterSpacing: 1 }}>
                          RISK SIGNALS ({sc.matchedRisks.length})
                        </div>
                        {sc.matchedRisks.slice(0, 5).map((r, ri) => (
                          <div key={r.id || ri} style={{ background: `${RE}11`, border: `1px solid ${RE}33`,
                            borderRadius: 5, padding: "4px 7px", marginBottom: 3 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 10 }}>{r.title || r.name || r.id || "Unknown"}</span>
                              {r.severity && (
                                <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3,
                                  background: r.severity === "CRITICAL" ? RE : r.severity === "HIGH" ? OR : AM,
                                  color: "#04060A" }}>{r.severity}</span>
                              )}
                            </div>
                            <RelevanceBar score={score(rsText(r), keywords(scText(sc)))} max={maxRs} color={RE} />
                          </div>
                        ))}
                      </div>
                    )}

                    {sc.matchedSwarms.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: CY, marginBottom: 3, letterSpacing: 1 }}>
                          SWARM JOBS ({sc.matchedSwarms.length})
                        </div>
                        {sc.matchedSwarms.slice(0, 5).map((j, ji) => (
                          <div key={j.id || ji} style={{ background: `${CY}11`, border: `1px solid ${CY}33`,
                            borderRadius: 5, padding: "4px 7px", marginBottom: 3 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 10 }}>{j.name || j.title || j.id || "Unknown"}</span>
                              {j.status && (
                                <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3,
                                  background: `${CY}22`, color: CY, border: `1px solid ${CY}44` }}>
                                  {j.status}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={score(sjText(j), keywords(scText(sc)))} max={maxSj} color={CY} />
                          </div>
                        ))}
                      </div>
                    )}

                    {sc.matchedActors.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: OR, marginBottom: 3, letterSpacing: 1 }}>
                          INTEL PROFILES ({sc.matchedActors.length})
                        </div>
                        {sc.matchedActors.slice(0, 5).map((p, pi) => (
                          <div key={p.id || pi} style={{ background: `${OR}11`, border: `1px solid ${OR}33`,
                            borderRadius: 5, padding: "4px 7px", marginBottom: 3 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 10 }}>{p.name || p.id || "Unknown"}</span>
                              {p.role && (
                                <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3,
                                  background: `${OR}22`, color: OR, border: `1px solid ${OR}44` }}>
                                  {p.role}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={score(ipText(p), keywords(scText(sc)))} max={maxIp} color={OR} />
                          </div>
                        ))}
                      </div>
                    )}

                    {sc.matchedRisks.length === 0 && sc.matchedSwarms.length === 0 && sc.matchedActors.length === 0 && (
                      <div style={{ fontSize: 10, color: "#5A7A9A", fontStyle: "italic" }}>
                        No cross-references found — scenario is uncontained.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {classified.length === 0 && !error && (
            <div style={{ color: "#5A7A9A", fontSize: 11, textAlign: "center", padding: 20 }}>
              Loading containment data…
            </div>
          )}

          {/* Assess button + brief */}
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={assess} disabled={assessing}
              style={{ fontSize: 10, padding: "4px 12px", borderRadius: 5, cursor: "pointer",
                background: assessing ? "rgba(0,207,255,0.1)" : `${CY}22`,
                color: CY, border: `1px solid ${CY}55` }}>
              {assessing ? "Assessing…" : "▶ ASSESS CONTAINMENT"}
            </button>
            <button onClick={load} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 5,
              cursor: "pointer", background: "rgba(0,207,255,0.05)",
              color: "#5A7A9A", border: `1px solid ${BORDER}` }}>↺</button>
          </div>
          {brief && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
              background: `${CY}09`, border: `1px solid ${CY}22`, borderRadius: 6,
              padding: "8px 10px" }}>{brief}</div>
          )}
        </div>
      )}

      <style>{`
        @keyframes stcixPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.6; transform:scale(1.25); }
        }
      `}</style>
    </>
  );
}
