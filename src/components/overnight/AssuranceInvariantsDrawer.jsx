/**
 * AssuranceInvariantsDrawer — F115
 * Right-edge slide-in drawer showing live system invariant health from
 * GET /assurance/invariants (3-min poll).
 *
 * Displays overall_ok status badge, pass/fail counts, and per-invariant
 * rows (name + PASS/FAIL badge + evidence text). Red tab badge pulses
 * when overall_ok is false.
 *
 * Accent: rose (#F43F5E). Tab: left-edge at 43% from top.
 * Mount point: src/Layout.jsx after <SemanticSearchDrawer />.
 */
import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const POLL_MS = 180_000; // 3 minutes
const ROSE = "#F43F5E";
const CY = "#29E7FF";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function relTime(ts_s) {
  if (!ts_s) return "—";
  const diff = Math.floor(Date.now() / 1000 - ts_s);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function AssuranceInvariantsDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  async function fetchInvariants() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase()}/assurance/invariants`, {
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
    fetchInvariants();
    timerRef.current = setInterval(fetchInvariants, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, []);

  const latest = data?.latest;
  const registered = data?.registered || [];
  const results = latest?.results || [];
  const overallOk = latest?.overall_ok ?? true;
  const failCount = latest?.failed ?? 0;
  const hasFail = failCount > 0;

  const tabStyle = {
    position: "fixed",
    left: 0,
    top: "43%",
    transform: "translateY(-50%) rotate(-90deg) translateX(-50%)",
    transformOrigin: "left center",
    zIndex: 200,
    background: hasFail ? ROSE : "rgba(8,14,22,0.85)",
    color: hasFail ? "#fff" : ROSE,
    border: `1px solid ${ROSE}55`,
    borderRadius: "0 0 6px 6px",
    padding: "4px 12px",
    fontSize: 10,
    letterSpacing: 2,
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: "nowrap",
    animation: hasFail && !open ? "inv-pulse 2s ease-in-out infinite" : "none",
    boxShadow: hasFail ? `0 0 14px ${ROSE}66` : "none",
  };

  const panelStyle = {
    position: "fixed",
    left: open ? 0 : -360,
    top: 0,
    height: "100vh",
    width: 340,
    background: "rgba(6,10,18,0.97)",
    borderRight: `1px solid ${ROSE}44`,
    boxShadow: open ? `4px 0 40px ${ROSE}22` : "none",
    zIndex: 199,
    overflowY: "auto",
    transition: "left 0.28s ease",
    fontFamily: "'JetBrains Mono', monospace",
    padding: "0 0 60px",
  };

  return (
    <>
      <style>{`
        @keyframes inv-pulse {
          0%,100% { box-shadow: 0 0 8px ${ROSE}66; }
          50%      { box-shadow: 0 0 22px ${ROSE}; }
        }
      `}</style>

      <button onClick={() => setOpen((v) => !v)} style={tabStyle} title="Assurance Invariants">
        ◈ INVR {hasFail ? `(${failCount}✗)` : ""}
      </button>

      <div style={panelStyle}>
        {/* Header */}
        <div style={{
          position: "sticky", top: 0,
          background: "rgba(6,10,18,0.98)",
          borderBottom: `1px solid ${ROSE}33`,
          padding: "14px 16px 10px",
          zIndex: 1,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ color: ROSE, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              ASSURANCE INVARIANTS
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16 }}
            >✕</button>
          </div>

          {/* Overall status */}
          {latest ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 10, letterSpacing: 1,
                background: overallOk ? "#052e1680" : "#450a1480",
                color: overallOk ? "#34D399" : ROSE,
                border: `1px solid ${overallOk ? "#34D39944" : ROSE + "44"}`,
              }}>
                {overallOk ? "✓ ALL PASS" : "✗ FAILURES"}
              </span>
              <span style={{ color: "#34D399", fontSize: 10 }}>{latest.passed}/{latest.total} passed</span>
              {failCount > 0 && (
                <span style={{ color: ROSE, fontSize: 10 }}>{failCount} failed</span>
              )}
              <span style={{ color: "#4A6278", fontSize: 10, marginLeft: "auto" }}>
                {relTime(latest.finished_at)}
              </span>
            </div>
          ) : (
            <div style={{ color: "#4A6278", fontSize: 10 }}>
              {loading ? "loading…" : error ? `error: ${error}` : registered.length > 0 ? `${registered.length} registered, no report yet` : "no data"}
            </div>
          )}
        </div>

        {/* Results list */}
        <div style={{ padding: "10px 0" }}>
          {results.length === 0 && !loading && (
            <div style={{ color: "#4A6278", fontSize: 11, padding: "12px 16px" }}>
              {error ? `fetch error: ${error}` : "no invariant results available"}
            </div>
          )}

          {results.map((r) => (
            <div key={r.name} style={{
              padding: "8px 16px",
              borderBottom: `1px solid #0D1824`,
              display: "flex",
              flexDirection: "column",
              gap: 3,
              background: !r.passed ? "rgba(244,63,94,0.05)" : "transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  padding: "1px 6px", borderRadius: 3, fontSize: 9, letterSpacing: 1,
                  background: r.passed ? "#052e1680" : "#450a1480",
                  color: r.passed ? "#34D399" : ROSE,
                  border: `1px solid ${r.passed ? "#34D39933" : ROSE + "33"}`,
                  flexShrink: 0,
                }}>
                  {r.passed ? "PASS" : "FAIL"}
                </span>
                <span style={{ color: r.passed ? "#9BBAD0" : "#FECDD3", fontSize: 11, wordBreak: "break-all" }}>
                  {r.name}
                </span>
              </div>
              {r.evidence && r.evidence !== "ok" && (
                <div style={{
                  color: "#4A6278",
                  fontSize: 10,
                  lineHeight: 1.4,
                  paddingLeft: 2,
                  maxHeight: 60,
                  overflow: "hidden",
                }}>
                  {r.evidence}
                </div>
              )}
            </div>
          ))}

          {/* Registered but no report yet */}
          {results.length === 0 && registered.length > 0 && !loading && (
            <div style={{ padding: "8px 16px" }}>
              <div style={{ color: "#4A6278", fontSize: 10, marginBottom: 6 }}>
                {registered.length} registered invariants (no report yet):
              </div>
              {registered.map((name) => (
                <div key={name} style={{
                  color: "#6E8AA0", fontSize: 10, padding: "2px 0",
                  borderBottom: "1px solid #0D1824",
                }}>
                  · {name}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ color: "#2A3844", fontSize: 9, padding: "8px 16px", textAlign: "center" }}>
          GET /assurance/invariants · poll 3 min
        </div>
      </div>
    </>
  );
}
