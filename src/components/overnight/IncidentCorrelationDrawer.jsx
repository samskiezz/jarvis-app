/**
 * IncidentCorrelationDrawer — right-edge slide-in drawer listing correlated
 * incident clusters from GET /v1/run-correlator/clusters.
 *
 * Tab sits at 23 % from top (between KnowledgeTimelinePanel 20 % and
 * SensorActivityPanel 27 %). Mounted in src/Layout.jsx after EntityResolutionPanel.
 *
 * Endpoint: GET /v1/run-correlator/clusters?limit=20
 * → { ok: bool, items: [{ cluster_id, ts, window_s, event_count, max_severity,
 *                          event_ids: int[], summary }],
 *     count: number, source: string }
 */
import { useEffect, useRef, useState } from "react";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 30_000;
const DRAWER_W = 320;
const ORANGE = "#F97316";

const SEV_COLOR = {
  critical: "#E8203C",
  high: "#FF6B35",
  medium: "#F59E0B",
  low: "#22C55E",
};

function relTime(ts_ms) {
  if (!ts_ms) return "—";
  const diff = Math.floor((Date.now() - ts_ms) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtWindow(s) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

export default function IncidentCorrelationDrawer() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [source, setSource] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  async function fetchClusters() {
    if (loading) return;
    setLoading(true);
    try {
      const data = await kimiClient.request("/v1/run-correlator/clusters?limit=20");
      const raw = data?.items ?? [];
      setItems(raw);
      setSource(data?.source ?? "");
      setError(null);
    } catch (err) {
      setError(err.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    fetchClusters();
    timerRef.current = setInterval(fetchClusters, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const critical = items.filter(
    (c) => (c.max_severity || "").toLowerCase() === "critical"
  ).length;

  const tabStyle = {
    position: "fixed",
    top: "23%",
    right: open ? DRAWER_W : 0,
    zIndex: 120,
    background: "rgba(5,10,18,0.97)",
    border: `1px solid ${ORANGE}55`,
    borderRight: "none",
    borderRadius: "6px 0 0 6px",
    padding: "7px 10px",
    cursor: "pointer",
    color: ORANGE,
    fontSize: 9,
    letterSpacing: 2,
    fontFamily: "'JetBrains Mono', monospace",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    transform: "rotate(180deg)",
    userSelect: "none",
    transition: "right 0.22s ease",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  };

  const drawerStyle = {
    position: "fixed",
    top: 0,
    right: open ? 0 : -DRAWER_W,
    width: DRAWER_W,
    height: "100vh",
    zIndex: 119,
    background: "rgba(5,10,18,0.97)",
    borderLeft: `1px solid ${ORANGE}44`,
    transition: "right 0.22s ease",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'JetBrains Mono', monospace",
    overflowY: "auto",
  };

  return (
    <>
      {/* Tab */}
      <div style={tabStyle} onClick={() => setOpen((o) => !o)} title="Incident Correlation Clusters">
        {critical > 0 && (
          <span
            style={{
              background: "#E8203C",
              color: "#fff",
              borderRadius: "50%",
              width: 14,
              height: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: 0,
              writingMode: "horizontal-tb",
              transform: "rotate(180deg)",
            }}
          >
            {critical}
          </span>
        )}
        CORR ◀
      </div>

      {/* Drawer */}
      <div style={drawerStyle}>
        {/* Header */}
        <div
          style={{
            padding: "14px 14px 10px",
            borderBottom: `1px solid ${ORANGE}33`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              color: ORANGE,
              fontSize: 10,
              letterSpacing: 2,
              marginBottom: 4,
            }}
          >
            ◈ INCIDENT CORRELATIONS
          </div>
          <div style={{ color: "#4e6070", fontSize: 9, letterSpacing: 1 }}>
            {loading
              ? "REFRESHING…"
              : error
              ? `ERROR: ${error}`
              : `${items.length} cluster${items.length !== 1 ? "s" : ""} · ${source}`}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!loading && !error && items.length === 0 && (
            <div
              style={{
                padding: "24px 14px",
                color: "#4e6070",
                fontSize: 10,
                textAlign: "center",
                letterSpacing: 1,
              }}
            >
              NO CORRELATION CLUSTERS
            </div>
          )}
          {items.map((c) => {
            const sev = (c.max_severity || "low").toLowerCase();
            const sevColor = SEV_COLOR[sev] || "#4e6070";
            return (
              <div
                key={c.cluster_id}
                style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid #1a2535`,
                  borderLeft: `2px solid ${sevColor}`,
                }}
              >
                {/* Top row: severity badge + event count + window + age */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      background: `${sevColor}22`,
                      border: `1px solid ${sevColor}55`,
                      color: sevColor,
                      borderRadius: 3,
                      padding: "1px 5px",
                      fontSize: 8,
                      letterSpacing: 1,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      flexShrink: 0,
                    }}
                  >
                    {sev}
                  </span>
                  <span
                    style={{ color: "#DCEBF5", fontSize: 9, letterSpacing: 1 }}
                  >
                    {c.event_count} event{c.event_count !== 1 ? "s" : ""}
                  </span>
                  <span style={{ color: "#4e6070", fontSize: 9 }}>
                    /{fmtWindow(c.window_s ?? 120)} window
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      color: "#4e6070",
                      fontSize: 8,
                      letterSpacing: 1,
                      flexShrink: 0,
                    }}
                  >
                    {relTime(c.ts ? c.ts * 1000 : 0)}
                  </span>
                </div>

                {/* Summary */}
                {c.summary && (
                  <div
                    style={{
                      color: "#7A95AB",
                      fontSize: 10,
                      letterSpacing: 0.3,
                      lineHeight: 1.4,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {c.summary}
                  </div>
                )}

                {/* Cluster ID */}
                <div
                  style={{
                    marginTop: 4,
                    color: "#2e4050",
                    fontSize: 8,
                    letterSpacing: 1,
                  }}
                >
                  #{(c.cluster_id || "").slice(0, 12)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "7px 14px",
            borderTop: `1px solid ${ORANGE}1A`,
            color: "#2e4050",
            fontSize: 8,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          GET /v1/run-correlator/clusters · 30 s poll
        </div>
      </div>
    </>
  );
}
