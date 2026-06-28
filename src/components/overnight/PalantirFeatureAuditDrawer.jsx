/**
 * PalantirFeatureAuditDrawer — Feature 165
 * Right-edge slide-in drawer at 22 % from top showing the JARVIS vs Palantir
 * feature parity audit from GET /v1/jarvis/ui/features, polling every 5 min.
 *
 * Each row shows: feature name + plane badge (foundry/gotham/aip/apollo/jarvis/audit)
 * + status badge (IMPL green / PARTIAL amber / MISSING red) + evidence hit count.
 * Missing and partial features float to the top.
 *
 * Mount point: src/Layout.jsx after <BrainThinkingToolsPanel />.
 *
 * Endpoint: GET /v1/jarvis/ui/features
 * → { total, summary: {implemented, partial, missing},
 *     features: [{feature, plane, status, evidence, render}],
 *     missing: string[], partial: string[], note: string }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 360;
const ACCENT = "#7C3AED";

const PLANE_COLOR = {
  foundry: "#0EA5E9",
  gotham:  "#F59E0B",
  aip:     "#8B5CF6",
  apollo:  "#22C55E",
  jarvis:  "#14B8A6",
  audit:   "#94A3B8",
};

const STATUS_COLOR = {
  implemented: "#4ADE80",
  partial:     "#F59E0B",
  missing:     "#F87171",
};

const STATUS_LABEL = {
  implemented: "IMPL",
  partial:     "PART",
  missing:     "MISS",
};

function Badge({ label, color, border }) {
  return (
    <span
      style={{
        fontSize: 9,
        color,
        border: `1px solid ${border || color}55`,
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: 1,
        flexShrink: 0,
        fontFamily: "monospace",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

export default function PalantirFeatureAuditDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/jarvis/ui/features")
      .then((res) => {
        if (!alive) return;
        setData(res);
        setErr(false);
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

  const features = data?.features ?? [];
  const summary = data?.summary ?? {};
  const missingCount = summary.missing ?? 0;
  const partialCount = summary.partial ?? 0;
  const implCount = summary.implemented ?? 0;

  return (
    <>
      {/* Fixed toggle tab — right edge, 22 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close feature audit" : "Open Palantir feature audit"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "22%",
          transform: "translateY(-50%)",
          zIndex: 9001,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderRight: open ? "none" : `1px solid ${ACCENT}55`,
          color: missingCount > 0 ? "#F87171" : ACCENT,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "AUDIT ▶" : `AUDIT ◀${missingCount > 0 ? ` ${missingCount}` : ""}`}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8993,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${ACCENT}33`,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            PALANTIR FEATURE PARITY
          </span>
          {data && (
            <>
              <Badge label={`${implCount} IMPL`} color="#4ADE80" />
              {partialCount > 0 && <Badge label={`${partialCount} PART`} color="#F59E0B" />}
              {missingCount > 0 && <Badge label={`${missingCount} MISS`} color="#F87171" />}
            </>
          )}
        </div>

        {/* Subtitle note */}
        {data?.note && (
          <div
            style={{
              padding: "5px 14px",
              borderBottom: `1px solid ${S.border}`,
              fontSize: 9,
              color: `${S.text}99`,
              letterSpacing: 0.5,
              flexShrink: 0,
            }}
          >
            {data.note}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: "#F59E0B", fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : features.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO FEATURES CATALOGUED
            </div>
          ) : (
            features.map((f) => {
              const planeColor = PLANE_COLOR[f.plane] || "#94A3B8";
              const statusColor = STATUS_COLOR[f.status] || "#94A3B8";
              const statusLabel = STATUS_LABEL[f.status] || f.status?.toUpperCase?.() || "?";
              return (
                <div
                  key={f.feature}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    borderLeft: f.status === "missing"
                      ? "2px solid #F87171"
                      : f.status === "partial"
                      ? "2px solid #F59E0B"
                      : "2px solid transparent",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {/* Feature name */}
                  <span
                    style={{
                      flex: 1,
                      color: f.status === "missing" ? "#F87171cc" : "#DCEBF5",
                      fontSize: S.fs.xs,
                      letterSpacing: 0.5,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {f.feature}
                  </span>

                  {/* Plane badge */}
                  <Badge label={f.plane} color={planeColor} />

                  {/* Status badge */}
                  <Badge label={statusLabel} color={statusColor} />

                  {/* Evidence count */}
                  {f.evidence > 0 && (
                    <span style={{ fontSize: 9, color: `${S.text}88`, letterSpacing: 0.5, minWidth: 20, textAlign: "right" }}>
                      ×{f.evidence}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${S.border}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 9, color: `${S.text}66`, letterSpacing: 0.5, flex: 1 }}>
            {data ? `${data.total ?? features.length} features · 5 min poll` : ""}
          </span>
          <button
            onClick={bump}
            style={{
              background: "none",
              border: `1px solid ${ACCENT}44`,
              color: ACCENT,
              fontFamily: S.mono,
              fontSize: 9,
              letterSpacing: 1,
              padding: "2px 8px",
              cursor: "pointer",
              borderRadius: 3,
            }}
          >
            ↻
          </button>
        </div>
      </div>
    </>
  );
}
