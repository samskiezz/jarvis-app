/**
 * MotorPredictorDrawer — left-edge slide-in drawer showing the JARVIS
 * dock-app motor-intent predictor status and top-5 predicted next actions.
 *
 * Tab sits at 18 % from top (left edge, between SpecForgeBrowser 16 %
 * and SourceConnectorsDrawer 20 %).
 * Mounted in src/Layout.jsx after BrainCrmPeopleDrawer.
 *
 * Endpoints:
 *   GET /v1/motor/stats    → { n_events, n_distinct_actions, last_event_ts,
 *                              model_present, gate_ready, window, min_samples, target_acc }
 *   GET /v1/motor/predict?top_k=5
 *                          → { ok, candidates: [{ action_id, confidence, source }],
 *                              gate_ready, context, advisory?, fallback? }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 120_000; // 2 min for stats
const DRAWER_W = 320;
const ACCENT   = "#0EA5E9"; // sky-blue
const GREY     = "#4e6070";

function relTs(ts) {
  if (!ts) return null;
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function gateLabel(stats, preds) {
  const ready = preds?.gate_ready ?? stats?.gate_ready;
  if (ready) return { label: "GATE READY", color: "#22C55E" };
  if (preds?.advisory) return { label: "ADVISORY",   color: "#F59E0B" };
  return { label: "COLD START", color: GREY };
}

const SOURCE_COLORS = {
  model:     "#22C55E",
  advisory:  "#F59E0B",
  frequency: "#94A3B8",
};

export default function MotorPredictorDrawer() {
  const [open,    setOpen]   = useState(false);
  const [stats,   setStats]  = useState(null);
  const [preds,   setPreds]  = useState(null);
  const [errS,    setErrS]   = useState(false);
  const [errP,    setErrP]   = useState(false);
  const [tick,    bump]      = useReducer((n) => n + 1, 0);
  const timerRef             = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    // Fetch stats
    kimiClient
      .request("/v1/motor/stats")
      .then((raw) => {
        if (alive) { setStats(raw); setErrS(false); }
      })
      .catch(() => { if (alive) setErrS(true); });

    // Fetch predictions
    kimiClient
      .request("/v1/motor/predict?top_k=5")
      .then((raw) => {
        if (alive) { setPreds(raw); setErrP(false); }
      })
      .catch(() => { if (alive) setErrP(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const candidates = preds?.candidates ?? [];
  const maxConf    = candidates.length > 0
    ? Math.max(...candidates.map((c) => c.confidence ?? 0))
    : 1;

  const gate = gateLabel(stats, preds);

  return (
    <>
      {/* Fixed toggle tab — left edge, 18 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close motor predictor" : "Open motor intent predictor"}
        style={{
          position:        "fixed",
          left:            open ? DRAWER_W : 0,
          top:             "18%",
          transform:       "translateY(-50%)",
          zIndex:          9001,
          writingMode:     "vertical-rl",
          textOrientation: "mixed",
          background:      "rgba(2,6,10,0.92)",
          border:          `1px solid ${ACCENT}55`,
          borderLeft:      open ? "none" : `1px solid ${ACCENT}55`,
          color:           ACCENT,
          fontFamily:      S.mono,
          fontSize:        S.fs.xxs,
          letterSpacing:   2,
          padding:         "10px 5px",
          cursor:          "pointer",
          borderRadius:    "0 4px 4px 0",
          transition:      "left 0.2s ease",
          userSelect:      "none",
        }}
      >
        {open ? "◀ MOTOR" : "MOTOR ▶"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position:            "fixed",
          left:                open ? 0 : -DRAWER_W,
          top:                 0,
          bottom:              0,
          width:               DRAWER_W,
          zIndex:              8991,
          background:          "rgba(2,6,10,0.96)",
          backdropFilter:      S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight:         `1px solid ${ACCENT}33`,
          display:             "flex",
          flexDirection:       "column",
          transition:          "left 0.2s ease",
          fontFamily:          S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          8,
            padding:      "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink:   0,
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            MOTOR INTENT
          </span>
          {stats !== null && (
            <span
              style={{
                fontSize:     S.fs.xxs,
                color:        gate.color,
                border:       `1px solid ${gate.color}55`,
                borderRadius: 3,
                padding:      "1px 5px",
                letterSpacing: 1,
              }}
            >
              {gate.label}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {!open ? null : (errS && errP) ? (
            <div style={{ padding: "20px 14px", color: "#e8203c", fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : (stats === null && preds === null) ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : (
            <>
              {/* Stats tiles */}
              {stats !== null && (
                <div
                  style={{
                    padding:      "8px 14px",
                    borderBottom: `1px solid ${S.border}`,
                  }}
                >
                  <div style={{ fontSize: S.fs.xxs, color: ACCENT, letterSpacing: 2, marginBottom: 6 }}>
                    USAGE STATS
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {[
                      { label: "EVENTS",    value: stats.n_events ?? 0 },
                      { label: "DISTINCT",  value: stats.n_distinct_actions ?? 0 },
                      { label: "WINDOW",    value: `${stats.window ?? 5} acts` },
                      { label: "TARGET ACC", value: `${Math.round((stats.target_acc ?? 0.4) * 100)}%` },
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        style={{
                          background:   "rgba(255,255,255,0.03)",
                          border:       `1px solid ${ACCENT}22`,
                          borderRadius: 4,
                          padding:      "5px 8px",
                        }}
                      >
                        <div style={{ fontSize: "9px", color: GREY, letterSpacing: 1 }}>{label}</div>
                        <div style={{ fontSize: S.fs.xs, color: S.textHi, marginTop: 2 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {/* Model present + last event */}
                  <div
                    style={{
                      display:    "flex",
                      alignItems: "center",
                      gap:        8,
                      marginTop:  6,
                      fontSize:   S.fs.xxs,
                      color:      GREY,
                    }}
                  >
                    <span
                      style={{
                        color:  stats.model_present ? "#22C55E" : GREY,
                        border: `1px solid ${stats.model_present ? "#22C55E55" : GREY + "33"}`,
                        borderRadius: 3,
                        padding: "1px 4px",
                        fontSize: "9px",
                        letterSpacing: 1,
                      }}
                    >
                      {stats.model_present ? "MODEL ON DISK" : "NO MODEL"}
                    </span>
                    {stats.last_event_ts ? (
                      <span>last event {relTs(stats.last_event_ts)}</span>
                    ) : (
                      <span>no events yet</span>
                    )}
                  </div>
                </div>
              )}

              {/* Predictions */}
              <div style={{ padding: "8px 14px 4px" }}>
                <div style={{ fontSize: S.fs.xxs, color: ACCENT, letterSpacing: 2, marginBottom: 6 }}>
                  PREDICTED NEXT ({candidates.length})
                </div>
                {errP ? (
                  <div style={{ color: "#e8203c", fontSize: S.fs.xxs, letterSpacing: 1 }}>
                    PREDICT UNAVAILABLE
                  </div>
                ) : preds === null ? (
                  <div style={{ color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>LOADING…</div>
                ) : candidates.length === 0 ? (
                  <div style={{ color: GREY, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                    NO PREDICTIONS
                  </div>
                ) : (
                  candidates.map((c, idx) => {
                    const src   = (c.source ?? "frequency").toUpperCase().slice(0, 4);
                    const color = SOURCE_COLORS[c.source] ?? GREY;
                    const pct   = maxConf > 0 ? Math.round((c.confidence / maxConf) * 100) : 0;

                    return (
                      <div
                        key={c.action_id ?? idx}
                        style={{
                          padding:      "6px 0",
                          borderBottom: idx < candidates.length - 1 ? `1px solid ${S.border}` : "none",
                        }}
                      >
                        {/* rank + label + badge */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: "9px", color: GREY, width: 14, textAlign: "right" }}>
                            {idx + 1}
                          </span>
                          <span
                            style={{
                              flex:         1,
                              fontSize:     S.fs.xs,
                              color:        S.textHi,
                              whiteSpace:   "nowrap",
                              overflow:     "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {c.action_id ?? "—"}
                          </span>
                          <span
                            style={{
                              fontSize:     "9px",
                              color:        color,
                              border:       `1px solid ${color}55`,
                              borderRadius: 3,
                              padding:      "1px 4px",
                              letterSpacing: 1,
                              flexShrink:   0,
                            }}
                          >
                            {src}
                          </span>
                          <span style={{ fontSize: "9px", color: GREY, minWidth: 30, textAlign: "right" }}>
                            {Math.round((c.confidence ?? 0) * 100)}%
                          </span>
                        </div>
                        {/* confidence bar */}
                        <div
                          style={{
                            marginTop:    4,
                            marginLeft:   22,
                            height:       3,
                            background:   `${ACCENT}22`,
                            borderRadius: 2,
                          }}
                        >
                          <div
                            style={{
                              width:      `${pct}%`,
                              height:     "100%",
                              background: color,
                              borderRadius: 2,
                              transition: "width 0.4s ease",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Context strip (recent actions used) */}
              {preds?.context && preds.context.length > 0 && (
                <div
                  style={{
                    padding:      "4px 14px 8px",
                    borderTop:    `1px solid ${S.border}`,
                    marginTop:    4,
                  }}
                >
                  <div style={{ fontSize: "9px", color: GREY, letterSpacing: 1, marginBottom: 4 }}>
                    CONTEXT (last {preds.context.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {preds.context.map((a, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize:     "9px",
                          color:        S.textHi,
                          background:   `${ACCENT}11`,
                          border:       `1px solid ${ACCENT}22`,
                          borderRadius: 3,
                          padding:      "1px 5px",
                          letterSpacing: 0.5,
                        }}
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding:      "6px 14px",
            borderTop:    `1px solid ${S.border}`,
            fontSize:     S.fs.xxs,
            color:        S.text,
            letterSpacing: 1,
            flexShrink:   0,
          }}
        >
          {stats !== null
            ? `${stats.n_events ?? 0} EVENTS · ${stats.n_distinct_actions ?? 0} ACTIONS · 2 MIN POLL`
            : errS
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
