/**
 * ArchitectureMapDrawer — Feature 142
 * Right-edge slide-in drawer showing the live 10-layer JARVIS architecture map
 * from GET /v1/jarvis/architecture, polling every 5 min while open.
 * Tab at 87 % from top on the right edge (between RevDbHistoryDrawer 85 %
 * and ActivityFeedPanel 90 %).
 *
 * Mounted in src/Layout.jsx after RevDbHistoryDrawer.
 *
 * Endpoint: GET /v1/jarvis/architecture
 * → { layers: [{ layer, key, status, modules, present, note }],
 *     summary: { total, native, partial, interface, missing } }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 360;
const ACCENT = "#06B6D4";
const AMBER = "#F59E0B";
const GREEN = "#22C55E";
const RED = "#EF4444";
const BLUE = "#3B82F6";
const GREY = "#64748B";

const STATUS_COLOR = {
  native: GREEN,
  partial: AMBER,
  interface: BLUE,
  missing: RED,
};

const STATUS_LABEL = {
  native: "NATIVE",
  partial: "PARTIAL",
  interface: "IFACE",
  missing: "MISSING",
};

export default function ArchitectureMapDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/jarvis/architecture")
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

  const layers = data?.layers ?? [];
  const summary = data?.summary ?? null;
  const nativeCount = summary?.native ?? 0;
  const totalCount = summary?.total ?? 0;

  return (
    <>
      {/* Fixed toggle tab — right edge, 87 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close architecture map" : "Open architecture map"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "87%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderRight: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
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
        {open ? "ARCH ▶" : "ARCH ◀"}
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
            gap: 8,
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            JARVIS ARCHITECTURE
          </span>
          {summary && (
            <span
              style={{
                fontSize: 9,
                color: GREEN,
                border: `1px solid ${GREEN}55`,
                borderRadius: 3,
                padding: "1px 6px",
                letterSpacing: 1,
              }}
            >
              {nativeCount}/{totalCount} NATIVE
            </span>
          )}
        </div>

        {/* Summary row */}
        {summary && (
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "6px 14px",
              borderBottom: `1px solid ${S.border}`,
              flexShrink: 0,
              flexWrap: "wrap",
            }}
          >
            {[
              { key: "native", color: GREEN },
              { key: "partial", color: AMBER },
              { key: "interface", color: BLUE },
              { key: "missing", color: RED },
            ].map(({ key, color }) =>
              summary[key] > 0 ? (
                <span
                  key={key}
                  style={{
                    fontSize: 9,
                    color,
                    border: `1px solid ${color}44`,
                    borderRadius: 3,
                    padding: "1px 5px",
                    letterSpacing: 1,
                  }}
                >
                  {summary[key]} {STATUS_LABEL[key]}
                </span>
              ) : null
            )}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: AMBER, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : layers.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO ARCHITECTURE DATA
            </div>
          ) : (
            layers.map((layer) => {
              const statusColor = STATUS_COLOR[layer.status] ?? GREY;
              const isExpanded = expanded === layer.key;
              const presentCount = (layer.present ?? []).length;
              const totalMods = (layer.modules ?? []).length;

              return (
                <div
                  key={layer.key}
                  style={{
                    borderBottom: `1px solid ${S.border}`,
                    cursor: "pointer",
                    background: isExpanded ? `${statusColor}08` : "transparent",
                  }}
                  onClick={() => setExpanded(isExpanded ? null : layer.key)}
                >
                  {/* Layer row */}
                  <div
                    style={{
                      padding: "9px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {/* Status LED */}
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: statusColor,
                        flexShrink: 0,
                        boxShadow: `0 0 5px ${statusColor}88`,
                      }}
                    />

                    {/* Layer name */}
                    <span
                      style={{
                        color: "#DCEBF5",
                        fontSize: S.fs.xs,
                        flex: 1,
                        letterSpacing: 0.5,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {layer.layer}
                    </span>

                    {/* Status badge */}
                    <span
                      style={{
                        fontSize: 9,
                        color: statusColor,
                        border: `1px solid ${statusColor}44`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        flexShrink: 0,
                      }}
                    >
                      {STATUS_LABEL[layer.status] ?? layer.status.toUpperCase()}
                    </span>

                    {/* Module count (only when modules exist) */}
                    {totalMods > 0 && (
                      <span
                        style={{
                          fontSize: 9,
                          color: `${ACCENT}aa`,
                          flexShrink: 0,
                          letterSpacing: 0.5,
                        }}
                      >
                        {presentCount}/{totalMods}
                      </span>
                    )}

                    <span style={{ fontSize: 9, color: S.text, flexShrink: 0 }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: "0 14px 10px 28px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {/* Note */}
                      {layer.note && (
                        <span
                          style={{
                            color: S.text,
                            fontSize: 10,
                            letterSpacing: 0.3,
                            lineHeight: 1.5,
                          }}
                        >
                          {layer.note}
                        </span>
                      )}

                      {/* Modules */}
                      {(layer.modules ?? []).length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {(layer.modules ?? []).map((mod) => {
                            const present = (layer.present ?? []).includes(mod);
                            return (
                              <div
                                key={mod}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <span
                                  style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: "50%",
                                    background: present ? GREEN : RED,
                                    flexShrink: 0,
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: 9,
                                    color: present ? "#A0C4D0" : `${RED}99`,
                                    letterSpacing: 0.3,
                                    fontFamily: "monospace",
                                  }}
                                >
                                  {mod.replace(/^server\.(services|routes)\./, "")}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {(layer.modules ?? []).length === 0 && (
                        <span style={{ fontSize: 9, color: BLUE, letterSpacing: 1 }}>
                          INTERFACE ONLY — no native modules
                        </span>
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
            fontSize: 9,
            color: `${ACCENT}66`,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          GET /v1/jarvis/architecture · 5 MIN POLL
        </div>
      </div>
    </>
  );
}
