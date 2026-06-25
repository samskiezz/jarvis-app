/**
 * DeadZoneFinderDrawer — F92: Dead Zone Finder
 * Left-edge slide-in drawer listing repo cleanup-intelligence findings from
 * GET /v1/deadzone/scan. Polls every 5 minutes while open.
 *
 * Tab sits at 58 % from top (between ForecastModelsPanel 55 % and
 * ProofPacksDrawer 60 %).
 * Each row shows: finding label, colour-coded kind badge, suggestion text.
 *
 * Mounted in src/Layout.jsx after <VoiceForgeDrawer />.
 *
 * Endpoint: GET /v1/deadzone/scan?limit=100
 * → { items: [{ id, kind, label, suggestion, count?, age_days? }] }
 *  OR array of same items directly
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 360;
const ACCENT = "#FB7185";

const KIND_COLORS = {
  missing_file:     "#EF4444",
  stale_file:       "#F59E0B",
  untracked_route:  "#F97316",
  overlap:          "#06B6D4",
  duplicate_name:   "#6366F1",
};

function kindColor(k) {
  return KIND_COLORS[k] || "#94A3B8";
}

function kindLabel(k) {
  if (!k) return "UNKNOWN";
  return k.replace(/_/g, " ").toUpperCase();
}

function toItems(d) {
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.findings)) return d.findings;
  return [];
}

export default function DeadZoneFinderDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/deadzone/scan?limit=100")
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

  const items = toItems(data);

  return (
    <>
      {/* Fixed toggle tab — left edge, 58 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close dead zone finder" : "Open dead zone finder"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "58%",
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
        {open ? "DEAD ▶" : "DEAD ◀"}
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
            DEAD ZONE FINDER
          </span>
          {data != null && (
            <span
              style={{
                marginLeft: "auto",
                background: `${ACCENT}22`,
                color: ACCENT,
                borderRadius: 3,
                padding: "1px 5px",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              {items.length} findings
            </span>
          )}
          <button
            onClick={() => bump()}
            title="Reload"
            style={{
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
              ERROR — /v1/deadzone/scan unreachable
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
          {!err && data && items.length === 0 && (
            <div
              style={{
                padding: "16px 14px",
                color: "#4E6070",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO FINDINGS
            </div>
          )}
          {items.map((item, i) => {
            const kc = kindColor(item.kind);
            return (
              <div
                key={item.id ?? i}
                style={{
                  padding: "8px 14px",
                  borderBottom: `1px solid ${ACCENT}11`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {/* Label row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6,
                  }}
                >
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
                  {item.age_days != null && (
                    <span
                      style={{
                        background: "rgba(245,158,11,0.12)",
                        color: "#F59E0B",
                        border: "1px solid rgba(245,158,11,0.2)",
                        borderRadius: 3,
                        padding: "1px 4px",
                        fontSize: S.fs.xxs,
                        letterSpacing: 0.5,
                        flexShrink: 0,
                      }}
                    >
                      {item.age_days}d
                    </span>
                  )}
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
                {/* Label text */}
                <span
                  style={{
                    color: "#ADC1CD",
                    fontSize: S.fs.xs,
                    lineHeight: 1.4,
                  }}
                >
                  {item.label || item.id || `finding-${i}`}
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
          <span style={{ color: "#2E4050", fontSize: S.fs.xxs, letterSpacing: 1 }}>
            GET /v1/deadzone/scan · 5 min poll
          </span>
        </div>
      </div>
    </>
  );
}
