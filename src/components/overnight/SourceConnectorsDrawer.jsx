/**
 * SourceConnectorsDrawer — Feature 20
 * Left-edge slide-in drawer listing registered data-source connectors from
 * GET /v1/sources.
 *
 * Tab at 20 % from top on left edge (above ScenarioRunsPanel at 35 %).
 * Polls every 3 minutes while open.
 * Mounted in src/Layout.jsx after KnowledgeTimelinePanel.
 *
 * Endpoint: GET /v1/sources
 * → { items: [{ id, name, kind, config, created_ts }], count: number, kinds: string[] }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 180_000;
const DRAWER_W = 300;
const LIME = "#7FFF5F";
const AMBER = "#F5A623";

const KIND_COLORS = {
  rest_json: "#29E7FF",
  csv_url:   "#B57BFF",
  rss:       "#FFD700",
  inline:    "#7FFF5F",
};

function kindColor(kind) {
  return KIND_COLORS[kind] || "#DCEBF5";
}

function relAge(tsMs) {
  if (!tsMs) return "—";
  const sec = Math.floor((Date.now() - tsMs) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function SourceConnectorsDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/sources")
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

  const items = data?.items ?? [];

  return (
    <>
      {/* Fixed toggle tab — left edge, 20 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close source connectors" : "Open source connectors"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "20%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9010,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${LIME}55`,
          borderLeft: open ? "none" : `1px solid ${LIME}55`,
          color: LIME,
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
        {open ? "SOURCES ▶" : "SOURCES ◀"}
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
          borderRight: `1px solid ${LIME}33`,
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
          <span style={{ fontSize: S.fs.xs, color: LIME, letterSpacing: 2, flex: 1 }}>
            SOURCE CONNECTORS
          </span>
          {data && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {data.count ?? items.length}
            </span>
          )}
        </div>

        {/* Available kinds row */}
        {data?.kinds?.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              padding: "6px 14px",
              borderBottom: `1px solid ${S.border}`,
              flexShrink: 0,
            }}
          >
            {data.kinds.map((k) => (
              <span
                key={k}
                style={{
                  fontSize: 9,
                  color: kindColor(k),
                  border: `1px solid ${kindColor(k)}44`,
                  borderRadius: 3,
                  padding: "1px 5px",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                {k}
              </span>
            ))}
          </div>
        )}

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
          ) : items.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO CONNECTORS REGISTERED
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid ${S.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {/* Name + age */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
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
                    {item.name}
                  </span>
                  <span style={{ fontSize: S.fs.xxs, color: S.text, flexShrink: 0 }}>
                    {relAge(item.created_ts)}
                  </span>
                </div>

                {/* Kind badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 9,
                      color: kindColor(item.kind),
                      border: `1px solid ${kindColor(item.kind)}44`,
                      borderRadius: 3,
                      padding: "1px 5px",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      flexShrink: 0,
                    }}
                  >
                    {item.kind}
                  </span>
                  {item.config?.url && (
                    <span
                      style={{
                        fontSize: S.fs.xxs,
                        color: S.text,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.config.url}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
