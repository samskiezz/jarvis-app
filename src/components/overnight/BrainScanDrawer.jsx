/**
 * BrainScanDrawer — F138
 * Left-edge slide-in drawer showing live brain knowledge-gap scan from
 * GET /v1/brain/autopilot/scan (5-min poll).
 *
 * Displays a health score gauge, six gap-metric tiles (gaps/orphans/
 * low_confidence/stale/themes/fixable), and vault totals (notes + links).
 * Score ≥ 80 → green, 60–79 → amber, < 60 → red.
 *
 * Accent: teal (#2DD4BF). Tab: left-edge at 30% from top.
 * Mount point: src/Layout.jsx after <GeoObjectsDrawer />.
 */
import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const POLL_MS = 300_000; // 5 minutes
const TEAL = "#2DD4BF";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function scoreColor(score) {
  if (score >= 80) return "#34D399";
  if (score >= 60) return "#FBBF24";
  return "#F87171";
}

function Tile({ label, value, accent }) {
  return (
    <div style={{
      flex: "1 1 calc(50% - 6px)",
      background: "rgba(45,212,191,0.04)",
      border: `1px solid ${accent || TEAL}22`,
      borderRadius: 6,
      padding: "8px 10px",
      display: "flex",
      flexDirection: "column",
      gap: 2,
    }}>
      <div style={{ color: "#4A6278", fontSize: 9, letterSpacing: 1 }}>{label}</div>
      <div style={{ color: accent || TEAL, fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export default function BrainScanDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  async function fetchScan() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase()}/v1/brain/autopilot/scan`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setData(d);
    } catch (e) {
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchScan();
    timerRef.current = setInterval(fetchScan, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, []);

  const score = data?.score ?? 100;
  const sc = scoreColor(score);
  const hasGaps = data ? (data.gaps + data.orphans + data.fixable) > 0 : false;

  const tabStyle = {
    position: "fixed",
    left: 0,
    top: "30%",
    transform: "translateY(-50%) rotate(-90deg) translateX(-50%)",
    transformOrigin: "left center",
    zIndex: 200,
    background: hasGaps && score < 60 ? "rgba(248,113,113,0.2)" : "rgba(8,14,22,0.85)",
    color: TEAL,
    border: `1px solid ${TEAL}55`,
    borderRadius: "0 0 6px 6px",
    padding: "4px 12px",
    fontSize: 10,
    letterSpacing: 2,
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: "nowrap",
  };

  const panelStyle = {
    position: "fixed",
    left: open ? 0 : -360,
    top: 0,
    height: "100vh",
    width: 340,
    background: "rgba(6,10,18,0.97)",
    borderRight: `1px solid ${TEAL}44`,
    boxShadow: open ? `4px 0 40px ${TEAL}22` : "none",
    zIndex: 199,
    overflowY: "auto",
    transition: "left 0.28s ease",
    fontFamily: "'JetBrains Mono', monospace",
    padding: "0 0 60px",
  };

  return (
    <>
      <button onClick={() => setOpen((v) => !v)} style={tabStyle} title="Brain Autopilot Scan">
        ◈ BSCAN {data ? `(${score})` : ""}
      </button>

      <div style={panelStyle}>
        {/* Header */}
        <div style={{
          position: "sticky", top: 0,
          background: "rgba(6,10,18,0.98)",
          borderBottom: `1px solid ${TEAL}33`,
          padding: "14px 16px 10px",
          zIndex: 1,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: TEAL, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              BRAIN AUTOPILOT SCAN
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16 }}
            >✕</button>
          </div>

          {/* Score gauge */}
          {data && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                border: `3px solid ${sc}`,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                boxShadow: `0 0 12px ${sc}44`,
                flexShrink: 0,
              }}>
                <span style={{ color: sc, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{score}</span>
                <span style={{ color: "#4A6278", fontSize: 8, letterSpacing: 1 }}>SCORE</span>
              </div>
              <div>
                <div style={{ color: "#9BBAD0", fontSize: 10 }}>
                  <span style={{ color: TEAL }}>{data.notes}</span> notes ·{" "}
                  <span style={{ color: TEAL }}>{data.links}</span> links
                </div>
                <div style={{ color: "#4A6278", fontSize: 9, marginTop: 2 }}>
                  {data.fixable > 0
                    ? `${data.fixable} issues fixable by autopilot`
                    : "vault fully connected"}
                </div>
              </div>
            </div>
          )}

          {(loading && !data) && (
            <div style={{ color: "#4A6278", fontSize: 10 }}>scanning vault…</div>
          )}
          {error && !data && (
            <div style={{ color: "#F87171", fontSize: 10 }}>error: {error}</div>
          )}
        </div>

        {/* Gap metric tiles */}
        {data && (
          <div style={{ padding: "14px 16px" }}>
            <div style={{ color: "#4A6278", fontSize: 9, letterSpacing: 2, marginBottom: 10 }}>
              GAP METRICS
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <Tile
                label="GAPS"
                value={data.gaps}
                accent={data.gaps > 0 ? "#FBBF24" : "#34D399"}
              />
              <Tile
                label="ORPHANS"
                value={data.orphans}
                accent={data.orphans > 0 ? "#FBBF24" : "#34D399"}
              />
              <Tile
                label="LOW CONF"
                value={data.low_confidence}
                accent={data.low_confidence > 0 ? "#F59E0B" : "#34D399"}
              />
              <Tile
                label="STALE"
                value={data.stale}
                accent={data.stale > 0 ? "#FB923C" : "#34D399"}
              />
              <Tile
                label="THEMES"
                value={data.themes}
                accent={TEAL}
              />
              <Tile
                label="FIXABLE"
                value={data.fixable}
                accent={data.fixable > 0 ? "#FBBF24" : "#34D399"}
              />
            </div>

            {/* Score bar */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#4A6278", fontSize: 9, letterSpacing: 1 }}>VAULT HEALTH</span>
                <span style={{ color: sc, fontSize: 9 }}>{score}/100</span>
              </div>
              <div style={{ height: 6, background: "#0D1824", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${score}%`,
                  background: sc,
                  borderRadius: 3,
                  transition: "width 0.6s ease",
                }} />
              </div>
            </div>

            {/* Summary row */}
            {data.fixable === 0 && (
              <div style={{
                marginTop: 12,
                padding: "8px 12px",
                background: "rgba(52,211,153,0.06)",
                border: "1px solid #34D39922",
                borderRadius: 6,
                color: "#34D399",
                fontSize: 10,
                letterSpacing: 1,
              }}>
                ✓ VAULT FULLY OPTIMISED
              </div>
            )}
          </div>
        )}

        <div style={{ color: "#2A3844", fontSize: 9, padding: "8px 16px", textAlign: "center" }}>
          GET /v1/brain/autopilot/scan · poll 5 min
        </div>
      </div>
    </>
  );
}
