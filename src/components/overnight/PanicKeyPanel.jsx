/**
 * PanicKeyPanel — left-edge slide-in drawer at 98 % vertical showing the JARVIS
 * emergency control state: current mode, PM2 service health, last-hour LLM call
 * stats, background jobs, and a snapshot history log.
 *
 * Tab sits at 98 % from top (below MusicBankPanel at 96 %).
 * Mounted in src/Layout.jsx after IncidentCorrelationDrawer.
 *
 * Endpoints:
 *   GET /v1/panickey/active
 *     → { ts, mode, services: [{ name, status, cpu, mem_mb, uptime_min,
 *                                unstable_restarts, restarts }],
 *           calls: { total, ok, fail, avg_latency_ms, duplicate_prompt_ratio,
 *                    by_model, by_tier },
 *           jobs: [...], events: [...] }
 *
 *   GET /v1/panickey/snapshots
 *     → { items: [{ id, t, label, mode, disk: { pct, used_gb, total_gb }, calls }] }
 */
import { useEffect, useRef, useState } from "react";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 30_000;
const DRAWER_W = 330;
const RED = "#EF4444";
const GREEN = "#22C55E";
const AMBER = "#F59E0B";

const MODE_COLOR = {
  normal: GREEN,
  safe: AMBER,
  emergency: RED,
  recovery: "#60A5FA",
};

function modeColor(m) {
  return MODE_COLOR[(m || "normal").toLowerCase()] || GREEN;
}

function relTime(ts_s) {
  if (!ts_s) return "—";
  const diff = Math.floor(Date.now() / 1000 - ts_s);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function relTimeISO(iso) {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return relTime(Math.floor(ms / 1000));
}

const svcStatus = (s) => (s === "online" ? GREEN : s === "stopped" ? "#4e6070" : RED);

export default function PanicKeyPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("live"); // "live" | "snaps"

  // LIVE state
  const [active, setActive] = useState(null);
  const [liveErr, setLiveErr] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);

  // SNAPS state
  const [snaps, setSnaps] = useState([]);
  const [snapsErr, setSnapsErr] = useState(null);
  const [snapsLoaded, setSnapsLoaded] = useState(false);

  const timerRef = useRef(null);

  async function fetchActive() {
    if (liveLoading) return;
    setLiveLoading(true);
    try {
      const data = await kimiClient.request("/v1/panickey/active");
      setActive(data);
      setLiveErr(null);
    } catch (err) {
      setLiveErr(err.message || "fetch error");
    } finally {
      setLiveLoading(false);
    }
  }

  async function fetchSnaps() {
    try {
      const data = await kimiClient.request("/v1/panickey/snapshots");
      const raw = data?.items ?? (Array.isArray(data) ? data : []);
      setSnaps(raw);
      setSnapsErr(null);
    } catch (err) {
      setSnapsErr(err.message || "fetch error");
    } finally {
      setSnapsLoaded(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    fetchActive();
    timerRef.current = setInterval(fetchActive, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  useEffect(() => {
    if (open && tab === "snaps" && !snapsLoaded) {
      fetchSnaps();
    }
  }, [open, tab]);

  const mode = active?.mode || "normal";
  const accent = modeColor(mode);

  const tabBtnStyle = (t) => ({
    flex: 1,
    background: tab === t ? `${accent}22` : "transparent",
    border: "none",
    borderBottom: tab === t ? `1px solid ${accent}` : "1px solid transparent",
    color: tab === t ? accent : "#4e6070",
    fontSize: 9,
    letterSpacing: 2,
    fontFamily: "'JetBrains Mono', monospace",
    padding: "6px 0",
    cursor: "pointer",
  });

  return (
    <>
      {/* Tab */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="PanicKey Control Panel"
        style={{
          position: "fixed",
          top: "98%",
          left: open ? DRAWER_W : 0,
          zIndex: 120,
          background: "rgba(5,10,18,0.97)",
          border: `1px solid ${accent}55`,
          borderLeft: "none",
          borderRadius: "0 6px 6px 0",
          padding: "7px 10px",
          cursor: "pointer",
          color: accent,
          fontSize: 9,
          letterSpacing: 2,
          fontFamily: "'JetBrains Mono', monospace",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          userSelect: "none",
          transition: "left 0.22s ease",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        ▶ PKY
      </div>

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: open ? 0 : -DRAWER_W,
          width: DRAWER_W,
          height: "100vh",
          zIndex: 119,
          background: "rgba(5,10,18,0.97)",
          borderRight: `1px solid ${accent}44`,
          transition: "left 0.22s ease",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono', monospace",
          overflowY: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 14px 8px",
            borderBottom: `1px solid ${accent}33`,
            flexShrink: 0,
          }}
        >
          <div style={{ color: accent, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>
            ◈ PANICKEY CONTROL
          </div>
          {/* Mode badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                background: `${accent}22`,
                border: `1px solid ${accent}55`,
                color: accent,
                borderRadius: 3,
                padding: "2px 7px",
                fontSize: 9,
                letterSpacing: 2,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {mode}
            </span>
            <span style={{ color: "#4e6070", fontSize: 8, letterSpacing: 1 }}>
              {liveLoading
                ? "REFRESHING…"
                : liveErr
                ? `ERR: ${liveErr}`
                : active
                ? relTime(active.ts)
                : "—"}
            </span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: `1px solid ${accent}22`,
            flexShrink: 0,
          }}
        >
          <button style={tabBtnStyle("live")} onClick={() => setTab("live")}>
            LIVE
          </button>
          <button
            style={tabBtnStyle("snaps")}
            onClick={() => {
              setTab("snaps");
              if (!snapsLoaded) fetchSnaps();
            }}
          >
            SNAPS
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {tab === "live" && active && (
            <>
              {/* LLM Call Stats */}
              <Section label="LLM CALLS · 1H" accent={accent}>
                <StatRow label="TOTAL" value={active.calls?.total ?? 0} />
                <StatRow label="OK" value={active.calls?.ok ?? 0} color={GREEN} />
                <StatRow label="FAIL" value={active.calls?.fail ?? 0} color={active.calls?.fail > 0 ? RED : "#4e6070"} />
                <StatRow label="AVG LATENCY" value={`${active.calls?.avg_latency_ms ?? 0} ms`} />
                <StatRow
                  label="DUP RATIO"
                  value={`${((active.calls?.duplicate_prompt_ratio ?? 0) * 100).toFixed(0)}%`}
                  color={(active.calls?.duplicate_prompt_ratio ?? 0) >= 0.5 ? RED : "#4e6070"}
                />
              </Section>

              {/* PM2 Services */}
              <Section label={`SERVICES (${(active.services || []).length})`} accent={accent}>
                {(active.services || []).length === 0 ? (
                  <EmptyNote>NO PM2 SERVICES</EmptyNote>
                ) : (
                  (active.services || []).map((svc) => (
                    <div
                      key={svc.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 0",
                        borderBottom: "1px solid #1a2535",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: svcStatus(svc.status),
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          color: "#DCEBF5",
                          fontSize: 9,
                          letterSpacing: 0.5,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {svc.name}
                      </span>
                      <span style={{ color: "#4e6070", fontSize: 8, flexShrink: 0 }}>
                        {svc.cpu ?? "?"}% · {svc.mem_mb ?? "?"}M
                      </span>
                      {(svc.unstable_restarts ?? 0) > 0 && (
                        <span
                          style={{
                            background: `${RED}22`,
                            border: `1px solid ${RED}55`,
                            color: RED,
                            borderRadius: 3,
                            padding: "1px 4px",
                            fontSize: 8,
                            letterSpacing: 1,
                            flexShrink: 0,
                          }}
                        >
                          ↺{svc.unstable_restarts}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </Section>

              {/* Jobs */}
              <Section label={`JOBS (${(active.jobs || []).length})`} accent={accent}>
                {(active.jobs || []).length === 0 ? (
                  <EmptyNote>NO ACTIVE JOBS</EmptyNote>
                ) : (
                  (active.jobs || []).slice(0, 8).map((j, i) => (
                    <div key={j.id || i} style={{ color: "#7A95AB", fontSize: 9, padding: "3px 0" }}>
                      {j.name || j.id || `job-${i}`}
                    </div>
                  ))
                )}
              </Section>

              {/* Recent Events */}
              <Section label="RECENT EVENTS" accent={accent}>
                {(active.events || []).length === 0 ? (
                  <EmptyNote>NO EVENTS</EmptyNote>
                ) : (
                  (active.events || []).map((ev, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 6,
                        padding: "3px 0",
                        borderBottom: "1px solid #0d1825",
                        alignItems: "flex-start",
                      }}
                    >
                      <span
                        style={{
                          color:
                            ev.severity === "error" || ev.severity === "critical"
                              ? RED
                              : ev.severity === "warn"
                              ? AMBER
                              : "#4e6070",
                          fontSize: 8,
                          flexShrink: 0,
                          letterSpacing: 1,
                          paddingTop: 1,
                        }}
                      >
                        {(ev.severity || "info").toUpperCase().slice(0, 4)}
                      </span>
                      <span
                        style={{
                          color: "#7A95AB",
                          fontSize: 9,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ev.detail || ev.kind || "—"}
                      </span>
                    </div>
                  ))
                )}
              </Section>
            </>
          )}

          {tab === "live" && !active && !liveLoading && (
            <EmptyNote>{liveErr ? `ERROR: ${liveErr}` : "LOADING…"}</EmptyNote>
          )}

          {tab === "snaps" && (
            <>
              {snapsErr && (
                <div style={{ padding: "12px 14px", color: RED, fontSize: 9 }}>
                  ERROR: {snapsErr}
                </div>
              )}
              {!snapsErr && snaps.length === 0 && snapsLoaded && (
                <EmptyNote>NO SNAPSHOTS RECORDED</EmptyNote>
              )}
              {snaps
                .slice()
                .reverse()
                .map((snap) => {
                  const mc = modeColor(snap.mode);
                  return (
                    <div
                      key={snap.id}
                      style={{
                        padding: "9px 14px",
                        borderBottom: "1px solid #1a2535",
                        borderLeft: `2px solid ${mc}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 3,
                        }}
                      >
                        <span
                          style={{
                            background: `${mc}22`,
                            border: `1px solid ${mc}55`,
                            color: mc,
                            borderRadius: 3,
                            padding: "1px 5px",
                            fontSize: 8,
                            letterSpacing: 1,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            flexShrink: 0,
                          }}
                        >
                          {snap.mode || "normal"}
                        </span>
                        <span
                          style={{
                            color: "#DCEBF5",
                            fontSize: 9,
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {snap.label || "snapshot"}
                        </span>
                        <span
                          style={{
                            color: "#4e6070",
                            fontSize: 8,
                            flexShrink: 0,
                            letterSpacing: 1,
                          }}
                        >
                          {relTimeISO(snap.t)}
                        </span>
                      </div>
                      {snap.disk && (
                        <div style={{ color: "#4e6070", fontSize: 8, letterSpacing: 1 }}>
                          DISK {snap.disk.pct ?? "?"}% · {snap.disk.used_gb ?? "?"}
                          /{snap.disk.total_gb ?? "?"}GB
                        </div>
                      )}
                    </div>
                  );
                })}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${accent}1A`,
            color: "#2e4050",
            fontSize: 8,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          GET /v1/panickey/active · 30 s poll
        </div>
      </div>
    </>
  );
}

function Section({ label, accent, children }) {
  return (
    <div style={{ padding: "8px 14px 4px" }}>
      <div
        style={{
          color: accent,
          fontSize: 8,
          letterSpacing: 2,
          marginBottom: 5,
          borderBottom: `1px solid ${accent}22`,
          paddingBottom: 3,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "2px 0",
      }}
    >
      <span style={{ color: "#4e6070", fontSize: 9, letterSpacing: 1 }}>{label}</span>
      <span style={{ color: color || "#DCEBF5", fontSize: 9, letterSpacing: 1 }}>{value}</span>
    </div>
  );
}

function EmptyNote({ children }) {
  return (
    <div
      style={{
        padding: "16px 14px",
        color: "#4e6070",
        fontSize: 9,
        textAlign: "center",
        letterSpacing: 1,
      }}
    >
      {children}
    </div>
  );
}
