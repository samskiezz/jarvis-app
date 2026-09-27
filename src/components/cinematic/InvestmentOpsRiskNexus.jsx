/**
 * F150 — Investment × SwarmJob × Scenario × RiskSignal
 *         Financial Operations Risk Nexus (FORKN)
 *
 * Parallel-fetches /entities/Investment + /entities/SwarmJob +
 *   /v1/scenario/list + /entities/RiskSignal
 * Keyword-correlates each investment against swarm jobs AND scenarios AND
 *   risk signals to classify:
 *   FULLY_MANAGED  — matched all three (swarm + scenario + risk)
 *   DUAL_MANAGED   — matched any two sources
 *   SINGLE_LINKED  — matched exactly one source
 *   UNMANAGED      — no matches (portfolio blind spot)
 *
 * Stat tiles: INVESTMENTS / SWARM JOBS / SCENARIOS / RISK SIGNALS +
 *             all four class counts + MANAGED%.
 * Amber badge on UNMANAGED count.
 * Filter tabs ALL / FULLY_MANAGED / DUAL_MANAGED / SINGLE_LINKED / UNMANAGED + text search.
 * Expand investment → matched swarm job cards (cyan, status badge) +
 *                     matched scenario cards (green) +
 *                     matched risk signal cards (red, severity badge) with relevance bars.
 * ▶ ASSESS RISK NEXUS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:forkn-toggle event.
 *
 * Voice triggers: "forkn / investment risk nexus / financial operations /
 *                  unmanaged investment / investment risk ops / portfolio risk nexus".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_026_920;
const Z_INDEX  = 212;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const FORKN_RE = /\b(forkn|investment[\s-]risk[\s-]nexus|financial[\s-]operations|unmanaged[\s-]investment|investment[\s-]risk[\s-]ops|portfolio[\s-]risk[\s-]nexus)\b/i;

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RE     = "#EF4444";
const GR     = "#22C55E";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_MANAGED: GR,
  DUAL_MANAGED:  CY,
  SINGLE_LINKED: AM,
  UNMANAGED:     "#EF4444",
};
const TABS = ["ALL","FULLY_MANAGED","DUAL_MANAGED","SINGLE_LINKED","UNMANAGED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}

function investText(inv) {
  return [inv.name,inv.type,inv.sector,inv.description,inv.tags,inv.ticker].filter(Boolean).join(" ");
}
function swarmText(j) {
  return [j.name,j.description,j.type,j.status,j.tags].filter(Boolean).join(" ");
}
function scenarioText(sc) {
  return [sc.name,sc.title,sc.description,sc.tags,sc.type].filter(Boolean).join(" ");
}
function signalText(sig) {
  return [sig.title,sig.description,sig.category,sig.tags,sig.source].filter(Boolean).join(" ");
}

function classify(inv, swarmJobs, scenarios, signals) {
  const kws = keywords(investText(inv));
  if (kws.length === 0) return { cls: "UNMANAGED", matchedJobs: [], matchedScenarios: [], matchedSignals: [] };

  const matchedJobs      = swarmJobs.filter(j  => score(swarmText(j), kws) > 0);
  const matchedScenarios = scenarios.filter(sc => score(scenarioText(sc), kws) > 0);
  const matchedSignals   = signals.filter(sig  => score(signalText(sig), kws) > 0);

  const hits = (matchedJobs.length > 0 ? 1 : 0) +
               (matchedScenarios.length > 0 ? 1 : 0) +
               (matchedSignals.length > 0 ? 1 : 0);

  const cls = hits >= 3 ? "FULLY_MANAGED"
            : hits === 2 ? "DUAL_MANAGED"
            : hits === 1 ? "SINGLE_LINKED"
            : "UNMANAGED";

  return { cls, matchedJobs, matchedScenarios, matchedSignals };
}

function RelevanceBar({ score: s, max, color }) {
  const pct = max > 0 ? Math.round((s / max) * 100) : 0;
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
    </div>
  );
}

export async function buildForknScript() {
  const base = apiBase();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [invR, jbR, scR, sigR] = await Promise.all([
    fetch(`${base}/entities/Investment`,  { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/SwarmJob`,    { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/scenario/list`,     { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/RiskSignal`,  { headers }).then(r => r.json()).catch(() => []),
  ]);
  const investments = Array.isArray(invR) ? invR : (invR?.items ?? invR?.data ?? []);
  const swarmJobs   = Array.isArray(jbR)  ? jbR  : (jbR?.items  ?? jbR?.data  ?? []);
  const scenarios   = Array.isArray(scR)  ? scR  : (scR?.items  ?? scR?.data  ?? []);
  const signals     = Array.isArray(sigR) ? sigR : (sigR?.items ?? sigR?.data ?? []);

  const classified  = investments.map(inv => ({ ...inv, ...classify(inv, swarmJobs, scenarios, signals) }));
  const fully       = classified.filter(i => i.cls === "FULLY_MANAGED").length;
  const dual        = classified.filter(i => i.cls === "DUAL_MANAGED").length;
  const single      = classified.filter(i => i.cls === "SINGLE_LINKED").length;
  const unmanaged   = classified.filter(i => i.cls === "UNMANAGED").length;
  const managedPct  = investments.length > 0 ? Math.round(((fully + dual) / investments.length) * 100) : 0;

  const ctx = `FORKN snapshot: ${investments.length} investments correlated against ${swarmJobs.length} swarm jobs, ${scenarios.length} scenarios, and ${signals.length} risk signals. ` +
              `Classification: FULLY_MANAGED=${fully}, DUAL_MANAGED=${dual}, SINGLE_LINKED=${single}, UNMANAGED=${unmanaged}. Managed coverage ${managedPct}%.`;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: `${ctx} In 2 sentences: identify highest-risk unmanaged assets and assess portfolio operational risk exposure.` }),
  });
  const j = await r.json();
  return j?.response || j?.message || "FORKN Financial Operations Risk Nexus online, sir. Correlating investments against swarm automation, scenario playbooks, and active risk signals to surface portfolio blind spots now.";
}

export function isForknQuery(q) {
  return FORKN_RE.test(q);
}

export default function InvestmentOpsRiskNexus() {
  const [open,        setOpen]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [investments, setInvestments] = useState([]);
  const [swarmJobs,   setSwarmJobs]   = useState([]);
  const [scenarios,   setScenarios]   = useState([]);
  const [signals,     setSignals]     = useState([]);
  const [classified,  setClassified]  = useState([]);
  const [tab,         setTab]         = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [brief,       setBrief]       = useState("");
  const [assessing,   setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const base = apiBase();
      const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const [invR, jbR, scR, sigR] = await Promise.all([
        fetch(`${base}/entities/Investment`,  { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/SwarmJob`,    { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/scenario/list`,     { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/RiskSignal`,  { headers: h }).then(r => r.json()).catch(() => []),
      ]);
      const inv  = Array.isArray(invR) ? invR : (invR?.items ?? invR?.data ?? []);
      const jobs = Array.isArray(jbR)  ? jbR  : (jbR?.items  ?? jbR?.data  ?? []);
      const sc   = Array.isArray(scR)  ? scR  : (scR?.items  ?? scR?.data  ?? []);
      const sig  = Array.isArray(sigR) ? sigR : (sigR?.items ?? sigR?.data ?? []);
      setInvestments(inv); setSwarmJobs(jobs); setScenarios(sc); setSignals(sig);
      setClassified(inv.map(x => ({ ...x, ...classify(x, jobs, sc, sig) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:forkn-toggle", toggle);
    return () => window.removeEventListener("jarvis:forkn-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    try { setBrief(await buildForknScript()); } catch { setBrief("Unable to fetch FORKN brief."); }
    setAssessing(false);
  };

  const counts = {
    FULLY_MANAGED: classified.filter(i => i.cls === "FULLY_MANAGED").length,
    DUAL_MANAGED:  classified.filter(i => i.cls === "DUAL_MANAGED").length,
    SINGLE_LINKED: classified.filter(i => i.cls === "SINGLE_LINKED").length,
    UNMANAGED:     classified.filter(i => i.cls === "UNMANAGED").length,
  };
  const managedPct = classified.length > 0
    ? Math.round(((counts.FULLY_MANAGED + counts.DUAL_MANAGED) / classified.length) * 100)
    : 0;

  const visible = classified.filter(inv => {
    if (tab !== "ALL" && inv.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return investText(inv).toLowerCase().includes(q);
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
          background: counts.UNMANAGED > 0 ? "rgba(245,158,11,0.12)" : "rgba(6,11,22,0.85)",
          border: `1px solid ${counts.UNMANAGED > 0 ? AM : "rgba(0,207,255,0.3)"}`,
          color: counts.UNMANAGED > 0 ? AM : CY, fontFamily: FONT,
          fontSize: 9, padding: "3px 8px", borderRadius: 3, cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ FORKN{counts.UNMANAGED > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#000",
            borderRadius: "50%", padding: "0 4px", fontSize: 8,
          }}>{counts.UNMANAGED}</span>
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
                ◈ FORKN
              </div>
              <div style={{ fontSize: 9, color: "#64748B", marginTop: 2 }}>
                Financial Operations Risk Nexus
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
              ["INVESTMENTS",  classified.length,       CY],
              ["SWARM JOBS",   swarmJobs.length,        "#00BFFF"],
              ["SCENARIOS",    scenarios.length,        GR],
              ["RISK SIGNALS", signals.length,          RE],
              ["FULLY MGMT",   counts.FULLY_MANAGED,   GR],
              ["DUAL MGMT",    counts.DUAL_MANAGED,    CY],
              ["SINGLE LNK",   counts.SINGLE_LINKED,   AM],
              ["UNMANAGED",    counts.UNMANAGED,        RE],
              ["MANAGED%",     `${managedPct}%`,        managedPct >= 70 ? GR : managedPct >= 40 ? AM : RE],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`,
                borderRadius: 4, padding: "5px 10px", minWidth: 80, textAlign: "center",
              }}>
                <div style={{ fontSize: 8, color: "#64748B", letterSpacing: 1 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Managed coverage bar */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#64748B", marginBottom: 3 }}>
              <span>PORTFOLIO OPERATIONAL COVERAGE</span>
              <span style={{ color: managedPct >= 70 ? GR : managedPct >= 40 ? AM : RE }}>{managedPct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
              <div style={{
                height: "100%", width: `${managedPct}%`,
                background: managedPct >= 70 ? GR : managedPct >= 40 ? AM : RE,
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
              placeholder="search investments…"
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
            {assessing ? "◌ ASSESSING…" : "▶ ASSESS RISK NEXUS"}
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
            {visible.map((inv, i) => {
              const isExp = expanded === i;
              const col = CLASS_COLOR[inv.cls];
              const kws = keywords(investText(inv));
              const maxJobScore = Math.max(1, ...inv.matchedJobs.map(j => score(swarmText(j), kws)));
              const maxScScore  = Math.max(1, ...inv.matchedScenarios.map(sc => score(scenarioText(sc), kws)));
              const maxSigScore = Math.max(1, ...inv.matchedSignals.map(sig => score(signalText(sig), kws)));
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
                      minWidth: 110, textAlign: "center",
                    }}>{inv.cls}</div>
                    <div style={{ flex: 1, fontSize: 11, color: "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {inv.name || inv.ticker || inv.id || "—"}
                    </div>
                    {inv.type && (
                      <div style={{ fontSize: 9, color: "#64748B", padding: "1px 6px", border: `1px solid ${BORDER}`, borderRadius: 2 }}>
                        {inv.type}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "#64748B" }}>{isExp ? "▲" : "▼"}</div>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* Matched Swarm Jobs */}
                      {inv.matchedJobs.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>
                            SWARM JOBS ({inv.matchedJobs.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {inv.matchedJobs.slice(0, 5).map((j, ji) => {
                              const sc = score(swarmText(j), kws);
                              return (
                                <div key={ji} style={{ background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}22`, borderRadius: 3, padding: "4px 8px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ fontSize: 10, color: "#CBD5E1" }}>{j.name || j.id || "—"}</div>
                                    {j.status && <div style={{ fontSize: 8, color: CY, padding: "1px 4px", border: `1px solid ${CY}44`, borderRadius: 2 }}>{j.status}</div>}
                                  </div>
                                  <RelevanceBar score={sc} max={maxJobScore} color={CY} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Matched Scenarios */}
                      {inv.matchedScenarios.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: GR, letterSpacing: 1, marginBottom: 4 }}>
                            SCENARIOS ({inv.matchedScenarios.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {inv.matchedScenarios.slice(0, 5).map((sc, sci) => {
                              const s = score(scenarioText(sc), kws);
                              return (
                                <div key={sci} style={{ background: "rgba(34,197,94,0.05)", border: `1px solid ${GR}22`, borderRadius: 3, padding: "4px 8px" }}>
                                  <div style={{ fontSize: 10, color: "#CBD5E1" }}>{sc.name || sc.title || sc.id || "—"}</div>
                                  <RelevanceBar score={s} max={maxScScore} color={GR} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Matched Risk Signals */}
                      {inv.matchedSignals.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: RE, letterSpacing: 1, marginBottom: 4 }}>
                            RISK SIGNALS ({inv.matchedSignals.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {inv.matchedSignals.slice(0, 5).map((sig, sigi) => {
                              const s = score(signalText(sig), kws);
                              return (
                                <div key={sigi} style={{ background: "rgba(239,68,68,0.05)", border: `1px solid ${RE}22`, borderRadius: 3, padding: "4px 8px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ fontSize: 10, color: "#CBD5E1" }}>{sig.title || sig.name || "—"}</div>
                                    {sig.severity && <div style={{ fontSize: 8, color: RE, padding: "1px 4px", border: `1px solid ${RE}44`, borderRadius: 2 }}>{sig.severity}</div>}
                                  </div>
                                  <RelevanceBar score={s} max={maxSigScore} color={RE} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {inv.matchedJobs.length === 0 && inv.matchedScenarios.length === 0 && inv.matchedSignals.length === 0 && (
                        <div style={{ fontSize: 10, color: "#4B5563" }}>
                          No automation, scenario playbooks, or risk signals found for this investment.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && !loading && (
              <div style={{ fontSize: 11, color: "#64748B", textAlign: "center", padding: "20px 0" }}>
                No investments match the current filter.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
