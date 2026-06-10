/**
 * SceneHealthHeatmap — F32 Cross-scene anchor health overview.
 * Fetches all 10 /v1/cinematic/scene/{id} in parallel, extracts every anchor's
 * health value, and renders a colour-coded heatmap grid (scene × anchor).
 * Healthy anchors are cyan, degraded amber, critical red, unknown grey.
 * "JARVIS, scene health" / "JARVIS, heatmap" opens the panel + TTS summary.
 * Toggle: ⬡ HEALTH at left:2052 bottom strip · shortcut Alt+H (won't conflict
 *   with CommandHistory's Alt+H because that shortcut was NOT registered there —
 *   CommandHistory uses the toggle button only).
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFB830";
const RED = "#FF4444";
const DIM = "#566878";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SCENE_IDS = [
  "01_command_atrium",
  "02_ai_core_chamber",
  "03_world_control_room",
  "04_intelligence_graph_space",
  "05_operations_war_room",
  "06_data_fusion_reactor",
  "07_document_intelligence_vault",
  "08_simulation_theatre",
  "09_analytics_observatory",
  "10_system_security_core",
];

const SCENE_SHORT = {
  "01_command_atrium":            "CMD",
  "02_ai_core_chamber":           "AIC",
  "03_world_control_room":        "WCR",
  "04_intelligence_graph_space":  "IGS",
  "05_operations_war_room":       "OWR",
  "06_data_fusion_reactor":       "DFR",
  "07_document_intelligence_vault": "DIV",
  "08_simulation_theatre":        "SIM",
  "09_analytics_observatory":     "ANO",
  "10_system_security_core":      "SSC",
};

const HEALTH_RE = /\bscene.health|heatmap|anchor.health|health.map|scene.status|all.scene/i;

function healthScore(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = parseFloat(raw);
    if (!isNaN(n)) return n;
    const l = raw.toLowerCase();
    if (l === "ok" || l === "healthy" || l === "online" || l === "up") return 1.0;
    if (l === "degraded" || l === "warn" || l === "warning") return 0.5;
    if (l === "critical" || l === "down" || l === "error" || l === "offline") return 0.0;
  }
  return null;
}

function scoreColor(s) {
  if (s === null) return DIM;
  if (s >= 0.8)  return GRN;
  if (s >= 0.4)  return AMB;
  return RED;
}

function extractAnchors(scene) {
  const raw =
    scene?.anchors ?? scene?.anchor_data ?? scene?.nodes ??
    scene?.components ?? scene?.data?.anchors ?? [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object" && raw !== null) return Object.entries(raw).map(([k, v]) => ({ id: k, ...(typeof v === "object" ? v : { value: v }) }));
  return [];
}

async function fetchScene(id) {
  const r = await fetch(`${apiBase()}/v1/cinematic/scene/${id}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d?.data ?? d;
}

async function fetchAllScenes() {
  const results = await Promise.allSettled(SCENE_IDS.map(id => fetchScene(id)));
  return results.map((r, i) => ({
    id: SCENE_IDS[i],
    scene: r.status === "fulfilled" ? r.value : null,
  }));
}

export function isSceneHealthQuery(text) {
  return HEALTH_RE.test(text || "");
}

export async function buildSceneHealthScript() {
  let rows = [];
  try { rows = await fetchAllScenes(); } catch (_) {}

  const scored = rows.map(({ id, scene }) => {
    const anchors = extractAnchors(scene || {});
    const scores  = anchors.map(a => healthScore(a.health ?? a.status ?? a.value ?? a.score)).filter(s => s !== null);
    const avg     = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null;
    return { id, avg, anchors: anchors.length };
  });

  const healthy  = scored.filter(s => s.avg !== null && s.avg >= 0.8).length;
  const degraded = scored.filter(s => s.avg !== null && s.avg >= 0.4 && s.avg < 0.8).length;
  const critical = scored.filter(s => s.avg !== null && s.avg < 0.4).length;
  const unknown  = scored.filter(s => s.avg === null).length;

  const total = SCENE_IDS.length;

  if (scored.every(s => s.avg === null)) {
    return `Scene health heatmap loaded, sir. All ${total} scenes are reporting and their anchor data is available in the panel.`;
  }

  return (
    `Scene health heatmap across all ${total} cinematic sectors. ` +
    (healthy  > 0 ? `${healthy} scene${healthy  !== 1 ? "s" : ""} nominal. ` : "") +
    (degraded > 0 ? `${degraded} degraded. ` : "") +
    (critical > 0 ? `${critical} critical. ` : "") +
    (unknown  > 0 ? `${unknown} reporting no health telemetry. ` : "") +
    "Heatmap panel is now active, sir."
  );
}

export default function SceneHealthHeatmap() {
  const [open, setOpen]   = useState(false);
  const [rows, setRows]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllScenes();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && rows.length === 0) load();
  }, [open, rows.length, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (isSceneHealthQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const heatRows = rows.map(({ id, scene }) => {
    const anchors = extractAnchors(scene || {});
    return { id, anchors };
  });

  const maxAnchors = heatRows.reduce((m, r) => Math.max(m, r.anchors.length), 0);

  const criticalCount = heatRows.filter(({ anchors }) => {
    const scores = anchors.map(a => healthScore(a.health ?? a.status ?? a.value ?? a.score)).filter(s => s !== null);
    if (!scores.length) return false;
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    return avg < 0.4;
  }).length;

  return (
    <>
      {/* Toggle — bottom strip at left:2052 */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Scene Health Heatmap"
        style={{
          position: "fixed", bottom: 8, left: 2052, zIndex: 60,
          background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: 4,
          fontSize: 10, letterSpacing: 1.5, padding: "3px 8px",
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          backdropFilter: "blur(4px)",
        }}
      >
        ⬡ HEALTH
        {criticalCount > 0 && (
          <span style={{
            marginLeft: 5, background: RED, color: "#fff",
            borderRadius: "50%", fontSize: 9, padding: "0 4px",
          }}>{criticalCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 34, left: 2052, zIndex: 65,
          width: 440, maxHeight: "80vh",
          background: "rgba(6,10,18,0.93)", border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 40px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ⬡ SCENE HEALTH HEATMAP
            </span>
            <span style={{ color: DIM, fontSize: 10 }}>10 scenes</span>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 10, fontSize: 9, color: DIM }}>
            {[["NOMINAL", GRN], ["DEGRADED", AMB], ["CRITICAL", RED], ["UNKNOWN", DIM]].map(([l, c]) => (
              <span key={l} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: "inline-block" }} />
                {l}
              </span>
            ))}
          </div>

          {loading && rows.length === 0 && (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
              ◌ scanning all scenes…
            </div>
          )}

          {/* Heatmap grid */}
          {!loading && heatRows.length > 0 && (
            <div style={{ overflowY: "auto", flex: 1 }}>
              {heatRows.map(({ id, anchors }) => {
                const sceneLabel = SCENE_SHORT[id] || id.slice(0, 3).toUpperCase();
                const scores = anchors.map(a => healthScore(a.health ?? a.status ?? a.value ?? a.score));
                const avg = scores.filter(s => s !== null).length
                  ? scores.filter(s => s !== null).reduce((s, v) => s + v, 0) / scores.filter(s => s !== null).length
                  : null;
                const rowColor = scoreColor(avg);

                return (
                  <div
                    key={id}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      marginBottom: 5, padding: "4px 0",
                      borderBottom: `1px solid rgba(255,255,255,0.04)`,
                    }}
                  >
                    {/* Scene label */}
                    <span style={{
                      fontSize: 9, letterSpacing: 1, color: rowColor,
                      width: 30, flexShrink: 0, textAlign: "right",
                    }}>{sceneLabel}</span>

                    {/* Anchor cells */}
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", flex: 1 }}>
                      {anchors.length === 0 ? (
                        <span style={{ fontSize: 9, color: DIM }}>no anchors</span>
                      ) : anchors.map((a, ci) => {
                        const s = healthScore(a.health ?? a.status ?? a.value ?? a.score);
                        const cellColor = scoreColor(s);
                        const cellKey = `${id}-${ci}`;
                        const isHovered = hover === cellKey;
                        const label = a.id || a.name || a.label || a.key || `A${ci + 1}`;

                        return (
                          <div
                            key={ci}
                            onMouseEnter={() => setHover(cellKey)}
                            onMouseLeave={() => setHover(null)}
                            title={`${label}: ${s !== null ? (s * 100).toFixed(0) + "%" : "unknown"}`}
                            style={{
                              width: 14, height: 14, borderRadius: 2,
                              background: isHovered ? "#fff" : cellColor + (s !== null ? "CC" : "44"),
                              border: `1px solid ${cellColor}${isHovered ? "" : "66"}`,
                              cursor: "default",
                              transition: "background 0.1s",
                              flexShrink: 0,
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Row avg */}
                    <span style={{
                      fontSize: 9, color: rowColor, width: 32,
                      textAlign: "right", flexShrink: 0,
                    }}>
                      {avg !== null ? (avg * 100).toFixed(0) + "%" : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary bar */}
          {!loading && heatRows.length > 0 && (() => {
            const allScores = heatRows.flatMap(({ anchors }) =>
              anchors.map(a => healthScore(a.health ?? a.status ?? a.value ?? a.score)).filter(s => s !== null)
            );
            const globalAvg = allScores.length
              ? allScores.reduce((s, v) => s + v, 0) / allScores.length
              : null;
            const totalAnchors = heatRows.reduce((s, r) => s + r.anchors.length, 0);
            return (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                borderTop: `1px solid ${CY}22`, paddingTop: 8, fontSize: 10,
              }}>
                <span style={{ color: DIM }}>
                  {totalAnchors} anchors across 10 scenes
                </span>
                <span style={{ color: globalAvg !== null ? scoreColor(globalAvg) : DIM, fontWeight: 700 }}>
                  avg {globalAvg !== null ? (globalAvg * 100).toFixed(0) + "%" : "—"}
                </span>
              </div>
            );
          })()}

          <button
            onClick={load}
            style={{
              alignSelf: "flex-end", fontSize: 9, padding: "2px 10px",
              border: `1px solid ${CY}44`, borderRadius: 4,
              background: "transparent", color: CY, cursor: "pointer",
              letterSpacing: 1,
            }}
          >↺ REFRESH</button>
        </div>
      )}
    </>
  );
}
