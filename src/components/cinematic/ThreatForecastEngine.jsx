/**
 * F200 — Threat Forecast Engine
 *
 * Parallel-fetches /entities/RiskSignal + /functions/getLiveIntel (seismic/crypto/FX),
 * assembles a live context payload, and sends it to /v1/jarvis/agent/chat to generate
 * a forward-looking 3-sentence threat forecast for the next 24 hours.
 *
 * Panel: risk-level gauge (LOW/ELEVATED/HIGH/CRITICAL) based on active critical signals +
 *        seismic magnitude; latest forecast text; top-concern row; confidence strip.
 * ▶ REFRESH → re-runs the AI forecast on demand.
 *
 * Toggle:  ⬡ FCAST  at bottom:8, left:73008, zIndex:110.
 * Event:   jarvis:forecast-toggle
 * Hotkey:  Ctrl+Shift+F
 * Voice:   "forecast / threat forecast / 24h risk / predict threats /
 *           risk prediction / risk outlook / what's coming"
 * Refresh: 5-min auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 73008;
const POLL_MS  = 300_000; // 5 min

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const FCAST_RE =
  /\b(forecast|threat\s+forecast|24h?\s+risk|predict\s+threats?|risk\s+prediction|risk\s+outlook|what'?s?\s+coming|fcast)\b/i;

export function isForecastQuery(q) { return FCAST_RE.test(q); }

export async function buildForecastScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [rsRes, liRes] = await Promise.all([
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
    ]);
    const rsRaw = await rsRes.json();
    const liRaw = await liRes.json();

    const signals  = normaliseSignals(rsRaw);
    const critical = signals.filter((s) => s.severity === "CRITICAL");
    const high     = signals.filter((s) => s.severity === "HIGH");

    const quakes   = extractQuakes(liRaw);
    const topQuake = quakes.length > 0
      ? `magnitude ${quakes[0].magnitude.toFixed(1)} near ${quakes[0].location}`
      : "no significant seismic events";

    const crypto   = extractCrypto(liRaw);
    const topMove  = crypto.length > 0
      ? `${crypto[0].symbol} ${crypto[0].change > 0 ? "+" : ""}${crypto[0].change.toFixed(1)}%`
      : "stable crypto markets";

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS 24-hour threat forecast context: ` +
          `${signals.length} active risk signals (${critical.length} CRITICAL, ${high.length} HIGH), ` +
          `top seismic event: ${topQuake}, ` +
          `top market movement: ${topMove}. ` +
          `Provide a concise 2-sentence forward-looking threat forecast for the next 24 hours. ` +
          `State the primary risk horizon and the single most critical action to watch. ` +
          `Formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Threat forecast unavailable at this time, sir.").trim();
  } catch {
    return "The threat forecast engine is temporarily offline, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.signals)         ? raw.signals
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:       s.id       || String(i),
    title:    s.title    || s.name   || `Signal ${i + 1}`,
    severity: (s.severity || s.level || "").toUpperCase(),
    type:     s.type     || s.signal_type || "",
  }));
}

function extractQuakes(raw) {
  const src = raw?.earthquakes || raw?.seismic || raw?.quakes || raw?.data?.earthquakes || [];
  return (Array.isArray(src) ? src : [])
    .map((q) => ({
      magnitude: parseFloat(q.magnitude || q.mag || 0),
      location:  q.place || q.location || q.region || "unknown region",
    }))
    .filter((q) => q.magnitude > 0)
    .sort((a, b) => b.magnitude - a.magnitude);
}

function extractCrypto(raw) {
  const src = raw?.crypto || raw?.cryptocurrency || raw?.data?.crypto || [];
  return (Array.isArray(src) ? src : [])
    .map((c) => ({
      symbol: c.symbol || c.name || "?",
      change: parseFloat(c.change_24h || c.change || c.percent_change || 0),
    }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

function computeRiskLevel(signals, quakes) {
  const criticalCount = signals.filter((s) => s.severity === "CRITICAL").length;
  const highCount     = signals.filter((s) => s.severity === "HIGH").length;
  const topMag        = quakes.length > 0 ? quakes[0].magnitude : 0;

  if (criticalCount >= 3 || topMag >= 7.0) return "CRITICAL";
  if (criticalCount >= 1 || highCount >= 3 || topMag >= 6.0) return "HIGH";
  if (highCount >= 1 || signals.length >= 5 || topMag >= 5.0) return "ELEVATED";
  return "LOW";
}

const LEVEL_COLOR = {
  CRITICAL: "#FF4444",
  HIGH:     "#FF8800",
  ELEVATED: "#F0B429",
  LOW:      "#4ADE80",
};

// ── component ────────────────────────────────────────────────────────────────

export default function ThreatForecastEngine() {
  const [open,      setOpen]      = useState(false);
  const [signals,   setSignals]   = useState([]);
  const [quakes,    setQuakes]    = useState([]);
  const [crypto,    setCrypto]    = useState([]);
  const [forecast,  setForecast]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [refreshing,setRefreshing]= useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [rsRes, liRes] = await Promise.all([
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      ]);
      const rsRaw = await rsRes.json();
      const liRaw = await liRes.json();
      const sigs  = normaliseSignals(rsRaw);
      const qks   = extractQuakes(liRaw);
      const cryp  = extractCrypto(liRaw);
      setSignals(sigs);
      setQuakes(qks);
      setCrypto(cryp);
      setLastFetch(new Date());
      // Generate forecast on first load or when signals change
      if (forecast === "") {
        const f = await buildForecastScript();
        setForecast(f);
      }
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, [forecast]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:forecast-toggle", onToggle);
    return () => window.removeEventListener("jarvis:forecast-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isForecastQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  async function refresh() {
    setRefreshing(true);
    const f = await buildForecastScript();
    setForecast(f);
    setRefreshing(false);
  }

  const riskLevel   = computeRiskLevel(signals, quakes);
  const levelColor  = LEVEL_COLOR[riskLevel];
  const critCount   = signals.filter((s) => s.severity === "CRITICAL").length;
  const highCount   = signals.filter((s) => s.severity === "HIGH").length;
  const topQuake    = quakes[0] || null;
  const topMove     = crypto[0] || null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Threat Forecast Engine — Ctrl+Shift+F"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 110,
          background: open ? `${levelColor}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? levelColor : S.border}`,
          borderRadius: S.radius, color: open ? levelColor : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${levelColor}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ⬡ FCAST
        {riskLevel !== "LOW" && (
          <span style={{
            marginLeft: 4,
            background: levelColor,
            color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{riskLevel[0]}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 109,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${levelColor}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "72vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: levelColor, letterSpacing: 2, fontWeight: 700 }}>
              THREAT FORECAST
            </span>
            <button
              onClick={refresh}
              disabled={refreshing || loading}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (refreshing || loading) ? 0.4 : 1,
              }}
            >
              {refreshing ? "…" : "▶ REFRESH"}
            </button>
          </div>

          {/* Risk-level gauge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              border: `3px solid ${levelColor}`,
              boxShadow: `0 0 16px ${levelColor}55`,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: `${levelColor}11`,
              flexShrink: 0,
            }}>
              <span style={{ color: levelColor, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textAlign: "center", lineHeight: 1.2 }}>
                {riskLevel}
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: S.textHi, fontSize: S.fs.xs, marginBottom: 3 }}>24-Hour Risk Horizon</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { label: "CRIT", val: critCount, color: "#FF4444" },
                  { label: "HIGH", val: highCount, color: "#FF8800" },
                  { label: "TOTAL", val: signals.length, color: C.neon },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ color, fontSize: 14, fontWeight: 700 }}>{val}</div>
                    <div style={{ color: S.text, fontSize: "7px", letterSpacing: 0.5 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Context strip */}
          {(topQuake || topMove) && (
            <div style={{
              display: "flex", gap: 6, padding: "6px 12px",
              borderBottom: `1px solid ${S.border}`,
            }}>
              {topQuake && (
                <div style={{
                  flex: 1, background: "rgba(0,0,0,0.3)", borderRadius: 5, padding: "4px 7px",
                  borderLeft: "2px solid #F0B429",
                }}>
                  <div style={{ color: "#F0B429", fontSize: "7px", letterSpacing: 1, marginBottom: 2 }}>SEISMIC</div>
                  <div style={{ color: S.textHi, fontSize: S.fs.xxs, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    M{topQuake.magnitude.toFixed(1)} — {topQuake.location}
                  </div>
                </div>
              )}
              {topMove && (
                <div style={{
                  flex: 1, background: "rgba(0,0,0,0.3)", borderRadius: 5, padding: "4px 7px",
                  borderLeft: `2px solid ${topMove.change > 0 ? "#4ADE80" : "#FF4444"}`,
                }}>
                  <div style={{ color: topMove.change > 0 ? "#4ADE80" : "#FF4444", fontSize: "7px", letterSpacing: 1, marginBottom: 2 }}>MARKET</div>
                  <div style={{ color: S.textHi, fontSize: S.fs.xxs }}>
                    {topMove.symbol} {topMove.change > 0 ? "+" : ""}{topMove.change.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Forecast text */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
            {loading && !forecast ? (
              <div style={{ color: S.text }}>Generating forecast…</div>
            ) : forecast ? (
              <div style={{
                color: S.textHi, lineHeight: 1.6, fontSize: S.fs.xs,
                borderLeft: `3px solid ${levelColor}`,
                paddingLeft: 10,
              }}>
                {forecast}
              </div>
            ) : (
              <div style={{ color: S.text }}>No forecast available — click REFRESH.</div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>/entities/RiskSignal · /functions/getLiveIntel</span>
            <span>{lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}</span>
          </div>
        </div>
      )}
    </>
  );
}
