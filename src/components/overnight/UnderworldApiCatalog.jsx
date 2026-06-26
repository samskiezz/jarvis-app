/**
 * UnderworldApiCatalog — F128
 * Right-edge slide-in drawer at 35 % from top.
 * Shows the underworld backend health + discoverable endpoint catalog.
 *
 * Endpoints:
 *   GET /v1/underworld/health   — reachability probe; polled every 60 s
 *   GET /v1/underworld/catalog  — endpoint map; fetched once on first open
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 60_000;
const DRAWER_W = 320;
const VIOLET   = "#7C3AED";
const EMERALD  = "#10B981";
const RED      = "#E8203C";
const AMBER    = "#F59E0B";
const CYAN     = "#22D3EE";
const SLATE    = "#64748B";

const METHOD_COLOR = { GET: CYAN, POST: EMERALD };

function groupEndpoints(endpoints) {
  const groups = {};
  for (const ep of endpoints) {
    const seg = ep.path.split("/")[1] || "general";
    if (!groups[seg]) groups[seg] = [];
    groups[seg].push(ep);
  }
  return groups;
}

function StatusDot({ ok }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: ok ? EMERALD : RED,
        flexShrink: 0,
        boxShadow: ok ? `0 0 5px ${EMERALD}88` : `0 0 5px ${RED}88`,
      }}
    />
  );
}

export default function UnderworldApiCatalog() {
  const [open, setOpen]       = useState(false);
  const [health, setHealth]   = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [healthErr, setHealthErr] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);
  const catalogFetched = useRef(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient.request("/v1/underworld/health")
      .then((h) => { if (alive) { setHealth(h); setHealthErr(false); } })
      .catch(() => { if (alive) setHealthErr(true); });

    if (!catalogFetched.current) {
      kimiClient.request("/v1/underworld/catalog")
        .then((c) => { if (alive) { setCatalog(c); catalogFetched.current = true; } })
        .catch(() => {});
    }

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  const reachable = health?.reachable ?? false;
  const latencyMs = health?.latency_ms != null ? `${health.latency_ms.toFixed(0)} ms` : "—";
  const endpointCount = catalog?.endpoints?.length ?? 0;
  const groups = catalog?.endpoints ? groupEndpoints(catalog.endpoints) : {};

  function toggleGroup(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <>
      {/* Fixed toggle tab — right edge, 35 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close Underworld API Catalog" : "Open Underworld API Catalog"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "35%",
          transform: "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${VIOLET}55`,
          borderRight: open ? "none" : `1px solid ${VIOLET}55`,
          color: VIOLET,
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
        {open ? "UW API ▶" : "UW API ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8988,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${VIOLET}33`,
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
          <StatusDot ok={reachable && !healthErr} />
          <span style={{ fontSize: S.fs.xs, color: VIOLET, letterSpacing: 2, flex: 1 }}>
            UNDERWORLD API
          </span>
          {catalog && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: SLATE,
                letterSpacing: 1,
                border: `1px solid ${SLATE}44`,
                borderRadius: 3,
                padding: "1px 5px",
              }}
            >
              {endpointCount} ENDPOINTS
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {!open ? null : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Health tiles */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${(reachable && !healthErr) ? EMERALD : RED}22`,
                    borderRadius: 4,
                    padding: "6px 10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>STATUS</span>
                  <span
                    style={{
                      fontSize: S.fs.sm,
                      color: healthErr ? RED : reachable ? EMERALD : AMBER,
                      letterSpacing: 1,
                    }}
                  >
                    {healthErr ? "UNREACHABLE" : health ? (reachable ? "ONLINE" : "OFFLINE") : "LOADING…"}
                  </span>
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${VIOLET}22`,
                    borderRadius: 4,
                    padding: "6px 10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>LATENCY</span>
                  <span style={{ fontSize: S.fs.sm, color: VIOLET, letterSpacing: 1 }}>
                    {latencyMs}
                  </span>
                </div>
              </div>

              {/* Base URL */}
              {catalog?.base_url && (
                <div
                  style={{
                    fontSize: S.fs.xxs,
                    color: SLATE,
                    letterSpacing: 0,
                    padding: "4px 6px",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: 3,
                    border: `1px solid ${S.border}`,
                    wordBreak: "break-all",
                  }}
                >
                  {catalog.base_url}
                </div>
              )}

              {/* Catalog groups */}
              {!catalog ? (
                <div style={{ color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                  LOADING CATALOG…
                </div>
              ) : (
                Object.entries(groups).map(([group, eps]) => (
                  <div key={group}>
                    <button
                      onClick={() => toggleGroup(group)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        borderBottom: `1px solid ${S.border}`,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        paddingBottom: 4,
                        marginBottom: 4,
                        color: VIOLET,
                        fontFamily: S.mono,
                        fontSize: S.fs.xxs,
                        letterSpacing: 2,
                        paddingLeft: 0,
                      }}
                    >
                      <span style={{ color: SLATE, fontSize: 9 }}>
                        {expanded[group] ? "▼" : "▶"}
                      </span>
                      {group.toUpperCase()}
                      <span
                        style={{
                          marginLeft: "auto",
                          color: SLATE,
                          fontSize: S.fs.xxs,
                          letterSpacing: 1,
                        }}
                      >
                        {eps.length}
                      </span>
                    </button>

                    {expanded[group] && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                        {eps.map((ep, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 6,
                              padding: "4px 0",
                            }}
                          >
                            <span
                              style={{
                                fontSize: S.fs.xxs,
                                color: METHOD_COLOR[ep.method] ?? SLATE,
                                letterSpacing: 1,
                                flexShrink: 0,
                                width: 28,
                                textAlign: "right",
                              }}
                            >
                              {ep.method}
                            </span>
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: S.fs.xxs,
                                  color: "#A0C4D8",
                                  letterSpacing: 0,
                                  wordBreak: "break-all",
                                }}
                              >
                                {ep.path}
                              </div>
                              <div
                                style={{
                                  fontSize: S.fs.xxs,
                                  color: SLATE,
                                  letterSpacing: 0,
                                  lineHeight: 1.4,
                                  marginTop: 1,
                                }}
                              >
                                {ep.desc}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Poll hint */}
              <div
                style={{
                  fontSize: S.fs.xxs,
                  color: S.text,
                  letterSpacing: 1,
                  textAlign: "right",
                  marginTop: 4,
                }}
              >
                /v1/underworld/health · 60 s · catalog on open
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
