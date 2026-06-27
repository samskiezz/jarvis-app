/**
 * OntologyTypesBrowser — Feature 147
 * Left-edge slide-in drawer at 71 % from top listing every registered ontology
 * type from GET /v1/ontology/types.  Clicking a type row fetches
 * GET /v1/ontology/objects?type=X&limit=20 on demand (cached per session) and
 * expands an inline instance list.  Polls the type catalog every 5 min while open.
 *
 * Mounted in src/Layout.jsx after <RunCorrelatorClustersDrawer />.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 320;
const ACCENT = "#A78BFA";
const AMBER = "#F59E0B";

const TYPE_PALETTE = [
  "#29E7FF", "#B57BFF", "#7FFF5F", "#FFD700", "#F59E0B",
  "#38BDF8", "#F472B6", "#A3E635", "#34D399", "#FB923C",
];

function typeAccent(name, index) {
  return TYPE_PALETTE[index % TYPE_PALETTE.length];
}

function relAge(ts) {
  if (!ts) return null;
  const ms = typeof ts === "number"
    ? (ts > 1e12 ? ts : ts * 1000)
    : Date.parse(ts);
  if (!ms || isNaN(ms)) return null;
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function OntologyTypesBrowser() {
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  /* per-type expanded state and cached instance lists */
  const [expanded, setExpanded] = useState({});
  const [instances, setInstances] = useState({});
  const [instLoading, setInstLoading] = useState({});

  /* poll type catalog while drawer is open */
  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/ontology/types")
      .then((d) => {
        if (alive) {
          setTypes(d);
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

  function toggleType(typeName) {
    setExpanded((prev) => {
      const next = { ...prev, [typeName]: !prev[typeName] };
      if (next[typeName] && !instances[typeName] && !instLoading[typeName]) {
        fetchInstances(typeName);
      }
      return next;
    });
  }

  function fetchInstances(typeName) {
    setInstLoading((prev) => ({ ...prev, [typeName]: true }));
    kimiClient
      .request(`/v1/ontology/objects?type=${encodeURIComponent(typeName)}&limit=20`)
      .then((d) => {
        setInstances((prev) => ({ ...prev, [typeName]: d?.items ?? [] }));
      })
      .catch(() => {
        setInstances((prev) => ({ ...prev, [typeName]: null }));
      })
      .finally(() => {
        setInstLoading((prev) => ({ ...prev, [typeName]: false }));
      });
  }

  const typeList = types?.items ?? [];

  return (
    <>
      {/* Fixed toggle tab — left edge, 71 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close ontology types" : "Browse ontology types"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "71%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9011,
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
        {open ? "TYPES ▶" : "TYPES ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 9006,
          background: "rgba(2,6,10,0.97)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${ACCENT}33`,
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
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            ONTOLOGY TYPES
          </span>
          {types != null && (
            <span
              style={{
                fontSize: 9,
                color: ACCENT,
                border: `1px solid ${ACCENT}44`,
                borderRadius: 3,
                padding: "1px 6px",
                letterSpacing: 1,
              }}
            >
              {types.count ?? typeList.length}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: AMBER, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !types ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : typeList.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO TYPES REGISTERED
            </div>
          ) : (
            typeList.map((typeName, idx) => {
              const color = typeAccent(typeName, idx);
              const isOpen = !!expanded[typeName];
              const items = instances[typeName];
              const loading = !!instLoading[typeName];

              return (
                <div key={typeName} style={{ borderBottom: `1px solid ${S.border}` }}>
                  {/* Type row — click to expand */}
                  <button
                    onClick={() => toggleType(typeName)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "9px 14px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: "#000",
                        background: color,
                        borderRadius: 3,
                        padding: "1px 6px",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        fontFamily: S.mono,
                        flexShrink: 0,
                      }}
                    >
                      {typeName}
                    </span>
                    <span style={{ flex: 1 }} />
                    {items != null && (
                      <span
                        style={{
                          fontSize: 9,
                          color: color,
                          border: `1px solid ${color}44`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          fontFamily: S.mono,
                          letterSpacing: 1,
                        }}
                      >
                        {items.length}
                      </span>
                    )}
                    <span style={{ fontSize: 9, color: S.text, letterSpacing: 1 }}>
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </button>

                  {/* Expanded instance list */}
                  {isOpen && (
                    <div
                      style={{
                        borderTop: `1px solid ${color}22`,
                        background: "rgba(255,255,255,0.015)",
                        maxHeight: 240,
                        overflowY: "auto",
                      }}
                    >
                      {loading ? (
                        <div style={{ padding: "10px 18px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                          LOADING…
                        </div>
                      ) : items === null ? (
                        <div style={{ padding: "10px 18px", color: AMBER, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                          FETCH FAILED
                        </div>
                      ) : items.length === 0 ? (
                        <div style={{ padding: "10px 18px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                          NO INSTANCES
                        </div>
                      ) : (
                        items.map((obj) => {
                          const age = relAge(
                            obj.created_at
                              ?? obj.updated_at
                              ?? obj.props?.created_at
                              ?? obj.props?.updated_at
                          );
                          return (
                            <div
                              key={obj.id}
                              style={{
                                padding: "6px 18px",
                                borderBottom: `1px solid ${S.border}`,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <span
                                style={{
                                  color: "#DCEBF5",
                                  fontSize: S.fs.xxs,
                                  letterSpacing: 0.5,
                                  flex: 1,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {obj.label || obj.id}
                              </span>
                              {obj.mark && (
                                <span
                                  style={{
                                    fontSize: 8,
                                    color: "#94A3B8",
                                    border: "1px solid #94A3B844",
                                    borderRadius: 2,
                                    padding: "1px 4px",
                                    letterSpacing: 1,
                                    textTransform: "uppercase",
                                    flexShrink: 0,
                                  }}
                                >
                                  {obj.mark}
                                </span>
                              )}
                              {age && (
                                <span style={{ fontSize: 8, color: S.text, flexShrink: 0 }}>
                                  {age}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
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
            fontSize: 8,
            color: S.text,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          ONTOLOGY TYPES · POLL 5 MIN · INSTANCES ON DEMAND
        </div>
      </div>
    </>
  );
}
