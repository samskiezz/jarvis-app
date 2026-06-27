/**
 * BrainGoaPlanDrawer — left-edge slide-in at 12% vertical.
 * Fetches GET /v1/brain/autopilot/plan (dry-run GOAP A* plan preview).
 * Shows current state tiles, goal dimensions, ordered action plan steps,
 * and unmet-dimension chips. Polls every 5 min while open.
 * Accent: #4ADE80 (emerald green).
 */
import { useState, useEffect, useCallback } from "react";

const ACCENT = "#4ADE80";
const POLL_MS = 5 * 60 * 1000;

const ACTION_COLORS = {
  connect_orphans: "#22D3EE",
  promote_themes: "#A78BFA",
  resolve_danglers: "#FCD34D",
  enrich_external: "#F97316",
};

function actionColor(name) {
  return ACTION_COLORS[name] || "#8CA0B0";
}

function Tile({ label, value, hi }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 60,
        background: "rgba(0,0,0,0.3)",
        border: `1px solid ${ACCENT}22`,
        borderRadius: 5,
        padding: "8px 10px",
        textAlign: "center",
      }}
    >
      <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ color: hi ? ACCENT : "#DCE8F0", fontSize: 15, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

export default function BrainGoaPlanDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/v1/brain/autopilot/plan");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setData(d);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const plan = data?.plan;
  const state = data?.state || {};
  const unmet = Array.isArray(data?.unmet) ? data.unmet : [];
  const reachable = data?.reachable;
  const planSteps = Array.isArray(plan) ? plan : [];
  const goalMet = Array.isArray(plan) && plan.length === 0;

  const statusColor =
    reachable === undefined ? "#4E6070" : goalMet ? ACCENT : reachable ? "#FCD34D" : "#EF4444";
  const statusLabel =
    reachable === undefined
      ? "—"
      : goalMet
      ? "GOAL MET"
      : reachable
      ? `${planSteps.length} STEP${planSteps.length !== 1 ? "S" : ""}`
      : "UNREACHABLE";

  return (
    <>
      {/* Tab */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Brain GOAP Plan Preview"
        style={{
          position: "fixed",
          top: "12%",
          left: open ? 320 : 0,
          zIndex: 120,
          background: open ? ACCENT : "rgba(5,10,18,0.88)",
          border: `1px solid ${ACCENT}55`,
          borderLeft: "none",
          borderRadius: "0 6px 6px 0",
          padding: "6px 8px",
          cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          letterSpacing: 1,
          color: open ? "#0a0014" : ACCENT,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transition: "left 0.25s, background 0.2s",
          userSelect: "none",
        }}
      >
        GOAP ▶
      </div>

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: open ? 0 : -320,
          bottom: 0,
          width: 320,
          zIndex: 119,
          background: "rgba(5,8,16,0.97)",
          border: `1px solid ${ACCENT}33`,
          borderLeft: "none",
          boxShadow: open ? `4px 0 32px ${ACCENT}18` : "none",
          transition: "left 0.25s",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${ACCENT}22`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: `linear-gradient(90deg, ${ACCENT}11, transparent)`,
            flexShrink: 0,
          }}
        >
          <span style={{ color: ACCENT, fontSize: 11, letterSpacing: 2, flex: 1 }}>
            BRAIN GOAP PLAN
          </span>
          {loading && (
            <span style={{ color: ACCENT, opacity: 0.5, fontSize: 9 }}>LOADING</span>
          )}
          {data && !loading && (
            <span
              style={{
                color: statusColor,
                fontSize: 9,
                letterSpacing: 1,
                border: `1px solid ${statusColor}44`,
                borderRadius: 3,
                padding: "1px 6px",
              }}
            >
              {statusLabel}
            </span>
          )}
          <span
            onClick={() => setOpen(false)}
            style={{
              color: "#4E6070",
              fontSize: 14,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            ×
          </span>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {err && (
            <div style={{ padding: "12px 16px", color: "#EF4444", fontSize: 10, letterSpacing: 1 }}>
              ERROR: {err}
            </div>
          )}

          {!err && !data && !loading && (
            <div style={{ padding: "24px 16px", color: "#4E6070", fontSize: 10, textAlign: "center", letterSpacing: 1 }}>
              LOADING PLAN…
            </div>
          )}

          {data && (
            <>
              {/* State tiles */}
              <div
                style={{
                  padding: "12px 16px 8px",
                  borderBottom: `1px solid ${ACCENT}11`,
                }}
              >
                <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 8 }}>
                  CURRENT STATE
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <Tile label="SCORE" value={state.score ?? "—"} hi={state.score >= 80} />
                  <Tile label="GAPS" value={state.gaps ?? "—"} />
                  <Tile label="ORPHANS" value={state.orphans ?? "—"} />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Tile label="THEMES" value={state.themes ?? "—"} />
                  <Tile label="LOW CONF" value={state.low_confidence ?? "—"} />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 60,
                      background: "rgba(0,0,0,0.3)",
                      border: `1px solid ${ACCENT}22`,
                      borderRadius: 5,
                      padding: "8px 10px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
                      NETWORK
                    </div>
                    <div
                      style={{
                        color: state.online ? "#4ADE80" : "#EF4444",
                        fontSize: 15,
                        fontWeight: 700,
                      }}
                    >
                      {state.online ? "ON" : "OFF"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Unmet dimensions */}
              {unmet.length > 0 && (
                <div
                  style={{
                    padding: "10px 16px",
                    borderBottom: `1px solid ${ACCENT}11`,
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginRight: 4 }}>
                    UNMET
                  </span>
                  {unmet.map((dim) => (
                    <span
                      key={dim}
                      style={{
                        color: "#EF4444",
                        fontSize: 9,
                        border: "1px solid #EF444455",
                        borderRadius: 3,
                        padding: "2px 6px",
                        letterSpacing: 1,
                      }}
                    >
                      {dim.toUpperCase()}
                    </span>
                  ))}
                </div>
              )}

              {/* Plan steps */}
              <div style={{ padding: "12px 16px" }}>
                <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 10 }}>
                  ACTION PLAN
                  {plan === null && (
                    <span style={{ color: "#EF4444", marginLeft: 8 }}>UNREACHABLE</span>
                  )}
                </div>

                {goalMet && (
                  <div
                    style={{
                      padding: "10px 12px",
                      background: `${ACCENT}11`,
                      border: `1px solid ${ACCENT}44`,
                      borderRadius: 5,
                      color: ACCENT,
                      fontSize: 10,
                      letterSpacing: 1,
                      textAlign: "center",
                    }}
                  >
                    ✓ GOAL ALREADY MET
                  </div>
                )}

                {plan === null && (
                  <div
                    style={{
                      padding: "10px 12px",
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid #EF444444",
                      borderRadius: 5,
                      color: "#EF4444",
                      fontSize: 10,
                      letterSpacing: 1,
                      textAlign: "center",
                    }}
                  >
                    NO PATH TO GOAL
                  </div>
                )}

                {planSteps.length > 0 &&
                  planSteps.map((step, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        marginBottom: 5,
                        background: "rgba(0,0,0,0.25)",
                        border: `1px solid ${actionColor(step)}22`,
                        borderRadius: 5,
                      }}
                    >
                      <span
                        style={{
                          color: "#4E6070",
                          fontSize: 9,
                          minWidth: 16,
                          textAlign: "right",
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}.
                      </span>
                      <span
                        style={{
                          color: actionColor(step),
                          fontSize: 9,
                          letterSpacing: 1,
                          border: `1px solid ${actionColor(step)}44`,
                          borderRadius: 3,
                          padding: "2px 6px",
                          flexShrink: 0,
                        }}
                      >
                        {step.replace(/_/g, " ").toUpperCase()}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 16px",
            borderTop: `1px solid ${ACCENT}1A`,
            color: "#2E4050",
            fontSize: 9,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          GET /v1/brain/autopilot/plan · 5-min poll
        </div>
      </div>
    </>
  );
}
