/**
 * F164 — AIP Skill × Graph Centrality × Ops Event Operational Signal Mesh (OSIGSM)
 *
 * Parallel-fetches /v1/aip/skill + /v1/graph/centrality + /v1/ops/events
 * Keyword-correlates each AIP skill (name/description/category/tags) against
 * high-centrality graph nodes AND recent ops events:
 *   SIGNAL_ACTIVE — skill matched both a graph node AND an ops event
 *   GRAPH_WIRED   — skill matched a centrality node only
 *   OPS_DRIVEN    — skill matched an ops event only
 *   DORMANT       — no matches (operational blind spot)
 *
 * Stat tiles: AIP SKILLS / GRAPH NODES / OPS EVENTS + all four class counts + SIGNAL%.
 * Amber badge on dormant count.
 * Filter tabs ALL / SIGNAL_ACTIVE / GRAPH_WIRED / OPS_DRIVEN / DORMANT + text search.
 * Expand skill → matched graph node cards (cyan, centrality score) +
 *               matched ops event cards (blue, type badge) with relevance bars.
 * ▶ ASSESS SIGNAL MESH → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:osigsm-toggle event.
 *
 * Voice triggers: "osigsm / skill signal mesh / operational signal mesh /
 *                  graph wired skill / ops driven skill / dormant skill ops /
 *                  skill ops graph / aip signal mesh".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_034_200;
const Z_INDEX  = 225;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const OSIGSM_RE = /\b(osigsm|skill[\s-]signal[\s-]mesh|operational[\s-]signal[\s-]mesh|graph[\s-]wired[\s-]skill|ops[\s-]driven[\s-]skill|dormant[\s-]skill[\s-]ops|skill[\s-]ops[\s-]graph|aip[\s-]signal[\s-]mesh)\b/i;

const CY     = "#00CFFF";
const BL     = "#3B82F6";
const AM     = "#F59E0B";
const GR     = "#22C55E";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  SIGNAL_ACTIVE: GR,
  GRAPH_WIRED:   CY,
  OPS_DRIVEN:    BL,
  DORMANT:       AM,
};
const TABS = ["ALL", "SIGNAL_ACTIVE", "GRAPH_WIRED", "OPS_DRIVEN", "DORMANT"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function skillText(s) {
  return `${s.name || s.skill_name || ""} ${s.description || ""} ${s.category || ""} ${(s.tags || []).join(" ")}`;
}
function nodeText(n) {
  return `${n.name || n.id || n.entity || ""} ${n.label || ""} ${n.type || ""} ${n.description || ""}`;
}
function opsText(e) {
  return `${e.title || e.name || ""} ${e.description || ""} ${e.type || ""} ${e.category || ""} ${e.summary || ""}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [skillRes, nodeRes, opsRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/aip/skill`,        { headers }),
    fetch(`${apiBase}/v1/graph/centrality`, { headers }),
    fetch(`${apiBase}/v1/ops/events`,       { headers }),
  ]);
  const skills = skillRes.status === "fulfilled" && skillRes.value.ok
    ? normaliseArray(await skillRes.value.json(), ["skills", "aip_skills"])
    : [];
  const rawNodes = nodeRes.status === "fulfilled" && nodeRes.value.ok
    ? normaliseArray(await nodeRes.value.json(), ["nodes", "centrality", "results"])
    : [];
  const opsEvents = opsRes.status === "fulfilled" && opsRes.value.ok
    ? normaliseArray(await opsRes.value.json(), ["events", "ops_events"])
    : [];
  return { skills, rawNodes, opsEvents };
}

function correlate(skills, rawNodes, opsEvents) {
  return skills.map(s => {
    const kws = keywords(skillText(s));
    const matchedNodes = rawNodes
      .map(n => ({ node: n, rel: score(nodeText(n), kws) }))
      .filter(x => x.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const matchedOps = opsEvents
      .map(e => ({ event: e, rel: score(opsText(e), kws) }))
      .filter(x => x.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const hasNode = matchedNodes.length > 0;
    const hasOps  = matchedOps.length > 0;
    const cls = hasNode && hasOps ? "SIGNAL_ACTIVE"
              : hasNode           ? "GRAPH_WIRED"
              : hasOps            ? "OPS_DRIVEN"
              :                     "DORMANT";
    return { ...s, _cls: cls, _nodes: matchedNodes, _ops: matchedOps };
  });
}

export function isOsigsmQuery(q = "") { return OSIGSM_RE.test(q); }

export async function buildOsigsmScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [skillRes, nodeRes, opsRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/aip/skill`,        { headers }),
    fetch(`${apiBase}/v1/graph/centrality`, { headers }),
    fetch(`${apiBase}/v1/ops/events`,       { headers }),
  ]);
  const skills    = skillRes.status === "fulfilled" && skillRes.value.ok
    ? normaliseArray(await skillRes.value.json(), ["skills", "aip_skills"]) : [];
  const rawNodes  = nodeRes.status === "fulfilled" && nodeRes.value.ok
    ? normaliseArray(await nodeRes.value.json(), ["nodes", "centrality", "results"]) : [];
  const opsEvents = opsRes.status === "fulfilled" && opsRes.value.ok
    ? normaliseArray(await opsRes.value.json(), ["events", "ops_events"]) : [];
  const rows = correlate(skills, rawNodes, opsEvents);
  const active  = rows.filter(r => r._cls === "SIGNAL_ACTIVE").length;
  const dormant = rows.filter(r => r._cls === "DORMANT").length;
  const pct = rows.length ? Math.round((rows.filter(r => r._cls !== "DORMANT").length / rows.length) * 100) : 0;
  return `OSIGSM Operational Signal Mesh online, sir. Across ${rows.length} AIP skills correlated against ${rawNodes.length} graph nodes and ${opsEvents.length} ops events, ${active} skills are signal-active with both graph and operational coverage. ${dormant} skills remain dormant — ${pct}% signal mesh coverage. Opening the panel for full visibility now.`;
}

export default function AipSkillGraphOpsSignalMesh() {
  const [open,    setOpen]    = useState(false);
  const [tab,     setTab]     = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [expanded,setExpanded]= useState(null);
  const [totals,  setTotals]  = useState({ skills: 0, nodes: 0, ops: 0 });
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { skills, rawNodes, opsEvents } = await loadAll();
      setTotals({ skills: skills.length, nodes: rawNodes.length, ops: opsEvents.length });
      setRows(correlate(skills, rawNodes, opsEvents));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:osigsm-toggle", toggle);
    return () => window.removeEventListener("jarvis:osigsm-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setAssessment("");
    try {
      const body = await buildOsigsmScript();
      const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({ message: `You are JARVIS. In exactly 2 sentences, assess the operational signal mesh coverage:\n${body}` }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || "";
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Unable to assess signal mesh at this time, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    SIGNAL_ACTIVE: rows.filter(r => r._cls === "SIGNAL_ACTIVE").length,
    GRAPH_WIRED:   rows.filter(r => r._cls === "GRAPH_WIRED").length,
    OPS_DRIVEN:    rows.filter(r => r._cls === "OPS_DRIVEN").length,
    DORMANT:       rows.filter(r => r._cls === "DORMANT").length,
  };
  const signalPct = rows.length
    ? Math.round((rows.length - counts.DORMANT) / rows.length * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._cls !== tab) return false;
    if (search) {
      const t = skillText(r).toLowerCase();
      return search.toLowerCase().split(/\s+/).every(w => t.includes(w));
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="AIP Skill × Graph Centrality × Ops Event Operational Signal Mesh (OSIGSM)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.82)", border: `1px solid ${CY}44`,
          color: CY, fontFamily: FONT, fontSize: 10, letterSpacing: 2,
          padding: "4px 10px", borderRadius: 6, cursor: "pointer",
          backdropFilter: "blur(6px)", whiteSpace: "nowrap",
        }}
      >
        ◈ OSIGSM
        {counts.DORMANT > 0 && (
          <span style={{ marginLeft: 6, background: AM, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {counts.DORMANT}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      zIndex: Z_INDEX, background: "rgba(2,6,14,0.88)", display: "flex",
      alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)",
    }}>
      <div style={{
        width: "min(860px,96vw)", maxHeight: "88vh", overflowY: "auto",
        background: BG, border: `1px solid ${BORDER}`, borderRadius: 16,
        fontFamily: FONT, color: "#DCEBF5", padding: "20px 24px",
        boxShadow: `0 0 60px ${CY}18`,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <span style={{ color: CY, letterSpacing: 3, fontSize: 13, fontWeight: 700 }}>◈ OSIGSM</span>
            <span style={{ marginLeft: 12, fontSize: 11, color: "#6E8AA0" }}>
              AIP Skill × Graph Centrality × Ops Event — Operational Signal Mesh
            </span>
          </div>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {[
            ["AIP SKILLS",    totals.skills,      CY],
            ["GRAPH NODES",   totals.nodes,        "#8B5CF6"],
            ["OPS EVENTS",    totals.ops,          BL],
            ["SIGNAL ACTIVE", counts.SIGNAL_ACTIVE, GR],
            ["GRAPH WIRED",   counts.GRAPH_WIRED,   CY],
            ["OPS DRIVEN",    counts.OPS_DRIVEN,    BL],
            ["DORMANT",       counts.DORMANT,        AM],
          ].map(([label, val, color]) => (
            <div key={label} style={{
              background: "rgba(0,207,255,0.04)", border: `1px solid ${color}33`,
              borderRadius: 8, padding: "8px 14px", minWidth: 80, textAlign: "center",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
              <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}>{label}</div>
            </div>
          ))}
          <div style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${GR}33`,
            borderRadius: 8, padding: "8px 14px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: GR }}>{signalPct}%</div>
            <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}>SIGNAL MESH</div>
          </div>
        </div>

        {/* Coverage bar */}
        <div style={{ height: 4, background: "#0D1B2A", borderRadius: 4, marginBottom: 14 }}>
          <div style={{ height: "100%", width: `${signalPct}%`, background: `linear-gradient(90deg,${BL},${GR})`, borderRadius: 4, transition: "width .5s" }} />
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLASS_COLOR[t] || CY}22` : "transparent",
              border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "#1E3048"}`,
              color: tab === t ? (CLASS_COLOR[t] || CY) : "#6E8AA0",
              borderRadius: 6, padding: "3px 10px", fontSize: 10, cursor: "pointer", letterSpacing: 1,
            }}>{t.replace("_", " ")}</button>
          ))}
          <input
            placeholder="search skills…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              marginLeft: "auto", background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}33`,
              borderRadius: 6, color: "#DCEBF5", padding: "3px 10px", fontSize: 11, fontFamily: FONT,
            }}
          />
        </div>

        {/* Assess */}
        <div style={{ marginBottom: 12 }}>
          <button onClick={assess} disabled={assessing} style={{
            background: assessing ? "#0D1B2A" : `${GR}22`, border: `1px solid ${GR}66`,
            color: GR, borderRadius: 6, padding: "4px 14px", fontSize: 11, cursor: assessing ? "default" : "pointer", letterSpacing: 1,
          }}>
            {assessing ? "assessing…" : "▶ ASSESS SIGNAL MESH"}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#B0CCE0", lineHeight: 1.6, background: "rgba(0,207,255,0.04)", borderRadius: 8, padding: "8px 12px" }}>
              {assessment}
            </div>
          )}
        </div>

        {loading && <div style={{ color: "#6E8AA0", fontSize: 11, marginBottom: 8 }}>loading signal mesh data…</div>}
        {error   && <div style={{ color: "#EF4444", fontSize: 11, marginBottom: 8 }}>error: {error}</div>}

        {/* Rows */}
        {visible.map((s, i) => {
          const id = s.id || s.skill_id || i;
          const isExp = expanded === id;
          const clsColor = CLASS_COLOR[s._cls] || AM;
          return (
            <div key={id} style={{ borderBottom: `1px solid ${BORDER}`, marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 4px", cursor: "pointer",
                  background: isExp ? "rgba(0,207,255,0.04)" : "transparent",
                  borderRadius: 6,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: clsColor, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12 }}>{s.name || s.skill_name || "—"}</span>
                <span style={{ fontSize: 9, color: "#6E8AA0" }}>{s.category || ""}</span>
                <span style={{
                  fontSize: 9, letterSpacing: 1, padding: "2px 7px", borderRadius: 4,
                  border: `1px solid ${clsColor}55`, color: clsColor, flexShrink: 0,
                }}>{s._cls.replace("_", " ")}</span>
                <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "8px 16px 12px", fontSize: 11 }}>
                  {s.description && (
                    <div style={{ color: "#8EA8BF", marginBottom: 8, lineHeight: 1.5 }}>{s.description}</div>
                  )}

                  {/* Graph node matches */}
                  {s._nodes.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: CY, fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>
                        ◈ CENTRALITY NODES ({s._nodes.length})
                      </div>
                      {s._nodes.map(({ node: n, rel }, ni) => (
                        <div key={ni} style={{
                          background: "rgba(0,207,255,0.05)", borderRadius: 6, padding: "6px 10px",
                          marginBottom: 4, border: `1px solid ${CY}22`,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: "#DCEBF5", fontSize: 11 }}>{n.name || n.entity || n.id || "—"}</span>
                            {n.centrality !== undefined && (
                              <span style={{ fontSize: 9, color: CY }}>
                                centrality: {typeof n.centrality === "number" ? n.centrality.toFixed(3) : n.centrality}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, background: "#0D1B2A", borderRadius: 2, marginTop: 5 }}>
                            <div style={{ height: "100%", width: `${Math.min(rel * 20, 100)}%`, background: CY, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ops event matches */}
                  {s._ops.length > 0 && (
                    <div>
                      <div style={{ color: BL, fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>
                        ⬡ OPS EVENTS ({s._ops.length})
                      </div>
                      {s._ops.map(({ event: e, rel }, ei) => (
                        <div key={ei} style={{
                          background: "rgba(59,130,246,0.06)", borderRadius: 6, padding: "6px 10px",
                          marginBottom: 4, border: `1px solid ${BL}22`,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: "#DCEBF5", fontSize: 11 }}>{e.title || e.name || "—"}</span>
                            {e.type && (
                              <span style={{
                                fontSize: 9, padding: "1px 6px", borderRadius: 3,
                                border: `1px solid ${BL}55`, color: BL,
                              }}>{e.type}</span>
                            )}
                          </div>
                          <div style={{ height: 3, background: "#0D1B2A", borderRadius: 2, marginTop: 5 }}>
                            <div style={{ height: "100%", width: `${Math.min(rel * 20, 100)}%`, background: BL, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {s._nodes.length === 0 && s._ops.length === 0 && (
                    <div style={{ color: AM, fontSize: 11 }}>No graph nodes or ops events matched this skill — dormant in the operational mesh.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!loading && visible.length === 0 && (
          <div style={{ color: "#6E8AA0", fontSize: 12, textAlign: "center", padding: "20px 0" }}>
            No skills match the current filter.
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 9, color: "#3A5060", textAlign: "right", letterSpacing: 1 }}>
          OSIGSM · auto-refresh 90s · /v1/aip/skill + /v1/graph/centrality + /v1/ops/events
        </div>
      </div>
    </div>
  );
}
