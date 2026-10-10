/**
 * F123 — Graph Community × IntelProfile × Scenario Threat Cluster Map (IPTCMAP)
 *
 * Parallel-fetches:
 *   /v1/graph/communities   → graph community clusters
 *   /entities/IntelProfile  → known threat actor profiles
 *   /v1/scenario/list       → available scenario playbooks
 *
 * Keyword-correlates each graph community against intel actor profiles AND
 * scenario playbooks to classify:
 *   THREAT_CLUSTER  — matched both (community embedded with known actors + scenario cover)
 *   INTEL_EXPOSED   — matched intel actor profiles only (no playbook response)
 *   SCENARIO_COVERED — matched scenario only (actors not yet profiled)
 *   NEUTRAL         — no matches (dormant cluster)
 *
 * Red badge on THREAT_CLUSTER count.
 * ▶ ASSESS CLUSTERS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:iptcmap-toggle event.
 * Voice: "iptcmap / threat cluster / intel cluster / community threat /
 *         graph community scenario / threat community map".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_011_800;
const Z_INDEX  = 185;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const IPTCMAP_RE =
  /\b(iptcmap|threat[\s-]cluster|intel[\s-]cluster|community[\s-]threat|graph[\s-]community[\s-]scenario|threat[\s-]community[\s-]map|community[\s-]intel[\s-]scenario)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const OR     = "#F97316";
const GR     = "#22C55E";
const RD     = "#EF4444";
const AM     = "#F59E0B";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isIptcmapQuery(text) {
  return IPTCMAP_RE.test(text || "");
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

function communityText(c) {
  return [c.name, c.label, c.description, c.id,
          ...(Array.isArray(c.members) ? c.members.map(m => m?.name || m?.id || String(m)) : []),
          ...(Array.isArray(c.nodes) ? c.nodes.map(n => n?.name || n?.label || String(n)) : []),
          ...(Array.isArray(c.tags) ? c.tags : []),
  ].filter(Boolean).join(" ");
}

function profileText(p) {
  return [p.name, p.aliases, p.org, p.role, p.description,
          ...(Array.isArray(p.tags) ? p.tags : []),
  ].filter(Boolean).join(" ");
}

function scenarioText(s) {
  return [s.name, s.title, s.description, s.type, s.category,
          ...(Array.isArray(s.tags) ? s.tags : []),
  ].filter(Boolean).join(" ");
}

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
    const vals = Object.values(raw);
    if (vals.every(v => Array.isArray(v))) return vals.flat();
  }
  return [];
}

function classifyCluster(community, profiles, scenarios, threshold = 1) {
  const ct = communityText(community);
  const matchedProfiles  = profiles.filter(p => overlap(ct, profileText(p))  >= threshold);
  const matchedScenarios = scenarios.filter(s => overlap(ct, scenarioText(s)) >= threshold);
  const hasIntel    = matchedProfiles.length  > 0;
  const hasScenario = matchedScenarios.length > 0;
  let status;
  if (hasIntel && hasScenario)  status = "THREAT_CLUSTER";
  else if (hasIntel)            status = "INTEL_EXPOSED";
  else if (hasScenario)         status = "SCENARIO_COVERED";
  else                          status = "NEUTRAL";
  return { ...community, status, matchedProfiles, matchedScenarios };
}

function statusColor(s) {
  if (s === "THREAT_CLUSTER")  return RD;
  if (s === "INTEL_EXPOSED")   return OR;
  if (s === "SCENARIO_COVERED") return GR;
  return "#4E6A7A";
}

function relevanceBar(score, max, color) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#0D1F2D", borderRadius: 2, margin: "3px 0", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width .4s" }} />
    </div>
  );
}

// ── async script builder for JarvisBrain ─────────────────────────────────────
export async function buildIptcmapScript() {
  const base    = apiBase();
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [commR, profR, scenR] = await Promise.allSettled([
    fetch(`${base}/v1/graph/communities`, { headers }).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`,     { headers }).then(r => r.json()),
  ]);

  const communities = norm(commR.status === "fulfilled" ? commR.value : [],
    ["communities", "clusters", "data", "results", "items"]);
  const profiles = norm(profR.status === "fulfilled" ? profR.value : [],
    ["profiles", "data", "results", "items"]);
  const scenarios = norm(scenR.status === "fulfilled" ? scenR.value : [],
    ["scenarios", "data", "results", "items"]);

  if (!communities.length) {
    return "Graph Community Intel Scenario Threat Cluster Map online, sir. No graph communities returned — " +
      "check the /v1/graph/communities endpoint or wait for the brain to index community clusters.";
  }

  const classified = communities.map(c => classifyCluster(c, profiles, scenarios));
  const tCount  = classified.filter(c => c.status === "THREAT_CLUSTER").length;
  const ieCount = classified.filter(c => c.status === "INTEL_EXPOSED").length;
  const scCount = classified.filter(c => c.status === "SCENARIO_COVERED").length;
  const nCount  = classified.filter(c => c.status === "NEUTRAL").length;

  return `IPTCMAP online — ${communities.length} graph communities cross-referenced against ` +
    `${profiles.length} intel actor profiles and ${scenarios.length} scenario playbooks. ` +
    `${tCount} THREAT CLUSTER${tCount !== 1 ? "S" : ""} identified (matched both actors and scenarios), ` +
    `${ieCount} INTEL EXPOSED (no playbook response), ` +
    `${scCount} SCENARIO COVERED (scenario present, actors not profiled), ` +
    `${nCount} NEUTRAL (dormant). ` +
    (tCount > 0
      ? `Priority: address the ${tCount} threat cluster${tCount !== 1 ? "s" : ""} first, sir.`
      : "No active threat clusters detected.");
}

// ── component ─────────────────────────────────────────────────────────────────
const TABS = ["ALL", "THREAT_CLUSTER", "INTEL_EXPOSED", "SCENARIO_COVERED", "NEUTRAL"];

export default function GraphCommunityIntelScenarioMap() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [totals,    setTotals]    = useState({ communities: 0, profiles: 0, scenarios: 0 });
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base    = apiBase();
    const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
    const [commR, profR, scenR] = await Promise.allSettled([
      fetch(`${base}/v1/graph/communities`, { headers }).then(r => r.json()),
      fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()),
      fetch(`${base}/v1/scenario/list`,     { headers }).then(r => r.json()),
    ]);

    const communities = norm(commR.status === "fulfilled" ? commR.value : [],
      ["communities", "clusters", "data", "results", "items"]);
    const profiles = norm(profR.status === "fulfilled" ? profR.value : [],
      ["profiles", "data", "results", "items"]);
    const scenarios = norm(scenR.status === "fulfilled" ? scenR.value : [],
      ["scenarios", "data", "results", "items"]);

    const classified = communities.map(c => classifyCluster(c, profiles, scenarios));
    setRows(classified);
    setTotals({ communities: communities.length, profiles: profiles.length, scenarios: scenarios.length });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:iptcmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:iptcmap-toggle", onToggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    const base    = apiBase();
    const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
    const tCount  = rows.filter(r => r.status === "THREAT_CLUSTER").length;
    const ieCount = rows.filter(r => r.status === "INTEL_EXPOSED").length;
    const scCount = rows.filter(r => r.status === "SCENARIO_COVERED").length;
    const nCount  = rows.filter(r => r.status === "NEUTRAL").length;
    const ctx = `IPTCMAP: ${totals.communities} graph communities, ${totals.profiles} intel profiles, ` +
      `${totals.scenarios} scenarios. Threat clusters: ${tCount}, Intel exposed: ${ieCount}, ` +
      `Scenario covered: ${scCount}, Neutral: ${nCount}.`;
    try {
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `In exactly 2 sentences, assess this graph community threat cluster analysis: ${ctx}`,
        }),
      });
      const j = await r.json();
      const txt = j.response || j.message || j.content || j.answer || "Assessment complete.";
      setBrief(txt);
      fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      }).then(async res => {
        if (!res.ok) return;
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play().catch(() => {});
      }).catch(() => {});
    } catch {
      setBrief("Threat cluster assessment unavailable.");
    }
    setAssessing(false);
  }, [rows, totals]);

  // ── badge for closed button ───────────────────────────────────────────────
  const tCount = rows.filter(r => r.status === "THREAT_CLUSTER").length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Community × IntelProfile × Scenario Threat Cluster Map (F123)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 2,
          background: "rgba(6,11,22,0.82)", border: `1px solid ${CY}44`,
          color: CY, padding: "4px 10px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ IPTCMAP
        {tCount > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff", borderRadius: 10,
            padding: "1px 6px", fontSize: 9, animation: "iptcmap-pulse 1.4s ease-in-out infinite",
          }}>{tCount}</span>
        )}
      </button>
    );
  }

  // ── filter rows ────────────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    const matchTab  = tab === "ALL" || r.status === tab;
    const matchSrch = !search || communityText(r).toLowerCase().includes(search.toLowerCase())
      || (r.name || r.label || r.id || "").toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSrch;
  });

  const counts = {
    ALL:              rows.length,
    THREAT_CLUSTER:   rows.filter(r => r.status === "THREAT_CLUSTER").length,
    INTEL_EXPOSED:    rows.filter(r => r.status === "INTEL_EXPOSED").length,
    SCENARIO_COVERED: rows.filter(r => r.status === "SCENARIO_COVERED").length,
    NEUTRAL:          rows.filter(r => r.status === "NEUTRAL").length,
  };
  const coveragePercent = rows.length
    ? Math.round((rows.filter(r => r.status !== "NEUTRAL").length / rows.length) * 100)
    : 0;

  const maxProfScore = Math.max(1, ...rows.map(r =>
    r.matchedProfiles.length ? Math.max(...r.matchedProfiles.map(p => overlap(communityText(r), profileText(p)))) : 0
  ));
  const maxScenScore = Math.max(1, ...rows.map(r =>
    r.matchedScenarios.length ? Math.max(...r.matchedScenarios.map(s => overlap(communityText(r), scenarioText(s)))) : 0
  ));

  return (
    <div style={{
      position: "fixed", left: 18, bottom: 58, zIndex: Z_INDEX,
      width: "min(620px, 95vw)", maxHeight: "72vh",
      background: BG, border: `1px solid ${BORDER}`,
      borderRadius: 14, fontFamily: FONT, overflow: "hidden",
      display: "flex", flexDirection: "column",
      boxShadow: `0 0 40px ${CY}18`,
    }}>

      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px 8px", borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700,
            textShadow: `0 0 12px ${CY}` }}>◈ GRAPH COMMUNITY THREAT CLUSTER MAP</span>
          {tCount > 0 && (
            <span style={{
              background: RD, color: "#fff", borderRadius: 10, padding: "1px 7px",
              fontSize: 9, letterSpacing: 1, animation: "iptcmap-pulse 1.4s ease-in-out infinite",
            }}>{tCount} THREAT</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: "#4E6A7A" }}>{loading ? "⟳ refreshing…" : "◌ 90s"}</span>
          <button onClick={load} title="Refresh" style={{
            background: "none", border: `1px solid ${CY}44`, color: CY,
            fontSize: 10, cursor: "pointer", borderRadius: 4, padding: "2px 8px",
          }}>↺</button>
          <button onClick={() => setOpen(false)} style={{
            background: "none", border: "none", color: "#4E6A7A", fontSize: 16, cursor: "pointer",
          }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6,
        padding: "8px 16px", borderBottom: `1px solid ${BORDER}`,
      }}>
        {[
          ["COMMUNITIES",    totals.communities,            CY],
          ["INTEL PROFILES", totals.profiles,               OR],
          ["SCENARIOS",      totals.scenarios,              GR],
          ["THREAT CLUST.",  counts.THREAT_CLUSTER,         RD],
          ["INTEL EXP.",     counts.INTEL_EXPOSED,          OR],
          ["SCEN. COVER.",   counts.SCENARIO_COVERED,       GR],
          ["NEUTRAL",        counts.NEUTRAL,                "#4E6A7A"],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: `${col}0A`, border: `1px solid ${col}33`,
            borderRadius: 6, padding: "6px 8px", textAlign: "center",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1, marginTop: 2 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ padding: "6px 16px 4px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
          <span style={{ fontSize: 9, color: "#4E6A7A", letterSpacing: 2 }}>CLUSTER COVERAGE</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: coveragePercent >= 60 ? GR : AM }}>
            {coveragePercent}%
          </span>
        </div>
        <div style={{ height: 3, background: "#0D1F2D", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${coveragePercent}%`,
            background: coveragePercent >= 60 ? GR : AM, transition: "width .5s ease",
          }} />
        </div>
      </div>

      {/* filter tabs + search */}
      <div style={{ padding: "6px 16px 4px", display: "flex", gap: 4, flexWrap: "wrap",
        borderBottom: `1px solid ${BORDER}`, alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CY}22` : "none",
            border: `1px solid ${tab === t ? CY : "#1C3040"}`,
            color: tab === t ? CY : "#4E6A7A",
            fontSize: 9, letterSpacing: 1, cursor: "pointer", borderRadius: 4,
            padding: "2px 7px", fontFamily: FONT,
          }}>
            {t} <span style={{ opacity: .6 }}>({counts[t] ?? 0})</span>
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "#04060A", border: `1px solid ${CY}33`,
            color: "#DCEBF5", fontSize: 10, padding: "2px 8px", borderRadius: 4,
            fontFamily: FONT, outline: "none", width: 120,
          }}
        />
      </div>

      {/* row list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px" }}>
        {loading && !rows.length && (
          <div style={{ color: "#4E6A7A", fontSize: 10, textAlign: "center", padding: 16 }}>
            ⟳ loading graph communities…
          </div>
        )}
        {!loading && !filtered.length && (
          <div style={{ color: "#4E6A7A", fontSize: 10, textAlign: "center", padding: 16 }}>
            No communities match the current filter.
          </div>
        )}
        {filtered.map((row, i) => {
          const rowId = row.id || row.name || i;
          const isExpanded = expanded === rowId;
          const color = statusColor(row.status);
          const label = row.name || row.label || row.id || `Community ${i + 1}`;
          const size  = row.size || row.member_count || row.members?.length || row.nodes?.length || "?";
          return (
            <div key={rowId} style={{
              borderBottom: `1px solid ${BORDER}`, padding: "7px 0",
            }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(isExpanded ? null : rowId)}
              >
                <span style={{ color, fontSize: 9, letterSpacing: 1,
                  padding: "1px 6px", background: `${color}18`, borderRadius: 10,
                  animation: row.status === "THREAT_CLUSTER" ? "iptcmap-pulse 1.4s ease-in-out infinite" : "none",
                  minWidth: 108, textAlign: "center",
                }}>{row.status.replace("_", " ")}</span>
                <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{label}</span>
                <span style={{ color: "#4E6A7A", fontSize: 9 }}>
                  {size !== "?" ? `${size} nodes` : ""}
                  {" "}· {row.matchedProfiles.length} actors · {row.matchedScenarios.length} scen.
                </span>
                <span style={{ color: "#4E6A7A", fontSize: 11 }}>{isExpanded ? "▲" : "▼"}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 6, paddingLeft: 10 }}>
                  {row.matchedProfiles.length > 0 && (
                    <div>
                      <div style={{ color: OR, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
                        ◈ MATCHED INTEL PROFILES ({row.matchedProfiles.length})
                      </div>
                      {row.matchedProfiles.map((p, pi) => {
                        const sc = overlap(communityText(row), profileText(p));
                        return (
                          <div key={pi} style={{
                            background: `${OR}0A`, border: `1px solid ${OR}33`,
                            borderRadius: 6, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ color: OR, fontSize: 10 }}>
                                {p.name || p.id || `Profile ${pi + 1}`}
                              </span>
                              {p.role && (
                                <span style={{
                                  fontSize: 8, color: OR, background: `${OR}22`,
                                  borderRadius: 10, padding: "1px 5px", letterSpacing: 1,
                                }}>{p.role}</span>
                              )}
                            </div>
                            {relevanceBar(sc, maxProfScore, OR)}
                            {p.org && <div style={{ fontSize: 9, color: "#4E6A7A" }}>{p.org}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedScenarios.length > 0 && (
                    <div>
                      <div style={{ color: GR, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
                        ◉ MATCHED SCENARIOS ({row.matchedScenarios.length})
                      </div>
                      {row.matchedScenarios.map((s, si) => {
                        const sc = overlap(communityText(row), scenarioText(s));
                        return (
                          <div key={si} style={{
                            background: `${GR}0A`, border: `1px solid ${GR}33`,
                            borderRadius: 6, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ color: GR, fontSize: 10 }}>
                                {s.name || s.title || s.id || `Scenario ${si + 1}`}
                              </span>
                              {s.type && (
                                <span style={{
                                  fontSize: 8, color: GR, background: `${GR}22`,
                                  borderRadius: 10, padding: "1px 5px", letterSpacing: 1,
                                }}>{s.type}</span>
                              )}
                            </div>
                            {relevanceBar(sc, maxScenScore, GR)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!row.matchedProfiles.length && !row.matchedScenarios.length && (
                    <div style={{ color: "#4E6A7A", fontSize: 9 }}>
                      No matching intel profiles or scenarios for this community.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess + brief */}
      <div style={{ padding: "8px 16px 12px", borderTop: `1px solid ${BORDER}` }}>
        <button
          onClick={assess}
          disabled={assessing || !rows.length}
          style={{
            background: `${CY}18`, border: `1px solid ${CY}44`, color: CY,
            fontSize: 10, letterSpacing: 2, cursor: assessing ? "wait" : "pointer",
            borderRadius: 4, padding: "5px 14px", fontFamily: FONT,
          }}
        >
          {assessing ? "⟳ ASSESSING…" : "▶ ASSESS CLUSTERS"}
        </button>
        {brief && (
          <div style={{
            marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
            background: `${CY}08`, border: `1px solid ${CY}22`,
            borderRadius: 6, padding: "8px 10px",
          }}>{brief}</div>
        )}
      </div>

      <style>{`
        @keyframes iptcmap-pulse {
          0%,100%{opacity:1}50%{opacity:.4}
        }
      `}</style>
    </div>
  );
}
