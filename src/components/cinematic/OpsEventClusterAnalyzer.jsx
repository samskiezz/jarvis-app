/**
 * OpsEventClusterAnalyzer — F55.
 *
 * Fetches /v1/ops/events every 45 s and groups events by service/source into
 * severity-scored clusters. Each cluster's score = Σ(severity weight × event
 * count) where CRITICAL=4, HIGH=3, MEDIUM=2, INFO=1. Clusters sorted hottest
 * first.
 *
 * Stat tiles: total events / service clusters / hot clusters (score ≥6) / quiet (<3)
 * Filter tabs: ALL / HOT / ELEVATED / QUIET
 * Expand cluster row → individual events with severity badges + timestamps.
 * ▶ ASSESS → top-3 cluster context → /v1/jarvis/agent/chat 2-sentence brief
 *            + TTS via jarvis:speak-dossier.
 *
 * Intent: "ops cluster" / "service cluster" / "event cluster" / "cluster analysis"
 *         / "service load" / "opsclu"
 *   → jarvis:opsclu-toggle + TTS brief via buildOpsClusterScript()
 *
 * Toggle: ◈ OPSCLU at left:72448, bottom:8, zIndex:110. Ctrl+Shift+U.
 * Orange badge on hot-cluster count. 45-s auto-refresh.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3D5A";
const GREEN = "#00c878";
const ORANGE = "#FF7B1A";
const PANEL_BG = "rgba(8,14,22,0.93)";
const BTN_LEFT = 72448;
const REFRESH_MS = 45_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.events))  return raw.events;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function getSevLabel(ev) {
  const v = ev.severity ?? ev.payload?.severity ?? ev.level ?? "";
  if (typeof v === "number") {
    if (v >= 90) return "CRITICAL";
    if (v >= 70) return "HIGH";
    if (v >= 40) return "MEDIUM";
    return "INFO";
  }
  const s = String(v).toLowerCase();
  if (s === "critical") return "CRITICAL";
  if (s === "high")     return "HIGH";
  if (s === "medium" || s === "warn" || s === "warning") return "MEDIUM";
  return "INFO";
}

function sevWeight(label) {
  if (label === "CRITICAL") return 4;
  if (label === "HIGH")     return 3;
  if (label === "MEDIUM")   return 2;
  return 1;
}

function sevColor(label) {
  if (label === "CRITICAL") return RED;
  if (label === "HIGH")     return AMBER;
  if (label === "MEDIUM")   return CY;
  return "#445566";
}

function getEvService(ev) {
  return (
    ev.service || ev.source || ev.component || ev.origin ||
    ev.type    || ev.category || "unknown"
  ).toLowerCase().replace(/[_-]/g, " ");
}

function getEvName(ev) {
  return ev.name || ev.message || ev.title || ev.type || `Event #${ev.id || "?"}`;
}

function fmtTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function buildClusters(events) {
  const map = {};
  for (const ev of events) {
    const svc = getEvService(ev);
    if (!map[svc]) map[svc] = { service: svc, events: [], score: 0, maxSev: "INFO" };
    const sev = getSevLabel(ev);
    map[svc].events.push({ ...ev, _sevLabel: sev });
    map[svc].score += sevWeight(sev);
    if (sevWeight(sev) > sevWeight(map[svc].maxSev)) map[svc].maxSev = sev;
  }
  return Object.values(map).sort((a, b) => b.score - a.score);
}

function clusterTier(cluster) {
  if (cluster.score >= 6) return "HOT";
  if (cluster.score >= 3) return "ELEVATED";
  return "QUIET";
}

function tierColor(tier) {
  if (tier === "HOT")      return RED;
  if (tier === "ELEVATED") return AMBER;
  return GREEN;
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const OPS_CLUSTER_RE =
  /ops\s*(cluster|clust)|service\s*(cluster|load|breakdown|group)|event\s*(cluster|group)|cluster\s*anal|opsclu\b/i;

export function isOpsClusterQuery(q) {
  return OPS_CLUSTER_RE.test(q || "");
}

export async function buildOpsClusterScript() {
  try {
    const raw = await fetch(`${apiBase()}/v1/ops/events`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json());
    const events   = normaliseArray(raw);
    const clusters = buildClusters(events);
    const hot      = clusters.filter((c) => clusterTier(c) === "HOT");
    const top      = clusters.slice(0, 3);
    const summary  = top
      .map((c) => `${c.service.toUpperCase()} (score ${c.score}, ${c.events.length} events, ${c.maxSev})`)
      .join("; ");
    const prompt = `JARVIS operational cluster analysis: ${clusters.length} service clusters across ${events.length} ops events. Top clusters: ${summary}. Hot clusters: ${hot.length}. Provide a 2-sentence tactical ops summary.`;
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: prompt }),
    }).then((res) => res.json());
    return (r.answer || r.response || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
      `Sir, ${clusters.length} service clusters detected across ${events.length} ops events. ${hot.length} clusters are running hot.`;
  } catch {
    return "Ops cluster analysis unavailable at this time, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function OpsEventClusterAnalyzer() {
  const [open,     setOpen]     = useState(false);
  const [clusters, setClusters] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [filter,   setFilter]   = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const raw = await fetch(`${apiBase()}/v1/ops/events`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json());
      const events = normaliseArray(raw);
      setTotal(events.length);
      setClusters(buildClusters(events));
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  // toggle listener
  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:opsclu-toggle", onToggle);
    return () => window.removeEventListener("jarvis:opsclu-toggle", onToggle);
  }, []);

  // keyboard shortcut Ctrl+Shift+U
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "U") {
        e.preventDefault(); setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // polling
  useEffect(() => {
    if (!open) return;
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const hot      = clusters.filter((c) => clusterTier(c) === "HOT").length;
  const elevated = clusters.filter((c) => clusterTier(c) === "ELEVATED").length;
  const quiet    = clusters.filter((c) => clusterTier(c) === "QUIET").length;

  const visible = clusters.filter((c) => {
    if (filter === "ALL") return true;
    return clusterTier(c) === filter;
  });

  async function assess(cluster) {
    setAssessing(cluster.service);
    const evList = cluster.events.slice(0, 5)
      .map((e) => `${e._sevLabel} - ${getEvName(e)}`).join("; ");
    const prompt = `JARVIS ops cluster assessment: service "${cluster.service}" has ${cluster.events.length} events, severity score ${cluster.score}, max severity ${cluster.maxSev}. Top events: ${evList}. Provide a 2-sentence tactical assessment.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      }).then((res) => res.json());
      const text = (r.answer || r.response || "Assessment unavailable.")
        .replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Cluster assessment unavailable, sir." },
      }));
    }
    setAssessing(null);
  }

  const TABS = ["ALL", "HOT", "ELEVATED", "QUIET"];

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Ops Event Cluster Analyzer (Ctrl+Shift+U)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 110,
          background: "rgba(8,14,22,0.82)", border: `1px solid ${ORANGE}88`,
          color: ORANGE, borderRadius: 4, padding: "2px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          letterSpacing: 1, cursor: "pointer",
        }}
      >
        ◈ OPSCLU
        {hot > 0 && (
          <span style={{
            marginLeft: 5, background: ORANGE, color: "#04060A",
            borderRadius: 8, padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{hot}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 40, left: BTN_LEFT - 300, zIndex: 110,
          width: 520, maxHeight: "70vh", overflow: "hidden",
          background: PANEL_BG, border: `1px solid ${ORANGE}55`,
          borderRadius: 10, backdropFilter: "blur(10px)",
          boxShadow: `0 0 40px ${ORANGE}18`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          display: "flex", flexDirection: "column",
        }}>
          {/* header */}
          <div style={{
            padding: "10px 14px 6px", borderBottom: `1px solid ${ORANGE}33`,
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <span style={{ color: ORANGE, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>
              ◈ OPS EVENT CLUSTERS
            </span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#6E8AA0" }}>
              {loading ? "refreshing…" : `${total} events · ${clusters.length} services`}
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 14px", flexShrink: 0,
          }}>
            {[
              { label: "EVENTS",    val: total,           col: CY },
              { label: "CLUSTERS",  val: clusters.length, col: CY },
              { label: "HOT",       val: hot,             col: RED },
              { label: "QUIET",     val: quiet,           col: GREEN },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", borderRadius: 6,
                padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 8, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "0 14px 8px", flexShrink: 0,
          }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                padding: "2px 9px", borderRadius: 4, fontSize: 9,
                fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
                cursor: "pointer",
                background: filter === t ? ORANGE : "rgba(255,255,255,0.05)",
                color:      filter === t ? "#04060A" : "#6E8AA0",
                border: `1px solid ${filter === t ? ORANGE : "#334455"}`,
              }}>{t}</button>
            ))}
            <button onClick={load} style={{
              marginLeft: "auto", padding: "2px 9px", borderRadius: 4,
              fontSize: 9, fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
              background: "rgba(255,255,255,0.05)", color: CY,
              border: `1px solid ${CY}44`, letterSpacing: 1,
            }}>⟳ REFRESH</button>
          </div>

          {/* error */}
          {error && (
            <div style={{ padding: "0 14px 8px", color: RED, fontSize: 10 }}>
              ⚠ {error}
            </div>
          )}

          {/* cluster list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 10px" }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: "#445566", fontSize: 11, textAlign: "center", paddingTop: 24 }}>
                No clusters match the selected filter.
              </div>
            )}
            {visible.map((cluster) => {
              const tier = clusterTier(cluster);
              const tc   = tierColor(tier);
              const isExp = expanded === cluster.service;
              return (
                <div key={cluster.service} style={{
                  borderRadius: 6, border: `1px solid ${tc}33`,
                  marginBottom: 6, background: "rgba(255,255,255,0.02)",
                }}>
                  {/* cluster header row */}
                  <div
                    onClick={() => setExpanded(isExp ? null : cluster.service)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 10px", cursor: "pointer",
                    }}
                  >
                    {/* tier badge */}
                    <span style={{
                      fontSize: 8, padding: "1px 5px", borderRadius: 3,
                      background: `${tc}22`, color: tc, fontWeight: 700, letterSpacing: 1,
                    }}>{tier}</span>

                    {/* service name */}
                    <span style={{ flex: 1, fontSize: 11, color: "#DCEBF5", textTransform: "uppercase" }}>
                      {cluster.service}
                    </span>

                    {/* event count */}
                    <span style={{ fontSize: 10, color: "#6E8AA0" }}>
                      {cluster.events.length} events
                    </span>

                    {/* score bar */}
                    <div style={{ width: 60, height: 4, background: "#1a2233", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.min(100, (cluster.score / 20) * 100)}%`,
                        background: tc,
                      }} />
                    </div>
                    <span style={{ fontSize: 9, color: tc, minWidth: 22 }}>{cluster.score}</span>

                    {/* assess button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); assess(cluster); }}
                      disabled={assessing === cluster.service}
                      style={{
                        padding: "2px 7px", borderRadius: 3, fontSize: 9,
                        fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
                        background: assessing === cluster.service ? "#1a2233" : `${ORANGE}22`,
                        color: ORANGE, border: `1px solid ${ORANGE}55`, letterSpacing: 1,
                      }}
                    >
                      {assessing === cluster.service ? "…" : "▶ ASSESS"}
                    </button>

                    <span style={{ color: "#445566", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {/* expanded event list */}
                  {isExp && (
                    <div style={{
                      borderTop: `1px solid ${tc}22`, padding: "6px 10px 8px",
                      maxHeight: 180, overflowY: "auto",
                    }}>
                      {cluster.events.map((ev, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}>
                          <span style={{
                            fontSize: 8, padding: "1px 4px", borderRadius: 2,
                            background: `${sevColor(ev._sevLabel)}22`,
                            color: sevColor(ev._sevLabel), letterSpacing: 1, fontWeight: 700,
                          }}>{ev._sevLabel.slice(0, 4)}</span>
                          <span style={{ flex: 1, fontSize: 10, color: "#AABBCC" }}>
                            {getEvName(ev)}
                          </span>
                          <span style={{ fontSize: 9, color: "#445566" }}>
                            {fmtTime(ev.created_at || ev.timestamp || ev.time)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
