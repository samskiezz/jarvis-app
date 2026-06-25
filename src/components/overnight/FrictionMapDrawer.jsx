/**
 * FrictionMapDrawer — F93: Friction Map
 * Left-edge slide-in drawer showing repeated-workflow friction detected by
 * GET /v1/friction/scan. Polls every 5 minutes while open.
 *
 * Tab sits at 85 % from top (between ForgeApprovalsPanel 83 % and
 * SwarmJobsDrawer 88 %).
 *
 * Each finding row shows: colour-coded kind badge, count badge,
 * label text, and italic suggestion. A friction-score gauge in the header
 * shows 0-100 (green < 30, amber 30-60, red > 60).
 *
 * Mounted in src/Layout.jsx after <DeadZoneFinderDrawer />.
 *
 * Endpoint: GET /v1/friction/scan?hours=24
 * → { hours, score, findings: [{ kind, label, count, suggestion }],
 *     action_summary: { [action]: count } }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 360;
const ACCENT = "#F97316";

const KIND_COLORS = {
  repeated_action:  "#F97316",
  duplicate_prompt: "#6366F1",
  repeat_error:     "#EF4444",
};

function kindColor(k) {
  return KIND_COLORS[k] || "#94A3B8";
}

function kindLabel(k) {
  if (!k) return "UNKNOWN";
  return k.replace(/_/g, " ").toUpperCase();
}

function scoreColor(score) {
  if (score == null) return "#4E6070";
  if (score < 30) return "#22C55E";
  if (score < 60) return "#F59E0B";
  return "#EF4444";
}

function toFindings(d) {
  if (Array.isArray(d?.findings)) return d.findings;
  if (Array.isArray(d)) return d;
  return [];
}

export default function FrictionMapDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/friction/scan?hours=24")
      .then((d) => {
        if (alive) {
          setData(d);
          setErr(false);
        }
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => {
      if (alive) bump();
    }, POLL_MS);

    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  const findings = toFindings(data);
  const score = data?.score ?? null;
  const sc = scoreColor(score);

  return (
    <>
      {/* Fixed toggle tab — left edge, 85 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close friction map" : "Open friction map"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "85%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderLeft: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "0 4px 4px 0",
          transition: "left 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "FRIC ▶" : "FRIC ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8999,
          background: "rgba(3,8,18,0.97)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderRight: `1px solid ${ACCENT}44`,
          display: "flex",
          flexDirection: "column",
          fontFamily: S.mono,
          fontSize: S.fs.xs,
          transition: "left 0.2s ease",
          overflowY: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 14px 8px",
            borderBottom: `1px solid ${ACCENT}33`,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: ACCENT, letterSpacing: 2, fontWeight: 700 }}>
            FRICTION MAP
          </span>
          {score != null && (
            <span
              style={{
                background: `${sc}22`,
                color: sc,
                border: `1px solid ${sc}44`,
                borderRadius: 3,
                padding: "1px 6px",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
                fontWeight: 700,
              }}
            >
              SCORE {score}
            </span>
          )}
          {data != null && (
            <span
              style={{
                marginLeft: score != null ? 0 : "auto",
                background: `${ACCENT}22`,
                color: ACCENT,
                borderRadius: 3,
                padding: "1px 5px",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              {findings.length} findings
            </span>
          )}
          <button
            onClick={() => bump()}
            title="Reload"
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: `1px solid ${ACCENT}44`,
              borderRadius: 3,
              color: ACCENT,
              cursor: "pointer",
              fontSize: S.fs.xxs,
              letterSpacing: 1,
              padding: "1px 5px",
              fontFamily: "inherit",
            }}
          >
            ↺
          </button>
        </div>

        {/* Action summary strip */}
        {data?.action_summary && Object.keys(data.action_summary).length > 0 && (
          <div
            style={{
              padding: "5px 14px",
              borderBottom: `1px solid ${ACCENT}22`,
              flexShrink: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            {Object.entries(data.action_summary)
              .slice(0, 6)
              .map(([action, count]) => (
                <span
                  key={action}
                  style={{
                    background: "rgba(249,115,22,0.08)",
                    color: "#ADC1CD",
                    border: "1px solid rgba(249,115,22,0.2)",
                    borderRadius: 3,
                    padding: "0px 5px",
                    fontSize: S.fs.xxs,
                    letterSpacing: 0.5,
                  }}
                >
                  {action} ×{count}
                </span>
              ))}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {err && (
            <div
              style={{
                padding: "12px 14px",
                color: "#FF5555",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              ERROR — /v1/friction/scan unreachable
            </div>
          )}
          {!err && !data && (
            <div
              style={{
                padding: "16px 14px",
                color: "#4E6070",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              LOADING…
            </div>
          )}
          {!err && data && findings.length === 0 && (
            <div
              style={{
                padding: "16px 14px",
                color: "#4E6070",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO FRICTION DETECTED
            </div>
          )}
          {findings.map((item, i) => {
            const kc = kindColor(item.kind);
            return (
              <div
                key={i}
                style={{
                  padding: "8px 14px",
                  borderBottom: `1px solid ${ACCENT}11`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {/* Badge row */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      background: `${kc}22`,
                      color: kc,
                      border: `1px solid ${kc}44`,
                      borderRadius: 3,
                      padding: "1px 5px",
                      fontSize: S.fs.xxs,
                      letterSpacing: 0.8,
                      flexShrink: 0,
                      textTransform: "uppercase",
                    }}
                  >
                    {kindLabel(item.kind)}
                  </span>
                  {item.count != null && item.count > 1 && (
                    <span
                      style={{
                        background: "rgba(99,102,241,0.12)",
                        color: "#6366F1",
                        border: "1px solid rgba(99,102,241,0.2)",
                        borderRadius: 3,
                        padding: "1px 4px",
                        fontSize: S.fs.xxs,
                        letterSpacing: 0.5,
                        flexShrink: 0,
                      }}
                    >
                      ×{item.count}
                    </span>
                  )}
                </div>
                {/* Label */}
                <span
                  style={{
                    color: "#ADC1CD",
                    fontSize: S.fs.xs,
                    lineHeight: 1.4,
                  }}
                >
                  {item.label || `finding-${i}`}
                </span>
                {/* Suggestion */}
                {item.suggestion && (
                  <span
                    style={{
                      color: "#4E6070",
                      fontSize: S.fs.xxs,
                      letterSpacing: 0.4,
                      fontStyle: "italic",
                    }}
                  >
                    {item.suggestion}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: `1px solid ${ACCENT}22`,
            padding: "5px 14px",
            flexShrink: 0,
          }}
        >
          <span
            style={{ color: "#2E4050", fontSize: S.fs.xxs, letterSpacing: 1 }}
          >
            GET /v1/friction/scan · 5 min poll
          </span>
        </div>
      </div>
    </>
  );
}
