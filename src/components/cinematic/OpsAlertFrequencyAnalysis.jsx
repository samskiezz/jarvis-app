/**
 * OpsAlertFrequencyAnalysis — F60 (OAFANA).
 * Polls GET /v1/alerts (all statuses) → frequency analysis of alert sources.
 * Metrics computed client-side:
 *   TOTAL       — total alerts on record
 *   SOURCES     — unique rule/source names
 *   INTERVAL    — mean minutes between alerts (last-24h window)
 *   STORM       — detected if >5 alerts fired in the last 15 minutes
 * Bar chart shows top-8 sources sorted by alert count.
 * Filter tabs: ALL / OPEN / ACKED + severity strip (CRITICAL / HIGH / MEDIUM / LOW).
 * Expand a source row → individual alert list with timestamps & severity badges.
 * ▶ ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts.
 * ◈ OAFANA button left:945000 bottom:8 zIndex:643.
 * Voice: "oafana"/"alert frequency"/"alert source"/"storm detection"/
 *        "alert analysis"/"ops frequency"/"alert rate".
 * 90-s auto-refresh. Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GR  = "#4ADE80";
const AM  = "#F59E0B";
const RD  = "#EF4444";
const PR  = "#A78BFA";
const BG  = "rgba(0,10,20,0.96)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 945000;
const Z          = 643;
const STORM_WINDOW_MS = 15 * 60 * 1000;   // 15 minutes
const STORM_THRESHOLD = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const OAFANA_RE =
  /\boafana\b|alert\s+freq(?:uency)?|alert\s+source|storm\s+detect(?:ion)?|alert\s+anal(?:ysis)?|ops\s+freq(?:uency)?|alert\s+rate|frequency\s+anal(?:ysis)?/i;

export function isOafanaQuery(text) {
  return OAFANA_RE.test(text || "");
}

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function parseAlerts(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.alerts)) return raw.alerts;
  return [];
}

function severityBucket(sev) {
  const s = Number(sev ?? 50);
  if (s >= 90) return "CRITICAL";
  if (s >= 70) return "HIGH";
  if (s >= 40) return "MEDIUM";
  return "LOW";
}

function sevColor(bucket) {
  if (bucket === "CRITICAL") return RD;
  if (bucket === "HIGH") return AM;
  if (bucket === "MEDIUM") return CY;
  return "#6B7280";
}

function computeMetrics(alerts) {
  const now = Date.now();
  const day24 = alerts.filter((a) => now - (a.fired_ts || 0) <= DAY_MS);
  const recent15 = alerts.filter((a) => now - (a.fired_ts || 0) <= STORM_WINDOW_MS);

  // Mean interval from 24h window
  let meanIntervalMin = null;
  if (day24.length > 1) {
    const sorted = [...day24].sort((a, b) => (a.fired_ts || 0) - (b.fired_ts || 0));
    let totalGapMs = 0;
    for (let i = 1; i < sorted.length; i++) {
      totalGapMs += (sorted[i].fired_ts || 0) - (sorted[i - 1].fired_ts || 0);
    }
    meanIntervalMin = totalGapMs / (sorted.length - 1) / 60_000;
  }

  const stormActive = recent15.length > STORM_THRESHOLD;

  // Group by source name
  const sourceMap = {};
  for (const a of alerts) {
    const src = a.payload?.name || `Rule #${a.rule_id ?? "?"}`;
    if (!sourceMap[src]) sourceMap[src] = { name: src, total: 0, open: 0, acked: 0, alerts: [] };
    sourceMap[src].total++;
    if ((a.status || "open") === "open") sourceMap[src].open++;
    else sourceMap[src].acked++;
    sourceMap[src].alerts.push(a);
  }

  const sources = Object.values(sourceMap).sort((a, b) => b.total - a.total);
  const uniqueSources = sources.length;

  return { sources, uniqueSources, meanIntervalMin, stormActive, recent15, day24 };
}

// ── voice script ──────────────────────────────────────────────────────────────

export async function buildOafanaScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/alerts`, { headers: authHdr() });
    if (!r.ok) return "Alert frequency data unavailable, sir.";
    const raw = await r.json();
    const alerts = parseAlerts(raw);
    const { sources, uniqueSources, meanIntervalMin, stormActive, recent15 } = computeMetrics(alerts);

    const parts = [`Sir, alert frequency analysis.`];
    parts.push(`${alerts.length} total alert${alerts.length !== 1 ? "s" : ""} on record from ${uniqueSources} source${uniqueSources !== 1 ? "s" : ""}.`);

    if (stormActive) {
      parts.push(`ALERT STORM DETECTED. ${recent15.length} alerts fired in the last 15 minutes. Immediate attention required.`);
    }
    if (meanIntervalMin !== null) {
      parts.push(`Mean interval between alerts over the last 24 hours: ${meanIntervalMin < 1 ? "under one minute" : `${meanIntervalMin.toFixed(0)} minutes`}.`);
    }
    const topSrc = sources.slice(0, 3);
    if (topSrc.length > 0) {
      parts.push(`Top sources: ${topSrc.map((s) => `${s.name} with ${s.total}`).join("; ")}.`);
    }
    return parts.join(" ");
  } catch {
    return "Unable to retrieve alert frequency data, sir.";
  }
}

// ── stat tile ─────────────────────────────────────────────────────────────────

function Tile({ label, value, color = CY, pulse = false }) {
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 80,
        background: "rgba(41,231,255,0.04)",
        border: `1px solid ${color}33`,
        borderRadius: 8,
        padding: "10px 12px",
        textAlign: "center",
        position: "relative",
      }}
    >
      {pulse && (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            animation: "oafana-pulse 1.4s ease-in-out infinite",
          }}
        />
      )}
      <div style={{ color, fontSize: 18, fontWeight: 700, letterSpacing: 1, fontFamily: MN }}>{value}</div>
      <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 2, marginTop: 3 }}>{label}</div>
    </div>
  );
}

// ── bar row ────────────────────────────────────────────────────────────────────

function SourceBar({ src, maxCount, expanded, onToggle }) {
  const pct = maxCount > 0 ? (src.total / maxCount) * 100 : 0;
  return (
    <div>
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          cursor: "pointer",
          borderBottom: "1px solid rgba(41,231,255,0.06)",
        }}
      >
        <span style={{ color: "#4E6070", fontSize: 9, width: 16, textAlign: "right", flexShrink: 0 }}>
          {expanded ? "▾" : "▸"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: "#DCEBF5",
              fontSize: 11,
              letterSpacing: 0.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {src.name}
          </div>
          <div
            style={{
              marginTop: 3,
              height: 4,
              background: "rgba(41,231,255,0.08)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${CY}88, ${CY})`,
                borderRadius: 2,
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <span style={{ color: RD, fontSize: 10, fontFamily: MN }}>{src.open}o</span>
          <span style={{ color: "#4E6070", fontSize: 10, fontFamily: MN }}>{src.acked}a</span>
          <span style={{ color: CY, fontSize: 10, fontFamily: MN, minWidth: 28, textAlign: "right" }}>
            {src.total}
          </span>
        </div>
      </div>
      {expanded && (
        <div style={{ background: "rgba(0,0,0,0.3)", paddingBottom: 4 }}>
          {src.alerts.slice(0, 10).map((a) => {
            const ts = a.fired_ts ? new Date(a.fired_ts).toISOString().replace("T", " ").slice(0, 19) : "—";
            const bkt = severityBucket(a.payload?.severity ?? 50);
            return (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  gap: 8,
                  padding: "4px 36px",
                  alignItems: "center",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: MN,
                    color: sevColor(bkt),
                    background: `${sevColor(bkt)}22`,
                    borderRadius: 3,
                    padding: "1px 5px",
                    flexShrink: 0,
                  }}
                >
                  {bkt}
                </span>
                <span style={{ color: "#4E6070", fontSize: 9, fontFamily: MN, flexShrink: 0 }}>{ts}</span>
                <span
                  style={{
                    color: (a.status || "open") === "acked" ? "#4E6070" : "#A0B8CA",
                    fontSize: 9,
                    letterSpacing: 0.3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.status === "acked" ? "✓ acked" : "● open"}
                </span>
              </div>
            );
          })}
          {src.alerts.length > 10 && (
            <div style={{ padding: "3px 36px", color: "#4E6070", fontSize: 9 }}>
              +{src.alerts.length - 10} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function OpsAlertFrequencyAnalysis() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [statusTab, setStatusTab] = useState("ALL");
  const [severityTab, setSeverityTab] = useState("ALL");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${apiBase()}/v1/alerts`, { headers: authHdr() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const raw = await r.json();
      setAlerts(parseAlerts(raw));
    } catch (e) {
      setErr(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.panel === "oafana") setOpen((v) => !v);
    };
    window.addEventListener("jarvis:oafana-toggle", handler);
    return () => window.removeEventListener("jarvis:oafana-toggle", handler);
  }, []);

  const { sources, uniqueSources, meanIntervalMin, stormActive, recent15 } =
    computeMetrics(alerts);

  // Filter alerts for the list view
  let displaySources = sources;
  if (statusTab !== "ALL") {
    displaySources = sources
      .map((s) => ({
        ...s,
        alerts: s.alerts.filter((a) => (a.status || "open") === statusTab.toLowerCase()),
      }))
      .filter((s) => s.alerts.length > 0)
      .map((s) => ({ ...s, total: s.alerts.length }));
  }
  if (severityTab !== "ALL") {
    displaySources = displaySources
      .map((s) => ({
        ...s,
        alerts: s.alerts.filter(
          (a) => severityBucket(a.payload?.severity ?? 50) === severityTab
        ),
      }))
      .filter((s) => s.alerts.length > 0)
      .map((s) => ({ ...s, total: s.alerts.length }));
  }
  displaySources = displaySources.sort((a, b) => b.total - a.total).slice(0, 8);
  const maxCount = displaySources[0]?.total || 1;

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildOafanaScript();
      const voice = getActiveVoice();
      await Promise.allSettled([
        fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
          method: "POST",
          headers: { ...authHdr(), "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Analyse the current alert frequency pattern and advise on operational risk." }),
        }),
        fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { ...authHdr(), "Content-Type": "application/json" },
          body: JSON.stringify({ text: script, voice }),
        }),
      ]);
    } finally {
      setAssessing(false);
    }
  }, []);

  const intervalLabel = meanIntervalMin === null
    ? "—"
    : meanIntervalMin < 1
    ? "<1m"
    : `${meanIntervalMin.toFixed(0)}m`;

  return (
    <>
      <style>{`
        @keyframes oafana-pulse {
          0%,100%{opacity:1;transform:scale(1)}
          50%{opacity:.4;transform:scale(1.5)}
        }
      `}</style>

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Ops Alert Frequency Analysis"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z,
          background: open ? `${RD}22` : "rgba(0,10,20,0.82)",
          border: `1px solid ${stormActive ? RD : CY}66`,
          borderRadius: 6,
          color: stormActive ? RD : CY,
          fontFamily: MN,
          fontSize: 9,
          letterSpacing: 2,
          padding: "5px 10px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {stormActive && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: RD,
              animation: "oafana-pulse 1.4s ease-in-out infinite",
              flexShrink: 0,
            }}
          />
        )}
        ◈ OAFANA
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            right: 16,
            top: "10vh",
            width: "min(680px, 95vw)",
            maxHeight: "78vh",
            zIndex: Z + 1,
            background: BG,
            border: `1px solid ${stormActive ? RD : CY}44`,
            borderRadius: 14,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: `0 0 60px ${stormActive ? RD : CY}14, 0 24px 48px rgba(0,0,0,0.8)`,
            fontFamily: MN,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: `1px solid ${CY}22`,
              flexShrink: 0,
            }}
          >
            <div>
              <span style={{ color: CY, fontSize: 11, letterSpacing: 3 }}>
                ◈ OPS ALERT FREQUENCY ANALYSIS
              </span>
              {stormActive && (
                <span
                  style={{
                    marginLeft: 12,
                    color: RD,
                    fontSize: 9,
                    letterSpacing: 2,
                    animation: "oafana-pulse 1.4s ease-in-out infinite",
                  }}
                >
                  ⚠ STORM
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && <span style={{ color: "#4E6070", fontSize: 9 }}>↺</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  background: "rgba(41,231,255,0.08)",
                  border: `1px solid ${CY}44`,
                  borderRadius: 5,
                  color: CY,
                  fontSize: 9,
                  letterSpacing: 2,
                  padding: "4px 10px",
                  cursor: "pointer",
                  opacity: assessing ? 0.5 : 1,
                  fontFamily: MN,
                }}
              >
                ▶ ASSESS
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#4E6070",
                  cursor: "pointer",
                  fontSize: 14,
                  padding: "0 4px",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "10px 14px",
              flexShrink: 0,
              borderBottom: `1px solid ${CY}11`,
            }}
          >
            <Tile label="TOTAL" value={alerts.length} color={CY} />
            <Tile label="SOURCES" value={uniqueSources} color={PR} />
            <Tile label="INTERVAL" value={intervalLabel} color={GR} />
            <Tile
              label="STORM"
              value={stormActive ? `${recent15.length}/15m` : "CLEAR"}
              color={stormActive ? RD : GR}
              pulse={stormActive}
            />
          </div>

          {/* Filter tabs */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "6px 14px",
              flexShrink: 0,
              borderBottom: `1px solid ${CY}11`,
              flexWrap: "wrap",
            }}
          >
            {["ALL", "OPEN", "ACKED"].map((t) => (
              <button
                key={t}
                onClick={() => setStatusTab(t)}
                style={{
                  background: statusTab === t ? `${CY}18` : "transparent",
                  border: `1px solid ${statusTab === t ? CY : "#2E4050"}`,
                  borderRadius: 4,
                  color: statusTab === t ? CY : "#4E6070",
                  fontSize: 9,
                  letterSpacing: 2,
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontFamily: MN,
                }}
              >
                {t}
              </button>
            ))}
            <span style={{ color: "#2E4050", fontSize: 9, alignSelf: "center", margin: "0 4px" }}>SEV:</span>
            {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((t) => (
              <button
                key={t}
                onClick={() => setSeverityTab(t)}
                style={{
                  background: severityTab === t ? `${sevColor(t === "ALL" ? "" : t)}18` : "transparent",
                  border: `1px solid ${severityTab === t ? (t === "ALL" ? CY : sevColor(t)) : "#2E4050"}`,
                  borderRadius: 4,
                  color: severityTab === t ? (t === "ALL" ? CY : sevColor(t)) : "#4E6070",
                  fontSize: 9,
                  letterSpacing: t === "ALL" ? 2 : 1,
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontFamily: MN,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Source list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {err && (
              <div style={{ padding: "16px", color: RD, fontSize: 11, textAlign: "center" }}>
                ⚠ {err}
              </div>
            )}
            {!err && alerts.length === 0 && !loading && (
              <div style={{ padding: "28px 16px", color: "#4E6070", fontSize: 11, textAlign: "center" }}>
                No alerts on record
              </div>
            )}
            {displaySources.map((src) => (
              <SourceBar
                key={src.name}
                src={src}
                maxCount={maxCount}
                expanded={!!expanded[src.name]}
                onToggle={() =>
                  setExpanded((prev) => ({ ...prev, [src.name]: !prev[src.name] }))
                }
              />
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              borderTop: `1px solid ${CY}11`,
              padding: "6px 14px",
              display: "flex",
              justifyContent: "space-between",
              color: "#2E4050",
              fontSize: 9,
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            <span>GET /v1/alerts · 90s refresh</span>
            <span>{displaySources.length} source{displaySources.length !== 1 ? "s" : ""} shown</span>
          </div>
        </div>
      )}
    </>
  );
}
