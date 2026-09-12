/**
 * OpsHealthSummaryDrawer — Feature 120
 * Right-edge slide-in drawer at 64 % from top.
 * Parallel-polls:
 *   GET /v1/jarvis/system/status every 60 s  → service health tiles
 *   GET /v1/ops/events             every 30 s → recent critical events
 * Accent: rose (#F43F5E).
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const OHSD_RE =
  /\b(ops health|ops health summary|service health summary|ohsd|ops status|critical events|service status summary|health summary|system services)\b/i;

export function isOhsdQuery(t) {
  return OHSD_RE.test(t || "");
}

export async function buildOhsdScript() {
  try {
    const [statusRes, eventsRes] = await Promise.all([
      fetch(`${apiBase()}/v1/jarvis/system/status`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/ops/events`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const status = await statusRes.json();
    const evData = await eventsRes.json();
    const services = status?.services ?? [];
    const events = Array.isArray(evData)
      ? evData
      : (evData?.items ?? evData?.events ?? evData?.results ?? []);
    const svcUp = services.filter((s) => {
      const st = (s.status || s.state || "").toLowerCase();
      return st === "ok" || st === "online" || st === "healthy";
    }).length;
    const critCount = events.filter(
      (e) => (e.severity ?? e.payload?.severity ?? e.level ?? 0) >= 70
    ).length;
    const allUp = svcUp === services.length && services.length > 0;
    return (
      `Ops health summary: ${svcUp} of ${services.length} service${services.length !== 1 ? "s" : ""} are up. ` +
      `${critCount} critical event${critCount !== 1 ? "s" : ""} detected in the ops stream. ` +
      (critCount > 0 ? "Immediate attention recommended." : allUp ? "All services operational." : "Check service status for details.")
    );
  } catch {
    return "Unable to reach the ops health endpoints at this time.";
  }
}

const POLL_STATUS_MS = 60_000;
const POLL_EVENTS_MS = 30_000;
const DRAWER_W = 340;
const ROSE = "#F43F5E";
const GREEN = "#22C55E";
const AMBER = "#F59E0B";

function relAge(ts) {
  if (!ts) return "";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function svcColor(status) {
  const st = (status || "").toLowerCase();
  if (st === "ok" || st === "online" || st === "healthy") return GREEN;
  if (st === "degraded" || st === "warn" || st === "warning") return AMBER;
  return ROSE;
}

function getSeverity(ev) {
  return ev.severity ?? ev.payload?.severity ?? ev.level ?? 0;
}

function getEventName(ev) {
  return ev.name || ev.message || ev.title || ev.type || `Event #${ev.id}`;
}

function getTimestamp(ev) {
  return ev.created_at || ev.timestamp || ev.time || ev.occurred_at || null;
}

export default function OpsHealthSummaryDrawer() {
  const [open, setOpen] = useState(false);
  const [statusData, setStatusData] = useState(null);
  const [eventsData, setEventsData] = useState(null);
  const [statusErr, setStatusErr] = useState(false);
  const [eventsErr, setEventsErr] = useState(false);
  const [statusTick, bumpStatus] = useReducer((n) => n + 1, 0);
  const [eventsTick, bumpEvents] = useReducer((n) => n + 1, 0);
  const statusTimer = useRef(null);
  const eventsTimer = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/jarvis/system/status")
      .then((d) => { if (alive) { setStatusData(d); setStatusErr(false); } })
      .catch(() => { if (alive) setStatusErr(true); });
    statusTimer.current = setTimeout(() => { if (alive) bumpStatus(); }, POLL_STATUS_MS);
    return () => {
      alive = false;
      clearTimeout(statusTimer.current);
    };
  }, [open, statusTick]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/ops/events")
      .then((d) => { if (alive) { setEventsData(d); setEventsErr(false); } })
      .catch(() => { if (alive) setEventsErr(true); });
    eventsTimer.current = setTimeout(() => { if (alive) bumpEvents(); }, POLL_EVENTS_MS);
    return () => {
      alive = false;
      clearTimeout(eventsTimer.current);
    };
  }, [open, eventsTick]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ohsd-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ohsd-toggle", onToggle);
  }, []);

  const services = statusData?.services ?? [];
  const rawEvents = Array.isArray(eventsData)
    ? eventsData
    : (eventsData?.items ?? eventsData?.events ?? eventsData?.results ?? []);
  const criticalEvents = rawEvents.filter((e) => getSeverity(e) >= 70);
  const critCount = criticalEvents.length;
  const svcUp = services.filter((svc) => {
    const st = (svc.status || svc.state || "").toLowerCase();
    return st === "ok" || st === "online" || st === "healthy";
  }).length;
  const svcTotal = services.length;

  return (
    <>
      {/* Fixed toggle tab — right edge, 64 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close ops health summary" : "Open ops health summary"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "64%",
          transform: "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ROSE}55`,
          borderRight: open ? "none" : `1px solid ${ROSE}55`,
          color: ROSE,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {open ? "OPS HEALTH ▶" : "OPS HEALTH ◀"}
        {!open && critCount > 0 && (
          <span
            style={{
              background: ROSE,
              color: "#fff",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {critCount}
          </span>
        )}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8995,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${ROSE}33`,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: S.fs.xs, color: ROSE, letterSpacing: 2, flex: 1 }}>
              OPS HEALTH SUMMARY
            </span>
            {statusData && svcTotal > 0 && (
              <span
                style={{
                  fontSize: 9,
                  color: svcUp === svcTotal ? GREEN : ROSE,
                  border: `1px solid ${svcUp === svcTotal ? GREEN : ROSE}55`,
                  borderRadius: 3,
                  padding: "1px 5px",
                  letterSpacing: 1,
                }}
              >
                {svcUp}/{svcTotal} UP
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {open && (
            <>
              {/* Service tiles section */}
              <div
                style={{
                  padding: "6px 14px 4px",
                  fontSize: 9,
                  color: `${ROSE}aa`,
                  letterSpacing: 2,
                }}
              >
                SERVICES
              </div>

              {statusErr ? (
                <div style={{ padding: "6px 14px 10px", color: ROSE, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                  STATUS UNREACHABLE
                </div>
              ) : !statusData ? (
                <div style={{ padding: "6px 14px 10px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                  LOADING…
                </div>
              ) : services.length === 0 ? (
                <div style={{ padding: "6px 14px 10px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                  NO SERVICES REPORTED
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: "4px 14px 10px" }}>
                  {services.map((svc, i) => {
                    const st = svc.status || svc.state || "unknown";
                    const col = svcColor(st);
                    return (
                      <div
                        key={svc.name || i}
                        style={{
                          background: `${col}0d`,
                          border: `1px solid ${col}33`,
                          borderRadius: 4,
                          padding: "5px 8px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9,
                            color: "#DCEBF5",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {svc.name || `SVC ${i + 1}`}
                        </span>
                        <span style={{ fontSize: 8, color: col, letterSpacing: 1, textTransform: "uppercase" }}>
                          {st}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Divider */}
              <div style={{ height: 1, background: S.border, margin: "0 14px 6px" }} />

              {/* Critical events section */}
              <div
                style={{
                  padding: "6px 14px 4px",
                  fontSize: 9,
                  color: `${ROSE}aa`,
                  letterSpacing: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                CRITICAL EVENTS
                {critCount > 0 && (
                  <span
                    style={{
                      background: ROSE,
                      color: "#fff",
                      borderRadius: 9,
                      padding: "0 5px",
                      fontSize: 8,
                      fontWeight: 700,
                    }}
                  >
                    {critCount}
                  </span>
                )}
              </div>

              {eventsErr ? (
                <div style={{ padding: "6px 14px", color: ROSE, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                  EVENTS UNREACHABLE
                </div>
              ) : !eventsData ? (
                <div style={{ padding: "6px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                  LOADING…
                </div>
              ) : critCount === 0 ? (
                <div style={{ padding: "6px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                  NO CRITICAL EVENTS
                </div>
              ) : (
                criticalEvents.slice(0, 20).map((ev, i) => {
                  const sev = getSeverity(ev);
                  const name = getEventName(ev);
                  const age = relAge(getTimestamp(ev));
                  const dotColor = sev >= 90 ? ROSE : AMBER;
                  return (
                    <div
                      key={ev.id ?? i}
                      style={{
                        padding: "7px 14px",
                        borderBottom: `1px solid ${S.border}`,
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: dotColor,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: S.fs.xxs,
                            color: "#DCEBF5",
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {name}
                        </span>
                        {age && (
                          <span style={{ fontSize: 9, color: `${S.text}88`, letterSpacing: 0.5, flexShrink: 0 }}>
                            {age}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span
                          style={{
                            fontSize: 8,
                            color: dotColor,
                            border: `1px solid ${dotColor}55`,
                            borderRadius: 3,
                            padding: "0 4px",
                            letterSpacing: 1,
                          }}
                        >
                          SEV {sev}
                        </span>
                        {(ev.type || ev.event_type) && (
                          <span
                            style={{
                              fontSize: 8,
                              color: `${ROSE}bb`,
                              border: `1px solid ${ROSE}33`,
                              borderRadius: 3,
                              padding: "0 4px",
                              letterSpacing: 0.5,
                            }}
                          >
                            {(ev.type || ev.event_type).toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: 9,
            color: `${S.text}66`,
            letterSpacing: 0.5,
            flexShrink: 0,
          }}
        >
          /v1/jarvis/system/status · 60s · /v1/ops/events · 30s
        </div>
      </div>
    </>
  );
}
