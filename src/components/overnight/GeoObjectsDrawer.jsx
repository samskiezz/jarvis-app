/**
 * GeoObjectsDrawer — Feature 46
 * Left-edge slide-in drawer listing geo-tagged ontology objects from
 * GET /v1/geo/objects.
 *
 * Tab at 28 % from top on left edge (between SourceConnectorsDrawer 20 %
 * and ScenarioRunsPanel 35 %).
 * Polls every 3 minutes while open.
 * Mounted in src/Layout.jsx after SourceConnectorsDrawer.
 *
 * Endpoint: GET /v1/geo/objects
 * → { count: number, objects: [{ id, label, type, lat, lon, mark }] }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 180_000;
const DRAWER_W = 300;
const CYAN = "#06B6D4";
const AMBER = "#F5A623";

const TYPE_COLORS = {
  Person:       "#29E7FF",
  Organization: "#B57BFF",
  Location:     "#7FFF5F",
  Event:        "#FFD700",
  Asset:        "#F59E0B",
  Device:       "#38BDF8",
};

function typeColor(t) {
  return TYPE_COLORS[t] || CYAN;
}

function fmtCoord(v) {
  if (v == null) return "—";
  return Number(v).toFixed(4);
}

export default function GeoObjectsDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/geo/objects")
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

  const objects = data?.objects ?? [];

  return (
    <>
      {/* Fixed toggle tab — left edge, 28 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close geo objects" : "Open geo objects"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "28%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9010,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${CYAN}55`,
          borderLeft: open ? "none" : `1px solid ${CYAN}55`,
          color: CYAN,
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
        {open ? "GEO ▶" : "GEO ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 9005,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${CYAN}33`,
          display: "flex",
          flexDirection: "column",
          transition: "left 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: CYAN, letterSpacing: 2, flex: 1 }}>
            GEO OBJECTS
          </span>
          {data != null && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {data.count ?? objects.length}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: AMBER, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : objects.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO GEO OBJECTS FOUND
            </div>
          ) : (
            objects.map((obj) => (
              <div
                key={obj.id}
                style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid ${S.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {/* Label row */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span
                    style={{
                      color: "#DCEBF5",
                      fontSize: S.fs.xs,
                      letterSpacing: 0.5,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {obj.label || obj.id}
                  </span>
                  {obj.type && (
                    <span
                      style={{
                        fontSize: 9,
                        color: typeColor(obj.type),
                        border: `1px solid ${typeColor(obj.type)}44`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        flexShrink: 0,
                      }}
                    >
                      {obj.type}
                    </span>
                  )}
                </div>

                {/* Coordinates row */}
                <div style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 0.5 }}>
                  {fmtCoord(obj.lat)}°N&nbsp;&nbsp;{fmtCoord(obj.lon)}°E
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
