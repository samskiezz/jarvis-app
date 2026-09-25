/**
 * F87 – Graph Centrality × RiskSignal × IntelProfile Threat Influence Nexus (GCRTHIN)
 * Cross-correlates /v1/graph/centrality × /entities/RiskSignal × /entities/IntelProfile.
 * Classifies each high-centrality graph node by threat linkage:
 *   THREAT_HUB  – risk signal match AND intel actor match
 *   RISK_NEXUS  – risk signal match only
 *   ACTOR_LINKED – intel actor match only
 *   NEUTRAL      – no threat linkage
 * THREAT_HUB rows pulse red; amber badge on total threatened count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 991640;
const Z          = 149;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const OR   = "#FF8C42";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

function kw(item) {
  return [
    item.name, item.title, item.label, item.description,
    item.subject, item.topic, item.category, item.type,
    item.kind, item.tags, item.source, item.summary,
    item.notes, item.role, item.alias, item.symbol,
    item.org, item.content, item.location, item.entity_type,
    item.actor, item.sector, item.region,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function overlap(a, b) {
  const wa = a.split(/\W+/).filter(w => w.length > 3);
  const wb = new Set(b.split(/\W+/).filter(w => w.length > 3));
  return wa.filter(w => wb.has(w)).length;
}

function classifyNode(node, riskSignals, intelProfiles) {
  const nk = kw(node);
  const matchedRisk  = riskSignals.filter(r  => overlap(nk, kw(r))  >= 2);
  const matchedActor = intelProfiles.filter(p => overlap(nk, kw(p)) >= 2);

  const hasRisk  = matchedRisk.length  > 0;
  const hasActor = matchedActor.length > 0;
  let cls;
  if (hasRisk && hasActor) cls = "THREAT_HUB";
  else if (hasRisk)        cls = "RISK_NEXUS";
  else if (hasActor)       cls = "ACTOR_LINKED";
  else                     cls = "NEUTRAL";

  return {
    id: node.id || node.name || node.label || Math.random().toString(36).slice(2),
    node,
    cls,
    centrality: node.centrality ?? node.score ?? node.rank ?? 0,
    matchedRisk: matchedRisk.slice(0, 5).map(r => ({
      name:     r.name || r.title || r.description || "?",
      severity: r.severity || r.level || r.priority || "",
      score:    overlap(nk, kw(r)),
    })),
    matchedActor: matchedActor.slice(0, 5).map(p => ({
      name:  p.name || p.title || p.alias || "?",
      role:  p.role || p.type  || p.category || "",
      score: overlap(nk, kw(p)),
    })),
  };
}

async function loadAll(base) {
  const [cr, rr, pr] = await Promise.allSettled([
    fetch(`${base}/v1/graph/centrality`,      { headers: authHdr() }),
    fetch(`${base}/entities/RiskSignal`,      { headers: authHdr() }),
    fetch(`${base}/entities/IntelProfile`,    { headers: authHdr() }),
  ]);
  const parse = async (r) => {
    if (r.status !== "fulfilled" || !r.value.ok) return [];
    try {
      const d = await r.value.json();
      return Array.isArray(d)
        ? d
        : (d.nodes || d.items || d.results || d.data || d.entities || []);
    } catch { return []; }
  };
  const [nodes, riskSignals, intelProfiles] = await Promise.all([cr, rr, pr].map(parse));
  return { nodes, riskSignals, intelProfiles };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────
export function isGcrthinQuery(q) {
  return /\b(gcrthin|graph\s+centrality\s+threat|threat\s+(hub|nexus|influence)|influence\s+nexus|centrality\s+threat|high[\s-]influence\s+threat|graph\s+threat(\s+nexus)?)\b/i.test(q);
}

export async function buildGcrthinScript() {
  const base = apiBase();
  try {
    const { nodes, riskSignals, intelProfiles } = await loadAll(base);
    const rows        = nodes.map(n => classifyNode(n, riskSignals, intelProfiles));
    const total       = rows.length;
    const hubs        = rows.filter(r => r.cls === "THREAT_HUB").length;
    const riskNexus   = rows.filter(r => r.cls === "RISK_NEXUS").length;
    const actorLinked = rows.filter(r => r.cls === "ACTOR_LINKED").length;
    const neutral     = rows.filter(r => r.cls === "NEUTRAL").length;
    const threatened  = hubs + riskNexus + actorLinked;
    return (
      `Graph Centrality Threat Influence Nexus: ${total} high-centrality nodes analysed — ` +
      `${hubs} classified as THREAT HUBs with both active risk signals and known threat actor linkage, ` +
      `${riskNexus} as risk nexus nodes with active signal exposure, ` +
      `${actorLinked} as actor-linked nodes with known profile association, ` +
      `${neutral} neutral. ` +
      (hubs > 0
        ? `${hubs} graph nodes are simultaneously tied to active risk signals AND known threat actors — these represent highest-priority network threat concentration, sir.`
        : threatened > 0
          ? `${threatened} influential graph nodes show threat linkage warranting immediate attention.`
          : "No active threat linkage detected on high-centrality nodes at this time.")
    );
  } catch {
    return "Graph Centrality Threat Influence Nexus: unable to load data.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────
export default function GraphCentralityThreatNexus() {
  const base = apiBase();

  const [rows, setRows]               = useState([]);
  const [riskCount, setRiskCount]     = useState(0);
  const [actorCount, setActorCount]   = useState(0);
  const [filter, setFilter]           = useState("ALL");
  const [search, setSearch]           = useState("");
  const [expanded, setExpanded]       = useState(null);
  const [open, setOpen]               = useState(false);
  const [assessing, setAssessing]     = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { nodes, riskSignals, intelProfiles } = await loadAll(base);
      setRiskCount(riskSignals.length);
      setActorCount(intelProfiles.length);
      setRows(nodes.map(n => classifyNode(n, riskSignals, intelProfiles)));
    } catch {}
  }, [base]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:gcrthin-toggle", toggle);
    return () => window.removeEventListener("jarvis:gcrthin-toggle", toggle);
  }, []);

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildGcrthinScript();
      const voice  = getActiveVoice?.() ?? "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voice }),
      });
    } catch {}
    setAssessing(false);
  };

  const total       = rows.length;
  const hubs        = rows.filter(r => r.cls === "THREAT_HUB").length;
  const riskNexus   = rows.filter(r => r.cls === "RISK_NEXUS").length;
  const actorLinked = rows.filter(r => r.cls === "ACTOR_LINKED").length;
  const neutral     = rows.filter(r => r.cls === "NEUTRAL").length;
  const threatened  = hubs + riskNexus + actorLinked;

  const TABS = ["ALL", "THREAT_HUB", "RISK_NEXUS", "ACTOR_LINKED", "NEUTRAL"];

  const visible = rows.filter(r => {
    const matchTab    = filter === "ALL" || r.cls === filter;
    const matchSearch = !search || kw(r.node).includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const coveragePct = total > 0 ? Math.round((neutral / total) * 100) : 0;

  const clsColor = {
    THREAT_HUB:   RD,
    RISK_NEXUS:   AM,
    ACTOR_LINKED: OR,
    NEUTRAL:      GR,
  };
  const clsLabel = {
    THREAT_HUB:   "THREAT HUB",
    RISK_NEXUS:   "RISK NEXUS",
    ACTOR_LINKED: "ACTOR LINKED",
    NEUTRAL:      "NEUTRAL",
  };

  const badge = (
    <button
      onClick={() => setOpen(o => !o)}
      title="Graph Centrality Threat Influence Nexus (GCRTHIN)"
      style={{
        position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z,
        fontFamily: MONO, fontSize: 10, padding: "3px 8px", cursor: "pointer",
        background: "rgba(5,8,13,0.82)", border: `1px solid ${hubs > 0 ? RD : AM}66`,
        borderRadius: 4, color: hubs > 0 ? RD : AM, letterSpacing: 1,
        boxShadow: hubs > 0 ? `0 0 12px ${RD}55` : threatened > 0 ? `0 0 8px ${AM}44` : "none",
        animation: hubs > 0 ? "gcrthinHubPulse 1.6s ease-in-out infinite" : "none",
      }}
    >
      ◈ GCRTHIN
      {threatened > 0 && (
        <span style={{
          marginLeft: 5, background: hubs > 0 ? RD : AM, color: "#04060A",
          borderRadius: 9, padding: "0 5px", fontSize: 9, fontWeight: 700,
        }}>{threatened}</span>
      )}
    </button>
  );

  if (!open) return badge;

  return (
    <>
      {badge}
      <div style={{
        position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
        width: "min(940px,96vw)", maxHeight: "80vh",
        background: "rgba(6,10,16,0.97)", border: `1px solid ${hubs > 0 ? RD : AM}55`,
        borderRadius: 12, padding: "18px 20px", zIndex: Z + 1,
        fontFamily: MONO, color: "#DCEBF5",
        boxShadow: `0 0 60px ${hubs > 0 ? RD : AM}22`,
        display: "flex", flexDirection: "column", gap: 12, overflow: "hidden",
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: hubs > 0 ? RD : AM, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>
            ◈ GRAPH CENTRALITY THREAT INFLUENCE NEXUS
          </span>
          <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: "auto" }}>
            {riskCount} risk signals · {actorCount} actors · 90s auto-refresh
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16,
          }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["NODES",        total,       CY],
            ["THREAT HUBS",  hubs,        RD],
            ["RISK NEXUS",   riskNexus,   AM],
            ["ACTOR LINKED", actorLinked, OR],
            ["NEUTRAL",      neutral,     GR],
          ].map(([lbl, val, col]) => (
            <div key={lbl} style={{
              background: "rgba(255,255,255,0.04)", border: `1px solid ${col}33`,
              borderRadius: 6, padding: "6px 12px", minWidth: 80, textAlign: "center",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
              <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{lbl}</div>
            </div>
          ))}
          {/* neutral coverage bar */}
          <div style={{
            flex: 1, minWidth: 140, background: "rgba(255,255,255,0.04)",
            border: `1px solid ${GR}33`, borderRadius: 6, padding: "6px 12px",
          }}>
            <div style={{ fontSize: 11, color: "#6E8AA0", letterSpacing: 1, marginBottom: 4 }}>NEUTRAL</div>
            <div style={{ background: "#0d1e2e", borderRadius: 3, height: 8, overflow: "hidden" }}>
              <div style={{
                width: `${coveragePct}%`, height: "100%", background: GR, borderRadius: 3,
                transition: "width 0.6s ease",
              }} />
            </div>
            <div style={{ fontSize: 12, color: GR, marginTop: 3 }}>{coveragePct}%</div>
          </div>
        </div>

        {/* controls */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setFilter(t)} style={{
              fontFamily: MONO, fontSize: 9, padding: "3px 8px", cursor: "pointer",
              background: filter === t ? (clsColor[t] || AM) : "rgba(255,255,255,0.04)",
              border: `1px solid ${clsColor[t] || AM}55`, borderRadius: 4,
              color: filter === t ? "#04060A" : "#6E8AA0",
              fontWeight: filter === t ? 700 : 400,
            }}>{t.replace(/_/g, " ")}</button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search nodes…"
            style={{
              fontFamily: MONO, fontSize: 11, padding: "3px 8px", marginLeft: "auto",
              background: "rgba(255,255,255,0.04)", border: `1px solid ${DIM}`,
              borderRadius: 4, color: "#DCEBF5", outline: "none", width: 160,
            }}
          />
          <button onClick={load} style={{
            fontFamily: MONO, fontSize: 9, padding: "3px 8px", cursor: "pointer",
            background: "rgba(255,255,255,0.04)", border: `1px solid ${DIM}`,
            borderRadius: 4, color: "#6E8AA0",
          }}>↺</button>
          <button onClick={assess} disabled={assessing} style={{
            fontFamily: MONO, fontSize: 10, padding: "4px 12px",
            cursor: assessing ? "default" : "pointer",
            background: assessing ? DIM : (hubs > 0 ? RD : AM),
            border: "none", borderRadius: 4,
            color: assessing ? "#DCEBF5" : "#04060A", fontWeight: 700,
          }}>{assessing ? "assessing…" : "▶ ASSESS THREAT"}</button>
        </div>

        {/* rows */}
        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.length === 0 && (
            <div style={{ color: "#6E8AA0", fontSize: 12, textAlign: "center", padding: "30px 0" }}>
              {rows.length === 0 ? "loading graph nodes…" : "no matches"}
            </div>
          )}
          {visible.map(row => {
            const isExpanded = expanded === row.id;
            const isThreat   = row.cls === "THREAT_HUB";
            const col        = clsColor[row.cls];
            const nodeName   = row.node.name || row.node.label || row.node.title || row.node.entity_type || row.id;
            const nodeType   = row.node.type || row.node.entity_type || row.node.kind || "";
            const centrality = typeof row.centrality === "number"
              ? row.centrality.toFixed(4)
              : row.centrality;
            return (
              <div key={row.id} style={{
                background: "rgba(255,255,255,0.03)", borderRadius: 7,
                border: `1px solid ${col}33`,
                animation: isThreat ? "gcrthinHubPulse 2s ease-in-out infinite" : "none",
              }}>
                <div
                  onClick={() => setExpanded(isExpanded ? null : row.id)}
                  style={{
                    padding: "8px 12px", cursor: "pointer", display: "flex",
                    alignItems: "center", gap: 10,
                  }}
                >
                  <span style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 3,
                    background: `${col}22`, color: col, fontWeight: 700,
                    letterSpacing: 1, whiteSpace: "nowrap",
                  }}>{clsLabel[row.cls]}</span>
                  <span style={{ flex: 1, fontSize: 12, color: "#DCEBF5", fontFamily: SANS }}>{nodeName}</span>
                  {nodeType && <span style={{ fontSize: 9, color: "#6E8AA0" }}>{nodeType}</span>}
                  <span style={{ fontSize: 9, color: CY, marginLeft: 4, fontFamily: MONO }}>
                    {centrality !== 0 ? `c:${centrality}` : ""}
                  </span>
                  <span style={{ fontSize: 10, color: "#6E8AA0" }}>
                    {row.matchedRisk.length  > 0 ? `${row.matchedRisk.length}R ` : ""}
                    {row.matchedActor.length > 0 ? `${row.matchedActor.length}A` : ""}
                    {" "}{isExpanded ? "▲" : "▼"}
                  </span>
                </div>

                {isExpanded && (
                  <div style={{ padding: "0 12px 12px", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {/* Risk signal matches */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 10, color: RD, letterSpacing: 1, marginBottom: 6 }}>
                        ◆ RISK SIGNALS ({row.matchedRisk.length})
                      </div>
                      {row.matchedRisk.length === 0
                        ? <div style={{ fontSize: 11, color: "#6E8AA0" }}>no risk signal matches</div>
                        : row.matchedRisk.map((m, i) => (
                          <div key={i} style={{ marginBottom: 6 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "#DCEBF5", fontFamily: SANS, flex: 1 }}>{m.name}</span>
                              {m.severity && (
                                <span style={{
                                  fontSize: 9, color: RD, padding: "1px 5px",
                                  border: `1px solid ${RD}44`, borderRadius: 3,
                                  textTransform: "uppercase",
                                }}>{m.severity}</span>
                              )}
                            </div>
                            <div style={{ marginTop: 3, background: "#0d1e2e", borderRadius: 2, height: 4, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, m.score * 12)}%`, height: "100%", background: RD }} />
                            </div>
                          </div>
                        ))
                      }
                    </div>

                    {/* Intel actor matches */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 10, color: OR, letterSpacing: 1, marginBottom: 6 }}>
                        ◆ INTEL ACTORS ({row.matchedActor.length})
                      </div>
                      {row.matchedActor.length === 0
                        ? <div style={{ fontSize: 11, color: "#6E8AA0" }}>no actor profile matches</div>
                        : row.matchedActor.map((m, i) => (
                          <div key={i} style={{ marginBottom: 6 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "#DCEBF5", fontFamily: SANS, flex: 1 }}>{m.name}</span>
                              {m.role && (
                                <span style={{
                                  fontSize: 9, color: OR, padding: "1px 5px",
                                  border: `1px solid ${OR}44`, borderRadius: 3,
                                }}>{m.role}</span>
                              )}
                            </div>
                            <div style={{ marginTop: 3, background: "#0d1e2e", borderRadius: 2, height: 4, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, m.score * 12)}%`, height: "100%", background: OR }} />
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <style>{`
        @keyframes gcrthinHubPulse {
          0%, 100% { border-color: ${RD}33; }
          50%       { border-color: ${RD}99; box-shadow: 0 0 14px ${RD}55; }
        }
      `}</style>
    </>
  );
}
