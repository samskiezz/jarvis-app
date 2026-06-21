/**
 * GraphAnomalyDetector — F66.
 *
 * Fetches /v1/graph/centrality; groups nodes by type; for each type
 * computes mean + std-dev of centrality scores and surfaces nodes with
 * z-score ≥ 1.5 within their peer group as ANOMALIES (statistically
 * unusual connectivity compared to entities of the same type).
 *
 * Anomaly cards: name, type badge, centrality score, z-score, peer avg,
 * score bar. Click ▶ ASSESS → /v1/jarvis/agent/chat AI 2-sentence
 * explanation + TTS via jarvis:speak-dossier.
 *
 * Intent: "graph anomaly" / "outlier" / "unusual node" / "anomaly detect"
 *   → jarvis:graph-anomaly-toggle + TTS brief via buildGraphAnomalyScript()
 *
 * Toggle: ◈ ANOMALY at left:5588, zIndex 65. Red badge = HIGH-anomaly count.
 * 60 s auto-refresh. Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const RED = "#FF3D5A";
const AMBER = "#F5A623";
const VIOLET = "#A78BFA";
const BTN_LEFT = 5588;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isGraphAnomalyQuery(q) {
  return /graph.anomal|node.anomal|outlier|unusual.node|anomalous|centrality.outlier|anomaly.detect|graph.outlier|network.outlier/i.test(
    q || ""
  );
}

export async function buildGraphAnomalyScript() {
  try {
    const all = await fetchCentrality();
    const anomalies = detectAnomalies(all);
    window.dispatchEvent(new CustomEvent("jarvis:graph-anomaly-toggle"));
    if (!anomalies.length) {
      return `Graph anomaly scan complete, sir. All ${all.length} entity nodes fall within normal centrality range for their peer type — no statistical outliers detected.`;
    }
    const top = anomalies[0];
    return `Graph anomaly detection has identified ${anomalies.length} statistical outlier${anomalies.length !== 1 ? "s" : ""} from ${all.length} entity nodes, sir. The most anomalous node is "${top.name}" — type ${top.type || "unknown"} — with a centrality score ${top.z.toFixed(1)} standard deviations above its peer group average. Review each anomaly for intelligence significance.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:graph-anomaly-toggle"));
    return "Graph anomaly detector open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function GraphAnomalyDetector() {
  const [visible, setVisible] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [assessing, setAssessing] = useState(null);
  const [assessments, setAssessments] = useState({});
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:graph-anomaly-toggle", onToggle);
    return () => window.removeEventListener("jarvis:graph-anomaly-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchCentrality();
      setNodes(all);
      setAnomalies(detectAnomalies(all));
    } catch {
      // leave existing data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const displayed =
    tab === "HIGH"
      ? anomalies.filter((a) => a.z >= 2.5)
      : tab === "MEDIUM"
      ? anomalies.filter((a) => a.z >= 1.5 && a.z < 2.5)
      : anomalies;

  const highCount = anomalies.filter((a) => a.z >= 2.5).length;

  const assess = useCallback(
    async (node) => {
      const key = node.id || node.name;
      if (assessing === key) return;
      setAssessing(key);
      try {
        const prompt =
          `In exactly 2 sentences: Why might the entity "${node.name}" (type: ${node.type || "unknown"}) have an unusually high graph centrality score of ${node.score.toFixed(2)}, which is ${node.z.toFixed(1)} standard deviations above its peer-type average of ${node.peerAvg.toFixed(2)}? What intelligence significance does this anomaly suggest? British-butler tone. No markdown.`;
        const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({ message: prompt }),
        });
        const d = await r.json();
        const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
        if (text) {
          setAssessments((prev) => ({ ...prev, [key]: text }));
          window.dispatchEvent(
            new CustomEvent("jarvis:speak-dossier", { detail: { text } })
          );
        }
      } catch {
        setAssessments((prev) => ({
          ...prev,
          [node.id || node.name]: "Reasoning core unreachable. Please try again.",
        }));
      } finally {
        setAssessing(null);
      }
    },
    [assessing]
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Graph Anomaly Detector"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          height: 26,
          padding: "0 8px",
          background: visible ? `${RED}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? RED : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? RED : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {highCount > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: RED,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
            }}
          >
            {highCount}
          </span>
        )}
        ◈ ANOMALY
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 620),
            zIndex: 65,
            width: 600,
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.97)",
            border: `1px solid ${RED}44`,
            borderTop: `2px solid ${RED}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${RED}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${RED}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: RED, fontSize: 13 }}>◈</span>
            <span style={{ color: RED, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              GRAPH ANOMALY DETECTOR
            </span>
            {loading && (
              <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>
                scanning…
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={load}
              title="Refresh"
              style={{ background: "transparent", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 13 }}
            >
              ↻
            </button>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "transparent", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 14px",
              borderBottom: "1px solid #1A2A3A",
              flexShrink: 0,
            }}
          >
            {[
              { label: "NODES", val: nodes.length, col: CY },
              { label: "ANOMALIES", val: anomalies.length, col: AMBER },
              { label: "HIGH (z≥2.5)", val: highCount, col: RED },
              { label: "MEDIUM", val: anomalies.length - highCount, col: VIOLET },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>{t.val}</div>
                <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1, marginTop: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1A2A3A", flexShrink: 0 }}>
            {["ALL", "HIGH", "MEDIUM"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  border: "none",
                  borderBottom: tab === t ? `2px solid ${RED}` : "2px solid transparent",
                  background: "transparent",
                  color: tab === t ? RED : "#6E8AA0",
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Anomaly list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {!loading && anomalies.length === 0 && (
              <div style={{ textAlign: "center", padding: "28px 0", color: "#4E6A7A", fontSize: 10, letterSpacing: 1 }}>
                No anomalies detected — all nodes within normal centrality range for their peer type.
              </div>
            )}
            {displayed.length === 0 && anomalies.length > 0 && (
              <div style={{ textAlign: "center", padding: "28px 0", color: "#4E6A7A", fontSize: 10, letterSpacing: 1 }}>
                No nodes in this severity band.
              </div>
            )}
            {displayed.map((node) => {
              const key = node.id || node.name;
              const isHigh = node.z >= 2.5;
              const col = isHigh ? RED : AMBER;
              const label = isHigh ? "HIGH" : "MEDIUM";
              const assessmentText = assessments[key];
              const isAssessing = assessing === key;
              return (
                <div
                  key={key}
                  style={{
                    margin: "0 10px 8px",
                    background: "rgba(255,255,255,0.025)",
                    border: `1px solid ${col}33`,
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  {/* Top row: badge + name + type + z-score */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 8,
                      color: col,
                      letterSpacing: 1,
                      border: `1px solid ${col}55`,
                      borderRadius: 3,
                      padding: "1px 5px",
                      whiteSpace: "nowrap",
                    }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 11, color: "#C8DDF0", flex: 1, fontWeight: 600 }}>
                      {node.name}
                    </span>
                    {node.type && (
                      <span style={{
                        fontSize: 8,
                        color: CY,
                        letterSpacing: 1,
                        border: `1px solid ${CY}33`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        whiteSpace: "nowrap",
                      }}>
                        {node.type}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: col, fontWeight: 700, whiteSpace: "nowrap" }}>
                      z={node.z.toFixed(2)}
                    </span>
                  </div>

                  {/* Score bar + peer avg + assess button */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: assessmentText ? 6 : 0 }}>
                    <div style={{ flex: 1, height: 4, background: "#1A2A3A", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        width: `${Math.min(100, node.peerMax > 0 ? (node.score / node.peerMax) * 100 : 100)}%`,
                        height: "100%",
                        background: col,
                        borderRadius: 2,
                      }} />
                    </div>
                    <span style={{ fontSize: 8, color: "#6E8AA0", whiteSpace: "nowrap" }}>
                      {node.score.toFixed(2)} · avg {node.peerAvg.toFixed(2)}
                    </span>
                    <button
                      onClick={() => assess(node)}
                      disabled={isAssessing}
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        border: `1px solid ${isAssessing ? "#2A3A4A" : col + "66"}`,
                        background: isAssessing ? "transparent" : `${col}18`,
                        color: isAssessing ? "#4E6A7A" : col,
                        fontSize: 9,
                        letterSpacing: 1,
                        cursor: isAssessing ? "default" : "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isAssessing ? "…" : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* AI assessment text */}
                  {assessmentText && (
                    <div style={{
                      marginTop: 4,
                      padding: "6px 10px",
                      background: `${col}0A`,
                      border: `1px solid ${col}22`,
                      borderRadius: 5,
                      fontSize: 9,
                      color: "#C8DDF0",
                      lineHeight: 1.65,
                    }}>
                      {assessmentText}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px",
            borderTop: `1px solid ${RED}18`,
            fontSize: 8,
            color: "#4E6A7A",
            letterSpacing: 1,
            flexShrink: 0,
          }}>
            /v1/graph/centrality → z-score anomaly detection per type · auto-refresh 60 s
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function fetchCentrality() {
  const r = await fetch(`${apiBase()}/v1/graph/centrality`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.nodes) ? d.nodes
    : Array.isArray(d?.entities) ? d.entities
    : Array.isArray(d?.results) ? d.results
    : Array.isArray(d?.centrality) ? d.centrality
    : [];
}

function nodeScore(n) {
  const v = n.score ?? n.centrality_score ?? n.centrality ?? n.value ?? n.weight ?? 0;
  return typeof v === "number" ? v : parseFloat(v) || 0;
}

function nodeName(n) {
  return n.name || n.label || n.entity || n.id || "Unknown";
}

function nodeType(n) {
  return n.type || n.entity_type || n.category || n.kind || "";
}

function detectAnomalies(nodes, zThreshold = 1.5) {
  if (nodes.length < 2) return [];

  const groups = {};
  for (const n of nodes) {
    const t = nodeType(n) || "__all__";
    if (!groups[t]) groups[t] = [];
    groups[t].push(n);
  }

  const anomalies = [];
  for (const members of Object.values(groups)) {
    if (members.length < 2) continue;
    const scores = members.map(nodeScore);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
    const std = Math.sqrt(variance);
    if (std === 0) continue;
    const max = Math.max(...scores);
    for (const n of members) {
      const s = nodeScore(n);
      const z = (s - mean) / std;
      if (z >= zThreshold) {
        anomalies.push({
          ...n,
          name: nodeName(n),
          type: nodeType(n),
          score: s,
          z,
          peerAvg: mean,
          peerMax: max,
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.z - a.z);
}
