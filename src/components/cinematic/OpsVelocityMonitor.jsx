/**
 * OpsVelocityMonitor (F31) — tracks the RATE of operational event arrival.
 *
 * Polls /v1/ops/events every 30 s, records a rolling 10-sample window,
 * and computes events-per-minute velocity from oldest→newest sample delta.
 *
 * Panel shows:
 *   • velocity gauge (0-10+ evt/min) with SURGE / ELEVATED / NOMINAL badge
 *   • 10-bar sparkline of absolute counts
 *   • current total + last-refresh timestamp
 *
 * Auto-announces a SURGE via jarvis:speak-dossier when velocity crosses 5/min.
 * Toggle: ◈ OPSVL button at left:5060 in the bottom strip.
 * Exports isOpsVelocityQuery + buildOpsVelocityScript for JarvisBrain.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY   = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const AMB       = "#e8a800";
const RED       = "#e8203c";
const GRN       = "#00c878";
const CY        = "#29E7FF";
const MONO      = "'JetBrains Mono',monospace";
const POLL_MS   = 30_000;
const MAX_SAMPLES = 10;

// ── Intent helpers ────────────────────────────────────────────────────────────
export function isOpsVelocityQuery(q) {
  return /\b(ops\s*veloc|ops\s*rate|ops\s*speed|ops\s*surge|opsvl|event\s*rate|event\s*velocity|events?\s*per\s*min)\b/i.test(q);
}

export async function buildOpsVelocityScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/ops/events`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const events = Array.isArray(d) ? d : (d?.data || d?.results || d?.events || []);
    const count  = events.length;
    return `Current operational event count stands at ${count}, sir. Ops velocity monitoring is active — I will alert you if the arrival rate surges above five events per minute.`;
  } catch (_) {
    return "Ops velocity monitor is online, sir. I am tracking operational event arrival rates in real time.";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function velocityLabel(v) {
  if (v >= 5) return { text: "SURGE",    color: RED };
  if (v >= 2) return { text: "ELEVATED", color: AMB };
  return             { text: "NOMINAL",  color: GRN };
}

async function fetchCount() {
  const r = await fetch(`${apiBase()}/v1/ops/events`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d   = await r.json();
  const arr = Array.isArray(d) ? d : (d?.data || d?.results || d?.events || []);
  return arr.length;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function OpsVelocityMonitor() {
  const [visible, setVisible]   = useState(false);
  const [samples, setSamples]   = useState([]);   // { count, ts }
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState(null);
  const surgeAnnouncedAt = useRef(0);
  const timerRef         = useRef(null);

  // Compute velocity (events/min) from oldest→newest sample
  const velocity = (() => {
    if (samples.length < 2) return 0;
    const oldest   = samples[0];
    const newest   = samples[samples.length - 1];
    const deltaEvt = Math.max(0, newest.count - oldest.count);
    const deltaMin = (newest.ts - oldest.ts) / 60_000 || 1;
    return parseFloat((deltaEvt / deltaMin).toFixed(2));
  })();

  const { text: velLabel, color: velColor } = velocityLabel(velocity);

  const poll = useCallback(async () => {
    try {
      const count = await fetchCount();
      const now   = Date.now();
      setSamples((prev) => {
        const next = [...prev, { count, ts: now }];
        return next.slice(-MAX_SAMPLES);
      });
      setError(null);

      // Surge announcement: speak at most once per 5 minutes
      if (velocity >= 5 && now - surgeAnnouncedAt.current > 5 * 60_000) {
        surgeAnnouncedAt.current = now;
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
          detail: {
            text: `Sir, operational event velocity is surging: ${velocity.toFixed(1)} new events per minute. Systems may be under pressure.`,
          },
        }));
      }
    } catch (_) {
      setError("Unreachable");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [velocity]);

  // Initial fetch + interval
  useEffect(() => {
    setLoading(true);
    poll().finally(() => setLoading(false));
    timerRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for toggle event
  useEffect(() => {
    const h = () => setVisible((v) => !v);
    window.addEventListener("jarvis:ops-velocity-toggle", h);
    return () => window.removeEventListener("jarvis:ops-velocity-toggle", h);
  }, []);

  const latest  = samples[samples.length - 1];
  const lastTs  = latest
    ? new Date(latest.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";
  const maxCount = samples.length ? Math.max(...samples.map((s) => s.count), 1) : 1;

  return (
    <>
      {/* ── Toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Ops Velocity Monitor (F31)"
        style={{
          position: "fixed", bottom: 8, left: 5060, zIndex: 60,
          background: visible ? velColor : "rgba(5,8,13,0.7)",
          border: `1px solid ${velColor}55`,
          color: visible ? "#04060A" : velColor,
          borderRadius: 4, padding: "2px 7px",
          fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, cursor: "pointer",
          boxShadow: velocity >= 2 ? `0 0 12px ${velColor}88` : "none",
          animation: velocity >= 5 ? "opsvl-pulse 1s ease-in-out infinite" : "none",
        }}
      >
        ◈ OPSVL
        {velocity >= 2 && (
          <span style={{
            marginLeft: 4, background: velColor, color: "#04060A",
            borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {velocity.toFixed(1)}/m
          </span>
        )}
      </button>

      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      {visible && (
        <div style={{
          position: "fixed", bottom: 36, left: 4950, zIndex: 65,
          width: 320, background: "rgba(5,10,18,0.92)",
          border: `1px solid ${velColor}44`,
          borderTop: `2px solid ${velColor}`,
          borderRadius: 10, padding: "12px 14px",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 40px ${velColor}22`,
          fontFamily: MONO, color: "#d0e8f4",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: velColor, fontSize: 13 }}>◈</span>
            <span style={{ color: velColor, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              OPS VELOCITY
            </span>
            <span style={{
              marginLeft: "auto", fontSize: 9, letterSpacing: 1.5, fontWeight: 700,
              color: velColor, background: `${velColor}1a`, borderRadius: 4, padding: "1px 6px",
              border: `1px solid ${velColor}44`,
            }}>
              {velLabel}
            </span>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "none", border: "none", color: "#4a6070", cursor: "pointer", fontSize: 12 }}
            >
              ✕
            </button>
          </div>

          {loading && !samples.length ? (
            <div style={{ color: "#4a6070", fontSize: 10, letterSpacing: 1 }}>LOADING…</div>
          ) : error ? (
            <div style={{ color: RED, fontSize: 10, letterSpacing: 1 }}>{error}</div>
          ) : (
            <>
              {/* Big velocity number */}
              <div style={{ textAlign: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 36, fontWeight: 700, color: velColor, letterSpacing: -1 }}>
                  {velocity.toFixed(1)}
                </span>
                <span style={{ fontSize: 11, color: "#4a6070", marginLeft: 4 }}>evt/min</span>
              </div>

              {/* Sparkline */}
              <div style={{
                display: "flex", alignItems: "flex-end", gap: 3, height: 40,
                marginBottom: 10, padding: "4px 0",
              }}>
                {samples.map((s, i) => {
                  const h      = Math.max(4, Math.round((s.count / maxCount) * 36));
                  const isLast = i === samples.length - 1;
                  return (
                    <div
                      key={i}
                      title={`${s.count} events @ ${new Date(s.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                      style={{
                        flex: 1, height: h,
                        background: isLast ? velColor : `${velColor}55`,
                        borderRadius: 2,
                        transition: "height 0.4s ease",
                      }}
                    />
                  );
                })}
                {/* Pad empty slots */}
                {Array.from({ length: MAX_SAMPLES - samples.length }).map((_, i) => (
                  <div
                    key={`pad-${i}`}
                    style={{ flex: 1, height: 4, background: "rgba(41,231,255,0.1)", borderRadius: 2 }}
                  />
                ))}
              </div>

              {/* Stats row */}
              <div style={{
                display: "flex", justifyContent: "space-between",
                borderTop: "1px solid rgba(41,231,255,0.1)", paddingTop: 8,
              }}>
                <StatCell label="CURRENT"  value={latest?.count ?? "—"} color={velColor} />
                <StatCell label="WINDOW"   value={`${samples.length}/${MAX_SAMPLES}`} color={CY} />
                <StatCell label="REFRESHED" value={lastTs} color="#4a6070" small />
              </div>

              <div style={{
                marginTop: 8, fontSize: 9, color: "#4a6070", letterSpacing: 1,
                borderTop: "1px solid rgba(41,231,255,0.06)", paddingTop: 6,
              }}>
                POLLS /v1/ops/events every 30 s · surge announced ≥ 5/min
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes opsvl-pulse {
          0%,100% { box-shadow: 0 0 12px ${RED}88; }
          50%      { box-shadow: 0 0 28px ${RED}cc; }
        }
      `}</style>
    </>
  );
}

function StatCell({ label, value, color, small }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: small ? 9 : 14, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 8, color: "#4a6070", letterSpacing: 1, marginTop: 1 }}>{label}</div>
    </div>
  );
}
