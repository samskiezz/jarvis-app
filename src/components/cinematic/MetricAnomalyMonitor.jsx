/**
 * MetricAnomalyMonitor — F47 Live metric anomaly monitor.
 *
 * Polls /v1/jarvis/analytics/anomalies every 60 s and renders each anomalous
 * metric as a row sorted by |zscore| descending. Severity is coloured
 * (high = red, medium = amber). ASSESS asks /v1/jarvis/agent/chat for a
 * 2-sentence brief and speaks it via jarvis:speak-dossier.
 *
 * Button: ⚠ ANOM (left:780 bottom:18, bottom strip)
 * Endpoint: /v1/jarvis/analytics/anomalies (+ /v1/jarvis/agent/chat for ASSESS)
 * Voice trigger: "anomaly" | "anomalies" | "anomaly monitor" | "anom" |
 *                "metric anomaly" | "metric anomalies"
 * Event: jarvis:anom-toggle
 * Refresh: 60 s auto-poll.
 *
 * Additive only — mounted via App.jsx; wired via JarvisBrain.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

const AMB   = "#F59E0B";
const CY    = "#29E7FF";
const GRN   = "#00E5A0";
const RED   = "#FF3B6B";
const DIM   = "#4A6070";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 780;
const POLL_MS    = 60_000;
const FETCH_LIMIT = 40;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── data ────────────────────────────────────────────────────────────────────

async function fetchAnomalies() {
  const r = await fetch(
    `${apiBase()}/v1/jarvis/analytics/anomalies?limit=${FETCH_LIMIT}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } },
  );
  if (!r.ok) throw new Error(`anomalies ${r.status}`);
  const d = await r.json();
  const items = Array.isArray(d?.anomalies) ? d.anomalies : [];
  return {
    count: Number(d?.count ?? items.length),
    anomalies: items.map((a) => ({
      metric:   String(a?.metric ?? "unknown"),
      latest:   Number(a?.latest ?? 0),
      mean:     Number(a?.mean ?? 0),
      std:      Number(a?.std ?? 0),
      zscore:   Number(a?.zscore ?? 0),
      severity: String(a?.severity ?? "medium").toLowerCase(),
    })),
  };
}

function severityColor(sev) {
  return sev === "high" ? RED : AMB;
}

function directionArrow(z) {
  if (!Number.isFinite(z)) return "·";
  if (z > 0) return "↑";
  if (z < 0) return "↓";
  return "·";
}

function fmt(n, digits = 3) {
  if (!Number.isFinite(n)) return "—";
  const s = Math.abs(n) >= 1000 ? n.toFixed(0) : n.toFixed(digits);
  return s;
}

// ── voice intent (exported for JarvisBrain) ─────────────────────────────────

const VOICE_RE =
  /\b(anom|anomal(?:y|ies)(?:\s*monitor)?|metric\s*anomal(?:y|ies))\b/i;

export function isAnomQuery(text) { return VOICE_RE.test(text || ""); }

export async function buildAnomScript() {
  let data;
  try { data = await fetchAnomalies(); }
  catch { return "Metric anomaly data is unavailable at this time, sir."; }
  const items = data.anomalies || [];
  if (items.length === 0) {
    return "No metric anomalies detected. All measurements are within nominal thresholds.";
  }
  const high = items.filter((a) => a.severity === "high").length;
  const top  = items[0];
  const trail = items.slice(1, 3)
    .map((a) => `${a.metric} (z ${a.zscore.toFixed(2)})`)
    .join(", ");
  const dir = top.zscore > 0 ? "elevated" : "depressed";
  const highClause = high > 0
    ? `${high} at high severity`
    : "all at medium severity";
  const trailClause = trail ? ` Next: ${trail}.` : "";
  return (
    `${items.length} metric${items.length === 1 ? "" : "s"} flagged as anomalous, ${highClause}. ` +
    `Top deviation: ${top.metric} is ${dir} at ${fmt(top.latest)} versus a mean of ${fmt(top.mean)} ` +
    `(z-score ${top.zscore.toFixed(2)}).${trailClause}`
  );
}

// ── panel ───────────────────────────────────────────────────────────────────

export default function MetricAnomalyMonitor() {
  const [open,      setOpen]      = useState(false);
  const [items,     setItems]     = useState([]);
  const [count,     setCount]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [search,    setSearch]    = useState("");
  const [sevFilter, setSevFilter] = useState("ALL");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await fetchAnomalies();
      setItems(d.anomalies);
      setCount(d.count);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // External open trigger from JarvisBrain / voice.
  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (VOICE_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:anom-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:anom-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  const highCount = useMemo(
    () => items.filter((a) => a.severity === "high").length,
    [items],
  );
  const medCount = items.length - highCount;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((a) => sevFilter === "ALL" || a.severity === sevFilter.toLowerCase())
      .filter((a) => !q || a.metric.toLowerCase().includes(q));
  }, [items, search, sevFilter]);

  const runAssess = async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildAnomScript();
      let brief = script;
      try {
        const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            message:
              "In 2 short sentences, assess these metric anomalies and any operational risk they imply. " +
              `Data: ${script}`,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          const t = d?.reply || d?.message || d?.text || d?.output || "";
          if (t && String(t).trim()) brief = String(t).trim();
        }
      } catch { /* fall back to script */ }
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: brief, source: "anom" },
      }));
    } finally {
      setAssessing(false);
    }
  };

  const maxAbsZ = useMemo(
    () => filtered.reduce((m, a) => Math.max(m, Math.abs(a.zscore) || 0), 0),
    [filtered],
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Metric Anomaly Monitor"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? RED : RED + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : RED,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: MONO, fontWeight: 700,
          boxShadow: `0 0 20px ${RED}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>⚠</span>
        ANOM
        {count > 0 && (
          <span style={{
            background: (highCount > 0 ? RED : AMB) + "44",
            color: highCount > 0 ? RED : AMB,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
            animation: highCount > 0 ? "anomPulse 1.6s ease-in-out infinite" : "none",
          }}>
            {count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(560px,96vw)", maxHeight: "min(680px,82vh)",
          background: BG,
          border: `1px solid ${RED}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${RED}18`,
          fontFamily: MONO,
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${RED}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: RED, boxShadow: `0 0 10px ${RED}`,
              display: "inline-block",
              animation: loading ? "anomPulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: RED, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              METRIC ANOMALIES
            </span>
            <span style={{ marginLeft: "auto", color: MUTED, fontSize: 9 }}>
              {loading ? "SCANNING" : `${count} FLAGGED · 60s POLL`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: MUTED,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6, padding: "10px 14px 4px",
          }}>
            {[
              { label: "TOTAL",   value: count,     color: CY  },
              { label: "HIGH",    value: highCount, color: RED },
              { label: "MEDIUM",  value: medCount,  color: AMB },
              { label: "MAX |Z|", value: maxAbsZ ? maxAbsZ.toFixed(1) : "—", color: GRN },
            ].map((t) => (
              <div key={t.label} style={{
                background: `${t.color}0f`,
                border: `1px solid ${t.color}33`,
                borderRadius: 8, padding: "6px 8px",
                display: "flex", flexDirection: "column", gap: 2,
              }}>
                <span style={{ color: t.color, fontSize: 9, letterSpacing: 1 }}>{t.label}</span>
                <span style={{ color: "#DCF0FF", fontSize: 15, fontWeight: 700 }}>
                  {t.value}
                </span>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 14px 0",
          }}>
            {["ALL", "HIGH", "MEDIUM"].map((f) => {
              const active = sevFilter === f;
              const color = f === "HIGH" ? RED : f === "MEDIUM" ? AMB : CY;
              return (
                <button
                  key={f}
                  onClick={() => setSevFilter(f)}
                  style={{
                    background: active ? color + "22" : "transparent",
                    border: `1px solid ${active ? color : color + "22"}`,
                    color: active ? color : MUTED,
                    borderRadius: 5, padding: "3px 8px",
                    fontSize: 9, letterSpacing: 1, cursor: "pointer",
                    fontFamily: MONO, fontWeight: 700,
                  }}
                >
                  {f}
                </button>
              );
            })}
          </div>

          {/* Search + assess */}
          <div style={{
            padding: "8px 14px 6px", display: "flex", gap: 8, alignItems: "center",
            borderBottom: `1px solid ${RED}18`,
          }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="FILTER METRIC NAME…"
              style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: `1px solid ${RED}33`, borderRadius: 6,
                color: "#DCEBF5", padding: "5px 10px",
                fontSize: 10, letterSpacing: 1,
                fontFamily: MONO, outline: "none",
              }}
            />
            <button onClick={load} style={{
              background: "transparent", border: `1px solid ${RED}33`,
              borderRadius: 6, color: MUTED, padding: "5px 8px",
              fontSize: 9, cursor: "pointer", letterSpacing: 1, fontFamily: MONO,
            }} title="Refresh">↺</button>
            <button
              onClick={runAssess}
              disabled={assessing || items.length === 0}
              style={{
                background: assessing ? `${RED}33` : "transparent",
                border: `1px solid ${RED}66`,
                borderRadius: 6, color: RED, padding: "5px 10px",
                fontSize: 9, cursor: assessing || items.length === 0 ? "not-allowed" : "pointer",
                letterSpacing: 1, fontFamily: MONO,
                opacity: items.length === 0 ? 0.4 : 1,
              }}
              title="Ask JARVIS to assess these anomalies"
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Anomaly list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {error && (
              <div style={{
                padding: "20px 18px", color: RED, fontSize: 10,
                letterSpacing: 1, textAlign: "center",
              }}>
                {error.toUpperCase()}
              </div>
            )}

            {!error && filtered.length === 0 && (
              <div style={{
                padding: "28px 18px", color: DIM,
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                {loading
                  ? "SCANNING MEASUREMENTS…"
                  : items.length === 0
                    ? "NO ANOMALIES · ALL METRICS NOMINAL"
                    : "NO METRICS MATCH FILTER"}
              </div>
            )}

            {filtered.map((a) => {
              const color = severityColor(a.severity);
              const arrow = directionArrow(a.zscore);
              const zAbs = Math.abs(a.zscore) || 0;
              const share = maxAbsZ ? Math.min(100, Math.round((zAbs / maxAbsZ) * 100)) : 0;
              return (
                <div key={a.metric} style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid ${RED}0F`,
                  borderLeft: `3px solid ${color}`,
                  display: "flex", flexDirection: "column", gap: 6,
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{
                      fontSize: 12, color, minWidth: 14,
                      fontWeight: 900,
                    }}>
                      {arrow}
                    </span>
                    <span style={{
                      color: "#DCF0FF", fontSize: 12, flex: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      fontWeight: 600,
                    }} title={a.metric}>
                      {a.metric}
                    </span>
                    <span style={{
                      fontSize: 9, letterSpacing: 1, fontWeight: 700,
                      color, background: color + "22",
                      borderRadius: 5, padding: "2px 7px", flexShrink: 0,
                    }}>
                      Z {a.zscore.toFixed(2)}
                    </span>
                    <span style={{
                      fontSize: 9, letterSpacing: 1, fontWeight: 700,
                      color, background: color + "0f",
                      borderRadius: 5, padding: "2px 6px", flexShrink: 0,
                      border: `1px solid ${color}55`,
                    }}>
                      {a.severity.toUpperCase()}
                    </span>
                  </div>

                  {/* |z| bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      flex: 1, height: 5, borderRadius: 3,
                      background: `${color}18`, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: 3,
                        width: `${Math.max(2, share)}%`,
                        background: color,
                        boxShadow: zAbs > 3 ? `0 0 8px ${color}` : "none",
                      }} />
                    </div>
                    <span style={{ fontSize: 9, color: color + "cc", minWidth: 34, textAlign: "right" }}>
                      |z| {zAbs.toFixed(1)}
                    </span>
                  </div>

                  {/* latest vs mean±std */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    fontSize: 9, color: MUTED, letterSpacing: 0.5,
                  }}>
                    <span>
                      LATEST <span style={{ color: "#DCEBF5", fontWeight: 700 }}>
                        {fmt(a.latest)}
                      </span>
                    </span>
                    <span>
                      MEAN <span style={{ color: "#DCEBF5" }}>{fmt(a.mean)}</span>
                    </span>
                    <span>
                      ± <span style={{ color: "#DCEBF5" }}>{fmt(a.std)}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${RED}18`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: DIM,
          }}>
            <span>|Z|&gt;2 FLAGGED · |Z|&gt;3 HIGH</span>
            <span style={{ marginLeft: "auto", color: RED + "88" }}>
              /v1/jarvis/analytics/anomalies
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes anomPulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.35); opacity: 0.55; }
        }
      `}</style>
    </>
  );
}
