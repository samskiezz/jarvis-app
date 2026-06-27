/**
 * SceneAnchorSnapshot — F149
 * Left-edge slide-in at 5% vertical.
 * On open, parallel-fetches all 10 GET /v1/cinematic/scene/{id} endpoints.
 * Refreshes every 5 min. Each row shows scene name + bound/total anchor count.
 * Clicking a row expands all anchor key→value pairs inline.
 * Sky-blue (#0EA5E9) accent.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const ACCENT  = "#0EA5E9";
const POLL_MS = 5 * 60 * 1000;

const SCENES = [
  { id: "01_command_atrium",            label: "Command Atrium"        },
  { id: "02_ai_core_chamber",           label: "AI Core Chamber"       },
  { id: "03_world_control_room",        label: "World Control Room"    },
  { id: "04_intelligence_graph_space",  label: "Intelligence Graph"    },
  { id: "05_operations_war_room",       label: "Operations War Room"   },
  { id: "06_data_fusion_reactor",       label: "Data Fusion Reactor"   },
  { id: "07_document_intelligence_vault", label: "Document Vault"      },
  { id: "08_simulation_theatre",        label: "Simulation Theatre"    },
  { id: "09_analytics_observatory",     label: "Analytics Observatory" },
  { id: "10_system_security_core",      label: "Security Core"         },
];

function anchorEntries(anchors) {
  if (!anchors || typeof anchors !== "object") return [];
  return Object.entries(anchors)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => {
      const label = k.replace(/^[^.]+\./, "").replace(/_/g, " ");
      const raw   = typeof v === "object" && v !== null
        ? (v.value ?? v.text ?? v.label ?? JSON.stringify(v)).toString().slice(0, 120)
        : String(v ?? "—");
      const status = (typeof v === "object" && v !== null) ? (v.status || null) : null;
      return { label, raw, status };
    });
}

export default function SceneAnchorSnapshot() {
  const [open,     setOpen]     = useState(false);
  const [sceneMap, setSceneMap] = useState({});
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [expanded, setExpanded] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const results = await Promise.allSettled(
        SCENES.map((s) =>
          fetch(`/v1/cinematic/scene/${s.id}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((d) => ({ id: s.id, data: d }))
        )
      );
      const map = {};
      results.forEach((r) => {
        if (r.status === "fulfilled") {
          map[r.value.id] = r.value.data;
        }
      });
      setSceneMap(map);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => {
      clearInterval(timerRef.current);
    };
  }, [open, load]);

  const liveCount    = Object.keys(sceneMap).length;
  const totalAnchors = Object.values(sceneMap).reduce(
    (n, d) => n + anchorEntries(d?.anchors).length, 0
  );

  return (
    <>
      {/* Tab */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          left: 0,
          top: "5%",
          zIndex: 3200,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: open ? ACCENT : "rgba(5,10,18,0.92)",
          color: open ? "#000814" : ACCENT,
          border: `1px solid ${ACCENT}55`,
          borderLeft: "none",
          borderRadius: "0 6px 6px 0",
          padding: "10px 6px",
          fontSize: 10,
          letterSpacing: 2,
          fontFamily: "'JetBrains Mono', monospace",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        SCENES ▶
      </div>

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -430,
          top: 0,
          height: "100vh",
          width: 420,
          zIndex: 3199,
          background: "rgba(5,10,18,0.97)",
          borderRight: `1px solid ${ACCENT}44`,
          boxShadow: open ? `4px 0 40px ${ACCENT}14` : "none",
          transition: "left 0.28s ease",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono', monospace",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px 10px",
            borderBottom: `1px solid ${ACCENT}33`,
            flexShrink: 0,
          }}
        >
          <div style={{ color: ACCENT, fontSize: 11, letterSpacing: 2 }}>
            ◈ SCENE ANCHOR SNAPSHOT
          </div>
          <div style={{ color: "#4E6070", fontSize: 10, marginTop: 3 }}>
            {loading
              ? "fetching all 10 scenes…"
              : liveCount === 0
              ? "open to load live anchor data"
              : `${liveCount}/10 scenes live · ${totalAnchors} anchors bound`}
          </div>
        </div>

        {/* Scene list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {err && (
            <div
              style={{
                margin: "10px 16px",
                color: "#F87171",
                fontSize: 11,
                padding: "8px 10px",
                border: "1px solid #F8717144",
                borderRadius: 6,
              }}
            >
              {err}
            </div>
          )}

          {SCENES.map((s) => {
            const data    = sceneMap[s.id];
            const entries = anchorEntries(data?.anchors);
            const health  = data?.health;
            const isExp   = expanded === s.id;
            const live    = Boolean(data);

            return (
              <div
                key={s.id}
                style={{ borderBottom: `1px solid ${ACCENT}14` }}
              >
                {/* Scene row */}
                <div
                  onClick={() => setExpanded(isExp ? null : s.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 14px",
                    cursor: "pointer",
                    background: isExp ? `${ACCENT}0E` : "transparent",
                    borderLeft: isExp ? `2px solid ${ACCENT}` : "2px solid transparent",
                  }}
                >
                  <span style={{ color: live ? ACCENT : "#3A5060", fontSize: 12, flexShrink: 0 }}>
                    {live ? "◈" : "○"}
                  </span>
                  <span
                    style={{
                      color: live ? "#DCEBF5" : "#4E6070",
                      fontSize: 12,
                      flex: 1,
                      letterSpacing: 0.4,
                    }}
                  >
                    {s.label}
                  </span>
                  {live && (
                    <span style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, flexShrink: 0 }}>
                      {health
                        ? `${health.filled ?? entries.length}/${health.total ?? entries.length}`
                        : entries.length}{" "}
                      anchors
                    </span>
                  )}
                  <span
                    style={{
                      color: live ? ACCENT : "#3A5060",
                      fontSize: 10,
                      flexShrink: 0,
                      opacity: live ? 1 : 0.4,
                    }}
                  >
                    {isExp ? "▾" : "▸"}
                  </span>
                </div>

                {/* Anchor rows (expanded) */}
                {isExp && live && (
                  <div style={{ paddingBottom: 6, paddingLeft: 8 }}>
                    {entries.length === 0 && (
                      <div
                        style={{
                          padding: "6px 20px",
                          color: "#4E6070",
                          fontSize: 10,
                        }}
                      >
                        no anchors returned
                      </div>
                    )}
                    {entries.map(({ label, raw, status }, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                          padding: "3px 16px 3px 20px",
                        }}
                      >
                        <span
                          style={{
                            color:
                              status === "ok"
                                ? "#4ADE80"
                                : status === "acquiring"
                                ? "#F59E0B"
                                : `${ACCENT}88`,
                            fontSize: 8,
                            flexShrink: 0,
                            marginTop: 3,
                          }}
                        >
                          ●
                        </span>
                        <span
                          style={{
                            color: "#7A95AB",
                            fontSize: 10,
                            letterSpacing: 0.4,
                            minWidth: 100,
                            flexShrink: 0,
                          }}
                        >
                          {label}
                        </span>
                        <span
                          style={{
                            color: "#DCEBF5",
                            fontSize: 10,
                            flex: 1,
                            wordBreak: "break-all",
                            opacity: 0.85,
                          }}
                        >
                          {raw}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "7px 16px",
            borderTop: `1px solid ${ACCENT}1A`,
            color: "#2E4050",
            fontSize: 10,
            letterSpacing: 1,
            flexShrink: 0,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>GET /v1/cinematic/scene/&#123;id&#125; × 10</span>
          <span>5 min poll</span>
        </div>
      </div>
    </>
  );
}
